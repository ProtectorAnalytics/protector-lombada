/**
 * CRON — Monitoramento de Prazos LGPD (Art. 19)
 *
 * Roda diariamente (via Vercel Cron) e:
 *   1. Identifica solicitações abertas com prazo próximo (<= 3 dias) ou vencidas
 *   2. Envia e-mail consolidado ao DPO (dpo@appps.com.br) com a lista
 *   3. Não reenvia alertas repetidos no mesmo dia (idempotente)
 *
 * Prazo legal: 15 dias corridos (Art. 19 LGPD)
 */

const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const DPO_EMAIL = 'dpo@appps.com.br';

const TIPO_LABELS = {
  confirmacao: 'Confirmação de tratamento',
  acesso: 'Acesso aos dados',
  correcao: 'Correção',
  anonimizacao: 'Anonimização/bloqueio',
  portabilidade: 'Portabilidade',
  eliminacao: 'Eliminação',
  informacao_compartilhamento: 'Compartilhamento',
  revogacao_consentimento: 'Revogação',
  reclamacao: 'Reclamação',
  outro: 'Outro',
};

function createTransporter() {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '465', 10),
      secure: (process.env.SMTP_SECURE || 'true') === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      tls: { rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== 'false' },
    });
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_USER || process.env.GMAIL_USER,
      pass: process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD,
    },
  });
}

function diasRestantes(prazoLimite) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const prazo = new Date(prazoLimite);
  prazo.setHours(0, 0, 0, 0);
  return Math.floor((prazo - hoje) / 86400000);
}

function renderTabela(solicitacoes) {
  if (!solicitacoes || solicitacoes.length === 0) return '';

  const rows = solicitacoes.map((s) => {
    const dias = diasRestantes(s.prazo_limite);
    const status = dias < 0
      ? `<span style="color:#F87171;font-weight:700">VENCIDA (${Math.abs(dias)}d)</span>`
      : dias === 0
        ? `<span style="color:#F97316;font-weight:700">VENCE HOJE</span>`
        : `<span style="color:#F97316">${dias} dia(s)</span>`;

    return `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px;">${s.protocolo}</td>
        <td style="padding:10px;border-bottom:1px solid #eee;">${s.nome}<br><span style="color:#666;font-size:11px;">${s.email}</span></td>
        <td style="padding:10px;border-bottom:1px solid #eee;font-size:12px;">${TIPO_LABELS[s.tipo] || s.tipo}</td>
        <td style="padding:10px;border-bottom:1px solid #eee;font-size:12px;">${s.status}</td>
        <td style="padding:10px;border-bottom:1px solid #eee;">${status}</td>
      </tr>
    `;
  }).join('');

  return `
    <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #ddd;border-radius:6px;overflow:hidden;">
      <thead>
        <tr style="background:#046BD2;color:#fff;">
          <th style="padding:12px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Protocolo</th>
          <th style="padding:12px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Solicitante</th>
          <th style="padding:12px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Tipo</th>
          <th style="padding:12px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Status</th>
          <th style="padding:12px;text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Prazo</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

async function jaEnviadoHoje() {
  const hojeInicio = new Date();
  hojeInicio.setHours(0, 0, 0, 0);

  const { data } = await supabase
    .from('debug_log')
    .select('id')
    .eq('content_type', 'cron-prazos-lgpd-sent')
    .gte('timestamp', hojeInicio.toISOString())
    .limit(1);

  return data && data.length > 0;
}

async function marcarEnviado(resumo) {
  try {
    await supabase.from('debug_log').insert({
      content_type: 'cron-prazos-lgpd-sent',
      raw_body: 'OK',
      parsed_json: resumo,
    });
  } catch (err) {
    // Silencioso — se o debug_log não existir, não quebra o cron
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // Autorização: Vercel Cron nativo ou Bearer secret
  const vercelHeader = req.headers['x-vercel-cron-signature'];
  const authHeader = req.headers['authorization'] || '';
  const expectedSecret = `Bearer ${process.env.CRON_SECRET}`;

  if (!vercelHeader && authHeader !== expectedSecret) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  try {
    // Idempotência: se já enviou hoje, pular
    if (await jaEnviadoHoje()) {
      return res.status(200).json({
        ok: true,
        skipped: 'Alerta já enviado hoje',
        timestamp: new Date().toISOString(),
      });
    }

    const hoje = new Date().toISOString().split('T')[0];
    const tresDiasFrente = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];

    // Vencidas (prazo < hoje)
    const { data: vencidas = [] } = await supabase
      .from('solicitacoes_titular')
      .select('id, protocolo, nome, email, tipo, status, prazo_limite, criada_em')
      .lt('prazo_limite', hoje)
      .not('status', 'in', '("atendida","rejeitada","cancelada")')
      .order('prazo_limite', { ascending: true })
      .limit(100);

    // Próximas do vencimento (hoje <= prazo <= hoje+3)
    const { data: proximas = [] } = await supabase
      .from('solicitacoes_titular')
      .select('id, protocolo, nome, email, tipo, status, prazo_limite, criada_em')
      .gte('prazo_limite', hoje)
      .lte('prazo_limite', tresDiasFrente)
      .not('status', 'in', '("atendida","rejeitada","cancelada")')
      .order('prazo_limite', { ascending: true })
      .limit(100);

    // Se nada a alertar, retornar silenciosamente
    if (vencidas.length === 0 && proximas.length === 0) {
      return res.status(200).json({
        ok: true,
        vencidas: 0,
        proximas: 0,
        mensagem: 'Nenhuma solicitação em alerta hoje.',
        timestamp: new Date().toISOString(),
      });
    }

    // Montar e-mail
    const transporter = createTransporter();
    const fromAddress = process.env.SMTP_USER || process.env.GMAIL_USER || 'noreply@appps.com.br';
    const hojeStr = new Date().toLocaleDateString('pt-BR');

    const urgente = vencidas.length > 0;
    const assunto = urgente
      ? `[URGENTE] ${vencidas.length} solicitação(ões) LGPD VENCIDA(S) - Protector`
      : `[LGPD] ${proximas.length} solicitação(ões) próxima(s) do prazo - Protector`;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;padding:20px;background:#f5f5f5;">
        <div style="background:${urgente ? '#DC2626' : '#F97316'};color:#fff;padding:20px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;font-size:18px;">${urgente ? '⚠️ Solicitações LGPD vencidas' : '⏰ Solicitações LGPD próximas do prazo'}</h2>
          <p style="margin:8px 0 0;font-size:13px;opacity:0.9;">Alerta diário · ${hojeStr}</p>
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;border:1px solid #ddd;">
          <p>Olá, DPO.</p>
          <p>Este é o alerta diário de monitoramento de prazos da LGPD. O prazo legal de resposta ao titular é de <strong>15 dias corridos</strong> (Art. 19).</p>

          ${vencidas.length > 0 ? `
            <h3 style="margin:24px 0 12px;color:#DC2626;font-size:16px;">🔴 VENCIDAS (${vencidas.length})</h3>
            <p style="margin:0 0 12px;font-size:13px;color:#666;">As solicitações abaixo já ultrapassaram o prazo legal. Resposta imediata é recomendada.</p>
            ${renderTabela(vencidas)}
          ` : ''}

          ${proximas.length > 0 ? `
            <h3 style="margin:24px 0 12px;color:#F97316;font-size:16px;">🟡 PRÓXIMAS DO VENCIMENTO (${proximas.length})</h3>
            <p style="margin:0 0 12px;font-size:13px;color:#666;">Solicitações com prazo em até 3 dias.</p>
            ${renderTabela(proximas)}
          ` : ''}

          <div style="margin-top:28px;padding:16px;background:#f0f9ff;border-left:3px solid #046BD2;border-radius:4px;">
            <p style="margin:0;font-size:13px;color:#333;">
              <strong>Acesse o painel admin</strong> para responder:<br>
              <a href="https://protector-lombada.vercel.app/admin#direitos" style="color:#046BD2;">https://protector-lombada.vercel.app/admin</a> → seção Direitos LGPD
            </p>
          </div>

          <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">

          <p style="font-size:12px;color:#666;margin:4px 0;">
            Este e-mail é automático — enviado diariamente às 09h UTC quando há solicitações em alerta.<br>
            Protector — Sistemas de Segurança · CNPJ 21.747.444/0001-65 · Salvador/BA
          </p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"Protector LGPD Alerts" <${fromAddress}>`,
      to: DPO_EMAIL,
      subject: assunto,
      html,
    });

    // Marcar como enviado (idempotência)
    await marcarEnviado({
      vencidas: vencidas.length,
      proximas: proximas.length,
      enviado_em: new Date().toISOString(),
    });

    return res.status(200).json({
      ok: true,
      vencidas: vencidas.length,
      proximas: proximas.length,
      email_enviado: true,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[cron-prazos-lgpd] Erro:', err?.message);
    return res.status(500).json({ error: 'Erro interno', detalhes: err?.message });
  }
};
