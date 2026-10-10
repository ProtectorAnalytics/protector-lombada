/**
 * Testes de lib/veiculo-parado.js.
 * Uso: node test/veiculo-parado.test.js
 */
const assert = require('node:assert');
const {
  decidirMesmoEvento, JANELA_RETRANSMISSAO_MINUTOS, JANELA_PARADO_MINUTOS,
} = require('../lib/veiculo-parado');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

const AGORA = Date.parse('2026-10-10T12:00:00Z');
const minutosAtras = (m) => new Date(AGORA - m * 60 * 1000).toISOString();

caso('sem captura anterior com o mesmo vehicleId: grava', () => {
  assert.strictEqual(decidirMesmoEvento(null, { placa: 'SJW0G75', velocidade: 0 }, AGORA), 'gravar');
});

caso('reenvio dentro da janela de retransmissão: descarta mesmo com placa diferente', () => {
  const anterior = { placa: 'SJW0G75', velocidade: 0, timestamp: minutosAtras(2) };
  assert.strictEqual(decidirMesmoEvento(anterior, { placa: 'SJW0G76', velocidade: 0 }, AGORA), 'retransmissao');
});

caso('carro parado no quadro: mesma placa e vehicleId 10 min depois é descartado', () => {
  const anterior = { placa: 'SJW0G75', velocidade: 0, timestamp: minutosAtras(10.2) };
  assert.strictEqual(decidirMesmoEvento(anterior, { placa: 'SJW0G75', velocidade: 0 }, AGORA), 'parado');
});

caso('carro parado horas depois ainda é o mesmo evento', () => {
  const anterior = { placa: 'SJW0G75', velocidade: 0, timestamp: minutosAtras(15 * 60) };
  assert.strictEqual(decidirMesmoEvento(anterior, { placa: 'SJW0G75', velocidade: 0 }, AGORA), 'parado');
});

caso('mesma placa em grafia antiga e Mercosul conta como a mesma', () => {
  const anterior = { placa: 'ABC1234', velocidade: 0, timestamp: minutosAtras(30) };
  assert.strictEqual(decidirMesmoEvento(anterior, { placa: 'ABC1C34', velocidade: 0 }, AGORA), 'parado');
});

caso('vehicleId repetido com placa diferente (contador reiniciou): grava', () => {
  const anterior = { placa: 'SJW0G75', velocidade: 0, timestamp: minutosAtras(60) };
  assert.strictEqual(decidirMesmoEvento(anterior, { placa: 'RPA7I88', velocidade: 14 }, AGORA), 'gravar');
});

caso('sem placa não confirma que é o mesmo carro: grava', () => {
  const anterior = { placa: 'SEM PLACA', velocidade: 0, timestamp: minutosAtras(30) };
  assert.strictEqual(decidirMesmoEvento(anterior, { placa: 'SEM PLACA', velocidade: 0 }, AGORA), 'gravar');
});

caso('parado sem velocidade e a nova leitura com velocidade: grava a medida', () => {
  const anterior = { placa: 'SJW0G75', velocidade: 0, timestamp: minutosAtras(40) };
  assert.strictEqual(decidirMesmoEvento(anterior, { placa: 'SJW0G75', velocidade: 18 }, AGORA), 'gravar');
});

caso('anterior fora da janela de parado: grava', () => {
  const anterior = { placa: 'SJW0G75', velocidade: 0, timestamp: minutosAtras(JANELA_PARADO_MINUTOS + 1) };
  assert.strictEqual(decidirMesmoEvento(anterior, { placa: 'SJW0G75', velocidade: 0 }, AGORA), 'gravar');
});

caso('janelas: retransmissão curta, parado de 24 h', () => {
  assert.strictEqual(JANELA_RETRANSMISSAO_MINUTOS, 10);
  assert.strictEqual(JANELA_PARADO_MINUTOS, 24 * 60);
});

console.log(`\n${passou} casos ok`);
