const { findCameraByToken, findCameraBySerial, updateCameraLastSeen } = require('../lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const token = req.query.token;
  const serial = req.query.serial;

  if (!token && !serial) {
    return res.status(401).json({ error: 'Token ou serial não fornecido' });
  }

  try {
    let camera = null;
    if (token) camera = await findCameraByToken(token);
    if (!camera && serial) camera = await findCameraBySerial(serial);
    if (!camera) {
      return res.status(401).json({ error: 'Câmera não identificada' });
    }

    const cliente = camera.clientes;
    if (!cliente || !cliente.ativo) {
      return res.status(403).json({ error: 'Cliente inativo' });
    }

    await updateCameraLastSeen(camera.id);

    return res.status(200).json({
      ok: true,
      server_time: new Date().toISOString(),
      camera_id: camera.id,
    });
  } catch (err) {
    console.error('Erro no endpoint /api/heartbeat:', err.message);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
