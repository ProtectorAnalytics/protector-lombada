const { autenticar, verificarAcessoCliente, supabase } = require('../../lib/auth-middleware');
const { isValidUUID } = require('../../lib/validators');

/**
 * GET /api/admin/diagnostico?camera_id=<uuid>
 *
 * Retorna painel completo de diagnóstico para uma câmera:
 *  - dados da câmera (last_seen, ip, mac, firmware, modelo)
 *  - status agregado (online / alerta / offline)
 *  - estatísticas das últimas 24h (sucessos/erros, breakdown de motivos)
 *  - timeline horária (heartbeats x capturas x erros)
 *  - últimos 50 eventos do conexao_log
 *  - veredicto: causa provável de falha quando aplicável
 *
 * Autorizado para: super_admin, admin_cliente, operador (só do seu cliente)
 */
module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Método não permitido' });
    }

    const { profile } = await autenticar(req, ['super_admin', 'admin_cliente', 'operador']);
    const cameraId = req.query.camera_id;

    if (!cameraId || !isValidUUID(cameraId)) {
      return res.status(400).json({ error: 'camera_id obrigatório (UUID válido)' });
    }

    // 1. Câmera + dados do cliente
    const { data: camera, error: camErr } = await supabase
      .from('cameras')
      .select('id, cliente_id, nome, nome_exibicao, token, serial_number, modelo, firmware, ativa, last_seen, ip_address, mac_address, last_capture_id, last_offline_alert_at, criado_em')
      .eq('id', cameraId)
      .single();

    if (camErr || !camera) {
      return res.status(404).json({ error: 'Câmera não encontrada' });
    }

    if (!verificarAcessoCliente(profile, camera.cliente_id)) {
      return res.status(403).json({ error: 'Sem acesso a esta câmera' });
    }

    // 2. Janela: últimas 24h
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // 3. Logs das últimas 24h (carrega só o necessário para agregar)
    const { data: logs24h, error: logErr } = await supabase
      .from('conexao_log')
      .select('ts, tipo, resultado, motivo, http_status, ip_origem, ip_payload, user_agent, placa, velocidade, latencia_ms')
      .eq('camera_id', cameraId)
      .gte('ts', cutoff24h)
      .order('ts', { ascending: false })
      .limit(5000);

    if (logErr) throw logErr;

    const logs = logs24h || [];

    // 4. Últimos 50 eventos (todos os tipos), com mais campos para inspeção
    const { data: ultimosEventos } = await supabase
      .from('conexao_log')
      .select('ts, tipo, resultado, motivo, http_status, ip_origem, ip_payload, mac_payload, user_agent, content_type, payload_keys, placa, velocidade, latencia_ms, detalhes')
      .eq('camera_id', cameraId)
      .order('ts', { ascending: false })
      .limit(50);

    // 4.1 Últimos 20 eventos sem camera_id mas com este serial — útil para detectar
    // câmera que está enviando mas não bate com a registrada (token errado, serial diferente)
    let eventosOrfaos = [];
    if (camera.serial_number) {
      const { data } = await supabase
        .from('conexao_log')
        .select('ts, tipo, resultado, motivo, ip_origem, ip_payload, user_agent')
        .eq('serial_recebido', camera.serial_number)
        .is('camera_id', null)
        .order('ts', { ascending: false })
        .limit(20);
      eventosOrfaos = data || [];
    }

    // 5. Agregações
    const agg = agregar(logs);

    // 6. Timeline por hora (24 buckets)
    const timeline = montarTimeline(logs);

    // 7. Última captura efetiva (precisa cruzar com tabela capturas se last_capture_id existir)
    let ultimaCaptura = null;
    if (camera.last_capture_id) {
      const { data } = await supabase
        .from('capturas')
        .select('id, placa, velocidade, timestamp')
        .eq('id', camera.last_capture_id)
        .single();
      ultimaCaptura = data || null;
    }

    // 8. Status agregado da câmera
    const status = computarStatus(camera.last_seen);

    // 9. Veredicto / causa provável
    const veredicto = diagnosticar({
      camera,
      status,
      agg,
      logs,
      ultimaCaptura,
      eventosOrfaos,
    });

    return res.status(200).json({
      camera,
      status,
      ultima_captura: ultimaCaptura,
      janela: { inicio: cutoff24h, fim: new Date().toISOString(), horas: 24 },
      stats_24h: agg,
      timeline,
      eventos: ultimosEventos || [],
      eventos_orfaos: eventosOrfaos,
      veredicto,
    });
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ error: err.error });
    console.error('Erro em /api/admin/diagnostico:', err.message);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

// ============================================
// Helpers
// ============================================

function computarStatus(lastSeen) {
  if (!lastSeen) return { codigo: 'sem_dados', label: 'Aguardando primeira captura', cor: 'azul' };
  const diffMin = (Date.now() - new Date(lastSeen).getTime()) / 60000;
  if (diffMin < 5) return { codigo: 'online', label: 'Online', cor: 'verde', minutos_desde: Math.round(diffMin) };
  if (diffMin < 30) return { codigo: 'alerta', label: 'Alerta', cor: 'amarelo', minutos_desde: Math.round(diffMin) };
  return { codigo: 'offline', label: 'Offline', cor: 'vermelho', minutos_desde: Math.round(diffMin) };
}

function agregar(logs) {
  const out = {
    total: logs.length,
    sucessos: 0,
    erros: 0,
    por_tipo: { placa: 0, heartbeat: 0 },
    por_motivo: {}, // contagem de cada código de erro
    placas_capturadas: 0, // sucessos tipo='placa'
    ips_origem: {},
    ips_payload: {},
    user_agents: {},
    latencia_p50_ms: null,
    latencia_p95_ms: null,
    primeiro_evento: null,
    ultimo_evento: null,
  };

  const latencias = [];

  for (const l of logs) {
    if (l.resultado === 'sucesso') out.sucessos++;
    else out.erros++;

    out.por_tipo[l.tipo] = (out.por_tipo[l.tipo] || 0) + 1;

    if (l.resultado === 'erro' && l.motivo) {
      out.por_motivo[l.motivo] = (out.por_motivo[l.motivo] || 0) + 1;
    }

    if (l.tipo === 'placa' && l.resultado === 'sucesso') {
      out.placas_capturadas++;
    }

    if (l.ip_origem) out.ips_origem[l.ip_origem] = (out.ips_origem[l.ip_origem] || 0) + 1;
    if (l.ip_payload) out.ips_payload[l.ip_payload] = (out.ips_payload[l.ip_payload] || 0) + 1;
    if (l.user_agent) out.user_agents[l.user_agent] = (out.user_agents[l.user_agent] || 0) + 1;

    if (Number.isFinite(l.latencia_ms)) latencias.push(l.latencia_ms);
  }

  if (logs.length > 0) {
    out.ultimo_evento = logs[0].ts;
    out.primeiro_evento = logs[logs.length - 1].ts;
  }

  if (latencias.length > 0) {
    latencias.sort((a, b) => a - b);
    out.latencia_p50_ms = latencias[Math.floor(latencias.length * 0.5)];
    out.latencia_p95_ms = latencias[Math.floor(latencias.length * 0.95)];
  }

  return out;
}

function montarTimeline(logs) {
  // 24 buckets de 1h, do mais antigo para o mais recente
  const buckets = [];
  const agora = Date.now();
  for (let i = 23; i >= 0; i--) {
    const inicio = new Date(agora - (i + 1) * 60 * 60 * 1000);
    const fim = new Date(agora - i * 60 * 60 * 1000);
    buckets.push({
      hora: fim.toISOString(),
      heartbeats: 0,
      capturas: 0,
      erros: 0,
    });
  }

  for (const l of logs) {
    const t = new Date(l.ts).getTime();
    const idx = 23 - Math.floor((agora - t) / (60 * 60 * 1000));
    if (idx < 0 || idx > 23) continue;
    const b = buckets[idx];
    if (l.resultado === 'erro') b.erros++;
    else if (l.tipo === 'heartbeat') b.heartbeats++;
    else if (l.tipo === 'placa') b.capturas++;
  }

  return buckets;
}

/**
 * Heurística de diagnóstico — combina padrões nos logs para sugerir
 * causa provável. Inspirado nos manuais ALPHADIGI (DNS, firewall,
 * modo de retransmissão, configuração de servidor).
 */
function diagnosticar({ camera, status, agg, logs, ultimaCaptura, eventosOrfaos }) {
  const achados = [];

  // 1. Câmera nunca enviou nada
  if (!camera.last_seen) {
    achados.push({
      severidade: 'critico',
      codigo: 'nunca_conectou',
      titulo: 'Câmera nunca se conectou ao servidor',
      descricao: 'Nenhum heartbeat ou captura recebido desde o cadastro.',
      acoes: [
        'Confirme se o servidor "191.252.201.142" e porta "3000" estão configurados na câmera (Configuração → Conf. Comm → Comunicação)',
        'Confirme se os endpoints estão como "/placa" e "/heartbeat"',
        'Verifique conectividade da câmera com a internet (ping no DNS 8.8.8.8)',
        'Verifique se o firewall da rede do cliente libera saída na porta 3000',
        'Confirme que o serial number cadastrado bate com o da câmera física',
      ],
    });
  }

  // 2. Status offline (>30 min sem heartbeat)
  if (status.codigo === 'offline') {
    achados.push({
      severidade: 'critico',
      codigo: 'offline',
      titulo: `Câmera offline há ${status.minutos_desde} minutos`,
      descricao: 'Nenhum sinal (heartbeat ou captura) há mais de 30 minutos.',
      acoes: [
        'Verifique alimentação elétrica da câmera (110V/220V)',
        'Verifique cabo de rede e link de internet do cliente',
        'Acesse a câmera localmente (192.168.0.10) e verifique se o status na barra inferior do QLPR Config está "Online"',
        'Se câmera estiver acessível mas offline no servidor: provavelmente firewall ou DNS',
        'Em campo, o modo de retransmissão da câmera tenta a cada 2s por 100s ao perder conexão',
      ],
    });
  }

  // 3. Tem heartbeat mas não tem captura há muito tempo
  if (status.codigo !== 'offline' && agg.por_tipo.heartbeat > 0 && agg.placas_capturadas === 0) {
    achados.push({
      severidade: 'alto',
      codigo: 'sem_capturas',
      titulo: 'Câmera online mas sem capturas nas últimas 24h',
      descricao: 'Heartbeats chegando normalmente, mas nenhuma placa foi reconhecida.',
      acoes: [
        'Verifique o posicionamento físico: distância 15–20m, altura 1,8–3m',
        'Verifique o sensor doppler de velocidade (cabos Marrom IN1+ e Branco GND)',
        'Confirme se a área de detecção e linha de disparo estão ajustadas',
        'Pixel da placa deve estar entre 130–200px na imagem',
        'À noite, verifique iluminação ambiente — câmera tem IR mas iluminação pública ajuda muito',
      ],
    });
  }

  // 4. Muitos erros placa_vazia
  if ((agg.por_motivo.placa_vazia || 0) >= 10) {
    achados.push({
      severidade: 'medio',
      codigo: 'ocr_falhando',
      titulo: `${agg.por_motivo.placa_vazia} capturas com placa vazia nas últimas 24h`,
      descricao: 'Câmera está disparando capturas mas o OCR não consegue ler a placa.',
      acoes: [
        'Verifique limpeza da lente da câmera',
        'Verifique foco e zoom (largura da placa entre 140–200px)',
        'À noite: melhore iluminação ambiente ou verifique IR auxiliar',
        'Verifique nivelamento do suporte 3D (placa deve ficar horizontal)',
      ],
    });
  }

  // 5. Token inválido recorrente
  if ((agg.por_motivo.token_invalido || 0) >= 3) {
    achados.push({
      severidade: 'alto',
      codigo: 'token_invalido',
      titulo: `${agg.por_motivo.token_invalido} tentativas com token inválido nas últimas 24h`,
      descricao: 'Câmera está enviando token errado ou em formato inválido.',
      acoes: [
        'Verifique o token na URL do endpoint /placa configurado na câmera',
        'Se a câmera não suporta token na URL, o fallback usa serial number — confirme cadastro do serial',
      ],
    });
  }

  // 6. Rate limit acionado
  if ((agg.por_motivo.rate_limit || 0) >= 5) {
    achados.push({
      severidade: 'medio',
      codigo: 'rate_limit',
      titulo: `${agg.por_motivo.rate_limit} requisições bloqueadas por rate limit`,
      descricao: 'Câmera enviando capturas mais rápido que o limite (120 req/min). Possível flooding.',
      acoes: [
        'Verifique se há fluxo anormal de veículos ou disparos falsos do sensor',
        'Considere ajustar área de detecção ou linha de disparo',
        'Verifique configuração de retransmissão (intervalo 2s, tempo total 100s)',
      ],
    });
  }

  // 7. Múltiplos IPs origem (NAT/proxy mudando)
  const ipsOrigem = Object.keys(agg.ips_origem || {});
  if (ipsOrigem.length > 3) {
    achados.push({
      severidade: 'baixo',
      codigo: 'ip_variavel',
      titulo: `Câmera vista de ${ipsOrigem.length} IPs diferentes`,
      descricao: 'Múltiplos IPs origem detectados — pode indicar NAT, VPN ou link instável.',
      acoes: ['Confirme se a rede do cliente tem IP público estável'],
    });
  }

  // 8. Eventos órfãos: serial bateu mas câmera não estava cadastrada ou em outro registro
  if (eventosOrfaos.length > 0) {
    achados.push({
      severidade: 'medio',
      codigo: 'serial_orfao',
      titulo: `${eventosOrfaos.length} requisições com este serial mas sem câmera cadastrada`,
      descricao: 'Câmera enviou pacotes com o serial correto mas em momentos em que o cadastro não estava ativo.',
      acoes: ['Confirme que a câmera está marcada como "ativa=true" sem interrupções'],
    });
  }

  // 9. Sem achados = tudo ok
  if (achados.length === 0) {
    achados.push({
      severidade: 'ok',
      codigo: 'ok',
      titulo: 'Funcionamento normal',
      descricao: `${agg.placas_capturadas} capturas e ${agg.por_tipo.heartbeat || 0} heartbeats nas últimas 24h, sem erros relevantes.`,
      acoes: [],
    });
  }

  return { achados };
}
