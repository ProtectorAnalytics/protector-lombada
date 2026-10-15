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
    versao: '1.7.0',
    data: '2026-10-14',
    titulo: 'Maiores velocidades dos últimos 6 meses',
    itens: Object.freeze([
      'Novo quadro abaixo do Top 10 Placas: os 10 veículos mais rápidos dos últimos 6 meses, com a velocidade e o dia de cada um.',
      'Clique em uma placa do quadro para ver as passagens dela naquele dia.',
      'A equipe Protector pode abrir o seu painel para ajudar no cadastro de veículos. Cada acesso fica registrado.',
    ]),
  });
});
