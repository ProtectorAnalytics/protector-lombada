/**
 * veiculos-do-dia.js — regras puras de "Veículos hoje" e da lista de passagens:
 *
 *  - veículo = placa válida normalizada (A-Z0-9; grafia antiga e Mercosul são o
 *    mesmo carro). Leitura sem placa ("SEM PLACA", parcial) não é veículo.
 *  - dia = 00:00–23:59 em America/Sao_Paulo; o veículo conta uma vez por dia,
 *    qualquer que seja o radar.
 *  - tipo do veículo no dia = o do vínculo válido na PRIMEIRA passagem do dia
 *    (vinculoPlacaLib.vinculoNaHora).
 *  - "Nª hoje": ordem da passagem entre as da mesma placa no mesmo dia.
 *  - grupos por dia da lista ("Sexta, 23 de outubro").
 *
 * Nada aqui toca no DOM. Carregado no browser (window.veiculosDoDiaLib, depois
 * de placa.js e vinculo-placa.js) e no Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./placa'), require('./vinculo-placa'));
  } else {
    root.veiculosDoDiaLib = factory(root.placaLib, root.vinculoPlacaLib);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (placaLib, vinculoLib) {
  'use strict';

  const FUSO = 'America/Sao_Paulo';
  // Brasil sem horário de verão desde 2019: o dia de São Paulo começa às 03:00 UTC
  const OFFSET_SP = '-03:00';
  const VEL_MAX_VALIDA = 250;
  const VEL_MIN_MEDIDA = 10;
  const TIPOS = Object.freeze(vinculoLib.TIPOS_PESSOA.map((t) => t.id).concat([vinculoLib.SEM_CADASTRO.id]));
  const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto',
    'setembro', 'outubro', 'novembro', 'dezembro'];

  const formatoDia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });

  function ms(v) {
    if (v === null || v === undefined || v === '') return NaN;
    if (typeof v === 'number') return v;
    return v instanceof Date ? v.getTime() : Date.parse(v);
  }

  /** Chave do veículo: placa Mercosul normalizada, ou null se não for placa. */
  function chaveVeiculo(placa) {
    return placaLib.paraMercosul(placa || '') || null;
  }

  /** 'AAAA-MM-DD' do instante no fuso de São Paulo ('' se inválido). */
  function diaDe(ts) {
    const t = ms(ts);
    return Number.isNaN(t) ? '' : formatoDia.format(new Date(t));
  }

  /** Início do dia 'AAAA-MM-DD' de São Paulo em ISO (para consultas). */
  function inicioDoDiaIso(dia) {
    return new Date(`${dia}T00:00:00${OFFSET_SP}`).toISOString();
  }

  /** 'AAAA-MM-DD' + n dias (calendário puro). */
  function somarDias(dia, n) {
    const [a, m, d] = dia.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
  }

  /** Os `n` dias que terminam em `hoje`, do mais antigo ao mais novo. */
  function ultimosDias(hoje, n) {
    return Array.from({ length: n }, (_, i) => somarDias(hoje, i - n + 1));
  }

  const diaDaSemana = (dia) => {
    const [a, m, d] = dia.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  };

  /** "Sexta, 23 de outubro" (cabeçalho do grupo na lista). */
  function rotuloDiaLongo(dia) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia || '')) return '';
    const [, m, d] = dia.split('-').map(Number);
    return `${DIAS_SEMANA[diaDaSemana(dia)]}, ${d} de ${MESES[m - 1]}`;
  }

  /** "sex 23" (eixo do gráfico por dia). */
  function rotuloDiaCurto(dia) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia || '')) return '';
    return `${DIAS_SEMANA[diaDaSemana(dia)].slice(0, 3).toLowerCase()} ${Number(dia.slice(8, 10))}`;
  }

  /**
   * Primeira passagem de cada veículo em cada dia (mesmo formato da RPC
   * primeiras_passagens_por_dia): [{ dia, placa (chave), primeira, passagens }].
   */
  function primeirasDoDia(capturas) {
    const grupos = new Map();
    for (const c of capturas || []) {
      const chave = c && chaveVeiculo(c.placa);
      const t = c ? ms(c.timestamp) : NaN;
      if (!chave || Number.isNaN(t)) continue;
      const dia = diaDe(t);
      const k = `${dia}|${chave}`;
      const g = grupos.get(k);
      if (!g) grupos.set(k, { dia, placa: chave, primeira: new Date(t).toISOString(), passagens: 1, t });
      else {
        g.passagens += 1;
        if (t < g.t) { g.t = t; g.primeira = new Date(t).toISOString(); }
      }
    }
    return [...grupos.values()]
      .map(({ dia, placa, primeira, passagens }) => ({ dia, placa, primeira, passagens }))
      .sort((a, b) => (a.dia === b.dia ? (a.placa < b.placa ? -1 : 1) : (a.dia < b.dia ? -1 : 1)));
  }

  /** Tipo ('morador'…'prestador', 'sem') do vínculo da hora da primeira passagem. */
  function tipoNaPrimeira(indice, p) {
    const v = vinculoLib.vinculoNaHora(indice || new Map(), p.placa, p.primeira);
    return vinculoLib.tipoPessoa(v && v.tipo_pessoa).id;
  }

  const zerado = () => Object.fromEntries(TIPOS.map((t) => [t, 0]));

  /** Veículos de UM dia por tipo: { veiculos, porTipo, passagensPorTipo }. */
  function resumirPrimeiras(primeiras, indice) {
    const porTipo = zerado();
    const passagensPorTipo = zerado();
    (primeiras || []).forEach((p) => {
      const t = tipoNaPrimeira(indice, p);
      porTipo[t] += 1;
      passagensPorTipo[t] += Number(p.passagens) || 0;
    });
    return { veiculos: (primeiras || []).length, porTipo, passagensPorTipo };
  }

  /** Resumo do dia a partir das capturas do dia (passagens = todas as leituras). */
  function resumoDoDia(capturas, indice) {
    const r = resumirPrimeiras(primeirasDoDia(capturas), indice);
    return Object.assign(r, { passagens: (capturas || []).length });
  }

  /**
   * Série "veículos por dia" para o gráfico: um item por dia de `dias`, com o
   * total, a pilha por tipo, o dia de pico (maior total; empate: o mais novo)
   * e o dia parcial (hoje, ainda em andamento).
   */
  function serieVeiculosPorDia(primeiras, indice, dias, hoje) {
    const porDia = new Map(dias.map((d) => [d, []]));
    (primeiras || []).forEach((p) => { if (porDia.has(p.dia)) porDia.get(p.dia).push(p); });
    const serie = dias.map((dia) => {
      const r = resumirPrimeiras(porDia.get(dia), indice);
      return { dia, total: r.veiculos, porTipo: r.porTipo, parcial: dia === hoje, pico: false };
    });
    let pico = -1;
    serie.forEach((s, i) => { if (s.total > 0 && (pico < 0 || s.total >= serie[pico].total)) pico = i; });
    if (pico >= 0) serie[pico].pico = true;
    return serie;
  }

  /**
   * Ordem de cada passagem da lista no dia da placa: Map id → número (1 = a
   * primeira do dia). `passagens` são as do(s) mesmo(s) dia(s) das placas da
   * lista, até a mais nova da lista ({ id, placa, timestamp }). Empate de
   * instante desempata pelo id.
   */
  function ordinaisNoDia(linhas, passagens) {
    const porGrupo = new Map();
    for (const p of passagens || []) {
      const chave = p && chaveVeiculo(p.placa);
      const t = p ? ms(p.timestamp) : NaN;
      if (!chave || Number.isNaN(t)) continue;
      const k = `${diaDe(t)}|${chave}`;
      if (!porGrupo.has(k)) porGrupo.set(k, []);
      porGrupo.get(k).push({ t, id: String(p.id) });
    }
    const r = new Map();
    for (const l of linhas || []) {
      const chave = l && chaveVeiculo(l.placa);
      const t = l ? ms(l.timestamp) : NaN;
      if (!chave || Number.isNaN(t)) continue;
      const id = String(l.id);
      const grupo = porGrupo.get(`${diaDe(t)}|${chave}`) || [];
      const antes = grupo.filter((p) => p.id !== id && (p.t < t || (p.t === t && p.id < id))).length;
      r.set(l.id, antes + 1);
    }
    return r;
  }

  /** Selo "Nª hoje" (ou "Nª no dia" fora de hoje); só da 2ª passagem em diante. */
  function textoOrdinal(n, dia, hoje) {
    if (!Number.isInteger(n) || n < 2) return '';
    return `${n}ª ${dia === hoje ? 'hoje' : 'no dia'}`;
  }

  /** Lista em ordem → itens com cabeçalho de dia sempre que o dia muda. */
  function comCabecalhosDeDia(linhas) {
    const itens = [];
    let atual = null;
    (linhas || []).forEach((l, i) => {
      const dia = diaDe(l && l.timestamp);
      if (dia !== atual) {
        itens.push({ tipo: 'dia', dia, rotulo: rotuloDiaLongo(dia) });
        atual = dia;
      }
      itens.push({ tipo: 'linha', linha: l, indice: i });
    });
    return itens;
  }

  /**
   * Velocidade do dia (mesma regra dos indicadores): leituras inválidas do
   * radar saem; média só das medidas (10–250 km/h); "dentro do limite" conta
   * as abaixo de 10 km/h como conformes e descarta acima de 250.
   */
  function indicadoresDeVelocidade(capturas, limite) {
    const utilizaveis = (capturas || []).filter((c) => c && c.velocidade_invalida !== true);
    const vel = (c) => Number(c.velocidade) || 0;
    const medidas = utilizaveis.filter((c) => vel(c) >= VEL_MIN_MEDIDA && vel(c) <= VEL_MAX_VALIDA);
    const validas = utilizaveis.filter((c) => vel(c) <= VEL_MAX_VALIDA);
    const dentro = validas.filter((c) => vel(c) <= limite).length;
    return {
      media: medidas.length ? Math.round(medidas.reduce((s, c) => s + vel(c), 0) / medidas.length) : null,
      medidas: medidas.length,
      dentroPct: validas.length ? Math.round((dentro / validas.length) * 100) : null,
      validas: validas.length,
    };
  }

  /** Larguras (%) da barra fina por tipo, na ordem de TIPOS; tipos zerados ficam de fora. */
  function fatiasDaBarra(porTipo, total) {
    if (!total) return [];
    return TIPOS.filter((t) => porTipo[t] > 0)
      .map((t) => ({ tipo: t, pct: Math.round((porTipo[t] / total) * 1000) / 10 }));
  }

  return Object.freeze({
    FUSO, TIPOS, chaveVeiculo, diaDe, inicioDoDiaIso, somarDias, ultimosDias, rotuloDiaLongo, rotuloDiaCurto,
    primeirasDoDia, tipoNaPrimeira, resumirPrimeiras, resumoDoDia, serieVeiculosPorDia,
    ordinaisNoDia, textoOrdinal, comCabecalhosDeDia, indicadoresDeVelocidade, fatiasDaBarra,
  });
});
