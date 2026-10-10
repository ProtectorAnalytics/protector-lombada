/**
 * Repetição da mesma placa na mesma câmera.
 *
 * Quando o carro para ou anda devagar na lombada, a câmera cruza a linha de
 * disparo duas vezes e manda dois eventos (vehicleId diferentes, então o
 * dedupe de retransmissão não pega). Medido em 15 dias: 56 repetições, até
 * ~21 s entre elas; a segunda quase sempre vem sem velocidade ou menor.
 *
 * A placa da repetição nem sempre sai igual: o OCR troca 1 ou 2 caracteres
 * entre uma leitura e outra. Medido no Praia Bella (10/10/2026): um Fox leu
 * NTH0645 → NTM0C45 → NTM0646 em 24 s e um SUV IMW1C73 → THW1C73 em 11 s,
 * cada leitura virando uma passagem. Por isso a repetição vale para placas
 * com até MAX_CARACTERES_DIFERENTES de diferença (na grafia Mercosul).
 *
 * Regra: vale a primeira medida. Se a primeira veio sem velocidade e a
 * repetição trouxe uma, a repetição SUBSTITUI a primeira (fica uma passagem
 * só, com a medição).
 */
const { paraMercosul } = require('../site/js/placa');

const JANELA_SEGUNDOS = 20;
const MAX_CARACTERES_DIFERENTES = 2;

function temVelocidade(c) {
  return Boolean(c) && Number(c.velocidade) > 0 && !c.velocidadeInvalida && !c.velocidade_invalida;
}

/**
 * @param {{velocidade:number, velocidade_invalida?:boolean}|null} anterior passagem repetida na janela
 * @param {{velocidade:number, velocidadeInvalida?:boolean}} nova
 * @returns {'gravar'|'descartar'|'substituir'}
 */
function decidirRepeticao(anterior, nova) {
  if (!anterior) return 'gravar';
  if (!temVelocidade(anterior) && temVelocidade(nova)) return 'substituir';
  return 'descartar';
}

/** Placa na grafia de comparação; null para "Sem Placa" e textos que não são placa. */
function placaParaRepeticao(placa) {
  return paraMercosul(placa || '') || null;
}

/** Quantos caracteres diferem entre duas placas (grafia Mercosul); null se alguma não for placa. */
function caracteresDiferentes(a, b) {
  const x = placaParaRepeticao(a);
  const y = placaParaRepeticao(b);
  if (!x || !y) return null;
  let dif = 0;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) dif++;
  return dif;
}

function ehMesmaLeitura(a, b) {
  const dif = caracteresDiferentes(a, b);
  return dif !== null && dif <= MAX_CARACTERES_DIFERENTES;
}

/**
 * Passagem repetida entre as recentes da câmera (mais nova primeiro).
 * @param {Array<{placa:string}>} recentes
 * @param {string} placa
 */
function acharRepeticao(recentes, placa) {
  return (recentes || []).find((c) => ehMesmaLeitura(c.placa, placa)) || null;
}

module.exports = {
  decidirRepeticao,
  placaParaRepeticao,
  caracteresDiferentes,
  ehMesmaLeitura,
  acharRepeticao,
  JANELA_SEGUNDOS,
  MAX_CARACTERES_DIFERENTES,
};
