/**
 * Escape de HTML do painel. Uso: node test/texto-seguro.test.js
 */
const assert = require('node:assert');
const { esc } = require('../site/js/texto-seguro');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

caso('neutraliza tags e atributos', () => {
  assert.strictEqual(esc('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
caso('aspas simples também (usadas em onclick)', () => {
  assert.strictEqual(esc("O'Neil"), 'O&#39;Neil');
});
caso('e comercial vira entidade', () => {
  assert.strictEqual(esc('A & B'), 'A &amp; B');
});
caso('null, undefined e números', () => {
  assert.strictEqual(esc(null), '');
  assert.strictEqual(esc(undefined), '');
  assert.strictEqual(esc(0), '0');
});

console.log(`\n${passou} casos passaram`);
