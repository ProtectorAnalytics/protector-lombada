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
    versao: '1.6.1',
    data: '2026-10-10',
    titulo: 'Câmeras novas sem leituras repetidas',
    itens: Object.freeze([
      'As câmeras de modelo mais novo deixam de reenviar a mesma leitura várias vezes.',
      'Passagens, Top 10 e relatórios ficam livres dessas repetições.',
      'Ainda nesta semana: números mais claros, busca completa e exportação do período inteiro (versão 1.6.0).',
    ]),
  });
});
