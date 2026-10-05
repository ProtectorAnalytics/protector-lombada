/**
 * barra-filtros.js — regras puras da barra de filtros do painel do síndico:
 * rótulo do período, chips dos filtros ativos, busca tipada (sugestões e
 * decisão do Enter), texto do resultado e o critério "não cadastrados".
 *
 * Tudo lê o estado único de estado-filtros.js; nada aqui toca no DOM.
 *
 * Carregado no browser (window.barraFiltrosLib, depois de placa.js,
 * filtro-veiculo.js e estado-filtros.js) e no Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./estado-filtros'), require('./filtro-veiculo'), require('./placa'));
  } else {
    root.barraFiltrosLib = factory(root.estadoFiltrosLib, root.filtroVeiculoLib, root.placaLib);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (estado, filtroVeiculo, placaLib) {
  'use strict';
  const SUGESTOES_MAX = 8;
  const BUSCA_MIN = 2;
  const ROTULO_ATALHO = Object.freeze({ hoje: 'Hoje', ontem: 'Ontem', '7d': 'Últimos 7 dias' });

  const texto = (v) => (v === null || v === undefined ? '' : String(v).trim());
  // Comparação sem maiúsculas nem acentos ("CITROËN" ~ "citroen")
  const dobrar = (v) => texto(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const ddmm = (data) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;

  /** "Hoje", "Ontem", "Últimos 7 dias", "05/10 08:00 – 06/10 18:00" ou "01/10 – 03/10". */
  function rotuloDoPeriodo(f, hoje) {
    const atalho = estado.atalhoDoPeriodo(f, hoje);
    if (atalho) return ROTULO_ATALHO[atalho];
    const diasInteiros = f.horaInicio === '00:00' && f.horaFim === '23:59';
    if (diasInteiros) {
      return f.dataInicio === f.dataFim ? ddmm(f.dataInicio) : `${ddmm(f.dataInicio)} – ${ddmm(f.dataFim)}`;
    }
    return `${ddmm(f.dataInicio)} ${f.horaInicio} – ${ddmm(f.dataFim)} ${f.horaFim}`;
  }

  function faixa(de, ate, prefixo, sufixo) {
    const s = sufixo || '';
    if (de && ate) return `${prefixo} ${de}–${ate}${s}`;
    if (de) return `${prefixo} a partir de ${de}${s}`;
    return `${prefixo} até ${ate}${s}`;
  }

  /**
   * Um chip por filtro diferente do padrão, na ordem da barra.
   * @param {object} opts nomeCamera(id) → nome; nomeCor(cor) → nome legível
   * @returns {{chave: string, rotulo: string}[]}
   */
  function chipsDosFiltros(f, hoje, opts) {
    const o = opts || {};
    const nomeCor = o.nomeCor || filtroVeiculo.corExibicao;
    const nomeCamera = o.nomeCamera || (() => '');
    const v = f.veiculo || {};
    const chips = [];
    const add = (chave, rotulo) => chips.push({ chave, rotulo });
    if (estado.atalhoDoPeriodo(f, hoje) !== 'hoje') add('periodo', rotuloDoPeriodo(f, hoje));
    if (f.cameraId) add('camera', `Câmera: ${nomeCamera(f.cameraId) || f.cameraId}`);
    if (f.soAlertas) add('alerta', 'Acima do limite');
    if (f.naoCadastrados) add('naoCadastrados', 'Não cadastrados');
    if (f.placa) add('placa', `Placa contém ${f.placa}`);
    if (v.marca) add('marca', `Marca: ${v.marca}`);
    if (v.modelo) add('modelo', `Modelo: ${v.modelo}`);
    if (v.cor) add('cor', `Cor: ${nomeCor(v.cor)}`);
    if (v.anoDe || v.anoAte) add('ano', faixa(v.anoDe, v.anoAte, 'Ano'));
    if (f.velMin > 0 || f.velMax) add('velocidade', faixa(f.velMin || null, f.velMax, 'Velocidade', ' km/h'));
    return chips;
  }

  /** Enter sem escolher sugestão: com dígito → placa contém; senão → modelo contém. */
  function decidirEnter(termo) {
    const t = texto(termo);
    if (!t) return null;
    if (/\d/.test(t)) {
      const placa = estado.normalizarPlacaBusca(t);
      return placa ? { tipo: 'placa', valor: placa } : null;
    }
    const modelo = filtroVeiculo.termoModelo(t);
    return modelo ? { tipo: 'modelo', valor: modelo } : null;
  }

  // Quem começa com o termo vem antes de quem só o contém; sem duplicatas
  function casar(lista, termo, chave, limite) {
    const vistos = new Set();
    const prefixo = [];
    const meio = [];
    (lista || []).forEach((item) => {
      const k = chave(item);
      const i = k.indexOf(termo);
      if (!k || i < 0 || vistos.has(k)) return;
      vistos.add(k);
      (i === 0 ? prefixo : meio).push(item);
    });
    return prefixo.concat(meio).slice(0, limite);
  }

  /**
   * Sugestões da busca tipada, em grupos (Placas, Modelos, Marcas). Grupos
   * vazios ficam de fora. Placas comparam sem hífen; textos sem acento.
   */
  function sugestoesBusca(termo, fontes, limite) {
    const max = limite || SUGESTOES_MAX;
    const t = texto(termo);
    if (t.length < BUSCA_MIN) return [];
    const f = fontes || {};
    const tPlaca = placaLib.limpar(t);
    const tTexto = dobrar(t);
    const placas = tPlaca.length >= BUSCA_MIN
      ? casar((f.placas || []).map((p) => placaLib.limpar(p)), tPlaca, (p) => p, max) : [];
    const grupos = [
      { tipo: 'placa', titulo: 'Placas', itens: placas },
      { tipo: 'modelo', titulo: 'Modelos', itens: casar(f.modelos, tTexto, dobrar, max) },
      { tipo: 'marca', titulo: 'Marcas', itens: casar(f.marcas, tTexto, dobrar, max) },
    ];
    return grupos.filter((g) => g.itens.length);
  }

  /** Anúncio do resultado: "Nenhuma passagem", "1 passagem", "36 passagens". */
  function textoResultado(n) {
    if (!n) return 'Nenhuma passagem';
    return n === 1 ? '1 passagem' : `${n} passagens`;
  }

  // Mesma placa nas duas grafias (antiga/Mercosul) vira a mesma chave
  const chavePlaca = (p) => placaLib.paraMercosul(p) || placaLib.limpar(p);

  /** Placas do cadastro de moradores, nas duas grafias. */
  function conjuntoCadastradas(placas) {
    return new Set((placas || []).map(chavePlaca).filter(Boolean));
  }

  /** Só as passagens cuja placa não está no cadastro (lista nova). */
  function filtrarNaoCadastradas(linhas, cadastradas) {
    return (linhas || []).filter((l) => !cadastradas.has(chavePlaca(l && l.placa)));
  }

  return {
    rotuloDoPeriodo, chipsDosFiltros, decidirEnter, sugestoesBusca, textoResultado,
    conjuntoCadastradas, filtrarNaoCadastradas, SUGESTOES_MAX, BUSCA_MIN,
  };
});
