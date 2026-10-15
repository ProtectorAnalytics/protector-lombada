/**
 * Regras do monitor de câmeras (cron-monitor-cameras), sem I/O.
 *
 * - offline: last_seen há mais de 30 min (ou nunca) e sem alerta nas
 *   últimas 6 h → entra no e-mail.
 * - voltou: estava alertada (last_offline_alert_at) e last_seen recente.
 * Horários do e-mail em America/Sao_Paulo.
 */
const OFFLINE_MIN = 30;
const REALERTA_H = 6;

function msDesde(iso, agora) {
  return iso ? agora - new Date(iso).getTime() : Infinity;
}

function duracao(ms) {
  if (!Number.isFinite(ms)) return 'nunca enviou';
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.floor(min / 60)} h`;
  return `${Math.floor(min / 1440)} d`;
}

function horaSP(iso) {
  if (!iso) return 'nunca';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

/** @returns {{ offline: object[], voltaram: object[] }} */
function classificarCameras(cams, agora = Date.now()) {
  const offline = [];
  const voltaram = [];
  for (const cam of cams || []) {
    const semSinal = msDesde(cam.last_seen, agora);
    const estaOffline = semSinal > OFFLINE_MIN * 60000;
    const foiAlertada = cam.last_offline_alert_at != null;
    if (!estaOffline && foiAlertada) {
      voltaram.push(cam);
    } else if (estaOffline && msDesde(cam.last_offline_alert_at, agora) > REALERTA_H * 3600000) {
      offline.push({ ...cam, semSinal: duracao(semSinal) });
    }
  }
  return { offline, voltaram };
}

function linha(cam, extra) {
  return `- ${cam.nome_exibicao} (${cam.cliente?.nome || 'sem cliente'}) — ${extra}`;
}

/** @returns {{ assunto: string, texto: string } | null} */
function montarEmail({ offline, voltaram }) {
  if (!offline.length && !voltaram.length) return null;
  const partes = [];
  if (offline.length) {
    partes.push(`Câmeras sem sinal há mais de ${OFFLINE_MIN} min:`);
    offline.forEach((c) => partes.push(linha(c, `último sinal ${horaSP(c.last_seen)} (${c.semSinal})`)));
    partes.push('', 'Verificar energia e internet no local. Novo aviso em 6 h se continuar.');
  }
  if (voltaram.length) {
    if (partes.length) partes.push('');
    partes.push('Voltaram a enviar:');
    voltaram.forEach((c) => partes.push(linha(c, `último sinal ${horaSP(c.last_seen)}`)));
  }
  const assunto = offline.length
    ? `Lombada: ${offline.length} câmera(s) sem sinal`
    : `Lombada: ${voltaram.length} câmera(s) voltaram`;
  return { assunto, texto: partes.join('\n') };
}

module.exports = { OFFLINE_MIN, REALERTA_H, classificarCameras, montarEmail, horaSP };
