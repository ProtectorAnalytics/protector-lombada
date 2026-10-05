/**
 * Escala única de severidade da velocidade: até o limite = ok (verde);
 * acima do limite = alerta (vermelho), em todos os lugares do painel.
 * Uso: node test/severidade-velocidade.test.js
 */
const assert = require('node:assert');
const { velocidadeMedida, acimaDoLimite, classeVelocidade } = require('../site/js/severidade-velocidade');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

// ---- velocidadeMedida
caso('velocidade positiva é medida; zero, negativa e inválida não', () => {
  assert.strictEqual(velocidadeMedida(1), true);
  assert.strictEqual(velocidadeMedida(0), false);
  assert.strictEqual(velocidadeMedida(-5), false);
  assert.strictEqual(velocidadeMedida(null), false);
  assert.strictEqual(velocidadeMedida(undefined), false);
  assert.strictEqual(velocidadeMedida(NaN), false);
  assert.strictEqual(velocidadeMedida('40'), false);
});

// ---- acimaDoLimite
caso('no limite não é alerta; um acima já é', () => {
  assert.strictEqual(acimaDoLimite(33, 33), false);
  assert.strictEqual(acimaDoLimite(34, 33), true);
});
caso('40 km/h com limite 33 é alerta (não existe faixa intermediária)', () => {
  assert.strictEqual(acimaDoLimite(40, 33), true);
  assert.strictEqual(acimaDoLimite(53, 33), true);
  assert.strictEqual(acimaDoLimite(54, 33), true);
});
caso('sem velocidade medida nunca é alerta', () => {
  assert.strictEqual(acimaDoLimite(0, 33), false);
  assert.strictEqual(acimaDoLimite(null, 33), false);
});
caso('limite ausente ou inválido não inventa alerta', () => {
  assert.strictEqual(acimaDoLimite(80, undefined), false);
  assert.strictEqual(acimaDoLimite(80, NaN), false);
  assert.strictEqual(acimaDoLimite(80, null), false);
});

// ---- classeVelocidade
caso('até o limite é verde, acima é vermelho', () => {
  assert.strictEqual(classeVelocidade(20, 33), 'green');
  assert.strictEqual(classeVelocidade(33, 33), 'green');
  assert.strictEqual(classeVelocidade(34, 33), 'red');
  assert.strictEqual(classeVelocidade(40, 33), 'red');
  assert.strictEqual(classeVelocidade(120, 33), 'red');
});
caso('nunca devolve laranja', () => {
  for (let v = 1; v <= 200; v++) assert.notStrictEqual(classeVelocidade(v, 33), 'orange');
});
caso('sem velocidade medida é "unknown"', () => {
  assert.strictEqual(classeVelocidade(0, 33), 'unknown');
  assert.strictEqual(classeVelocidade(undefined, 33), 'unknown');
});
caso('velocidade medida sem limite válido fica verde (não alerta)', () => {
  assert.strictEqual(classeVelocidade(50, undefined), 'green');
});

console.log(`\n${passou} casos ok`);
