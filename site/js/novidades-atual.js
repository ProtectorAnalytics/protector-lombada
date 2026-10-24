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
    versao: '1.16.0',
    data: '2026-10-24',
    titulo: 'Painel mais enxuto: resumo do dia ao lado e lista logo abaixo das fotos',
    itens: Object.freeze([
      'Em telas a partir de 1024 px, o lado direito virou um quadro só: a semana no alto, os números do dia no meio e os rankings embaixo; a lista de passagens subiu para logo abaixo das últimas passagens',
      'Hoje, Ontem e 7 dias saíram do topo e ficaram ao lado da busca; o botão escolhido mostra a data ("Hoje · 24/10") e o calendário abre a escolha de outras datas',
      'Câmeras, "só acima do limite", filtros e exportar viraram ícones; parando o mouse em cima aparece o nome',
      'Números do dia mais diretos: veículos, alertas, velocidade máxima, dentro do limite, pico e reincidentes juntos, com a diferença para ontem ao lado ("▼14"); os detalhes aparecem ao parar o mouse em cima',
      'Lista mais limpa: velocidade centralizada, tipo de cadastro só com o ícone e cor só com o ponto colorido (o nome aparece ao parar o mouse)',
      'O aviso das passagens abaixo de 10 km/h ocultas foi para o rodapé da lista, com o atalho "mostrar"',
    ]),
  });
});
