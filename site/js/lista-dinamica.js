/**
 * lista-dinamica.js — regras puras da lista de passagens do painel do
 * síndico: quantas linhas cabem na altura útil da tabela e em que página
 * fica uma passagem quando o tamanho da página muda (a primeira linha
 * visível continua na tela depois de redimensionar).
 *
 * Nada aqui toca no DOM. Carregado no browser (window.listaDinamicaLib)
 * e no Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.listaDinamicaLib = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Folga para subpixel: 379,6 px com linha de 38 px cabe 10 linhas
  const FOLGA_PX = 0.5;

  const numeroValido = (v) => typeof v === 'number' && Number.isFinite(v);

  /** Linhas inteiras que cabem em `alturaUtil`, limitadas a [min, max]. */
  function linhasQueCabem(alturaUtil, alturaLinha, min, max) {
    if (!numeroValido(alturaUtil) || !numeroValido(alturaLinha) || alturaLinha <= 0) return min;
    const cabem = Math.floor((alturaUtil + FOLGA_PX) / alturaLinha);
    return Math.max(min, Math.min(max, cabem));
  }

  /** Página (1-based) que contém a passagem de índice `indice` (0-based). */
  function paginaQueContem(indice, porPagina) {
    if (!numeroValido(indice) || indice < 0 || !numeroValido(porPagina) || porPagina <= 0) return 1;
    return Math.floor(indice / porPagina) + 1;
  }

  /** Índice (0-based) da primeira passagem da página `pagina` (1-based). */
  function primeiroIndiceDaPagina(pagina, porPagina) {
    if (!numeroValido(pagina) || pagina < 1 || !numeroValido(porPagina) || porPagina <= 0) return 0;
    return (Math.floor(pagina) - 1) * porPagina;
  }

  /**
   * Conferência depois de desenhar uma página cheia: `sobra` é o espaço (px)
   * entre a última linha e o fim da área útil. Sobra de uma linha inteira ou
   * mais acrescenta linhas; linhas passando da área (sobra negativa) saem.
   * A altura real da linha pode diferir da usada no cálculo (fonte, zoom,
   * arredondamento): o que vale é o que ficou na tela.
   */
  function corrigirPelaSobra(linhas, sobra, alturaLinha, min, max) {
    if (!numeroValido(linhas) || !numeroValido(sobra) || !numeroValido(alturaLinha) || alturaLinha <= 0) return linhas;
    let novo = linhas;
    if (sobra < -FOLGA_PX) novo = linhas - Math.ceil((-sobra - FOLGA_PX) / alturaLinha);
    else novo = linhas + Math.floor((sobra + FOLGA_PX) / alturaLinha);
    return Math.max(min, Math.min(max, novo));
  }

  /**
   * Faixa da página no total EXATO do período (paginação no servidor):
   * página limitada a [1, totalPaginas]; `de`/`ate` são o .range() do
   * PostgREST (inclusivos, 0-based). Total 0 → página 1 sem linhas.
   */
  function faixaDaPagina(pagina, porPagina, total) {
    const n = numeroValido(total) && total > 0 ? Math.floor(total) : 0;
    const por = numeroValido(porPagina) && porPagina > 0 ? Math.floor(porPagina) : 1;
    const totalPaginas = Math.max(1, Math.ceil(n / por));
    const p = numeroValido(pagina) ? Math.min(Math.max(1, Math.floor(pagina)), totalPaginas) : 1;
    const inicio = n ? (p - 1) * por : 0;
    const fim = Math.min(inicio + por, n);
    return { pagina: p, totalPaginas, inicio, fim, de: inicio, ate: Math.max(inicio, fim - 1), vazia: fim === inicio };
  }

  const milhar = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  /** "1–10 de 1.234 passagens"; `aproximado` (conferência parcial) acrescenta "+". */
  function textoFaixa(faixa, total, aproximado) {
    if (!total) return 'Nenhuma passagem';
    const mais = aproximado ? '+' : '';
    const unidade = total === 1 && !aproximado ? 'passagem' : 'passagens';
    return `${milhar(faixa.inicio + 1)}–${milhar(faixa.fim)} de ${milhar(total)}${mais} ${unidade}`;
  }

  return Object.freeze({
    linhasQueCabem, paginaQueContem, primeiroIndiceDaPagina, corrigirPelaSobra, faixaDaPagina, textoFaixa,
  });
});
