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
    versao: '1.14.0',
    data: '2026-10-23',
    titulo: 'Veículos do dia por tipo e nova lista de passagens',
    itens: Object.freeze([
      'Veículos do dia por tipo: o topo mostra quantos veículos diferentes passaram hoje e quantos são de moradores, proprietários, visitantes, prestadores ou sem cadastro; clique num tipo para filtrar a lista',
      'Nova lista de passagens: colunas Tipo, Nome e Unidade, só a hora (o dia vira um título), linha vermelha clara no alerta, o selo "2ª hoje" e o botão "+ Cadastrar" para placa sem cadastro',
      'Lista sem limite de 300: todas as passagens do período, página por página, com o total exato',
      'Exportação com tipo, nome e unidade: o Excel e o PDF trazem o cadastro da hora da passagem',
    ]),
  });
});
