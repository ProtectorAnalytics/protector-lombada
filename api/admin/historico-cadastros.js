/**
 * GET /api/admin/historico-cadastros — quem cadastrou, alterou ou encerrou
 * cada placa do condomínio, e o que mudou (lido do audit_log).
 *
 * Query: cliente_id (obrigatório para a equipe Protector), placa, de, ate
 * (AAAA-MM-DD, fuso de São Paulo), pagina (1, 2, …). 50 por página, mais
 * recentes primeiro.
 *
 * Resposta: { itens: [{ id, acao, placa, criado_em, autor_nome, autor_papel,
 * antes, depois, agora }], pagina, tem_mais }. Nunca sai ip nem usuario_id.
 */
const { autenticar, verificarAcessoCliente, supabase } = require('../../lib/auth-middleware');
const { isValidUUID } = require('../../lib/validators');
const { limpar, paraMercosul, paraAntiga } = require('../../site/js/placa');
const { ACOES_HISTORICO, itemDoHistorico } = require('../../site/js/historico-cadastro');

const ROLES = ['super_admin', 'admin_cliente', 'operador'];
const POR_PAGINA = 50;
const MAX_PAGINA = 200;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const OFFSET_SP = '-03:00'; // São Paulo sem horário de verão desde 2019

class ErroHttp extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; this.error = mensagem; }
}

function dataValida(v) {
  if (!RE_DATA.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function lerData(v, nome) {
  if (v === undefined || v === '') return null;
  if (typeof v !== 'string' || !dataValida(v)) throw new ErroHttp(400, `Data inválida em "${nome}": use AAAA-MM-DD`);
  return v;
}

function grafias(placa) {
  const m = paraMercosul(placa);
  return m ? [m, paraAntiga(m)].filter(Boolean) : [limpar(placa)];
}

function lerFiltros(query, profile) {
  const clienteId = query.cliente_id || profile.cliente_id;
  if (!clienteId || typeof clienteId !== 'string' || !isValidUUID(clienteId)) throw new ErroHttp(400, 'cliente_id inválido');
  if (!verificarAcessoCliente(profile, clienteId)) throw new ErroHttp(403, 'Sem acesso a este cliente');

  const pagina = query.pagina === undefined ? 1 : Number(query.pagina);
  if (!Number.isInteger(pagina) || pagina < 1 || pagina > MAX_PAGINA) throw new ErroHttp(400, 'Página inválida');

  let placas = null;
  if (query.placa !== undefined && query.placa !== '') {
    if (typeof query.placa !== 'string') throw new ErroHttp(400, 'Placa inválida');
    const limpa = limpar(query.placa);
    if (!limpa || limpa.length > 7) throw new ErroHttp(400, 'Placa inválida');
    placas = grafias(limpa);
  }
  const de = lerData(query.de, 'de');
  const ate = lerData(query.ate, 'ate');
  if (de && ate && de > ate) throw new ErroHttp(400, 'O início do período é depois do fim');
  return { clienteId, pagina, placas, de, ate };
}

async function lerLinhas({ clienteId, pagina, placas, de, ate }) {
  const ini = (pagina - 1) * POR_PAGINA;
  let q = supabase
    .from('audit_log')
    .select('id, acao, detalhes, criado_em, usuario_id')
    .eq('tabela', 'veiculos')
    .eq('detalhes->>cliente_id', clienteId)
    .in('acao', ACOES_HISTORICO);
  if (placas) q = q.in('detalhes->>placa', placas);
  if (de) q = q.gte('criado_em', `${de}T00:00:00${OFFSET_SP}`);
  if (ate) q = q.lte('criado_em', `${ate}T23:59:59.999${OFFSET_SP}`);
  // Um a mais que a página: diz se há "Carregar mais" sem contar a tabela
  const { data, error } = await q
    .order('criado_em', { ascending: false })
    .order('id', { ascending: false })
    .range(ini, ini + POR_PAGINA);
  if (error) throw error;
  return data || [];
}

async function lerAutores(linhas) {
  const ids = [...new Set(linhas.map((l) => l.usuario_id).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from('usuarios').select('id, nome, role').in('id', ids);
  if (error) throw error;
  return new Map((data || []).map((u) => [u.id, { nome: u.nome, role: u.role }]));
}

async function listar(req, res) {
  const { profile } = await autenticar(req, ROLES);
  const filtros = lerFiltros(req.query || {}, profile);
  const linhas = await lerLinhas(filtros);
  const pagina = linhas.slice(0, POR_PAGINA);
  const autores = await lerAutores(pagina);
  const itens = pagina.map((l) => itemDoHistorico(l, autores.get(l.usuario_id)));
  return res.status(200).json({ itens, pagina: filtros.pagina, tem_mais: linhas.length > POR_PAGINA });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido' });
    return await listar(req, res);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.error });
    console.error('Erro em /api/admin/historico-cadastros:', err.message);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
