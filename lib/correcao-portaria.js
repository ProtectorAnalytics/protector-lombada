/**
 * Correção da portaria: o porteiro trocou 1 caractere da placa e corrige o
 * próprio cadastro em até 15 min (spec §5.3). A placa nova tem de diferir
 * da substituída em exatamente 1 caractere (chaves Mercosul).
 *
 * Ordem: encerra o vínculo errado com janela vazia (vigente_desde =
 * encerrado_em = agora) → reabre o vínculo legítimo que o cadastro errado
 * tinha encerrado (ramo "difere" do vincular_placa) → vincula a placa certa.
 * Se a placa certa não gravar, desfaz na ordem inversa.
 */
const { registrarAuditoria, supabase } = require('./auth-middleware');
const { isValidUUID } = require('./validators');
const { limpar, paraMercosul, paraAntiga, difereEmUm } = require('../site/js/placa');

const JANELA_CORRECAO_MS = 15 * 60 * 1000;
const ERRO_CORRECAO = 'Só dá para corrigir um cadastro feito por este acesso da portaria nos últimos 15 minutos';
const ERRO_MESMA_PLACA = 'Para mudar nome ou unidade, cadastre de novo; a correção é só para placa lida errada';
const ERRO_UM_CARACTERE = 'A correção é só para 1 caractere lido errado; para outra placa, cadastre de novo';
const MOTIVO = 'correcao_portaria';

class ErroHttp extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; this.error = mensagem; }
}

const chaveDe = (placa) => paraMercosul(placa) || limpar(placa);
function grafiasDe(placa) {
  const m = paraMercosul(placa);
  return m ? [m, paraAntiga(m)].filter(Boolean) : [limpar(placa)];
}
const ipDe = (req) => req.headers['x-forwarded-for'] || req.socket?.remoteAddress;

function auditar(ctx, acao, registroId, detalhes) {
  return registrarAuditoria({
    usuarioId: ctx.profile.id, acao, tabela: 'veiculos', registroId,
    detalhes: { cliente_id: ctx.clienteId, motivo: MOTIVO, ...detalhes }, ip: ipDe(ctx.req),
  });
}

// Update condicional de uma linha; devolve { data, error } com data = { id } se afetou.
async function atualizarVinculo(id, patch, condicoes) {
  let q = supabase.from('veiculos').update(patch).eq('id', id);
  for (const [metodo, coluna, valor] of condicoes) q = q[metodo](coluna, valor);
  return q.select('id').maybeSingle();
}

async function falhouReabrir(ctx, etapa, ids, error) {
  console.error(`Correção da portaria: falha em ${etapa}:`, error ? error.message : 'nenhuma linha afetada');
  await auditar(ctx, 'reabrir_falhou', ids.veiculo_id, { etapa, ...ids });
}

/**
 * Confere se o vínculo a substituir é um cadastro recente deste acesso da portaria.
 * @returns {Promise<object>} a linha original (id, placa, vigente_desde, encerrado_em…)
 */
async function exigirCorrigivel(substituiId, novaPlaca, ctx) {
  if (!isValidUUID(substituiId)) throw new ErroHttp(400, ERRO_CORRECAO);
  const { data, error } = await supabase
    .from('veiculos')
    .select('id, cliente_id, placa, vigente_desde, encerrado_em, origem, cadastrado_por_usuario, criado_em')
    .eq('id', substituiId)
    .maybeSingle();
  if (error) throw error;
  const idade = data ? Date.now() - Date.parse(data.criado_em) : NaN;
  const corrigivel = data
    && data.cliente_id === ctx.clienteId
    && data.encerrado_em === null
    && data.origem === 'portaria'
    && data.cadastrado_por_usuario === ctx.profile.id
    && idade <= JANELA_CORRECAO_MS;
  if (!corrigivel) throw new ErroHttp(400, ERRO_CORRECAO);
  if (chaveDe(data.placa) === chaveDe(novaPlaca)) throw new ErroHttp(400, ERRO_MESMA_PLACA);
  // Só a troca de 1 caractere (leitura errada); comparado nas chaves Mercosul.
  if (!difereEmUm(chaveDe(data.placa), chaveDe(novaPlaca))) throw new ErroHttp(400, ERRO_UM_CARACTERE);
  return data;
}

// Encerra o vínculo errado sem janela de validade; o update repete as condições (corrida/janela).
async function encerrarErrado(original, ctx) {
  const agora = new Date().toISOString();
  const limite = new Date(Date.now() - JANELA_CORRECAO_MS).toISOString();
  const { data, error } = await atualizarVinculo(original.id, { encerrado_em: agora, vigente_desde: agora }, [
    ['eq', 'cliente_id', ctx.clienteId],
    ['eq', 'origem', 'portaria'],
    ['eq', 'cadastrado_por_usuario', ctx.profile.id],
    ['is', 'encerrado_em', null],
    ['gte', 'criado_em', limite],
  ]);
  if (error) throw error;
  if (!data) throw new ErroHttp(400, ERRO_CORRECAO);
  await auditar(ctx, 'encerrar', original.id, {
    placa: original.placa, encerrado_em: agora, vigente_desde: agora, vigente_desde_original: original.vigente_desde,
  });
  return agora;
}

// Vínculo legítimo que o cadastro errado encerrou (encerrado_em = vigente_desde do errado).
async function buscarAnterior(original, ctx) {
  const grafias = grafiasDe(original.placa);
  const { data, error } = await supabase
    .from('veiculos').select('id, placa, encerrado_em')
    .eq('cliente_id', ctx.clienteId).in('placa', grafias).eq('encerrado_em', original.vigente_desde);
  if (error) return { error };
  const anterior = (data || []).find((l) => l.id !== original.id);
  if (!anterior) return {};
  const vig = await supabase
    .from('veiculos').select('id')
    .eq('cliente_id', ctx.clienteId).in('placa', grafias).is('encerrado_em', null);
  if (vig.error) return { error: vig.error, anterior };
  const outroVigente = (vig.data || []).some((l) => l.id !== original.id);
  return outroVigente ? {} : { anterior };
}

async function reabrirAnterior(original, ctx) {
  if (!original.vigente_desde) return null;
  const { anterior, error } = await buscarAnterior(original, ctx);
  if (error) {
    await falhouReabrir(ctx, 'buscar_vinculo_anterior', { veiculo_id: anterior && anterior.id, substitui_id: original.id }, error);
    return null;
  }
  if (!anterior) return null;
  const r = await atualizarVinculo(anterior.id, { encerrado_em: null }, [
    ['eq', 'cliente_id', ctx.clienteId], ['eq', 'encerrado_em', anterior.encerrado_em],
  ]);
  if (r.error || !r.data) {
    await falhouReabrir(ctx, 'reabrir_vinculo_anterior', { veiculo_id: anterior.id, substitui_id: original.id }, r.error);
    return null;
  }
  await auditar(ctx, 'reabrir_vinculo_anterior', anterior.id, {
    placa: anterior.placa, encerrado_em_original: anterior.encerrado_em, substitui_id: original.id,
  });
  return anterior;
}

// Placa certa não gravou: fecha de novo o anterior e devolve o errado ao estado original.
async function desfazer(original, encerradoEm, anterior, ctx) {
  if (anterior) {
    const r = await atualizarVinculo(anterior.id, { encerrado_em: anterior.encerrado_em }, [['is', 'encerrado_em', null]]);
    if (r.error || !r.data) {
      await falhouReabrir(ctx, 'reencerrar_vinculo_anterior', { veiculo_id: anterior.id, substitui_id: original.id }, r.error);
    } else {
      await auditar(ctx, 'encerrar', anterior.id, { placa: anterior.placa, encerrado_em: anterior.encerrado_em, desfeito: true });
    }
  }
  const r = await atualizarVinculo(original.id,
    { encerrado_em: original.encerrado_em, vigente_desde: original.vigente_desde },
    [['eq', 'encerrado_em', encerradoEm]]);
  if (r.error || !r.data) {
    await falhouReabrir(ctx, 'reabrir_original', { veiculo_id: original.id, substitui_id: original.id }, r.error);
    return;
  }
  await auditar(ctx, 'reabrir', original.id, { placa: original.placa, vigente_desde: original.vigente_desde, desfeito: true });
}

/**
 * Executa a correção. `vincular` grava a placa certa (lança em caso de falha).
 * @returns {Promise<object>} o vínculo novo devolvido por `vincular`
 */
async function substituirComCorrecao(original, vincular, ctx) {
  const encerradoEm = await encerrarErrado(original, ctx);
  const anterior = await reabrirAnterior(original, ctx);
  try {
    return await vincular();
  } catch (err) {
    await desfazer(original, encerradoEm, anterior, ctx);
    throw err;
  }
}

module.exports = { ErroHttp, exigirCorrigivel, substituirComCorrecao, JANELA_CORRECAO_MS };
