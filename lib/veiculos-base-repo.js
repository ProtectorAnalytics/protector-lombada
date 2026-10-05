/**
 * Acesso ao banco da base de veículos (service role). Única peça com I/O de
 * banco; o orquestrador e os testes usam a mesma interface.
 *
 * supabase-js NÃO lança em falha: todo retorno passa por ok(), que lança.
 */
const { supabase } = require('./supabase');

function ok({ data, error }) {
  if (error) throw new Error(`veiculos_base: ${error.message}`);
  return data;
}

const LIMITE_CONTAGEM = 5000;

function criarRepoSupabase(db = supabase) {
  return {
    async buscar(placa) {
      return ok(await db.from('veiculos_base').select('*').eq('placa', placa).maybeSingle());
    },
    async tocar(placa) {
      ok(await db.from('veiculos_base').update({ visto_por_ultimo_em: new Date().toISOString() }).eq('placa', placa));
    },
    async reservar(linha) {
      const data = ok(await db.from('veiculos_base')
        .upsert(linha, { onConflict: 'placa', ignoreDuplicates: true })
        .select('placa'));
      return Array.isArray(data) && data.length === 1;
    },
    async atualizar(placa, campos) {
      ok(await db.from('veiculos_base').update(campos).eq('placa', placa));
    },
    async registrarConsulta(c) {
      ok(await db.from('apiplacas_consultas').insert(c));
    },
    async ultimoResultado() {
      const data = ok(await db.from('apiplacas_consultas').select('resultado')
        .order('criado_em', { ascending: false }).limit(1).maybeSingle());
      return data ? data.resultado : null;
    },
    async lerConfig() {
      return ok(await db.from('apiplacas_config').select('*').eq('id', 1).single());
    },
    async atualizarConfig(campos) {
      ok(await db.from('apiplacas_config').update({ ...campos, atualizado_em: new Date().toISOString() }).eq('id', 1));
    },
    async gastoDoMes() {
      return Number(ok(await db.rpc('apiplacas_gasto_mes'))) || 0;
    },
    async contarPassagens(clienteId, placas, desdeIso) {
      const data = ok(await db.from('capturas').select('placa')
        .eq('cliente_id', clienteId).in('placa', placas).gte('timestamp', desdeIso)
        .limit(LIMITE_CONTAGEM));
      return data.reduce((acc, { placa }) => ({ ...acc, [placa]: (acc[placa] || 0) + 1 }), {});
    },
    async fila(limite, agoraIso) {
      return ok(await db.from('veiculos_base').select('*')
        .in('status', ['pendente', 'erro'])
        .or(`proxima_tentativa_em.is.null,proxima_tentativa_em.lte.${agoraIso}`)
        .order('criado_em', { ascending: true }).limit(limite));
    },
    async tamanhoFila() {
      const { count, error } = await db.from('veiculos_base')
        .select('placa', { count: 'exact', head: true }).in('status', ['pendente', 'erro']);
      if (error) throw new Error(`veiculos_base: ${error.message}`);
      return count || 0;
    },
    async apagarVistosAntesDe(iso) {
      const data = ok(await db.from('veiculos_base').delete().lt('visto_por_ultimo_em', iso).select('placa'));
      return data.length;
    },
    async apagar(placa) {
      ok(await db.from('veiculos_base').delete().eq('placa', placa));
    },
  };
}

module.exports = { criarRepoSupabase };
