/**
 * Decide se o cron religa a consulta da APIPLACAS depois de uma recarga.
 *
 * Crédito zerado faz a APIPLACAS responder 402, que a plataforma trata como
 * token inválido e desliga as consultas (veiculos-base.js), gravando
 * atualizado_por = null para marcar que foi o sistema. Quando a leitura de
 * saldo volta a dar número positivo, a recarga caiu e o token está bom.
 * Desligamento feito por administrador (atualizado_por preenchido) nunca é
 * desfeito aqui.
 */
function deveReligar({ cfg, saldo, ultimoResultado }) {
  if (!cfg || cfg.ativo) return false;
  if (cfg.atualizado_por) return false;
  if (ultimoResultado !== 'token_invalido') return false;
  return typeof saldo === 'number' && saldo > 0;
}

module.exports = { deveReligar };
