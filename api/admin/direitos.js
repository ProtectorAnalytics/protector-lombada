/**
 * ENDPOINT ADMIN — Gerenciamento de Solicitações LGPD (Art. 18)
 *
 * Acesso: apenas super_admin (DPO).
 *
 * Endpoints:
 *   GET    /api/admin/direitos              — lista solicitações (filtros: status, urgencia)
 *   GET    /api/admin/direitos?id=<uuid>    — detalhe de uma solicitação
 *   PUT    /api/admin/direitos              — responder/atualizar status
 *       body: { id, status?, resposta_dpo?, enviar_email? }
 *
 * Todos os endpoints registram auditoria automática.
 */

const nodemailer = require('nodemailer');
const { autenticar, registrarAuditoria, supabase } = require('../../lib/auth-middleware');

const STATUS_VALIDOS = [
  'recebida',
  'em_analise',
  'aguardando_titular',
  'encaminhada_controlador',
  'atendida',
  'rejeitada',
  'cancelada',
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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
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

async function enviarRespostaTitular(solicitacao, respostaDpo, nomeDpo) {
  try {
    const transporter = createTransporter();
    const fromAddress = process.env.SMTP_USER || process.env.GMAIL_USER || 'noreply@appps.com.br';
    const tipoLabel = TIPO_LABELS[solicitacao.tipo] || solicitacao.tipo;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f5f5f5;">
        <div style="background:#046BD2;color:#fff;padding:20px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;font-size:18px;">Resposta à sua solicitação LGPD</h2>
          <p style="margin:8px 0 0;font-size:13px;opacity:0.9;">Protector — Sistemas de Segurança</p>
        </div>
        <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;border:1px solid #ddd;">
          <p>Olá, <strong>${solicitacao.nome}</strong>.</p>
          <p>Em atendimento à sua solicitação registrada na Protector Sistemas, segue a resposta do Encarregado pelo Tratamento de Dados Pessoais (DPO):</p>

          <div style="background:#f9f9f9;border-radius:6px;padding:16px;margin:20px 0;">
            <p style="margin:4px 0;"><strong>Protocolo:</strong> ${solicitacao.protocolo}</p>
            <p style="margin:4px 0;"><strong>Tipo:</strong> ${tipoLabel}</p>
            <p style="margin:4px 0;"><strong>Data da solicitação:</strong> ${new Date(solicitacao.criada_em).toLocaleDateString('pt-BR')}</p>
          </div>

          <h3 style="margin:20px 0 12px;color:#046BD2;font-size:15px;">Resposta do DPO</h3>
          <div style="background:#fff8e1;border-left:3px solid #F97316;padding:14px 18px;border-radius:4px;white-space:pre-wrap;font-size:14px;color:#333;">${respostaDpo}</div>

          <p style="margin-top:24px;">Se tiver dúvidas adicionais sobre esta resposta, responda diretamente a este e-mail mencionando o protocolo acima.</p>

          <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">

          <p style="font-size:12px;color:#666;margin:4px 0;">
            <strong>Encarregado (DPO):</strong> ${nomeDpo || 'Glauber Varjão do Nascimento'}<br>
            <strong>E-mail DPO:</strong> dpo@appps.com.br
          </p>
        </div>
        <p style="text-align:center;font-size:11px;color:#999;margin-top:20px;">
          Protector — Sistemas de Segurança · CNPJ 21.747.444/0001-65<br>
          Salvador/BA · Resposta automática registrada em cumprimento ao Art. 19 da LGPD.
        </p>
      </div>
    `;

    await transporter.sendMail({
      from: `"Protector DPO" <${fromAddress}>`,
      to: solicitacao.email,
      replyTo: 'dpo@appps.com.br',
      subject: `[Protocolo ${solicitacao.protocolo}] Resposta à sua solicitação LGPD`,
      html,
    });
    return true;
  } catch (err) {
    console.error('[admin/direitos] Erro envio resposta:', err?.message);
    return false;
  }
}

// ── Handler ─────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  try {
    const { method } = req;

    // Apenas super_admin (DPO) tem acesso
    const { profile } = await autenticar(req, ['super_admin']);

    // ── GET ─────────────────────────────────────────────────────────────────
    if (method === 'GET') {
      const id = req.query.id;

      // Detalhe de uma solicitação
      if (id) {
        const { data, error } = await supabase
          .from('solicitacoes_titular')
          .select('*, respondida_por_usuario:respondida_por(nome, email)')
          .eq('id', id)
          .single();

        if (error || !data) {
          return res.status(404).json({ error: 'Solicitação não encontrada' });
        }

        return res.status(200).json(data);
      }

      // Lista com filtros
      const status = req.query.status;
      const urgencia = req.query.urgencia; // 'vencidas', 'proximas', 'todas'

      let query = supabase
        .from('solicitacoes_titular')
        .select('id, protocolo, nome, email, tipo, status, prazo_limite, criada_em, respondida_em')
        .order('criada_em', { ascending: false })
        .limit(200);

      if (status && STATUS_VALIDOS.includes(status)) {
        query = query.eq('status', status);
      }

      if (urgencia === 'vencidas') {
        const hoje = new Date().toISOString().split('T')[0];
        query = query.lt('prazo_limite', hoje).not('status', 'in', '("atendida","rejeitada","cancelada")');
      } else if (urgencia === 'proximas') {
        const hoje = new Date().toISOString().split('T')[0];
        const tresDias = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
        query = query.gte('prazo_limite', hoje).lte('prazo_limite', tresDias).not('status', 'in', '("atendida","rejeitada","cancelada")');
      }

      const { data, error } = await query;
      if (error) throw error;

      // Estatísticas rápidas
      const { count: totalRecebidas } = await supabase
        .from('solicitacoes_titular')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'recebida');

      const hojeStr = new Date().toISOString().split('T')[0];
      const { count: totalVencidas } = await supabase
        .from('solicitacoes_titular')
        .select('*', { count: 'exact', head: true })
        .lt('prazo_limite', hojeStr)
        .not('status', 'in', '("atendida","rejeitada","cancelada")');

      return res.status(200).json({
        data,
        stats: {
          total: data.length,
          recebidas: totalRecebidas ?? 0,
          vencidas: totalVencidas ?? 0,
        },
      });
    }

    // ── PUT: responder / atualizar status ──────────────────────────────────
    if (method === 'PUT') {
      const body = typeof req.body === 'object' && req.body
        ? req.body
        : JSON.parse(await readBody(req));

      const { id, status, resposta_dpo, enviar_email } = body;

      if (!id) return res.status(400).json({ error: 'id obrigatório' });

      if (status && !STATUS_VALIDOS.includes(status)) {
        return res.status(400).json({ error: `Status inválido. Use: ${STATUS_VALIDOS.join(', ')}` });
      }

      // Buscar solicitação existente
      const { data: existing, error: selErr } = await supabase
        .from('solicitacoes_titular')
        .select('*')
        .eq('id', id)
        .single();

      if (selErr || !existing) {
        return res.status(404).json({ error: 'Solicitação não encontrada' });
      }

      // Montar update
      const update = {
        atualizada_em: new Date().toISOString(),
      };

      if (status) update.status = status;

      if (resposta_dpo) {
        update.resposta_dpo = resposta_dpo;
        update.respondida_em = new Date().toISOString();
        update.respondida_por = profile.id;

        // Se respondeu mas não enviou status explícito, marcar como atendida
        if (!status) update.status = 'atendida';
      }

      const { data, error } = await supabase
        .from('solicitacoes_titular')
        .update(update)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Enviar e-mail ao titular se houver resposta e flag enviar_email
      let emailEnviado = false;
      if (resposta_dpo && enviar_email !== false) {
        emailEnviado = await enviarRespostaTitular(data, resposta_dpo, profile.nome);
      }

      // Auditoria
      await registrarAuditoria({
        usuarioId: profile.id,
        acao: resposta_dpo ? 'responder' : 'atualizar',
        tabela: 'solicitacoes_titular',
        registroId: id,
        detalhes: {
          protocolo: existing.protocolo,
          status_anterior: existing.status,
          status_novo: update.status || existing.status,
          email_enviado: emailEnviado,
        },
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
      });

      return res.status(200).json({ ...data, email_enviado: emailEnviado });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    if (err?.status) {
      return res.status(err.status).json({ error: err.error });
    }
    console.error('[admin/direitos] Erro:', err?.message);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
