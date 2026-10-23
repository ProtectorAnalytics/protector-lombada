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
    versao: '1.10.1',
    data: '2026-10-23',
    titulo: 'Login com verificação anti-robô para proteger as senhas',
    itens: Object.freeze([
      'O login do painel, da portaria e do administrador passa a confirmar que quem entra é uma pessoa, e não um robô tentando adivinhar senhas.',
      'Quase sempre a verificação é invisível. Se aparecer uma caixa de confirmação, é só clicar nela.',
      'O "Esqueci minha senha" ganhou a mesma proteção.',
    ]),
  });
});
