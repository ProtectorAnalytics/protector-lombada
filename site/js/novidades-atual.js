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
    versao: '1.11.0',
    data: '2026-10-23',
    titulo: 'Avisos por e-mail escolhidos no cadastro de usuários',
    itens: Object.freeze([
      'Escolha no cadastro de usuários quem recebe os alertas e o relatório',
      'Novo tipo de contato: Só recebe e-mail, sem acesso ao painel',
      'O porteiro pode corrigir nome, unidade e tipo dos cadastros que ele fez',
    ]),
  });
});
