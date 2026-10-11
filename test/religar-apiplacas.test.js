/**
 * Religar a consulta da APIPLACAS sozinho depois da recarga.
 * Uso: node test/religar-apiplacas.test.js
 */
const assert = require('node:assert');
const { deveReligar } = require('../lib/religar-apiplacas');

let passou = 0;
let falhou = 0;
function caso(nome, fn) {
  try { fn(); passou++; console.log(`ok - ${nome}`); }
  catch (e) { falhou++; console.log(`FALHOU - ${nome}\n  ${e.message}`); }
}

const desligadoPeloSistema = { ativo: false, atualizado_por: null };

caso('religa quando o sistema desligou por recusa (402) e o saldo voltou', () => {
  assert.strictEqual(deveReligar({ cfg: desligadoPeloSistema, saldo: 1000, ultimoResultado: 'token_invalido' }), true);
});

caso('não religa sem saldo positivo (recarga ainda não caiu)', () => {
  for (const saldo of [0, -1, null, undefined]) {
    assert.strictEqual(deveReligar({ cfg: desligadoPeloSistema, saldo, ultimoResultado: 'token_invalido' }), false, String(saldo));
  }
});

caso('não religa o que um administrador desligou', () => {
  const cfg = { ativo: false, atualizado_por: 'uuid-do-admin' };
  assert.strictEqual(deveReligar({ cfg, saldo: 1000, ultimoResultado: 'token_invalido' }), false);
});

caso('não religa se o desligamento não veio de recusa da APIPLACAS', () => {
  assert.strictEqual(deveReligar({ cfg: desligadoPeloSistema, saldo: 1000, ultimoResultado: 'ok' }), false);
  assert.strictEqual(deveReligar({ cfg: desligadoPeloSistema, saldo: 1000, ultimoResultado: null }), false);
});

caso('já ligado não precisa religar', () => {
  assert.strictEqual(deveReligar({ cfg: { ativo: true, atualizado_por: null }, saldo: 1000, ultimoResultado: 'token_invalido' }), false);
});

console.log(`\n${passou} ok, ${falhou} falhou`);
if (falhou) process.exit(1);
