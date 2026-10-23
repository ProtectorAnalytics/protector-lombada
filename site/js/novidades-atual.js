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
    versao: '1.10.0',
    data: '2026-10-23',
    titulo: 'Login próprio para cada porteiro e unidades em massa',
    itens: Object.freeze([
      'Cada porteiro agora tem login próprio.',
      'Cadastre unidades em massa por bloco, torre ou quadra, com o tipo da unidade, inclusive FIP (Fração Ideal).',
      'Planilha de unidades para importar e exportar.',
      'Esqueceu a senha? O porteiro pede ao síndico ou à Protector.',
    ]),
  });
});
