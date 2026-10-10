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
    versao: '1.6.2',
    data: '2026-10-10',
    titulo: 'Mesmo carro não vira duas passagens',
    itens: Object.freeze([
      'Quando a câmera lê a mesma placa duas ou três vezes em poucos segundos, trocando uma ou duas letras, agora conta uma passagem só.',
      'Fica a leitura que trouxe a velocidade medida.',
    ]),
  });
});
