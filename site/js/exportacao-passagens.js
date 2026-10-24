/**
 * exportacao-passagens.js — colunas da exportação da lista de passagens
 * (Excel e PDF do painel do síndico). Tipo, Nome e Unidade são os do
 * cadastro NA HORA da passagem (o mesmo que a lista mostra), não o de hoje.
 *
 * Nada aqui toca no DOM. Carregado no browser (window.exportacaoPassagensLib,
 * depois de vinculo-placa.js e severidade-velocidade.js) e no Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./vinculo-placa'), require('./severidade-velocidade'));
  } else {
    root.exportacaoPassagensLib = factory(root.vinculoPlacaLib, root.severidadeVelocidadeLib);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (vinculoLib, severidade) {
  'use strict';

  const FUSO = 'America/Sao_Paulo';
  const fmtData = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' });
  const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

  // Mesma ordem e divisão da lista do painel (v1.15.0): Lombada, Veículo
  // (marca + modelo), Cor, Ano, Tipo, Nome e Unidade em colunas separadas.
  const COLUNAS_EXCEL = Object.freeze([
    'Placa', 'Velocidade (km/h)', 'Status', 'Data', 'Hora', 'Lombada', 'Veículo', 'Cor', 'Ano', 'Tipo', 'Nome', 'Unidade',
    'Tipo (câmera)', 'Cor (câmera)',
  ]);

  // Larguras em fração da área útil do A4 deitado (somam 1). Alinhamento da
  // lista: texto à esquerda, números (velocidade, data, hora, ano) à direita.
  const COLUNAS_PDF = Object.freeze([
    { label: 'Placa', w: 0.08, alinhar: 'left' }, { label: 'Velocidade', w: 0.07, alinhar: 'right' },
    { label: 'Status', w: 0.06, alinhar: 'left' }, { label: 'Data', w: 0.07, alinhar: 'right' },
    { label: 'Hora', w: 0.06, alinhar: 'right' }, { label: 'Lombada', w: 0.11, alinhar: 'left' },
    { label: 'Veículo', w: 0.13, alinhar: 'left' }, { label: 'Cor', w: 0.07, alinhar: 'left' },
    { label: 'Ano', w: 0.05, alinhar: 'right' }, { label: 'Tipo', w: 0.09, alinhar: 'left' },
    { label: 'Nome', w: 0.12, alinhar: 'left' }, { label: 'Unidade', w: 0.09, alinhar: 'left' },
  ].map(Object.freeze));
  const COLUNA_STATUS_PDF = 2;

  function quando(ts) {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? { data: '', hora: '' } : { data: fmtData.format(d), hora: fmtHora.format(d) };
  }

  const veiculoDe = (b) => [b.marca, b.modelo].filter(Boolean).join(' ');

  /**
   * Linha da planilha. ctx: { captura, radar (nome da lombada), vinculo (da
   * hora), unidade (rótulo), base: { marca, modelo, cor, ano }, limite }.
   */
  function linhaExcel(ctx) {
    const c = ctx.captura;
    const v = ctx.vinculo || null;
    const b = ctx.base || {};
    const { data, hora } = quando(c.timestamp);
    const valores = [
      c.placa, c.velocidade, severidade.acimaDoLimite(c.velocidade, ctx.limite) ? 'ALERTA' : 'OK', data, hora,
      ctx.radar || '—', veiculoDe(b), b.cor || '', b.ano || '',
      vinculoLib.tipoPessoa(v && v.tipo_pessoa).rotulo, (v && v.nome_morador) || '', ctx.unidade || '',
      c.tipo_veiculo || '', c.cor_veiculo || '',
    ];
    return Object.fromEntries(COLUNAS_EXCEL.map((k, i) => [k, valores[i]]));
  }

  /** Valores (texto) da linha do PDF, na ordem de COLUNAS_PDF. */
  function valoresPdf(ctx) {
    const c = ctx.captura;
    const v = ctx.vinculo || null;
    const b = ctx.base || {};
    const { data, hora } = quando(c.timestamp);
    return [
      c.placa || '—', `${c.velocidade} km/h`, severidade.acimaDoLimite(c.velocidade, ctx.limite) ? 'ALERTA' : 'OK', data, hora,
      ctx.radar || '—', veiculoDe(b) || '—', b.cor || '—', b.ano || '—',
      vinculoLib.tipoPessoa(v && v.tipo_pessoa).rotulo, (v && v.nome_morador) || '—', ctx.unidade || '—',
    ].map(String);
  }

  return Object.freeze({ COLUNAS_EXCEL, COLUNAS_PDF, COLUNA_STATUS_PDF, linhaExcel, valoresPdf });
});
