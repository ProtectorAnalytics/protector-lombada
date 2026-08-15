const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Cache de câmeras em memória (TTL 5 minutos)
const CACHE_TTL = 5 * 60 * 1000;
const cameraCache = new Map();

function getCachedCamera(key) {
  const entry = cameraCache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  cameraCache.delete(key);
  return null;
}

function setCachedCamera(key, data) {
  cameraCache.set(key, { data, ts: Date.now() });
  // Limpar cache se ficar grande demais
  if (cameraCache.size > 100) {
    const now = Date.now();
    for (const [k, v] of cameraCache) {
      if (now - v.ts > CACHE_TTL) cameraCache.delete(k);
    }
  }
}

/**
 * Busca câmera pelo token e retorna com dados do cliente (com cache)
 */
async function findCameraByToken(token) {
  const cached = getCachedCamera(`token:${token}`);
  if (cached) return cached;

  const { data, error } = await supabase
    .from('cameras')
    .select('*, clientes(*)')
    .eq('token', token)
    .eq('ativa', true)
    .single();

  if (error || !data) return null;
  setCachedCamera(`token:${token}`, data);
  return data;
}

/**
 * Busca câmera pelo serial number (fallback quando token não vem na URL)
 */
async function findCameraBySerial(serialno) {
  const cached = getCachedCamera(`serial:${serialno}`);
  if (cached) return cached;

  const { data, error } = await supabase
    .from('cameras')
    .select('*, clientes(*)')
    .eq('serial_number', serialno)
    .eq('ativa', true)
    .single();

  if (error || !data) return null;
  setCachedCamera(`serial:${serialno}`, data);
  return data;
}

/**
 * Procura uma captura recente com o mesmo vehicle_id na mesma câmera.
 *
 * O vehicleId identifica o evento de captura dentro da câmera: toda
 * retransmissão do mesmo evento carrega o mesmo valor. Serve para descartar
 * reenvio sem depender de heurística de placa + janela de horário.
 *
 * A busca é limitada a uma janela recente porque o contador reinicia no boot da
 * câmera — sem o recorte, um valor reciclado dias depois seria confundido com
 * retransmissão e descartaria captura legítima. Ver
 * sql/migration-vehicle-id-dedupe.sql.
 *
 * @param {string} cameraId
 * @param {number} vehicleId
 * @param {number} janelaMinutos - default 10 (retransmissão da câmera dura 100s)
 * @returns {Promise<{id: string, timestamp: string}|null>}
 */
async function findCapturaRecentePorVehicleId(cameraId, vehicleId, janelaMinutos = 10) {
  // > 0 e não apenas isFinite: 0 é o que sobra de payload sem o campo, e
  // deduplicar por 0 descartaria passagens distintas de câmeras que não
  // enviam vehicleId.
  if (!Number.isFinite(vehicleId) || vehicleId <= 0) return null;

  const desde = new Date(Date.now() - janelaMinutos * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('capturas')
    .select('id, timestamp')
    .eq('camera_id', cameraId)
    .eq('vehicle_id', vehicleId)
    .gte('timestamp', desde)
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Falha de consulta não pode bloquear a captura: na dúvida, deixa passar
  // (duplicar é menos grave que perder passagem).
  if (error) return null;
  return data || null;
}

/**
 * Salva captura no banco
 */
async function saveCaptura(capturaData) {
  const { data, error } = await supabase
    .from('capturas')
    .insert(capturaData)
    .select()
    .single();

  if (error) throw new Error(`Erro ao salvar captura: ${error.message}`);
  return data;
}

/**
 * Upload de foto ao Supabase Storage com retry em falhas transitórias.
 * Taxa observada em prod ~0.15% (~4/2649) — duas tentativas reduzem perda
 * pra praticamente zero sem custar latência no caminho feliz.
 */
async function uploadPhoto(filePath, buffer) {
  const MAX_ATTEMPTS = 3;
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { error } = await supabase.storage
      .from('capturas-fotos')
      .upload(filePath, buffer, { contentType: 'image/jpeg', upsert: false });

    if (!error) return filePath;
    lastError = error;

    // "Duplicate" = arquivo já existe; retry não vai ajudar — abortar
    if (error.message && /duplicate|already exists/i.test(error.message)) break;

    if (attempt < MAX_ATTEMPTS) {
      await new Promise(r => setTimeout(r, 250 * attempt)); // 250ms, 500ms
    }
  }
  throw new Error(`Erro no upload da foto: ${lastError.message}`);
}

/**
 * Busca veículo pela placa no cliente
 */
async function findVeiculo(clienteId, placa) {
  const { data } = await supabase
    .from('veiculos')
    .select('*')
    .eq('cliente_id', clienteId)
    .eq('placa', placa)
    .eq('ativo', true)
    .single();

  return data || null;
}

/**
 * Busca últimas N passagens de uma placa no cliente
 */
async function getPassagensByPlaca(clienteId, placa, limit = 30) {
  const { data } = await supabase
    .from('capturas')
    .select('placa, velocidade, timestamp')
    .eq('cliente_id', clienteId)
    .eq('placa', placa)
    .order('timestamp', { ascending: false })
    .limit(limit);

  return data || [];
}

// Throttle last_seen: atualizar no máximo 1x por minuto por câmera
const lastSeenUpdates = new Map();

/**
 * Atualiza last_seen da câmera (throttled para economizar queries)
 */
async function updateCameraLastSeen(cameraId, capturaId = null, extra = {}) {
  const now = Date.now();
  const lastUpdate = lastSeenUpdates.get(cameraId) || 0;

  // Se tem capturaId, sempre atualizar (é uma captura real)
  // Senão (heartbeat), só atualizar 1x por minuto
  if (!capturaId && now - lastUpdate < 60000) return;

  lastSeenUpdates.set(cameraId, now);
  const update = { last_seen: new Date().toISOString() };
  if (capturaId) update.last_capture_id = capturaId;
  if (extra.ip_address) update.ip_address = extra.ip_address;
  if (extra.mac_address) update.mac_address = extra.mac_address;
  // Telemetria passiva capturada do heartbeat / header HTTP (manutenção)
  if (extra.endpoint_configurado) update.endpoint_configurado = extra.endpoint_configurado;
  if (extra.host_camera_reportado) update.host_camera_reportado = extra.host_camera_reportado;
  if (extra.uptime_start_ts) update.uptime_start_ts = extra.uptime_start_ts;
  if (extra.ultimo_outage_reportado) update.ultimo_outage_reportado = extra.ultimo_outage_reportado;
  if (Number.isInteger(extra.heartbeat_countid)) update.heartbeat_countid = extra.heartbeat_countid;
  if (extra.firmware_versao) update.firmware_versao = extra.firmware_versao;
  await supabase.from('cameras').update(update).eq('id', cameraId);
}

/**
 * Marca captura como notificada
 */
async function markNotificado(capturaId) {
  await supabase
    .from('capturas')
    .update({ notificado: true, notificado_em: new Date().toISOString() })
    .eq('id', capturaId);
}

/**
 * Busca capturas antigas (> dias) para limpeza
 */
async function getCapturaAntigas(dias, limit = 100) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - dias);

  const { data } = await supabase
    .from('capturas')
    .select('id, foto_path')
    .lt('timestamp', cutoff.toISOString())
    .limit(limit);

  return data || [];
}

/**
 * Deleta capturas por IDs
 */
async function deleteCapturas(ids) {
  const { error } = await supabase
    .from('capturas')
    .delete()
    .in('id', ids);

  if (error) throw new Error(`Erro ao deletar capturas: ${error.message}`);
}

/**
 * Deleta fotos do Storage
 */
async function deletePhotos(paths) {
  const validPaths = paths.filter(Boolean);
  if (validPaths.length === 0) return;

  const { error } = await supabase.storage
    .from('capturas-fotos')
    .remove(validPaths);

  if (error) throw new Error(`Erro ao deletar fotos: ${error.message}`);
}

module.exports = {
  supabase,
  findCameraByToken,
  findCameraBySerial,
  findCapturaRecentePorVehicleId,
  saveCaptura,
  uploadPhoto,
  findVeiculo,
  getPassagensByPlaca,
  updateCameraLastSeen,
  markNotificado,
  getCapturaAntigas,
  deleteCapturas,
  deletePhotos,
};
