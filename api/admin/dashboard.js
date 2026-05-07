const { autenticar, supabase } = require('../../lib/auth-middleware');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { profile } = await autenticar(req, ['super_admin']);

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const hojeISO = hoje.toISOString();

    // Buscar dados em paralelo
    const [clientesRes, camerasRes, capturasHojeRes, alertasHojeRes, clientesListRes, camerasStatusRes] = await Promise.all([
      // Total de clientes ativos
      supabase.from('clientes').select('id', { count: 'exact', head: true }).eq('ativo', true),
      // Total de câmeras ativas
      supabase.from('cameras').select('id', { count: 'exact', head: true }).eq('ativa', true),
      // Capturas hoje
      supabase.from('capturas').select('id', { count: 'exact', head: true }).gte('timestamp', hojeISO),
      // Alertas hoje (notificados)
      supabase.from('capturas').select('id', { count: 'exact', head: true }).gte('timestamp', hojeISO).eq('notificado', true),
      // Lista de clientes com contagens
      supabase.from('clientes').select(`
        id, nome, cidade_uf, ativo, cnpj, criado_em,
        cameras(count),
        capturas(count),
        email_destinatarios(count),
        usuarios(count)
      `).order('nome'),
      // Câmeras ativas com last_seen para status online/offline
      supabase.from('cameras').select('id, cliente_id, last_seen').eq('ativa', true),
    ]);

    // Calcular status online/offline das câmeras.
    // Thresholds calibrados pra realidade de lombada educativa: condomínio
    // pode ficar horas sem carro. Câmeras com heartbeat configurado batem
    // sozinhas; as sem heartbeat só atualizam last_seen quando passa
    // veículo. 30min/6h equilibra os dois cenários sem mascarar quedas.
    const camerasStatusData = camerasStatusRes.data || [];
    const trintaMinAtras = new Date(Date.now() - 30 * 60000).toISOString();
    const seisHorasAtras = new Date(Date.now() - 6 * 60 * 60000).toISOString();
    const camerasOnline = camerasStatusData.filter(c => c.last_seen && c.last_seen > trintaMinAtras).length;
    const camerasAlerta = camerasStatusData.filter(c => c.last_seen && c.last_seen <= trintaMinAtras && c.last_seen > seisHorasAtras).length;
    const camerasOffline = camerasStatusData.filter(c => !c.last_seen || c.last_seen <= seisHorasAtras).length;

    // Agrupar status por cliente
    const statusPorCliente = {};
    for (const cam of camerasStatusData) {
      if (!statusPorCliente[cam.cliente_id]) {
        statusPorCliente[cam.cliente_id] = { online: 0, total: 0 };
      }
      statusPorCliente[cam.cliente_id].total++;
      if (cam.last_seen && cam.last_seen > trintaMinAtras) {
        statusPorCliente[cam.cliente_id].online++;
      }
    }

    // Últimas 10 capturas (global)
    const { data: ultimasCapturas } = await supabase
      .from('capturas')
      .select('id, placa, velocidade, timestamp, notificado, clientes(nome)')
      .order('timestamp', { ascending: false })
      .limit(10);

    // Top 10 placas com mais infrações (últimos 15 dias)
    const quinzeDiasAtras = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    const { data: topPlacasRaw } = await supabase
      .from('capturas')
      .select('placa, velocidade, cliente_id, clientes(nome, limite_velocidade)')
      .gte('timestamp', quinzeDiasAtras);

    // Filtrar apenas as que estão acima do limite e agrupar
    const placaCounts = {};
    const capturasHojeList = [];
    if (topPlacasRaw) {
      topPlacasRaw.forEach(c => {
        const limite = c.clientes?.limite_velocidade || 30;
        if (c.velocidade > limite) {
          if (!placaCounts[c.placa]) {
            placaCounts[c.placa] = { placa: c.placa, count: 0, cliente: c.clientes?.nome || '---', maxVel: 0 };
          }
          placaCounts[c.placa].count++;
          if (c.velocidade > placaCounts[c.placa].maxVel) placaCounts[c.placa].maxVel = c.velocidade;
        }
      });
    }
    const topPlacas = Object.values(placaCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Alertas últimos 7 dias (por dia)
    const alertas7d = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const dEnd = new Date(d);
      dEnd.setDate(dEnd.getDate() + 1);
      alertas7d.push({
        data: d.toISOString().slice(0, 10),
        dia: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
      });
    }
    // Query alerts for 7 days
    const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    seteDiasAtras.setHours(0, 0, 0, 0);
    const { data: alertas7dRaw } = await supabase
      .from('capturas')
      .select('timestamp, notificado')
      .eq('notificado', true)
      .gte('timestamp', seteDiasAtras.toISOString());

    if (alertas7dRaw) {
      alertas7dRaw.forEach(c => {
        const dia = new Date(c.timestamp).toISOString().slice(0, 10);
        const entry = alertas7d.find(a => a.data === dia);
        if (entry) entry.count = (entry.count || 0) + 1;
      });
    }
    alertas7d.forEach(a => { if (!a.count) a.count = 0; });

    return res.status(200).json({
      stats: {
        clientes_ativos: clientesRes.count || 0,
        cameras_ativas: camerasRes.count || 0,
        cameras_online: camerasOnline,
        cameras_alerta: camerasAlerta,
        cameras_offline: camerasOffline,
        capturas_hoje: capturasHojeRes.count || 0,
        alertas_hoje: alertasHojeRes.count || 0,
      },
      clientes: clientesListRes.data || [],
      status_por_cliente: statusPorCliente,
      ultimas_capturas: ultimasCapturas || [],
      top_placas: topPlacas,
      alertas_7d: alertas7d,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.error });
    console.error('Erro em /api/admin/dashboard:', err.message);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
