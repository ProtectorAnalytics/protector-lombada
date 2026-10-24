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
    versao: '1.17.0',
    data: '2026-10-24',
    titulo: 'Quadro no PC da portaria',
    itens: Object.freeze([
      'Novo quadro para o PC da portaria: uma janela pequena, sempre por cima das câmeras e do controle de acesso, com a última passagem na lombada ao vivo',
      'O quadro mostra a foto, a placa, a velocidade e de quem é o carro (Morador, Proprietário, Visitante ou Prestador) ou "Sem cadastro"; acima do limite, fica em vermelho',
      'As setas voltam nas passagens de hoje e um clique abre o painel completo; o porteiro entra com o próprio login',
      'Para instalar, abra o menu da conta no painel e clique em "Quadro para o PC da portaria"',
    ]),
  });
});
