/**
 * camera-placa.js — câmera com moldura e leitura da placa NO APARELHO.
 *
 * A imagem nunca sai do aparelho (LGPD): cada quadro é recortado na moldura,
 * reduzido a 128×64 e passado ao modelo fast-plate-ocr (cct-s-v2-global) via
 * onnxruntime-web. Nenhum quadro é gravado nem enviado.
 *
 * Browser: window.cameraPlaca = { regiaoMoldura, dimensoesMoldura, abrirLeitor }.
 * Node (testes): module.exports com as mesmas funções.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../site/js/leitor-placa.js'));
  } else {
    root.cameraPlaca = factory(root.leitorPlacaLib || null);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (libInicial) {
  'use strict';

  const ORT_VERSAO = '1.30.0';
  const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSAO}/dist/`;
  const ORT_SCRIPT = `${ORT_BASE}ort.min.js`;
  const LIB_SCRIPT = '/js/leitor-placa.js';
  const MODELO_URL = '/modelos/leitor-placa.onnx';
  const INTERVALO_MS = 180;
  const VIBRAR_MS = 120;
  const ENTRADA_W = 128;
  const ENTRADA_H = 64;
  const SLOTS = 10;
  const PROPORCAO = 3.1;
  const LARGURA_REL = 0.86;
  const LARGURA_MAX = 520;
  const CENTRO_Y_REL = 0.42;
  const ESTILO_ID = 'camera-placa-estilo';
  const TEXTO_DICA = 'Encaixe a placa dentro da moldura';
  const TEXTO_FALHA = 'Leitura automática com problema. Toque em Digitar.';
  const FALHAS_AVISO = 10;

  // ---------------------------------------------------------------- geometria pura

  /** Moldura 3,1:1 centralizada na horizontal, com o centro a 42% da altura da tela. */
  function dimensoesMoldura(telaW, telaH) {
    const w = Math.round(Math.min(telaW * LARGURA_REL, LARGURA_MAX));
    const h = Math.round(w / PROPORCAO);
    return { x: Math.round((telaW - w) / 2), y: telaH * CENTRO_Y_REL - h / 2, w, h };
  }

  /**
   * Converte o retângulo da moldura (px da tela) em px do vídeo, com o vídeo
   * exibido em object-fit: cover ocupando telaW×telaH. Recorta nos limites do vídeo.
   */
  function regiaoMoldura(rect, videoW, videoH, telaW, telaH) {
    const r = {
      x: rect.x != null ? rect.x : rect.left,
      y: rect.y != null ? rect.y : rect.top,
      w: rect.w != null ? rect.w : rect.width,
      h: rect.h != null ? rect.h : rect.height,
    };
    const escala = Math.max(telaW / videoW, telaH / videoH);
    const x0 = (telaW - videoW * escala) / 2;
    const y0 = (telaH - videoH * escala) / 2;
    const esq = Math.max(0, (r.x - x0) / escala);
    const topo = Math.max(0, (r.y - y0) / escala);
    const dir = Math.min(videoW, (r.x + r.w - x0) / escala);
    const base = Math.min(videoH, (r.y + r.h - y0) / escala);
    return { x: esq, y: topo, w: Math.max(0, dir - esq), h: Math.max(0, base - topo) };
  }

  /** Recorte da máscara: tela inteira menos a moldura (regra evenodd). */
  function recorteMascara(W, H, m) {
    const x2 = m.x + m.w;
    const y2 = m.y + m.h;
    return `polygon(evenodd, 0 0, ${W}px 0, ${W}px ${H}px, 0 ${H}px, 0 0, `
      + `${m.x}px ${m.y}px, ${x2}px ${m.y}px, ${x2}px ${y2}px, ${m.x}px ${y2}px, ${m.x}px ${m.y}px)`;
  }

  // ---------------------------------------------------------------- carga (uma vez)

  const scripts = new Map();
  function carregarScript(src) {
    if (!scripts.has(src)) {
      scripts.set(src, new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.crossOrigin = 'anonymous';
        s.onload = resolve;
        s.onerror = () => { scripts.delete(src); reject(new Error(`falha ao carregar ${src}`)); };
        document.head.appendChild(s);
      }));
    }
    return scripts.get(src);
  }

  async function obterLib() {
    if (libInicial) return libInicial;
    if (!window.leitorPlacaLib) await carregarScript(LIB_SCRIPT);
    return window.leitorPlacaLib;
  }

  let sessaoPromessa = null;
  /** Sessão ONNX carregada uma única vez e reaproveitada entre aberturas. */
  function obterSessao(url) {
    if (!sessaoPromessa) {
      sessaoPromessa = (async () => {
        if (!window.ort) await carregarScript(ORT_SCRIPT);
        const ort = window.ort;
        ort.env.wasm.wasmPaths = ORT_BASE;
        ort.env.wasm.numThreads = 1;
        const sessao = await ort.InferenceSession.create(url, { executionProviders: ['wasm'] });
        return { ort, sessao };
      })().catch((e) => { sessaoPromessa = null; throw e; });
    }
    return sessaoPromessa;
  }

  // ---------------------------------------------------------------- tela

  const CSS = `
.cp-palco{position:fixed;inset:0;z-index:1000;background:#000;overflow:hidden;touch-action:none}
.cp-palco [hidden]{display:none!important}
.cp-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0}
.cp-mascara{position:absolute;inset:0;background:rgba(0,0,0,.62);z-index:1;pointer-events:none}
.cp-moldura{position:absolute;z-index:2;box-sizing:border-box;border:3px solid #fff;border-radius:10px;pointer-events:none;transition:border-color .15s}
.cp-moldura.cp-lida{border-color:#22c55e}
.cp-dica,.cp-ao-vivo{position:absolute;left:16px;right:16px;z-index:3;margin:0;text-align:center;color:#fff;font:600 17px/1.3 system-ui,-apple-system,sans-serif;text-shadow:0 1px 3px rgba(0,0,0,.8)}
.cp-ao-vivo{font:700 26px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em}
.cp-botoes{position:absolute;left:16px;right:16px;bottom:calc(24px + env(safe-area-inset-bottom,0px));z-index:3;display:flex;gap:12px;justify-content:center}
.cp-botao{min-height:48px;min-width:132px;padding:0 20px;border-radius:24px;border:1px solid rgba(255,255,255,.5);background:rgba(17,24,39,.78);color:#fff;font:600 16px system-ui,-apple-system,sans-serif;cursor:pointer}
.cp-botao[aria-pressed="true"]{background:#facc15;color:#111;border-color:#facc15}
.cp-botao:focus-visible{outline:3px solid #60a5fa;outline-offset:2px}`;

  function injetarEstilo() {
    if (document.getElementById(ESTILO_ID)) return;
    const st = document.createElement('style');
    st.id = ESTILO_ID;
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function criarEl(tag, classe, attrs) {
    const el = document.createElement(tag);
    el.className = classe;
    Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  }

  function montarTela(container) {
    injetarEstilo();
    const palco = criarEl('div', 'cp-palco', { role: 'dialog', 'aria-label': 'Leitor de placa' });
    const video = criarEl('video', 'cp-video', { playsinline: '', muted: '', autoplay: '' });
    video.muted = true;
    video.playsInline = true;
    const mascara = criarEl('div', 'cp-mascara', { 'aria-hidden': 'true' });
    const moldura = criarEl('div', 'cp-moldura', { 'aria-hidden': 'true' });
    const dica = criarEl('p', 'cp-dica');
    dica.textContent = TEXTO_DICA;
    const aoVivo = criarEl('p', 'cp-ao-vivo', { 'aria-live': 'polite' });
    const botoes = criarEl('div', 'cp-botoes');
    const digitar = criarEl('button', 'cp-botao', { type: 'button' });
    digitar.textContent = 'Digitar';
    const lanterna = criarEl('button', 'cp-botao', { type: 'button', 'aria-pressed': 'false', hidden: '' });
    lanterna.textContent = 'Lanterna';
    botoes.append(digitar, lanterna);
    palco.append(video, mascara, moldura, dica, aoVivo, botoes);
    container.appendChild(palco);
    return { palco, video, mascara, moldura, dica, aoVivo, digitar, lanterna };
  }

  /** Posiciona moldura, máscara e textos; devolve a moldura em px do palco. */
  function posicionar(tela) {
    const W = tela.palco.clientWidth;
    const H = tela.palco.clientHeight;
    const m = dimensoesMoldura(W, H);
    Object.assign(tela.moldura.style, { left: `${m.x}px`, top: `${m.y}px`, width: `${m.w}px`, height: `${m.h}px` });
    tela.mascara.style.clipPath = recorteMascara(W, H, m);
    tela.mascara.style.webkitClipPath = tela.mascara.style.clipPath;
    tela.dica.style.top = `${Math.max(16, m.y - 64)}px`;
    tela.aoVivo.style.top = `${m.y + m.h + 18}px`;
    return { moldura: m, W, H };
  }

  // ---------------------------------------------------------------- leitura

  /** Recorta a moldura do quadro atual e devolve a entrada uint8 [1,64,128,3] (RGB). */
  function capturarEntrada(video, geo, ctx) {
    const r = regiaoMoldura(geo.moldura, video.videoWidth, video.videoHeight, geo.W, geo.H);
    if (!r.w || !r.h) return null;
    ctx.drawImage(video, r.x, r.y, r.w, r.h, 0, 0, ENTRADA_W, ENTRADA_H);
    const rgba = ctx.getImageData(0, 0, ENTRADA_W, ENTRADA_H).data;
    const rgb = new Uint8Array(ENTRADA_W * ENTRADA_H * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      rgb[j] = rgba[i];
      rgb[j + 1] = rgba[i + 1];
      rgb[j + 2] = rgba[i + 2];
    }
    return rgb;
  }

  async function lerQuadro(estado) {
    const { ort, sessao } = estado.modelo;
    const rgb = capturarEntrada(estado.tela.video, estado.geo, estado.ctx);
    if (!rgb) return null;
    const entrada = new ort.Tensor('uint8', rgb, [1, ENTRADA_H, ENTRADA_W, 3]);
    const saida = await sessao.run({ [sessao.inputNames[0]]: entrada });
    const plate = saida.plate || saida[sessao.outputNames[0]];
    return estado.lib.decodificar(plate.data, SLOTS);
  }

  function aoCapturar(estado, placa) {
    estado.pausado = true;
    estado.tela.aoVivo.textContent = placa;
    estado.tela.moldura.classList.add('cp-lida');
    if (navigator.vibrate) navigator.vibrate(VIBRAR_MS);
    estado.aoLer(placa);
  }

  async function passo(estado) {
    const video = estado.tela.video;
    if (estado.pausado || document.hidden || video.readyState < 2 || !video.videoWidth) return;
    const leitura = await lerQuadro(estado);
    if (estado.fechado || estado.pausado || !leitura) return;
    estado.tela.aoVivo.textContent = leitura.texto ? estado.lib.corrigirPorPosicao(leitura.texto) : '';
    const placa = estado.estabilizador.registrar(leitura);
    if (placa) aoCapturar(estado, placa);
  }

  function agendar(estado) {
    if (estado.fechado) return;
    estado.timer = setTimeout(async () => {
      try {
        await passo(estado);
        estado.falhasSeguidas = 0;
      } catch (e) {
        estado.falhasSeguidas = (estado.falhasSeguidas || 0) + 1;
        if (estado.falhasSeguidas === FALHAS_AVISO) estado.tela.dica.textContent = TEXTO_FALHA;
      }
      agendar(estado);
    }, INTERVALO_MS);
  }

  // ---------------------------------------------------------------- abrir / fechar

  function pararTrilhas(stream) {
    if (stream) stream.getTracks().forEach((t) => t.stop());
  }

  function prepararLanterna(estado, ligarFn) {
    const track = estado.stream.getVideoTracks()[0];
    const caps = track && track.getCapabilities ? track.getCapabilities() : {};
    if (!caps.torch) return;
    estado.track = track;
    estado.temLanterna = true;
    estado.tela.lanterna.hidden = false;
    estado.tela.lanterna.addEventListener('click', () => {
      ligarFn(estado.tela.lanterna.getAttribute('aria-pressed') !== 'true');
    });
  }

  async function iniciarTela(estado, opcoes, controle) {
    estado.tela = montarTela(opcoes.container);
    estado.tela.digitar.addEventListener('click', () => { controle.fechar(); opcoes.aoFalhar('digitar'); });
    estado.geo = posicionar(estado.tela);
    estado.aoRedimensionar = () => { estado.geo = posicionar(estado.tela); };
    window.addEventListener('resize', estado.aoRedimensionar);
    const canvas = document.createElement('canvas');
    canvas.width = ENTRADA_W;
    canvas.height = ENTRADA_H;
    estado.ctx = canvas.getContext('2d', { willReadFrequently: true });
    estado.tela.video.srcObject = estado.stream;
    prepararLanterna(estado, controle.ligarLanterna);
    await estado.tela.video.play(); // palco já está visível (iOS exige)
    estado.geo = posicionar(estado.tela);
  }

  async function iniciarLeitura(estado, opcoes) {
    try {
      estado.lib = await obterLib();
      estado.modelo = await obterSessao(opcoes.modeloUrl || MODELO_URL);
    } catch (e) {
      if (estado.fechado) return;
      estado.tela.dica.textContent = 'Leitura automática indisponível. Toque em Digitar.';
      opcoes.aoFalhar('sem_modelo');
      return;
    }
    if (estado.fechado) return;
    estado.estabilizador = estado.lib.criarEstabilizador();
    agendar(estado);
  }

  function criarControle(estado) {
    const fechar = () => {
      if (estado.fechado) return;
      estado.fechado = true;
      clearTimeout(estado.timer);
      pararTrilhas(estado.stream);
      if (estado.aoRedimensionar) window.removeEventListener('resize', estado.aoRedimensionar);
      if (estado.tela) {
        estado.tela.video.srcObject = null;
        estado.tela.palco.remove();
      }
    };
    const ligarLanterna = async (on) => {
      if (!estado.temLanterna || estado.fechado) return false;
      try {
        await estado.track.applyConstraints({ advanced: [{ torch: !!on }] });
        estado.tela.lanterna.setAttribute('aria-pressed', on ? 'true' : 'false');
        return true;
      } catch (e) {
        return false;
      }
    };
    const retomar = () => {
      if (estado.fechado || !estado.estabilizador) return;
      estado.estabilizador.zerar();
      estado.tela.aoVivo.textContent = '';
      estado.tela.moldura.classList.remove('cp-lida');
      estado.pausado = false;
    };
    return {
      fechar,
      ligarLanterna,
      retomar,
      get lanterna() { return estado.temLanterna && !estado.fechado ? ligarLanterna : null; },
    };
  }

  /**
   * Abre a câmera traseira com a moldura. aoLer(placa) quando 3 leituras iguais
   * seguidas fecham (a leitura pausa; retomar() volta a ler). aoFalhar(motivo):
   * 'sem_camera' (negada/inexistente), 'digitar' (porteiro tocou Digitar),
   * 'sem_modelo' (modelo não carregou; a câmera continua aberta).
   * Retorna { fechar(), lanterna: (on) => Promise<boolean> | null, retomar() }.
   */
  function abrirLeitor(opcoes) {
    const estado = { fechado: false, pausado: false, aoLer: opcoes.aoLer };
    const controle = criarControle(estado);
    const md = typeof navigator !== 'undefined' && navigator.mediaDevices;
    if (!md || typeof md.getUserMedia !== 'function') {
      Promise.resolve().then(() => opcoes.aoFalhar('sem_camera'));
    } else {
      md.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        .then(async (stream) => {
          if (estado.fechado) { pararTrilhas(stream); return; }
          estado.stream = stream;
          await iniciarTela(estado, opcoes, controle);
          if (!estado.fechado) await iniciarLeitura(estado, opcoes);
        }, () => { if (!estado.fechado) opcoes.aoFalhar('sem_camera'); })
        .catch(() => { if (!estado.fechado) { controle.fechar(); opcoes.aoFalhar('sem_camera'); } });
    }
    return {
      fechar: controle.fechar,
      retomar: controle.retomar,
      get lanterna() { return controle.lanterna; },
    };
  }

  return { regiaoMoldura, dimensoesMoldura, abrirLeitor };
});
