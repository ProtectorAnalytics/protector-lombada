/**
 * painel-visual.js — regras puras do visual do painel (v1.15.0):
 *
 *  - semana de segunda a domingo ("Veículos por dia"): início da semana,
 *    os 7 dias, o rótulo "19–25/10" e a navegação ‹ › por semanas;
 *  - tabela da semana por tipo (mapa de calor): linhas Total + tipos, dias
 *    futuros sem número ("—"), hoje marcado e o maior total destacado;
 *  - intensidade da cor da célula (0 a 22%: o texto claro segue legível);
 *  - status da câmera → estado do ícone no topo (cor e texto da dica);
 *  - anel "Dentro do limite" (traço do SVG).
 *
 * Nada aqui toca no DOM. Carregado no browser (window.painelVisualLib) e no
 * Node (require). Datas são 'AAAA-MM-DD' de calendário (dia de São Paulo).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.painelVisualLib = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DIA_RE = /^\d{4}-\d{2}-\d{2}$/;
  const SEMANA_CURTA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  // Cor da célula: mínimo e faixa (em %). Teto de 22%: o texto claro do tema
  // escuro fica ≥ 4,5:1 até sobre o amarelo (visitante), o tipo mais claro.
  const CALOR_MIN_PCT = 6;
  const CALOR_FAIXA_PCT = 16;
  const ANEL_RAIO = 26;

  const valido = (dia) => DIA_RE.test(dia || '');

  function partes(dia) {
    const [a, m, d] = dia.split('-').map(Number);
    return { a, m, d };
  }

  /** 'AAAA-MM-DD' + n dias (calendário puro, sem fuso). */
  function somarDias(dia, n) {
    const { a, m, d } = partes(dia);
    return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
  }

  /** 0 = domingo … 6 = sábado. */
  function diaDaSemana(dia) {
    const { a, m, d } = partes(dia);
    return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  }

  /** Segunda-feira da semana do dia (domingo pertence à semana que começou 6 dias antes). */
  function inicioDaSemana(dia) {
    if (!valido(dia)) return '';
    const recuo = (diaDaSemana(dia) + 6) % 7; // seg=0 … dom=6
    return somarDias(dia, -recuo);
  }

  /** Os 7 dias (segunda → domingo) da semana `deslocamento` semanas antes/depois da de `hoje`. */
  function diasDaSemana(hoje, deslocamento) {
    const seg = inicioDaSemana(hoje);
    if (!seg) return [];
    const base = somarDias(seg, 7 * (Number(deslocamento) || 0));
    return Array.from({ length: 7 }, (_, i) => somarDias(base, i));
  }

  /** "19–25/10"; atravessando o mês: "28/09–04/10"; o ano só se mudar. */
  function rotuloSemana(dias) {
    if (!dias || dias.length === 0) return '';
    const ini = partes(dias[0]);
    const fim = partes(dias[dias.length - 1]);
    const dd = (p) => String(p.d).padStart(2, '0');
    const mm = (p) => String(p.m).padStart(2, '0');
    if (ini.a !== fim.a) return `${dd(ini)}/${mm(ini)}/${ini.a}–${dd(fim)}/${mm(fim)}/${fim.a}`;
    if (ini.m !== fim.m) return `${dd(ini)}/${mm(ini)}–${dd(fim)}/${mm(fim)}`;
    return `${dd(ini)}–${dd(fim)}/${mm(fim)}`;
  }

  /** "Semana de 19 a 25/10" (nome acessível da navegação). */
  function rotuloSemanaLongo(dias) {
    return dias && dias.length ? `Semana ${rotuloSemana(dias).replace('–', ' a ')}` : '';
  }

  /** A semana seguinte só existe até a de hoje (não há dados no futuro). */
  function podeAvancar(deslocamento) {
    return (Number(deslocamento) || 0) < 0;
  }

  /** Cabeçalho da coluna: { dia, semana: 'seg', numero: '19', hoje, futuro }. */
  function colunasDaSemana(dias, hoje) {
    return (dias || []).map((dia) => ({
      dia,
      semana: SEMANA_CURTA[diaDaSemana(dia)],
      numero: String(partes(dia).d),
      hoje: dia === hoje,
      futuro: dia > hoje,
    }));
  }

  /** Dias da semana que já têm dados (até hoje). */
  function diasComDados(dias, hoje) {
    return (dias || []).filter((d) => d <= hoje);
  }

  /** Intensidade da célula em % (0 quando n = 0; até 22% no maior da linha). */
  function intensidadeCalor(n, max) {
    const v = Number(n) || 0;
    const m = Number(max) || 0;
    if (v <= 0 || m <= 0) return 0;
    const r = Math.min(1, v / m);
    return Math.round((CALOR_MIN_PCT + CALOR_FAIXA_PCT * r) * 10) / 10;
  }

  /**
   * Tabela da semana a partir da série por dia (veiculosDoDiaLib.serieVeiculosPorDia
   * só dos dias com dados) e da ordem dos tipos. Dia futuro = null ("—").
   * Linhas de tipo zeradas a semana toda saem (o Total fica sempre).
   * @returns {{ colunas, linhas: Array<{ tipo, valores: Array<number|null>, max, intensidades }>, pico: number }}
   */
  function tabelaDaSemana(serie, dias, hoje, tipos) {
    const colunas = colunasDaSemana(dias, hoje);
    const porDia = new Map((serie || []).map((s) => [s.dia, s]));
    const valorDe = (dia, pegar) => {
      if (dia > hoje) return null;
      const s = porDia.get(dia);
      return s ? pegar(s) : 0;
    };
    const montar = (tipo, pegar) => {
      const valores = colunas.map((c) => valorDe(c.dia, pegar));
      const nums = valores.filter((v) => v !== null);
      const max = nums.length ? Math.max(...nums) : 0;
      return { tipo, valores, max, intensidades: valores.map((v) => (v === null ? 0 : intensidadeCalor(v, max))) };
    };
    const total = montar('total', (s) => Number(s.total) || 0);
    const linhasTipo = (tipos || [])
      .map((t) => montar(t, (s) => Number(s.porTipo && s.porTipo[t]) || 0))
      .filter((l) => l.max > 0);
    // Maior total da semana (empate: o mais novo, como no gráfico antigo)
    let pico = -1;
    total.valores.forEach((v, i) => {
      if (v !== null && v > 0 && (pico < 0 || v >= total.valores[pico])) pico = i;
    });
    return { colunas, linhas: [total].concat(linhasTipo), pico };
  }

  /**
   * Status da câmera (cameraStatusLib.cameraStatus) → estado do ícone do topo.
   * 'on' verde, 'atencao' âmbar, 'off' vermelho, 'aguardando' azul.
   * `dica`: segunda linha do balão ("online · leitura agora").
   */
  function estadoIconeCamera(st) {
    const s = st && st.status;
    const quando = st && st.label ? String(st.label) : '';
    const leitura = quando === 'Agora' ? 'leitura agora' : quando ? `última leitura ${quando.toLowerCase()}` : '';
    if (s === 'online') return { estado: 'on', rotulo: 'online', dica: `online · ${leitura}` };
    if (s === 'alerta') return { estado: 'atencao', rotulo: 'sem leitura recente', dica: `sem leitura recente · ${leitura}` };
    if (s === 'offline') return { estado: 'off', rotulo: 'sem leitura', dica: `sem leitura · ${leitura}` };
    return { estado: 'aguardando', rotulo: 'aguardando a primeira leitura', dica: 'aguardando a primeira leitura' };
  }

  /** Traço do anel SVG (raio 26): "preenchido total" para stroke-dasharray. */
  function tracoDoAnel(pct, raio) {
    const r = Number(raio) || ANEL_RAIO;
    const c = 2 * Math.PI * r;
    const p = Math.max(0, Math.min(100, Number(pct) || 0));
    return `${(Math.round(c * p) / 100).toFixed(1)} ${c.toFixed(1)}`;
  }

  // Fotos das últimas passagens: "foto limpa + zoom no carro". A câmera
  // ALPHADIGI grava uma faixa preta no topo (data, placa, VL:xxKM/H, nome da
  // lombada); o recorte tira a faixa e aproxima o carro, sempre em caixa 16:9.
  // Os detalhes da passagem continuam com a foto inteira (com a faixa).
  // Padrão medido nas câmeras com o carro no terço de cima da imagem (o mais
  // comum). Origem = ponto fixo do zoom (transform-origin): com zoom s, o
  // centro visível fica em o + (50 − o)/s; o topo visível corta a faixa preta.
  const RECORTE_PADRAO = Object.freeze({
    mini: Object.freeze({ zoom: 2.2, x: 45, y: 14 }),
    destaque: Object.freeze({ zoom: 1.6, x: 42, y: 18 }),
  });
  // Ajuste por câmera (id ou modelo) no código, quando necessário. O ajuste de
  // cada câmera fica de preferência no banco: cameras.foto_enquadramento.
  const RECORTE_POR_CAMERA = Object.freeze({});

  const numeroEntre = (v, min, max, padrao) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? n : padrao;
  };

  /**
   * Recorte da miniatura da câmera: { zoom, x, y } (x/y = origem em %).
   * `tamanho`: 'mini' | 'destaque'. O ajuste do banco (camera.foto_enquadramento)
   * vence o por id, que vence o por modelo;
   * valor fora da faixa (zoom 1–3, origem 0–100) volta ao padrão.
   */
  function recorteDaFoto(camera, tamanho, ajustes) {
    const base = RECORTE_PADRAO[tamanho === 'destaque' ? 'destaque' : 'mini'];
    const mapa = ajustes || RECORTE_POR_CAMERA;
    const c = camera || {};
    const porModelo = (c.modelo && mapa[c.modelo] && mapa[c.modelo][tamanho]) || {};
    const porId = (c.id && mapa[c.id] && mapa[c.id][tamanho]) || {};
    const fe = c.foto_enquadramento;
    const doBanco = (fe && typeof fe === 'object' && fe[tamanho] && typeof fe[tamanho] === 'object') ? fe[tamanho] : {};
    const a = Object.assign({}, porModelo, porId, doBanco);
    return {
      zoom: numeroEntre(a.zoom, 1, 3, base.zoom),
      x: numeroEntre(a.x, 0, 100, base.x),
      y: numeroEntre(a.y, 0, 100, base.y),
    };
  }

  /** Estilo (variáveis CSS) do recorte, para o atributo style da foto. */
  function estiloRecorte(r) {
    return `--zoom:${Number(r.zoom)};--ox:${Number(r.x)}%;--oy:${Number(r.y)}%`;
  }

  /**
   * Linha de comparação com ontem no MESMO horário (00:00 até agora − 24 h).
   * hoje/ontem: { alertas, maxVel, dentroPct (null = sem passagem) }.
   * `bom` = melhor que ontem (menos alertas, máxima menor, mais dentro do limite).
   */
  function comparacaoComOntem(hoje, ontem) {
    const vazio = { texto: '', bom: false };
    if (!hoje || !ontem) return { alertas: vazio, maxVel: vazio, dentro: vazio };
    const seta = (d, sufixo) => (d === 0 ? 'igual a ontem' : `${d < 0 ? '▼' : '▲'} ${Math.abs(d)}${sufixo} vs ontem`);
    const dA = (Number(hoje.alertas) || 0) - (Number(ontem.alertas) || 0);
    const alertas = { texto: seta(dA, ''), bom: dA < 0 };
    const mOntem = Number(ontem.maxVel) || 0;
    const maxVel = mOntem > 0
      ? { texto: `ontem ${mOntem} km/h`, bom: (Number(hoje.maxVel) || 0) < mOntem }
      : { texto: 'ontem sem velocidade medida', bom: false };
    let dentro = vazio;
    if (hoje.dentroPct !== null && hoje.dentroPct !== undefined && ontem.dentroPct !== null && ontem.dentroPct !== undefined) {
      const dD = Math.round(Number(hoje.dentroPct) - Number(ontem.dentroPct));
      dentro = { texto: seta(dD, ' p.p.'), bom: dD > 0 };
    }
    return { alertas, maxVel, dentro };
  }

  /** "8ª" (o selo curto da lista); só da 2ª passagem do dia em diante. */
  function ordinalCurto(n) {
    return Number.isInteger(n) && n >= 2 ? `${n}ª` : '';
  }

  return Object.freeze({
    CALOR_MIN_PCT, CALOR_FAIXA_PCT, ANEL_RAIO, RECORTE_PADRAO, recorteDaFoto, estiloRecorte, comparacaoComOntem,
    somarDias, diaDaSemana, inicioDaSemana, diasDaSemana, rotuloSemana, rotuloSemanaLongo, podeAvancar,
    colunasDaSemana, diasComDados, intensidadeCalor, tabelaDaSemana, estadoIconeCamera, tracoDoAnel, ordinalCurto,
  });
});
