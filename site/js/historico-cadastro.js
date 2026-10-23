/**
 * historico-cadastro.js — o "antes e depois" de cada mudança no cadastro de
 * placas e a frase que o painel mostra na aba "Histórico de alterações".
 *
 * - diferencaCadastro: só os campos que mudaram (a API grava no audit_log)
 * - itemDoHistorico: linha do audit_log → item público (sem ip nem usuario_id)
 * - fraseHistorico: item → partes da frase em texto puro (o painel escapa)
 *
 * Nada aqui toca no DOM. Carregado no browser (window.historicoCadastroLib,
 * depois de vinculo-placa.js) e no Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./vinculo-placa'));
  } else {
    root.historicoCadastroLib = factory(root.vinculoPlacaLib);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (vinculoPlacaLib) {
  'use strict';

  const FUSO = 'America/Sao_Paulo';
  const VAZIO = '—';

  // Ordem em que os campos aparecem na frase
  const CAMPOS = Object.freeze([
    Object.freeze({ id: 'tipo_pessoa', rotulo: 'Tipo' }),
    Object.freeze({ id: 'nome_morador', rotulo: 'Nome' }),
    Object.freeze({ id: 'unidade', rotulo: 'Unidade' }),
    Object.freeze({ id: 'marca', rotulo: 'Marca e modelo' }),
    Object.freeze({ id: 'cor', rotulo: 'Cor' }),
  ]);
  const IDS_CAMPOS = new Set(CAMPOS.map((c) => c.id));

  const ACOES = Object.freeze({
    vincular: 'cadastrou',
    atualizar: 'alterou',
    encerrar: 'encerrou o vínculo de',
    excluir: 'excluiu',
    reabrir: 'reabriu o vínculo de',
    reabrir_vinculo_anterior: 'reabriu o vínculo de',
    // Nomes antigos (antes do histórico de vínculos) ainda no audit_log
    criar: 'cadastrou',
    desativar: 'encerrou o vínculo de',
  });
  const ACOES_HISTORICO = Object.freeze(Object.keys(ACOES));

  const PAPEIS = Object.freeze({
    super_admin: 'Equipe Protector',
    admin_cliente: 'Síndico',
    operador: 'Operador',
    portaria: 'Portaria',
  });

  const normal = (v) => {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s || null;
  };

  /**
   * Compara o vínculo gravado com os campos do PUT. Unidade conta pelo par
   * (unidade_id, rótulo) e entra no log só pelo rótulo.
   * @returns {{ antes: object, depois: object }} vazios quando nada mudou
   */
  function diferencaCadastro(existente, campos) {
    const atual = existente || {};
    const novo = campos || {};
    const antes = {};
    const depois = {};
    for (const c of ['tipo_pessoa', 'nome_morador', 'marca', 'cor']) {
      if (!(c in novo)) continue;
      if (normal(atual[c]) === normal(novo[c])) continue;
      antes[c] = normal(atual[c]);
      depois[c] = normal(novo[c]);
    }
    const mexeUnidade = 'unidade' in novo || 'unidade_id' in novo;
    if (mexeUnidade) {
      const idNovo = 'unidade_id' in novo ? normal(novo.unidade_id) : normal(atual.unidade_id);
      const rotuloNovo = 'unidade' in novo ? normal(novo.unidade) : normal(atual.unidade);
      if (idNovo !== normal(atual.unidade_id) || rotuloNovo !== normal(atual.unidade)) {
        antes.unidade = normal(atual.unidade);
        depois.unidade = rotuloNovo;
      }
    }
    return { antes, depois };
  }

  const vazio = (o) => !o || Object.keys(o).length === 0;

  // Só os campos conhecidos, como texto (nada de objeto vindo do jsonb)
  function soCampos(obj) {
    if (!obj || typeof obj !== 'object') return null;
    const out = {};
    for (const c of CAMPOS) {
      if (c.id in obj) out[c.id] = normal(obj[c.id]);
    }
    return vazio(out) ? null : out;
  }

  /**
   * Linha do audit_log (+ autor) → item que sai da API. Linhas antigas de
   * "atualizar" não têm antes/depois: os campos gravados viram `agora`.
   */
  function itemDoHistorico(linha, autor) {
    const d = (linha && linha.detalhes) || {};
    const antes = soCampos(d.antes);
    const depois = soCampos(d.depois);
    const item = {
      id: linha.id,
      acao: linha.acao,
      placa: normal(d.placa),
      criado_em: linha.criado_em,
      autor_nome: normal(autor && autor.nome),
      autor_papel: autor && PAPEIS[autor.role] ? PAPEIS[autor.role] : null,
      antes,
      depois,
      agora: null,
    };
    if (!depois) item.agora = soCampos(d);
    return item;
  }

  function valorLegivel(campo, valor) {
    if (valor === null || valor === undefined || valor === '') return VAZIO;
    if (campo === 'tipo_pessoa') return vinculoPlacaLib.tipoPessoa(valor).rotulo;
    return String(valor);
  }

  function quandoLegivel(ts) {
    const t = Date.parse(ts);
    if (Number.isNaN(t)) return '';
    const p = new Intl.DateTimeFormat('pt-BR', {
      timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(t));
    const v = (tipo) => p.find((x) => x.type === tipo).value;
    return `${v('day')}/${v('month')}/${v('year')} ${v('hour')}:${v('minute')}`;
  }

  // "Tipo: Morador → Prestador; Nome: A → B"
  function resumoMudanca(antes, depois) {
    return CAMPOS.filter((c) => c.id in depois)
      .map((c) => `${c.rotulo}: ${valorLegivel(c.id, antes && antes[c.id])} → ${valorLegivel(c.id, depois[c.id])}`)
      .join('; ');
  }

  // "Tipo Prestador; Nome X"
  function resumoValores(valores) {
    return CAMPOS.filter((c) => c.id in valores && valores[c.id])
      .map((c) => `${c.rotulo} ${valorLegivel(c.id, valores[c.id])}`)
      .join('; ');
  }

  /**
   * Partes da frase, em texto puro:
   * "23/10/2026 16:12 · Maria Souza (Operador) alterou JSW4A23 — Tipo: Morador → Prestador"
   * @returns {{ quando: string, autor: string, verbo: string, placa: string, detalhe: string }}
   */
  function fraseHistorico(item) {
    const nome = item.autor_nome || 'Alguém';
    const autor = item.autor_papel ? `${nome} (${item.autor_papel})` : nome;
    const verbo = ACOES[item.acao] || 'mexeu no cadastro de';
    let detalhe = '';
    if (item.acao === 'atualizar') {
      if (item.depois) detalhe = resumoMudanca(item.antes || {}, item.depois);
      else if (item.agora) detalhe = `agora: ${resumoValores(item.agora)}`;
    } else if (item.acao === 'vincular' || item.acao === 'criar') {
      detalhe = resumoValores(item.depois || item.agora || {});
    }
    return { quando: quandoLegivel(item.criado_em), autor, verbo, placa: item.placa || VAZIO, detalhe };
  }

  return {
    CAMPOS, ACOES_HISTORICO, PAPEIS, IDS_CAMPOS,
    diferencaCadastro, itemDoHistorico, fraseHistorico, quandoLegivel,
  };
});
