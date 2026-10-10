/**
 * placa.js — fonte única das regras de placa (antiga x Mercosul).
 *
 * Carregado no browser (window.placaLib) e no Node (require). A base de
 * veículos usa a forma Mercosul como chave: a mesma placa nas duas grafias é
 * o mesmo carro e não pode ser consultada (paga) duas vezes.
 *
 * Conversão oficial: na 5ª posição, dígito 0–9 da antiga ↔ letra A–J da
 * Mercosul. Mercosul com K–Z na 5ª posição não tem forma antiga.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.placaLib = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const LETRAS_5A = 'ABCDEFGHIJ';
  const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const DIGITOS = '0123456789';
  const RE_ANTIGA = /^[A-Z]{3}\d{4}$/;
  const RE_MERCOSUL = /^[A-Z]{3}\d[A-Z]\d{2}$/;

  function limpar(p) {
    return String(p || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  }

  function paraMercosul(p) {
    const s = limpar(p);
    if (RE_MERCOSUL.test(s)) return s;
    if (RE_ANTIGA.test(s)) return s.slice(0, 4) + LETRAS_5A[Number(s[4])] + s.slice(5);
    return null;
  }

  function paraAntiga(p) {
    const m = paraMercosul(p);
    if (!m) return null;
    const i = LETRAS_5A.indexOf(m[4]);
    return i < 0 ? null : m.slice(0, 4) + i + m.slice(5);
  }

  function difereEmUm(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    let dif = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) dif++;
    return dif === 1;
  }

  // Posições 1–3 letras, 4/6/7 dígitos, 5ª letra (Mercosul)
  const OPCOES = [ALFABETO, ALFABETO, ALFABETO, DIGITOS, ALFABETO, DIGITOS, DIGITOS];

  function variantes(p) {
    const m = paraMercosul(p);
    if (!m) return [];
    const mesma = new Set([m, paraAntiga(m)]);
    const out = new Set();
    OPCOES.forEach((opcoes, i) => {
      for (const ch of opcoes) {
        if (ch === m[i]) continue;
        const v = m.slice(0, i) + ch + m.slice(i + 1);
        out.add(v);
        const antiga = paraAntiga(v);
        if (antiga) out.add(antiga);
      }
    });
    mesma.forEach((x) => out.delete(x));
    return [...out];
  }

  /**
   * É uma placa de verdade? "SEM PLACA" (a câmera não leu) e leituras
   * parciais não identificam veículo: ficam fora de ranking e contagens.
   */
  function ehPlaca(placa) {
    return paraMercosul(placa || '') !== null;
  }

  return { limpar, paraMercosul, paraAntiga, difereEmUm, variantes, ehPlaca };
});
