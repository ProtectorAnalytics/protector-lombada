/**
 * Testes de lib/diagnostico-json.js.
 * Uso: node test/diagnostico-json.test.js
 */
const assert = require('node:assert');
const { resumirCorpoInvalido } = require('../lib/diagnostico-json');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

function erroDe(body) {
  try { JSON.parse(body); } catch (e) { return e; }
  throw new Error('o corpo de teste deveria ser inválido');
}

caso('troca base64 longo por marcador com o tamanho', () => {
  const foto = 'A'.repeat(5000);
  const body = `{"AlarmInfoPlate":{"imageFile":"${foto}","license":"ABC1D23",}}`;
  const r = resumirCorpoInvalido(body, erroDe(body));
  assert.ok(!r.inicio.includes('AAAAAAAAAA'));
  assert.ok(r.inicio.includes('<base64 5000>'));
  assert.ok(r.trecho_erro.includes('"ABC1D23",}'));
});

caso('informa tamanho e mensagem do parser', () => {
  const body = '{"a":1';
  const r = resumirCorpoInvalido(body, erroDe(body));
  assert.strictEqual(r.tamanho, 6);
  assert.ok(r.erro_parser.length > 0);
});

caso('corpo vazio não quebra', () => {
  const r = resumirCorpoInvalido('', erroDe(''));
  assert.strictEqual(r.tamanho, 0);
  assert.strictEqual(r.inicio, '');
});

caso('limita o tamanho dos trechos', () => {
  const body = `{"x":"${'é texto '.repeat(2000)}`;
  const r = resumirCorpoInvalido(body, erroDe(body));
  assert.ok(r.inicio.length <= 600);
  assert.ok(r.fim.length <= 400);
  assert.ok(r.trecho_erro.length <= 600);
});

console.log(`\n${passou} casos passaram`);
