/**
 * Regras para um contato "Só recebe e-mail" (role so_email) passar a ficar
 * ATIVO — na criação (/api/admin/avisos POST) e na reativação (PUT de
 * /api/admin/avisos e de /api/admin/usuarios). Um lugar só, para as duas
 * rotas não divergirem.
 *
 * - e-mail livre: nenhum outro so_email do cliente (mesmo inativo) nem
 *   usuário ATIVO do cliente com o mesmo e-mail (sem maiúsculas/espaços) → 409;
 * - teto de contatos ativos por cliente → 409.
 *
 * supabase-js não lança: todo `error` vira exceção.
 */
const { ErroHttp } = require('./lista-portaria-api');
const { normalizarEmail } = require('../site/js/avisos-email');

const ROLE_CONTATO = 'so_email';
// Teto de contatos so_email ATIVOS por condomínio. O síndico cadastra e-mails
// de terceiros sem confirmação: o limite segura abuso (relay de alertas e
// coleta de e-mails) sem atrapalhar o uso normal (conselho, administradora).
const MAX_CONTATOS_SO_EMAIL = 30;
const PAGINA = 1000;
const COLUNAS = 'id, cliente_id, nome, email, role, ativo, recebe_alertas, recebe_relatorio';

const MSG_CONTATO_EXISTE = 'Já existe um contato "Só recebe e-mail" com este e-mail';
const MSG_DE_USUARIO = 'Este e-mail já é de um usuário; ligue as opções nele';
const MSG_LIMITE = `Limite de ${MAX_CONTATOS_SO_EMAIL} contatos que só recebem e-mail neste condomínio`;

/** Usuários do cliente exceto portaria (o PostgREST corta em 1000 linhas: lê em páginas). */
async function usuariosDoCliente(db, clienteId) {
  const todos = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await db.from('usuarios').select(COLUNAS)
      .eq('cliente_id', clienteId).neq('role', 'portaria')
      .order('nome', { ascending: true }).order('id', { ascending: true })
      .range(de, de + PAGINA - 1);
    if (error) throw error;
    todos.push(...(data || []));
    if (!data || data.length < PAGINA) return todos;
  }
}

/** 409 se o e-mail já é de um so_email (mesmo inativo) ou de outro usuário ATIVO. */
function exigirEmailLivre(usuarios, email, ignorarId) {
  const iguais = usuarios.filter((u) => u.id !== ignorarId && normalizarEmail(u.email) === email);
  if (iguais.some((u) => u.role === ROLE_CONTATO)) throw new ErroHttp(409, MSG_CONTATO_EXISTE);
  // Dono inativo não recebe: aceita o contato (mesma regra da migração).
  if (iguais.some((u) => u.ativo)) throw new ErroHttp(409, MSG_DE_USUARIO);
}

/** 409 se o cliente já tem o teto de so_email ativos (sem contar `ignorarId`). */
function exigirVagaDeContato(usuarios, ignorarId) {
  const ativos = usuarios.filter((u) => u.role === ROLE_CONTATO && u.ativo && u.id !== ignorarId).length;
  if (ativos >= MAX_CONTATOS_SO_EMAIL) throw new ErroHttp(409, MSG_LIMITE);
}

/**
 * @param {{ from: Function }} db
 * @param {string} clienteId
 * @param {string} email já normalizado
 * @param {string|null} ignorarId o próprio contato, na edição/reativação
 * @param {{ ativando: boolean }} opcoes ativando=true também confere o teto
 */
async function conferirContato(db, clienteId, email, ignorarId, { ativando }) {
  const usuarios = await usuariosDoCliente(db, clienteId);
  exigirEmailLivre(usuarios, normalizarEmail(email), ignorarId);
  if (ativando) exigirVagaDeContato(usuarios, ignorarId);
}

module.exports = {
  MAX_CONTATOS_SO_EMAIL,
  MSG_CONTATO_EXISTE,
  MSG_LIMITE,
  usuariosDoCliente,
  conferirContato,
};
