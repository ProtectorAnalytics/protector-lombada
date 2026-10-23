/**
 * camera-placa.js — só o que roda sem navegador: a geometria da moldura
 * (tela → pixels do vídeo em object-fit: cover) e o caminho "sem câmera".
 * Uso: node test/camera-placa.test.js
 */
const assert = require('node:assert');
const cameraPlaca = require('../portaria/camera-placa.js');

let passou = 0;
let falhou = 0;
// Em série: os casos trocam o navigator global, não podem rodar juntos.
let fila = Promise.resolve();
function caso(nome, fn) {
  fila = fila.then(async () => {
    try { await fn(); passou++; console.log(`ok - ${nome}`); }
    catch (e) { falhou++; console.log(`FALHOU - ${nome}\n  ${e.message.split('\n').join('\n  ')}`); }
  });
}

const perto = (real, esperado, tol, rotulo) =>
  assert.ok(Math.abs(real - esperado) <= tol, `${rotulo}: ${real} ≠ ${esperado} (±${tol})`);

// Tela de celular 412×915, moldura 354×114 centralizada na horizontal, centro a 42% da altura.
// Vídeo 1920×1080 em cover: escala = max(412/1920, 915/1080) = 915/1080 = 0,847222…
// Vídeo exibido 1626,67×915, deslocado x = (412 − 1626,67)/2 = −607,333, y = 0.
// Moldura: left = (412 − 354)/2 = 29; top = 0,42·915 − 114/2 = 384,3 − 57 = 327,3.
// x = (29 + 607,333)·1080/915 = 751,08 · y = 327,3·1080/915 = 386,32
// w = 354·1080/915 = 417,84 · h = 114·1080/915 = 134,56
caso('regiaoMoldura: vídeo 1920×1080 em tela 412×915 (cover), moldura 354×114 a 42%', () => {
  const r = cameraPlaca.regiaoMoldura({ x: 29, y: 327.3, w: 354, h: 114 }, 1920, 1080, 412, 915);
  perto(r.x, 751.08, 0.6, 'x');
  perto(r.y, 386.32, 0.6, 'y');
  perto(r.w, 417.84, 0.6, 'w');
  perto(r.h, 134.56, 0.6, 'h');
});

caso('regiaoMoldura: aceita retângulo do DOM (left/top/width/height)', () => {
  const r = cameraPlaca.regiaoMoldura({ left: 29, top: 327.3, width: 354, height: 114 }, 1920, 1080, 412, 915);
  perto(r.x, 751.08, 0.6, 'x');
  perto(r.h, 134.56, 0.6, 'h');
});

caso('regiaoMoldura: vídeo em pé numa tela larga corta em cima e embaixo', () => {
  // Vídeo 1080×1920 em tela 800×600: escala = max(800/1080, 600/1920) = 0,7407; exibido 800×1422,2; y0 = −411,1.
  const r = cameraPlaca.regiaoMoldura({ x: 0, y: 0, w: 800, h: 600 }, 1080, 1920, 800, 600);
  perto(r.x, 0, 0.6, 'x');
  perto(r.y, 555, 0.6, 'y');
  perto(r.w, 1080, 0.6, 'w');
  perto(r.h, 810, 0.6, 'h');
});

caso('regiaoMoldura: nunca sai do quadro do vídeo', () => {
  const r = cameraPlaca.regiaoMoldura({ x: -50, y: -50, w: 2000, h: 2000 }, 640, 480, 640, 480);
  assert.deepStrictEqual(r, { x: 0, y: 0, w: 640, h: 480 });
});

caso('dimensoesMoldura: 3,1:1, centralizada, centro a 42% (412×915 → 354×114)', () => {
  const m = cameraPlaca.dimensoesMoldura(412, 915);
  assert.deepStrictEqual({ w: m.w, h: m.h, x: m.x }, { w: 354, h: 114, x: 29 });
  perto(m.y, 327.3, 0.5, 'y');
  perto(m.w / m.h, 3.1, 0.03, 'proporção');
});

caso('dimensoesMoldura: tablet não estica a moldura além do limite', () => {
  const m = cameraPlaca.dimensoesMoldura(1280, 800);
  assert.ok(m.w <= 520, `w = ${m.w}`);
  perto(m.w / m.h, 3.1, 0.03, 'proporção');
});

function comNavegador(nav, fn) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
  return Promise.resolve().then(fn).finally(() => {
    if (desc) Object.defineProperty(globalThis, 'navigator', desc);
    else delete globalThis.navigator;
  });
}

function esperarFalha(abrir) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('aoFalhar não foi chamado')), 500);
    const leitor = abrir({
      container: {},
      aoLer: () => reject(new Error('aoLer não deveria ser chamado')),
      aoFalhar: (motivo) => { clearTimeout(t); resolve({ motivo, leitor }); },
    });
  });
}

caso('abrirLeitor: sem navigator.mediaDevices → aoFalhar("sem_camera")', () =>
  comNavegador({}, async () => {
    const { motivo, leitor } = await esperarFalha(cameraPlaca.abrirLeitor);
    assert.strictEqual(motivo, 'sem_camera');
    assert.strictEqual(typeof leitor.fechar, 'function');
    assert.strictEqual(leitor.lanterna, null);
    leitor.fechar(); // não pode lançar
  }));

caso('abrirLeitor: câmera negada → aoFalhar("sem_camera")', () =>
  comNavegador({
    mediaDevices: { getUserMedia: () => Promise.reject(Object.assign(new Error('negado'), { name: 'NotAllowedError' })) },
  }, async () => {
    const { motivo } = await esperarFalha(cameraPlaca.abrirLeitor);
    assert.strictEqual(motivo, 'sem_camera');
  }));

caso('abrirLeitor: pede a câmera traseira (facingMode ideal environment)', () => {
  let pedido = null;
  return comNavegador({
    mediaDevices: { getUserMedia: (c) => { pedido = c; return Promise.reject(new Error('sem')); } },
  }, async () => {
    await esperarFalha(cameraPlaca.abrirLeitor);
    assert.deepStrictEqual(pedido, { video: { facingMode: { ideal: 'environment' } }, audio: false });
  });
});

caso('abrirLeitor: fechar antes da câmera responder solta as trilhas que chegarem', () => {
  let parou = 0;
  let liberar;
  const stream = { getTracks: () => [{ stop: () => { parou++; } }], getVideoTracks: () => [] };
  return comNavegador({
    mediaDevices: { getUserMedia: () => new Promise((r) => { liberar = r; }) },
  }, async () => {
    const leitor = cameraPlaca.abrirLeitor({ container: {}, aoLer: () => {}, aoFalhar: () => {} });
    leitor.fechar();
    liberar(stream);
    await new Promise((r) => setTimeout(r, 10));
    assert.strictEqual(parou, 1);
  });
});

// ---------------------------------------------------------------- ORT local e "Preparando"
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const VENDOR = path.join(__dirname, '..', 'portaria', 'vendor', 'ort-1.30.0');

caso('ORT hospedado no próprio site (build wasm 1.30.0), nada de CDN', () => {
  assert.strictEqual(cameraPlaca.ORT_BASE, '/portaria/vendor/ort-1.30.0/');
  assert.strictEqual(cameraPlaca.ORT_SCRIPT, '/portaria/vendor/ort-1.30.0/ort.wasm.min.js');
  const fonte = fs.readFileSync(path.join(__dirname, '..', 'portaria', 'camera-placa.js'), 'utf8');
  assert.ok(!/cdn\.jsdelivr|unpkg|cdnjs/.test(fonte), 'sem CDN no código');
});

caso('vendor/ort-1.30.0: arquivos do NOTICE existem com o tamanho e SHA-256 anotados', () => {
  const notice = fs.readFileSync(path.join(VENDOR, 'NOTICE.txt'), 'utf8');
  assert.match(notice, /MIT License/);
  assert.match(notice, /Microsoft Corporation/);
  const linhas = [...notice.matchAll(/^(\S+\.(?:js|mjs|wasm))\s+(\d+)\s+([0-9a-f]{64})$/gm)];
  assert.deepStrictEqual(linhas.map((l) => l[1]).sort(),
    ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm', 'ort.wasm.min.js']);
  for (const [, nome, bytes, sha] of linhas) {
    const buf = fs.readFileSync(path.join(VENDOR, nome));
    assert.strictEqual(buf.length, Number(bytes), `${nome}: tamanho`);
    assert.strictEqual(crypto.createHash('sha256').update(buf).digest('hex'), sha, `${nome}: SHA-256`);
  }
  // O build wasm só pede o .mjs/.wasm que estão na pasta
  const js = fs.readFileSync(path.join(VENDOR, 'ort.wasm.min.js'), 'utf8');
  assert.ok(js.includes('ort-wasm-simd-threaded.mjs'));
});

// DOM mínimo para abrir o leitor no Node
function elFalso(tag) {
  const el = {
    tag, style: {}, children: [], attrs: {}, textContent: '', hidden: false, clientWidth: 412, clientHeight: 915,
    classList: { add() {}, remove() {} },
    setAttribute(k, v) { el.attrs[k] = v; }, getAttribute(k) { return el.attrs[k]; },
    addEventListener() {}, append(...c) { el.children.push(...c); }, appendChild(c) { el.children.push(c); },
    remove() {}, getContext: () => ({}), play: async () => {}, readyState: 0, videoWidth: 0,
  };
  return el;
}
function comDom(ort, fn) {
  const antes = { window: globalThis.window, document: globalThis.document };
  globalThis.document = { hidden: false, head: elFalso('head'), getElementById: () => null, createElement: elFalso };
  globalThis.window = { ort, addEventListener() {}, removeEventListener() {}, location: { href: 'https://lombada.test/portaria' } };
  return Promise.resolve().then(fn).finally(() => {
    globalThis.window = antes.window; globalThis.document = antes.document;
  });
}
function ortFalso() {
  const o = { criadas: 0, liberar: null, env: { wasm: {} } };
  o.InferenceSession = { create: (url) => { o.criadas++; o.url = url; return new Promise((r) => { o.liberar = () => r({ inputNames: ['x'], outputNames: ['plate'], run: async () => ({}) }); }); } };
  return o;
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const stream = { getTracks: () => [], getVideoTracks: () => [] };

caso('primeira abertura mostra "Preparando o leitor (só na primeira vez)…" até a sessão ficar pronta', () => {
  const ort = ortFalso();
  return comDom(ort, () => comNavegador({ mediaDevices: { getUserMedia: async () => stream } }, async () => {
    const container = elFalso('div');
    const leitor = cameraPlaca.abrirLeitor({ container, aoLer: () => {}, aoFalhar: () => {} });
    await espera(20);
    const palco = container.children[0];
    const dica = palco.children.find((c) => c.className === 'cp-dica');
    assert.strictEqual(dica.textContent, 'Preparando o leitor (só na primeira vez)…');
    assert.strictEqual(ort.env.wasm.wasmPaths, 'https://lombada.test/portaria/vendor/ort-1.30.0/');
    ort.liberar();
    await espera(20);
    assert.strictEqual(dica.textContent, 'Encaixe a placa dentro da moldura');
    leitor.fechar();
    // Sessão reaproveitada: a segunda abertura já começa com a dica normal
    const c2 = elFalso('div');
    const l2 = cameraPlaca.abrirLeitor({ container: c2, aoLer: () => {}, aoFalhar: () => {} });
    await espera(20);
    assert.strictEqual(c2.children[0].children.find((c) => c.className === 'cp-dica').textContent, 'Encaixe a placa dentro da moldura');
    assert.strictEqual(ort.criadas, 1);
    l2.fechar();
  }));
});

caso('preCarregar: baixa ORT e modelo em segundo plano, uma vez só, e não lança', () => {
  const ort = ortFalso();
  return comDom(ort, async () => {
    const isolado = (() => { delete require.cache[require.resolve('../portaria/camera-placa.js')]; return require('../portaria/camera-placa.js'); })();
    const p1 = isolado.preCarregar();
    const p2 = isolado.preCarregar();
    assert.ok(p1 && typeof p1.then === 'function');
    ort.liberar();
    assert.strictEqual(await p1, true);
    assert.strictEqual(await p2, true);
    assert.strictEqual(ort.criadas, 1);
    assert.strictEqual(ort.url, '/modelos/leitor-placa.onnx');
    const quebrado = { env: { wasm: {} }, InferenceSession: { create: () => Promise.reject(new Error('rede')) } };
    globalThis.window.ort = quebrado;
    delete require.cache[require.resolve('../portaria/camera-placa.js')];
    assert.strictEqual(await require('../portaria/camera-placa.js').preCarregar(), false);
  });
});

fila.then(() => {
  console.log(`\n${passou} ok, ${falhou} falharam`);
  if (falhou) process.exit(1);
});
