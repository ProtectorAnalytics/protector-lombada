/**
 * selo-veiculo.js — decide o que o painel mostra sobre a base de veículos.
 *
 * "consultando…" só faz sentido logo depois da passagem: com o serviço
 * desligado, sem saldo ou no teto, a linha fica 'pendente' sem prazo, e
 * 'erro' pode durar até 24 h. Fora da janela, mostrar nada (= sem dados).
 * Suspeita só aparece quando a API confirmou que é deste condomínio.
 *
 * Carregado no browser (window.seloVeiculoLib) e no Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.seloVeiculoLib = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const JANELA_CONSULTANDO_MS = 10 * 60 * 1000;

  /** @returns {'consultado'|'consultando'|'suspeita'|null} */
  function estadoSelo({ status, temSuspeitaPropria, capturaTs, agora } = {}) {
    if (status === 'consultado') return 'consultado';
    if (status === 'suspeita') return temSuspeitaPropria ? 'suspeita' : null;
    if (status !== 'pendente') return null; // 'erro' e desconhecidos = sem dados
    const t = capturaTs ? new Date(capturaTs).getTime() : NaN;
    const ref = agora === undefined ? Date.now() : new Date(agora).getTime();
    if (!Number.isFinite(t) || !Number.isFinite(ref)) return null;
    const idade = ref - t;
    // tolera relógio da câmera um pouco adiantado (mesma janela para trás)
    return Math.abs(idade) < JANELA_CONSULTANDO_MS ? 'consultando' : null;
  }

  return { estadoSelo, JANELA_CONSULTANDO_MS };
});
