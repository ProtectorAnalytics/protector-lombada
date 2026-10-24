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
    versao: '1.18.0',
    data: '2026-10-24',
    titulo: 'Quadro da portaria também no Mac',
    itens: Object.freeze([
      'O quadro da portaria agora também funciona no Mac: a mesma janela pequena, sempre por cima, com a última passagem na lombada ao vivo',
      'Para instalar, abra o menu da conta no painel, clique em "Quadro para o PC da portaria" e depois em "Baixar para Mac"',
      'A opção do menu do quadro agora se chama "Abrir ao ligar o computador" e vale para Windows e Mac',
    ]),
  });
});
