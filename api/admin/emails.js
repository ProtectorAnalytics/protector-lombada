const { autenticar, verificarAcessoCliente, registrarAuditoria, supabase } = require('../../lib/auth-middleware');
const { isValidEmail } = require('../../lib/validators');

module.exports = async function handler(req, res) {
  try {
    const { method } = req;

    // GET: listar destinatários de e-mail
    if (method === 'GET') {
      const { profile } = await autenticar(req, ['super_admin', 'admin_cliente', 'operador']);
      const clienteId = req.query.cliente_id || profile.cliente_id;

      if (!clienteId) return res.status(400).json({ error: 'cliente_id obrigatório' });
      if (!verificarAcessoCliente(profile, clienteId)) {
        return res.status(403).json({ error: 'Sem acesso a este cliente' });
      }

      const { data, error } = await supabase
        .from('email_destinatarios')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('criado_em', { ascending: false });

      if (error) throw error;
      return res.status(200).json(data);
    }

    // POST: adicionar destinatário
    if (method === 'POST') {
      const { profile } = await autenticar(req, ['super_admin', 'admin_cliente']);
      const body = typeof req.body === 'object' ? req.body : JSON.parse(await readBody(req));

      const { cliente_id, nome, email, tipo } = body;
      const targetCliente = cliente_id || profile.cliente_id;

      if (!targetCliente || !nome || !email) {
        return res.status(400).json({ error: 'Campos obrigatórios: cliente_id, nome, email' });
      }

      if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'E-mail inválido' });
      }

      if (!verificarAcessoCliente(profile, targetCliente)) {
        return res.status(403).json({ error: 'Sem acesso a este cliente' });
      }

      if (tipo && !['alerta', 'relatorio', 'todos'].includes(tipo)) {
        return res.status(400).json({ error: 'Tipo inválido. Use: alerta, relatorio ou todos' });
      }

      const { data, error } = await supabase
        .from('email_destinatarios')
        .insert({
          cliente_id: targetCliente,
          nome,
          email,
          tipo: tipo || 'alerta',
          ativo: true,
        })
        .select()
        .single();

      if (error) throw error;

      await registrarAuditoria({
        usuarioId: profile.id,
        acao: 'criar',
        tabela: 'email_destinatarios',
        registroId: data.id,
        detalhes: { email, nome, tipo: tipo || 'alerta' },
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
      });

      return res.status(201).json(data);
    }

    // PUT: atualizar destinatário
    if (method === 'PUT') {
      const { profile } = await autenticar(req, ['super_admin', 'admin_cliente']);
      const body = typeof req.body === 'object' ? req.body : JSON.parse(await readBody(req));
      const { id, ...campos } = body;

      if (!id) return res.status(400).json({ error: 'ID do destinatário obrigatório' });

      delete campos.cliente_id;
      delete campos.criado_em;

      if (campos.tipo && !['alerta', 'relatorio', 'todos'].includes(campos.tipo)) {
        return res.status(400).json({ error: 'Tipo inválido' });
      }

      // Verificar acesso ao destinatário
      const { data: existing } = await supabase
        .from('email_destinatarios')
        .select('cliente_id')
        .eq('id', id)
        .single();

      if (!existing) return res.status(404).json({ error: 'Destinatário não encontrado' });
      if (!verificarAcessoCliente(profile, existing.cliente_id)) {
        return res.status(403).json({ error: 'Sem acesso a este cliente' });
      }

      const { data, error } = await supabase
        .from('email_destinatarios')
        .update(campos)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      await registrarAuditoria({
        usuarioId: profile.id,
        acao: 'atualizar',
        tabela: 'email_destinatarios',
        registroId: id,
        detalhes: campos,
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
      });

      return res.status(200).json(data);
    }

    // DELETE: remover destinatário
    if (method === 'DELETE') {
      const { profile } = await autenticar(req, ['super_admin', 'admin_cliente']);
      const emailId = req.query.id;
      if (!emailId) return res.status(400).json({ error: 'ID do destinatário obrigatório' });

      // Verificar acesso
      const { data: existing } = await supabase
        .from('email_destinatarios')
        .select('cliente_id, email')
        .eq('id', emailId)
        .single();

      if (!existing) return res.status(404).json({ error: 'Destinatário não encontrado' });
      if (!verificarAcessoCliente(profile, existing.cliente_id)) {
        return res.status(403).json({ error: 'Sem acesso a este cliente' });
      }

      const { error } = await supabase
        .from('email_destinatarios')
        .delete()
        .eq('id', emailId);

      if (error) throw error;

      await registrarAuditoria({
        usuarioId: profile.id,
        acao: 'remover',
        tabela: 'email_destinatarios',
        registroId: emailId,
        detalhes: { email: existing.email },
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
      });

      return res.status(200).json({ ok: true, message: 'Destinatário removido' });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.error });
    console.error('Erro em /api/admin/emails:', err.message);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) { req.destroy(); reject(new Error('Payload muito grande')); }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
