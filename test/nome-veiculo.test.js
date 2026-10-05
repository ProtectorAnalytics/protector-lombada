/**
 * Regra única do nome do veículo (painel + PDF). Uso: node test/nome-veiculo.test.js
 */
const assert = require('node:assert');
const { nomeVeiculo, linhaVeiculo } = require('../site/js/nome-veiculo');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

caso('versão que começa com o modelo usa só a versão (sem diferenciar caixa)', () => {
  assert.strictEqual(nomeVeiculo({ marca: 'VW', modelo: 'Gol', versao: 'GOL 1.0' }), 'VW GOL 1.0');
});
caso('modelo que contém a versão usa só o modelo', () => {
  assert.strictEqual(nomeVeiculo({ marca: 'JEEP', modelo: 'COMMANDER OVR T270', versao: 'commander' }), 'JEEP COMMANDER OVR T270');
});
caso('modelo e versão distintos são concatenados', () => {
  assert.strictEqual(nomeVeiculo({ marca: 'FIAT', modelo: 'STRADA', versao: 'ULTRA T200AT' }), 'FIAT STRADA ULTRA T200AT');
});
caso('espaços nas pontas não atrapalham', () => {
  assert.strictEqual(nomeVeiculo({ marca: 'VW', modelo: ' GOL ', versao: ' GOL 1.0 ' }), 'VW GOL 1.0');
});
caso('sem modelo nem versão fica só a marca; sem nada, vazio', () => {
  assert.strictEqual(nomeVeiculo({ marca: 'VW' }), 'VW');
  assert.strictEqual(nomeVeiculo(null), '');
});
caso('linha completa com cor e ano', () => {
  assert.strictEqual(linhaVeiculo({ status: 'consultado', marca: 'VW', modelo: 'GOL', versao: 'GOL 1.0', cor: 'Branca', ano_modelo: 2021 }),
    'Veículo: VW GOL 1.0 · Branca · 2021');
});
caso('sem dado consultado não há linha', () => {
  assert.strictEqual(linhaVeiculo({ status: 'suspeita', marca: 'VW' }), null);
  assert.strictEqual(linhaVeiculo(undefined), null);
});
caso('o PDF do servidor usa a mesma função', () => {
  assert.strictEqual(require('../lib/pdf-generator').nomeVeiculo, nomeVeiculo);
});

console.log(`\n${passou} casos passaram`);
