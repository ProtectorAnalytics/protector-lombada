const { autenticar, registrarAuditoria, supabase } = require('../../lib/auth-middleware');
const { ehUuid } = require('../../site/js/acesso-painel');

/**
 * POST /api/admin/acesso-painel  { cliente_id }
 *
 * A equipe Protector (super_admin) vai abrir o painel de um condomínio: a
 * visita fica no audit_log ANTES de o painel aparecer. Se a trilha não grava,
 * o painel não abre (fail-closed) — ver placas e fotos de terceiros sem
 * registro não é opção (LGPD, prestação de contas do operador).
 */
module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

    const { profile } = await autenticar(req, ['super_admin']);
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const clienteId = body.cliente_id;
    if (!ehUuid(clienteId)) return res.status(400).json({ error: 'cliente_id inválido' });
    const id = clienteId.toLowerCase();

    const { data: cliente, error } = await supabase
      .from('clientes')
      .select('id, nome, ativo')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!cliente || !cliente.ativo) return res.status(404).json({ error: 'Condomínio não encontrado ou inativo' });

    const { error: erroAuditoria } = await registrarAuditoria({
      usuarioId: profile.id,
      acao: 'abrir_painel_cliente',
      tabela: 'clientes',
      registroId: cliente.id,
      detalhes: { cliente_id: cliente.id, cliente_nome: cliente.nome },
      ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
    });
    if (erroAuditoria) {
      console.error('Erro em /api/admin/acesso-painel: auditoria não gravou:', erroAuditoria.message);
      return res.status(503).json({ error: 'Não foi possível registrar o acesso. Tente de novo.' });
    }

    return res.status(200).json({ ok: true, cliente: { id: cliente.id, nome: cliente.nome } });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.error });
    console.error('Erro em /api/admin/acesso-painel:', err.message);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
