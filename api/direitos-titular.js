/**
 * ENDPOINT PÚBLICO — Direitos do Titular (LGPD Art. 18)
 *
 * Recebe solicitações de titulares exercendo seus direitos previstos na LGPD.
 * Cada solicitação recebida:
 *   1. É validada e sanitizada
 *   2. É gravada na tabela `solicitacoes_titular` com um protocolo único
 *   3. Dispara e-mail automático para o DPO (dpo@appps.com.br)
 *   4. Retorna o protocolo para o titular acompanhar
 *
 * Prazo de resposta: 15 dias corridos (Art. 19 LGPD)
 *
 * Rate limit: 3 submissões por IP por hora
 */

const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');
const { checkAdminRateLimit } = require('../lib/rate-limiter');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const DPO_EMAIL = 'dpo@appps.com.br';

const TIPOS_VALIDOS = [
  'confirmacao',
  'acesso',
  'correcao',
  'anonimizacao',
  'portabilidade',
  'eliminacao',
  'informacao_compartilhamento',
  'revogacao_consentimento',
  'reclamacao',
  'outro',
];

const TIPO_LABELS = {
  confirmacao: 'Confirmação da existência de tratamento',
  acesso: 'Acesso aos dados',
  correcao: 'Correção de dados',
  anonimizacao: 'Anonimização, bloqueio ou eliminação',
  portabilidade: 'Portabilidade dos dados',
  eliminacao: 'Eliminação dos dados',
  informacao_compartilhamento: 'Informação sobre compartilhamento',
  revogacao_consentimento: 'Revogação do consentimento',
  reclamacao: 'Reclamação ou oposição',
  outro: 'Outro',
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function sanitize(str, max = 2000) {
  if (!str) return '';
  return String(str).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim().slice(0, max);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function gerarProtocolo() {
  const ano = new Date().getFullYear();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  const ts = Date.now().toString(36).toUpperCase().slice(-4);
  return `LGPD-${ano}-${ts}${rand}`;
}

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

async function enviarEmailDPO(solicitacao) {
  try {
    const transporter = createTransporter();
    const fromAddress = process.env.SMTP_USER || process.env.GMAIL_USER || 'noreply@appps.com.br';

    const prazo = new Date(solicitacao.prazo_limite).toLocaleDateString('pt-BR');
    const tipoLabel = TIPO_LABELS[solicitacao.tipo] || solicitacao.tipo;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f5f5f5;">
        <div style="background:#046BD2;color:#fff;padding:20px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;font-size:18px;">Nova solicitação LGPD recebida</h2>
          <p style="margin:8px 0 0;font-size:13px;opacity:0.9;">Protector Traffic Control</p>
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;border:1px solid #ddd;">
          <p style="margin:0 0 16px;"><strong>Protocolo:</strong> ${solicitacao.protocolo}</p>
          <p style="margin:0 0 16px;"><strong>Prazo de resposta:</strong> ${prazo} (15 dias corridos — Art. 19 LGPD)</p>

          <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">

          <h3 style="margin:0 0 12px;color:#046BD2;font-size:15px;">Solicitante</h3>
          <p style="margin:4px 0;"><strong>Nome:</strong> ${solicitacao.nome}</p>
          <p style="margin:4px 0;"><strong>E-mail:</strong> ${solicitacao.email}</p>
          ${solicitacao.telefone ? `<p style="margin:4px 0;"><strong>Telefone:</strong> ${solicitacao.telefone}</p>` : ''}
          ${solicitacao.cpf ? `<p style="margin:4px 0;"><strong>CPF:</strong> ${solicitacao.cpf}</p>` : ''}

          ${solicitacao.empreendimento || solicitacao.placa_veiculo || solicitacao.unidade ? `
          <h3 style="margin:20px 0 12px;color:#046BD2;font-size:15px;">Vínculo informado</h3>
          ${solicitacao.empreendimento ? `<p style="margin:4px 0;"><strong>Empreendimento:</strong> ${solicitacao.empreendimento}</p>` : ''}
          ${solicitacao.placa_veiculo ? `<p style="margin:4px 0;"><strong>Placa:</strong> ${solicitacao.placa_veiculo}</p>` : ''}
          ${solicitacao.unidade ? `<p style="margin:4px 0;"><strong>Unidade:</strong> ${solicitacao.unidade}</p>` : ''}
          ` : ''}

          <h3 style="margin:20px 0 12px;color:#046BD2;font-size:15px;">Solicitação</h3>
          <p style="margin:4px 0;"><strong>Tipo:</strong> ${tipoLabel}</p>
          <div style="background:#f9f9f9;border-left:3px solid #046BD2;padding:12px 16px;margin-top:12px;border-radius:4px;">
            <p style="margin:0;white-space:pre-wrap;font-size:14px;color:#333;">${solicitacao.descricao}</p>
          </div>

          <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">

          <p style="font-size:12px;color:#666;margin:4px 0;"><strong>IP de origem:</strong> ${solicitacao.ip_origem || 'N/A'}</p>
          <p style="font-size:12px;color:#666;margin:4px 0;"><strong>User-Agent:</strong> ${solicitacao.user_agent || 'N/A'}</p>
          <p style="font-size:12px;color:#666;margin:4px 0;"><strong>Recebida em:</strong> ${new Date().toLocaleString('pt-BR')}</p>
        </div>
        <p style="text-align:center;font-size:11px;color:#999;margin-top:20px;">
          Protector — Sistemas de Segurança · CNPJ 21.747.444/0001-65<br>
          Este e-mail é automático. Responda diretamente ao solicitante (${solicitacao.email}).
        </p>
      </div>
    `;

    await transporter.sendMail({
      from: `"Protector LGPD" <${fromAddress}>`,
      to: DPO_EMAIL,
      replyTo: solicitacao.email,
      subject: `[LGPD ${solicitacao.protocolo}] ${tipoLabel} — ${solicitacao.nome}`,
      html,
    });
    return true;
  } catch (err) {
    console.error('[direitos-titular] Erro ao enviar e-mail ao DPO:', err?.message);
    return false;
  }
}

async function enviarConfirmacaoSolicitante(solicitacao) {
  try {
    const transporter = createTransporter();
    const fromAddress = process.env.SMTP_USER || process.env.GMAIL_USER || 'noreply@appps.com.br';
    const prazo = new Date(solicitacao.prazo_limite).toLocaleDateString('pt-BR');
    const tipoLabel = TIPO_LABELS[solicitacao.tipo] || solicitacao.tipo;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f5f5f5;">
        <div style="background:#046BD2;color:#fff;padding:20px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;font-size:18px;">Solicitação LGPD recebida</h2>
          <p style="margin:8px 0 0;font-size:13px;opacity:0.9;">Protector — Sistemas de Segurança</p>
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;border:1px solid #ddd;">
          <p>Olá, <strong>${solicitacao.nome}</strong>.</p>
          <p>Recebemos sua solicitação referente ao exercício de direitos previstos na Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018).</p>

          <div style="background:#f9f9f9;border-radius:6px;padding:16px;margin:20px 0;">
            <p style="margin:4px 0;"><strong>Protocolo:</strong> ${solicitacao.protocolo}</p>
            <p style="margin:4px 0;"><strong>Tipo:</strong> ${tipoLabel}</p>
            <p style="margin:4px 0;"><strong>Prazo legal de resposta:</strong> até ${prazo} (15 dias corridos)</p>
          </div>

          <p>Nosso Encarregado pelo Tratamento de Dados (DPO) analisará sua solicitação e responderá no prazo legal.</p>

          <p style="font-size:13px;color:#666;margin-top:24px;">
            <strong>Guarde este número de protocolo</strong> para eventuais dúvidas ou acompanhamento.
            Caso precise de contato adicional, responda a este e-mail mencionando o protocolo acima.
          </p>

          <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">

          <p style="font-size:12px;color:#666;margin:4px 0;">
            <strong>Encarregado (DPO):</strong> Glauber Varjão do Nascimento<br>
            <strong>E-mail DPO:</strong> dpo@appps.com.br
          </p>
        </div>
        <p style="text-align:center;font-size:11px;color:#999;margin-top:20px;">
          Protector — Sistemas de Segurança · CNPJ 21.747.444/0001-65<br>
          Salvador/BA · Este é um e-mail automático.
        </p>
      </div>
    `;

    await transporter.sendMail({
      from: `"Protector DPO" <${fromAddress}>`,
      to: solicitacao.email,
      subject: `[Protocolo ${solicitacao.protocolo}] Sua solicitação LGPD foi recebida`,
      html,
    });
    return true;
  } catch (err) {
    console.error('[direitos-titular] Erro ao enviar confirmação ao titular:', err?.message);
    return false;
  }
}

// ── Body parser (JSON) ──────────────────────────────────────────────────────

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('application/json')) {
      return reject(new Error('Content-Type deve ser application/json'));
    }
    let body = '';
    const MAX = 50 * 1024;
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
  // Método
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    // Rate limit: 3 solicitações por IP por hora
    const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    const rateCheck = checkAdminRateLimit(`titular:${ip}`, 3, 60 * 60 * 1000);
    if (!rateCheck.allowed) {
      return res.status(429).json({
        error: 'Muitas solicitações deste endereço. Tente novamente em 1 hora.',
      });
    }

    // Parse body
    const body = await parseBody(req);

    // Honeypot anti-bot: se preencher o campo `website` (escondido no form), rejeita silenciosamente
    if (body.website) {
      return res.status(200).json({ ok: true, protocolo: 'LGPD-IGNORED' });
    }

    // Validação
    const nome = sanitize(body.nome, 200);
    const email = sanitize(body.email, 200);
    const telefone = sanitize(body.telefone, 30);
    const cpf = sanitize(body.cpf, 20);
    const empreendimento = sanitize(body.empreendimento, 200);
    const placa_veiculo = sanitize(body.placa_veiculo, 20).toUpperCase();
    const unidade = sanitize(body.unidade, 100);
    const tipo = sanitize(body.tipo, 50);
    const descricao = sanitize(body.descricao, 4000);
    const consentimento = body.consentimento === true;

    const errors = [];
    if (!nome || nome.length < 2) errors.push('nome');
    if (!email || !isValidEmail(email)) errors.push('email');
    if (!tipo || !TIPOS_VALIDOS.includes(tipo)) errors.push('tipo');
    if (!descricao || descricao.length < 10) errors.push('descricao');
    if (!consentimento) errors.push('consentimento');

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Campos obrigatórios inválidos ou ausentes',
        campos: errors,
      });
    }

    // Gerar protocolo único
    const protocolo = gerarProtocolo();
    const userAgent = (req.headers['user-agent'] || '').slice(0, 500);

    // Inserir no banco (service_role bypassa RLS)
    const { data, error } = await supabase
      .from('solicitacoes_titular')
      .insert({
        protocolo,
        nome,
        email,
        telefone: telefone || null,
        cpf: cpf || null,
        empreendimento: empreendimento || null,
        placa_veiculo: placa_veiculo || null,
        unidade: unidade || null,
        tipo,
        descricao,
        ip_origem: ip,
        user_agent: userAgent,
      })
      .select()
      .single();

    if (error) {
      console.error('[direitos-titular] Erro ao inserir:', error);
      return res.status(500).json({ error: 'Erro ao registrar solicitação' });
    }

    // Envio de e-mails (não bloqueia a resposta se falhar)
    const [emailDpoOk, emailTitularOk] = await Promise.all([
      enviarEmailDPO(data),
      enviarConfirmacaoSolicitante(data),
    ]);

    return res.status(201).json({
      ok: true,
      protocolo: data.protocolo,
      prazo_limite: data.prazo_limite,
      mensagem: 'Solicitação recebida. Você receberá um e-mail de confirmação em instantes.',
      email_enviado: emailTitularOk,
      dpo_notificado: emailDpoOk,
    });
  } catch (err) {
    console.error('[direitos-titular] Erro:', err?.message || err);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
