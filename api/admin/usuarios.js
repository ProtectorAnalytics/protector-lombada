const { autenticar, verificarAcessoCliente, registrarAuditoria, supabase } = require('../../lib/auth-middleware');
const { erroSenhaPorteiro, usuarioDoEmail } = require('../../site/js/usuario-portaria');
const { conferirContato } = require('../../lib/contatos-so-email');

// Usuários role 'portaria' criados ou alterados aqui seguem a mesma regra de
// senha de /api/admin/porteiros e têm as sessões encerradas na troca de senha
// e no desativar.
const ROLE_PORTEIRO = 'portaria';
const ROLE_CONTATO = 'so_email';
const MSG_CONTATO = 'Contatos "Só recebe e-mail" não têm login: use Avisos por e-mail';
// Num so_email (sem login) estes campos só mudam por /api/admin/avisos.
const CAMPOS_TRAVADOS_CONTATO = ['role', 'email', 'cliente_id'];
const AVISO_SESSOES = 'Feito, mas não foi possível desconectar os aparelhos em que o porteiro já estava logado. Tente de novo em alguns minutos.';

/** Usuário de login para a regra: o técnico sem domínio ou a parte antes do @. */
const usuarioDeLogin = (email) => usuarioDoEmail(email) || String(email || '').split('@')[0];

/** Mensagem da regra do porteiro quando o role final é portaria; null nos outros roles. */
function erroSenhaSePorteiro(role, senha, { email, nome }) {
  if (role !== ROLE_PORTEIRO) return null;
  return erroSenhaPorteiro(senha, { usuario: usuarioDeLogin(email), nome });
}

/** As duas opções de aviso por e-mail sempre como booleanos. */
const comOpcoes = (u) => ({ ...u, recebe_alertas: u.recebe_alertas === true, recebe_relatorio: u.recebe_relatorio === true });

/** Mensagem de recusa quando o PUT mexe no que um so_email não tem (senha) ou não troca por aqui. */
function erroEdicaoContato(atual, senha, campos) {
  if (campos.role === ROLE_CONTATO && atual.role !== ROLE_CONTATO) return MSG_CONTATO;
  if (atual.role !== ROLE_CONTATO) return null;
  if (senha) return MSG_CONTATO;
  const muda = CAMPOS_TRAVADOS_CONTATO.some((c) => campos[c] !== undefined && campos[c] !== atual[c]);
  return muda ? MSG_CONTATO : null;
}

/** Encerra as sessões abertas; não lança (o passo anterior já foi aplicado). */
async function encerrarSessoes(authId) {
  const { error } = await supabase.rpc('encerrar_sessoes_usuario', { p_user: authId });
  if (error) console.error('usuarios: falha ao encerrar sessões', authId, error.message);
  return !error;
}

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
        return res.status(200).json((data || []).map(comOpcoes));
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
      return res.status(200).json((data || []).map(comOpcoes));
    }

    // POST: criar usuário (cria no Auth + tabela usuarios)
    if (method === 'POST') {
      const { profile } = await autenticar(req, ['super_admin']);
      const body = typeof req.body === 'object' ? req.body : JSON.parse(await readBody(req));

      const { email, senha, nome, cliente_id, role } = body;

      if (role === ROLE_CONTATO) return res.status(400).json({ error: MSG_CONTATO });

      if (!email || !senha || !nome || !role) {
        return res.status(400).json({ error: 'Campos obrigatórios: email, senha, nome, role' });
      }

      if (!['super_admin', 'admin_cliente', 'operador', 'portaria'].includes(role)) {
        return res.status(400).json({ error: 'Role inválido' });
      }

      if (role !== 'super_admin' && !cliente_id) {
        return res.status(400).json({ error: 'cliente_id obrigatório para admin_cliente, operador e portaria' });
      }

      const erroSenha = erroSenhaSePorteiro(role, senha, { email, nome });
      if (erroSenha) return res.status(400).json({ error: erroSenha });

      // Criar usuário no Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
      });

      if (authError) {
        console.error('usuarios: Auth recusou createUser:', authError.message);
        return res.status(400).json({ error: 'Não foi possível criar o login. Confira se o e-mail já não está em uso e tente de novo.' });
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
        // Rollback: deletar usuário do Auth se perfil falhou
        try {
          await supabase.auth.admin.deleteUser(authData.user.id);
        } catch (rollbackErr) {
          console.error('Falha no rollback do auth user:', rollbackErr.message);
        }
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

      // Whitelist de campos permitidos
      const CAMPOS_PERMITIDOS = ['nome', 'email', 'role', 'cliente_id', 'ativo'];
      const camposFiltrados = {};
      for (const key of CAMPOS_PERMITIDOS) {
        if (campos[key] !== undefined) camposFiltrados[key] = campos[key];
      }

      const { data: atual, error: erroAtual } = await supabase
        .from('usuarios').select('*').eq('id', id).maybeSingle();
      if (erroAtual) throw erroAtual;
      if (!atual) return res.status(404).json({ error: 'Usuário não encontrado' });
      const erroContato = erroEdicaoContato(atual, senha, campos);
      if (erroContato) return res.status(400).json({ error: erroContato });
      // Reativar um so_email: mesma conferência de /api/admin/avisos (e-mail livre e teto).
      if (atual.role === ROLE_CONTATO && camposFiltrados.ativo === true && !atual.ativo) {
        await conferirContato(supabase, atual.cliente_id, atual.email, atual.id, { ativando: true });
      }
      const final = { ...atual, ...camposFiltrados };
      const ehPorteiro = final.role === ROLE_PORTEIRO;
      if (senha) {
        const erroSenha = erroSenhaSePorteiro(final.role, senha, final);
        if (erroSenha) return res.status(400).json({ error: erroSenha });
      }

      // Atualizar perfil
      const { data, error } = await supabase
        .from('usuarios')
        .update(camposFiltrados)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Atualizar senha no Auth se fornecida (so_email já foi recusado acima)
      if (senha && data.auth_id) {
        const { error: passErr } = await supabase.auth.admin.updateUserById(
          data.auth_id,
          { password: senha }
        );
        if (passErr) {
          console.error('usuarios: Auth recusou updateUserById:', passErr.message);
          return res.status(400).json({ error: 'Não foi possível atualizar a senha. Tente de novo.' });
        }
      }

      const sessoes = ehPorteiro && (senha || camposFiltrados.ativo === false)
        ? { sessoes_encerradas: await encerrarSessoes(data.auth_id) } : {};
      const incompleto = sessoes.sessoes_encerradas === false;

      await registrarAuditoria({
        usuarioId: profile.id,
        acao: 'atualizar',
        tabela: 'usuarios',
        registroId: id,
        detalhes: { ...campos, senha_alterada: !!senha, ...sessoes, ...(incompleto ? { incompleto: true } : {}) },
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
      });

      return res.status(200).json(incompleto ? { ...data, aviso: AVISO_SESSOES } : data);
    }

    // DELETE: desativar ou excluir usuário
    if (method === 'DELETE') {
      const { profile } = await autenticar(req, ['super_admin']);
      const userId = req.query.id;
      const permanent = req.query.permanent === 'true';
      if (!userId) return res.status(400).json({ error: 'ID do usuário obrigatório' });

      if (permanent) {
        // Buscar dados do usuário antes de excluir
        const { data: usuario, error: erroBusca } = await supabase.from('usuarios').select('email, auth_id').eq('id', userId).maybeSingle();
        if (erroBusca) throw erroBusca;

        // Excluir da tabela usuarios
        const { error } = await supabase.from('usuarios').delete().eq('id', userId);
        if (error) throw error;

        // Excluir do Supabase Auth
        if (usuario?.auth_id) {
          await supabase.auth.admin.deleteUser(usuario.auth_id);
        }

        await registrarAuditoria({
          usuarioId: profile.id,
          acao: 'excluir',
          tabela: 'usuarios',
          registroId: userId,
          detalhes: { email: usuario?.email || userId },
          ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
        });
        return res.status(200).json({ ok: true, message: 'Usuário excluído permanentemente' });
      }

      const { data, error } = await supabase
        .from('usuarios')
        .update({ ativo: false })
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;

      const sessoes = data.role === ROLE_PORTEIRO ? { sessoes_encerradas: await encerrarSessoes(data.auth_id) } : {};
      const incompleto = sessoes.sessoes_encerradas === false;

      await registrarAuditoria({
        usuarioId: profile.id,
        acao: 'desativar',
        tabela: 'usuarios',
        registroId: userId,
        detalhes: { email: data.email, ...sessoes, ...(incompleto ? { incompleto: true } : {}) },
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
      });

      return res.status(200).json({ ok: true, message: 'Usuário desativado', ...(incompleto ? { aviso: AVISO_SESSOES } : {}) });
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
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) { req.destroy(); reject(new Error('Payload muito grande')); }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
