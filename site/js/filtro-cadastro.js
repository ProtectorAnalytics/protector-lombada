/**
 * filtro-cadastro.js — filtros por tipo de cadastro (morador, proprietário,
 * visitante, prestador, sem cadastro) e por unidade no painel do síndico.
 *
 * Regra: vale o que a coluna "Cadastro" mostra, ou seja, o vínculo da placa
 * NA HORA DA PASSAGEM (vinculoNaHora), não o de hoje.
 *
 * Como a consulta fica exata e leve:
 *  1. janelasDoFiltro: com os vínculos (já carregados no painel) calcula, para
 *     cada placa, os trechos do período em que o vínculo da hora atende ao
 *     filtro. Placa com troca de vínculo no meio do período ganha só o trecho
 *     certo (timestamp >= início e < fim).
 *  2. clausulaDoFiltro: transforma isso num `or=(…)` do PostgREST. Se passar do
 *     orçamento de URL codificada, somado ao filtro de veículo (condomínio
 *     com muitos veículos), ou se o filtro for
 *     "Sem cadastro" (seria um NOT IN gigante), não restringe no servidor.
 *  3. passagemAtende: conferência exata linha a linha, sempre aplicada no
 *     cliente; quando o servidor não restringiu, ela é o filtro.
 *
 * Nada aqui toca no DOM. Carregado no browser (window.filtroCadastroLib,
 * depois de placa.js, vinculo-placa.js e unidade.js) e no Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./placa'), require('./vinculo-placa'), require('./unidade'));
  } else {
    root.filtroCadastroLib = factory(root.placaLib, root.vinculoPlacaLib, root.unidadeLib);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (placaLib, vinculoLib, unidadeLib) {
  'use strict';

  const TIPO_SEM = vinculoLib.SEM_CADASTRO.id; // 'sem'
  const TIPOS_FILTRO = Object.freeze(
    vinculoLib.TIPOS_PESSOA.concat([vinculoLib.SEM_CADASTRO]).map((t) => Object.freeze({ id: t.id, rotulo: t.rotulo })),
  );
  const UNIDADE_MAX = 40;
  // Orçamento de URL JÁ CODIFICADA (vírgulas, parênteses e ":" viram %XX) do
  // `or=(…)` do cadastro SOMADO ao `.in('placa', …)` do filtro de veículo:
  // 6 KB deixam folga para o resto da URL abaixo dos ~8 KB do gateway.
  const LIMITE_URL_CODIFICADA = 6000;
  const RE_GRAFIA = /^[A-Z0-9]{1,10}$/;

  const texto = (v) => (v === null || v === undefined ? '' : String(v).trim());

  /** Id de tipo válido para o filtro ('morador'…'prestador', 'sem') ou ''. */
  function normalizarTipo(v) {
    const s = texto(v).toLowerCase();
    return TIPOS_FILTRO.some((t) => t.id === s) ? s : '';
  }

  /** Rótulo do tipo do filtro ("Sem cadastro" para 'sem'); desconhecido → ''. */
  function rotuloTipo(id) {
    const t = TIPOS_FILTRO.find((x) => x.id === id);
    return t ? t.rotulo : '';
  }

  /** Texto de unidade digitado/da URL: sem caracteres de controle, até 40. */
  function textoUnidade(v) {
    return texto(v).replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').slice(0, UNIDADE_MAX).trim();
  }

  /**
   * Chave de comparação de unidade: sem acento, minúscula, separadores
   * (· - / ,) viram espaço e zeros à esquerda caem ("019" = "19").
   */
  function chaveUnidade(v) {
    return texto(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[·\-/,;:]+/g, ' ')
      .replace(/\b0+(\d)/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Texto digitado → unidade do filtro. Com uma unidade só na lista que case
   * (pelo rótulo "Bloco · Nome" ou só pelo nome), o rótulo vira o da lista.
   * `ids` são todas as unidades da lista que casam (ex.: "19" em dois blocos).
   */
  function resolverUnidade(entrada, lista) {
    const digitado = textoUnidade(entrada);
    const k = chaveUnidade(digitado);
    if (!k) return { rotulo: '', ids: [] };
    const unidades = Array.isArray(lista) ? lista : [];
    const peloRotulo = unidades.filter((u) => chaveUnidade(unidadeLib.rotuloUnidade(u)) === k);
    const casam = peloRotulo.length ? peloRotulo : unidades.filter((u) => chaveUnidade(u && u.nome) === k);
    const rotulo = casam.length === 1 ? unidadeLib.rotuloUnidade(casam[0]) : digitado;
    return { rotulo, ids: casam.map((u) => u.id).filter(Boolean) };
  }

  /** Rótulo da unidade como o painel mostra: o da lista (unidade_id) vale mais que o texto. */
  function rotuloDoVinculo(v, unidadesPorId) {
    if (!v) return '';
    const u = v.unidade_id && unidadesPorId && unidadesPorId.get(v.unidade_id);
    return u ? unidadeLib.rotuloUnidade(u) : texto(v.unidade);
  }

  function chavesDaUnidade(digitado, resolvida, unidades) {
    const chaves = new Set([chaveUnidade(digitado), chaveUnidade(resolvida.rotulo)]);
    if (resolvida.ids.length === 1) {
      const u = unidades.find((x) => x.id === resolvida.ids[0]);
      const k = chaveUnidade(u && u.nome);
      if (k && unidades.filter((x) => chaveUnidade(x && x.nome) === k).length === 1) chaves.add(k);
    }
    chaves.delete('');
    return chaves;
  }

  /**
   * Estado do filtro + lista de unidades → critério, ou null sem filtro.
   * { tipo, unidade: { chaves:Set, ids:Set } | null, unidadesPorId }
   * `chaves` (comparação com o texto que a coluna mostra): o que está no
   * filtro, o rótulo da lista e, para uma unidade da lista cujo nome não se
   * repete (ex.: "Casa 7"), o nome sozinho — cadastro antigo em texto livre.
   */
  function montarCriterio(f, lista) {
    const tipo = normalizarTipo(f && f.tipoCadastro);
    const unidadeTxt = textoUnidade(f && f.unidade);
    if (!tipo && !unidadeTxt) return null;
    const unidades = Array.isArray(lista) ? lista : [];
    const unidadesPorId = new Map(unidades.filter((u) => u && u.id).map((u) => [u.id, u]));
    const r = unidadeTxt ? resolverUnidade(unidadeTxt, unidades) : null;
    return {
      tipo,
      unidade: r ? { chaves: chavesDaUnidade(unidadeTxt, r, unidades), ids: new Set(r.ids) } : null,
      unidadesPorId,
    };
  }

  /** O vínculo (ou a falta dele) atende ao critério? */
  function vinculoAtende(v, c) {
    if (!c) return true;
    const tipoDoVinculo = v ? vinculoLib.tipoPessoa(v.tipo_pessoa).id : TIPO_SEM;
    if (c.tipo && tipoDoVinculo !== c.tipo) return false;
    if (!c.unidade) return true;
    if (!v) return false;
    if (v.unidade_id && c.unidade.ids.has(v.unidade_id)) return true;
    return c.unidade.chaves.has(chaveUnidade(rotuloDoVinculo(v, c.unidadesPorId)));
  }

  /** A passagem (placa + instante) atende ao critério pelo vínculo da hora? */
  function passagemAtende(indice, placa, ts, c) {
    if (!c) return true;
    return vinculoAtende(vinculoLib.vinculoNaHora(indice, placa, ts), c);
  }

  /** Filtra linhas de capturas ({ placa, timestamp }) pelo critério. */
  function filtrarPassagens(linhas, indice, c) {
    if (!c) return linhas || [];
    return (linhas || []).filter((l) => l && passagemAtende(indice, l.placa, l.timestamp, c));
  }

  function ms(v) {
    if (v === null || v === undefined || v === '') return null;
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }

  /** Grafias da placa para `placa.in.(…)`: Mercosul, antiga e as gravadas. */
  function grafiasDa(chave, lista) {
    const todas = [chave, placaLib.paraAntiga(chave), ...(lista || []).map((v) => placaLib.limpar(v && v.placa))];
    return [...new Set(todas.map((p) => texto(p).toUpperCase()).filter((p) => RE_GRAFIA.test(p)))];
  }

  // Trechos [a, b) dentro de [ini, fim) em que o vínculo da hora atende.
  // Entre duas bordas (início/fim de algum vínculo) o vínculo da hora não muda.
  function trechosQueAtendem(chave, lista, c, ini, fim) {
    const bordas = new Set([ini]);
    lista.forEach((v) => [ms(v.vigente_desde), ms(v.encerrado_em)].forEach((t) => {
      if (t !== null && t > ini && t < fim) bordas.add(t);
    }));
    const pontos = [...bordas].sort((a, b) => a - b).concat([fim]);
    const indice = new Map([[chave, lista]]);
    const trechos = [];
    for (let i = 0; i < pontos.length - 1; i++) {
      const [a, b] = [pontos[i], pontos[i + 1]];
      if (!vinculoAtende(vinculoLib.vinculoNaHora(indice, chave, new Date(a)), c)) continue;
      const ultimo = trechos[trechos.length - 1];
      if (ultimo && ultimo[1] === a) ultimo[1] = b; else trechos.push([a, b]);
    }
    return trechos;
  }

  /**
   * Placas e trechos do período [iniMs, fimMs) que atendem ao critério.
   * "Sem cadastro" → null (não dá para listar quem NÃO tem vínculo).
   * @returns {null | Array<{ grafias: string[], trechos: Array<[number, number]> }>}
   */
  function janelasDoFiltro(indice, c, iniMs, fimMs) {
    if (!c || c.tipo === TIPO_SEM) return null;
    const r = [];
    for (const [chave, lista] of indice || []) {
      if (!lista.some((v) => vinculoAtende(v, c))) continue; // nenhum vínculo da placa serve
      const trechos = trechosQueAtendem(chave, lista, c, iniMs, fimMs);
      const grafias = grafiasDa(chave, lista);
      if (trechos.length && grafias.length) r.push({ grafias, trechos });
    }
    return r;
  }

  /** Tamanho do valor depois de codificado na URL (como o URLSearchParams faz). */
  function tamanhoNaUrl(valor) {
    return new URLSearchParams({ x: valor }).toString().length - 2;
  }

  /** Tamanho codificado do `.in('placa', …)` do filtro de veículo (0 sem ele). */
  function tamanhoDoFiltroVeiculo(placas) {
    return placas && placas.length ? tamanhoNaUrl(`in.(${placas.join(',')})`) : 0;
  }

  /**
   * Janelas → condição para `.or()` do PostgREST.
   * { vazio:true } nenhuma passagem pode atender · { ou:'…' } restringe no
   * servidor · { ou:null } grande demais: o filtro fica só no cliente.
   * Com filtro de veículo (`placasVeiculo`), só as placas dele entram (a
   * passagem tem de atender aos dois) e o orçamento conta as duas listas.
   */
  function clausulaDoFiltro(janelas, iniMs, fimMs, opcoes) {
    const o = opcoes || {};
    const limite = o.limite || LIMITE_URL_CODIFICADA;
    const veiculo = o.placasVeiculo || null;
    if (janelas === null || janelas === undefined) return { ou: null };
    if (veiculo) {
      const permitidas = new Set(veiculo);
      janelas = janelas
        .map((j) => ({ grafias: j.grafias.filter((g) => permitidas.has(g)), trechos: j.trechos }))
        .filter((j) => j.grafias.length);
    }
    if (!janelas.length) return { vazio: true };
    const inteiras = [];
    const partes = [];
    const iso = (t) => new Date(t).toISOString();
    janelas.forEach((j) => {
      if (j.trechos.length === 1 && j.trechos[0][0] <= iniMs && j.trechos[0][1] >= fimMs) {
        inteiras.push(...j.grafias);
        return;
      }
      j.trechos.forEach(([a, b]) => {
        partes.push(`and(placa.in.(${j.grafias.join(',')}),timestamp.gte.${iso(a)},timestamp.lt.${iso(b)})`);
      });
    });
    const itens = (inteiras.length ? [`placa.in.(${inteiras.join(',')})`] : []).concat(partes);
    const ou = itens.join(',');
    return tamanhoNaUrl(`(${ou})`) + tamanhoDoFiltroVeiculo(veiculo) > limite ? { ou: null } : { ou };
  }

  /**
   * Lê páginas (buscarPagina(de, ate) → { data, error }) e fica com as linhas
   * que `filtrar` aprova, até passar de `limite`. Linha repetida entre páginas
   * (passagem nova no meio da leitura empurra a paginação) conta uma vez só.
   * `limite: true` quando há mais do que o mostrado OU a leitura parou no teto
   * de páginas com a última cheia (sobrou período sem conferir).
   */
  async function conferirEmPaginas(buscarPagina, filtrar, opcoes) {
    const { limite, tamanho, maxPaginas } = opcoes;
    const vistos = new Set();
    let achadas = [];
    let incompleta = false;
    for (let p = 0; ; p++) {
      if (p >= maxPaginas) { incompleta = true; break; }
      const de = p * tamanho;
      const { data, error } = await buscarPagina(de, de + tamanho - 1);
      if (error || !data) throw error || new Error('falha ao ler página ' + p);
      const novas = data.filter((l) => {
        const id = l && l.id;
        if (id === undefined || id === null) return true;
        if (vistos.has(id)) return false;
        vistos.add(id);
        return true;
      });
      achadas = achadas.concat(filtrar(novas));
      if (data.length < tamanho || achadas.length > limite) break;
    }
    return { linhas: achadas.slice(0, limite), limite: incompleta || achadas.length > limite, incompleta };
  }

  return Object.freeze({
    TIPOS_FILTRO, TIPO_SEM, UNIDADE_MAX, LIMITE_URL_CODIFICADA, tamanhoNaUrl, tamanhoDoFiltroVeiculo, conferirEmPaginas,
    normalizarTipo, rotuloTipo, textoUnidade, chaveUnidade, resolverUnidade, rotuloDoVinculo,
    montarCriterio, vinculoAtende, passagemAtende, filtrarPassagens, janelasDoFiltro, clausulaDoFiltro,
  });
});
