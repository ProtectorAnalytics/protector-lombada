/**
 * Painel → base de veículos.
 * - GET: marca/cor para preencher o cadastro (só placa vista no próprio cliente)
 * - POST mesma_placa: corrige a leitura da captura para a placa frequente
 * - POST outro_carro: libera a suspeita e consulta (pago, respeita travas)
 */
const { autenticar, verificarAcessoCliente, registrarAuditoria, supabase } = require('../../lib/auth-middleware');
const { criarRepoSupabase } = require('../../lib/veiculos-base-repo');
const { criarClienteApiplacas } = require('../../lib/apiplacas');
const { criarValidador } = require('../../lib/validador-placa');
const { criarVeiculosBase } = require('../../lib/veiculos-base');
const { paraMercosul, paraAntiga } = require('../../site/js/placa');
const { nomeVeiculo } = require('../../site/js/nome-veiculo');

const PAPEIS = ['super_admin', 'admin_cliente', 'operador'];
const JANELA_DIAS = 30;

async function lerCorpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const ch of req) raw += ch;
  return raw ? JSON.parse(raw) : {};
}

const grafiasDe = (m) => [m, paraAntiga(m)].filter(Boolean);

function contar({ count, error }) {
  if (error) throw new Error('falha ao consultar escopo');
  return count || 0;
}

async function placaVistaNoCliente(clienteId, m) {
  const grafias = grafiasDe(m);
  const [c, v] = await Promise.all([
    supabase.from('capturas').select('id', { head: true, count: 'exact' }).eq('cliente_id', clienteId).in('placa', grafias),
    supabase.from('veiculos').select('id', { head: true, count: 'exact' }).eq('cliente_id', clienteId).in('placa', grafias),
  ]);
  return contar(c) + contar(v) > 0;
}

// Grafia que o cliente realmente usa nos últimos 30 dias; empate fica com a primeira (suspeita_de);
// null quando o cliente não tem nenhuma das duas.
async function grafiaDoCliente(clienteId, suspeitaDe) {
  const desde = new Date(Date.now() - JANELA_DIAS * 86400000).toISOString();
  const grafias = grafiasDe(suspeitaDe);
  const contagens = await Promise.all(grafias.map(async (g) => contar(await supabase.from('capturas')
    .select('id', { head: true, count: 'exact' }).eq('cliente_id', clienteId).eq('placa', g).gte('timestamp', desde))));
  if (contagens.every((n) => n === 0)) return null; // nunca grava placa que o cliente não tem
  return grafias.reduce((melhor, g, i) => (contagens[i] > contagens[grafias.indexOf(melhor)] ? g : melhor), grafias[0]);
}

async function buscarMarcaCor(req, res, profile) {
  const clienteId = req.query.cliente_id || profile.cliente_id;
  if (!clienteId || !verificarAcessoCliente(profile, clienteId)) return res.status(403).json({ error: 'Sem acesso' });
  const m = paraMercosul(req.query.placa);
  if (!m || !(await placaVistaNoCliente(clienteId, m))) return res.status(200).json({});
  const { data, error } = await supabase.from('veiculos_base').select('marca, modelo, versao, cor, status, suspeita_de, suspeita_cliente_id').eq('placa', m).maybeSingle();
  if (error) throw new Error(error.message);
  if (data && data.status === 'suspeita' && data.suspeita_cliente_id === clienteId && data.suspeita_de) {
    return res.status(200).json({ suspeita_de: data.suspeita_de });
  }
  if (!data || data.status !== 'consultado') return res.status(200).json({});
  return res.status(200).json({ marca: nomeVeiculo(data), cor: data.cor }); // regra única do nome (R9)
}

async function mesmaPlaca({ body, profile, ip, res }) {
  if (typeof body.captura_id !== 'string' || !body.captura_id) return res.status(400).json({ error: 'captura_id inválido' });
  const { data: cap, error } = await supabase.from('capturas').select('id, cliente_id, placa').eq('id', body.captura_id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!cap || !verificarAcessoCliente(profile, cap.cliente_id)) return res.status(404).json({ error: 'Captura não encontrada' });
  const { data: vb, error: e2 } = await supabase.from('veiculos_base').select('status, suspeita_de, suspeita_cliente_id').eq('placa', paraMercosul(cap.placa)).maybeSingle();
  if (e2) throw new Error(e2.message);
  if (!vb || vb.status !== 'suspeita' || !vb.suspeita_de || vb.suspeita_cliente_id !== cap.cliente_id) {
    return res.status(409).json({ error: 'Placa não está em suspeita' });
  }
  const placa = await grafiaDoCliente(cap.cliente_id, vb.suspeita_de);
  if (!placa) return res.status(409).json({ error: 'Placa não está em suspeita' });
  const upd = await supabase.from('capturas').update({ placa }).eq('id', cap.id);
  if (upd.error) throw new Error(upd.error.message);
  await registrarAuditoria({ usuarioId: profile.id, acao: 'corrigir_leitura_placa', tabela: 'capturas', registroId: cap.id, detalhes: { de: cap.placa, para: placa }, ip });
  return res.status(200).json({ placa });
}

async function outroCarro({ body, profile, ip, res }) {
  const m = paraMercosul(body.placa);
  if (!m) return res.status(400).json({ error: 'Placa inválida' });
  const clienteId = body.cliente_id || profile.cliente_id;
  if (!clienteId || !verificarAcessoCliente(profile, clienteId)) return res.status(403).json({ error: 'Sem acesso' });
  if (!(await placaVistaNoCliente(clienteId, m))) return res.status(404).json({ error: 'Placa não encontrada' });
  const { data: linha, error } = await supabase.from('veiculos_base').select('status, suspeita_cliente_id').eq('placa', m).maybeSingle();
  if (error) throw new Error(error.message);
  if (!linha || linha.status !== 'suspeita' || linha.suspeita_cliente_id !== clienteId) {
    return res.status(404).json({ error: 'Placa não encontrada' });
  }
  // Liberação atômica: só uma chamada concorrente leva a linha; as outras 409 (sem pagar de novo).
  const lib = await supabase.from('veiculos_base')
    .update({ status: 'pendente', suspeita_de: null, suspeita_cliente_id: null, tentativas: 0, proxima_tentativa_em: null })
    .eq('placa', m).eq('status', 'suspeita').eq('suspeita_cliente_id', clienteId).select('placa');
  if (lib.error) throw new Error(lib.error.message);
  if (!Array.isArray(lib.data) || lib.data.length !== 1) return res.status(409).json({ error: 'Placa não está em suspeita' });
  const repo = criarRepoSupabase();
  const vb = criarVeiculosBase({
    repo,
    api: criarClienteApiplacas({ token: process.env.APIPLACAS_TOKEN }),
    validador: criarValidador({ contarPassagens: repo.contarPassagens }),
  });
  const r = await vb.consultarAgora(m, 'reconsulta');
  await registrarAuditoria({ usuarioId: profile.id, acao: 'liberar_suspeita_placa', tabela: 'veiculos_base', registroId: null, detalhes: { placa: m, executou: r.executou, motivo: r.motivo || null }, ip });
  return res.status(200).json(r.executou ? r.linha : { placa: m, status: 'pendente', motivo: r.motivo });
}

module.exports = async function handler(req, res) {
  try {
    const { profile } = await autenticar(req, PAPEIS);
    const ip = req.headers['x-forwarded-for'] || null;

    if (req.method === 'GET') return await buscarMarcaCor(req, res, profile);

    if (req.method === 'POST') {
      let body;
      try { body = await lerCorpo(req); } catch (_) { return res.status(400).json({ error: 'JSON inválido' }); }
      const ctx = { body, profile, ip, res };
      if (body.acao === 'mesma_placa') return await mesmaPlaca(ctx);
      if (body.acao === 'outro_carro') return await outroCarro(ctx);
      return res.status(400).json({ error: 'Ação desconhecida' });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ error: err.error });
    return res.status(500).json({ error: 'Erro interno' });
  }
};
