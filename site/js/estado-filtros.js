/**
 * estado-filtros.js — estado ÚNICO dos filtros confirmados do painel do síndico.
 *
 * Tabela, gráfico, indicadores, alertas e Top 10 leem este estado, nunca o
 * formulário: o que foi digitado e não confirmado ("Filtrar") não vale.
 * Também decide se o polling precisa reconsultar o período.
 *
 * Fuso: o banco compara em UTC. As bordas do período são data+hora LOCAIS do
 * navegador convertidas para ISO UTC (intervaloDoPeriodo) — nunca texto sem
 * offset, que o PostgREST leria como UTC (hoje viraria 21:00 de ontem em -03).
 *
 * Carregado no browser (window.estadoFiltrosLib) e no Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.estadoFiltrosLib = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const PLACA_BUSCA_MAX = 7;
  const HORA_INICIO_PADRAO = '00:00';
  const HORA_FIM_PADRAO = '23:59';
  // A câmera pode enviar a passagem alguns minutos depois: um período que
  // acabou há pouco ainda pode ganhar linhas.
  const MARGEM_ATRASO_MS = 10 * 60 * 1000;
  const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
  const RE_HORA = /^\d{2}:\d{2}$/;

  const texto = (v) => (v === null || v === undefined ? '' : String(v).trim());

  /** "abc-1d23" → "ABC1D23": só letras e dígitos (sem curingas do ilike), até 7. */
  function normalizarPlacaBusca(v) {
    return texto(v).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, PLACA_BUSCA_MAX);
  }

  function inteiroPositivo(v) {
    const n = parseInt(texto(v), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function veiculoDe(v) {
    const c = v || {};
    return Object.freeze({
      marca: texto(c.marca), modelo: texto(c.modelo), cor: texto(c.cor),
      anoDe: c.anoDe || null, anoAte: c.anoAte || null,
    });
  }

  const dataOu = (v, padrao) => (RE_DATA.test(texto(v)) ? texto(v) : padrao);
  const horaOu = (v, padrao) => (RE_HORA.test(texto(v)) ? texto(v) : padrao);

  /**
   * Campos crus do formulário → estado congelado (invertidos são trocados).
   * @param {object} campos dataInicio, horaInicio, dataFim, horaFim, placa,
   *   velMin, velMax, cameraId, soAlertas, veiculo (já montado por filtro-veiculo)
   * @param {string} hoje 'AAAA-MM-DD' local
   */
  function montarFiltros(campos, hoje) {
    const c = campos || {};
    let ini = [dataOu(c.dataInicio, hoje), horaOu(c.horaInicio, HORA_INICIO_PADRAO)];
    let fim = [dataOu(c.dataFim, hoje), horaOu(c.horaFim, HORA_FIM_PADRAO)];
    if (ini.join('T') > fim.join('T')) [ini, fim] = [fim, ini];
    let velMin = inteiroPositivo(c.velMin) || 0;
    let velMax = inteiroPositivo(c.velMax);
    if (velMax && velMin > velMax) [velMin, velMax] = [velMax, velMin];
    return Object.freeze({
      dataInicio: ini[0],
      horaInicio: ini[1],
      dataFim: fim[0],
      horaFim: fim[1],
      placa: normalizarPlacaBusca(c.placa),
      velMin,
      velMax,
      cameraId: texto(c.cameraId),
      soAlertas: c.soAlertas === true,
      veiculo: veiculoDe(c.veiculo),
    });
  }

  function filtrosPadrao(hoje) {
    return montarFiltros({}, hoje);
  }

  // 'AAAA-MM-DD' + 'HH:MM' locais → instante (ms); formato inválido → NaN
  function instante(data, hora, seg) {
    if (!RE_DATA.test(data) || !RE_HORA.test(hora)) return NaN;
    return new Date(`${data}T${hora}:${seg}`).getTime();
  }

  /**
   * Bordas do período (data+hora LOCAIS) em ISO UTC, par único de todas as
   * consultas do período: tabela, gráfico, indicadores, alertas, Top 10, export.
   */
  function intervaloDoPeriodo(f) {
    return {
      tsInicio: new Date(instante(f.dataInicio, f.horaInicio, '00')).toISOString(),
      tsFim: new Date(instante(f.dataFim, f.horaFim, '59.999')).toISOString(),
      umDia: f.dataInicio === f.dataFim,
    };
  }

  /** 'AAAA-MM-DD' do relógio local (não UTC). */
  function hojeLocal(agora) {
    const d = agora instanceof Date ? agora : new Date();
    const dois = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
  }

  /**
   * Meia-noite: se o estado é o padrão "hoje" do dia anterior (ninguém mexeu),
   * passa ao padrão do novo dia. Filtro personalizado fica como está.
   */
  function virarDia(f, hojeAnterior, agora) {
    const hoje = hojeLocal(agora);
    if (hoje === hojeAnterior) return f;
    if (chaveFiltros(f) !== chaveFiltros(filtrosPadrao(hojeAnterior))) return f;
    return filtrosPadrao(hoje);
  }

  /** O período confirmado ainda pode ganhar passagens (inclui agora, com margem)? */
  function periodoIncluiAgora(f, agora) {
    const t = (agora instanceof Date ? agora : new Date()).getTime();
    const ini = instante(f.dataInicio, f.horaInicio, '00');
    const fim = instante(f.dataFim, f.horaFim, '59');
    if (Number.isNaN(ini) || Number.isNaN(fim)) return true; // na dúvida, recarrega
    return ini <= t && t <= fim + MARGEM_ATRASO_MS;
  }

  function chaveFiltros(f) {
    return JSON.stringify(f);
  }

  /** Polling: só reconsulta o período se os filtros mudaram ou se ele inclui agora. */
  function precisaRecarregarPeriodo(f, chaveCarregada, agora) {
    if (chaveCarregada !== chaveFiltros(f)) return true;
    return periodoIncluiAgora(f, agora);
  }

  return {
    normalizarPlacaBusca, montarFiltros, filtrosPadrao, intervaloDoPeriodo,
    periodoIncluiAgora, chaveFiltros, precisaRecarregarPeriodo, hojeLocal, virarDia,
    PLACA_BUSCA_MAX, MARGEM_ATRASO_MS,
  };
});
