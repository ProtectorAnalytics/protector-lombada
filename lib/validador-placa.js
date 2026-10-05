/**
 * Validador gratuito antes de pagar uma consulta.
 *
 * Erro de leitura típico: um carro que passa todo dia vira, numa passagem, uma
 * placa com 1 caractere trocado (B→8, O→0). Essa "placa nova" custaria uma
 * consulta e traria o carro de um desconhecido. Medido em 30 dias: ~21% das
 * placas vistas uma só vez são assim.
 *
 * A vizinha só torna a placa suspeita se for MUITO mais frequente que ela
 * (FATOR_VIZINHA vezes): o erro de leitura de um carro frequente também se
 * repete algumas vezes, e sem essa comparação a placa real era marcada como
 * leitura errada da própria leitura errada (visto em 05/10/2026: 37 × 4).
 *
 * Falha na contagem nunca bloqueia: na dúvida, consulta.
 */
const { variantes, paraMercosul, paraAntiga } = require('../site/js/placa');

const MINIMO_PASSAGENS = 3;
const FATOR_VIZINHA = 3;
const JANELA_DIAS = 30;

function criarValidador({ contarPassagens, agora = () => new Date() }) {
  async function avaliar({ placa, clienteId }) {
    const vizinhas = variantes(placa);
    if (!vizinhas.length) return { suspeita: false };
    const propria = paraMercosul(placa);
    const grafiasProprias = [propria, paraAntiga(propria)].filter(Boolean);
    const desde = new Date(agora().getTime() - JANELA_DIAS * 86400000).toISOString();
    let contagens;
    try {
      contagens = await contarPassagens(clienteId, [...grafiasProprias, ...vizinhas], desde);
    } catch {
      return { suspeita: false };
    }
    // Soma as duas grafias de cada placa (a própria e as vizinhas)
    const porMercosul = {};
    for (const [p, n] of Object.entries(contagens || {})) {
      const m = paraMercosul(p);
      if (m) porMercosul[m] = (porMercosul[m] || 0) + n;
    }
    const daPropria = porMercosul[propria] || 0;
    delete porMercosul[propria];
    const [de, n] = Object.entries(porMercosul).sort((a, b) => b[1] - a[1])[0] || [];
    const suspeita = n >= MINIMO_PASSAGENS && n >= FATOR_VIZINHA * daPropria;
    return suspeita ? { suspeita: true, de } : { suspeita: false };
  }
  return { avaliar };
}

module.exports = { criarValidador, MINIMO_PASSAGENS, FATOR_VIZINHA, JANELA_DIAS };
