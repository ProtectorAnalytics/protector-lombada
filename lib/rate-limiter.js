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

module.exports = { checkRateLimit };
