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
    versao: '1.19.1',
    data: '2026-10-24',
    titulo: 'Baixar o quadro pelo site e ícone novo',
    itens: Object.freeze([
      'O quadro da portaria agora também pode ser baixado no rodapé do site lombada.appps.com.br, com um link para Windows e outro para Mac',
      'Ícone novo na aba do navegador: o escudo da Protector, legível em abas claras e escuras',
    ]),
  });
});
