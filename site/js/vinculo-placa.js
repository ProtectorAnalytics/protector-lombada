/**
 * vinculo-placa.js — regra "quem estava na hora": dada uma passagem (placa +
 * instante), devolve o vínculo da tabela `veiculos` que valia naquele momento,
 * não o atual. Também concentra os tipos de pessoa (morador, proprietário,
 * visitante, prestador) usados pelo painel.
 *
 * Nada aqui toca no DOM. Carregado no browser (window.vinculoPlacaLib, depois
 * de placa.js) e no Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./placa'));
  } else {
    root.vinculoPlacaLib = factory(root.placaLib);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (placaLib) {
  'use strict';

  const FUSO = 'America/Sao_Paulo';

  const TIPOS_PESSOA = Object.freeze([
    Object.freeze({ id: 'morador', rotulo: 'Morador', icone: 'casa', cor: '--tipo-morador' }),
    Object.freeze({ id: 'proprietario', rotulo: 'Proprietário', icone: 'chave', cor: '--tipo-proprietario' }),
    Object.freeze({ id: 'visitante', rotulo: 'Visitante', icone: 'cracha', cor: '--tipo-visitante' }),
    Object.freeze({ id: 'prestador', rotulo: 'Prestador', icone: 'ferramenta', cor: '--tipo-prestador' }),
  ]);

  const SEM_CADASTRO = Object.freeze({ id: 'sem', rotulo: 'Sem cadastro', icone: 'interrogacao', cor: '--tipo-sem' });

  /** Tipo de pessoa pelo id; id desconhecido vira "Sem cadastro". */
  function tipoPessoa(id) {
    return TIPOS_PESSOA.find((t) => t.id === id) || SEM_CADASTRO;
  }

  // Chave de comparação: placa antiga e Mercosul do mesmo veículo são iguais.
  const chavePlaca = (p) => placaLib.paraMercosul(p || '') || placaLib.limpar(p || '');

  // Instante em ms; null/ausente = sem limite; inválido também é sem limite.
  function ms(v) {
    if (v === null || v === undefined || v === '') return null;
    const t = v instanceof Date ? v.getTime() : Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }

  /** Agrupa por placa (Mercosul); cada lista ordenada por vigente_desde, null primeiro. */
  function indexarVinculos(linhas) {
    const indice = new Map();
    for (const linha of linhas || []) {
      const chave = chavePlaca(linha && linha.placa);
      if (!chave) continue;
      if (!indice.has(chave)) indice.set(chave, []);
      indice.get(chave).push(linha);
    }
    for (const lista of indice.values()) {
      lista.sort((a, b) => {
        const ta = ms(a.vigente_desde);
        const tb = ms(b.vigente_desde);
        if (ta === tb) return 0;
        if (ta === null) return -1;
        if (tb === null) return 1;
        return ta - tb;
      });
    }
    return indice;
  }

  /** Vínculo válido no instante `ts`: vigente_desde <= ts < encerrado_em. */
  function vinculoNaHora(indice, placa, ts) {
    const lista = indice.get(chavePlaca(placa));
    const t = ms(ts);
    if (!lista || t === null) return null;
    for (let i = lista.length - 1; i >= 0; i--) {
      const ini = ms(lista[i].vigente_desde);
      const fim = ms(lista[i].encerrado_em);
      if ((ini === null || ini <= t) && (fim === null || fim > t)) return lista[i];
    }
    return null;
  }

  /** Vínculo atual da placa (o que não foi encerrado). */
  function vinculoVigente(indice, placa) {
    const lista = indice.get(chavePlaca(placa));
    if (!lista) return null;
    for (let i = lista.length - 1; i >= 0; i--) {
      if (ms(lista[i].encerrado_em) === null) return lista[i];
    }
    return null;
  }

  /** "cadastrado em DD/MM às HH:MM por NOME", sempre no fuso de São Paulo. */
  function rotuloCadastro(linha) {
    const t = ms(linha && (linha.vigente_desde || linha.criado_em));
    if (t === null) return '';
    const partes = new Intl.DateTimeFormat('pt-BR', {
      timeZone: FUSO, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(t));
    const p = (tipo) => partes.find((x) => x.type === tipo).value;
    const base = `cadastrado em ${p('day')}/${p('month')} às ${p('hour')}:${p('minute')}`;
    const autor = linha.cadastrado_por ? String(linha.cadastrado_por).trim() : '';
    return autor ? `${base} por ${autor}` : base;
  }

  return { TIPOS_PESSOA, SEM_CADASTRO, tipoPessoa, indexarVinculos, vinculoNaHora, vinculoVigente, rotuloCadastro };
});
