/**
 * Funções de validação para formulários e APIs
 */

/**
 * Valida formato de e-mail
 */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

/**
 * Valida formato de placa brasileira (antiga ABC-1234 ou Mercosul ABC1D23)
 */
function isValidPlaca(placa) {
  if (!placa || typeof placa !== 'string') return false;
  const normalized = placa.toUpperCase().replace(/[-\s]/g, '').trim();
  // Placa antiga: 3 letras + 4 números
  const antiga = /^[A-Z]{3}\d{4}$/;
  // Placa Mercosul: 3 letras + 1 número + 1 letra + 2 números
  const mercosul = /^[A-Z]{3}\d[A-Z]\d{2}$/;
  return antiga.test(normalized) || mercosul.test(normalized);
}

/**
 * Normaliza placa para formato sem hífen, maiúscula
 */
function normalizePlaca(placa) {
  if (!placa) return '';
  return placa.toUpperCase().replace(/[-\s]/g, '').trim();
}

/**
 * Valida limite de velocidade (número inteiro positivo, razoável)
 */
function isValidVelocidade(vel) {
  const n = parseInt(vel, 10);
  return !isNaN(n) && n > 0 && n <= 200;
}

/**
 * Valida CNPJ (formato básico - 14 dígitos)
 */
function isValidCNPJ(cnpj) {
  if (!cnpj) return true; // campo opcional
  const digits = cnpj.replace(/\D/g, '');
  return digits.length === 14;
}

/**
 * Valida telefone brasileiro (10 ou 11 dígitos)
 */
function isValidTelefone(tel) {
  if (!tel) return true; // campo opcional
  const digits = tel.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 11;
}

/**
 * Valida CEP (8 dígitos)
 */
function isValidCEP(cep) {
  if (!cep) return true; // campo opcional
  const digits = cep.replace(/\D/g, '');
  return digits.length === 8;
}

/**
 * Sanitiza string contra XSS (remove tags e caracteres perigosos)
 */
function sanitize(str) {
  if (!str || typeof str !== 'string') return str;
  return str.replace(/[<>"'&]/g, '').trim();
}

/**
 * Valida UUID v4
 */
function isValidUUID(id) {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Valida token de câmera (32 caracteres hexadecimais)
 */
function isValidToken(token) {
  if (!token || typeof token !== 'string') return false;
  return /^[0-9a-f]{32}$/i.test(token);
}

/**
 * Valida e normaliza timestamp ISO 8601
 * Retorna Date válido ou null
 */
function parseTimestamp(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  // Rejeitar datas muito no futuro (mais de 1 dia) ou muito no passado (mais de 30 dias)
  const now = Date.now();
  if (d.getTime() > now + 86400000) return null;
  if (d.getTime() < now - 30 * 86400000) return null;
  return d;
}

/**
 * Valida serial number de câmera (1-64 caracteres alfanuméricos)
 */
function isValidSerial(serial) {
  if (!serial || typeof serial !== 'string') return false;
  const trimmed = serial.trim();
  return trimmed.length >= 1 && trimmed.length <= 64 && /^[A-Za-z0-9_-]+$/.test(trimmed);
}

module.exports = {
  isValidEmail,
  isValidPlaca,
  normalizePlaca,
  isValidVelocidade,
  isValidCNPJ,
  isValidTelefone,
  isValidCEP,
  sanitize,
  isValidUUID,
  isValidToken,
  parseTimestamp,
  isValidSerial,
};
