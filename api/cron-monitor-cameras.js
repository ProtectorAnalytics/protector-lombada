/**
 * CRON DE MONITORAMENTO DE CÂMERAS OFFLINE
 *
 * Agendado no vercel.json para rodar a cada 15min.
 *
 * Detecta câmeras com last_seen > 30min (offline) e dispara alerta via
 * WaSender (se WASENDER_GROUP_NOC estiver configurado). Re-alerta a cada
 * 6h enquanto continuar offline. Também avisa quando volta online.
 *
 * Throttling via coluna cameras.last_offline_alert_at (migration aplicada
 * em 2026-05-24).
 *
 * ENV vars:
 *   - SUPABASE_URL, SUPABASE_SERVICE_KEY (já usados em outros endpoints)
 *   - WASENDER_BASE_URL, WASENDER_API_KEY, WASENDER_GROUP_NOC (opcionais)
 *   - CRON_SECRET (auth)
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const OFFLINE_THRESHOLD_MIN = 30;
const REALERT_INTERVAL_HOURS = 6;

function minutesAgo(iso) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 60000;
}

function formatDelta(min) {
  if (min < 60) return `${Math.floor(min)}min`;
  if (min < 1440) return `${Math.floor(min / 60)}h`;
  return `${Math.floor(min / 1440)}d`;
}

async function sendWaSender(text) {
  const base = process.env.WASENDER_BASE_URL;
  const key = process.env.WASENDER_API_KEY;
  const groupId = process.env.WASENDER_GROUP_NOC;
  if (!base || !key || !groupId) {
    return { skipped: 'WASENDER_GROUP_NOC ou credenciais não configuradas' };
  }
  try {
    const resp = await fetch(`${base}/send-message`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: groupId, text }),
    });
    const ok = resp.ok;
    const body = await resp.text();
    return { sent: ok, status: resp.status, response: body.slice(0, 200) };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const authHeader = req.headers['authorization'] || '';
  const vercelCronHeader = req.headers['x-vercel-cron-signature'];
  const expectedSecret = `Bearer ${process.env.CRON_SECRET}`;

  if (!vercelCronHeader && authHeader !== expectedSecret) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  try {
    const { data: cams, error } = await supabase
      .from('cameras')
      .select('id, nome_exibicao, last_seen, last_offline_alert_at, cliente:clientes(nome)')
      .eq('ativa', true);

    if (error) throw new Error(`select cameras: ${error.message}`);

    const now = Date.now();
    const offlineThresholdMs = OFFLINE_THRESHOLD_MIN * 60 * 1000;
    const realertThresholdMs = REALERT_INTERVAL_HOURS * 3600 * 1000;

    const alerts = [];
    const recoveries = [];

    for (const cam of cams || []) {
      const lastSeenAgo = cam.last_seen ? now - new Date(cam.last_seen).getTime() : Infinity;
      const lastAlertAgo = cam.last_offline_alert_at
        ? now - new Date(cam.last_offline_alert_at).getTime()
        : Infinity;
      const isOffline = lastSeenAgo > offlineThresholdMs;
      const wasAlerted = cam.last_offline_alert_at !== null;

      // VOLTOU online (estava alertada e agora last_seen é recente)
      if (!isOffline && wasAlerted) {
        const msg = `✅ *VOLTOU ONLINE*\nCâmera: ${cam.nome_exibicao}\nCliente: ${cam.cliente?.nome || '—'}\nlast_seen: agora`;
        const sendResult = await sendWaSender(msg);
        await supabase
          .from('cameras')
          .update({ last_offline_alert_at: null })
          .eq('id', cam.id);
        recoveries.push({ camera: cam.nome_exibicao, send: sendResult });
        continue;
      }

      // OFFLINE e nunca alertada OU último alerta foi há mais de 6h
      if (isOffline && lastAlertAgo > realertThresholdMs) {
        const deltaTxt = formatDelta(lastSeenAgo / 60000);
        const msg = `🔴 *CÂMERA OFFLINE*\nCâmera: ${cam.nome_exibicao}\nCliente: ${cam.cliente?.nome || '—'}\nÚltimo sinal: ${deltaTxt} atrás (${cam.last_seen || 'nunca'})\n\nVerificar conectividade no site.`;
        const sendResult = await sendWaSender(msg);
        await supabase
          .from('cameras')
          .update({ last_offline_alert_at: new Date().toISOString() })
          .eq('id', cam.id);
        alerts.push({ camera: cam.nome_exibicao, offline_for: deltaTxt, send: sendResult });
      }
    }

    return res.status(200).json({
      ok: true,
      checked: cams?.length || 0,
      alerts_sent: alerts.length,
      recoveries_sent: recoveries.length,
      alerts,
      recoveries,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[cron-monitor-cameras] Erro:', err.message);
    return res.status(500).json({ error: 'Erro interno do servidor', detalhes: err.message });
  }
};
