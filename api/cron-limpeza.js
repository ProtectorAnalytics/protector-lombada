/**
 * CRON DE LIMPEZA DE FOTOS (15 dias)
 *
 * Agendado no vercel.json para rodar diariamente às 06:00 UTC.
 *
 * Este endpoint apaga FOTOS > 15 dias tanto da tabela `capturas` quanto de
 * `capturas_historico`, preservando os metadados. Metadados são apagados por
 * pg_cron no banco após 6 meses.
 *
 * Por que Vercel Cron e não pg_cron?
 *   O Supabase adicionou uma trigger (`storage.protect_objects_delete`) que
 *   bloqueia DELETE direto em `storage.objects` via SQL, forçando o uso da
 *   Storage API. Funções pg_cron que tentavam deletar fotos ficaram
 *   quebradas silenciosamente. Este endpoint usa o SDK `@supabase/supabase-js`
 *   (`storage.remove`), que internamente chama a Storage API e contorna a
 *   trigger.
 *
 * Política de retenção (LGPD — ver docs/LGPD.md § 6):
 *   - Foto:      15 dias  ← este endpoint
 *   - Metadados:  6 meses ← pg_cron cleanup_old_capturas
 *   - debug_log: 24 horas ← pg_cron cleanup_debug_log
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const RETENTION_DAYS = 15;
const BATCH_SIZE = 500;

async function limparFotosCapturas(cutoff) {
  const { data, error } = await supabase
    .from('capturas')
    .select('id, foto_path')
    .lt('timestamp', cutoff)
    .not('foto_path', 'is', null)
    .limit(BATCH_SIZE);

  if (error) throw new Error(`capturas select: ${error.message}`);
  if (!data || data.length === 0) return { fotos: 0, registros: 0 };

  const fotoPaths = data.map((c) => c.foto_path).filter(Boolean);
  if (fotoPaths.length > 0) {
    const { error: delErr } = await supabase.storage
      .from('capturas-fotos')
      .remove(fotoPaths);
    if (delErr) console.error('[cron-limpeza] capturas storage:', delErr.message);
  }

  const ids = data.map((c) => c.id);
  await supabase.from('capturas').update({ foto_path: null }).in('id', ids);

  return { fotos: fotoPaths.length, registros: ids.length };
}

async function limparFotosHistorico(cutoff) {
  const { data, error } = await supabase
    .from('capturas_historico')
    .select('id, foto_path')
    .lt('timestamp', cutoff)
    .eq('foto_disponivel', true)
    .not('foto_path', 'is', null)
    .limit(BATCH_SIZE);

  if (error) throw new Error(`capturas_historico select: ${error.message}`);
  if (!data || data.length === 0) return { fotos: 0, registros: 0 };

  const fotoPaths = data.map((c) => c.foto_path).filter(Boolean);
  if (fotoPaths.length > 0) {
    const { error: delErr } = await supabase.storage
      .from('capturas-fotos')
      .remove(fotoPaths);
    if (delErr) console.error('[cron-limpeza] historico storage:', delErr.message);
  }

  const ids = data.map((c) => c.id);
  await supabase
    .from('capturas_historico')
    .update({ foto_path: null, foto_disponivel: false })
    .in('id', ids);

  return { fotos: fotoPaths.length, registros: ids.length };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const authHeader = req.headers['authorization'] || '';
  const vercelCronHeader = req.headers['x-vercel-cron-signature'];
  const expectedSecret = `Bearer ${process.env.CRON_SECRET}`;

  // Aceita Vercel Cron nativo (x-vercel-cron-signature) ou Bearer manual
  if (!vercelCronHeader && authHeader !== expectedSecret) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString();

    // Processar em lotes até limpar tudo ou atingir limite de segurança
    let totalCapturas = { fotos: 0, registros: 0 };
    let totalHistorico = { fotos: 0, registros: 0 };
    const maxLotes = 10; // máximo 5000 itens por execução

    for (let i = 0; i < maxLotes; i++) {
      const cap = await limparFotosCapturas(cutoff);
      totalCapturas.fotos += cap.fotos;
      totalCapturas.registros += cap.registros;
      if (cap.registros === 0) break;
    }

    for (let i = 0; i < maxLotes; i++) {
      const hist = await limparFotosHistorico(cutoff);
      totalHistorico.fotos += hist.fotos;
      totalHistorico.registros += hist.registros;
      if (hist.registros === 0) break;
    }

    return res.status(200).json({
      ok: true,
      retencao_dias: RETENTION_DAYS,
      capturas: totalCapturas,
      capturas_historico: totalHistorico,
      nota: 'Metadados são apagados pelo pg_cron após 6 meses.',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[cron-limpeza] Erro:', err.message);
    return res.status(500).json({ error: 'Erro interno do servidor', detalhes: err.message });
  }
};
