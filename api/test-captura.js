const { supabase, updateCameraLastSeen } = require('../lib/supabase');

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
    const captures = generateTestCaptures(18);

    const { data, error } = await supabase
      .from('capturas')
      .insert(captures)
      .select('id');

    if (error) {
      throw new Error(`Erro ao inserir capturas: ${error.message}`);
    }

    // Atualizar last_seen da câmera → indicador fica verde
    await updateCameraLastSeen(CAMERA_ID);

    return res.status(200).json({
      ok: true,
      inserted: data.length,
      ids: data.map(d => d.id),
      message: `${data.length} capturas de teste inseridas. Abra o dashboard para verificar.`,
    });
  } catch (err) {
    console.error('Erro no test-captura:', err.message);
    return res.status(500).json({ error: err.message });
  }
};

function generateTestCaptures(count) {
  const placas = [
    'RJX4E78', 'KPL9A32', 'MHT2F56', 'BRA3R22', 'SPZ7B41', 'RIO5C89',
    'MGS8D14', 'PRN6E67', 'BAH1F93', 'SCT3G45', 'GOI2H78', 'DFB9J01',
  ];
  const tipos = ['Carro', 'Moto', 'SUV', 'Caminhonete'];
  const cores = ['Branco', 'Preto', 'Prata', 'Vermelho', 'Azul', 'Cinza'];

  const now = new Date();
  const currentHour = now.getHours();
  const startHour = Math.min(6, currentHour);
  const hourRange = Math.max(currentHour - startHour, 1);

  const captures = [];

  for (let i = 0; i < count; i++) {
    // Timestamps espalhados das 6h até a hora atual
    const hour = startHour + Math.floor(Math.random() * hourRange);
    const minute = Math.floor(Math.random() * 60);
    const second = Math.floor(Math.random() * 60);
    const ts = new Date(now);
    ts.setHours(hour, minute, second, 0);

    // Velocidades: 60% verde (15-29), 25% laranja (31-49), 15% vermelho (50-65)
    let velocidade;
    const roll = Math.random();
    if (roll < 0.60) {
      velocidade = 15 + Math.floor(Math.random() * 15); // 15-29
    } else if (roll < 0.85) {
      velocidade = 31 + Math.floor(Math.random() * 19); // 31-49
    } else {
      velocidade = 50 + Math.floor(Math.random() * 16); // 50-65
    }

    // Primeiras 6 capturas reutilizam 4 placas (para popular ranking com repetições)
    const placa = i < 6
      ? placas[i % 4]
      : placas[Math.floor(Math.random() * placas.length)];

    captures.push({
      camera_id: CAMERA_ID,
      cliente_id: CLIENTE_ID,
      placa,
      velocidade,
      pixels: 85 + Math.floor(Math.random() * 15),
      tipo_veiculo: tipos[Math.floor(Math.random() * tipos.length)],
      cor_veiculo: cores[Math.floor(Math.random() * cores.length)],
      foto_path: null,
      timestamp: ts.toISOString(),
      notificado: false,
    });
  }

  // Ordenar por timestamp
  captures.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return captures;
}
