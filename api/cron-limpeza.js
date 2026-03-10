const { getCapturaAntigas, deleteCapturas, deletePhotos } = require('../lib/supabase');

module.exports = async function handler(req, res) {
  // Apenas GET (Vercel Cron usa GET)
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // Verificar autorização (Vercel Cron envia header Authorization)
  const authHeader = req.headers['authorization'] || '';
  const expectedSecret = `Bearer ${process.env.CRON_SECRET}`;

  if (authHeader !== expectedSecret) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  try {
    let totalDeletados = 0;
    let continuar = true;

    // Processar em lotes de 100 para evitar timeout
    while (continuar) {
      const capturas = await getCapturaAntigas(15, 100);

      if (capturas.length === 0) {
        continuar = false;
        break;
      }

      // Deletar fotos do Storage
      const fotoPaths = capturas.map((c) => c.foto_path).filter(Boolean);
      if (fotoPaths.length > 0) {
        await deletePhotos(fotoPaths);
      }

      // Deletar capturas do banco
      const ids = capturas.map((c) => c.id);
      await deleteCapturas(ids);

      totalDeletados += capturas.length;

      // Safety: máximo 1000 por execução para não estourar timeout
      if (totalDeletados >= 1000) {
        continuar = false;
      }
    }

    return res.status(200).json({
      ok: true,
      deletados: totalDeletados,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Erro no cron-limpeza:', err.message);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
