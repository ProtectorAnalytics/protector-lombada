const { supabase, updateCameraLastSeen } = require('../lib/supabase');
const { createClient } = require('@supabase/supabase-js');

const CLIENTE_ID = 'e24b3bcc-cb64-4de0-a430-4d5ffca577c9';
const CAMERA_ID = '302af029-5e58-4bcf-8af8-4968642a4d84';

module.exports = async function handler(req, res) {
  const action = req.query.action;

  if (!action || !['captura', 'cleanup', 'compress'].includes(action)) {
    return res.status(400).json({ error: 'Ação inválida. Use ?action=captura|cleanup|compress' });
  }

  if (action === 'compress') {
    return handleCompress(req, res);
  }

  // captura e cleanup usam CRON_SECRET
  const authHeader = req.headers['authorization'] || '';
  const expectedSecret = `Bearer ${process.env.CRON_SECRET}`;
  if (authHeader !== expectedSecret) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  if (action === 'captura') return handleCaptura(req, res);
  if (action === 'cleanup') return handleCleanup(req, res);
};

// ── CAPTURA ──────────────────────────────────────────────
async function handleCaptura(req, res) {
  try {
    const captures = generateTestCaptures(18);
    const { data, error } = await supabase.from('capturas').insert(captures).select('id');
    if (error) throw new Error(`Erro ao inserir capturas: ${error.message}`);
    await updateCameraLastSeen(CAMERA_ID);
    return res.status(200).json({
      ok: true,
      inserted: data.length,
      ids: data.map(d => d.id),
      message: `${data.length} capturas de teste inseridas.`,
    });
  } catch (err) {
    console.error('Erro no test-captura:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

// ── CLEANUP ──────────────────────────────────────────────
async function handleCleanup(req, res) {
  try {
    let query = supabase.from('capturas').delete().eq('cliente_id', CLIENTE_ID);
    if (req.query.all !== 'true') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      query = query.gte('timestamp', todayStart.toISOString());
    }
    const { data, error } = await query.select('id');
    if (error) throw new Error(`Erro ao deletar capturas: ${error.message}`);
    await supabase.from('cameras').update({ last_seen: null, last_capture_id: null }).eq('id', CAMERA_ID);
    return res.status(200).json({
      ok: true,
      deleted: data ? data.length : 0,
      message: 'Dados de teste removidos.',
    });
  } catch (err) {
    console.error('Erro no test-cleanup:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

// ── COMPRESS ─────────────────────────────────────────────
async function handleCompress(req, res) {
  const secret = req.query.secret;
  if (secret !== 'protector2026') {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const sharp = require('sharp');
  const sbAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const mode = req.query.mode || 'info';

  const { data: cap } = await sbAdmin.from('capturas')
    .select('foto_path, placa, velocidade')
    .not('foto_path', 'is', null)
    .order('timestamp', { ascending: false })
    .limit(1).single();

  if (!cap) return res.status(404).json({ error: 'Nenhuma foto encontrada' });

  const { data: blob, error } = await sbAdmin.storage.from('capturas-fotos').download(cap.foto_path);
  if (error) return res.status(500).json({ error: error.message });

  const originalBuffer = Buffer.from(await blob.arrayBuffer());

  if (mode === 'original') {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `inline; filename="original_${cap.placa}.jpg"`);
    return res.send(originalBuffer);
  }

  const compressed = await sharp(originalBuffer)
    .resize(1280, null, { withoutEnlargement: true })
    .jpeg({ quality: 70 }).toBuffer();

  if (mode === 'compressed') {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `inline; filename="compressed_${cap.placa}.jpg"`);
    return res.send(compressed);
  }

  const origMeta = await sharp(originalBuffer).metadata();
  const compMeta = await sharp(compressed).metadata();

  return res.status(200).json({
    placa: cap.placa,
    velocidade: cap.velocidade,
    original: { tamanho: `${(originalBuffer.length / 1024).toFixed(1)} KB`, dimensoes: `${origMeta.width}x${origMeta.height}` },
    comprimida: { tamanho: `${(compressed.length / 1024).toFixed(1)} KB`, dimensoes: `${compMeta.width}x${compMeta.height}` },
    reducao: `${((1 - compressed.length / originalBuffer.length) * 100).toFixed(1)}%`,
    links: {
      original: `/api/test?action=compress&secret=protector2026&mode=original`,
      comprimida: `/api/test?action=compress&secret=protector2026&mode=compressed`,
    }
  });
}

// ── GERADOR DE CAPTURAS ──────────────────────────────────
function generateTestCaptures(count) {
  const placas = ['RJX4E78', 'KPL9A32', 'MHT2F56', 'BRA3R22', 'SPZ7B41', 'RIO5C89',
    'MGS8D14', 'PRN6E67', 'BAH1F93', 'SCT3G45', 'GOI2H78', 'DFB9J01'];
  const tipos = ['Carro', 'Moto', 'SUV', 'Caminhonete'];
  const cores = ['Branco', 'Preto', 'Prata', 'Vermelho', 'Azul', 'Cinza'];
  const now = new Date();
  const currentHour = now.getHours();
  const startHour = Math.min(6, currentHour);
  const hourRange = Math.max(currentHour - startHour, 1);
  const captures = [];

  for (let i = 0; i < count; i++) {
    const hour = startHour + Math.floor(Math.random() * hourRange);
    const minute = Math.floor(Math.random() * 60);
    const second = Math.floor(Math.random() * 60);
    const ts = new Date(now);
    ts.setHours(hour, minute, second, 0);

    let velocidade;
    const roll = Math.random();
    if (roll < 0.60) velocidade = 15 + Math.floor(Math.random() * 15);
    else if (roll < 0.85) velocidade = 31 + Math.floor(Math.random() * 19);
    else velocidade = 50 + Math.floor(Math.random() * 16);

    const placa = i < 6 ? placas[i % 4] : placas[Math.floor(Math.random() * placas.length)];

    captures.push({
      camera_id: CAMERA_ID, cliente_id: CLIENTE_ID, placa, velocidade,
      pixels: 85 + Math.floor(Math.random() * 15),
      tipo_veiculo: tipos[Math.floor(Math.random() * tipos.length)],
      cor_veiculo: cores[Math.floor(Math.random() * cores.length)],
      foto_path: null, timestamp: ts.toISOString(), notificado: false,
    });
  }

  captures.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  return captures;
}
