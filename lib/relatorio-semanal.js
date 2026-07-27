/**
 * RELATÓRIO SEMANAL DE CIRCULAÇÃO
 *
 * Calcula as métricas da semana por condomínio e renderiza o corpo do e-mail
 * enviado aos gestores.
 *
 * Tratamento da velocidade — alinhado ao manual da ALPHADIGI (Lombada PRO,
 * seção 11: o doppler ASV5300 coleta apenas de 10 a 250 km/h):
 *
 *   < 10 km/h   → veículo passou abaixo do piso do sensor. NÃO é falha: é
 *                 condutor em velocidade de segurança. Conta como conformidade,
 *                 mas fica FORA da média (senão puxa o número para baixo — é o
 *                 bug que o loadIndicators do dashboard tinha).
 *   10–250 km/h → medição válida, entra na média.
 *   > 250 km/h  → acima do teto do próprio sensor. Descartado de todos os
 *                 indicadores e reportado à parte, por transparência.
 *
 * O registro da passagem nunca é descartado — a captura é também rastreabilidade.
 * O que muda aqui é apenas como o número entra no indicador.
 */

const { escapeHtml } = require('./validators');

const TZ = 'America/Bahia';
const PISO_DOPPLER = 10;   // manual, seção 11
const TETO_DOPPLER = 250;  // manual, seção 11

const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
  'quinta-feira', 'sexta-feira', 'sábado'];

const TEMPLATE_PADRAO = `Prezado(a) {{NOME_DESTINATARIO}},

Segue o resumo semanal de circulação do {{CONDOMINIO}}, referente ao período de {{PERIODO_INICIO}} a {{PERIODO_FIM}}.

Nesta semana foram registradas {{TOTAL_PASSAGENS}} passagens de {{PLACAS_DISTINTAS}} veículos distintos. Destas, {{ACIMA_LIMITE}} ocorreram acima do limite de {{LIMITE}} km/h estabelecido para a via.

{{CONFORMIDADE}}% dos condutores trafegaram dentro do limite — {{VARIACAO_SEMANA}} em relação à semana anterior.

O ponto de maior atenção foi {{PONTO_CRITICO}}, com concentração por volta das {{HORA_PICO}}. {{REINCIDENTES}} veículos apresentaram passagens acima do limite em mais de uma ocasião.

Os dados completos, com fotos e histórico por veículo, estão disponíveis no painel. Permanecemos à disposição para apoiar as ações de conscientização que a administração julgar convenientes.

Atenciosamente,
Protector Traffic Control`;

// ── Fuso horário ────────────────────────────────────────────────────────────
// Crons da Vercel rodam em UTC. Todo o agendamento é avaliado em America/Bahia
// para que "segunda às 8h" signifique 8h em Salvador, e não 5h.

/**
 * Deslocamento do fuso no formato "-03:00", derivado do Intl (não hardcoded,
 * para sobreviver a uma eventual volta do horário de verão).
 */
function offsetTz(date = new Date()) {
  const parte = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(date).find((p) => p.type === 'timeZoneName');
  const bruto = (parte?.value || 'GMT-03:00').replace('GMT', '');
  return bruto || '+00:00';
}

/**
 * Componentes da data no fuso local.
 * @returns {{ano:number, mes:number, dia:number, hora:number, dow:number, iso:string}}
 */
function agoraLocal(date = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(date).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value])
  );
  const iso = `${p.year}-${p.month}-${p.day}`;
  // Meio-dia UTC evita que a conversão caia no dia anterior por causa do offset
  const dow = new Date(`${iso}T12:00:00Z`).getUTCDay();
  // hourCycle h23 pode devolver "24" para meia-noite em alguns ambientes
  const hora = p.hour === '24' ? 0 : +p.hour;
  return { ano: +p.year, mes: +p.month, dia: +p.day, hora, dow, iso };
}

function somarDias(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatarBR(iso) {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

/**
 * Janela de 7 dias encerrada ontem (relativo à data local de referência).
 * Enviando na segunda, cobre de segunda a domingo da semana anterior.
 */
function janelaSemanal(isoRef) {
  const fim = somarDias(isoRef, -1);
  const inicio = somarDias(fim, -6);
  const off = offsetTz();
  return {
    inicio,
    fim,
    tsInicio: `${inicio}T00:00:00${off}`,
    tsFim: `${fim}T23:59:59.999${off}`,
  };
}

// ── Coleta ──────────────────────────────────────────────────────────────────

/**
 * Busca todas as capturas do período. Pagina porque o PostgREST limita a
 * resposta (1000 linhas por padrão) e uma semana do Enseada passa de 15 mil.
 */
async function buscarCapturas(supabase, clienteId, tsInicio, tsFim) {
  const PAGINA = 1000;
  const todas = [];
  for (let offset = 0; ; offset += PAGINA) {
    const { data, error } = await supabase
      .from('capturas')
      .select('placa, velocidade, timestamp, camera_id, velocidade_invalida')
      .eq('cliente_id', clienteId)
      .gte('timestamp', tsInicio)
      .lte('timestamp', tsFim)
      .order('timestamp', { ascending: true })
      .range(offset, offset + PAGINA - 1);

    if (error) throw new Error(`capturas: ${error.message}`);
    if (!data || data.length === 0) break;
    todas.push(...data);
    if (data.length < PAGINA) break;
  }
  return todas;
}

/**
 * Só a contagem de excessos — usado para comparar com a semana anterior.
 * Aplica os mesmos descartes da semana corrente (leitura inválida e acima do
 * teto do doppler); sem isso a comparação entre semanas ficaria enviesada.
 */
async function contarAcimaLimite(supabase, clienteId, tsInicio, tsFim, limite) {
  const { count, error } = await supabase
    .from('capturas')
    .select('*', { count: 'exact', head: true })
    .eq('cliente_id', clienteId)
    .gte('timestamp', tsInicio)
    .lte('timestamp', tsFim)
    .gt('velocidade', limite)
    .lte('velocidade', TETO_DOPPLER)
    .not('velocidade_invalida', 'is', true);

  if (error) throw new Error(`contagem anterior: ${error.message}`);
  return count || 0;
}

// ── Cálculo ─────────────────────────────────────────────────────────────────

/**
 * Consolida as métricas da semana.
 *
 * @param {object} supabase - client com service_role
 * @param {object} cliente  - registro de clientes (precisa de id, nome, limite_velocidade)
 * @param {string} isoRef   - data local de referência (dia do envio)
 * @param {Map<string,string>} nomesCameras - camera_id → nome
 */
async function calcularMetricas(supabase, cliente, isoRef, nomesCameras = new Map()) {
  const limite = cliente.limite_velocidade;
  const janela = janelaSemanal(isoRef);
  const anterior = janelaSemanal(janela.inicio);

  const capturas = await buscarCapturas(supabase, cliente.id, janela.tsInicio, janela.tsFim);

  const placas = new Set();
  const excessosPorPlaca = new Map();
  const excessosPorCamera = new Map();
  const passagensPorCamera = new Map();
  const excessosPorHora = new Array(24).fill(0);
  const porDia = new Map(); // 'YYYY-MM-DD' → { passagens, acima }

  let acimaLimite = 0;
  let abaixoPiso = 0;
  let foraFaixa = 0;
  let somaValidas = 0;
  let qtdValidas = 0;
  let picoVelocidade = 0;

  for (const c of capturas) {
    const v = c.velocidade;

    // Leitura descartada: ou o sanity-cap da captura já a marcou (radar
    // reportou acima do teto plausível do cliente e a velocidade foi zerada),
    // ou o valor passa do teto físico do doppler. Nos dois casos sai de TODOS
    // os indicadores — sem isso, uma leitura espúria zerada seria lida como
    // "veículo abaixo de 10 km/h" e entraria como conformidade.
    if (c.velocidade_invalida === true || v > TETO_DOPPLER) { foraFaixa++; continue; }

    placas.add(c.placa);
    passagensPorCamera.set(c.camera_id, (passagensPorCamera.get(c.camera_id) || 0) + 1);

    // Dia local (não UTC) — senão passagens da madrugada caem no dia anterior
    const diaLocal = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(c.timestamp));
    if (!porDia.has(diaLocal)) porDia.set(diaLocal, { passagens: 0, acima: 0 });
    porDia.get(diaLocal).passagens++;

    if (v < PISO_DOPPLER) {
      // Abaixo do piso do doppler — conforme, mas sem medição utilizável
      abaixoPiso++;
    } else {
      somaValidas += v;
      qtdValidas++;
      if (v > picoVelocidade) picoVelocidade = v;
    }

    if (v > limite) {
      acimaLimite++;
      porDia.get(diaLocal).acima++;
      excessosPorPlaca.set(c.placa, (excessosPorPlaca.get(c.placa) || 0) + 1);
      excessosPorCamera.set(c.camera_id, (excessosPorCamera.get(c.camera_id) || 0) + 1);
      const h = new Date(c.timestamp).toLocaleString('en-US', { timeZone: TZ, hour: '2-digit', hour12: false });
      const hi = parseInt(h, 10);
      if (Number.isInteger(hi) && hi >= 0 && hi < 24) excessosPorHora[hi]++;
    }
  }

  const totalValido = capturas.length - foraFaixa;
  const conformidade = totalValido > 0
    ? Math.round(((totalValido - acimaLimite) / totalValido) * 1000) / 10
    : 100;

  const reincidentes = [...excessosPorPlaca.values()].filter((n) => n > 1).length;

  // Ponto crítico: câmera com mais excessos
  let pontoCritico = '—';
  let maiorExcesso = 0;
  for (const [camId, n] of excessosPorCamera) {
    if (n > maiorExcesso) { maiorExcesso = n; pontoCritico = nomesCameras.get(camId) || camId; }
  }

  // Hora de pico dos excessos
  let horaPico = null;
  let maiorHora = 0;
  excessosPorHora.forEach((n, h) => { if (n > maiorHora) { maiorHora = n; horaPico = h; } });

  // Comparação com a semana anterior
  const acimaAnterior = await contarAcimaLimite(
    supabase, cliente.id, anterior.tsInicio, anterior.tsFim, limite
  );

  let variacaoTexto = 'sem base de comparação';
  let variacaoPct = null;
  if (acimaAnterior > 0) {
    variacaoPct = Math.round(((acimaLimite - acimaAnterior) / acimaAnterior) * 100);
    if (variacaoPct < 0) variacaoTexto = `uma redução de ${Math.abs(variacaoPct)}% nos excessos`;
    else if (variacaoPct > 0) variacaoTexto = `um aumento de ${variacaoPct}% nos excessos`;
    else variacaoTexto = 'estável';
  } else if (acimaLimite > 0) {
    variacaoTexto = 'primeira semana com registros de excesso';
  } else {
    variacaoTexto = 'sem excessos nas duas semanas';
  }

  const topPlacas = [...excessosPorPlaca.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([placa, vezes]) => ({ placa, vezes }));

  // Quebra por câmera, ordenada por excessos (alimenta o PDF consolidado)
  const porCamera = [...passagensPorCamera.entries()]
    .map(([camId, passagens]) => ({
      camera: nomesCameras.get(camId) || camId,
      passagens,
      acima: excessosPorCamera.get(camId) || 0,
    }))
    .sort((a, b) => b.acima - a.acima || b.passagens - a.passagens);

  // Série diária cobrindo os 7 dias, inclusive os sem movimento
  const serieDiaria = [];
  for (let i = 0; i < 7; i++) {
    const dia = somarDias(janela.inicio, i);
    const d = porDia.get(dia) || { passagens: 0, acima: 0 };
    serieDiaria.push({ dia, rotulo: formatarBR(dia).slice(0, 5), ...d });
  }

  return {
    periodo_inicio: janela.inicio,
    periodo_fim: janela.fim,
    ts_inicio: janela.tsInicio,
    ts_fim: janela.tsFim,
    limite,
    total_passagens: capturas.length,
    total_valido: totalValido,
    placas_distintas: placas.size,
    acima_limite: acimaLimite,
    acima_anterior: acimaAnterior,
    variacao_pct: variacaoPct,
    variacao_texto: variacaoTexto,
    abaixo_piso: abaixoPiso,
    fora_faixa: foraFaixa,
    vel_media: qtdValidas > 0 ? Math.round((somaValidas / qtdValidas) * 10) / 10 : 0,
    pico_velocidade: picoVelocidade,
    conformidade,
    reincidentes,
    ponto_critico: pontoCritico,
    ponto_critico_qtd: maiorExcesso,
    hora_pico: horaPico,
    top_placas: topPlacas,
    por_camera: porCamera,
    serie_diaria: serieDiaria,
  };
}

// ── Renderização ────────────────────────────────────────────────────────────

const N = (v) => Number(v).toLocaleString('pt-BR');

/** Mapa de variáveis {{VAR}} → valor, para o template do cliente. */
function montarVariaveis(m, cliente, destinatario) {
  return {
    NOME_DESTINATARIO: destinatario?.nome || 'Gestor(a)',
    CONDOMINIO: cliente.nome,
    PERIODO_INICIO: formatarBR(m.periodo_inicio),
    PERIODO_FIM: formatarBR(m.periodo_fim),
    TOTAL_PASSAGENS: N(m.total_passagens),
    PLACAS_DISTINTAS: N(m.placas_distintas),
    ACIMA_LIMITE: N(m.acima_limite),
    LIMITE: String(m.limite),
    CONFORMIDADE: String(m.conformidade).replace('.', ','),
    VARIACAO_SEMANA: m.variacao_texto,
    PONTO_CRITICO: m.ponto_critico,
    HORA_PICO: m.hora_pico === null ? '—' : `${String(m.hora_pico).padStart(2, '0')}h`,
    REINCIDENTES: N(m.reincidentes),
    VEL_MEDIA: String(m.vel_media).replace('.', ','),
    LOCAL_VIA: cliente.local_via || '',
  };
}

/** Substitui {{VAR}} pelos valores. Variável desconhecida vira string vazia. */
function renderTemplate(texto, vars) {
  return String(texto || '').replace(/\{\{\s*([A-Z_]+)\s*\}\}/g, (_, chave) =>
    Object.prototype.hasOwnProperty.call(vars, chave) ? vars[chave] : ''
  );
}

/**
 * Monta o HTML do e-mail: cabeçalho, painel de indicadores, o corpo escrito
 * pelo gestor e o botão que leva ao relatório completo.
 *
 * Todo dado interpolado passa por escapeHtml — nome de destinatário, nome de
 * câmera e nome de condomínio são conteúdo editável.
 */
function montarEmailHtml({ metricas: m, cliente, destinatario, corpoTexto, linkRelatorio }) {
  const vars = montarVariaveis(m, cliente, destinatario);
  const corpo = renderTemplate(corpoTexto || TEMPLATE_PADRAO, vars);

  const paragrafos = corpo.split(/\n{2,}/).map((p) =>
    `<p style="margin:0 0 13px;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`
  ).join('');

  const corVariacao = m.variacao_pct === null ? '#7A8791' : (m.variacao_pct <= 0 ? '#16803C' : '#C2410C');
  const setaVariacao = m.variacao_pct === null ? '' : (m.variacao_pct <= 0 ? '↓' : '↑');
  const legendaVariacao = m.variacao_pct === null
    ? 'sem base anterior'
    : `${setaVariacao} ${Math.abs(m.variacao_pct)}% vs. semana anterior`;

  const kpi = (rotulo, valor, sub, cor) => `
    <td style="background:#fff;padding:13px 12px;vertical-align:top;">
      <div style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#7A8791;margin-bottom:5px;">${rotulo}</div>
      <div style="font-size:22px;font-weight:700;line-height:1.1;color:${cor || '#1e293b'};">${valor}</div>
      <div style="font-size:11px;color:#7A8791;margin-top:3px;">${sub}</div>
    </td>`;

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Resumo Semanal — ${escapeHtml(cliente.nome)}</title></head>
<body style="margin:0;padding:0;background:#F5F5F5;">
<div style="max-width:600px;margin:0 auto;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#333;">

  <div style="background:#046BD2;color:#fff;padding:20px;">
    <h1 style="margin:0;font-size:17px;font-weight:700;">Resumo Semanal de Circulação</h1>
    <p style="margin:6px 0 0;font-size:12.5px;opacity:.9;">
      ${escapeHtml(cliente.nome)} · ${formatarBR(m.periodo_inicio)} a ${formatarBR(m.periodo_fim)}
    </p>
  </div>

  <div style="padding:22px;font-size:14px;line-height:1.62;">
    <table role="presentation" cellpadding="0" cellspacing="1" border="0"
           style="width:100%;background:#E4E9ED;border:1px solid #E4E9ED;border-radius:6px;margin:0 0 18px;">
      <tr>
        ${kpi('Passagens', N(m.total_passagens), `${N(m.placas_distintas)} veículos distintos`)}
        ${kpi('Acima do limite', N(m.acima_limite), `limite de ${m.limite} km/h`, '#C2410C')}
      </tr>
      <tr>
        ${kpi('Conformidade', `${String(m.conformidade).replace('.', ',')}%`, legendaVariacao, corVariacao)}
        ${kpi('Reincidentes', N(m.reincidentes), '2+ excessos na semana')}
      </tr>
    </table>

    ${paragrafos}

    <div style="text-align:center;padding:10px 0 4px;">
      <a href="${linkRelatorio}"
         style="display:inline-block;background:#046BD2;color:#fff;text-decoration:none;padding:11px 26px;border-radius:6px;font-size:14px;font-weight:700;">
        Ver relatório completo
      </a>
    </div>
    <div style="font-size:11.5px;color:#7A8791;text-align:center;margin-top:9px;">
      Link exclusivo para ${escapeHtml(destinatario?.nome || 'você')} · válido por 30 dias
    </div>
  </div>

  <div style="border-top:1px solid #E4E9ED;padding:16px 22px;font-size:11px;color:#8A959D;text-align:center;line-height:1.55;">
    Protector — Sistemas de Segurança Eletrônica · CNPJ 21.747.444/0001-65<br>
    Você recebe este resumo por estar cadastrado como destinatário de relatórios
    do ${escapeHtml(cliente.nome)}.
  </div>

</div></body></html>`;
}

module.exports = {
  TZ,
  PISO_DOPPLER,
  TETO_DOPPLER,
  TEMPLATE_PADRAO,
  DIAS_SEMANA,
  offsetTz,
  agoraLocal,
  janelaSemanal,
  formatarBR,
  calcularMetricas,
  montarVariaveis,
  renderTemplate,
  montarEmailHtml,
};
