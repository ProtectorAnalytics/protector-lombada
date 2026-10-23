/**
 * maiores-velocidades.js — card "Maiores velocidades · últimos 6 meses".
 *
 * O banco (maiores_velocidades) devolve um veículo por linha, já sem "SEM
 * PLACA", leitura de radar inválida e leitura suspeita. Aqui ficam a janela e
 * o clique: placa + dia do recorde viram filtro da lista naquele dia.
 *
 * Carregado no browser (window.maioresVelocidades) e no Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.maioresVelocidades = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const JANELA_DIAS = 180; // retenção do histórico de passagens (LGPD)
  const LIMITE = 10;
  const DIA_MS = 86400000;
  const RE_PLACA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;
  const RE_DIA = /^(\d{4})-(\d{2})-(\d{2})$/;

  /** @param {Date} [agora] @returns {string} ISO UTC do início da janela */
  function desdeIso(agora) {
    const t = (agora instanceof Date ? agora : new Date()).getTime();
    return new Date(t - JANELA_DIAS * DIA_MS).toISOString();
  }

  function diaLocal(iso) {
    const d = new Date(iso);
    const dois = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
  }

  /** "PLACA|AAAA-MM-DD" para o data-valor do botão do ranking */
  function valorDoClique(placa, passouEm) {
    return `${placa}|${diaLocal(passouEm)}`;
  }

  function diaValido(dia) {
    const m = RE_DIA.exec(dia);
    if (!m) return false;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.toISOString().slice(0, 10) === dia;
  }

  /**
   * data-valor → mudanças de filtro; valor fora do formato → null.
   * Limpa tudo que esconderia a passagem do recorde (câmera, só alertas,
   * não cadastrados, faixa de velocidade, dados do veículo).
   */
  function mudancaDoRecorde(valor) {
    const partes = typeof valor === 'string' ? valor.split('|') : [];
    if (partes.length !== 2) return null;
    const [placa, dia] = partes;
    if (!RE_PLACA.test(placa) || !diaValido(dia)) return null;
    return {
      placa, cameraId: '', soAlertas: false, naoCadastrados: false, tipoCadastro: '', unidade: '',
      velMin: 0, velMax: null,
      veiculo: { marca: '', modelo: '', cor: '', anoDe: null, anoAte: null },
      dataInicio: dia, horaInicio: '00:00', dataFim: dia, horaFim: '23:59',
    };
  }

  return { JANELA_DIAS, LIMITE, desdeIso, valorDoClique, mudancaDoRecorde };
});
