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
    versao: '1.8.0',
    data: '2026-10-22',
    titulo: 'Tipo de pessoa em cada veículo',
    itens: Object.freeze([
      'Cada veículo agora tem um tipo (Morador, Proprietário, Visitante ou Prestador), com ícone e cor próprios.',
      'Quando um carro troca de dono, como um carro alugado, cada passagem mostra quem era o responsável naquele dia.',
      'O cadastro de veículos tem uma lista de unidades do condomínio para escolher.',
      'Nova aba Portaria no administrador, com acesso próprio para os porteiros.',
    ]),
  });
});
