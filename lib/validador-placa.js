/**
 * Validador gratuito antes de pagar uma consulta.
 *
 * Erro de leitura típico: um carro que passa todo dia vira, numa passagem, uma
 * placa com 1 caractere trocado (B→8, O→0). Essa "placa nova" custaria uma
 * consulta e traria o carro de um desconhecido. Medido em 30 dias: ~21% das
 * placas vistas uma só vez são assim.
 *
 * Falha na contagem nunca bloqueia: na dúvida, consulta.
 */
const { variantes, paraMercosul } = require('../site/js/placa');

const MINIMO_PASSAGENS = 3;
const JANELA_DIAS = 30;

function criarValidador({ contarPassagens, agora = () => new Date() }) {
  async function avaliar({ placa, clienteId }) {
    const vizinhas = variantes(placa);
    if (!vizinhas.length) return { suspeita: false };
    const desde = new Date(agora().getTime() - JANELA_DIAS * 86400000).toISOString();
    let contagens;
    try {
      contagens = await contarPassagens(clienteId, vizinhas, desde);
    } catch {
      return { suspeita: false };
    }
    // Soma as duas grafias de cada vizinha antes de comparar com o mínimo
    const porMercosul = {};
    for (const [p, n] of Object.entries(contagens || {})) {
      const m = paraMercosul(p);
      if (m) porMercosul[m] = (porMercosul[m] || 0) + n;
    }
    const [de, n] = Object.entries(porMercosul).sort((a, b) => b[1] - a[1])[0] || [];
    return n >= MINIMO_PASSAGENS ? { suspeita: true, de } : { suspeita: false };
  }
  return { avaliar };
}

module.exports = { criarValidador, MINIMO_PASSAGENS, JANELA_DIAS };
