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
    versao: '1.9.0',
    data: '2026-10-22',
    titulo: 'Cadastro pela portaria, direto do celular',
    itens: Object.freeze([
      'Nova página da portaria: o porteiro lê a placa com a câmera do celular e cadastra o carro em poucos toques.',
      'A leitura acontece no próprio celular. A imagem não é enviada para lugar nenhum.',
      'Ao ler a placa, o porteiro já vê se ela tem cadastro e de quem. Para visitante e prestador, basta confirmar se continua com a mesma unidade.',
      'A página "Passaram sem cadastro" lista as placas das últimas 24 horas que ainda precisam de cadastro.',
      'Se a câmera da lombada ler a placa com um caractere diferente, o celular oferece a correção.',
      'A página pode ser instalada na tela inicial do celular e tem manual próprio.',
    ]),
  });
});
