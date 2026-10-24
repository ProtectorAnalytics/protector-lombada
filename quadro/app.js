/**
 * app.js — página /quadro (Quadro no PC da portaria, v1.19.0).
 *
 * Login compacto (usuário de porteiro sem "@" ou e-mail, com o quadro "não
 * sou um robô"), a passagem mais recente ao vivo e as setas ‹ › nas de hoje.
 * Regras puras em /js/quadro.js (quadroLib); ponte com o programa do
 * Windows em /quadro/casca.js. Nada do banco entra em innerHTML: a tela é
 * montada com textContent e elementos criados um a um.
 */
(function () {
  'use strict';

  const q = window.quadroLib;
  const casca = window.cascaQuadro;
  const $ = (id) => document.getElementById(id);
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ATUALIZA_MS = 10 * 1000;          // rede de segurança do ao vivo (sem Realtime, é ela que traz)
  const VINCULOS_MS = 2 * 60 * 1000;      // cadastros novos (portaria/painel) entram sozinhos
  const VINCULOS_SEM_CADASTRO_MS = 30 * 1000; // passagem "sem cadastro": confere de novo mais cedo
  const CHAVE_CAMERA = 'quadro.camera';
  const CHAVE_CLIENTE = 'quadro.cliente';
  const CHAVE_USUARIO = 'quadro.usuario'; // só o usuário (nunca a senha), para vir preenchido
  const COLUNAS_CAPTURA = 'id, placa, timestamp, camera_id, foto_path, velocidade';

  let sb = null;
  let captcha = window.captchaLib.criarCaptcha({});
  let perfil = null;
  let acesso = { modo: 'negado' };
  let cliente = null;      // { id, nome, limite_velocidade }
  let cameras = [];
  let unidades = [];
  let indice = new Map();
  let vinculosEm = 0;
  let cameraId = '';
  let estado = q.estadoInicial();
  let timer = null;
  let canal = null;
  let lendo = false;
  let ultimaMostrada = null;
  let fotoMostrada = '';
  let geracao = 0; // troca de sessão/condomínio: resposta velha não pinta a tela

  const fotos = window.miniaturaLib.criarCacheUrlAssinada({
    assinar: async (paths, ttl) => {
      const { data, error } = await sb.storage.from('capturas-fotos').createSignedUrls(paths, ttl);
      if (error) throw error;
      return data;
    },
  });

  // ---------------------------------------------------------------- utilidades
  function lerLocal(chave) {
    try { return localStorage.getItem(chave) || ''; } catch (e) { return ''; }
  }
  function gravarLocal(chave, valor) {
    try { localStorage.setItem(chave, valor); } catch (e) { /* sem storage: vale só agora */ }
  }

  function mostrarTela(id) {
    ['tela-carregando', 'tela-login', 'tela-escolha', 'tela-aviso', 'tela-quadro'].forEach((t) => { $(t).hidden = t !== id; });
    $('botao-painel').hidden = id !== 'tela-quadro';
    // O botão que tinha o foco (Entrar, Abrir) sumiu com a tela: leva o foco
    // para o primeiro controle da tela nova, senão o teclado fica sem lugar.
    if (id === 'tela-quadro' && (!document.activeElement || document.activeElement === document.body || document.activeElement.closest('[hidden]'))) {
      $('botao-painel').focus({ preventScroll: true });
    }
  }

  function marcarEstado(tipo, texto) {
    const el = $('estado');
    el.className = `estado ${tipo}`;
    $('estado-texto').textContent = texto;
  }

  function falhaAoCarregar(texto) {
    $('carregando-texto').textContent = texto;
    $('botao-tentar').hidden = false;
    marcarEstado('falha', 'Sem conexão');
    mostrarTela('tela-carregando');
  }

  async function chamarApi(url, metodo, corpo) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { const e = new Error('Sessão expirada. Entre de novo.'); e.status = 401; throw e; }
    const resp = await fetch(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) { const e = new Error(json.error || 'Não foi possível concluir.'); e.status = resp.status; throw e; }
    return json;
  }

  // ---------------------------------------------------------------- entrada
  async function iniciar() {
    $('botao-tentar').hidden = true;
    $('carregando-texto').textContent = 'Carregando…';
    mostrarTela('tela-carregando');
    try {
      if (!sb) {
        const cfg = await (await fetch('/api/config')).json();
        sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
        captcha = window.captchaLib.criarCaptcha({ siteKey: cfg.turnstileSiteKey, container: 'captcha-login' });
        sb.auth.onAuthStateChange((evento) => { if (evento === 'SIGNED_OUT') voltarAoLogin(); });
      }
      const { data: { session } } = await sb.auth.getSession();
      if (session && session.user) await carregarPerfil(session.user);
      else abrirLogin();
    } catch (e) {
      falhaAoCarregar('Sem conexão com o servidor. Confira a internet.');
    }
  }

  function abrirLogin() {
    marcarEstado('', 'Quadro');
    $('barra-titulo').textContent = '';
    mostrarTela('tela-login');
    const usuario = lerLocal(CHAVE_USUARIO);
    if (usuario && !$('login-usuario').value) $('login-usuario').value = usuario;
    ($('login-usuario').value ? $('login-senha') : $('login-usuario')).focus();
    captcha.iniciar().catch(() => {});
  }

  function alternarSenha() {
    const botao = $('botao-ver-senha');
    const mostrar = botao.getAttribute('aria-pressed') !== 'true';
    $('login-senha').type = mostrar ? 'text' : 'password';
    botao.setAttribute('aria-pressed', String(mostrar));
    const texto = mostrar ? 'Esconder a senha' : 'Mostrar a senha';
    botao.title = texto;
    botao.setAttribute('aria-label', texto);
    botao.querySelector('use').setAttribute('href', mostrar ? '#ic-olho-fechado' : '#ic-olho');
  }

  async function entrar(ev) {
    ev.preventDefault();
    const entrada = $('login-usuario').value.trim();
    const senha = $('login-senha').value;
    const erro = $('login-erro');
    erro.textContent = '';
    if (!entrada || !senha) { erro.textContent = 'Preencha usuário (ou e-mail) e senha.'; return; }
    $('botao-entrar').disabled = true;
    try {
      const email = window.usuarioPortariaLib.paraLogin(entrada);
      let token;
      try { token = await captcha.obterToken(); } catch (_) { erro.textContent = window.captchaLib.mensagemFalha(captcha.ultimoErro()); return; }
      const { data, error } = await sb.auth.signInWithPassword(window.captchaLib.credenciais({ email, password: senha }, token));
      if (error) {
        erro.textContent = window.captchaLib.ehErroDeCaptcha(error)
          ? window.captchaLib.mensagemFalha(captcha.ultimoErro() || 'recusado')
          : 'Usuário (ou e-mail) ou senha incorretos.';
        return;
      }
      captcha.parar();
      gravarLocal(CHAVE_USUARIO, entrada);
      $('login-senha').value = '';
      if ($('botao-ver-senha').getAttribute('aria-pressed') === 'true') alternarSenha();
      await carregarPerfil(data.user);
    } catch (e) {
      erro.textContent = 'Erro ao conectar. Tente novamente.';
    } finally {
      $('botao-entrar').disabled = false;
    }
  }

  async function carregarPerfil(usuario) {
    const { data, error } = await sb.from('usuarios')
      .select('id, nome, role, cliente_id, ativo')
      .eq('auth_id', usuario.id).eq('ativo', true).maybeSingle();
    if (error) throw error;
    perfil = data;
    acesso = q.modoDoPerfil(perfil);
    $('menu-trocar').hidden = acesso.modo !== 'admin';
    if (acesso.modo === 'negado') { avisar('Este login não tem acesso ao quadro.'); return; }
    if (acesso.modo === 'admin') { await abrirEscolha(); return; }
    await abrirCliente(acesso.clienteId);
  }

  function avisar(texto) {
    $('aviso-texto').textContent = texto;
    marcarEstado('', 'Quadro');
    mostrarTela('tela-aviso');
  }

  // Equipe Protector: escolhe o condomínio (lembrado neste PC)
  async function abrirEscolha(semLembrar) {
    const { data, error } = await sb.from('clientes').select('id, nome').eq('ativo', true).order('nome');
    if (error) throw error;
    const lista = data || [];
    const sel = $('escolha-cliente');
    sel.replaceChildren(...lista.map((c) => new Option(c.nome || 'Condomínio', c.id)));
    const lembrado = q.clienteLembrado(lerLocal(CHAVE_CLIENTE), lista);
    if (lembrado && !semLembrar) { await abrirComoAdmin(lembrado); return; }
    if (lembrado) sel.value = lembrado;
    $('escolha-erro').textContent = '';
    marcarEstado('', 'Quadro');
    mostrarTela('tela-escolha');
  }

  // A visita da equipe Protector fica no audit_log antes de o quadro abrir (fail-closed, igual ao painel)
  async function abrirComoAdmin(clienteId) {
    try {
      await chamarApi('/api/admin/acesso-painel', 'POST', { cliente_id: clienteId });
    } catch (e) {
      mostrarTela('tela-escolha');
      $('escolha-erro').textContent = e && e.status ? e.message : 'Sem conexão. Tente de novo.';
      return;
    }
    gravarLocal(CHAVE_CLIENTE, clienteId);
    await abrirCliente(clienteId);
  }

  // ---------------------------------------------------------------- condomínio
  async function abrirCliente(clienteId) {
    const minha = ++geracao;
    $('carregando-texto').textContent = 'Carregando…';
    mostrarTela('tela-carregando');
    try {
      const [c, cams, unis] = await Promise.all([
        sb.from('clientes').select('id, nome, limite_velocidade').eq('id', clienteId).eq('ativo', true).maybeSingle(),
        sb.from('cameras').select('id, nome, nome_exibicao, modelo, foto_enquadramento').eq('cliente_id', clienteId).eq('ativa', true).order('nome'),
        chamarApi(`/api/admin/unidades?cliente_id=${encodeURIComponent(clienteId)}`, 'GET').catch(() => []),
      ]);
      if (minha !== geracao) return;
      if (c.error || cams.error) throw c.error || cams.error;
      if (!c.data) { avisar('Condomínio não encontrado ou inativo.'); return; }
      cliente = c.data;
      cameras = cams.data || [];
      unidades = Array.isArray(unis) ? unis : [];
      await recarregarVinculos(true);
    } catch (e) {
      if (minha === geracao) falhaAoCarregar('Não foi possível abrir o quadro. Confira a internet.');
      return;
    }
    if (minha !== geracao) return;
    prepararQuadro();
  }

  async function recarregarVinculos(forcar) {
    if (!cliente || (!forcar && Date.now() - vinculosEm < VINCULOS_SEM_CADASTRO_MS)) return;
    vinculosEm = Date.now();
    const lista = await chamarApi(`/api/admin/veiculos?cliente_id=${encodeURIComponent(cliente.id)}&historico=1`, 'GET');
    indice = window.vinculoPlacaLib.indexarVinculos(Array.isArray(lista) ? lista : []);
  }

  function prepararQuadro() {
    $('barra-titulo').textContent = cliente.nome || '';
    document.title = `Quadro · ${cliente.nome || 'portaria'}`;
    preencherCameras();
    estado = q.estadoInicial();
    ultimaMostrada = null;
    fotoMostrada = '';
    mostrarTela('tela-quadro');
    desenhar();
    assinarRealtime();
    atualizar();
    iniciarTimer();
  }

  function preencherCameras() {
    const sel = $('menu-camera');
    sel.replaceChildren(new Option('Todas as câmeras', ''), ...cameras.map((c) => new Option(c.nome_exibicao || c.nome || 'Câmera', c.id)));
    cameraId = q.cameraValida(lerLocal(`${CHAVE_CAMERA}.${cliente.id}`), cameras);
    sel.value = cameraId;
  }

  // ---------------------------------------------------------------- ao vivo
  // Realtime (INSERT em capturas do condomínio; a RLS filtra) + leitura a cada 10 s.
  function assinarRealtime() {
    pararRealtime();
    try {
      canal = sb.channel(`quadro-${cliente.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'capturas', filter: `cliente_id=eq.${cliente.id}` }, () => atualizar())
        .subscribe();
    } catch (e) {
      canal = null; // sem Realtime: a leitura periódica segue
    }
  }
  function pararRealtime() {
    if (canal && sb) sb.removeChannel(canal).catch(() => {});
    canal = null;
  }
  function iniciarTimer() {
    clearInterval(timer);
    timer = setInterval(() => { if (!document.hidden) atualizar(); }, ATUALIZA_MS);
  }
  function pararTudo() {
    clearInterval(timer);
    timer = null;
    pararRealtime();
  }

  async function atualizar() {
    if (!cliente || lendo) return;
    lendo = true;
    const minha = geracao;
    try {
      let consulta = sb.from('capturas').select(COLUNAS_CAPTURA)
        .eq('cliente_id', cliente.id)
        .gte('timestamp', q.inicioDoDia(new Date()))
        .order('timestamp', { ascending: false })
        .limit(q.MAX_PASSAGENS);
      if (cameraId) consulta = consulta.eq('camera_id', cameraId);
      const { data, error } = await consulta;
      if (minha !== geracao) return;
      if (error) throw error;
      const lista = q.filtrarPorCamera(data || [], cameraId);
      await vinculosEmDia(lista);
      if (minha !== geracao) return;
      estado = q.receberPassagens(estado, lista);
      await desenhar();
    } catch (e) {
      if (minha === geracao) marcarEstado('falha', 'Sem conexão');
    } finally {
      lendo = false;
    }
  }

  // Passagem nova "sem cadastro" pode ter acabado de ser cadastrada no tablet
  async function vinculosEmDia(lista) {
    const nova = lista[0];
    const semCadastro = nova && !window.vinculoPlacaLib.vinculoNaHora(indice, nova.placa, nova.timestamp);
    const velho = Date.now() - vinculosEm > VINCULOS_MS;
    if (!velho && !semCadastro) return;
    try { await recarregarVinculos(velho); } catch (e) { /* mantém os vínculos que já tem */ }
  }

  // ---------------------------------------------------------------- desenho
  function icone(id) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', `#ic-${id}`);
    svg.appendChild(use);
    return svg;
  }

  function desenharSelo(d) {
    const selo = $('p-tipo');
    selo.style.setProperty('--cor-tipo', `var(${d.tipo.cor})`);
    const rotulo = document.createElement('span');
    rotulo.textContent = d.tipo.rotulo;
    selo.replaceChildren(icone(d.tipo.icone), rotulo);
  }

  async function desenharFoto(c, d) {
    const caixa = $('foto');
    const chave = `${c.id}|${c.foto_path || ''}`;
    if (fotoMostrada === chave) return; // a leitura de 10 s não recarrega a mesma foto
    fotoMostrada = chave;
    caixa.setAttribute('style', window.painelVisualLib.estiloRecorte(d.recorte));
    let foto = null;
    if (c.foto_path) {
      try {
        const urls = await fotos.urls(window.miniaturaLib.comMiniaturas([c.foto_path]));
        foto = window.miniaturaLib.escolherFoto(c.foto_path, urls);
      } catch (e) { foto = null; }
    }
    if (fotoMostrada !== chave) return; // o porteiro já trocou de passagem
    if (!foto) { caixa.replaceChildren(semFoto()); return; }
    const img = document.createElement('img');
    img.alt = `Foto da passagem da placa ${d.placa} às ${d.hora}`;
    img.decoding = 'async';
    img.width = 640;
    img.height = 360;
    if (foto.original) img.dataset.original = foto.original;
    img.addEventListener('error', aoFalharFoto);
    img.src = foto.src;
    caixa.replaceChildren(img);
  }

  function semFoto() {
    const s = document.createElement('span');
    s.className = 'sem-foto';
    s.textContent = 'Sem foto';
    return s;
  }

  // Miniatura que não carrega: tenta o original uma vez; depois "Sem foto"
  function aoFalharFoto(ev) {
    const img = ev.currentTarget;
    const original = img.dataset.original;
    if (original) { delete img.dataset.original; img.src = original; return; }
    img.replaceWith(semFoto());
  }

  function desenharTexto(d) {
    $('p-placa').textContent = d.placa;
    $('p-vel').textContent = d.acimaDoLimite ? `▲ ${d.velocidade}` : d.velocidade;
    $('p-nome').textContent = d.temCadastro ? (d.nome || 'Sem nome') : '';
    $('p-unidade').textContent = d.unidade;
    $('p-camera').textContent = d.camera;
    $('p-hora').textContent = d.hora;
    desenharSelo(d);
    const partes = [d.placa, d.velocidade, d.acimaDoLimite ? 'acima do limite' : '', d.tipo.rotulo, d.nome, d.unidade, d.camera, d.hora];
    $('passagem').setAttribute('aria-label', partes.filter(Boolean).join(', '));
  }

  function desenharNavegacao() {
    $('botao-voltar').disabled = !q.podeVoltar(estado);
    $('botao-avancar').disabled = !q.podeAvancar(estado);
    $('botao-ao-vivo').hidden = estado.aoVivo;
    $('nav-posicao').textContent = estado.aoVivo ? (estado.lista.length ? 'Última passagem' : '') : q.posicao(estado);
    document.querySelector('.nav').classList.toggle('historico-nav', !estado.aoVivo);
    if (estado.aoVivo) marcarEstado('vivo', 'Ao vivo');
    else marcarEstado('historico', 'Histórico');
  }

  async function desenhar() {
    desenharNavegacao();
    const c = q.passagemAtual(estado);
    $('passagem').hidden = !c;
    $('vazio').hidden = Boolean(c);
    if (!c) return;
    const d = q.descreverPassagem(c, { indice, cameras, unidades, limite: cliente.limite_velocidade });
    const el = $('passagem');
    el.classList.toggle('alerta', d.acimaDoLimite);
    const chegou = estado.aoVivo && ultimaMostrada !== null && ultimaMostrada !== c.id;
    if (ultimaMostrada !== c.id) {
      el.classList.remove('nova');
      if (chegou) { void el.offsetWidth; el.classList.add('nova'); }
    }
    ultimaMostrada = c.id;
    desenharTexto(d);
    await desenharFoto(c, d);
  }

  // ---------------------------------------------------------------- ações
  function navegar(fn) {
    estado = fn(estado);
    desenhar();
  }

  function abrirPainel() {
    if (!cliente) return;
    casca.abrirExterno(q.urlDoPainel(acesso.modo, cliente.id), q.urlExternaPermitida);
  }

  function trocarCamera() {
    cameraId = q.cameraValida($('menu-camera').value, cameras);
    gravarLocal(`${CHAVE_CAMERA}.${cliente.id}`, cameraId);
    estado = q.estadoInicial();
    ultimaMostrada = null;
    fotoMostrada = '';
    desenhar();
    atualizar();
  }

  async function sair() {
    fecharMenu();
    try { await sb.auth.signOut(); } catch (e) { /* sai da tela mesmo assim */ }
    voltarAoLogin();
  }

  function voltarAoLogin() {
    geracao++;
    pararTudo();
    perfil = null; cliente = null; cameras = []; unidades = []; indice = new Map(); vinculosEm = 0;
    estado = q.estadoInicial();
    fotoMostrada = '';
    fotos.limpar();
    $('menu-trocar').hidden = true;
    document.title = 'Quadro da portaria · Lombada Educativa';
    abrirLogin();
  }

  function trocarCondominio() {
    fecharMenu();
    geracao++;
    pararTudo();
    cliente = null;
    abrirEscolha(true).catch(() => falhaAoCarregar('Sem conexão com o servidor.'));
  }

  // ---------------------------------------------------------------- menu e casca
  function abrirMenu() {
    $('menu').hidden = false;
    $('botao-menu').setAttribute('aria-expanded', 'true');
    $('menu-camera').disabled = !cliente;
    $('menu-painel').hidden = !cliente;
    atualizarAutostart();
  }
  function fecharMenu() {
    $('menu').hidden = true;
    $('botao-menu').setAttribute('aria-expanded', 'false');
  }

  async function atualizarAutostart() {
    if (!casca.autostart) return;
    $('menu-autostart-linha').hidden = false;
    try { $('menu-autostart').checked = await casca.autostart.ligado(); } catch (e) { /* mantém o que está */ }
  }

  async function trocarAutostart() {
    const caixa = $('menu-autostart');
    try {
      if (caixa.checked) await casca.autostart.ligar();
      else await casca.autostart.desligar();
    } catch (e) {
      caixa.checked = !caixa.checked;
    }
  }

  function aplicarFixado(fixado) {
    casca.gravarFixado(fixado);
    const botao = $('botao-fixar');
    botao.setAttribute('aria-pressed', String(fixado));
    const texto = fixado ? 'Destravar a posição do quadro' : 'Fixar o quadro nesta posição';
    botao.title = texto;
    botao.setAttribute('aria-label', texto);
    botao.querySelector('.rot-fixar').textContent = fixado ? 'Fixo' : 'Fixar';
    casca.aplicarFixado(fixado, document);
  }

  function prepararCasca() {
    if (!casca.ehApp) return;
    document.documentElement.classList.add('app-windows');
    $('botao-fixar').hidden = false;
    $('botao-minimizar').hidden = false;
    aplicarFixado(casca.lerFixado());
  }

  function ligarEventos() {
    $('form-login').addEventListener('submit', entrar);
    $('botao-tentar').addEventListener('click', iniciar);
    $('botao-escolher').addEventListener('click', () => abrirComoAdmin($('escolha-cliente').value));
    $('botao-painel').addEventListener('click', abrirPainel);
    $('botao-ver-senha').addEventListener('click', alternarSenha);
    $('botao-voltar').addEventListener('click', () => navegar(q.voltar));
    $('botao-avancar').addEventListener('click', () => navegar(q.avancar));
    $('botao-ao-vivo').addEventListener('click', () => navegar(q.irAoVivo));
    $('botao-menu').addEventListener('click', () => ($('menu').hidden ? abrirMenu() : fecharMenu()));
    $('menu-camera').addEventListener('change', trocarCamera);
    $('menu-autostart').addEventListener('change', trocarAutostart);
    $('menu-painel').addEventListener('click', () => { fecharMenu(); abrirPainel(); });
    $('menu-trocar').addEventListener('click', trocarCondominio);
    $('menu-sair').addEventListener('click', sair);
    $('menu-manual').addEventListener('click', (ev) => {
      if (!casca.ehApp) return;
      ev.preventDefault();
      fecharMenu();
      casca.abrirExterno(new URL($('menu-manual').getAttribute('href'), q.ORIGEM).href, q.urlExternaPermitida);
    });
    document.querySelectorAll('[data-acao="sair"]').forEach((b) => b.addEventListener('click', sair));
    $('botao-fixar').addEventListener('click', () => aplicarFixado($('botao-fixar').getAttribute('aria-pressed') !== 'true'));
    $('botao-minimizar').addEventListener('click', () => casca.minimizar());
    document.addEventListener('click', (ev) => {
      if ($('menu').hidden || $('menu').contains(ev.target) || $('botao-menu').contains(ev.target)) return;
      fecharMenu();
    });
    document.addEventListener('keydown', aoTeclar);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && cliente) atualizar(); });
  }

  // Setas do teclado também navegam (fora dos campos); Esc fecha o menu
  function aoTeclar(ev) {
    if (ev.key === 'Escape' && !$('menu').hidden) { fecharMenu(); $('botao-menu').focus(); return; }
    if ($('tela-quadro').hidden || /^(INPUT|SELECT|TEXTAREA)$/.test(ev.target.tagName)) return;
    if (ev.key === 'ArrowLeft') navegar(q.voltar);
    if (ev.key === 'ArrowRight') navegar(q.avancar);
  }

  prepararCasca();
  ligarEventos();
  iniciar();
})();
