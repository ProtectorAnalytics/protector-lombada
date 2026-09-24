/**
 * ENDPOINT PÚBLICO — Solicitar proposta (formulário do site)
 *
 * Recebe o contato comercial do formulário "Solicite uma proposta" da landing
 * e o encaminha por e-mail para contato@appps.com.br (o mesmo endereço que o
 * site já publica). Não grava no banco.
 *
 * Só responde 2xx se o e-mail saiu: o form do site mostra "sucesso" apenas
 * nesse caso, para nenhum contato se perder em silêncio.
 *
 * Rate limit: 5 envios por IP por hora
 */

const nodemailer = require('nodemailer');
const { checkAdminRateLimit } = require('../lib/rate-limiter');
const { escapeHtml } = require('../lib/validators');
const { validateLead } = require('../lib/lead');

const LEAD_EMAIL = 'contato@appps.com.br';

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

async function enviarEmailLead(lead, ip) {
  const transporter = createTransporter();
  const fromAddress = process.env.SMTP_USER || process.env.GMAIL_USER || 'noreply@appps.com.br';

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f5f5f5;">
      <div style="background:#046BD2;color:#fff;padding:20px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;font-size:18px;">Nova solicitação de proposta</h2>
        <p style="margin:8px 0 0;font-size:13px;opacity:0.9;">Lombada Educativa · site</p>
      </div>
      <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;border:1px solid #ddd;">
        <p style="margin:4px 0;"><strong>Nome:</strong> ${escapeHtml(lead.nome)}</p>
        <p style="margin:4px 0;"><strong>E-mail:</strong> ${escapeHtml(lead.email)}</p>
        <p style="margin:4px 0;"><strong>Condomínio:</strong> ${escapeHtml(lead.condominio)}</p>
        <p style="margin:4px 0;"><strong>Cidade / Estado:</strong> ${escapeHtml(lead.cidade)}</p>
        ${lead.mensagem ? `
        <div style="background:#f9f9f9;border-left:3px solid #046BD2;padding:12px 16px;margin-top:16px;border-radius:4px;">
          <p style="margin:0;white-space:pre-wrap;font-size:14px;color:#333;">${escapeHtml(lead.mensagem)}</p>
        </div>` : ''}
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
        <p style="font-size:12px;color:#666;margin:4px 0;"><strong>IP de origem:</strong> ${escapeHtml(ip)}</p>
        <p style="font-size:12px;color:#666;margin:4px 0;"><strong>Recebida em:</strong> ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Bahia' })}</p>
      </div>
      <p style="text-align:center;font-size:11px;color:#999;margin-top:20px;">
        Responda direto a este e-mail para falar com ${escapeHtml(lead.nome)}.
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: `"Lombada Educativa" <${fromAddress}>`,
    to: LEAD_EMAIL,
    replyTo: lead.email,
    // Quebra de linha no assunto viraria cabeçalho injetado: achata em espaço
    subject: `[Proposta] ${lead.condominio} — ${lead.nome}`.replace(/[\r\n]+/g, ' '),
    html,
  });
}

// ── Body parser (JSON) ──────────────────────────────────────────────────────

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('application/json')) {
      return reject(new Error('Content-Type deve ser application/json'));
    }
    let body = '';
    const MAX = 20 * 1024;
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX) { req.destroy(); reject(new Error('Payload muito grande')); }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

// ── Handler ─────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const rateCheck = checkAdminRateLimit(`lead:${ip}`, 5, 60 * 60 * 1000);
  if (!rateCheck.allowed) {
    return res.status(429).json({ error: 'Muitos envios deste endereço. Tente novamente em 1 hora.' });
  }

  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  // Honeypot anti-bot: campo `website` escondido no form; bot preenche, gente não
  if (body.website) {
    return res.status(200).json({ ok: true });
  }

  const { lead, errors } = validateLead(body);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Campos obrigatórios inválidos ou ausentes', campos: errors });
  }

  try {
    await enviarEmailLead(lead, ip);
  } catch (err) {
    console.error('[lead] Erro ao enviar e-mail:', err?.message);
    return res.status(502).json({ error: 'Não foi possível enviar agora.' });
  }

  return res.status(201).json({ ok: true });
};
