/**
 * sugestao-nomes.js — sugere nomes de moradores a partir dos vínculos
 * (vigentes e histórico) da mesma unidade, para o cadastro rápido da portaria.
 *
 * Nada aqui toca no DOM. Carregado no browser (window.sugestaoNomesLib) e no
 * Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.sugestaoNomesLib = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const LIMITE_PADRAO = 8;

  // Sem acento, sem maiúsculas, espaços colapsados: chave de comparação de nomes.
  const normalizar = (s) =>
    String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

  const tempo = (v) => {
    const t = Date.parse(v);
    return Number.isNaN(t) ? 0 : t;
  };

  const ehVigente = (v) => v.encerrado_em === null || v.encerrado_em === undefined || v.encerrado_em === '';

  function daUnidade(v, unidadeId, unidadeNome) {
    if (v.unidade_id) return Boolean(unidadeId) && v.unidade_id === unidadeId;
    // Legado sem unidade_id: compara o texto da unidade.
    const alvo = normalizar(unidadeNome);
    return Boolean(alvo) && normalizar(v.unidade) === alvo;
  }

  /** Nomes da unidade, sem repetir, mais recentes primeiro (vigente vence o empate). */
  function sugerirNomes(vinculos, { unidadeId, unidadeNome } = {}, limite = LIMITE_PADRAO) {
    const candidatos = (vinculos || [])
      .filter((v) => v && normalizar(v.nome_morador) && daUnidade(v, unidadeId, unidadeNome))
      .sort((a, b) => tempo(b.criado_em) - tempo(a.criado_em) || Number(ehVigente(b)) - Number(ehVigente(a)));
    const vistos = new Set();
    const nomes = [];
    for (const v of candidatos) {
      const chave = normalizar(v.nome_morador);
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      nomes.push(String(v.nome_morador).trim());
      if (nomes.length >= limite) break;
    }
    return nomes;
  }

  return { sugerirNomes };
});
