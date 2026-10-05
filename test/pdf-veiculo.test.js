/**
 * Linha "Veículo: …" da notificação. Uso: node test/pdf-veiculo.test.js
 */
const assert = require('node:assert');
const { linhaVeiculo } = require('../lib/pdf-generator');

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

console.log(`\n${passou} casos passaram`);
