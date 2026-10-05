/**
 * nome-veiculo.js — regra única do nome do veículo (painel e PDF).
 *
 * A APIPLACAS às vezes já traz a versão dentro do modelo (ou o modelo dentro
 * da versão). Para não repetir texto: versão que começa com o modelo → só a
 * versão; modelo que contém a versão → só o modelo; senão "modelo versão".
 * Sempre prefixado pela marca.
 *
 * Carregado no browser (window.nomeVeiculoLib) e no Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.nomeVeiculoLib = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function nomeVeiculo(vb) {
    const modelo = String((vb && vb.modelo) || '').trim();
    const versao = String((vb && vb.versao) || '').trim();
    const m = modelo.toLowerCase();
    const v = versao.toLowerCase();
    let nome;
    if (!versao) nome = modelo;
    else if (!modelo) nome = versao;
    else if (v.startsWith(m)) nome = versao;
    else if (m.includes(v)) nome = modelo;
    else nome = `${modelo} ${versao}`;
    return [vb && vb.marca, nome].filter(Boolean).join(' ');
  }

  /** Linha "Veículo: …" com dado da APIPLACAS; null sem dado consultado. */
  function linhaVeiculo(vb) {
    if (!vb || vb.status !== 'consultado' || !vb.marca) return null;
    return 'Veículo: ' + [nomeVeiculo(vb), vb.cor, vb.ano_modelo].filter(Boolean).join(' · ');
  }

  return { nomeVeiculo, linhaVeiculo };
});
