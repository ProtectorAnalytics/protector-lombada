const { autenticar, verificarAcessoCliente, supabase } = require('../../lib/auth-middleware');
const { isValidUUID } = require('../../lib/validators');

const ENDPOINT_RECOMENDADO = 'lombada.appps.com.br';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { profile } = await autenticar(req, ['super_admin', 'admin_cliente', 'operador']);
    const cameraId = req.query.id;
    if (!cameraId || !isValidUUID(cameraId)) {
      return res.status(400).json({ error: 'id da câmera obrigatório (UUID)' });
    }

    const { data: camera, error: camErr } = await supabase
      .from('cameras')
      .select('*, clientes(id, nome, local_via, cidade_uf, limite_velocidade)')
      .eq('id', cameraId)
      .single();
    if (camErr || !camera) return res.status(404).json({ error: 'Câmera não encontrada' });
    if (!verificarAcessoCliente(profile, camera.cliente_id)) {
      return res.status(403).json({ error: 'Sem acesso a esta câmera' });
    }

    const nowMs = Date.now();
    const lastSeenMs = camera.last_seen ? new Date(camera.last_seen).getTime() : null;
    const atrasoSeg = lastSeenMs ? Math.floor((nowMs - lastSeenMs) / 1000) : null;
    const statusNow =
      atrasoSeg == null ? 'nunca_conectou'
      : atrasoSeg < 120 ? 'online'
      : atrasoSeg < 900 ? 'atrasada'
      : 'offline';

    // Endpoint check (alerta se câmera ainda apontada pro raw .vercel.app)
    const endpointAlerta =
      camera.endpoint_configurado &&
      !camera.endpoint_configurado.toLowerCase().includes(ENDPOINT_RECOMENDADO);

    // Aggregações de capturas em 3 janelas
    async function countCap(intervalo) {
      const { count } = await supabase
        .from('capturas')
        .select('id', { count: 'exact', head: true })
        .eq('camera_id', cameraId)
        .gte('timestamp', new Date(Date.now() - intervalo).toISOString());
      return count || 0;
    }
    const [cap24h, cap7d, cap30d] = await Promise.all([
      countCap(24 * 3600 * 1000),
      countCap(7 * 24 * 3600 * 1000),
      countCap(30 * 24 * 3600 * 1000),
    ]);

    // Últimas 20 capturas + signed URL das fotos (TTL 10min)
    const { data: ultimasCapturasRaw } = await supabase
      .from('capturas')
      .select('id, timestamp, placa, velocidade, foto_path')
      .eq('camera_id', cameraId)
      .order('timestamp', { ascending: false })
      .limit(20);

    const pathsValidos = (ultimasCapturasRaw || [])
      .map(c => c.foto_path)
      .filter(Boolean);
    let urlByPath = {};
    if (pathsValidos.length > 0) {
      const { data: signed } = await supabase
        .storage.from('capturas-fotos')
        .createSignedUrls(pathsValidos, 600);
      if (Array.isArray(signed)) {
        for (const s of signed) {
          if (s.path && s.signedUrl) urlByPath[s.path] = s.signedUrl;
        }
      }
    }
    const ultimasCapturas = (ultimasCapturasRaw || []).map(c => ({
      ...c,
      foto_url: c.foto_path ? urlByPath[c.foto_path] || null : null,
    }));

    // Sparkline: capturas por dia nos últimos 30 dias (agregado em JS)
    const { data: capsRaw } = await supabase
      .from('capturas')
      .select('timestamp')
      .eq('camera_id', cameraId)
      .gte('timestamp', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())
      .order('timestamp', { ascending: true });
    const byDay = new Map();
    for (const c of capsRaw || []) {
      const day = c.timestamp.slice(0, 10);
      byDay.set(day, (byDay.get(day) || 0) + 1);
    }
    const sparkline = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000);
      const day = d.toISOString().slice(0, 10);
      sparkline.push({ day, count: byDay.get(day) || 0 });
    }

    return res.status(200).json({
      camera: {
        id: camera.id,
        nome: camera.nome,
        nome_exibicao: camera.nome_exibicao,
        serial_number: camera.serial_number,
        ip_address: camera.ip_address,
        mac_address: camera.mac_address,
        ativa: camera.ativa,
        criado_em: camera.criado_em,
        last_seen: camera.last_seen,
        // Telemetria passiva (novos campos da migration camera_health_passive_fields)
        endpoint_configurado: camera.endpoint_configurado,
        host_camera_reportado: camera.host_camera_reportado,
        uptime_start_ts: camera.uptime_start_ts,
        ultimo_outage_reportado: camera.ultimo_outage_reportado,
        heartbeat_countid: camera.heartbeat_countid,
        firmware_versao: camera.firmware_versao,
        modelo: camera.modelo,
      },
      cliente: camera.clientes,
      status: {
        agora: statusNow,
        atraso_segundos: atrasoSeg,
        endpoint_alerta: endpointAlerta,
        endpoint_recomendado: ENDPOINT_RECOMENDADO,
      },
      volumes: {
        cap24h, cap7d, cap30d,
        taxa_media_7d_por_hora: cap7d > 0 ? +(cap7d / (7 * 24)).toFixed(1) : 0,
      },
      ultimas_capturas: ultimasCapturas || [],
      sparkline_30d: sparkline,
    });
  } catch (err) {
    if (err.message === 'unauthenticated') return res.status(401).json({ error: 'Não autenticado' });
    if (err.message === 'forbidden') return res.status(403).json({ error: 'Sem permissão' });
    console.error('camera-health error:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
};
