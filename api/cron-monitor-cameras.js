/**
 * CRON DE MONITORAMENTO DE CÂMERAS
 *
 * Agendado no vercel.json para rodar a cada 15min.
 *
 * Dois padrões detectados:
 *   1. OFFLINE: last_seen > 30min — câmera não está se comunicando
 *   2. ONLINE_SEM_CAPTURAS: heartbeats chegando, mas zero capturas
 *      nas últimas 6h (configurável). Indica sensor doppler, OCR
 *      ou posicionamento problemático.
 *
 * Para cada alerta, classifica a CAUSA PROVÁVEL consultando
 * conexao_log das últimas 24h:
 *   - rede_caiu: tinha capturas recentes e parou
 *   - sem_trafego: heartbeats ok mas nunca teve captura no período
 *   - serial_orfao: serial chegando mas câmera marcada inativa
 *   - ocr_falhando: muitas placas vazias
 *   - rate_limit: requisições bloqueadas
 *   - nunca_conectou: câmera nunca enviou nada
 *
 * Throttling: cameras.last_offline_alert_at — re-alerta a cada 6h.
 *
 * ENV vars:
 *   - SUPABASE_URL, SUPABASE_SERVICE_KEY
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
const SEM_CAPTURAS_THRESHOLD_HOURS = 6;

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

/**
 * Consulta conexao_log das últimas 24h e classifica a causa provável.
 * Retorna { causa, label, acoes: string[] }.
 */
async function classificarCausaOffline(camera) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: logs } = await supabase
    .from('conexao_log')
    .select('ts, tipo, resultado, motivo, http_status')
    .eq('camera_id', camera.id)
    .gte('ts', cutoff)
    .order('ts', { ascending: false })
    .limit(2000);

  const arr = logs || [];

  // Sem nenhum log e sem last_seen registrado: nunca conectou
  if (arr.length === 0 && !camera.last_seen) {
    return {
      causa: 'nunca_conectou',
      label: 'Nunca se conectou',
      acoes: [
        'Confirme servidor 191.252.201.142:3000 na câmera (Conf. Comm → Comunicação)',
        'Confirme endpoints /placa e /heartbeat',
        'Confirme DNS 8.8.8.8 na câmera (Rede Local)',
        'Verifique liberação de firewall do cliente para porta 3000',
        'Confirme que o serial cadastrado bate com o serial físico',
      ],
    };
  }

  // Sem nenhum log mas tem last_seen antigo: muito tempo sem sinal
  if (arr.length === 0) {
    return {
      causa: 'sem_logs_24h',
      label: 'Sem nenhum sinal nas últimas 24h',
      acoes: ['Verificar alimentação elétrica e link de internet do cliente'],
    };
  }

  // Encontra última captura bem-sucedida e último heartbeat
  const ultimaCaptura = arr.find(l => l.tipo === 'placa' && l.resultado === 'sucesso');
  const ultimoHeartbeat = arr.find(l => (l.tipo === 'heartbeat' || (l.tipo === 'placa' && l.motivo == null)) && l.resultado === 'sucesso');
  const ultimoQualquerSucesso = arr.find(l => l.resultado === 'sucesso');

  const minSinceLastCap = ultimaCaptura ? (Date.now() - new Date(ultimaCaptura.ts).getTime()) / 60000 : Infinity;
  const minSinceLastHb = ultimoHeartbeat ? (Date.now() - new Date(ultimoHeartbeat.ts).getTime()) / 60000 : Infinity;
  const minSinceAnySuccess = ultimoQualquerSucesso ? (Date.now() - new Date(ultimoQualquerSucesso.ts).getTime()) / 60000 : Infinity;

  // Câmera tinha sucesso recente e parou de repente
  if (minSinceAnySuccess < 24 * 60) {
    return {
      causa: 'rede_caiu',
      label: `Comunicação interrompida (último sinal há ${formatDelta(minSinceAnySuccess)})`,
      acoes: [
        'Confirme alimentação elétrica do painel (110V/220V — fonte colmeia)',
        'Confirme link de internet local do cliente (router/switch)',
        'Acesse 192.168.0.10 e verifique se aparece "Online" no rodapé do QLPR Config',
        'Modo retransmissão da câmera tenta a cada 2s por 100s ao perder conexão',
      ],
    };
  }

  // Tinha heartbeat mas nunca tinha captura na janela: posicionamento/sensor
  if (ultimoHeartbeat && !ultimaCaptura) {
    return {
      causa: 'sensor_ou_posicionamento',
      label: 'Heartbeats ok mas zero capturas em 24h',
      acoes: [
        'Verifique posicionamento (15–20m de distância, altura 1,8–3m)',
        'Verifique sensor doppler (cabos Marrom IN1+ / Branco GND)',
        'Verifique área de detecção e linha de disparo no QLPR Config',
      ],
    };
  }

  // Erros recorrentes
  const errosPorMotivo = {};
  for (const l of arr) {
    if (l.resultado === 'erro' && l.motivo) {
      errosPorMotivo[l.motivo] = (errosPorMotivo[l.motivo] || 0) + 1;
    }
  }
  const motivoMaisComum = Object.entries(errosPorMotivo).sort((a, b) => b[1] - a[1])[0];

  if (motivoMaisComum && motivoMaisComum[1] >= 5) {
    const [motivo, qtd] = motivoMaisComum;
    const mapa = {
      placa_vazia: { label: `OCR falhando (${qtd} placas vazias)`, acoes: ['Limpe lente', 'Verifique foco/zoom (placa 140–200px)', 'Iluminação ambiente à noite'] },
      token_invalido: { label: `Token inválido (${qtd}x)`, acoes: ['Verifique token na URL configurada na câmera'] },
      rate_limit: { label: `Rate limit (${qtd}x)`, acoes: ['Possível flooding — revisar área de detecção'] },
      serial_nao_cadastrado: { label: `Serial não cadastrado (${qtd}x)`, acoes: ['Confirme cadastro do serial físico'] },
      cliente_inativo: { label: `Cliente inativo (${qtd}x)`, acoes: ['Reativar cliente no admin'] },
    };
    if (mapa[motivo]) {
      return { causa: motivo, label: mapa[motivo].label, acoes: mapa[motivo].acoes };
    }
  }

  // Fallback genérico
  return {
    causa: 'indefinido',
    label: 'Causa não classificada — investigar no painel de diagnóstico',
    acoes: ['Abra o painel de diagnóstico da câmera para inspecionar os últimos eventos'],
  };
}

/**
 * Detecta câmeras online mas sem capturas — apenas se já tiveram capturas
 * antes (para não alertar sobre câmeras recém-instaladas).
 */
async function detectarSemCapturas(camera) {
  const cutoff = new Date(Date.now() - SEM_CAPTURAS_THRESHOLD_HOURS * 60 * 60 * 1000).toISOString();

  // Checa se houve captura nas últimas SEM_CAPTURAS_THRESHOLD_HOURS
  const { count } = await supabase
    .from('capturas')
    .select('id', { count: 'exact', head: true })
    .eq('camera_id', camera.id)
    .gte('timestamp', cutoff);

  if (count > 0) return null; // tem capturas, ok

  // Checa se já teve captura alguma vez (não alertar câmera recém-instalada)
  const { count: countTotal } = await supabase
    .from('capturas')
    .select('id', { count: 'exact', head: true })
    .eq('camera_id', camera.id)
    .limit(1);

  if (countTotal === 0) return null; // câmera nunca capturou; não é regressão

  // Checa se está mandando heartbeat (online)
  const { data: hbRecent } = await supabase
    .from('conexao_log')
    .select('ts')
    .eq('camera_id', camera.id)
    .eq('tipo', 'heartbeat')
    .eq('resultado', 'sucesso')
    .gte('ts', new Date(Date.now() - 30 * 60 * 1000).toISOString())
    .limit(1);

  if (!hbRecent || hbRecent.length === 0) return null; // não está realmente online

  return {
    horas: SEM_CAPTURAS_THRESHOLD_HOURS,
    causa: 'sensor_ou_posicionamento',
    label: `Online mas sem capturas há ${SEM_CAPTURAS_THRESHOLD_HOURS}h+`,
    acoes: [
      'Verifique sensor doppler (cabos no painel)',
      'Verifique posicionamento e linha de disparo',
      'Verifique se há tráfego de veículos no local (pode ser horário/dia atípico)',
    ],
  };
}

function montarMensagemOffline(cam, lastSeenAgo, causa) {
  const linhas = [
    `🔴 *CÂMERA OFFLINE*`,
    `Câmera: ${cam.nome_exibicao || cam.nome || '—'}`,
    `Cliente: ${cam.cliente?.nome || '—'}`,
    `Último sinal: ${formatDelta(lastSeenAgo / 60000)} atrás`,
    ``,
    `*Causa provável:* ${causa.label}`,
  ];
  if (causa.acoes?.length) {
    linhas.push('');
    linhas.push('*Verificar:*');
    for (const a of causa.acoes) linhas.push(`• ${a}`);
  }
  return linhas.join('\n');
}

function montarMensagemSemCapturas(cam, info) {
  const linhas = [
    `🟡 *CÂMERA SEM CAPTURAS*`,
    `Câmera: ${cam.nome_exibicao || cam.nome || '—'}`,
    `Cliente: ${cam.cliente?.nome || '—'}`,
    `Status: online (heartbeat ok), porém sem capturas há ${info.horas}h+`,
    ``,
    `*Causa provável:* ${info.label}`,
  ];
  if (info.acoes?.length) {
    linhas.push('');
    linhas.push('*Verificar:*');
    for (const a of info.acoes) linhas.push(`• ${a}`);
  }
  return linhas.join('\n');
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
      .select('id, nome, nome_exibicao, last_seen, last_offline_alert_at, cliente:clientes(nome)')
      .eq('ativa', true);

    if (error) throw new Error(`select cameras: ${error.message}`);

    const now = Date.now();
    const offlineThresholdMs = OFFLINE_THRESHOLD_MIN * 60 * 1000;
    const realertThresholdMs = REALERT_INTERVAL_HOURS * 3600 * 1000;

    const alerts = [];
    const recoveries = [];
    const noCapture = [];

    for (const cam of cams || []) {
      const lastSeenAgo = cam.last_seen ? now - new Date(cam.last_seen).getTime() : Infinity;
      const lastAlertAgo = cam.last_offline_alert_at
        ? now - new Date(cam.last_offline_alert_at).getTime()
        : Infinity;
      const isOffline = lastSeenAgo > offlineThresholdMs;
      const wasAlerted = cam.last_offline_alert_at !== null;

      // VOLTOU online
      if (!isOffline && wasAlerted) {
        const msg = `✅ *VOLTOU ONLINE*\nCâmera: ${cam.nome_exibicao || cam.nome}\nCliente: ${cam.cliente?.nome || '—'}\nlast_seen: agora`;
        const sendResult = await sendWaSender(msg);
        if (sendResult.sent) {
          await supabase
            .from('cameras')
            .update({ last_offline_alert_at: null })
            .eq('id', cam.id);
        }
        recoveries.push({ camera: cam.nome_exibicao || cam.nome, send: sendResult });
        continue;
      }

      // OFFLINE: alerta com causa provável (novo ou re-alerta após 6h)
      if (isOffline && lastAlertAgo > realertThresholdMs) {
        const causa = await classificarCausaOffline(cam);
        const msg = montarMensagemOffline(cam, lastSeenAgo, causa);
        const sendResult = await sendWaSender(msg);
        if (sendResult.sent) {
          await supabase
            .from('cameras')
            .update({ last_offline_alert_at: new Date().toISOString() })
            .eq('id', cam.id);
        }
        alerts.push({
          camera: cam.nome_exibicao || cam.nome,
          offline_for: formatDelta(lastSeenAgo / 60000),
          causa: causa.causa,
          causa_label: causa.label,
          send: sendResult,
        });
        continue;
      }

      // ONLINE: ainda assim, checar se há padrão "sem capturas há horas"
      // (não compete com alerta de offline; só vale se câmera está mandando hb)
      if (!isOffline) {
        const info = await detectarSemCapturas(cam);
        if (info) {
          // Throttle reaproveitando last_offline_alert_at (mesmo throttle de 6h)
          if (lastAlertAgo > realertThresholdMs) {
            const msg = montarMensagemSemCapturas(cam, info);
            const sendResult = await sendWaSender(msg);
            if (sendResult.sent) {
              await supabase
                .from('cameras')
                .update({ last_offline_alert_at: new Date().toISOString() })
                .eq('id', cam.id);
            }
            noCapture.push({ camera: cam.nome_exibicao || cam.nome, causa: info.causa, send: sendResult });
          }
        }
      }
    }

    return res.status(200).json({
      ok: true,
      checked: cams?.length || 0,
      alerts_offline: alerts.length,
      alerts_sem_capturas: noCapture.length,
      recoveries_sent: recoveries.length,
      alerts,
      no_capture: noCapture,
      recoveries,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[cron-monitor-cameras] Erro:', err.message);
    return res.status(500).json({ error: 'Erro interno do servidor', detalhes: err.message });
  }
};
