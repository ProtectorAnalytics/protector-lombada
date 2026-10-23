/**
 * sem-cadastro.js — regra da lista "Passaram sem cadastro": placas válidas
 * capturadas que não tinham vínculo na hora da passagem mais recente.
 *
 * Nada aqui toca no DOM. Carregado no browser (window.semCadastroLib, depois
 * de placa.js e vinculo-placa.js) e no Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./placa'), require('./vinculo-placa'));
  } else {
    root.semCadastroLib = factory(root.placaLib, root.vinculoPlacaLib);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (placaLib, vinculoLib) {
  'use strict';

  const LIMITE_PADRAO = 50;

  const tempo = (v) => {
    const t = Date.parse(v);
    return Number.isNaN(t) ? 0 : t;
  };

  /** Agrupa capturas de placas válidas por chave Mercosul, guardando a mais recente. */
  function agruparPorPlaca(capturas) {
    const grupos = new Map();
    for (const c of capturas || []) {
      const limpa = placaLib.limpar(c && c.placa);
      if (!placaLib.ehPlaca(limpa)) continue;
      const chave = placaLib.paraMercosul(limpa);
      const g = grupos.get(chave);
      if (!g) {
        grupos.set(chave, { placa: chave, ultima: c, passagens: 1 });
      } else {
        g.passagens += 1;
        if (tempo(c.timestamp) > tempo(g.ultima.timestamp)) g.ultima = c;
      }
    }
    return grupos;
  }

  /**
   * Placas sem vínculo na hora da última passagem, sem vínculo vigente hoje
   * (cadastro recém-feito sai da lista na hora) e fora das suspeitas, mais
   * recentes primeiro.
   */
  function listarSemCadastro(capturas, indiceVinculos, { suspeitas } = {}, limite = LIMITE_PADRAO) {
    const fora = suspeitas || new Set();
    return Array.from(agruparPorPlaca(capturas).values())
      .filter((g) => !fora.has(g.placa)
        && !vinculoLib.vinculoNaHora(indiceVinculos, g.placa, g.ultima.timestamp)
        && !vinculoLib.vinculoVigente(indiceVinculos, g.placa))
      .sort((a, b) => tempo(b.ultima.timestamp) - tempo(a.ultima.timestamp))
      .slice(0, limite);
  }

  return { listarSemCadastro };
});
