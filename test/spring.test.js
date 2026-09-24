/**
 * Testes da física de site/js/spring.js (molas no estilo Apple).
 *
 * O que importa garantir:
 *   - damping 1.0 (criticamente amortecida) chega ao alvo SEM passar dele;
 *   - damping < 1 passa do alvo (overshoot) — só usado após gesto com impulso;
 *   - a velocidade inicial é herdada (handoff do dedo para a animação);
 *   - project() é a função de projeção da Apple (decaimento exponencial);
 *   - rubberband() resiste progressivamente e nunca passa da dimensão.
 *
 * Uso: node test/spring.test.js
 */

const assert = require('node:assert');
const Spring = require('../site/js/spring');

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

function simulate(params, from, to, velocity = 0, seconds = 3) {
  let state = { value: from, velocity };
  const trace = [];
  const dt = 1 / 120;
  for (let t = 0; t < seconds; t += dt) {
    state = Spring.step(state, to, dt, params);
    trace.push(state.value);
  }
  return { state, trace };
}

test('damping 1.0 chega ao alvo sem overshoot', () => {
  const { state, trace } = simulate({ damping: 1, response: 0.4 }, 0, 100);
  assert.ok(Math.abs(state.value - 100) < 0.01, `terminou em ${state.value}`);
  assert.ok(Math.max(...trace) <= 100.0001, `passou do alvo: ${Math.max(...trace)}`);
});

test('damping 0.8 passa do alvo (overshoot) e depois assenta', () => {
  const { state, trace } = simulate({ damping: 0.8, response: 0.4 }, 0, 100);
  assert.ok(Math.max(...trace) > 100.5, 'deveria ter overshoot');
  assert.ok(Math.abs(state.value - 100) < 0.01);
});

test('response menor chega mais rápido', () => {
  const rapido = simulate({ damping: 1, response: 0.2 }, 0, 100, 0, 0.2).state.value;
  const lento = simulate({ damping: 1, response: 0.6 }, 0, 100, 0, 0.2).state.value;
  assert.ok(rapido > lento, `rápido ${rapido} <= lento ${lento}`);
});

test('herda a velocidade inicial (handoff do gesto)', () => {
  const parado = simulate({ damping: 1, response: 0.4 }, 0, 100, 0, 0.05).state.value;
  const lancado = simulate({ damping: 1, response: 0.4 }, 0, 100, 2000, 0.05).state.value;
  assert.ok(lancado > parado + 20, `sem herança: ${lancado} vs ${parado}`);
});

test('isSettled reconhece repouso', () => {
  assert.strictEqual(Spring.isSettled({ value: 100, velocity: 0 }, 100), true);
  assert.strictEqual(Spring.isSettled({ value: 90, velocity: 0 }, 100), false);
  assert.strictEqual(Spring.isSettled({ value: 100, velocity: 50 }, 100), false);
});

test('project() segue a fórmula da Apple (d = 0.998)', () => {
  // 1000 px/s → (1000/1000) * 0.998 / 0.002 = 499 px
  assert.ok(Math.abs(Spring.project(1000) - 499) < 1e-9);
  assert.strictEqual(Spring.project(0), 0);
  assert.ok(Spring.project(-1000) < 0);
});

test('rubberband() resiste cada vez mais e nunca passa da dimensão', () => {
  const a = Spring.rubberband(50, 400);
  const b = Spring.rubberband(500, 400);
  const c = Spring.rubberband(100000, 400);
  assert.ok(a > 0 && a < 50, `a=${a}`);
  assert.ok(b - a < 500 - 50, 'a resistência deveria crescer');
  assert.ok(c < 400, `passou da dimensão: ${c}`);
  assert.ok(Spring.rubberband(-50, 400) < 0, 'mantém o sinal');
});

test('velocityTracker mede px/s pelos últimos pontos', () => {
  const vt = Spring.velocityTracker();
  vt.add(0, 0);
  vt.add(10, 10);
  vt.add(20, 20); // 20 px em 20 ms = 1000 px/s
  assert.ok(Math.abs(vt.velocity() - 1000) < 1e-6, `v=${vt.velocity()}`);
});

test('velocityTracker ignora pontos antigos (dedo parado antes de soltar)', () => {
  const vt = Spring.velocityTracker();
  vt.add(0, 0);
  vt.add(100, 16);
  vt.add(100, 300); // ficou parado 284 ms
  assert.strictEqual(vt.velocity(), 0);
});

console.log(`\n${passed} testes passaram.`);
