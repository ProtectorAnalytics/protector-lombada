const {
  getCapturasParaArquivar,
  archiveToHistorico,
  deleteCapturas,
  deletePhotos,
  getFotosInfracaoParaApagar,
  markFotoIndisponivel,
  purgeHistoricoAntigo,
} = require('../lib/supabase');

// Política de retenção em 3 camadas
const RETENCAO_CAPTURAS_DIAS = 15;        // capturas + foto regular
const RETENCAO_FOTOS_INFRACAO_DIAS = 90;  // foto de infração no Storage
const RETENCAO_HISTORICO_DIAS = 180;      // metadados no historico

// Limites por execução (evitar timeout na Vercel — default 300s)
const BATCH_SIZE = 100;
const MAX_POR_ETAPA = 2000;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const authHeader = req.headers['authorization'] || '';
  const expectedSecret = `Bearer ${process.env.CRON_SECRET}`;
  if (authHeader !== expectedSecret) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const stats = {
    etapa1_arquivadas: 0,
    etapa1_fotos_regulares_apagadas: 0,
    etapa1_fotos_infracao_mantidas: 0,
    etapa2_fotos_infracao_apagadas: 0,
    etapa3_historico_purgado: 0,
    timestamp: new Date().toISOString(),
  };

  try {
    // ============================================
    // ETAPA 1: Arquivar capturas > 15 dias
    //   - Arquiva metadados no historico
    //   - Apaga foto do Storage SE não for infração
    //   - Apaga row de capturas
    // ============================================
    let processados = 0;
    while (processados < MAX_POR_ETAPA) {
      const capturas = await getCapturasParaArquivar(RETENCAO_CAPTURAS_DIAS, BATCH_SIZE);
      if (capturas.length === 0) break;

      // Arquivar no historico (ON CONFLICT DO NOTHING — idempotente)
      await archiveToHistorico(capturas);
      stats.etapa1_arquivadas += capturas.length;

      // Separar fotos: regulares apagam, infrações ficam no Storage até dia 90
      const fotosRegulares = capturas
        .filter((c) => !c.eh_infracao && c.foto_path)
        .map((c) => c.foto_path);
      const fotosInfracao = capturas
        .filter((c) => c.eh_infracao && c.foto_path);

      if (fotosRegulares.length > 0) {
        await deletePhotos(fotosRegulares);
        stats.etapa1_fotos_regulares_apagadas += fotosRegulares.length;
      }
      stats.etapa1_fotos_infracao_mantidas += fotosInfracao.length;

      // Deletar rows de capturas (foto de infração continua no Storage, referenciada pelo historico)
      await deleteCapturas(capturas.map((c) => c.id));

      processados += capturas.length;
    }

    // ============================================
    // ETAPA 2: Apagar fotos de infração > 90 dias
    //   - Busca no historico fotos ainda disponíveis
    //   - Apaga do Storage
    //   - Marca foto_disponivel=false
    // ============================================
    let processadosFotos = 0;
    while (processadosFotos < MAX_POR_ETAPA) {
      const fotos = await getFotosInfracaoParaApagar(RETENCAO_FOTOS_INFRACAO_DIAS, BATCH_SIZE);
      if (fotos.length === 0) break;

      const paths = fotos.map((f) => f.foto_path).filter(Boolean);
      if (paths.length > 0) {
        await deletePhotos(paths);
      }

      await markFotoIndisponivel(fotos.map((f) => f.id));
      stats.etapa2_fotos_infracao_apagadas += fotos.length;
      processadosFotos += fotos.length;
    }

    // ============================================
    // ETAPA 3: Purge do histórico > 180 dias
    // ============================================
    stats.etapa3_historico_purgado = await purgeHistoricoAntigo(RETENCAO_HISTORICO_DIAS);

    return res.status(200).json({ ok: true, stats });
  } catch (err) {
    console.error('Erro no cron-limpeza:', err.message);
    return res.status(500).json({ error: 'Erro interno', message: err.message, stats });
  }
};
