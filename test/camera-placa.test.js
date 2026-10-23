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

fila.then(() => {
  console.log(`\n${passou} ok, ${falhou} falharam`);
  if (falhou) process.exit(1);
});
