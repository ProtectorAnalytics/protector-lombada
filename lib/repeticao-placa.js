/**
 * Repetição da mesma placa na mesma câmera.
 *
 * Quando o carro para ou anda devagar na lombada, a câmera cruza a linha de
 * disparo duas vezes e manda dois eventos (vehicleId diferentes, então o
 * dedupe de retransmissão não pega). Medido em 15 dias: 56 repetições, até
 * ~21 s entre elas; a segunda quase sempre vem sem velocidade ou menor.
 *
 * Regra: vale a primeira medida. A repetição só é gravada quando a primeira
 * veio sem velocidade e a repetição trouxe uma (não perder a medição).
 */
const { paraMercosul } = require('../site/js/placa');

const JANELA_SEGUNDOS = 20;

function temVelocidade(c) {
  return Boolean(c) && Number(c.velocidade) > 0 && !c.velocidadeInvalida && !c.velocidade_invalida;
}

/**
 * @param {{velocidade:number, velocidade_invalida?:boolean}|null} anterior passagem da mesma placa na janela
 * @param {{velocidade:number, velocidadeInvalida?:boolean}} nova
 * @returns {'gravar'|'descartar'}
 */
function decidirRepeticao(anterior, nova) {
  if (!anterior) return 'gravar';
  if (!temVelocidade(anterior) && temVelocidade(nova)) return 'gravar';
  return 'descartar';
}

/** Placa na grafia de comparação; null para "Sem Placa" e textos que não são placa. */
function placaParaRepeticao(placa) {
  return paraMercosul(placa || '') || null;
}

module.exports = { decidirRepeticao, placaParaRepeticao, JANELA_SEGUNDOS };
