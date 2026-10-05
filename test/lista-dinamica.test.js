/**
 * Lista de passagens dinâmica: quantas linhas cabem na altura útil e em que
 * página fica uma passagem quando o tamanho da página muda.
 * Uso: node test/lista-dinamica.test.js
 */
const assert = require('node:assert');
const { linhasQueCabem, paginaQueContem, primeiroIndiceDaPagina, corrigirPelaSobra } = require('../site/js/lista-dinamica');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

// ---- linhasQueCabem
caso('conta as linhas inteiras que cabem na altura útil', () => {
  assert.strictEqual(linhasQueCabem(380, 38, 5, 50), 10);
  assert.strictEqual(linhasQueCabem(399, 38, 5, 50), 10);
  assert.strictEqual(linhasQueCabem(418, 38, 5, 50), 11);
});
caso('nunca fica abaixo do mínimo', () => {
  assert.strictEqual(linhasQueCabem(60, 38, 5, 50), 5);
  assert.strictEqual(linhasQueCabem(0, 38, 5, 50), 5);
});
caso('nunca passa do máximo', () => {
  assert.strictEqual(linhasQueCabem(10000, 38, 5, 50), 50);
});
caso('altura ou linha inválida devolve o mínimo', () => {
  assert.strictEqual(linhasQueCabem(NaN, 38, 5, 50), 5);
  assert.strictEqual(linhasQueCabem(400, 0, 5, 50), 5);
  assert.strictEqual(linhasQueCabem(400, -3, 5, 50), 5);
  assert.strictEqual(linhasQueCabem(undefined, 38, 5, 50), 5);
});
caso('tolera arredondamento de subpixel (379,6 px cabe 10 de 38)', () => {
  assert.strictEqual(linhasQueCabem(379.6, 38, 5, 50), 10);
});

// ---- paginaQueContem (índice 0-based, página 1-based)
caso('primeira passagem fica na página 1', () => {
  assert.strictEqual(paginaQueContem(0, 14), 1);
  assert.strictEqual(paginaQueContem(13, 14), 1);
});
caso('passagem 14 com 14 por página vai para a página 2', () => {
  assert.strictEqual(paginaQueContem(14, 14), 2);
});
caso('mudar o tamanho mantém a primeira linha visível na página certa', () => {
  // estava na página 3 com 14 por página: primeira linha visível = índice 28
  const primeira = primeiroIndiceDaPagina(3, 14);
  assert.strictEqual(primeira, 28);
  assert.strictEqual(paginaQueContem(primeira, 10), 3); // 20..29
  assert.strictEqual(paginaQueContem(primeira, 20), 2); // 20..39
  assert.strictEqual(paginaQueContem(primeira, 5), 6);  // 25..29
});
caso('índice ou tamanho inválido cai na página 1', () => {
  assert.strictEqual(paginaQueContem(-1, 10), 1);
  assert.strictEqual(paginaQueContem(NaN, 10), 1);
  assert.strictEqual(paginaQueContem(5, 0), 1);
});

// ---- primeiroIndiceDaPagina
caso('primeiro índice da página (1-based) e entrada inválida', () => {
  assert.strictEqual(primeiroIndiceDaPagina(1, 14), 0);
  assert.strictEqual(primeiroIndiceDaPagina(2, 14), 14);
  assert.strictEqual(primeiroIndiceDaPagina(0, 14), 0);
  assert.strictEqual(primeiroIndiceDaPagina(NaN, 14), 0);
});

// ---- corrigirPelaSobra (conferência depois de desenhar a página cheia)
caso('sobra de uma linha inteira ou mais acrescenta linhas', () => {
  assert.strictEqual(corrigirPelaSobra(10, 38, 38, 5, 50), 11);
  assert.strictEqual(corrigirPelaSobra(10, 80, 38, 5, 50), 12);
});
caso('sobra menor que uma linha mantém o número', () => {
  assert.strictEqual(corrigirPelaSobra(10, 0, 38, 5, 50), 10);
  assert.strictEqual(corrigirPelaSobra(10, 37, 38, 5, 50), 10);
});
caso('tolera subpixel (37,6 px com linha de 38 cabe mais uma)', () => {
  assert.strictEqual(corrigirPelaSobra(10, 37.6, 38, 5, 50), 11);
});
caso('linhas passando da área (sobra negativa) tiram o excedente', () => {
  assert.strictEqual(corrigirPelaSobra(10, -1, 38, 5, 50), 9);
  assert.strictEqual(corrigirPelaSobra(10, -38, 38, 5, 50), 9);
  assert.strictEqual(corrigirPelaSobra(10, -39, 38, 5, 50), 8);
  assert.strictEqual(corrigirPelaSobra(10, -0.4, 38, 5, 50), 10);
});
caso('respeita mínimo e máximo', () => {
  assert.strictEqual(corrigirPelaSobra(6, -200, 38, 5, 50), 5);
  assert.strictEqual(corrigirPelaSobra(49, 500, 38, 5, 50), 50);
});
caso('entrada inválida mantém o número atual', () => {
  assert.strictEqual(corrigirPelaSobra(10, NaN, 38, 5, 50), 10);
  assert.strictEqual(corrigirPelaSobra(10, 50, 0, 5, 50), 10);
  assert.strictEqual(corrigirPelaSobra(10, undefined, 38, 5, 50), 10);
});

console.log(`\n${passou} casos ok`);
