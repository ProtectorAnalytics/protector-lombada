const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Middleware de autenticação e autorização.
 * Valida JWT do Supabase Auth e verifica role na tabela usuarios.
 *
 * @param {object} req - Request (precisa ter header Authorization: Bearer <jwt>)
 * @param {string[]} rolesPermitidos - Roles que podem acessar (ex: ['super_admin', 'admin_cliente'])
 * @returns {{ user, profile }} - Dados do auth e perfil do usuario
 * @throws {object} { status, error } em caso de falha
 */
async function autenticar(req, rolesPermitidos = ['super_admin']) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();

  if (!token) {
    throw { status: 401, error: 'Token não fornecido' };
  }

  // Validar JWT via Supabase Auth
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    throw { status: 401, error: 'Token inválido ou expirado' };
  }

  // Buscar perfil na tabela usuarios
  const { data: profile, error: profileError } = await supabase
    .from('usuarios')
    .select('*')
    .eq('auth_id', user.id)
    .eq('ativo', true)
    .single();

  if (profileError || !profile) {
    throw { status: 403, error: 'Usuário não possui perfil ativo no sistema' };
  }

  // Verificar role
  if (!rolesPermitidos.includes(profile.role)) {
    throw { status: 403, error: 'Permissão insuficiente' };
  }

  return { user, profile };
}

/**
 * Verifica se o usuário tem acesso ao cliente_id solicitado.
 * Super admin acessa qualquer cliente; demais acessam só o próprio.
 */
function verificarAcessoCliente(profile, clienteId) {
  if (profile.role === 'super_admin') return true;
  return profile.cliente_id === clienteId;
}

/**
 * Registra ação no audit_log
 */
async function registrarAuditoria({ usuarioId, acao, tabela, registroId, detalhes, ip }) {
  await supabase.from('audit_log').insert({
    usuario_id: usuarioId,
    acao,
    tabela,
    registro_id: registroId,
    detalhes,
    ip,
  });
}

module.exports = { autenticar, verificarAcessoCliente, registrarAuditoria, supabase };
