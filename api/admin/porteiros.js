/**
 * /api/admin/porteiros — porteiros como usuários (role 'portaria') com login
 * próprio. O porteiro entra com um usuário simples (ex. jose.castelo) que
 * vira o e-mail técnico <usuario>@porteiro.invalid no Supabase Auth.
 *
 * Quem gerencia: super_admin (qualquer condomínio) e admin_cliente (só o
 * próprio condomínio). Em PUT/DELETE o alvo é carregado antes e só segue se
 * for role 'portaria' do cliente de quem chama. Erros nunca repassam a
 * mensagem do banco ou do Auth.
 *
 * Senha: regra única de usuario-portaria.js (10+ caracteres, letras e
 * números, sem o usuário nem o nome). Trocar a senha ou desativar encerra as
 * sessões abertas (RPC encerrar_sessoes_usuario, só service_role).
 */
const { autenticar, verificarAcessoCliente, registrarAuditoria, supabase } = require('../../lib/auth-middleware');
const { isValidUUID } = require('../../lib/validators');
const { lerCorpo, ErroHttp, ipDe } = require('../../lib/lista-portaria-api');
const {
  normalizarUsuario, usuarioValido, emailDoUsuario, usuarioDoEmail, erroSenhaPorteiro,
} = require('../../site/js/usuario-portaria');

const ROLES_GESTAO = ['super_admin', 'admin_cliente'];
const ROLE_PORTEIRO = 'portaria';
const NOME_MAX = 120;
const BAN_DESATIVADO = '876000h';
const BAN_NENHUM = 'none';
const UNICA_VIOLADA = '23505';
const MSG_JA_EXISTE = 'Esse usuário já existe';
const MSG_FALHA_LOGIN = 'Não foi possível atualizar o login. Tente de novo.';
const AVISO_SESSOES = {
  atualizar: 'Senha trocada, mas não foi possível desconectar os aparelhos em que o porteiro já estava logado. Troque a senha de novo em alguns minutos.',
  desativar: 'Porteiro desativado e sem acesso à portaria, mas não foi possível desconectar os aparelhos em que ele já estava logado.',
};
// Controle (C0/DEL) e invisíveis/direção de texto (zero-width, bidi, BOM).
const INVISIVEIS = /[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;
const COLUNAS = 'id, auth_id, cliente_id, nome, email, role, ativo, criado_em';

/** Saída pública: sem auth_id/e-mail; usuário técnico sem domínio, e-mail normal como está. */
const paraSaida = (u) => ({
  id: u.id, nome: u.nome, usuario: usuarioDoEmail(u.email) || u.email, ativo: u.ativo, criado_em: u.criado_em,
});

function exigirAcesso(profile, clienteId) {
  if (!verificarAcessoCliente(profile, clienteId)) throw new ErroHttp(403, 'Sem acesso a este cliente');
}

function validarNome(nome) {
  const limpo = typeof nome === 'string' ? nome.replace(INVISIVEIS, '').trim() : '';
  if (!limpo) throw new ErroHttp(400, 'Informe o nome do porteiro');
  if (limpo.length > NOME_MAX) throw new ErroHttp(400, `Nome com no máximo ${NOME_MAX} caracteres`);
  return limpo;
}

/** Regra única da senha do porteiro; `usuario` e `nome` são de quem vai usar a senha. */
function validarSenha(senha, { usuario, nome }) {
  const erro = erroSenhaPorteiro(senha, { usuario, nome });
  if (erro) throw new ErroHttp(400, erro);
  return senha;
}

/** Usuário de login do alvo: o técnico sem domínio, ou a parte antes do @ de um e-mail antigo. */
const usuarioDoAlvo = (alvo) => usuarioDoEmail(alvo.email) || String(alvo.email || '').split('@')[0];

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

/** Apaga o login recém-criado; se não der, bane para não sobrar login com senha conhecida. */
async function desfazerLogin(authId) {
  const { error } = await supabase.auth.admin.deleteUser(authId);
  if (!error) return;
  console.error('porteiros: falha no rollback do login', authId, error.message);
  const ban = await supabase.auth.admin.updateUserById(authId, { ban_duration: BAN_DESATIVADO });
  if (ban.error) console.error('porteiros: login órfão sem ban', authId, ban.error.message);
}

async function criar(req, res) {
  const { profile } = await autenticar(req, ROLES_GESTAO);
  const body = await lerCorpo(req);
  const clienteId = body.cliente_id || profile.cliente_id;
  if (!isValidUUID(clienteId)) return res.status(400).json({ error: 'cliente_id obrigatório' });
  const nome = validarNome(body.nome);
  const usuario = validarUsuario(body.usuario);
  const senha = validarSenha(body.senha, { usuario, nome });
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

/**
 * Derruba as sessões abertas (refresh tokens) do login. Não lança: o passo
 * anterior já foi aplicado; a falha vai para o log, a auditoria e um aviso.
 */
async function encerrarSessoes(authId, feito) {
  const { error } = await supabase.rpc('encerrar_sessoes_usuario', { p_user: authId });
  if (error) console.error('porteiros: falha ao encerrar sessões', authId, error.message);
  feito.sessoes_encerradas = !error;
}

/** Valida o corpo do PUT; só nome, senha e ativo são aceitos. A senha é checada contra o alvo. */
function lerAlteracoes(body, alvo) {
  const mudancas = {};
  if (body.nome !== undefined) mudancas.nome = validarNome(body.nome);
  if (body.ativo !== undefined) {
    if (typeof body.ativo !== 'boolean') throw new ErroHttp(400, 'ativo deve ser verdadeiro ou falso');
    mudancas.ativo = body.ativo;
  }
  const senha = body.senha !== undefined
    ? validarSenha(body.senha, { usuario: usuarioDoAlvo(alvo), nome: mudancas.nome ?? alvo.nome })
    : null;
  if (!Object.keys(mudancas).length && !senha) throw new ErroHttp(400, 'Nada para alterar');
  return { mudancas, senha };
}

/**
 * Aplica na ordem que nunca deixa o acesso aberto por engano: senha e
 * desbanir antes do banco; banir depois de gravar ativo=false (que já
 * bloqueia o painel e o RLS mesmo se o ban falhar). `feito` registra o que
 * já foi aplicado, para a auditoria sair mesmo se um passo seguinte falhar.
 * Senha nova e desativar encerram as sessões abertas logo em seguida.
 */
async function aplicar(alvo, { mudancas, senha }, feito) {
  if (senha) {
    await atualizarLogin(alvo.auth_id, { password: senha });
    feito.senha_alterada = true;
    await encerrarSessoes(alvo.auth_id, feito);
  }
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
  if (mudancas.ativo === false) {
    await encerrarSessoes(alvo.auth_id, feito);
    await atualizarLogin(alvo.auth_id, { ban_duration: BAN_DESATIVADO });
    feito.login_bloqueado = true;
  }
  return atual;
}

async function alterar(req, res, { acao, lerMudancas }) {
  const { profile } = await autenticar(req, ROLES_GESTAO);
  const alvo = await carregarAlvo(profile, req.query.id);
  const alteracoes = await lerMudancas(req, alvo);
  const feito = {};
  let ok = false;
  try {
    const atual = await aplicar(alvo, alteracoes, feito);
    ok = feito.sessoes_encerradas !== false;
    const saida = paraSaida(atual);
    return res.status(200).json(ok ? saida : { ...saida, aviso: AVISO_SESSOES[acao] });
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
  acao: 'atualizar', lerMudancas: async (r, alvo) => lerAlteracoes(await lerCorpo(r), alvo),
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
