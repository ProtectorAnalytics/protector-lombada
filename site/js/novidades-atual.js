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
    versao: '1.19.0',
    data: '2026-10-24',
    titulo: 'Quadro da portaria mais fácil de usar',
    itens: Object.freeze([
      'O quadro agora arrasta segurando em qualquer lugar da janela, e clicar nele não abre mais o site sem querer',
      'Para abrir o painel completo, use o novo botão ↗ no topo do quadro (ou o menu ⋮)',
      'Tela de entrada do quadro renovada: o usuário já vem preenchido e dá para ver a senha digitada',
      'O programa do quadro (Windows e Mac) passa a se atualizar sozinho; quem já instalou precisa baixar uma última vez pelo painel',
    ]),
  });
});
