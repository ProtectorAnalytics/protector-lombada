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
    versao: '1.12.0',
    data: '2026-10-23',
    titulo: 'Editar o cadastro da placa e ver o histórico de alterações',
    itens: Object.freeze([
      'Editar o cadastro da placa direto nos detalhes da passagem e na lista de veículos',
      'Histórico de alterações: veja quem cadastrou, alterou ou encerrou cada placa, e o que mudou',
      'Síndico, operador e equipe Protector podem corrigir tipo, nome, unidade, marca e cor',
    ]),
  });
});
