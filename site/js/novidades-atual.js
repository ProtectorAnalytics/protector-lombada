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
    versao: '1.16.1',
    data: '2026-10-24',
    titulo: 'Entrada com o quadro "não sou um robô" à vista',
    itens: Object.freeze([
      'Na tela de entrada, o quadro "não sou um robô" agora aparece sempre; na maioria das vezes ele confirma sozinho e, quando pedir, basta um clique',
      'Se a confirmação falhar, a mensagem mostra um código (ex.: "código 600010"); mande uma foto da tela para o suporte, que o código indica a causa',
    ]),
  });
});
