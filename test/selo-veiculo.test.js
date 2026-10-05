/**
 * Decisão do selo da base de veículos. Uso: node test/selo-veiculo.test.js
 */
const assert = require('node:assert');
const { estadoSelo, JANELA_CONSULTANDO_MS } = require('../site/js/selo-veiculo');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

const agora = Date.parse('2026-10-05T12:00:00Z');
const haMin = (m) => new Date(agora - m * 60000).toISOString();

caso('pendente há 2 min → consultando', () => {
  assert.strictEqual(estadoSelo({ status: 'pendente', capturaTs: haMin(2), agora }), 'consultando');
});
caso('pendente há 30 min → null', () => {
  assert.strictEqual(estadoSelo({ status: 'pendente', capturaTs: haMin(30), agora }), null);
});
caso('pendente sem horário da passagem → null', () => {
  assert.strictEqual(estadoSelo({ status: 'pendente', capturaTs: null, agora }), null);
  assert.strictEqual(estadoSelo({ status: 'pendente', capturaTs: 'lixo', agora }), null);
});
caso('janela é de 10 minutos', () => {
  assert.strictEqual(JANELA_CONSULTANDO_MS, 10 * 60000);
  assert.strictEqual(estadoSelo({ status: 'pendente', capturaTs: haMin(9.9), agora }), 'consultando');
  assert.strictEqual(estadoSelo({ status: 'pendente', capturaTs: haMin(10), agora }), null);
});
caso('relógio da câmera 2 min adiantado ainda é consultando', () => {
  assert.strictEqual(estadoSelo({ status: 'pendente', capturaTs: haMin(-2), agora }), 'consultando');
});
caso('erro → null', () => {
  assert.strictEqual(estadoSelo({ status: 'erro', capturaTs: haMin(1), agora }), null);
});
caso('suspeita sem suspeita própria → null', () => {
  assert.strictEqual(estadoSelo({ status: 'suspeita', temSuspeitaPropria: false, capturaTs: haMin(1), agora }), null);
});
caso('suspeita própria → suspeita', () => {
  assert.strictEqual(estadoSelo({ status: 'suspeita', temSuspeitaPropria: true, capturaTs: haMin(90), agora }), 'suspeita');
});
caso('consultado → consultado', () => {
  assert.strictEqual(estadoSelo({ status: 'consultado', capturaTs: haMin(9000), agora }), 'consultado');
});
caso('sem linha ou status desconhecido → null', () => {
  assert.strictEqual(estadoSelo({}), null);
  assert.strictEqual(estadoSelo(undefined), null);
  assert.strictEqual(estadoSelo({ status: 'inexistente' }), null);
});

console.log(`\n${passou} casos passaram`);
