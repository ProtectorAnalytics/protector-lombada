/**
 * unidade.js — regras de unidade do condomínio: tipos, rótulo, lote
 * ("101 102, 103-105") e leitura/escrita de planilha.
 *
 * Planilha: colunas `Bloco/Torre/Quadra`, `Unidade`, `Andar`, `Tipo`. Na
 * leitura os cabeçalhos são comparados sem acento/maiúscula e também valem
 * `Bloco`, `Torre`, `Quadra` (para o agrupador) e `Apartamento` (para a unidade).
 *
 * Nada aqui toca no DOM. Carregado no browser (window.unidadeLib) e no Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.unidadeLib = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TIPOS_UNIDADE = Object.freeze([
    Object.freeze({ id: 'apartamento', rotulo: 'Apartamento' }),
    Object.freeze({ id: 'casa', rotulo: 'Casa' }),
    Object.freeze({ id: 'sala', rotulo: 'Sala' }),
    Object.freeze({ id: 'loja', rotulo: 'Loja' }),
    Object.freeze({ id: 'lote', rotulo: 'Lote' }),
    Object.freeze({ id: 'fip', rotulo: 'FIP (Fração Ideal)' }),
  ]);

  const TIPO_PADRAO = 'apartamento';
  const MAX_FAIXA = 500;
  const SEPARADOR_AGRUPADOR = ' · ';
  const COL_AGRUPADOR = 'Bloco/Torre/Quadra';
  const COL_UNIDADE = 'Unidade';
  const COL_ANDAR = 'Andar';
  const COL_TIPO = 'Tipo';

  // Chave de comparação: sem acento (faixa escapada), minúscula, sem bordas.
  const chave = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  const texto = (v) => String(v == null ? '' : v).trim();

  const ALIAS_TIPO = Object.freeze({ 'fracao ideal': 'fip' });

  /** Tipo por id ou rótulo (sem acento/maiúscula); null se desconhecido. */
  function tipoUnidade(valor) {
    const k = chave(valor);
    if (!k) return null;
    const achado = TIPOS_UNIDADE.find((t) => t.id === k || chave(t.rotulo) === k)
      || TIPOS_UNIDADE.find((t) => t.id === ALIAS_TIPO[k]);
    return achado || null;
  }

  /** "<agrupador> · <unidade>" ou só "<unidade>". */
  function rotuloUnidade(u) {
    const bloco = texto(u && u.bloco);
    const nome = texto(u && u.nome);
    return bloco ? `${bloco}${SEPARADOR_AGRUPADOR}${nome}` : nome;
  }

  /** Lote: itens separados por espaço, vírgula, ponto e vírgula ou quebra; faixas numéricas "a-b". */
  function expandirLote(entrada) {
    const nomes = [];
    const recusados = [];
    const vistos = new Set();
    const add = (n) => {
      const k = n.toLowerCase();
      if (!vistos.has(k)) { vistos.add(k); nomes.push(n); }
    };
    String(entrada == null ? '' : entrada).split(/[\s,;]+/).filter(Boolean).forEach((item) => {
      const faixa = /^(\d+)\s*-\s*(\d+)$/.exec(item);
      if (faixa) {
        const a = Number(faixa[1]);
        const b = Number(faixa[2]);
        const [ini, fim] = a <= b ? [a, b] : [b, a];
        if (fim - ini + 1 > MAX_FAIXA) { recusados.push(item); return; }
        for (let n = ini; n <= fim; n++) add(String(n));
      } else if (/^[^-]*\d-[^-]*\d$/.test(item)) {
        recusados.push(item); // parece faixa, mas não é só de números
      } else {
        add(item);
      }
    });
    return { nomes, recusados };
  }

  // Valor da coluna pelo cabeçalho, comparando sem acento/maiúscula.
  function lerColuna(row, aliases) {
    for (const k of Object.keys(row)) {
      if (aliases.includes(chave(k))) return row[k];
    }
    return '';
  }

  const ALIAS_AGRUPADOR = ['bloco/torre/quadra', 'bloco', 'torre', 'quadra'];
  const ALIAS_UNIDADE = ['unidade', 'apartamento'];
  const ALIAS_ANDAR = ['andar'];
  const ALIAS_TIPO_COL = ['tipo'];

  /** Linhas da planilha → unidades válidas + recusadas (linha 1 = primeira linha de dados). */
  function linhasDaPlanilha(rows) {
    const unidades = [];
    const recusadas = [];
    const vistas = new Set();
    (Array.isArray(rows) ? rows : []).forEach((row, i) => {
      const linha = i + 1;
      const bloco = texto(lerColuna(row || {}, ALIAS_AGRUPADOR));
      const nome = texto(lerColuna(row || {}, ALIAS_UNIDADE));
      const andar = texto(lerColuna(row || {}, ALIAS_ANDAR));
      const tipoTxt = texto(lerColuna(row || {}, ALIAS_TIPO_COL));
      if (!bloco && !nome && !andar && !tipoTxt) return; // linha em branco
      if (!nome) { recusadas.push({ linha, motivo: 'Unidade vazia' }); return; }
      const tipo = tipoTxt ? tipoUnidade(tipoTxt) : tipoUnidade(TIPO_PADRAO);
      if (!tipo) { recusadas.push({ linha, motivo: `Tipo "${tipoTxt}" desconhecido` }); return; }
      const k = `${chave(bloco)}\u0000${chave(nome)}`;
      if (vistas.has(k)) { recusadas.push({ linha, motivo: 'Unidade duplicada no mesmo agrupador' }); return; }
      vistas.add(k);
      unidades.push({ bloco, nome, andar, tipo: tipo.id });
    });
    return { unidades, recusadas };
  }

  /** Unidades → objetos com as colunas exatas da planilha. */
  function linhasParaPlanilha(unidades) {
    return (unidades || []).map((u) => {
      const tipo = tipoUnidade(u.tipo) || tipoUnidade(TIPO_PADRAO);
      return {
        [COL_AGRUPADOR]: texto(u.bloco),
        [COL_UNIDADE]: texto(u.nome),
        [COL_ANDAR]: texto(u.andar),
        [COL_TIPO]: tipo.rotulo,
      };
    });
  }

  return Object.freeze({ TIPOS_UNIDADE, tipoUnidade, rotuloUnidade, expandirLote, linhasDaPlanilha, linhasParaPlanilha });
});
