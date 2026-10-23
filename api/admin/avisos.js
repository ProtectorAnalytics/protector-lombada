/**
 * /api/admin/avisos — quem recebe os e-mails (Portaria 2.2), lido do cadastro
 * de usuários: as opções "Recebe alertas de excesso" (recebe_alertas) e
 * "Recebe relatório periódico" (recebe_relatorio), e os contatos
 * "Só recebe e-mail" (role so_email: sem login, auth_id nulo).
 *
 * GET    ?cliente_id=   usuários do cliente exceto portaria (com inativos)
 * POST   {cliente_id, nome, email, recebe_alertas?, recebe_relatorio?} → so_email
 * PUT    ?id= {recebe_alertas?, recebe_relatorio?, nome?, email?, ativo?}
 *        (nome/email/ativo só em so_email)
 * DELETE ?id=           desativa um so_email
 *
 * Quem gerencia: super_admin (qualquer cliente) e admin_cliente (só o
 * próprio). Alvo de outro cliente → 404; alvo super_admin/portaria → 403.
 * Nunca chama o Supabase Auth. Erros não repassam a mensagem do banco.
 */
const { autenticar, verificarAcessoCliente, registrarAuditoria, supabase } = require('../../lib/auth-middleware');
const { isValidUUID, isValidEmail } = require('../../lib/validators');
const { lerCorpo, ErroHttp, ipDe } = require('../../lib/lista-portaria-api');
const avisosLib = require('../../site/js/avisos-email');

const ROLES_GESTAO = ['super_admin', 'admin_cliente'];
const ROLE_CONTATO = 'so_email';
const ROLES_INTOCAVEIS = ['super_admin', 'portaria'];
const UNICA_VIOLADA = '23505';
const PAGINA = 1000;
const COLUNAS = 'id, cliente_id, nome, email, role, ativo, recebe_alertas, recebe_relatorio';
const CAMPOS_PROIBIDOS = ['role', 'auth_id', 'senha'];
const CAMPOS_POST = ['cliente_id', 'nome', 'email', 'recebe_alertas', 'recebe_relatorio'];
const CAMPOS_PUT = ['recebe_alertas', 'recebe_relatorio', 'nome', 'email', 'ativo'];
const CAMPOS_CONTATO = ['nome', 'email', 'ativo'];
const MSG_CONTATO_EXISTE = 'Já existe um contato "Só recebe e-mail" com este e-mail';
const MSG_DE_USUARIO = 'Este e-mail já é de um usuário; ligue as opções nele';

const paraSaida = (u) => ({
  id: u.id, nome: u.nome, email: u.email, role: u.role, ativo: u.ativo,
  recebe_alertas: u.recebe_alertas === true, recebe_relatorio: u.recebe_relatorio === true,
});

/** role/auth_id/senha nunca; qualquer outro campo fora da lista também é recusado. */
function conferirCampos(body, permitidos) {
  const chaves = Object.keys(body);
  if (chaves.some((c) => CAMPOS_PROIBIDOS.includes(c))) throw new ErroHttp(400, 'Não é possível alterar o tipo, o login ou a senha por aqui');
  const fora = chaves.find((c) => !permitidos.includes(c));
  if (fora) throw new ErroHttp(400, 'Campo não permitido');
}

function validarNome(nome) {
  const limpo = avisosLib.limparNome(nome);
  const erro = avisosLib.erroNome(limpo);
  if (erro) throw new ErroHttp(400, erro);
  return limpo;
}

function validarEmail(email) {
  const e = avisosLib.normalizarEmail(email);
  const erro = isValidEmail(e) ? avisosLib.erroEmail(e) : 'Informe um e-mail válido.';
  if (erro) throw new ErroHttp(400, erro);
  return e;
}

function validarBool(valor, campo) {
  if (typeof valor !== 'boolean') throw new ErroHttp(400, `${campo} deve ser verdadeiro ou falso`);
  return valor;
}

/** Campos booleanos presentes em `body`, validados. */
const lerBools = (body, campos) => Object.fromEntries(
  campos.filter((c) => body[c] !== undefined).map((c) => [c, validarBool(body[c], c)]),
);

function exigirAcesso(profile, clienteId) {
  if (!verificarAcessoCliente(profile, clienteId)) throw new ErroHttp(403, 'Sem acesso a este cliente');
}

/** Todos os usuários do cliente (o PostgREST corta em 1000 linhas: lê em páginas). */
async function usuariosDoCliente(clienteId) {
  const todos = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase.from('usuarios').select(COLUNAS)
      .eq('cliente_id', clienteId).neq('role', 'portaria')
      .order('nome', { ascending: true }).order('id', { ascending: true })
      .range(de, de + PAGINA - 1);
    if (error) throw error;
    todos.push(...(data || []));
    if (!data || data.length < PAGINA) return todos;
  }
}

/** 409 se o e-mail já é de um so_email (mesmo inativo) ou de outro usuário do cliente. */
async function conferirEmailLivre(clienteId, email, ignorarId) {
  const iguais = (await usuariosDoCliente(clienteId))
    .filter((u) => u.id !== ignorarId && avisosLib.normalizarEmail(u.email) === email);
  if (iguais.some((u) => u.role === ROLE_CONTATO)) throw new ErroHttp(409, MSG_CONTATO_EXISTE);
  if (iguais.length) throw new ErroHttp(409, MSG_DE_USUARIO);
}

function erroDeEscrita(error) {
  if (error.code === UNICA_VIOLADA) return new ErroHttp(409, MSG_CONTATO_EXISTE);
  return error;
}

async function listar(req, res) {
  const { profile } = await autenticar(req, ROLES_GESTAO);
  const clienteId = req.query.cliente_id || profile.cliente_id;
  if (!isValidUUID(clienteId)) return res.status(400).json({ error: 'cliente_id obrigatório' });
  exigirAcesso(profile, clienteId);
  return res.status(200).json((await usuariosDoCliente(clienteId)).map(paraSaida));
}

function lerNovoContato(body, profile) {
  conferirCampos(body, CAMPOS_POST);
  const clienteId = body.cliente_id || profile.cliente_id;
  if (!isValidUUID(clienteId)) throw new ErroHttp(400, 'cliente_id obrigatório');
  return {
    cliente_id: clienteId, nome: validarNome(body.nome), email: validarEmail(body.email),
    role: ROLE_CONTATO, auth_id: null, ativo: true,
    recebe_alertas: false, recebe_relatorio: false, ...lerBools(body, ['recebe_alertas', 'recebe_relatorio']),
  };
}

async function criar(req, res) {
  const { profile } = await autenticar(req, ROLES_GESTAO);
  const novo = lerNovoContato(await lerCorpo(req), profile);
  exigirAcesso(profile, novo.cliente_id);
  await conferirEmailLivre(novo.cliente_id, novo.email, null);
  const { data, error } = await supabase.from('usuarios').insert(novo).select(COLUNAS).single();
  if (error) throw erroDeEscrita(error);
  await registrarAuditoria({
    usuarioId: profile.id, acao: 'criar', tabela: 'usuarios', registroId: data.id,
    detalhes: { cliente_id: novo.cliente_id, role: ROLE_CONTATO, recebe_alertas: novo.recebe_alertas, recebe_relatorio: novo.recebe_relatorio },
    ip: ipDe(req),
  });
  return res.status(201).json(paraSaida(data));
}

/** Alvo existente e do cliente de quem chama (senão 404); super_admin/portaria → 403. */
async function carregarAlvo(profile, id) {
  if (!isValidUUID(id)) throw new ErroHttp(400, 'ID inválido');
  const { data, error } = await supabase.from('usuarios').select(COLUNAS).eq('id', id).maybeSingle();
  if (error) throw error;
  // Sem cliente (super_admin) só o super_admin "vê"; para ele cai no 403 abaixo.
  const doCliente = data && (data.cliente_id || profile.role === 'super_admin');
  if (!doCliente || !verificarAcessoCliente(profile, data.cliente_id)) {
    throw new ErroHttp(404, 'Usuário não encontrado');
  }
  if (ROLES_INTOCAVEIS.includes(data.role)) throw new ErroHttp(403, 'Este usuário não recebe avisos por e-mail');
  return data;
}

function lerAlteracoes(body, alvo) {
  conferirCampos(body, CAMPOS_PUT);
  const deContato = CAMPOS_CONTATO.some((c) => body[c] !== undefined);
  if (deContato && alvo.role !== ROLE_CONTATO) {
    throw new ErroHttp(403, 'Nome, e-mail e situação só se alteram em contatos "Só recebe e-mail"');
  }
  const mudancas = { ...lerBools(body, ['recebe_alertas', 'recebe_relatorio', 'ativo']) };
  if (body.nome !== undefined) mudancas.nome = validarNome(body.nome);
  if (body.email !== undefined) mudancas.email = validarEmail(body.email);
  if (!Object.keys(mudancas).length) throw new ErroHttp(400, 'Nada para alterar');
  return mudancas;
}

async function gravar(alvo, mudancas) {
  const { data, error } = await supabase.from('usuarios').update(mudancas)
    .eq('id', alvo.id).eq('cliente_id', alvo.cliente_id).eq('role', alvo.role)
    .select(COLUNAS).single();
  if (error) throw erroDeEscrita(error);
  return data || { ...alvo, ...mudancas };
}

async function auditar(req, profile, acao, alvo, detalhes) {
  await registrarAuditoria({
    usuarioId: profile.id, acao, tabela: 'usuarios', registroId: alvo.id,
    detalhes: { cliente_id: alvo.cliente_id, role: alvo.role, ...detalhes }, ip: ipDe(req),
  });
}

async function atualizar(req, res) {
  const { profile } = await autenticar(req, ROLES_GESTAO);
  const alvo = await carregarAlvo(profile, req.query.id);
  const mudancas = lerAlteracoes(await lerCorpo(req), alvo);
  if (mudancas.email !== undefined && mudancas.email !== avisosLib.normalizarEmail(alvo.email)) {
    await conferirEmailLivre(alvo.cliente_id, mudancas.email, alvo.id);
  }
  const atual = await gravar(alvo, mudancas);
  await auditar(req, profile, 'atualizar', alvo, mudancas);
  return res.status(200).json(paraSaida(atual));
}

async function desativar(req, res) {
  const { profile } = await autenticar(req, ROLES_GESTAO);
  const alvo = await carregarAlvo(profile, req.query.id);
  if (alvo.role !== ROLE_CONTATO) throw new ErroHttp(403, 'Só é possível desativar contatos "Só recebe e-mail" por aqui');
  if (!alvo.ativo) return res.status(200).json(paraSaida(alvo));
  const atual = await gravar(alvo, { ativo: false });
  await auditar(req, profile, 'desativar', alvo, { ativo: false });
  return res.status(200).json(paraSaida(atual));
}

const ROTAS = { GET: listar, POST: criar, PUT: atualizar, DELETE: desativar };

module.exports = async function handler(req, res) {
  try {
    const rota = ROTAS[req.method];
    if (!rota) return res.status(405).json({ error: 'Método não permitido' });
    return await rota(req, res);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.error });
    console.error('Erro em /api/admin/avisos:', err.message);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
