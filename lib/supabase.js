const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Busca câmera pelo token e retorna com dados do cliente
 */
async function findCameraByToken(token) {
  const { data, error } = await supabase
    .from('cameras')
    .select('*, clientes(*)')
    .eq('token', token)
    .eq('ativa', true)
    .single();

  if (error || !data) return null;
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
  saveCaptura,
  uploadPhoto,
  findVeiculo,
  getPassagensByPlaca,
  markNotificado,
  getCapturaAntigas,
  deleteCapturas,
  deletePhotos,
};
