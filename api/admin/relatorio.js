/**
 * ENDPOINT ADMIN — Relatório Semanal
 *
 *   GET  /api/admin/relatorio?cliente_id=<uuid>
 *        Lista os últimos envios, com data de envio e de leitura.
 *
 *   POST /api/admin/relatorio?cliente_id=<uuid>
 *        Dispara o relatório da última semana imediatamente ("Enviar teste
 *        agora"), ignorando o agendamento. Reaproveita o mesmo caminho do cron
 *        para que o teste seja idêntico ao envio real.
 *
 * O envio de teste respeita a idempotência do cron: se já houve envio para
 * aquele destinatário no mesmo período, o insert conflita e nada é reenviado.
 */

const { autenticar, verificarAcessoCliente, registrarAuditoria, supabase } = require('../../lib/auth-middleware');
const { isValidUUID } = require('../../lib/validators');

module.exports = async function handler(req, res) {
  try {
    const { method } = req;
    const clienteId = req.query.cliente_id;

    if (!clienteId || !isValidUUID(clienteId)) {
      return res.status(400).json({ error: 'cliente_id inválido' });
    }

    // ── GET: histórico de envios ──────────────────────────────────────────
    if (method === 'GET') {
      const { profile } = await autenticar(req, ['super_admin', 'admin_cliente']);
      if (!verificarAcessoCliente(profile, clienteId)) {
        return res.status(403).json({ error: 'Sem acesso a este cliente' });
      }

      const { data, error } = await supabase
        .from('relatorio_envios')
        .select('id, destinatario_nome, destinatario_email, periodo_inicio, periodo_fim, enviado_em, visto_em, visto_count, erro')
        .eq('cliente_id', clienteId)
        .order('periodo_inicio', { ascending: false })
        .order('destinatario_email', { ascending: true })
        .limit(20);

      if (error) throw error;
      return res.status(200).json(data || []);
    }

    // ── POST: enviar agora ────────────────────────────────────────────────
    if (method === 'POST') {
      const { profile } = await autenticar(req, ['super_admin']);

      const base = process.env.PUBLIC_BASE_URL
        || (req.headers.host ? `https://${req.headers.host}` : 'https://lombada.appps.com.br');

      // Chama o próprio cron com ?forcar=<cliente_id>, autenticando com o
      // CRON_SECRET. Assim o teste percorre exatamente o mesmo código do envio
      // agendado — sem uma segunda implementação para divergir.
      const resp = await fetch(
        `${base.replace(/\/$/, '')}/api/cron-relatorio-semanal?forcar=${encodeURIComponent(clienteId)}`,
        { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } }
      );

      const corpo = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        return res.status(502).json({ error: corpo.error || 'Falha ao disparar o relatório' });
      }

      await registrarAuditoria({
        usuarioId: profile.id,
        acao: 'enviar_relatorio_teste',
        tabela: 'relatorio_envios',
        registroId: clienteId,
        detalhes: { relatorios: corpo.relatorios },
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
      });

      return res.status(200).json(corpo);
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    if (err?.status) return res.status(err.status).json({ error: err.error });
    console.error('[admin/relatorio] Erro:', err.message);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
