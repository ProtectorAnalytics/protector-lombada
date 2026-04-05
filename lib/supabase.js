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
 * Upload de foto ao Supabase Storage
 */
async function uploadPhoto(filePath, buffer) {
  const { error } = await supabase.storage
    .from('capturas-fotos')
    .upload(filePath, buffer, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (error) throw new Error(`Erro no upload da foto: ${error.message}`);
  return filePath;
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
 * Busca capturas > N dias para arquivar no histórico.
 * Retorna com flag eh_infracao (vel > limite do cliente).
 */
async function getCapturasParaArquivar(dias, limit = 100) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - dias);

  const { data, error } = await supabase
    .from('capturas')
    .select('id, camera_id, cliente_id, placa, velocidade, pixels, tipo_veiculo, cor_veiculo, foto_path, timestamp, notificado, notificado_em, criado_em, clientes!inner(limite_velocidade)')
    .lt('timestamp', cutoff.toISOString())
    .limit(limit);

  if (error) throw new Error(`Erro ao buscar capturas para arquivar: ${error.message}`);

  return (data || []).map((c) => ({
    ...c,
    eh_infracao: c.velocidade > (c.clientes?.limite_velocidade ?? 30),
  }));
}

/**
 * Arquiva capturas no histórico (idempotente via ON CONFLICT).
 * Infrações mantêm foto_disponivel=true (foto continua no Storage por 90d).
 * Regulares ficam foto_disponivel=false (foto será apagada junto com a captura).
 */
async function archiveToHistorico(capturas) {
  if (!capturas || capturas.length === 0) return 0;

  const rows = capturas.map((c) => ({
    captura_id: c.id,
    camera_id: c.camera_id,
    cliente_id: c.cliente_id,
    placa: c.placa,
    velocidade: c.velocidade,
    pixels: c.pixels,
    tipo_veiculo: c.tipo_veiculo,
    cor_veiculo: c.cor_veiculo,
    foto_path: c.foto_path,
    foto_disponivel: c.eh_infracao && !!c.foto_path,
    timestamp: c.timestamp,
    notificado: c.notificado,
    notificado_em: c.notificado_em,
    capturado_em: c.criado_em,
    origem: 'producao',
  }));

  const { data, error } = await supabase
    .from('capturas_historico')
    .upsert(rows, { onConflict: 'captura_id', ignoreDuplicates: true })
    .select('id');

  if (error) throw new Error(`Erro ao arquivar no histórico: ${error.message}`);
  return (data || []).length;
}

/**
 * Busca fotos de infração > N dias do histórico para apagar do Storage.
 */
async function getFotosInfracaoParaApagar(dias, limit = 100) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - dias);

  const { data, error } = await supabase
    .from('capturas_historico')
    .select('id, foto_path')
    .eq('foto_disponivel', true)
    .not('foto_path', 'is', null)
    .lt('timestamp', cutoff.toISOString())
    .limit(limit);

  if (error) throw new Error(`Erro ao buscar fotos para purge: ${error.message}`);
  return data || [];
}

/**
 * Marca foto como indisponível no histórico (após deletá-la do Storage)
 */
async function markFotoIndisponivel(ids) {
  if (!ids || ids.length === 0) return;
  const { error } = await supabase
    .from('capturas_historico')
    .update({ foto_disponivel: false })
    .in('id', ids);
  if (error) throw new Error(`Erro ao marcar foto indisponível: ${error.message}`);
}

/**
 * Apaga registros do histórico com mais de N dias.
 * Retorna a quantidade apagada.
 */
async function purgeHistoricoAntigo(dias) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - dias);

  const { data, error } = await supabase
    .from('capturas_historico')
    .delete()
    .lt('timestamp', cutoff.toISOString())
    .select('id');

  if (error) throw new Error(`Erro ao purgar histórico: ${error.message}`);
  return (data || []).length;
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
  saveCaptura,
  uploadPhoto,
  findVeiculo,
  getPassagensByPlaca,
  updateCameraLastSeen,
  markNotificado,
  getCapturaAntigas,
  deleteCapturas,
  deletePhotos,
  getCapturasParaArquivar,
  archiveToHistorico,
  getFotosInfracaoParaApagar,
  markFotoIndisponivel,
  purgeHistoricoAntigo,
};
