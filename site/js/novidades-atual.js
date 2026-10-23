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
    versao: '1.11.1',
    data: '2026-10-23',
    titulo: 'Confirmações na própria tela e exclusão de cliente mais segura',
    itens: Object.freeze([
      'Confirmações e avisos do painel aparecem na própria tela, sem janelas do navegador',
      'Ao encerrar o vínculo de uma placa, a placa aparece em destaque na confirmação',
      'Exclusão de condomínio é feita de uma só vez: se algo falhar, nada é apagado',
    ]),
  });
});
