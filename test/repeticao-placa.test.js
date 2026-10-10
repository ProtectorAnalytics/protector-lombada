/**
 * Testes de lib/repeticao-placa.js.
 * Uso: node test/repeticao-placa.test.js
 */
const assert = require('node:assert');
const {
  decidirRepeticao, placaParaRepeticao, caracteresDiferentes, ehMesmaLeitura, acharRepeticao,
  JANELA_SEGUNDOS, MAX_CARACTERES_DIFERENTES,
} = require('../lib/repeticao-placa');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

caso('sem passagem anterior na janela: grava', () => {
  assert.strictEqual(decidirRepeticao(null, { velocidade: 12 }), 'gravar');
});

caso('repetição sem velocidade depois de uma medida: descarta (12 → 0)', () => {
  assert.strictEqual(decidirRepeticao({ velocidade: 12 }, { velocidade: 0 }), 'descartar');
});

caso('repetição com velocidade depois de uma medida: descarta e vale a primeira (15 → 10)', () => {
  assert.strictEqual(decidirRepeticao({ velocidade: 15 }, { velocidade: 10 }), 'descartar');
});

caso('duas leituras sem velocidade: descarta a segunda (0 → 0)', () => {
  assert.strictEqual(decidirRepeticao({ velocidade: 0 }, { velocidade: 0 }), 'descartar');
});

caso('primeira sem velocidade e a repetição com velocidade: a medida substitui a primeira (0 → 14)', () => {
  assert.strictEqual(decidirRepeticao({ velocidade: 0 }, { velocidade: 14 }), 'substituir');
});

caso('velocidade inválida conta como sem velocidade', () => {
  assert.strictEqual(decidirRepeticao({ velocidade: 0 }, { velocidade: 0, velocidadeInvalida: true }), 'descartar');
  assert.strictEqual(
    decidirRepeticao({ velocidade: 0, velocidade_invalida: true }, { velocidade: 20 }),
    'substituir',
  );
});

caso('placa válida vira a grafia Mercosul para comparar', () => {
  assert.strictEqual(placaParaRepeticao('ABC1234'), 'ABC1C34');
  assert.strictEqual(placaParaRepeticao('abc1d23'), 'ABC1D23');
});

caso('"Sem Placa" e textos que não são placa não entram na regra', () => {
  assert.strictEqual(placaParaRepeticao('SEM PLACA'), null);
  assert.strictEqual(placaParaRepeticao('Sem Placa'), null);
  assert.strictEqual(placaParaRepeticao(''), null);
  assert.strictEqual(placaParaRepeticao(null), null);
});

caso('janela de 20 segundos (maior intervalo medido entre repetições: ~21 s)', () => {
  assert.strictEqual(JANELA_SEGUNDOS, 20);
});

caso('placas iguais nas duas grafias: 0 caracteres de diferença', () => {
  assert.strictEqual(caracteresDiferentes('SJW0675', 'SJW0G75'), 0);
});

caso('Fox do Praia Bella (10/10): NTH0645, NTM0C45 e NTM0646 são a mesma leitura', () => {
  assert.ok(ehMesmaLeitura('NTH0645', 'NTM0C45'));
  assert.ok(ehMesmaLeitura('NTM0C45', 'NTM0646'));
  assert.ok(ehMesmaLeitura('NTH0645', 'NTM0646'));
});

caso('SUV do Praia Bella (10/10): IMW1C73 e THW1C73 são a mesma leitura', () => {
  assert.ok(ehMesmaLeitura('IMW1C73', 'THW1C73'));
});

caso('3 ou mais caracteres diferentes: carros diferentes', () => {
  assert.strictEqual(MAX_CARACTERES_DIFERENTES, 2);
  assert.ok(!ehMesmaLeitura('ABC1D23', 'XYZ1D23'));
  assert.ok(!ehMesmaLeitura('QTU5G71', 'RPF5H18'));
});

caso('"Sem Placa" nunca é repetição de nada', () => {
  assert.strictEqual(caracteresDiferentes('SEM PLACA', 'ABC1D23'), null);
  assert.ok(!ehMesmaLeitura('SEM PLACA', 'SEM PLACA'));
});

caso('acharRepeticao pega a mais recente parecida e ignora as outras placas', () => {
  const recentes = [
    { id: 3, placa: 'RPV5J48' },
    { id: 2, placa: 'NTM0C45' },
    { id: 1, placa: 'NTH0645' },
  ];
  assert.strictEqual(acharRepeticao(recentes, 'NTM0646').id, 2);
  assert.strictEqual(acharRepeticao(recentes, 'QTU5G71'), null);
  assert.strictEqual(acharRepeticao([], 'NTM0646'), null);
  assert.strictEqual(acharRepeticao(null, 'NTM0646'), null);
});

console.log(`\n${passou} casos passaram`);
