/**
 * Linha "Veículo: …" da notificação. Uso: node test/pdf-veiculo.test.js
 */
const assert = require('node:assert');
const { linhaVeiculo, nomeVeiculo } = require('../lib/pdf-generator');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

caso('monta marca, modelo, versão, cor e ano', () => {
  assert.strictEqual(
    linhaVeiculo({ status: 'consultado', marca: 'JEEP', modelo: 'COMMANDER', versao: 'OVR T270', cor: 'Dourada', ano_modelo: 2022 }),
    'Veículo: JEEP COMMANDER OVR T270 · Dourada · 2022');
});

caso('sem versão nem ano omite as partes', () => {
  assert.strictEqual(linhaVeiculo({ status: 'consultado', marca: 'VW', modelo: 'GOL', cor: 'Branca' }), 'Veículo: VW GOL · Branca');
});

caso('versão que repete o modelo não duplica', () => {
  assert.strictEqual(linhaVeiculo({ status: 'consultado', marca: 'VW', modelo: 'CROSSFOX', versao: 'CROSSFOX', cor: 'Prata', ano_modelo: 2008 }),
    'Veículo: VW CROSSFOX · Prata · 2008');
});

caso('sem dado consultado não há linha', () => {
  assert.strictEqual(linhaVeiculo(null), null);
  assert.strictEqual(linhaVeiculo({ status: 'pendente' }), null);
  assert.strictEqual(linhaVeiculo({ status: 'suspeita', marca: 'X' }), null);
});

caso('versão que começa com o modelo usa só a versão', () => {
  assert.strictEqual(linhaVeiculo({ status: 'consultado', marca: 'VW', modelo: 'GOL', versao: 'GOL 1.0', cor: 'Branca', ano_modelo: 2021 }),
    'Veículo: VW GOL 1.0 · Branca · 2021');
});

caso('modelo que já contém a versão usa só o modelo', () => {
  assert.strictEqual(nomeVeiculo({ marca: 'JEEP', modelo: 'COMMANDER OVR T270', versao: 'COMMANDER' }), 'JEEP COMMANDER OVR T270');
});

caso('modelo e versão distintos são concatenados', () => {
  assert.strictEqual(nomeVeiculo({ marca: 'FIAT', modelo: 'STRADA', versao: 'ULTRA T200AT' }), 'FIAT STRADA ULTRA T200AT');
});

console.log(`\n${passou} casos passaram`);
