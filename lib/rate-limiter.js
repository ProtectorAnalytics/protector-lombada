/**
 * Rate Limiter para API de capturas (Vercel Serverless)
 *
 * Usa um Map em memória por instância + validação de token da câmera.
 * Em serverless, cada instância tem seu próprio cache, mas como as
 * câmeras enviam no máximo 1 foto a cada poucos segundos, o rate limit
 * por instância já protege contra abuso.
 *
 * Limite padrão: 120 requisições por minuto por câmera (2 por segundo).
 */

const rateLimitMap = new Map();

const WINDOW_MS = 60 * 1000; // 1 minuto
const MAX_REQUESTS = 120; // máximo por câmera por minuto

/**
 * Verifica se a câmera está dentro do limite de requisições.
 *
 * @param {string} cameraId - ID da câmera (após autenticação)
 * @returns {{ allowed: boolean, remaining: number, resetIn: number }}
 */
function checkRateLimit(cameraId) {
  const now = Date.now();
  const key = `camera:${cameraId}`;

  let entry = rateLimitMap.get(key);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    // Nova janela
    entry = { windowStart: now, count: 1 };
    rateLimitMap.set(key, entry);
    cleanupOldEntries(now);
    return { allowed: true, remaining: MAX_REQUESTS - 1, resetIn: WINDOW_MS };
  }

  entry.count++;

  if (entry.count > MAX_REQUESTS) {
    const resetIn = WINDOW_MS - (now - entry.windowStart);
    return { allowed: false, remaining: 0, resetIn };
  }

  return {
    allowed: true,
    remaining: MAX_REQUESTS - entry.count,
    resetIn: WINDOW_MS - (now - entry.windowStart),
  };
}

/**
 * Limpa entradas antigas para evitar memory leak
 */
function cleanupOldEntries(now) {
  if (rateLimitMap.size > 500) {
    for (const [key, entry] of rateLimitMap) {
      if (now - entry.windowStart > WINDOW_MS * 2) {
        rateLimitMap.delete(key);
      }
    }
  }
}

/**
 * Rate Limiter genérico por chave (IP, token, etc.)
 * Usado para endpoints admin e auth.
 *
 * @param {string} key - Chave de identificação (ex: IP do cliente)
 * @param {number} maxRequests - Máximo de requisições por janela (default: 60)
 * @param {number} windowMs - Janela em ms (default: 60000 = 1 min)
 * @returns {{ allowed: boolean, remaining: number, resetIn: number }}
 */
const adminRateLimitMap = new Map();
const ADMIN_WINDOW_MS = 60 * 1000;
const ADMIN_MAX_REQUESTS = 60;

function checkAdminRateLimit(key, maxRequests = ADMIN_MAX_REQUESTS, windowMs = ADMIN_WINDOW_MS) {
  const now = Date.now();
  const prefixedKey = `admin:${key}`;

  let entry = adminRateLimitMap.get(prefixedKey);

  if (!entry || now - entry.windowStart > windowMs) {
    entry = { windowStart: now, count: 1 };
    adminRateLimitMap.set(prefixedKey, entry);
    if (adminRateLimitMap.size > 200) {
      for (const [k, v] of adminRateLimitMap) {
        if (now - v.windowStart > windowMs * 2) adminRateLimitMap.delete(k);
      }
    }
    return { allowed: true, remaining: maxRequests - 1, resetIn: windowMs };
  }

  entry.count++;

  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0, resetIn: windowMs - (now - entry.windowStart) };
  }

  return { allowed: true, remaining: maxRequests - entry.count, resetIn: windowMs - (now - entry.windowStart) };
}

module.exports = { checkRateLimit, checkAdminRateLimit };
