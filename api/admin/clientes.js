const { autenticar, verificarAcessoCliente, registrarAuditoria, supabase } = require('../../lib/auth-middleware');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  try {
    const { method } = req;

    // GET: listar clientes
    if (method === 'GET') {
      const { profile } = await autenticar(req, ['super_admin', 'admin_cliente', 'operador']);

      if (profile.role === 'super_admin') {
        const { data, error } = await supabase
          .from('clientes')
          .select('*, cameras(count), email_destinatarios(count)')
          .order('criado_em', { ascending: false });
        if (error) throw error;
        return res.status(200).json(data);
      } else {
        const { data, error } = await supabase
          .from('clientes')
          .select('*, cameras(count), email_destinatarios(count)')
          .eq('id', profile.cliente_id)
          .single();
        if (error) throw error;
        return res.status(200).json(data);
      }
    }

    // POST: criar cliente (super_admin)
    if (method === 'POST') {
      const { profile } = await autenticar(req, ['super_admin']);
      const body = typeof req.body === 'object' ? req.body : JSON.parse(await readBody(req));

      const { nome, local_via, cidade_uf, cep, endereco, limite_velocidade, cnpj, telefone, contato_nome } = body;

      if (!nome || !local_via || !cidade_uf) {
        return res.status(400).json({ error: 'Campos obrigatórios: nome, local_via, cidade_uf' });
      }

      const { data, error } = await supabase
        .from('clientes')
        .insert({
          nome,
          local_via,
          cidade_uf,
          cep: cep || null,
          endereco: endereco || null,
          limite_velocidade: limite_velocidade || 30,
          cnpj: cnpj || null,
          telefone: telefone || null,
          contato_nome: contato_nome || null,
          ativo: true,
        })
        .select()
        .single();

      if (error) throw error;

      await registrarAuditoria({
        usuarioId: profile.id,
        acao: 'criar',
        tabela: 'clientes',
        registroId: data.id,
        detalhes: { nome },
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
      });

      return res.status(201).json(data);
    }

    // PUT: atualizar cliente
    if (method === 'PUT') {
      const { profile } = await autenticar(req, ['super_admin', 'admin_cliente']);
      const body = typeof req.body === 'object' ? req.body : JSON.parse(await readBody(req));
      const { id, ...campos } = body;

      if (!id) return res.status(400).json({ error: 'ID do cliente obrigatório' });

      if (!verificarAcessoCliente(profile, id)) {
        return res.status(403).json({ error: 'Sem acesso a este cliente' });
      }

      // Remover campos que não podem ser editados
      delete campos.user_id;
      delete campos.criado_em;
      delete campos.emails_notificacao;

      const { data, error } = await supabase
        .from('clientes')
        .update(campos)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      await registrarAuditoria({
        usuarioId: profile.id,
        acao: 'atualizar',
        tabela: 'clientes',
        registroId: id,
        detalhes: campos,
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
      });

      return res.status(200).json(data);
    }

    // DELETE: desativar cliente (soft delete)
    if (method === 'DELETE') {
      const { profile } = await autenticar(req, ['super_admin']);
      const clienteId = req.query.id;
      if (!clienteId) return res.status(400).json({ error: 'ID do cliente obrigatório' });

      const { data, error } = await supabase
        .from('clientes')
        .update({ ativo: false })
        .eq('id', clienteId)
        .select()
        .single();

      if (error) throw error;

      // Desativar câmeras do cliente
      await supabase.from('cameras').update({ ativa: false }).eq('cliente_id', clienteId);

      await registrarAuditoria({
        usuarioId: profile.id,
        acao: 'desativar',
        tabela: 'clientes',
        registroId: clienteId,
        detalhes: { nome: data.nome },
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
      });

      return res.status(200).json({ ok: true, message: 'Cliente desativado' });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.error });
    console.error('Erro em /api/admin/clientes:', err.message);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
