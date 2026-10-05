/**
 * Testes de grafico-acessivel (site/js/grafico-acessivel.js).
 *
 * Os gráficos do painel e do admin são <canvas>: leitor de tela não enxerga
 * nada dentro deles. O módulo gera o resumo falado e a tabela equivalente.
 *
 * Uso: node test/grafico-acessivel.test.js
 */

const assert = require('node:assert');
const { resumoGrafico, linhasGrafico } = require('../site/js/grafico-acessivel');

let passou = 0;
function caso(nome, fn) {
  fn();
  passou++;
  console.log(`ok - ${nome}`);
}

caso('resumo traz título, total e o pico com o rótulo', () => {
  const r = resumoGrafico({
    titulo: 'Passagens por Hora',
    rotulos: ['00h', '01h', '02h'],
    valores: [3, 12, 5],
    unidade: 'passagens',
  });
  assert.strictEqual(r, 'Passagens por Hora. Total: 20 passagens. Maior valor: 12 passagens em 01h.');
});

caso('empate no pico cita o primeiro rótulo', () => {
  const r = resumoGrafico({ titulo: 'Alertas', rotulos: ['seg', 'ter'], valores: [4, 4], unidade: 'alertas' });
  assert.match(r, /Maior valor: 4 alertas em seg\.$/);
});

caso('sem dados diz que não há registros, sem citar pico', () => {
  const r = resumoGrafico({ titulo: 'Alertas', rotulos: ['seg', 'ter'], valores: [0, 0], unidade: 'alertas' });
  assert.strictEqual(r, 'Alertas. Nenhum registro no período.');
});

caso('total usa separador de milhar pt-BR', () => {
  const r = resumoGrafico({ titulo: 'X', rotulos: ['a', 'b'], valores: [1500, 900], unidade: 'passagens' });
  assert.match(r, /Total: 2\.400 passagens/);
});

caso('linhas pareiam rótulo e valor na ordem', () => {
  assert.deepStrictEqual(linhasGrafico(['a', 'b'], [1, 2]), [['a', 1], ['b', 2]]);
});

caso('linhas ignoram rótulo sem valor e valor sem rótulo', () => {
  assert.deepStrictEqual(linhasGrafico(['a', 'b', 'c'], [1, 2]), [['a', 1], ['b', 2]]);
  assert.deepStrictEqual(linhasGrafico(['a'], [1, 2]), [['a', 1]]);
});

console.log(`\n${passou} casos passaram`);
