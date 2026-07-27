/**
 * PÁGINA DO RELATÓRIO SEMANAL — destino do link enviado por e-mail
 *
 * GET /relatorio?t=<token>
 *
 * Resolve o token, registra o acesso e renderiza o relatório completo.
 *
 * Por que link tokenizado e não pixel de rastreamento:
 *   O pixel é servido por proxy no Gmail (registraria o proxy, não a pessoa) e
 *   é rastreamento de comportamento sem consentimento — incompatível com a
 *   política de privacidade e o canal de direitos do titular que o produto
 *   publica. O clique é uma ação deliberada do destinatário, funciona em
 *   qualquer cliente de e-mail e mede engajamento real, não "abertura" (que o
 *   painel de visualização do Outlook dispara sem ninguém ler).
 *
 * O token dá acesso apenas ao relatório agregado daquele período — sem placas
 * individuais, sem fotos. Detalhe por veículo continua exigindo login no painel.
 */

const { createClient } = require('@supabase/supabase-js');
const { checkAdminRateLimit } = require('../lib/rate-limiter');
const { escapeHtml } = require('../lib/validators');
const { formatarBR } = require('../lib/relatorio-semanal');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const VALIDADE_DIAS = 30;

function paginaErro(titulo, mensagem) {
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(titulo)}</title>
<style>
  body{margin:0;background:#F0F5FA;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
       color:#1e293b;display:grid;place-items:center;min-height:100vh;padding:24px;}
  .card{background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.06);padding:40px;max-width:440px;text-align:center;}
  h1{font-size:20px;margin:0 0 12px;}
  p{color:#64748b;font-size:14px;line-height:1.6;margin:0;}
  a{color:#046bd2;}
</style></head>
<body><div class="card">
  <h1>${escapeHtml(titulo)}</h1>
  <p>${mensagem}</p>
</div></body></html>`;
}

function paginaRelatorio(envio, cliente, m) {
  const N = (v) => Number(v ?? 0).toLocaleString('pt-BR');
  const pct = (v) => String(v ?? 0).replace('.', ',');

  const variacao = m.variacao_pct === null || m.variacao_pct === undefined
    ? { txt: 'sem base de comparação', cor: '#64748b' }
    : m.variacao_pct <= 0
      ? { txt: `↓ ${Math.abs(m.variacao_pct)}% vs. semana anterior`, cor: '#16803C' }
      : { txt: `↑ ${m.variacao_pct}% vs. semana anterior`, cor: '#C2410C' };

  const topPlacas = (m.top_placas || []).length
    ? m.top_placas.map((p, i) => `
        <tr>
          <td style="color:#94a3b8;font-variant-numeric:tabular-nums;">${i + 1}</td>
          <td style="font-weight:600;letter-spacing:1px;">${escapeHtml(p.placa)}</td>
          <td style="text-align:right;font-variant-numeric:tabular-nums;">${N(p.vezes)}</td>
        </tr>`).join('')
    : '<tr><td colspan="3" style="color:#94a3b8;padding:16px 0;">Nenhum excesso registrado no período.</td></tr>';

  const kpi = (rot, val, sub, cor) => `
    <div class="kpi">
      <div class="kpi-l">${rot}</div>
      <div class="kpi-v" style="color:${cor || '#1e293b'}">${val}</div>
      <div class="kpi-s">${sub}</div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Resumo Semanal — ${escapeHtml(cliente.nome)}</title>
<style>
  :root{--accent:#046bd2;--bg:#F0F5FA;--card:#fff;--ink:#1e293b;--ink2:#64748b;--ink3:#94a3b8;
        --border:#e2e8f0;--radius:12px;--shadow:0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04);}
  *{box-sizing:border-box;}
  body{margin:0;background:var(--bg);color:var(--ink);
       font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
       font-size:15px;line-height:1.6;padding:0 16px 64px;}
  .wrap{max-width:840px;margin:0 auto;}
  header{padding:36px 0 24px;}
  .brand{font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--accent);margin-bottom:10px;}
  h1{font-size:clamp(22px,4vw,30px);line-height:1.15;margin:0 0 8px;letter-spacing:-.02em;}
  .sub{color:var(--ink2);font-size:14px;}
  .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:24px 0;}
  .kpi{background:var(--card);border-radius:var(--radius);box-shadow:var(--shadow);padding:18px;}
  .kpi-l{font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--ink3);font-weight:700;margin-bottom:8px;}
  .kpi-v{font-size:28px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;}
  .kpi-s{font-size:12px;color:var(--ink2);margin-top:6px;}
  .card{background:var(--card);border-radius:var(--radius);box-shadow:var(--shadow);padding:22px;margin-bottom:16px;}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.8px;color:var(--ink2);margin:0 0 14px;font-weight:700;}
  table{width:100%;border-collapse:collapse;font-size:14px;}
  td,th{padding:9px 0;border-bottom:1px solid #f1f5f9;text-align:left;}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--ink3);font-weight:700;}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
  @media(max-width:620px){.grid2{grid-template-columns:1fr;}}
  .row{display:flex;justify-content:space-between;gap:16px;padding:9px 0;border-bottom:1px solid #f1f5f9;}
  .row:last-child{border-bottom:0;}
  .row span:last-child{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;}
  .nota{font-size:12.5px;color:var(--ink2);background:#e8f1fb;border-left:3px solid var(--accent);
        border-radius:8px;padding:14px 16px;margin-top:6px;}
  footer{margin-top:28px;padding-top:20px;border-top:1px solid var(--border);
         font-size:12px;color:var(--ink3);text-align:center;line-height:1.6;}
</style></head>
<body><div class="wrap">

  <header>
    <div class="brand">Protector Traffic Control</div>
    <h1>Resumo Semanal de Circulação</h1>
    <div class="sub">
      ${escapeHtml(cliente.nome)}${cliente.local_via ? ' · ' + escapeHtml(cliente.local_via) : ''}<br>
      Período de ${formatarBR(envio.periodo_inicio)} a ${formatarBR(envio.periodo_fim)}
    </div>
  </header>

  <div class="kpis">
    ${kpi('Passagens', N(m.total_passagens), `${N(m.placas_distintas)} veículos distintos`)}
    ${kpi('Acima do limite', N(m.acima_limite), `limite de ${m.limite} km/h`, '#C2410C')}
    ${kpi('Conformidade', pct(m.conformidade) + '%', variacao.txt, variacao.cor)}
    ${kpi('Reincidentes', N(m.reincidentes), '2+ excessos na semana')}
  </div>

  <div class="grid2">
    <div class="card">
      <h2>Perfil de velocidade</h2>
      <div class="row"><span>Velocidade média medida</span><span>${pct(m.vel_media)} km/h</span></div>
      <div class="row"><span>Maior velocidade registrada</span><span>${N(m.pico_velocidade)} km/h</span></div>
      <div class="row"><span>Passagens abaixo de 10 km/h</span><span>${N(m.abaixo_piso)}</span></div>
      <div class="row"><span>Ponto de maior atenção</span><span>${escapeHtml(String(m.ponto_critico || '—'))}</span></div>
      <div class="row"><span>Horário de concentração</span><span>${m.hora_pico === null || m.hora_pico === undefined ? '—' : String(m.hora_pico).padStart(2, '0') + 'h'}</span></div>
    </div>

    <div class="card">
      <h2>Veículos com mais excessos</h2>
      <table>
        <thead><tr><th style="width:28px">#</th><th>Placa</th><th style="text-align:right">Excessos</th></tr></thead>
        <tbody>${topPlacas}</tbody>
      </table>
    </div>
  </div>

  <div class="card">
    <h2>Como ler estes números</h2>
    <p style="margin:0 0 12px;font-size:14px;color:var(--ink2);">
      As passagens abaixo de 10 km/h aparecem separadas porque o sensor de
      velocidade da lombada só mede a partir dessa faixa. Elas contam como
      conformidade — são condutores em velocidade de segurança — mas ficam de
      fora do cálculo da média, que considera apenas medições efetivas.
    </p>
    ${m.fora_faixa > 0 ? `<div class="nota">
      ${N(m.fora_faixa)} leitura(s) foram descartadas deste relatório por
      ultrapassar o teto de sanidade do radar. Acima desse valor a medição
      indica ruído do equipamento — reflexo ou veículo grande manobrando — e
      não velocidade real. As passagens seguem registradas; apenas não entram
      nos indicadores.
    </div>` : ''}
  </div>

  <footer>
    Relatório gerado para ${escapeHtml(envio.destinatario_nome || envio.destinatario_email)}.<br>
    Protector — Sistemas de Segurança Eletrônica · CNPJ 21.747.444/0001-65<br>
    Dados detalhados por veículo, com fotos, estão disponíveis no painel mediante login.
  </footer>

</div></body></html>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).send(paginaErro('Método não permitido', 'Use GET para acessar o relatório.'));
  }

  // Rate limit por IP — o token é secreto, mas isso freia tentativa de varredura
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  if (!checkAdminRateLimit(`relatorio:${ip}`, 30, 60 * 1000).allowed) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(429).send(paginaErro('Muitas requisições', 'Aguarde um minuto e tente novamente.'));
  }

  const token = req.query.t;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  if (!token || typeof token !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) {
    return res.status(400).send(paginaErro('Link inválido', 'O endereço acessado não corresponde a um relatório válido.'));
  }

  try {
    const { data: envio, error } = await supabase
      .from('relatorio_envios')
      .select('*, clientes(nome, local_via)')
      .eq('token', token)
      .single();

    if (error || !envio) {
      return res.status(404).send(paginaErro(
        'Relatório não encontrado',
        'Este link não é válido. Se você recebeu o resumo por e-mail, tente abrir o link mais recente.'
      ));
    }

    // Validade de 30 dias a partir da geração
    const idadeDias = (Date.now() - new Date(envio.criado_em).getTime()) / 86400000;
    if (idadeDias > VALIDADE_DIAS) {
      return res.status(410).send(paginaErro(
        'Link expirado',
        `Este relatório ficou disponível por ${VALIDADE_DIAS} dias. Os dados continuam acessíveis no painel mediante login.`
      ));
    }

    // Registra o acesso — primeira vez marca visto_em, demais só incrementam
    await supabase
      .from('relatorio_envios')
      .update({
        visto_em: envio.visto_em || new Date().toISOString(),
        visto_count: (envio.visto_count || 0) + 1,
      })
      .eq('id', envio.id);

    const metricas = envio.metricas || {};
    const cliente = envio.clientes || { nome: '—', local_via: '' };

    return res.status(200).send(paginaRelatorio(envio, cliente, metricas));
  } catch (err) {
    console.error('[relatorio] Erro:', err.message);
    return res.status(500).send(paginaErro('Erro ao carregar', 'Não foi possível montar o relatório agora. Tente novamente em instantes.'));
  }
};
