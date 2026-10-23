/**
 * Unidades estruturadas (agrupador, andar, tipo) — POST em lote e PUT de
 * /api/admin/unidades. O handler, a autenticação e o corpo ficam em
 * lib/lista-portaria-api.js; aqui só as regras da unidade.
 *
 * Tipos e rótulo vêm de site/js/unidade.js (mesma regra do browser).
 * Unicidade: (cliente, agrupador, nome) sem diferenciar maiúsculas, garantida
 * pelo índice uq_unidades_cliente_bloco_nome. É índice de expressão, então não
 * dá para usar upsert onConflict: lê-se o que existe, insere-se só o novo e o
 * 23505 de uma corrida é tratado sem 500.
 */
const { supabase, registrarAuditoria } = require('./auth-middleware');
const { tipoUnidade, rotuloUnidade } = require('../site/js/unidade');
const { MAX_TAMANHO } = require('./lista-simples');

// Teto do lote por requisição: cobre o maior condomínio esperado numa planilha
// só e mantém o insert único (e a leitura das existentes) num tamanho seguro.
const MAX_LOTE = 2000;
const MAX_BLOCO = 40;
const MAX_ANDAR = 10;
const TIPO_PADRAO = 'apartamento';
const UNICA_VIOLADA = '23505';
// O PostgREST corta cada leitura em max_rows (1000): lê-se em páginas.
const PAGINA = 1000;
// Reativações em paralelo, em grupos deste tamanho (sem um round-trip por vez
// e sem disparar centenas de requisições de uma só vez).
const REATIVAR_EM_PARALELO = 10;
const COLUNAS = 'id, cliente_id, bloco, nome, andar, tipo, ordem, ativo, criado_em';

const CONTROLE = /[\u0000-\u001F\u007F]/g;

const chaveUnidade = (u) => `${String(u.bloco || '').toLowerCase()}\u0000${String(u.nome).toLowerCase()}`;
const comRotulo = (l) => ({ ...l, rotulo: rotuloUnidade(l) });

/** Texto opcional: trim, espaços colapsados; vazio → null. Erro → { erro }. */
function textoOpcional(valor, max, nomeCampo) {
  if (valor === undefined || valor === null) return { valor: null };
  if (typeof valor !== 'string' && typeof valor !== 'number') return { erro: `${nomeCampo} inválido` };
  const limpo = String(valor).replace(CONTROLE, '').trim().replace(/\s+/g, ' ');
  if (!limpo) return { valor: null };
  if (limpo.length > max) return { erro: `${nomeCampo} acima de ${max} caracteres` };
  return { valor: limpo };
}

function nomeValido(valor) {
  if (typeof valor !== 'string' && typeof valor !== 'number') return { erro: 'Unidade vazia' };
  const limpo = String(valor).replace(CONTROLE, '').trim().replace(/\s+/g, ' ');
  if (!limpo) return { erro: 'Unidade vazia' };
  if (limpo.length > MAX_TAMANHO) return { erro: `Unidade acima de ${MAX_TAMANHO} caracteres` };
  return { valor: limpo };
}

function tipoValido(valor) {
  if (valor === undefined || valor === null || valor === '') return { valor: TIPO_PADRAO };
  const tipo = typeof valor === 'string' ? tipoUnidade(valor) : null;
  return tipo ? { valor: tipo.id } : { erro: 'Tipo de unidade desconhecido' };
}

const VALIDADORES = {
  bloco: (v) => textoOpcional(v, MAX_BLOCO, 'Bloco/Torre/Quadra'),
  nome: nomeValido,
  andar: (v) => textoOpcional(v, MAX_ANDAR, 'Andar'),
  tipo: tipoValido,
};

/** Só os campos presentes em `entrada`; { campos } ou { erro }. */
function validarCampos(entrada, nomes) {
  const campos = {};
  for (const campo of nomes) {
    if (!(campo in entrada)) continue;
    const r = VALIDADORES[campo](entrada[campo]);
    if (r.erro) return { erro: r.erro };
    campos[campo] = r.valor;
  }
  return { campos };
}

/** Uma linha do lote → unidade completa ou { erro }. */
function normalizarUnidade(entrada) {
  if (typeof entrada !== 'object' || entrada === null || Array.isArray(entrada)) return { erro: 'Linha inválida' };
  const r = validarCampos({ nome: entrada.nome, ...entrada }, ['bloco', 'nome', 'andar', 'tipo']);
  if (r.erro) return r;
  return { unidade: { bloco: null, andar: null, tipo: TIPO_PADRAO, ...r.campos } };
}

/** Separa o lote em válidas (sem repetição) e recusadas { linha (1-based), motivo }. */
function separarLote(itens) {
  const validas = [];
  const recusadas = [];
  const vistas = new Set();
  itens.forEach((entrada, i) => {
    const r = normalizarUnidade(entrada);
    if (r.erro) { recusadas.push({ linha: i + 1, motivo: r.erro }); return; }
    const k = chaveUnidade(r.unidade);
    if (vistas.has(k)) { recusadas.push({ linha: i + 1, motivo: 'Unidade duplicada no mesmo agrupador' }); return; }
    vistas.add(k);
    validas.push(r.unidade);
  });
  return { validas, recusadas };
}

async function lerExistentes(clienteId) {
  const todas = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await supabase
      .from('unidades').select('id, bloco, nome, ordem, ativo').eq('cliente_id', clienteId)
      .order('id', { ascending: true }).range(de, de + PAGINA - 1);
    if (error) throw error;
    todas.push(...(data || []));
    if (!data || data.length < PAGINA) return todas;
  }
}

/** Classifica as válidas contra o banco: já ativas, a reativar e novas. */
function planejar(validas, existentes, clienteId) {
  const porChave = new Map(existentes.map((l) => [chaveUnidade(l), l]));
  let proxima = existentes.reduce((m, l) => Math.max(m, l.ordem || 0), 0) + 1;
  const plano = { jaExistiam: 0, reativar: [], novas: [] };
  for (const u of validas) {
    const atual = porChave.get(chaveUnidade(u));
    if (atual && atual.ativo) { plano.jaExistiam++; continue; }
    const ordem = proxima++;
    if (atual) plano.reativar.push({ id: atual.id, patch: { ativo: true, andar: u.andar, tipo: u.tipo, ordem } });
    else plano.novas.push({ cliente_id: clienteId, ...u, ordem });
  }
  return plano;
}

// Cada linha ganha a sua `ordem`, então é um update por id (sempre preso ao cliente).
async function reativar(lista, clienteId) {
  for (let i = 0; i < lista.length; i += REATIVAR_EM_PARALELO) {
    const grupo = lista.slice(i, i + REATIVAR_EM_PARALELO);
    const resultados = await Promise.all(grupo.map(({ id, patch }) =>
      supabase.from('unidades').update(patch).eq('id', id).eq('cliente_id', clienteId)));
    const falha = resultados.find((r) => r.error);
    if (falha) throw falha.error;
  }
}

/** Insere as novas; numa corrida (23505) relê e insere só o que ainda falta. */
async function inserirNovas(novas, clienteId) {
  if (!novas.length) return { inseridas: 0, corrida: 0 };
  const { error } = await supabase.from('unidades').insert(novas);
  if (!error) return { inseridas: novas.length, corrida: 0 };
  if (error.code !== UNICA_VIOLADA) throw error;

  const agora = new Set((await lerExistentes(clienteId)).map(chaveUnidade));
  const restantes = novas.filter((u) => !agora.has(chaveUnidade(u)));
  if (restantes.length) {
    const { error: erro2 } = await supabase.from('unidades').insert(restantes);
    if (erro2 && erro2.code === UNICA_VIOLADA) {
      const e = new Error('corrida'); e.status = 409; e.error = 'Alguém cadastrou as mesmas unidades agora. Tente de novo.';
      throw e;
    }
    if (erro2) throw erro2;
  }
  return { inseridas: restantes.length, corrida: novas.length - restantes.length };
}

/** POST { unidades: [...] } → { criadas, ja_existiam, recusadas }. */
async function adicionarEstruturadas({ profile, clienteId, itens, ip }) {
  const { validas, recusadas } = separarLote(itens);
  if (!validas.length) return { criadas: 0, ja_existiam: 0, recusadas };

  const plano = planejar(validas, await lerExistentes(clienteId), clienteId);
  await reativar(plano.reativar, clienteId);
  const { inseridas, corrida } = await inserirNovas(plano.novas, clienteId);

  const resultado = { criadas: inseridas + plano.reativar.length, ja_existiam: plano.jaExistiam + corrida, recusadas };
  await registrarAuditoria({
    usuarioId: profile.id, acao: 'criar', tabela: 'unidades', registroId: null,
    detalhes: {
      cliente_id: clienteId, criadas: resultado.criadas, ja_existiam: resultado.ja_existiam,
      recusadas: recusadas.length, reativadas: plano.reativar.length,
    },
    ip,
  });
  return resultado;
}

/** PUT: valida o corpo; { patch } ou { erro }. */
function validarEdicao(body) {
  const r = validarCampos(body, ['bloco', 'nome', 'andar', 'tipo']);
  if (r.erro) return r;
  if (!Object.keys(r.campos).length) return { erro: 'Nada para alterar' };
  return { patch: r.campos };
}

/** PUT da linha já conferida (mesmo cliente, ativa). Conflito → 409. */
async function editarUnidade({ profile, linha, patch, ip }) {
  const { error } = await supabase.from('unidades').update(patch).eq('id', linha.id).eq('cliente_id', linha.cliente_id);
  if (error && error.code === UNICA_VIOLADA) {
    const e = new Error('conflito'); e.status = 409; e.error = 'Já existe uma unidade com esse nome neste agrupador';
    throw e;
  }
  if (error) throw error;
  const depois = { ...linha, ...patch };
  await registrarAuditoria({
    usuarioId: profile.id, acao: 'atualizar', tabela: 'unidades', registroId: linha.id,
    detalhes: {
      cliente_id: linha.cliente_id,
      antes: { bloco: linha.bloco, nome: linha.nome, andar: linha.andar, tipo: linha.tipo },
      depois: { bloco: depois.bloco, nome: depois.nome, andar: depois.andar, tipo: depois.tipo },
    },
    ip,
  });
  return comRotulo(depois);
}

module.exports = {
  MAX_LOTE, PAGINA, REATIVAR_EM_PARALELO, COLUNAS, comRotulo, chaveUnidade, separarLote, validarEdicao,
  adicionarEstruturadas, editarUnidade,
};
