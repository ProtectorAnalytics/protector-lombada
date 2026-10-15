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
    versao: '1.7.1',
    data: '2026-10-15',
    titulo: 'Passagens antigas apagadas no prazo',
    itens: Object.freeze([
      'As passagens com mais de 6 meses voltam a ser apagadas todo dia, como manda a política de privacidade (LGPD).',
      'A equipe Protector passa a receber por e-mail o aviso de câmera sem sinal.',
    ]),
  });
});
