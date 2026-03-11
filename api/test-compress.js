const { createClient } = require('@supabase/supabase-js');
const sharp = require('sharp');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async function handler(req, res) {
  const secret = req.query.secret;
  if (secret !== 'protector2026') {
    return res.status(401).json({ error: 'Nao autorizado' });
  }

  const mode = req.query.mode || 'info'; // info, original, compressed

  // Pegar foto mais recente
  const { data: cap } = await supabase
    .from('capturas')
    .select('foto_path, placa, velocidade')
    .not('foto_path', 'is', null)
    .order('timestamp', { ascending: false })
    .limit(1)
    .single();

  if (!cap) return res.status(404).json({ error: 'Nenhuma foto encontrada' });

  // Download da foto
  const { data: blob, error } = await supabase.storage
    .from('capturas-fotos')
    .download(cap.foto_path);

  if (error) return res.status(500).json({ error: error.message });

  const originalBuffer = Buffer.from(await blob.arrayBuffer());

  if (mode === 'original') {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `inline; filename="original_${cap.placa}.jpg"`);
    return res.send(originalBuffer);
  }

  // Comprimir com mesmas config do captura.js
  const compressed = await sharp(originalBuffer)
    .resize(1280, null, { withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toBuffer();

  if (mode === 'compressed') {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Content-Disposition', `inline; filename="compressed_${cap.placa}.jpg"`);
    return res.send(compressed);
  }

  // Metadados
  const origMeta = await sharp(originalBuffer).metadata();
  const compMeta = await sharp(compressed).metadata();

  return res.status(200).json({
    placa: cap.placa,
    velocidade: cap.velocidade,
    original: {
      tamanho: `${(originalBuffer.length / 1024).toFixed(1)} KB`,
      dimensoes: `${origMeta.width}x${origMeta.height}`,
    },
    comprimida: {
      tamanho: `${(compressed.length / 1024).toFixed(1)} KB`,
      dimensoes: `${compMeta.width}x${compMeta.height}`,
    },
    reducao: `${((1 - compressed.length / originalBuffer.length) * 100).toFixed(1)}%`,
    links: {
      original: `/api/test-compress?secret=protector2026&mode=original`,
      comprimida: `/api/test-compress?secret=protector2026&mode=compressed`,
    }
  });
};
