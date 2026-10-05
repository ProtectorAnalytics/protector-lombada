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
  const ANO_MINIMO_PERIODO = 2000;
  const MAX_DIAS_PERIODO = 31; // lista limitada a 300 passagens: período curto
  const VEL_MAXIMA = 300;
  const DIA_MS = 86400000;

  const texto = (v) => (v === null || v === undefined ? '' : String(v).trim());

  /** "abc-1d23" → "ABC1D23": só letras e dígitos (sem curingas do ilike), até 7. */
  function normalizarPlacaBusca(v) {
    return texto(v).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, PLACA_BUSCA_MAX);
  }

  function inteiroPositivo(v) {
    const n = parseInt(texto(v), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  // Velocidade de filtro: 1–300 (acima de 300 vira 300)
  function velocidade(v) {
    const n = inteiroPositivo(v);
    return n ? Math.min(n, VEL_MAXIMA) : null;
  }

  /** 'AAAA-MM-DD' que existe no calendário (ida e volta) e é de 2000 em diante. */
  function dataValida(v) {
    const s = texto(v);
    if (!RE_DATA.test(s)) return false;
    const [a, m, d] = s.split('-').map(Number);
    const dt = new Date(Date.UTC(a, m - 1, d));
    return a >= ANO_MINIMO_PERIODO && dt.getUTCFullYear() === a
      && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  /** 'HH:MM' entre 00:00 e 23:59. */
  function horaValida(v) {
    const s = texto(v);
    if (!RE_HORA.test(s)) return false;
    const [h, m] = s.split(':').map(Number);
    return h < 24 && m < 60;
  }

  // Dias de calendário entre duas datas válidas (sem fuso)
  const diaDoCalendario = (data) => Date.UTC(...data.split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0)));

  /**
   * Período digitado: null se vale; senão o motivo para mostrar ao usuário.
   * Datas/horas impossíveis ou antes de 2000 → inválido; mais de 31 dias → recusa.
   */
  function validarPeriodo(c) {
    const p = c || {};
    if (![p.dataInicio, p.dataFim].every(dataValida) || ![p.horaInicio, p.horaFim].every(horaValida)) {
      return 'Data ou hora inválida';
    }
    const dias = Math.abs(diaDoCalendario(p.dataFim) - diaDoCalendario(p.dataInicio)) / DIA_MS + 1;
    return dias > MAX_DIAS_PERIODO ? `Escolha até ${MAX_DIAS_PERIODO} dias` : null;
  }

  function veiculoDe(v) {
    const c = v || {};
    return Object.freeze({
      marca: texto(c.marca), modelo: texto(c.modelo), cor: texto(c.cor),
      anoDe: c.anoDe || null, anoAte: c.anoAte || null,
    });
  }

  const dataOu = (v, padrao) => (dataValida(v) ? texto(v) : padrao);
  const horaOu = (v, padrao) => (horaValida(v) ? texto(v) : padrao);

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
    if (validarPeriodo({ dataInicio: ini[0], horaInicio: ini[1], dataFim: fim[0], horaFim: fim[1] })) {
      ini = [hoje, HORA_INICIO_PADRAO]; // longo demais: volta ao dia de hoje
      fim = [hoje, HORA_FIM_PADRAO];
    }
    let velMin = velocidade(c.velMin) || 0;
    let velMax = velocidade(c.velMax);
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
    if (!dataValida(data) || !horaValida(hora)) return NaN;
    return new Date(`${data}T${hora}:${seg}`).getTime();
  }

  // Nunca lança: borda impossível cai no dia de hoje (00:00 ou 23:59)
  function instanteOuHoje(data, hora, seg, horaPadrao) {
    const t = instante(data, hora, seg);
    return Number.isNaN(t) ? instante(hojeLocal(), horaPadrao, seg) : t;
  }

  /**
   * Bordas do período (data+hora LOCAIS) em ISO UTC, par único de todas as
   * consultas do período: tabela, gráfico, indicadores, alertas, Top 10, export.
   */
  function intervaloDoPeriodo(f) {
    return {
      tsInicio: new Date(instanteOuHoje(f.dataInicio, f.horaInicio, '00', HORA_INICIO_PADRAO)).toISOString(),
      tsFim: new Date(instanteOuHoje(f.dataFim, f.horaFim, '59.999', HORA_FIM_PADRAO)).toISOString(),
      umDia: f.dataInicio === f.dataFim,
    };
  }

  /** 'AAAA-MM-DD' do relógio local (não UTC). */
  function hojeLocal(agora) {
    const d = agora instanceof Date ? agora : new Date();
    const dois = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
  }

  // Visões "do dia": à meia-noite passam ao dia novo (Ontem e 7 dias, não)
  const VISOES_DO_DIA = ['hoje', 'acima-hoje', 'nao-cadastrados'];

  /**
   * Meia-noite: se o estado é exatamente uma visão do dia anterior (padrão,
   * "Acima do limite hoje" ou "Não cadastrados"), passa à mesma visão do novo
   * dia. Filtro personalizado fica como está.
   */
  function virarDia(f, hojeAnterior, agora) {
    const hoje = hojeLocal(agora);
    if (hoje === hojeAnterior) return f;
    const chave = chaveFiltros(f);
    const id = VISOES_DO_DIA.find((v) => chaveFiltros(estadoDaVisao(v, hojeAnterior)) === chave);
    return id ? estadoDaVisao(id, hoje) : f;
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

  /** Há algum filtro diferente do padrão (período de hoje, sem filtros)? */
  function temFiltroAtivo(f, hoje) {
    if (!f) return false;
    return chaveFiltros(f) !== chaveFiltros(filtrosPadrao(hoje));
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
    const p = { dataInicio: de[1], horaInicio: de[2], dataFim: ate[1], horaFim: ate[2] };
    return validarPeriodo(p) ? {} : p; // impossível ou longo demais: ignora
  }

  function velocidadeDaUrl(v) {
    return /^\d{1,4}$/.test(texto(v)) ? velocidade(v) : null;
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
    periodoIncluiAgora, chaveFiltros, precisaRecarregarPeriodo, temFiltroAtivo, hojeLocal, virarDia,
    periodoDoAtalho, atalhoDoPeriodo, comMudancas, removerFiltro, contarMaisFiltros,
    VISOES, estadoDaVisao, visaoAtiva, paraQueryString, deQueryString, validarPeriodo,
    PLACA_BUSCA_MAX, MARGEM_ATRASO_MS, MAX_DIAS_PERIODO, VEL_MAXIMA,
  };
});
