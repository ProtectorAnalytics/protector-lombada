/**
 * Admin da APIPLACAS (super_admin): config, resumo do mês, extrato,
 * reconsulta paga de uma placa e "validar placas de hoje".
 */
const { autenticar, registrarAuditoria, supabase } = require('../../lib/auth-middleware');
const { validarConfig } = require('../../lib/apiplacas-config');
const { criarRepoSupabase } = require('../../lib/veiculos-base-repo');
const { criarClienteApiplacas } = require('../../lib/apiplacas');
const { criarValidador } = require('../../lib/validador-placa');
const { criarVeiculosBase } = require('../../lib/veiculos-base');
const { paraMercosul, paraAntiga } = require('../../site/js/placa');

const POR_PAGINA = 50;
// Motivos que apenas pulam a placa; os demais interrompem o laço.
const MOTIVOS_PULAR = ['em_andamento', 'inexistente'];

function ok({ data, error, count }) {
  if (error) throw new Error(error.message);
  return count !== undefined && count !== null ? { data, count } : data;
}

function inicioDoDiaSP() {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  return new Date(`${d}T00:00:00-03:00`).toISOString();
}

async function lerCorpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const ch of req) raw += ch;
  return raw ? JSON.parse(raw) : {};
}

async function extrato(req, res) {
  const pagina = Math.max(0, parseInt(req.query.pagina, 10) || 0);
  const de = pagina * POR_PAGINA;
  const { data, count } = ok(await supabase.from('apiplacas_consultas')
    .select('placa, resultado, http_status, duracao_ms, custo, origem, criado_em', { count: 'exact' })
    .order('criado_em', { ascending: false }).range(de, de + POR_PAGINA - 1));
  return res.status(200).json({ itens: data, total: count });
}

async function resumo(repo, res) {
  const desdeMes = new Date(); desdeMes.setDate(1);
  const [config, gasto, fila, suspeitas, consultasMes] = await Promise.all([
    repo.lerConfig(),
    repo.gastoDoMes(),
    repo.tamanhoFila(),
    supabase.from('veiculos_base').select('placa', { count: 'exact', head: true }).eq('status', 'suspeita').then((r) => r.count || 0),
    supabase.from('apiplacas_consultas').select('id', { count: 'exact', head: true })
      .gte('criado_em', desdeMes.toISOString()).then((r) => r.count || 0),
  ]);
  return res.status(200).json({ config, gasto, fila, suspeitas, consultasMes });
}

async function reconsultar({ body, repo, vb, profile, ip, res }) {
  const m = paraMercosul(body.placa);
  if (!m) return res.status(400).json({ error: 'Placa inválida' });
  if (!(await repo.buscar(m))) {
    await repo.reservar({ placa: m, placa_antiga: paraAntiga(m), status: 'pendente', visto_por_ultimo_em: new Date().toISOString() });
  } else {
    await repo.atualizar(m, { status: 'pendente', tentativas: 0, proxima_tentativa_em: null });
  }
  const r = await vb.consultarAgora(m, 'reconsulta');
  await registrarAuditoria({ usuarioId: profile.id, acao: 'apiplacas_reconsulta', tabela: 'veiculos_base', registroId: null, detalhes: { placa: m, executou: r.executou, motivo: r.motivo || null }, ip });
  return res.status(r.executou ? 200 : 409).json(r);
}

async function validarHoje({ repo, vb, profile, ip, res }) {
  const data = ok(await supabase.from('capturas').select('placa').gte('timestamp', inicioDoDiaSP()).limit(20000));
  const placas = [...new Set(data.map((c) => paraMercosul(c.placa)).filter(Boolean))];
  let consultadas = 0;
  let puladas = 0;
  let parou = null;
  for (const m of placas) {
    try {
      const existe = await repo.buscar(m);
      if (existe && existe.status !== 'pendente' && existe.status !== 'erro') continue;
      if (!existe) {
        await repo.reservar({ placa: m, placa_antiga: paraAntiga(m), status: 'pendente', visto_por_ultimo_em: new Date().toISOString() });
      } else {
        // Libera a posse para a reivindicação atômica de consultarAgora.
        await repo.atualizar(m, { proxima_tentativa_em: null });
      }
      const r = await vb.consultarAgora(m, 'validacao');
      if (r.executou) { consultadas++; continue; }
      if (MOTIVOS_PULAR.includes(r.motivo)) { puladas++; continue; }
      parou = r.motivo;
      break;
    } catch (_) {
      puladas++;
    }
  }
  await registrarAuditoria({ usuarioId: profile.id, acao: 'apiplacas_validar_hoje', tabela: 'veiculos_base', registroId: null, detalhes: { placas: placas.length, consultadas, puladas, parou }, ip });
  return res.status(200).json({ placas: placas.length, consultadas, puladas, parou });
}

module.exports = async function handler(req, res) {
  try {
    const { profile } = await autenticar(req, ['super_admin']);
    const repo = criarRepoSupabase();
    const ip = req.headers['x-forwarded-for'] || null;

    if (req.method === 'GET' && req.query.extrato) return await extrato(req, res);
    if (req.method === 'GET') return await resumo(repo, res);

    if (req.method === 'PUT') {
      const { config, erros } = validarConfig(await lerCorpo(req));
      if (erros.length) return res.status(400).json({ error: 'Campos inválidos', campos: erros });
      await repo.atualizarConfig({ ...config, atualizado_por: profile.id });
      await registrarAuditoria({ usuarioId: profile.id, acao: 'apiplacas_config', tabela: 'apiplacas_config', registroId: null, detalhes: config, ip });
      return res.status(200).json({ config: await repo.lerConfig() });
    }

    if (req.method === 'POST') {
      const body = await lerCorpo(req);
      const api = criarClienteApiplacas({ token: process.env.APIPLACAS_TOKEN });
      const vb = criarVeiculosBase({ repo, api, validador: criarValidador({ contarPassagens: repo.contarPassagens }) });
      const ctx = { body, repo, vb, profile, ip, res };
      if (body.acao === 'reconsultar') return await reconsultar(ctx);
      if (body.acao === 'validar_hoje') return await validarHoje(ctx);
      return res.status(400).json({ error: 'Ação desconhecida' });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ error: err.error });
    return res.status(500).json({ error: 'Erro interno' });
  }
};
