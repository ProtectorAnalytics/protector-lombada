/**
 * Placa no NOME DO ARQUIVO da foto: só [A-Z0-9]. A placa gravada na captura
 * não muda; isto vale só para o caminho no Storage (e nomes de download).
 * Uso: node test/placa-arquivo.test.js
 */
const assert = require('node:assert');
const { placaParaArquivo } = require('../lib/validators');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

caso('placa normal passa igual', () => {
  assert.strictEqual(placaParaArquivo('ABC1D23'), 'ABC1D23');
  assert.strictEqual(placaParaArquivo('ABC1234'), 'ABC1234');
});
caso('travessia de pasta não sobra no nome', () => {
  assert.strictEqual(placaParaArquivo('../x'), 'X');
  assert.strictEqual(placaParaArquivo('../../outro-cliente/ABC'), 'OUTROCLIENTEABC');
});
caso('barra, hífen e espaço saem', () => {
  assert.strictEqual(placaParaArquivo('ABC/1D23'), 'ABC1D23');
  assert.strictEqual(placaParaArquivo(' abc-1234 '), 'ABC1234');
});
caso('vazio ou só símbolos vira SEMPLACA', () => {
  assert.strictEqual(placaParaArquivo(''), 'SEMPLACA');
  assert.strictEqual(placaParaArquivo('../'), 'SEMPLACA');
  assert.strictEqual(placaParaArquivo(null), 'SEMPLACA');
  assert.strictEqual(placaParaArquivo(undefined), 'SEMPLACA');
});
caso('acento e caractere fora de A-Z0-9 saem', () => {
  assert.strictEqual(placaParaArquivo('ÇÃO1\u0000%2E'), 'O12E');
});

console.log(`\n${passou} casos ok`);
