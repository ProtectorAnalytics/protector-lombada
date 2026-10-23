/**
 * /api/admin/veiculos — vínculos de placa do cliente (quem é o dono da placa).
 *
 * O vínculo tem histórico: gravar é sempre via RPC vincular_placa (encerra o
 * vigente que difere e abre o novo); "excluir" encerra (encerrado_em); só o
 * super_admin apaga de vez. A coluna `ativo` é mantida pelo banco
 * (ativo = encerrado_em is null) e não é aceita pela API.
 */
const { autenticar, verificarAcessoCliente, registrarAuditoria, supabase } = require('../../lib/auth-middleware');
const { isValidPlaca, normalizePlaca, sanitize, isValidUUID } = require('../../lib/validators');
const { limpar } = require('../../site/js/placa');
const { TIPOS_PESSOA } = require('../../site/js/vinculo-placa');
const { ErroHttp, exigirCorrigivel, substituirComCorrecao } = require('../../lib/correcao-portaria');

const ROLES_LEITURA = ['super_admin', 'admin_cliente', 'operador', 'portaria'];
const ROLES_CADASTRO = ['super_admin', 'admin_cliente', 'operador', 'portaria'];
const ROLES_EDICAO = ['super_admin', 'admin_cliente', 'operador'];
// PUT: a portaria também edita, mas só o próprio cadastro (ver exigirEdicaoDaPortaria)
const ROLES_ATUALIZACAO = [...ROLES_EDICAO, 'portaria'];
const TIPOS_VALIDOS = new Set(TIPOS_PESSOA.map((t) => t.id));
const CAMPOS_EDITAVEIS = ['tipo_pessoa', 'nome_morador', 'unidade', 'unidade_id', 'marca', 'cor'];
const CAMPOS_PORTARIA = new Set(['tipo_pessoa', 'nome_morador', 'unidade', 'unidade_id']);
const ERRO_NAO_E_MEU = 'Só dá para editar cadastros feitos por você';
const COLUNAS = 'id, placa, nome_morador, unidade, unidade_id, tipo_pessoa, marca, cor, vigente_desde, encerrado_em, criado_em, origem, cadastrado_por';
// Portaria no histórico: só o necessário para sugerir nomes (sem marca/cor/origem).
// cadastrado_por_usuario vira `meu` (boolean) antes de sair; o id não é exposto.
const COLUNAS_HISTORICO_PORTARIA = 'id, placa, nome_morador, unidade, unidade_id, tipo_pessoa, vigente_desde, encerrado_em, criado_em, cadastrado_por, cadastrado_por_usuario';
const MAX_TEXTO = 80;
const ERRO_ENTRADA_INVALIDA = '22023';

const ipDe = (req) => req.headers['x-forwarded-for'] || req.socket?.remoteAddress;

// Texto livre opcional: sem HTML, aparado, com teto; vazio vira null.
function texto(v) {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') throw new ErroHttp(400, 'Campo de texto inválido');
  const limpo = sanitize(v).slice(0, MAX_TEXTO);
  return limpo || null;
}

function validarTipo(tipo) {
  if (!tipo) throw new ErroHttp(400, 'Informe o tipo: morador, proprietário, visitante ou prestador');
  if (!TIPOS_VALIDOS.has(tipo)) throw new ErroHttp(400, 'Tipo inválido: use morador, proprietário, visitante ou prestador');
}

async function exigirUnidadeDoCliente(unidadeId, clienteId) {
  if (!isValidUUID(unidadeId)) throw new ErroHttp(400, 'Unidade inválida');
  const { data, error } = await supabase
    .from('unidades').select('id, cliente_id').eq('id', unidadeId).maybeSingle();
  if (error) throw error;
  if (!data || data.cliente_id !== clienteId) throw new ErroHttp(400, 'Unidade não pertence a este condomínio');
}

function origemDe(profile, origemEnviada) {
  if (profile.role === 'portaria') return 'portaria';
  if (origemEnviada === 'planilha') return 'planilha';
  return profile.role === 'super_admin' ? 'admin' : 'painel';
}

const ehObjetoJson = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Corpo tem de ser um objeto JSON; null, lista, texto ou número → 400 (não 500). */
async function lerCorpo(req) {
  let corpo = req.body;
  if (corpo === undefined) {
    try {
      corpo = JSON.parse(await readBody(req) || '{}');
    } catch {
      throw new ErroHttp(400, 'Corpo inválido');
    }
  }
  if (!ehObjetoJson(corpo)) throw new ErroHttp(400, 'Corpo inválido');
  return corpo;
}

async function buscarVinculo(id) {
  if (!isValidUUID(id)) throw new ErroHttp(400, 'ID do veículo inválido');
  const { data, error } = await supabase
    .from('veiculos').select('id, cliente_id, placa, encerrado_em, cadastrado_por_usuario').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new ErroHttp(404, 'Veículo não encontrado');
  return data;
}

function exigirAcesso(profile, clienteId) {
  if (!verificarAcessoCliente(profile, clienteId)) throw new ErroHttp(403, 'Sem acesso a este cliente');
}

// PostgREST corta cada resposta em max-rows (1000): lê em lotes até acabar.
const LOTE = 1000;
const TETO_LINHAS = 20000;

async function lerEmLotes(montarQuery) {
  const linhas = [];
  while (linhas.length < TETO_LINHAS) {
    const ini = linhas.length;
    const fim = Math.min(ini + LOTE, TETO_LINHAS) - 1;
    const { data, error } = await montarQuery().range(ini, fim);
    if (error) throw error;
    const lote = data || [];
    linhas.push(...lote);
    if (lote.length < fim - ini + 1) break;
  }
  return linhas;
}

// GET: vigentes (padrão) ou histórico completo (historico=1)
async function listar(req, res) {
  const { profile } = await autenticar(req, ROLES_LEITURA);
  const clienteId = req.query.cliente_id || profile.cliente_id;
  if (!clienteId) return res.status(400).json({ error: 'cliente_id obrigatório' });
  exigirAcesso(profile, clienteId);

  const historico = req.query.historico === '1';
  const colunas = historico && profile.role === 'portaria' ? COLUNAS_HISTORICO_PORTARIA : COLUNAS;
  const placa = limpar(req.query.placa);
  // Ordem estável entre lotes: criado_em e, no empate, id.
  const montarQuery = () => {
    let query = supabase
      .from('veiculos')
      .select(colunas)
      .eq('cliente_id', clienteId)
      .order('criado_em', { ascending: false })
      .order('id', { ascending: true });
    if (!historico) query = query.is('encerrado_em', null);
    if (placa) query = query.ilike('placa', `%${placa}%`);
    return query;
  };

  const linhas = await lerEmLotes(montarQuery);
  if (colunas !== COLUNAS_HISTORICO_PORTARIA) return res.status(200).json(linhas);
  return res.status(200).json(linhas.map((linha) => comMeu(linha, profile.id)));
}

/** Troca o id de quem cadastrou por `meu` (cadastro deste login). */
function comMeu(linha, usuarioId) {
  const { cadastrado_por_usuario: autor, ...resto } = linha;
  return { ...resto, meu: Boolean(autor) && autor === usuarioId };
}

async function vincular(args) {
  const { data, error } = await supabase.rpc('vincular_placa', args);
  if (error && error.code === ERRO_ENTRADA_INVALIDA) {
    throw new ErroHttp(400, 'Não foi possível gravar: confira a placa e a unidade');
  }
  if (error) throw error;
  return data;
}

// POST: vincula a placa via RPC (histórico preservado pelo banco)
async function cadastrar(req, res) {
  const { profile } = await autenticar(req, ROLES_CADASTRO);
  const body = await lerCorpo(req);
  const clienteId = body.cliente_id || profile.cliente_id;

  if (!clienteId || !body.placa) return res.status(400).json({ error: 'Campos obrigatórios: cliente_id, placa' });
  if (!isValidPlaca(body.placa)) return res.status(400).json({ error: 'Placa inválida. Use formato ABC1234 ou ABC1D23' });
  validarTipo(body.tipo_pessoa);
  exigirAcesso(profile, clienteId);

  const substituiId = body.substitui_id;
  const temSubstituicao = substituiId !== undefined && substituiId !== null && substituiId !== '';
  if (temSubstituicao && profile.role !== 'portaria') {
    throw new ErroHttp(400, 'Para corrigir um cadastro, edite ou exclua o vínculo na lista de veículos');
  }

  const unidadeId = body.unidade_id || null;
  if (unidadeId) await exigirUnidadeDoCliente(unidadeId, clienteId);
  // Porteiro tem login próprio: o cadastro sai no nome do login (porteiro_id é ignorado)
  const cadastradoPor = profile.nome || null;
  const ctx = { profile, clienteId, req };
  const original = temSubstituicao ? await exigirCorrigivel(substituiId, body.placa, ctx) : null;

  const args = {
    p_cliente_id: clienteId,
    p_placa: normalizePlaca(body.placa),
    p_tipo: body.tipo_pessoa,
    p_nome: texto(body.nome_morador),
    p_unidade: texto(body.unidade),
    p_unidade_id: unidadeId,
    p_marca: texto(body.marca),
    p_cor: texto(body.cor),
    p_origem: origemDe(profile, body.origem),
    p_cadastrado_por: cadastradoPor,
    p_usuario: profile.id,
  };
  const data = original
    ? await substituirComCorrecao(original, () => vincular(args), ctx)
    : await vincular(args);

  await registrarAuditoria({
    usuarioId: profile.id,
    acao: 'vincular',
    tabela: 'veiculos',
    registroId: data && data.id,
    detalhes: {
      cliente_id: clienteId, placa: args.p_placa, tipo_pessoa: args.p_tipo, nome_morador: args.p_nome,
      unidade_id: unidadeId, origem: args.p_origem,
      substitui_id: original ? original.id : undefined,
    },
    ip: ipDe(req),
  });
  return res.status(201).json(data);
}

async function camposDaEdicao(body, clienteId) {
  if ('placa' in body) throw new ErroHttp(400, 'A placa não pode ser alterada: exclua e cadastre de novo');
  const campos = {};
  for (const c of CAMPOS_EDITAVEIS) {
    if (!(c in body)) continue;
    if (c === 'tipo_pessoa') { validarTipo(body.tipo_pessoa); campos.tipo_pessoa = body.tipo_pessoa; continue; }
    if (c === 'unidade_id') {
      if (body.unidade_id) await exigirUnidadeDoCliente(body.unidade_id, clienteId);
      campos.unidade_id = body.unidade_id || null;
      continue;
    }
    campos[c] = texto(body[c]);
  }
  if (Object.keys(campos).length === 0) throw new ErroHttp(400, 'Nada para alterar');
  return campos;
}

/**
 * Porteiro: só nome, unidade e tipo (sem prazo) do cadastro feito por este
 * login. Placa, marca, cor ou qualquer outro campo → 400.
 */
function exigirEdicaoDaPortaria(body, existente, profile) {
  const proibido = Object.keys(body).find((c) => c !== 'id' && !CAMPOS_PORTARIA.has(c));
  if (proibido === 'placa') throw new ErroHttp(400, 'A placa não pode ser alterada: exclua e cadastre de novo');
  if (proibido) throw new ErroHttp(400, 'Pela portaria dá para mudar só nome, unidade e tipo');
  if (!existente.cadastrado_por_usuario || existente.cadastrado_por_usuario !== profile.id) {
    throw new ErroHttp(403, ERRO_NAO_E_MEU);
  }
}

// PUT: corrige dados do vínculo vigente (sem trocar placa)
async function atualizar(req, res) {
  const { profile } = await autenticar(req, ROLES_ATUALIZACAO);
  const body = await lerCorpo(req);
  const id = req.query.id || body.id;
  if (!id) return res.status(400).json({ error: 'ID do veículo obrigatório' });

  const existente = await buscarVinculo(id);
  exigirAcesso(profile, existente.cliente_id);
  const ehPortaria = profile.role === 'portaria';
  if (ehPortaria) exigirEdicaoDaPortaria(body, existente, profile);
  if (existente.encerrado_em) throw new ErroHttp(409, 'Este vínculo já foi encerrado e não pode ser alterado');

  const campos = await camposDaEdicao(body, existente.cliente_id);
  let query = supabase
    .from('veiculos')
    .update(campos)
    .eq('id', id)
    .is('encerrado_em', null);
  // Condicional também no banco: o dono não muda entre a leitura e a gravação.
  if (ehPortaria) query = query.eq('cadastrado_por_usuario', profile.id);
  const { data: gravado, error } = await query
    .select(ehPortaria ? `${COLUNAS}, cadastrado_por_usuario` : COLUNAS)
    .maybeSingle();
  const data = gravado && ehPortaria ? comMeu(gravado, profile.id) : gravado;
  if (error) throw error;
  if (!data) throw new ErroHttp(409, 'Este vínculo já foi encerrado e não pode ser alterado');

  await registrarAuditoria({
    usuarioId: profile.id,
    acao: 'atualizar',
    tabela: 'veiculos',
    registroId: id,
    detalhes: { cliente_id: existente.cliente_id, ...campos },
    ip: ipDe(req),
  });
  return res.status(200).json(data);
}

// DELETE: encerra o vínculo; permanent=true (só super_admin) apaga a linha
async function remover(req, res) {
  const { profile } = await autenticar(req, ROLES_EDICAO);
  const permanente = req.query.permanent === 'true';
  if (!req.query.id) return res.status(400).json({ error: 'ID do veículo obrigatório' });
  if (permanente && profile.role !== 'super_admin') {
    throw new ErroHttp(403, 'Só o administrador Protector pode excluir definitivamente');
  }

  const existente = await buscarVinculo(req.query.id);
  exigirAcesso(profile, existente.cliente_id);
  const detalhes = { cliente_id: existente.cliente_id, placa: existente.placa };

  if (permanente) {
    const { error } = await supabase.from('veiculos').delete().eq('id', existente.id);
    if (error) throw error;
    await registrarAuditoria({ usuarioId: profile.id, acao: 'excluir', tabela: 'veiculos', registroId: existente.id, detalhes, ip: ipDe(req) });
    return res.status(200).json({ ok: true, message: 'Veículo excluído permanentemente' });
  }

  if (existente.encerrado_em) return res.status(200).json({ ok: true, message: 'Vínculo já estava encerrado' });

  const encerradoEm = new Date().toISOString();
  const { error } = await supabase
    .from('veiculos')
    .update({ encerrado_em: encerradoEm })
    .eq('id', existente.id)
    .is('encerrado_em', null);
  if (error) throw error;

  await registrarAuditoria({
    usuarioId: profile.id, acao: 'encerrar', tabela: 'veiculos', registroId: existente.id,
    detalhes: { ...detalhes, encerrado_em: encerradoEm }, ip: ipDe(req),
  });
  return res.status(200).json({ ok: true, message: 'Vínculo encerrado' });
}

const ROTAS = { GET: listar, POST: cadastrar, PUT: atualizar, DELETE: remover };

module.exports = async function handler(req, res) {
  try {
    const rota = ROTAS[req.method];
    if (!rota) return res.status(405).json({ error: 'Método não permitido' });
    return await rota(req, res);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.error });
    console.error('Erro em /api/admin/veiculos:', err.message);
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
