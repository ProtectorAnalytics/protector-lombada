/**
 * leitor-placa.js — regras puras do leitor de placa no aparelho: decodifica a
 * saída do modelo (fast-plate-ocr, [1,10,37]), corrige confusões letra/número
 * por posição e só libera a placa após leituras iguais seguidas.
 *
 * Nada aqui toca no DOM nem na imagem. Carregado no browser
 * (window.leitorPlacaLib) e no Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.leitorPlacaLib = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ALFABETO = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_';
  const VAZIO = '_';
  const CONF_MIN = 0.55;
  const LEITURAS_IGUAIS = 3;
  const RE_PLACA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

  // Posições 1–3 (letras): número que parece letra. Posições 4, 6 e 7 (números): o inverso.
  const NUM_PARA_LETRA = Object.freeze({ 0: 'O', 1: 'I', 2: 'Z', 4: 'A', 5: 'S', 6: 'G', 7: 'T', 8: 'B' });
  const LETRA_PARA_NUM = Object.freeze({
    O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', A: '4', S: '5', G: '6', T: '7', B: '8',
  });
  const POS_LETRA = [0, 1, 2];
  const POS_NUMERO = [3, 5, 6];

  /** Argmax por posição até o primeiro "_"; confiança = menor probabilidade escolhida. */
  function decodificar(probs, slots = 10) {
    const n = ALFABETO.length;
    let texto = '';
    let confianca = 1;
    for (let i = 0; i < slots; i++) {
      let melhor = 0;
      for (let j = 1; j < n; j++) {
        if (probs[i * n + j] > probs[i * n + melhor]) melhor = j;
      }
      const c = ALFABETO[melhor];
      if (c === VAZIO) break;
      texto += c;
      confianca = Math.min(confianca, probs[i * n + melhor]);
    }
    return { texto, confianca: texto ? confianca : 0 };
  }

  /** Corrige letra/número por posição; só age em texto de 7 caracteres. */
  function corrigirPorPosicao(texto) {
    if (typeof texto !== 'string' || texto.length !== 7) return texto;
    return Array.from(texto, (c, i) => {
      if (POS_LETRA.includes(i)) return NUM_PARA_LETRA[c] || c;
      if (POS_NUMERO.includes(i)) return LETRA_PARA_NUM[c] || c;
      return c;
    }).join('');
  }

  function placaValida(texto) {
    return typeof texto === 'string' && RE_PLACA.test(texto);
  }

  /** Libera a placa quando as últimas `n` leituras válidas e confiáveis são iguais. */
  function criarEstabilizador(n = LEITURAS_IGUAIS) {
    let ultima = null;
    let seguidas = 0;
    const zerar = () => { ultima = null; seguidas = 0; };
    function registrar(leitura) {
      const texto = corrigirPorPosicao(leitura && leitura.texto);
      if (!placaValida(texto) || !(leitura.confianca >= CONF_MIN)) {
        zerar();
        return null;
      }
      seguidas = texto === ultima ? seguidas + 1 : 1;
      ultima = texto;
      if (seguidas < n) return null;
      zerar();
      return texto;
    }
    return { registrar, zerar };
  }

  return { ALFABETO, CONF_MIN, LEITURAS_IGUAIS, decodificar, corrigirPorPosicao, placaValida, criarEstabilizador };
});
