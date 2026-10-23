/**
 * novidades-atual.js — a versão publicada e o que ela trouxe.
 *
 * Fonte única do aviso "O que há de novo" que abre uma vez para todos os
 * usuários a cada versão. REGRA: toda atualização sobe `versao` aqui, no
 * package.json, nos rodapés/manuais e ganha um card em dashboard/novidades.html.
 * test/versao-novidades.test.js barra o deploy se algum desses não bater.
 *
 * Carregado no browser (window.novidadesAtual) e no Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.novidadesAtual = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  return Object.freeze({
    versao: '1.13.0',
    data: '2026-10-23',
    titulo: 'Filtrar passagens por tipo de cadastro e por unidade',
    itens: Object.freeze([
      'Em "Mais filtros", escolha o tipo de cadastro (morador, proprietário, visitante, prestador ou sem cadastro) e a unidade',
      'Vale o cadastro da hora da passagem, o mesmo que aparece na coluna "Cadastro"',
      'Clique no tipo ou na unidade de uma passagem para filtrar por eles',
    ]),
  });
});
