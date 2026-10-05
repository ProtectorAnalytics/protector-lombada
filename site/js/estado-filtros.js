/**
 * estado-filtros.js — estado ÚNICO dos filtros confirmados do painel do síndico.
 *
 * Tabela, gráfico, indicadores, alertas e Top 10 leem este estado, nunca o
 * formulário: o que foi digitado e não confirmado ("Filtrar") não vale.
 * Também decide se o polling precisa reconsultar o período.
 *
 * Carregado no browser (window.estadoFiltrosLib) e no Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.estadoFiltrosLib = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
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

  /**
   * Campos crus do formulário → estado congelado.
   * @param {object} campos dataInicio, horaInicio, dataFim, horaFim, placa,
   *   velMin, velMax, cameraId, soAlertas, veiculo (já montado por filtro-veiculo)
   * @param {string} hoje 'AAAA-MM-DD' local
   */
  function montarFiltros(campos, hoje) {
    const c = campos || {};
    return Object.freeze({
      dataInicio: texto(c.dataInicio) || hoje,
      horaInicio: texto(c.horaInicio) || HORA_INICIO_PADRAO,
      dataFim: texto(c.dataFim) || hoje,
      horaFim: texto(c.horaFim) || HORA_FIM_PADRAO,
      placa: normalizarPlacaBusca(c.placa),
      velMin: inteiroPositivo(c.velMin) || 0,
      velMax: inteiroPositivo(c.velMax),
      cameraId: texto(c.cameraId),
      soAlertas: c.soAlertas === true,
      veiculo: veiculoDe(c.veiculo),
    });
  }

  function filtrosPadrao(hoje) {
    return montarFiltros({}, hoje);
  }

  /** Bordas do período em hora local (sem fuso), como a consulta já usava. */
  function intervaloDoPeriodo(f) {
    return {
      tsInicio: `${f.dataInicio}T${f.horaInicio}:00`,
      tsFim: `${f.dataFim}T${f.horaFim}:59`,
      umDia: f.dataInicio === f.dataFim,
    };
  }

  function instante(data, hora, seg) {
    if (!RE_DATA.test(data) || !RE_HORA.test(hora)) return NaN;
    return new Date(`${data}T${hora}:${seg}`).getTime();
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
    periodoIncluiAgora, chaveFiltros, precisaRecarregarPeriodo,
    PLACA_BUSCA_MAX, MARGEM_ATRASO_MS,
  };
});
