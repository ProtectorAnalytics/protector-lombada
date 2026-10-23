/**
 * /api/admin/porteiros — porteiros como usuários (role 'portaria') com login
 * próprio. O porteiro entra com um usuário simples (ex. jose.castelo) que
 * vira o e-mail técnico <usuario>@porteiro.invalid no Supabase Auth.
 *
 * Quem gerencia: super_admin (qualquer condomínio) e admin_cliente (só o
 * próprio condomínio). Em PUT/DELETE o alvo é carregado antes e só segue se
 * for role 'portaria' do cliente de quem chama. Erros nunca repassam a
 * mensagem do banco ou do Auth.
 */
const { autenticar, verificarAcessoCliente, registrarAuditoria, supabase } = require('../../lib/auth-middleware');
const { isValidUUID } = require('../../lib/validators');
const { lerCorpo, ErroHttp, ipDe } = require('../../lib/lista-portaria-api');
const { normalizarUsuario, usuarioValido, emailDoUsuario, usuarioDoEmail } = require('../../site/js/usuario-portaria');

const ROLES_GESTAO = ['super_admin', 'admin_cliente'];
const ROLE_PORTEIRO = 'portaria';
const SENHA_MIN = 6;
const SENHA_MAX = 72;
const NOME_MAX = 120;
const BAN_DESATIVADO = '876000h';
const BAN_NENHUM = 'none';
const UNICA_VIOLADA = '23505';
const MSG_JA_EXISTE = 'Esse usuário já existe';
const MSG_FALHA_LOGIN = 'Não foi possível atualizar o login. Tente de novo.';
const COLUNAS = 'id, auth_id, cliente_id, nome, email, role, ativo, criado_em';

/** Saída pública: sem auth_id/e-mail; usuário técnico sem domínio, e-mail normal como está. */
const paraSaida = (u) => ({
  id: u.id, nome: u.nome, usuario: usuarioDoEmail(u.email) || u.email, ativo: u.ativo, criado_em: u.criado_em,
});

function exigirAcesso(profile, clienteId) {
  if (!verificarAcessoCliente(profile, clienteId)) throw new ErroHttp(403, 'Sem acesso a este cliente');
}

function validarNome(nome) {
  const limpo = typeof nome === 'string' ? nome.replace(/[\u0000-\u001F\u007F]/g, '').trim() : '';
  if (!limpo) throw new ErroHttp(400, 'Informe o nome do porteiro');
  if (limpo.length > NOME_MAX) throw new ErroHttp(400, `Nome com no máximo ${NOME_MAX} caracteres`);
  return limpo;
}

function validarSenha(senha) {
  if (typeof senha !== 'string' || senha.length < SENHA_MIN) {
    throw new ErroHttp(400, `A senha precisa ter pelo menos ${SENHA_MIN} caracteres`);
  }
  if (senha.length > SENHA_MAX) throw new ErroHttp(400, `A senha pode ter no máximo ${SENHA_MAX} caracteres`);
  return senha;
}

function validarUsuario(usuario) {
  const u = typeof usuario === 'string' ? normalizarUsuario(usuario) : '';
  if (!usuarioValido(u)) {
    throw new ErroHttp(400, 'Usuário inválido: use 3 a 40 letras minúsculas, números ou ponto (sem ponto no início, no fim ou repetido)');
  }
  return u;
}

/** Auth recusou por e-mail já cadastrado (mensagem/código variam por versão do GoTrue). */
function authJaExiste(erro) {
  const code = String(erro.code || '');
  const msg = String(erro.message || '');
  return code === 'email_exists' || code === 'user_already_exists' || /already (been )?registered|already exists|duplicate/i.test(msg);
}

async function listar(req, res) {
  const { profile } = await autenticar(req, ROLES_GESTAO);
  const clienteId = req.query.cliente_id || profile.cliente_id;
  if (!isValidUUID(clienteId)) return res.status(400).json({ error: 'cliente_id obrigatório' });
  exigirAcesso(profile, clienteId);
  const { data, error } = await supabase
    .from('usuarios').select(COLUNAS)
    .eq('cliente_id', clienteId).eq('role', ROLE_PORTEIRO)
    .order('nome', { ascending: true });
  if (error) throw error;
  return res.status(200).json((data || []).map(paraSaida));
}

async function criarLogin(email, senha) {
  const { data, error } = await supabase.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error) {
    if (authJaExiste(error)) throw new ErroHttp(409, MSG_JA_EXISTE);
    console.error('porteiros: Auth recusou createUser:', error.message);
    throw new ErroHttp(500, 'Não foi possível criar o login. Tente de novo.');
  }
  return data.user.id;
}

async function desfazerLogin(authId) {
  const { error } = await supabase.auth.admin.deleteUser(authId);
  if (error) console.error('porteiros: falha no rollback do login', authId, error.message);
}

async function criar(req, res) {
  const { profile } = await autenticar(req, ROLES_GESTAO);
  const body = await lerCorpo(req);
  const clienteId = body.cliente_id || profile.cliente_id;
  if (!isValidUUID(clienteId)) return res.status(400).json({ error: 'cliente_id obrigatório' });
  const nome = validarNome(body.nome);
  const usuario = validarUsuario(body.usuario);
  const senha = validarSenha(body.senha);
  exigirAcesso(profile, clienteId);

  const email = emailDoUsuario(usuario);
  const authId = await criarLogin(email, senha);
  const { data, error } = await supabase.from('usuarios')
    .insert({ auth_id: authId, cliente_id: clienteId, nome, email, role: ROLE_PORTEIRO, ativo: true })
    .select(COLUNAS).single();
  if (error || !data) {
    await desfazerLogin(authId);
    if (error && error.code === UNICA_VIOLADA) throw new ErroHttp(409, MSG_JA_EXISTE);
    throw error || new Error('insert de usuarios sem retorno');
  }

  await registrarAuditoria({
    usuarioId: profile.id, acao: 'criar', tabela: 'usuarios', registroId: data.id,
    detalhes: { cliente_id: clienteId, nome, usuario, role: ROLE_PORTEIRO }, ip: ipDe(req),
  });
  return res.status(201).json(paraSaida(data));
}

/** Carrega o alvo e confere: existe, é porteiro e é do cliente de quem chama. */
async function carregarAlvo(profile, id) {
  if (!isValidUUID(id)) throw new ErroHttp(400, 'ID inválido');
  const { data, error } = await supabase.from('usuarios').select(COLUNAS).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroHttp(404, 'Usuário não encontrado');
  exigirAcesso(profile, data.cliente_id);
  if (data.role !== ROLE_PORTEIRO) throw new ErroHttp(403, 'Só é possível gerenciar usuários do perfil Portaria');
  return data;
}

async function atualizarLogin(authId, atributos) {
  const { error } = await supabase.auth.admin.updateUserById(authId, atributos);
  if (error) {
    console.error('porteiros: Auth recusou updateUserById:', error.message);
    throw new ErroHttp(500, MSG_FALHA_LOGIN);
  }
}

/** Valida o corpo do PUT; só nome, senha e ativo são aceitos. */
function lerAlteracoes(body) {
  const mudancas = {};
  if (body.nome !== undefined) mudancas.nome = validarNome(body.nome);
  if (body.ativo !== undefined) {
    if (typeof body.ativo !== 'boolean') throw new ErroHttp(400, 'ativo deve ser verdadeiro ou falso');
    mudancas.ativo = body.ativo;
  }
  const senha = body.senha !== undefined ? validarSenha(body.senha) : null;
  if (!Object.keys(mudancas).length && !senha) throw new ErroHttp(400, 'Nada para alterar');
  return { mudancas, senha };
}

/**
 * Aplica na ordem que nunca deixa o acesso aberto por engano: senha e
 * desbanir antes do banco; banir depois de gravar ativo=false (que já
 * bloqueia o painel e o RLS mesmo se o ban falhar). `feito` registra o que
 * já foi aplicado, para a auditoria sair mesmo se um passo seguinte falhar.
 */
async function aplicar(alvo, { mudancas, senha }, feito) {
  if (senha) { await atualizarLogin(alvo.auth_id, { password: senha }); feito.senha_alterada = true; }
  if (mudancas.ativo === true) { await atualizarLogin(alvo.auth_id, { ban_duration: BAN_NENHUM }); feito.login_liberado = true; }
  let atual = alvo;
  if (Object.keys(mudancas).length) {
    const { data, error } = await supabase.from('usuarios').update(mudancas)
      .eq('id', alvo.id).eq('cliente_id', alvo.cliente_id).eq('role', ROLE_PORTEIRO)
      .select(COLUNAS).single();
    if (error) throw error;
    Object.assign(feito, mudancas);
    atual = data || { ...alvo, ...mudancas };
  }
  if (mudancas.ativo === false) { await atualizarLogin(alvo.auth_id, { ban_duration: BAN_DESATIVADO }); feito.login_bloqueado = true; }
  return atual;
}

async function alterar(req, res, { acao, lerMudancas }) {
  const { profile } = await autenticar(req, ROLES_GESTAO);
  const alvo = await carregarAlvo(profile, req.query.id);
  const alteracoes = await lerMudancas(req);
  const feito = {};
  let ok = false;
  try {
    const atual = await aplicar(alvo, alteracoes, feito);
    ok = true;
    return res.status(200).json(paraSaida(atual));
  } finally {
    if (Object.keys(feito).length) {
      await registrarAuditoria({
        usuarioId: profile.id, acao, tabela: 'usuarios', registroId: alvo.id,
        detalhes: { cliente_id: alvo.cliente_id, senha_alterada: false, ...feito, ...(ok ? {} : { incompleto: true }) },
        ip: ipDe(req),
      });
    }
  }
}

const atualizar = (req, res) => alterar(req, res, {
  acao: 'atualizar', lerMudancas: async (r) => lerAlteracoes(await lerCorpo(r)),
});
const desativar = (req, res) => alterar(req, res, {
  acao: 'desativar', lerMudancas: async () => ({ mudancas: { ativo: false }, senha: null }),
});

const ROTAS = { GET: listar, POST: criar, PUT: atualizar, DELETE: desativar };

module.exports = async function handler(req, res) {
  try {
    const rota = ROTAS[req.method];
    if (!rota) return res.status(405).json({ error: 'Método não permitido' });
    return await rota(req, res);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.error });
    console.error('Erro em /api/admin/porteiros:', err.message);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
