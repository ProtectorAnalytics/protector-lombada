const { autenticar, verificarAcessoCliente, registrarAuditoria, supabase } = require('../../lib/auth-middleware');

module.exports = async function handler(req, res) {
  try {
    const { method } = req;

    // GET: listar usuários
    if (method === 'GET') {
      const { profile } = await autenticar(req, ['super_admin', 'admin_cliente']);
      const clienteId = req.query.cliente_id || profile.cliente_id;

      if (profile.role === 'super_admin' && !clienteId) {
        // Super admin sem filtro: listar todos
        const { data, error } = await supabase
          .from('usuarios')
          .select('*, clientes(nome)')
          .order('criado_em', { ascending: false });
        if (error) throw error;
        return res.status(200).json(data);
      }

      if (!clienteId) return res.status(400).json({ error: 'cliente_id obrigatório' });
      if (!verificarAcessoCliente(profile, clienteId)) {
        return res.status(403).json({ error: 'Sem acesso a este cliente' });
      }

      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('criado_em', { ascending: false });

      if (error) throw error;
      return res.status(200).json(data);
    }

    // POST: criar usuário (cria no Auth + tabela usuarios)
    if (method === 'POST') {
      const { profile } = await autenticar(req, ['super_admin']);
      const body = typeof req.body === 'object' ? req.body : JSON.parse(await readBody(req));

      const { email, senha, nome, cliente_id, role } = body;

      if (!email || !senha || !nome || !role) {
        return res.status(400).json({ error: 'Campos obrigatórios: email, senha, nome, role' });
      }

      if (!['super_admin', 'admin_cliente', 'operador'].includes(role)) {
        return res.status(400).json({ error: 'Role inválido' });
      }

      if (role !== 'super_admin' && !cliente_id) {
        return res.status(400).json({ error: 'cliente_id obrigatório para admin_cliente e operador' });
      }

      // Criar usuário no Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
      });

      if (authError) {
        return res.status(400).json({ error: `Erro ao criar login: ${authError.message}` });
      }

      // Criar perfil na tabela usuarios
      const { data, error } = await supabase
        .from('usuarios')
        .insert({
          auth_id: authData.user.id,
          cliente_id: role === 'super_admin' ? null : cliente_id,
          nome,
          email,
          role,
          ativo: true,
        })
        .select()
        .single();

      if (error) {
        // Rollback: deletar usuário do Auth
        await supabase.auth.admin.deleteUser(authData.user.id);
        throw error;
      }

      // Vincular user_id ao cliente (se admin_cliente e cliente não tem user_id)
      if (role === 'admin_cliente' && cliente_id) {
        const { data: cliente } = await supabase
          .from('clientes')
          .select('user_id')
          .eq('id', cliente_id)
          .single();

        if (cliente && !cliente.user_id) {
          await supabase
            .from('clientes')
            .update({ user_id: authData.user.id })
            .eq('id', cliente_id);
        }
      }

      await registrarAuditoria({
        usuarioId: profile.id,
        acao: 'criar',
        tabela: 'usuarios',
        registroId: data.id,
        detalhes: { email, nome, role, cliente_id },
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
      });

      return res.status(201).json(data);
    }

    // PUT: atualizar usuário
    if (method === 'PUT') {
      const { profile } = await autenticar(req, ['super_admin']);
      const body = typeof req.body === 'object' ? req.body : JSON.parse(await readBody(req));
      const { id, senha, ...campos } = body;

      if (!id) return res.status(400).json({ error: 'ID do usuário obrigatório' });

      delete campos.auth_id;
      delete campos.criado_em;

      // Atualizar perfil
      const { data, error } = await supabase
        .from('usuarios')
        .update(campos)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Atualizar senha no Auth se fornecida
      if (senha) {
        const { error: passErr } = await supabase.auth.admin.updateUserById(
          data.auth_id,
          { password: senha }
        );
        if (passErr) {
          return res.status(400).json({ error: `Erro ao atualizar senha: ${passErr.message}` });
        }
      }

      await registrarAuditoria({
        usuarioId: profile.id,
        acao: 'atualizar',
        tabela: 'usuarios',
        registroId: id,
        detalhes: { ...campos, senha_alterada: !!senha },
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
      });

      return res.status(200).json(data);
    }

    // DELETE: desativar usuário
    if (method === 'DELETE') {
      const { profile } = await autenticar(req, ['super_admin']);
      const userId = req.query.id;
      if (!userId) return res.status(400).json({ error: 'ID do usuário obrigatório' });

      const { data, error } = await supabase
        .from('usuarios')
        .update({ ativo: false })
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;

      await registrarAuditoria({
        usuarioId: profile.id,
        acao: 'desativar',
        tabela: 'usuarios',
        registroId: userId,
        detalhes: { email: data.email },
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
      });

      return res.status(200).json({ ok: true, message: 'Usuário desativado' });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.error });
    console.error('Erro em /api/admin/usuarios:', err.message);
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
