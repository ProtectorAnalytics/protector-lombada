/**
 * Testes de lib/repeticao-placa.js.
 * Uso: node test/repeticao-placa.test.js
 */
const assert = require('node:assert');
const { decidirRepeticao, placaParaRepeticao, JANELA_SEGUNDOS } = require('../lib/repeticao-placa');

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

caso('primeira sem velocidade e a repetição com velocidade: grava a medida (0 → 14)', () => {
  assert.strictEqual(decidirRepeticao({ velocidade: 0 }, { velocidade: 14 }), 'gravar');
});

caso('velocidade inválida conta como sem velocidade', () => {
  assert.strictEqual(decidirRepeticao({ velocidade: 0 }, { velocidade: 0, velocidadeInvalida: true }), 'descartar');
  assert.strictEqual(
    decidirRepeticao({ velocidade: 0, velocidade_invalida: true }, { velocidade: 20 }),
    'gravar',
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

console.log(`\n${passou} casos passaram`);
