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
    versao: '1.15.2',
    data: '2026-10-23',
    titulo: 'Visual novo do painel',
    itens: Object.freeze([
      'Visual novo do painel: os números do dia num quadro só, com a comparação com ontem no mesmo horário; a última passagem em destaque; uma barra de filtros sem botões repetidos; e a lista com a placa no padrão Mercosul e colunas para lombada, veículo, cor, ano, tipo, nome e unidade',
      'Semana de segunda a domingo: "Veículos por dia" mostra a semana por tipo de cadastro, com setas para as semanas anteriores; clique num número para ver aquelas passagens na lista',
      'Câmeras no topo: cada câmera vira um ícone na cor do status, com o local e a última leitura ao passar o mouse; o topo fica fixo ao rolar, com Hoje, Ontem, 7 dias ou Escolher…',
      'Funciona do celular ao monitor grande: os quadros se reorganizam em cada tamanho de tela, as fotos passam com o dedo no celular e cada passagem vira um cartão',
      'O gráfico "Passagens por hora" saiu da tela; a hora de pico continua nos Indicadores, ao lado dos números do dia',
      'Logo da Protector visível no topo também em notebook',
      'Fotos das últimas passagens enquadradas câmera a câmera: o carro aparece grande e centralizado',
      'Placa sem cadastro mostra "—" no Nome, igual à Unidade; o "+ Cadastrar" aparece ao passar o mouse',
    ]),
  });
});
