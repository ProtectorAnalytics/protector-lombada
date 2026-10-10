/**
 * Mesmo evento de captura (mesmo vehicleId na mesma câmera).
 *
 * Dois casos chegam com o vehicleId repetido:
 *
 * 1. Retransmissão: a câmera reenvia o evento quando não recebe resposta no
 *    timeout dela (até 100 s). Ver sql/migration-vehicle-id-dedupe.sql.
 * 2. Veículo parado no quadro: o carro estaciona no campo da câmera e ela
 *    reenvia o MESMO evento a cada ~10 min enquanto ele não sai. Medido no
 *    Praia Bella (09–10/10/2026): SJW0G75, vehicleId 8070, 79 capturas em
 *    15 h, intervalos de 10,0 a 26 min, todas a 0 km/h. Inflava o card de
 *    passagens e ficava em 1º no Top 10 sem nunca ter passado.
 *
 * O vehicleId é um contador que reinicia no boot da câmera, então no caso 2
 * só é o mesmo carro se a placa também for a mesma. "Sem placa" não confirma
 * nada e é gravada. Vale a regra de repetição: se a primeira leitura veio sem
 * velocidade e a nova trouxe uma, grava (não perder a medição).
 */
const { decidirRepeticao, placaParaRepeticao } = require('./repeticao-placa');

const JANELA_RETRANSMISSAO_MINUTOS = 10;
const JANELA_PARADO_MINUTOS = 24 * 60;

/**
 * @param {{placa:string, velocidade:number, velocidade_invalida?:boolean, timestamp:string}|null} anterior
 *   última captura gravada com o mesmo vehicleId na mesma câmera (janela de parado)
 * @param {{placa:string, velocidade:number, velocidadeInvalida?:boolean}} nova
 * @param {number} agora epoch em ms
 * @returns {'gravar'|'retransmissao'|'parado'}
 */
function decidirMesmoEvento(anterior, nova, agora) {
  if (!anterior) return 'gravar';

  const idadeMinutos = (agora - Date.parse(anterior.timestamp)) / 60000;
  if (idadeMinutos <= JANELA_RETRANSMISSAO_MINUTOS) return 'retransmissao';
  if (idadeMinutos > JANELA_PARADO_MINUTOS) return 'gravar';

  const placaAnterior = placaParaRepeticao(anterior.placa);
  if (!placaAnterior || placaAnterior !== placaParaRepeticao(nova.placa)) return 'gravar';

  return decidirRepeticao(anterior, nova) === 'descartar' ? 'parado' : 'gravar';
}

module.exports = { decidirMesmoEvento, JANELA_RETRANSMISSAO_MINUTOS, JANELA_PARADO_MINUTOS };
