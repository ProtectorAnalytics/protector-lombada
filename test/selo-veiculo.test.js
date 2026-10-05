/**
 * Decisão do selo da base de veículos. Uso: node test/selo-veiculo.test.js
 */
const assert = require('node:assert');
const { estadoSelo, JANELA_CONSULTANDO_MS, mensagemOutroCarro } = require('../site/js/selo-veiculo');

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

const MSG_DESLIGADO = 'As consultas de veículo estão desligadas no momento. Se a placa estiver errada, use “É a mesma placa”; senão, tente mais tarde.';
const MSG_LIMITE = 'O limite de consultas foi atingido por agora. A placa será consultada automaticamente depois.';
const MSG_ANDAMENTO = 'Esta placa já está sendo consultada. Feche e abra a passagem em alguns minutos.';
const MSG_RESOLVIDA = 'Esta leitura já foi resolvida (talvez por outra pessoa). Feche e abra a passagem de novo.';
caso('mensagemOutroCarro: desligado e sem_token → consultas desligadas', () => {
  assert.strictEqual(mensagemOutroCarro('desligado'), MSG_DESLIGADO);
  assert.strictEqual(mensagemOutroCarro('sem_token'), MSG_DESLIGADO);
});
caso('mensagemOutroCarro: teto, sem_saldo, limite_hora → limite atingido', () => {
  for (const m of ['teto', 'sem_saldo', 'limite_hora']) assert.strictEqual(mensagemOutroCarro(m), MSG_LIMITE);
});
caso('mensagemOutroCarro: em_andamento → já sendo consultada', () => {
  assert.strictEqual(mensagemOutroCarro('em_andamento'), MSG_ANDAMENTO);
});
caso('mensagemOutroCarro: sem motivo ou desconhecido → leitura já resolvida', () => {
  assert.strictEqual(mensagemOutroCarro(), MSG_RESOLVIDA);
  assert.strictEqual(mensagemOutroCarro(null), MSG_RESOLVIDA);
  assert.strictEqual(mensagemOutroCarro('xyz'), MSG_RESOLVIDA);
});

console.log(`\n${passou} casos passaram`);
