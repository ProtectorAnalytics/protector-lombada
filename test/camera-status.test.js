/**
 * Testes de cameraStatus (site/js/camera-status.js).
 *
 * Regressão que motivou o arquivo: na faixa "alerta" (30 a 59 min sem sinal)
 * o rótulo era `Há ${Math.floor(mins / 60)}h`, ou seja, "Há 0h".
 *
 * Uso: node test/camera-status.test.js
 */

const assert = require('node:assert');
const { cameraStatus } = require('../site/js/camera-status');

const haMinutos = (m) => new Date(Date.now() - m * 60000).toISOString();

let passou = 0;
function caso(nome, fn) {
  fn();
  passou++;
  console.log(`ok - ${nome}`);
}

caso('45 min sem sinal mostra minutos, não "Há 0h"', () => {
  const r = cameraStatus(haMinutos(45));
  assert.strictEqual(r.status, 'alerta');
  assert.strictEqual(r.label, 'Há 45 min');
});

caso('30 min exatos já é alerta e mostra minutos', () => {
  const r = cameraStatus(haMinutos(30));
  assert.strictEqual(r.status, 'alerta');
  assert.strictEqual(r.label, 'Há 30 min');
});

caso('a partir de 60 min mostra horas', () => {
  assert.strictEqual(cameraStatus(haMinutos(61)).label, 'Há 1h');
  assert.strictEqual(cameraStatus(haMinutos(150)).label, 'Há 2h');
});

caso('faixas online e offline seguem iguais', () => {
  assert.strictEqual(cameraStatus(haMinutos(10)).label, 'Há 10 min');
  assert.strictEqual(cameraStatus(haMinutos(60 * 8)).status, 'offline');
  assert.strictEqual(cameraStatus(null).status, 'aguardando');
});

console.log(`\n${passou} testes passaram`);
