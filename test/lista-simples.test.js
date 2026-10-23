/**
 * parseLinhas (lib/lista-simples): texto colado → itens únicos.
 * Uso: node test/lista-simples.test.js
 */
const assert = require('node:assert');
const { parseLinhas } = require('../lib/lista-simples');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

caso('apara, junta espaços, some linhas vazias e duplicadas sem diferenciar maiúsculas', () => {
  const r = parseLinhas('Bloco 2 · 302\n\n bloco 2 · 302 \nCasa 7');
  assert.deepStrictEqual(r.itens, ['Bloco 2 · 302', 'Casa 7']);
  assert.deepStrictEqual(r.ignoradas, []);
});
caso('espaços repetidos viram um e CRLF funciona', () => {
  assert.deepStrictEqual(parseLinhas('Casa    7\r\nCasa 8').itens, ['Casa 7', 'Casa 8']);
});
caso('linha com 61 caracteres vai para ignoradas; 60 passa', () => {
  const r = parseLinhas(`${'a'.repeat(61)}\n${'b'.repeat(60)}`);
  assert.deepStrictEqual(r.itens, ['b'.repeat(60)]);
  assert.deepStrictEqual(r.ignoradas, ['a'.repeat(61)]);
});
caso('501 itens distintos → lança "Máximo de 500 linhas"', () => {
  const texto = Array.from({ length: 501 }, (_, i) => `Casa ${i}`).join('\n');
  assert.throws(() => parseLinhas(texto), { message: 'Máximo de 500 linhas' });
});
caso('500 itens passam', () => {
  const texto = Array.from({ length: 500 }, (_, i) => `Casa ${i}`).join('\n');
  assert.strictEqual(parseLinhas(texto).itens.length, 500);
});
caso('entrada que não é texto → vazio', () => {
  assert.deepStrictEqual(parseLinhas(undefined), { itens: [], ignoradas: [] });
  assert.deepStrictEqual(parseLinhas(42), { itens: [], ignoradas: [] });
});
console.log(`${passou} casos`);
