/**
 * CRON DE MONITORAMENTO DE CÂMERAS OFFLINE
 *
 * Agendado no vercel.json para rodar a cada 15 min.
 *
 * Câmera ativa sem sinal há mais de 30 min entra num e-mail único para os
 * avisos da Protector (apiplacas_config.emails_aviso, editável no admin).
 * Re-avisa a cada 6 h enquanto continuar offline e avisa quando volta.
 * Regras e texto em lib/monitor-cameras.js.
 *
 * Throttling via cameras.last_offline_alert_at: só marca/limpa depois que o
 * e-mail saiu; se o envio falhar, tenta de novo no próximo ciclo.
 *
 * ENV: SUPABASE_URL, SUPABASE_SERVICE_KEY, SMTP_*, CRON_SECRET (auth).
 */

const { exigirCron } = require('../lib/cron-auth');
const { supabase } = require('../lib/supabase');
const { enviarEmailSimples } = require('../lib/email-sender');
const { classificarCameras, montarEmail } = require('../lib/monitor-cameras');

async function destinatarios() {
  const { data, error } = await supabase.from('apiplacas_config').select('emails_aviso').limit(1).maybeSingle();
  if (error) throw new Error(`apiplacas_config: ${error.message}`);
  return data?.emails_aviso || [];
}

async function marcar(ids, valor) {
  if (!ids.length) return;
  const { error } = await supabase.from('cameras').update({ last_offline_alert_at: valor }).in('id', ids);
  if (error) throw new Error(`update cameras: ${error.message}`);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  if (!exigirCron(req, res)) return;

  try {
    const { data: cams, error } = await supabase
      .from('cameras')
      .select('id, nome_exibicao, last_seen, last_offline_alert_at, cliente:clientes(nome)')
      .eq('ativa', true);
    if (error) throw new Error(`select cameras: ${error.message}`);

    const { offline, voltaram } = classificarCameras(cams);
    const email = montarEmail({ offline, voltaram });
    const resumo = { ok: true, checked: cams?.length || 0, offline: offline.length, voltaram: voltaram.length, enviado: false };
    if (!email) return res.status(200).json(resumo);

    const para = await destinatarios();
    if (!para.length) {
      console.error('[cron-monitor-cameras] sem e-mails de aviso em apiplacas_config — alerta não enviado');
      return res.status(500).json({ ...resumo, ok: false, error: 'Sem destinatários de aviso' });
    }

    await enviarEmailSimples({ destinatarios: para, ...email });
    await marcar(offline.map((c) => c.id), new Date().toISOString());
    await marcar(voltaram.map((c) => c.id), null);

    return res.status(200).json({ ...resumo, enviado: true, cameras: offline.map((c) => c.nome_exibicao) });
  } catch (err) {
    console.error('[cron-monitor-cameras] Erro:', err.message);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
