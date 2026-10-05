/**
 * severidade-velocidade.js — escala única de severidade da velocidade no
 * painel do síndico: até o limite = ok (verde); acima do limite = alerta
 * (vermelho). Sem faixa intermediária: tabela, cartões, Top 10, detalhe e
 * KPI dizem a mesma coisa para a mesma passagem.
 *
 * Nada aqui toca no DOM. Carregado no browser (window.severidadeVelocidadeLib)
 * e no Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.severidadeVelocidadeLib = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const numeroValido = (v) => typeof v === 'number' && Number.isFinite(v);

  /** O radar mediu a passagem (velocidade 0 = sem radar). */
  function velocidadeMedida(vel) {
    return numeroValido(vel) && vel > 0;
  }

  /** Passagem medida acima do limite configurado. Sem limite válido, nunca é alerta. */
  function acimaDoLimite(vel, limite) {
    return velocidadeMedida(vel) && numeroValido(limite) && vel > limite;
  }

  /** Classe CSS da velocidade: 'unknown' (sem radar), 'green' (ok) ou 'red' (alerta). */
  function classeVelocidade(vel, limite) {
    if (!velocidadeMedida(vel)) return 'unknown';
    return acimaDoLimite(vel, limite) ? 'red' : 'green';
  }

  return Object.freeze({ velocidadeMedida, acimaDoLimite, classeVelocidade });
});
