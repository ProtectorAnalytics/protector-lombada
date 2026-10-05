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
 * Também: atalhos de período, perguntas prontas (visões), remoção de um
 * filtro (chips) e o estado na URL (de/para), todos sobre o mesmo estado.
 *
 * Carregado no browser (window.estadoFiltrosLib, depois de filtro-veiculo.js)
 * e no Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./filtro-veiculo'));
  else root.estadoFiltrosLib = factory(root.filtroVeiculoLib);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (filtroVeiculo) {
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
      naoCadastrados: c.naoCadastrados === true,
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

  // ---------------------------------------------------------------------
  // Atalhos de período. Sem "30 dias": a lista traz no máximo 300 passagens.
  // ---------------------------------------------------------------------
  const ATALHOS = Object.freeze(['hoje', 'ontem', '7d']);

  /** 'AAAA-MM-DD' + n dias (calendário puro, sem fuso). */
  function somarDias(data, n) {
    const [a, m, d] = data.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
  }

  function diasInteiros(de, ate) {
    return { dataInicio: de, horaInicio: HORA_INICIO_PADRAO, dataFim: ate, horaFim: HORA_FIM_PADRAO };
  }

  /** Campos de período do atalho; atalho desconhecido → null. */
  function periodoDoAtalho(id, hoje) {
    if (id === 'hoje') return diasInteiros(hoje, hoje);
    if (id === 'ontem') return diasInteiros(somarDias(hoje, -1), somarDias(hoje, -1));
    if (id === '7d') return diasInteiros(somarDias(hoje, -6), hoje);
    return null;
  }

  /** Qual atalho o período do estado é ('hoje' | 'ontem' | '7d'), ou null. */
  function atalhoDoPeriodo(f, hoje) {
    return ATALHOS.find((id) => {
      const p = periodoDoAtalho(id, hoje);
      return p.dataInicio === f.dataInicio && p.horaInicio === f.horaInicio
        && p.dataFim === f.dataFim && p.horaFim === f.horaFim;
    }) || null;
  }

  /** Estado novo = estado + mudanças (veículo mesclado campo a campo). */
  function comMudancas(f, mudancas, hoje) {
    const m = mudancas || {};
    return montarFiltros(Object.assign({}, f, m, {
      veiculo: Object.assign({}, f.veiculo, m.veiculo || {}),
    }), hoje);
  }

  // Chave do chip → mudanças que tiram aquele filtro
  const REMOCOES = {
    periodo: (hoje) => periodoDoAtalho('hoje', hoje),
    camera: () => ({ cameraId: '' }),
    alerta: () => ({ soAlertas: false }),
    naoCadastrados: () => ({ naoCadastrados: false }),
    placa: () => ({ placa: '' }),
    marca: () => ({ veiculo: { marca: '' } }),
    modelo: () => ({ veiculo: { modelo: '' } }),
    cor: () => ({ veiculo: { cor: '' } }),
    ano: () => ({ veiculo: { anoDe: null, anoAte: null } }),
    velocidade: () => ({ velMin: 0, velMax: null }),
  };

  function removerFiltro(f, chave, hoje) {
    const r = Object.prototype.hasOwnProperty.call(REMOCOES, chave) ? REMOCOES[chave] : null;
    return r ? comMudancas(f, r(hoje), hoje) : f;
  }

  /** (n) do botão "Mais filtros": velocidade, marca, modelo, cor, ano. */
  function contarMaisFiltros(f) {
    const v = f.veiculo || {};
    return [f.velMin > 0 || f.velMax, v.marca, v.modelo, v.cor, v.anoDe || v.anoAte]
      .filter(Boolean).length;
  }

  // ---------------------------------------------------------------------
  // Perguntas prontas: presets do MESMO estado (geram os mesmos chips)
  // ---------------------------------------------------------------------
  const VISOES = Object.freeze([
    { id: 'hoje', rotulo: 'Hoje', mudancas: () => ({}) },
    { id: 'ontem', rotulo: 'Ontem', mudancas: (h) => periodoDoAtalho('ontem', h) },
    { id: 'acima-hoje', rotulo: 'Acima do limite hoje', mudancas: () => ({ soAlertas: true }) },
    { id: '7d', rotulo: 'Últimos 7 dias', mudancas: (h) => periodoDoAtalho('7d', h) },
    { id: 'nao-cadastrados', rotulo: 'Não cadastrados', mudancas: () => ({ naoCadastrados: true }) },
  ].map(Object.freeze));

  function estadoDaVisao(id, hoje) {
    const v = VISOES.find((x) => x.id === id);
    return v ? comMudancas(filtrosPadrao(hoje), v.mudancas(hoje), hoje) : null;
  }

  /** Id da visão cujo estado é exatamente este, ou null. */
  function visaoAtiva(f, hoje) {
    const chave = chaveFiltros(f);
    const v = VISOES.find((x) => chaveFiltros(estadoDaVisao(x.id, hoje)) === chave);
    return v ? v.id : null;
  }

  // ---------------------------------------------------------------------
  // Estado na URL (history.replaceState). A placa vai na URL: página
  // autenticada, nunca gere link público com isto.
  // ---------------------------------------------------------------------
  const TEXTO_URL_MAX = 40;
  const VEL_MAX_URL = 300;
  const RE_CAMERA = /^[A-Za-z0-9-]{1,64}$/;
  const RE_COR = /^[a-zà-ú]{2,20}$/;
  const RE_DATA_HORA = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/;

  function paraQueryString(f, hoje) {
    const q = new URLSearchParams();
    const atalho = atalhoDoPeriodo(f, hoje);
    if (atalho && atalho !== 'hoje') q.set('p', atalho);
    if (!atalho) {
      q.set('de', `${f.dataInicio}T${f.horaInicio}`);
      q.set('ate', `${f.dataFim}T${f.horaFim}`);
    }
    const v = f.veiculo || {};
    if (f.cameraId) q.set('cam', f.cameraId);
    if (f.soAlertas) q.set('alerta', '1');
    if (f.placa) q.set('placa', f.placa);
    if (v.marca) q.set('marca', v.marca);
    if (v.modelo) q.set('modelo', v.modelo);
    if (v.cor) q.set('cor', v.cor);
    if (v.anoDe || v.anoAte) q.set('ano', `${v.anoDe || ''}-${v.anoAte || ''}`);
    if (f.velMin > 0) q.set('vmin', String(f.velMin));
    if (f.velMax) q.set('vmax', String(f.velMax));
    if (f.naoCadastrados) q.set('nc', '1');
    return q.toString().replace(/\+/g, '%20');
  }

  function lerParametros(qs) {
    try {
      return new URLSearchParams(texto(qs).replace(/^\?/, ''));
    } catch {
      return new URLSearchParams();
    }
  }

  function periodoDaUrl(q, hoje) {
    const atalho = periodoDoAtalho(q.get('p'), hoje);
    if (atalho) return atalho;
    const de = RE_DATA_HORA.exec(texto(q.get('de')));
    const ate = RE_DATA_HORA.exec(texto(q.get('ate')));
    if (!de || !ate) return {};
    return { dataInicio: de[1], horaInicio: de[2], dataFim: ate[1], horaFim: ate[2] };
  }

  function velocidadeDaUrl(v) {
    const n = /^\d{1,3}$/.test(texto(v)) ? Number(v) : 0;
    return n > 0 && n <= VEL_MAX_URL ? n : null;
  }

  function veiculoDaUrl(q, anoAtual) {
    const ano = /^(\d{4})?-(\d{4})?$/.exec(texto(q.get('ano'))) || [];
    const marca = texto(q.get('marca')).replace(/[\u0000-\u001f]/g, '').slice(0, TEXTO_URL_MAX);
    const cor = texto(q.get('cor')).toLowerCase();
    return filtroVeiculo.montarFiltroVeiculo({
      marca,
      modelo: filtroVeiculo.termoModelo(texto(q.get('modelo')).slice(0, TEXTO_URL_MAX)),
      cor: RE_COR.test(cor) ? cor : '',
      anoDe: ano[1] || '', anoAte: ano[2] || '',
    }, anoAtual);
  }

  /** Query string → estado; parâmetro inválido é ignorado (cai no padrão). */
  function deQueryString(qs, hoje, anoAtual) {
    const q = lerParametros(qs);
    const cam = texto(q.get('cam'));
    return montarFiltros(Object.assign(periodoDaUrl(q, hoje), {
      cameraId: RE_CAMERA.test(cam) ? cam : '',
      soAlertas: q.get('alerta') === '1',
      naoCadastrados: q.get('nc') === '1',
      placa: q.get('placa'),
      velMin: velocidadeDaUrl(q.get('vmin')),
      velMax: velocidadeDaUrl(q.get('vmax')),
      veiculo: veiculoDaUrl(q, anoAtual),
    }), hoje);
  }

  return {
    normalizarPlacaBusca, montarFiltros, filtrosPadrao, intervaloDoPeriodo,
    periodoIncluiAgora, chaveFiltros, precisaRecarregarPeriodo, hojeLocal, virarDia,
    periodoDoAtalho, atalhoDoPeriodo, comMudancas, removerFiltro, contarMaisFiltros,
    VISOES, estadoDaVisao, visaoAtiva, paraQueryString, deQueryString,
    PLACA_BUSCA_MAX, MARGEM_ATRASO_MS,
  };
});
