/**
 * Autorização dos crons: SOMENTE `Authorization: Bearer ${CRON_SECRET}`.
 *
 * O Vercel Cron envia esse header quando CRON_SECRET está definido. O header
 * `x-vercel-cron-signature` NÃO é aceito: qualquer pessoa consegue mandá-lo.
 * Sem segredo configurado, recusa tudo.
 */
const crypto = require('crypto');

// Comparação em tempo constante; tamanhos diferentes recusam sem comparar.
function autorizado(header, segredo) {
  if (!segredo || typeof header !== 'string') return false;
  const recebido = Buffer.from(header);
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return recebido.length === esperado.length && crypto.timingSafeEqual(recebido, esperado);
}

/** true se a requisição pode rodar o cron; senão já respondeu 401. */
function exigirCron(req, res) {
  if (autorizado(req.headers.authorization, process.env.CRON_SECRET)) return true;
  res.status(401).json({ error: 'Não autorizado' });
  return false;
}

module.exports = { autorizado, exigirCron };
