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
    versao: '1.6.0',
    data: '2026-10-10',
    titulo: 'Números mais claros, busca completa e relatórios do período inteiro',
    itens: Object.freeze([
      'O painel mostra passagens e veículos separados (ex.: 171 passagens de 87 veículos).',
      'Buscar uma placa ou um modelo mostra todas as passagens, inclusive as abaixo de 10 km/h.',
      'Indicadores, Top 10 e gráficos agora contam todas as passagens do período.',
      'Exportar em Excel ou PDF leva o período inteiro, não só as passagens mais recentes.',
      'Carro parado em frente à câmera conta uma passagem só, e "sem placa" sai do Top 10.',
    ]),
  });
});
