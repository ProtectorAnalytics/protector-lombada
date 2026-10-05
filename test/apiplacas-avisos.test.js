/**
 * Testes de lib/apiplacas-avisos.js.
 * Uso: node test/apiplacas-avisos.test.js
 */
const assert = require('node:assert');
const { avisosPendentes, chavesLimpas } = require('../lib/apiplacas-avisos');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

const CFG = { ativo: true, teto_mensal: 150, aviso_percentual: 80, saldo_minimo: 200, avisos_enviados: {} };
const chaves = (l) => l.map((a) => a.chave).sort();

caso('nada a avisar abaixo de tudo', () => {
  assert.deepStrictEqual(avisosPendentes({ cfg: CFG, gasto: 10, saldo: 900, mes: '2026-10' }), []);
});

caso('80% do teto avisa uma vez no mês', () => {
  assert.deepStrictEqual(chaves(avisosPendentes({ cfg: CFG, gasto: 120, saldo: 900, mes: '2026-10' })), ['teto80:2026-10']);
  const jaEnviado = { ...CFG, avisos_enviados: { 'teto80:2026-10': '2026-10-10T00:00:00Z' } };
  assert.deepStrictEqual(avisosPendentes({ cfg: jaEnviado, gasto: 130, saldo: 900, mes: '2026-10' }), []);
});

caso('teto atingido avisa também (e o 80% se ainda não foi)', () => {
  assert.deepStrictEqual(chaves(avisosPendentes({ cfg: CFG, gasto: 150, saldo: 900, mes: '2026-10' })), ['teto100:2026-10', 'teto80:2026-10']);
});

caso('mês novo libera os avisos de teto de novo', () => {
  const cfg = { ...CFG, avisos_enviados: { 'teto80:2026-10': 'x', 'teto100:2026-10': 'x' } };
  assert.deepStrictEqual(chaves(avisosPendentes({ cfg, gasto: 150, saldo: 900, mes: '2026-11' })), ['teto100:2026-11', 'teto80:2026-11']);
});

caso('saldo baixo e zerado não dependem do mês', () => {
  assert.deepStrictEqual(chaves(avisosPendentes({ cfg: CFG, gasto: 0, saldo: 150, mes: '2026-10' })), ['saldo_baixo']);
  assert.deepStrictEqual(chaves(avisosPendentes({ cfg: CFG, gasto: 0, saldo: 0, mes: '2026-10' })), ['saldo_baixo', 'saldo_zerado']);
});

caso('saldo desconhecido (null) não gera aviso de saldo', () => {
  assert.deepStrictEqual(avisosPendentes({ cfg: CFG, gasto: 0, saldo: null, mes: '2026-10' }), []);
});

caso('token desligado gera aviso único', () => {
  const cfg = { ...CFG, ativo: false, avisos_enviados: {} };
  const l = avisosPendentes({ cfg, gasto: 0, saldo: 900, mes: '2026-10', tokenInvalido: true });
  assert.deepStrictEqual(chaves(l), ['token_invalido']);
});

caso('recarga: saldo acima do mínimo limpa as chaves de saldo', () => {
  const cfg = { ...CFG, avisos_enviados: { saldo_baixo: 'x', saldo_zerado: 'x', 'teto80:2026-10': 'x' } };
  assert.deepStrictEqual(chavesLimpas({ cfg, saldo: 1000 }), { 'teto80:2026-10': 'x' });
  assert.deepStrictEqual(chavesLimpas({ cfg, saldo: 100 }), cfg.avisos_enviados);
});

caso('nenhum aviso cita placa', () => {
  const l = avisosPendentes({ cfg: CFG, gasto: 150, saldo: 0, mes: '2026-10', tokenInvalido: true, fila: 37 });
  for (const a of l) assert.ok(!/[A-Z]{3}\d[A-Z0-9]\d{2}/.test(a.texto + a.assunto));
});

console.log(`\n${passou} casos passaram`);
