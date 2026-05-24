const { findCameraByToken, findCameraBySerial, updateCameraLastSeen, logConexao } = require('../lib/supabase');

module.exports = async function handler(req, res) {
  const startedAt = Date.now();
  const ipOrigem = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
  const userAgent = req.headers['user-agent'] || null;
  const token = req.query.token || null;
  const serial = req.query.serial || null;

  const baseLog = {
    tipo: 'heartbeat',
    ip_origem: ipOrigem,
    user_agent: userAgent,
    serial_recebido: serial,
  };

  if (req.method !== 'GET' && req.method !== 'POST') {
    logConexao({ ...baseLog, resultado: 'erro', motivo: 'metodo_nao_permitido', http_status: 405, latencia_ms: Date.now() - startedAt });
    return res.status(405).json({ error: 'Método não permitido' });
  }

  if (!token && !serial) {
    logConexao({ ...baseLog, resultado: 'erro', motivo: 'sem_identificacao', http_status: 401, latencia_ms: Date.now() - startedAt });
    return res.status(401).json({ error: 'Token ou serial não fornecido' });
  }

  try {
    let camera = null;
    if (token) camera = await findCameraByToken(token);
    if (!camera && serial) camera = await findCameraBySerial(serial);
    if (!camera) {
      logConexao({
        ...baseLog,
        resultado: 'erro',
        motivo: token ? 'token_invalido' : 'serial_nao_cadastrado',
        http_status: 401,
        latencia_ms: Date.now() - startedAt,
      });
      return res.status(401).json({ error: 'Câmera não identificada' });
    }

    const cliente = camera.clientes;
    if (!cliente || !cliente.ativo) {
      logConexao({
        ...baseLog,
        resultado: 'erro',
        motivo: 'cliente_inativo',
        http_status: 403,
        camera_id: camera.id,
        cliente_id: cliente?.id || null,
        latencia_ms: Date.now() - startedAt,
      });
      return res.status(403).json({ error: 'Cliente inativo' });
    }

    await updateCameraLastSeen(camera.id);

    logConexao({
      ...baseLog,
      resultado: 'sucesso',
      http_status: 200,
      camera_id: camera.id,
      cliente_id: cliente.id,
      latencia_ms: Date.now() - startedAt,
    });

    return res.status(200).json({
      ok: true,
      server_time: new Date().toISOString(),
      camera_id: camera.id,
    });
  } catch (err) {
    console.error('Erro no endpoint /api/heartbeat:', err.message);
    logConexao({
      ...baseLog,
      resultado: 'erro',
      motivo: 'erro_interno',
      http_status: 500,
      latencia_ms: Date.now() - startedAt,
      detalhes: { err: err.message?.slice(0, 200) },
    });
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
