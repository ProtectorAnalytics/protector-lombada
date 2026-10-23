/**
 * Handler comum das listas simples da portaria (hoje só as unidades; os
 * porteiros viraram usuários em api/admin/porteiros.js):
 * GET lista as ativas, POST cola várias linhas, DELETE desativa uma.
 * Toda escrita passa por aqui com o cliente de serviço (o RLS só deixa ler),
 * então cada id/cliente_id é conferido contra o cliente de quem chama.
 */
const { autenticar, verificarAcessoCliente, registrarAuditoria, supabase } = require('./auth-middleware');
const { isValidUUID } = require('./validators');
const { parseLinhas } = require('./lista-simples');

const ROLES_LEITURA = ['super_admin', 'admin_cliente', 'operador', 'portaria'];
const ROLES_ESCRITA = ['super_admin', 'admin_cliente'];
const UNICA_VIOLADA = '23505';

class ErroHttp extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; this.error = mensagem; }
}

const ipDe = (req) => req.headers['x-forwarded-for'] || req.socket?.remoteAddress;

function lerTexto(req) {
  return new Promise((resolve, reject) => {
    let corpo = '';
    req.on('data', (c) => {
      corpo += c;
      if (corpo.length > 1e6) { req.destroy(); reject(new ErroHttp(413, 'Corpo da requisição muito grande')); }
    });
    req.on('end', () => resolve(corpo));
    req.on('error', reject);
  });
}

async function lerCorpo(req) {
  let corpo = req.body;
  if (corpo === undefined || corpo === null) {
    try { corpo = JSON.parse((await lerTexto(req)) || '{}'); } catch (e) {
      if (e.status) throw e;
      throw new ErroHttp(400, 'Corpo da requisição inválido');
    }
  }
  if (typeof corpo !== 'object' || corpo === null || Array.isArray(corpo)) {
    throw new ErroHttp(400, 'Corpo da requisição inválido');
  }
  return corpo;
}

function exigirAcesso(profile, clienteId) {
  if (!verificarAcessoCliente(profile, clienteId)) throw new ErroHttp(403, 'Sem acesso a este cliente');
}

function criarHandler({ tabela, rotulo, comOrdem }) {
  const ordenar = (q) => (comOrdem ? q.order('ordem', { ascending: true }).order('nome', { ascending: true }) : q.order('nome', { ascending: true }));
  const colunas = comOrdem ? 'id, cliente_id, nome, ordem, ativo, criado_em' : 'id, cliente_id, nome, ativo, criado_em';

  async function listar(req, res) {
    const { profile } = await autenticar(req, ROLES_LEITURA);
    const clienteId = req.query.cliente_id || profile.cliente_id;
    if (!isValidUUID(clienteId)) return res.status(400).json({ error: 'cliente_id obrigatório' });
    exigirAcesso(profile, clienteId);
    const { data, error } = await ordenar(
      supabase.from(tabela).select(colunas).eq('cliente_id', clienteId).eq('ativo', true));
    if (error) throw error;
    return res.status(200).json(data);
  }

  async function adicionar(req, res) {
    const { profile } = await autenticar(req, ROLES_ESCRITA);
    const body = await lerCorpo(req);
    const clienteId = body.cliente_id || profile.cliente_id;
    if (!isValidUUID(clienteId)) return res.status(400).json({ error: 'cliente_id obrigatório' });
    if (typeof body.texto !== 'string' || !body.texto.trim()) {
      return res.status(400).json({ error: `Cole ao menos um nome de ${rotulo}` });
    }
    exigirAcesso(profile, clienteId);

    // O nome é gravado como veio (D'Ávila, A & B): o escape é feito na saída.
    // Só caracteres de controle (exceto quebra de linha) são removidos.
    let parsed;
    try { parsed = parseLinhas(body.texto.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')); } catch (e) {
      throw new ErroHttp(400, e.message);
    }

    const { data: existentes, error: erroLeitura } = await supabase
      .from(tabela).select(colunas).eq('cliente_id', clienteId);
    if (erroLeitura) throw erroLeitura;
    const porNome = new Map((existentes || []).map((l) => [l.nome.toLowerCase(), l]));
    const maxOrdem = (existentes || []).reduce((m, l) => Math.max(m, l.ordem || 0), 0);

    let jaExistiam = 0;
    const novas = [];
    const reativar = [];
    parsed.itens.forEach((nome, i) => {
      const atual = porNome.get(nome.toLowerCase());
      const ordem = comOrdem ? { ordem: maxOrdem + 1 + i } : {};
      if (atual && atual.ativo) { jaExistiam++; return; }
      if (atual) { reativar.push({ id: atual.id, ...ordem }); return; }
      novas.push({ cliente_id: clienteId, nome, ...ordem });
    });

    for (const { id, ...ordem } of reativar) {
      const { error } = await supabase.from(tabela).update({ ativo: true, ...ordem }).eq('id', id).eq('cliente_id', clienteId);
      if (error) throw error;
    }
    if (novas.length) {
      const { error } = await supabase.from(tabela).insert(novas);
      if (error && error.code === UNICA_VIOLADA) throw new ErroHttp(409, 'Alguém cadastrou o mesmo nome agora. Tente de novo.');
      if (error) throw error;
    }

    const criadas = novas.length + reativar.length;
    await registrarAuditoria({
      usuarioId: profile.id, acao: 'criar', tabela, registroId: null,
      detalhes: { cliente_id: clienteId, criadas, ja_existiam: jaExistiam, ignoradas: parsed.ignoradas.length, reativadas: reativar.length },
      ip: ipDe(req),
    });
    return res.status(201).json({ criadas, ja_existiam: jaExistiam, ignoradas: parsed.ignoradas });
  }

  async function desativar(req, res) {
    const { profile } = await autenticar(req, ROLES_ESCRITA);
    const id = req.query.id;
    if (!isValidUUID(id)) return res.status(400).json({ error: 'ID inválido' });
    const { data: linha, error: erroLeitura } = await supabase
      .from(tabela).select('id, cliente_id, nome, ativo').eq('id', id).maybeSingle();
    if (erroLeitura) throw erroLeitura;
    if (!linha) throw new ErroHttp(404, 'Cadastro não encontrado');
    exigirAcesso(profile, linha.cliente_id);

    if (linha.ativo) {
      const { error } = await supabase.from(tabela).update({ ativo: false }).eq('id', id).eq('cliente_id', linha.cliente_id);
      if (error) throw error;
      await registrarAuditoria({
        usuarioId: profile.id, acao: 'desativar', tabela, registroId: id,
        detalhes: { cliente_id: linha.cliente_id, nome: linha.nome }, ip: ipDe(req),
      });
    }
    return res.status(200).json({ ok: true });
  }

  const ROTAS = { GET: listar, POST: adicionar, DELETE: desativar };

  return async function handler(req, res) {
    try {
      const rota = ROTAS[req.method];
      if (!rota) return res.status(405).json({ error: 'Método não permitido' });
      return await rota(req, res);
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.error });
      console.error(`Erro em /api/admin/${tabela}:`, err.message);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  };
}

module.exports = { criarHandler, lerCorpo, ErroHttp, ipDe };
