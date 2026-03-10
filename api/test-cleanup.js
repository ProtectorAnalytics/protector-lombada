const { supabase } = require('../lib/supabase');

const CLIENTE_ID = 'e24b3bcc-cb64-4de0-a430-4d5ffca577c9';
const CAMERA_ID = '302af029-5e58-4bcf-8af8-4968642a4d84';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // Verificar autorização (mesmo padrão do cron-limpeza)
  const authHeader = req.headers['authorization'] || '';
  const expectedSecret = `Bearer ${process.env.CRON_SECRET}`;

  if (authHeader !== expectedSecret) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  try {
    let query = supabase
      .from('capturas')
      .delete()
      .eq('cliente_id', CLIENTE_ID);

    // Por padrão deleta só de hoje; com ?all=true deleta tudo
    if (req.query.all !== 'true') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      query = query.gte('timestamp', todayStart.toISOString());
    }

    const { data, error } = await query.select('id');

    if (error) {
      throw new Error(`Erro ao deletar capturas: ${error.message}`);
    }

    // Resetar last_seen da câmera → indicador volta para offline
    await supabase
      .from('cameras')
      .update({ last_seen: null, last_capture_id: null })
      .eq('id', CAMERA_ID);

    return res.status(200).json({
      ok: true,
      deleted: data ? data.length : 0,
      message: 'Dados de teste removidos. Dashboard volta ao zero.',
    });
  } catch (err) {
    console.error('Erro no test-cleanup:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
