/**
 * filtro-veiculo.js — filtros por dados do veículo (marca, modelo, cor, ano)
 * e exibição da cor no painel do síndico.
 *
 * O filtro consulta veiculos_base e devolve placas; as capturas são então
 * filtradas por `.in('placa', lista)`. A passagem pode estar gravada na grafia
 * antiga ou na Mercosul, então a lista leva as duas.
 *
 * Carregado no browser (window.filtroVeiculoLib) e no Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.filtroVeiculoLib = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ANO_MINIMO = 1950;
  // Acima disto a URL do `.in('placa', …)` (vírgulas viram %2C) passa de ~8 KB
  // no gateway: pedir refinamento. Conta grafias (placa e placa_antiga).
  const LIMITE_PLACAS_FILTRO = 400;
  // Páginas de leitura (max-rows do PostgREST) e teto de páginas por segurança
  const TAMANHO_PAGINA = 1000;
  const MAX_PAGINAS = 50;

  const CORES_HEX = Object.freeze({
    branco: '#f5f5f5', prata: '#c0c4c8', cinza: '#8a8f96', preto: '#1f2328',
    vermelho: '#c62828', azul: '#1e5bb8', verde: '#2e7d32', amarelo: '#f2c200',
    laranja: '#ef6c00', marrom: '#6d4c41', bege: '#d8c3a0', dourado: '#c9a227',
    vinho: '#7b1f2b', rosa: '#e91e63', roxo: '#6a1b9a',
  });

  const texto = (v) => (v === null || v === undefined ? '' : String(v).trim());

  /** @returns {boolean} */
  function temFiltroVeiculo(f) {
    if (!f) return false;
    return Boolean(f.marca || f.modelo || f.cor || f.anoDe || f.anoAte);
  }

  /** Placas nas duas grafias (placa e placa_antiga), maiúsculas, sem duplicatas. */
  function placasParaFiltro(linhas) {
    const vistas = new Set();
    (linhas || []).forEach((l) => {
      if (!l) return;
      [l.placa, l.placa_antiga].forEach((p) => {
        const s = texto(p).toUpperCase();
        if (s) vistas.add(s);
      });
    });
    return [...vistas];
  }

  /** Inteiro entre 1950 e anoAtual + 1; qualquer outra coisa → null. */
  function normalizarAno(v, anoAtual) {
    const s = texto(v);
    if (!/^\d{4}$/.test(s)) return null;
    const n = Number(s);
    const teto = (anoAtual || new Date().getFullYear()) + 1;
    return n >= ANO_MINIMO && n <= teto ? n : null;
  }

  /** Termo de modelo seguro para `.or(modelo.ilike.*x*,…)`: sem , ( ) * " \. */
  function termoModelo(v) {
    return texto(v).replace(/[,()*"\\]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /** Campos do formulário → parâmetros do filtro (anos invertidos são trocados). */
  function montarFiltroVeiculo(campos, anoAtual) {
    const c = campos || {};
    let anoDe = normalizarAno(c.anoDe, anoAtual);
    let anoAte = normalizarAno(c.anoAte, anoAtual);
    if (anoDe && anoAte && anoDe > anoAte) [anoDe, anoAte] = [anoAte, anoDe];
    return {
      marca: texto(c.marca),
      modelo: termoModelo(c.modelo),
      cor: texto(c.cor).toLowerCase(),
      anoDe,
      anoAte,
    };
  }

  /** Valores distintos e não vazios de um campo, em ordem alfabética pt-BR. */
  function opcoesDistintas(linhas, campo) {
    const set = new Set();
    (linhas || []).forEach((l) => {
      const s = texto(l && l[campo]);
      if (s) set.add(s);
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  /**
   * Lê todas as linhas página a página. buscarPagina(de, ate) devolve
   * { data, error } (ex.: query.range(de, ate)). Erro lança: lista parcial
   * esconderia marcas/cores sem aviso.
   */
  async function coletarPaginado(buscarPagina, maxPaginas = MAX_PAGINAS) {
    let linhas = [];
    for (let p = 0; p < maxPaginas; p++) {
      const de = p * TAMANHO_PAGINA;
      const { data, error } = await buscarPagina(de, de + TAMANHO_PAGINA - 1);
      if (error || !data) throw new Error('falha ao ler página ' + p);
      linhas = linhas.concat(data);
      if (data.length < TAMANHO_PAGINA) break;
    }
    return linhas;
  }

  /** "BRANCA" → "Branca". */
  function corExibicao(cor) {
    const s = texto(cor).toLowerCase();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }

  /** Hex da bolinha para a cor normalizada; desconhecida → null. */
  function corHex(corNormalizada) {
    const k = texto(corNormalizada).toLowerCase();
    return Object.prototype.hasOwnProperty.call(CORES_HEX, k) ? CORES_HEX[k] : null;
  }

  return {
    temFiltroVeiculo, placasParaFiltro, normalizarAno, termoModelo,
    montarFiltroVeiculo, opcoesDistintas, corExibicao, corHex, coletarPaginado,
    LIMITE_PLACAS_FILTRO, TAMANHO_PAGINA, ANO_MINIMO,
  };
});
