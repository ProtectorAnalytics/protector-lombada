/**
 * Testes de site/js/placa.js.
 * Uso: node test/placa.test.js
 */
const assert = require('node:assert');
const { limpar, paraMercosul, paraAntiga, difereEmUm, variantes } = require('../site/js/placa');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

caso('limpar tira hífen, espaço e minúsculas', () => {
  assert.strictEqual(limpar(' abc-1d23 '), 'ABC1D23');
  assert.strictEqual(limpar(null), '');
});

caso('limpar descarta ß e ligaduras antes de maiusculizar (F9)', () => {
  assert.strictEqual(limpar('ß'), '');
  assert.strictEqual(limpar('ﬁ'), '');
  // são descartados como hífen/espaço, não viram letras ('SS', 'FI')
  assert.strictEqual(paraMercosul('ABßC1D23'), 'ABC1D23');
  assert.strictEqual(paraMercosul('ABCﬁ1D23'), 'ABC1D23');
  assert.strictEqual(limpar('abc-1d23'), 'ABC1D23');
});

caso('antiga vira Mercosul pela 5ª posição (0=A … 9=J)', () => {
  assert.strictEqual(paraMercosul('ABC1234'), 'ABC1C34');
  assert.strictEqual(paraMercosul('ABC1034'), 'ABC1A34');
  assert.strictEqual(paraMercosul('ABC1934'), 'ABC1J34');
});

caso('Mercosul continua Mercosul', () => {
  assert.strictEqual(paraMercosul('abc1d23'), 'ABC1D23');
});

caso('formato inválido devolve null', () => {
  assert.strictEqual(paraMercosul('AB12'), null);
  assert.strictEqual(paraMercosul('1234567'), null);
  assert.strictEqual(paraAntiga(''), null);
});

caso('Mercosul A–J tem forma antiga; K–Z não', () => {
  assert.strictEqual(paraAntiga('ABC1C34'), 'ABC1234');
  assert.strictEqual(paraAntiga('ABC1234'), 'ABC1234');
  assert.strictEqual(paraAntiga('ABC1K34'), null);
});

caso('difereEmUm só aceita exatamente 1 diferença no mesmo tamanho', () => {
  assert.strictEqual(difereEmUm('ABC1D23', 'A8C1D23'), true);
  assert.strictEqual(difereEmUm('ABC1D23', 'ABC1D23'), false);
  assert.strictEqual(difereEmUm('ABC1D23', 'XBC1D24'), false);
  assert.strictEqual(difereEmUm('ABC1D23', 'ABC1D2'), false);
});

caso('variantes cobrem troca de letra, de dígito e da 5ª posição, nas duas grafias', () => {
  const v = variantes('ABC1C34');
  assert.ok(v.includes('XBC1C34'));   // letra
  assert.ok(v.includes('ABC2C34'));   // dígito
  assert.ok(v.includes('ABC1D34'));   // 5ª posição (Mercosul)
  assert.ok(v.includes('ABC1334'));   // 5ª posição (antiga de ABC1D34)
  assert.ok(v.includes('XBC1234'));   // antiga de XBC1C34
  assert.ok(!v.includes('ABC1C34'));
  assert.ok(!v.includes('ABC1234'));  // é a mesma placa, não variante
  assert.ok(v.every((p) => /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(p)));
});

caso('variantes de placa inválida é lista vazia', () => {
  assert.deepStrictEqual(variantes('???'), []);
});

console.log(`\n${passou} casos passaram`);
