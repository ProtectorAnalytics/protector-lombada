/**
 * Testes de lib/resposta-camera.js.
 * Uso: node test/resposta-camera.test.js
 */
const assert = require('node:assert');
const { respostaPlaca } = require('../lib/resposta-camera');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

caso('manda a câmera parar de retransmitir (Response_AlarmInfoPlate)', () => {
  const r = respostaPlaca({ id: 'x' });
  assert.strictEqual(r.Response_AlarmInfoPlate.content, 'retransfer_stop');
  assert.deepStrictEqual(r.Response_AlarmInfoPlate.serialData, []);
});

caso('nunca manda abrir cancela (info diferente de "ok")', () => {
  assert.notStrictEqual(respostaPlaca({}).Response_AlarmInfoPlate.info, 'ok');
});

caso('mantém os campos que já eram devolvidos', () => {
  const r = respostaPlaca({ id: 'abc', duplicado: true });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.id, 'abc');
  assert.strictEqual(r.duplicado, true);
});

console.log(`\n${passou} casos passaram`);
