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

    // Calcular status online/offline das câmeras
    const camerasStatusData = camerasStatusRes.data || [];
    const cincoMinAtras = new Date(Date.now() - 5 * 60000).toISOString();
    const quinzeMinAtras = new Date(Date.now() - 15 * 60000).toISOString();
    const camerasOnline = camerasStatusData.filter(c => c.last_seen && c.last_seen > cincoMinAtras).length;
    const camerasAlerta = camerasStatusData.filter(c => c.last_seen && c.last_seen <= cincoMinAtras && c.last_seen > quinzeMinAtras).length;
    const camerasOffline = camerasStatusData.filter(c => !c.last_seen || c.last_seen <= quinzeMinAtras).length;

    // Agrupar status por cliente
    const statusPorCliente = {};
    for (const cam of camerasStatusData) {
      if (!statusPorCliente[cam.cliente_id]) {
        statusPorCliente[cam.cliente_id] = { online: 0, total: 0 };
      }
      statusPorCliente[cam.cliente_id].total++;
      if (cam.last_seen && cam.last_seen > cincoMinAtras) {
        statusPorCliente[cam.cliente_id].online++;
      }
    }

    // Últimas 10 capturas (global)
    const { data: ultimasCapturas } = await supabase
      .from('capturas')
      .select('id, placa, velocidade, timestamp, notificado, clientes(nome)')
      .order('timestamp', { ascending: false })
      .limit(10);

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
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.error });
    console.error('Erro em /api/admin/dashboard:', err.message);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
