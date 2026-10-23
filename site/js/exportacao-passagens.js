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

  const COLUNAS_EXCEL = Object.freeze([
    'Placa', 'Velocidade (km/h)', 'Radar', 'Data', 'Hora', 'Status', 'Tipo', 'Nome', 'Unidade',
    'Tipo (câmera)', 'Cor (câmera)', 'Marca', 'Modelo', 'Cor (cadastro)', 'Ano',
  ]);

  // Larguras em fração da área útil do A4 deitado (somam 1)
  const COLUNAS_PDF = Object.freeze([
    { label: 'Placa', w: 0.09 }, { label: 'Velocidade', w: 0.08 }, { label: 'Radar', w: 0.12 },
    { label: 'Status', w: 0.06 }, { label: 'Data', w: 0.08 }, { label: 'Hora', w: 0.07 },
    { label: 'Tipo', w: 0.09 }, { label: 'Nome', w: 0.15 }, { label: 'Unidade', w: 0.10 },
    { label: 'Veículo (câmera)', w: 0.09 }, { label: 'Cor', w: 0.07 },
  ].map(Object.freeze));
  const COLUNA_STATUS_PDF = 3;

  function quando(ts) {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? { data: '', hora: '' } : { data: fmtData.format(d), hora: fmtHora.format(d) };
  }

  /**
   * Linha da planilha. ctx: { captura, radar, vinculo (da hora), unidade
   * (rótulo), base: { marca, modelo, cor, ano }, limite }.
   */
  function linhaExcel(ctx) {
    const c = ctx.captura;
    const v = ctx.vinculo || null;
    const b = ctx.base || {};
    const { data, hora } = quando(c.timestamp);
    const valores = [
      c.placa, c.velocidade, ctx.radar || '—', data, hora,
      severidade.acimaDoLimite(c.velocidade, ctx.limite) ? 'ALERTA' : 'OK',
      vinculoLib.tipoPessoa(v && v.tipo_pessoa).rotulo, (v && v.nome_morador) || '', ctx.unidade || '',
      c.tipo_veiculo || '', c.cor_veiculo || '', b.marca || '', b.modelo || '', b.cor || '', b.ano || '',
    ];
    return Object.fromEntries(COLUNAS_EXCEL.map((k, i) => [k, valores[i]]));
  }

  /** Valores (texto) da linha do PDF, na ordem de COLUNAS_PDF. */
  function valoresPdf(ctx) {
    const c = ctx.captura;
    const v = ctx.vinculo || null;
    const { data, hora } = quando(c.timestamp);
    return [
      c.placa || '—', `${c.velocidade} km/h`, ctx.radar || '—',
      severidade.acimaDoLimite(c.velocidade, ctx.limite) ? 'ALERTA' : 'OK', data, hora,
      vinculoLib.tipoPessoa(v && v.tipo_pessoa).rotulo, (v && v.nome_morador) || '—', ctx.unidade || '—',
      c.tipo_veiculo || '—', c.cor_veiculo || '—',
    ].map(String);
  }

  return Object.freeze({ COLUNAS_EXCEL, COLUNAS_PDF, COLUNA_STATUS_PDF, linhaExcel, valoresPdf });
});
