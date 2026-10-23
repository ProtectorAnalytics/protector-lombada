/**
 * editor-unidades.js — estado do editor de unidades em massa (admin e painel
 * do síndico): blocos/torres/quadras, lote de unidades, tipo por unidade,
 * planilha e o diff que o "Salvar" envia (novas → POST, removidas → DELETE,
 * alteradas → PUT). Tudo puro e imutável: cada operação devolve estado novo.
 *
 * O render devolve HTML com todo texto dinâmico escapado (nome de bloco e de
 * unidade vêm de quem digitou ou da planilha). Os eventos ficam em
 * site/js/portaria-gestao.js.
 *
 * Browser: window.editorUnidadesLib (depende de window.unidadeLib). Node: require.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./unidade'));
  } else {
    root.editorUnidadesLib = factory(root.unidadeLib);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (unidadeLib) {
  'use strict';

  // Mesmos limites do servidor (lib/unidades-estruturadas.js, lib/lista-simples.js).
  const MAX_BLOCO = 40;
  const MAX_NOME = 60;
  const MAX_ANDAR = 10;
  // Unidades por POST: bem abaixo do MAX_LOTE (2000) da API.
  const TAMANHO_LOTE_SALVAR = 500;
  const TIPO_PADRAO = 'apartamento';
  const SEM_BLOCO = 'Sem bloco';
  const CAMPOS = ['bloco', 'nome', 'andar', 'tipo'];

  const MAPA_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => (s === null || s === undefined ? '' : String(s).replace(/[&<>"']/g, (c) => MAPA_ESC[c]));

  const ordemNatural = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
  // eslint-disable-next-line no-control-regex
  const CONTROLE = /[\u0000-\u001F\u007F]/g;
  const limpar = (v) => String(v == null ? '' : v).replace(CONTROLE, ' ').trim().replace(/\s+/g, ' ');
  const minus = (s) => String(s || '').toLowerCase();
  // Mesma regra única do servidor: sem diferenciar maiúsculas; acento conta.
  const chaveDe = (u) => `${minus(u.bloco)}\u0000${minus(u.nome)}`;
  const tipoId = (t) => { const achado = unidadeLib.tipoUnidade(t); return achado ? achado.id : TIPO_PADRAO; };

  function congelar(estado) {
    return Object.freeze({
      itens: Object.freeze(estado.itens.map((u) => Object.freeze({ ...u }))),
      original: Object.freeze({ ...estado.original }),
      blocosExtras: Object.freeze([...estado.blocosExtras]),
      seq: estado.seq,
    });
  }

  const comItens = (estado, itens, extra = {}) => congelar({ ...estado, itens, ...extra });

  function novoItem(estado, campos) {
    const seq = estado.seq + 1;
    return { seq, item: { chave: `n${seq}`, id: null, ...campos } };
  }

  /** Lista do GET /api/admin/unidades → estado inicial (sem alterações). */
  function estadoDoServidor(lista) {
    const itens = (Array.isArray(lista) ? lista : []).map((u) => ({
      chave: String(u.id), id: String(u.id), bloco: limpar(u.bloco), nome: limpar(u.nome), andar: limpar(u.andar), tipo: tipoId(u.tipo),
    }));
    const original = {};
    itens.forEach((u) => { original[u.id] = Object.freeze({ bloco: u.bloco, nome: u.nome, andar: u.andar, tipo: u.tipo }); });
    return congelar({ itens, original, blocosExtras: [], seq: 0 });
  }

  /** Nome canônico de cada bloco (primeira grafia vista), por chave minúscula. */
  function blocosConhecidos(estado) {
    const mapa = new Map();
    estado.blocosExtras.forEach((b) => { if (!mapa.has(minus(b))) mapa.set(minus(b), b); });
    estado.itens.forEach((u) => { if (u.bloco && !mapa.has(minus(u.bloco))) mapa.set(minus(u.bloco), u.bloco); });
    return mapa;
  }

  /** Cartões do editor: blocos em ordem natural e "Sem bloco" por último (sempre). */
  function grupos(estado) {
    const nomes = [...blocosConhecidos(estado).values()].sort(ordemNatural.compare);
    const porNome = (a, b) => ordemNatural.compare(a.nome, b.nome);
    const lista = nomes.map((bloco) => ({
      bloco, titulo: bloco, unidades: estado.itens.filter((u) => minus(u.bloco) === minus(bloco)).sort(porNome),
    }));
    lista.push({ bloco: '', titulo: SEM_BLOCO, unidades: estado.itens.filter((u) => !u.bloco).sort(porNome) });
    return lista;
  }

  function contadores(estado) {
    return { blocos: blocosConhecidos(estado).size, unidades: estado.itens.length };
  }

  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  function textoContadores(c) {
    return `${plural(c.blocos, 'bloco', 'blocos')} · ${plural(c.unidades, 'unidade', 'unidades')}`;
  }

  function adicionarBloco(estado, nome) {
    const limpo = limpar(nome);
    if (!limpo) return { estado, erro: 'Informe o nome do bloco, torre ou quadra.' };
    if (limpo.length > MAX_BLOCO) return { estado, erro: `Nome do bloco com no máximo ${MAX_BLOCO} caracteres.` };
    if (blocosConhecidos(estado).has(minus(limpo))) return { estado, erro: 'Esse bloco já existe.' };
    return { estado: congelar({ ...estado, blocosExtras: [...estado.blocosExtras, limpo] }) };
  }

  /** Tira o bloco e todas as unidades dele. */
  function removerBloco(estado, bloco) {
    const k = minus(limpar(bloco));
    return comItens(estado, estado.itens.filter((u) => minus(u.bloco) !== k), {
      blocosExtras: estado.blocosExtras.filter((b) => minus(b) !== k),
    });
  }

  function validarLote({ texto, andar, tipo }) {
    const andarLimpo = limpar(andar);
    if (andarLimpo.length > MAX_ANDAR) return { erro: `Andar com no máximo ${MAX_ANDAR} caracteres.` };
    const tipoAchado = limpar(tipo) ? unidadeLib.tipoUnidade(tipo) : unidadeLib.tipoUnidade(TIPO_PADRAO);
    if (!tipoAchado) return { erro: 'Tipo de unidade desconhecido.' };
    const lote = unidadeLib.expandirLote(texto);
    if (!lote.nomes.length && !lote.recusados.length) return { erro: 'Digite ao menos uma unidade.' };
    return { andar: andarLimpo, tipo: tipoAchado.id, lote };
  }

  /**
   * Lote de unidades num bloco ('' = sem bloco): "101 102, 103-105".
   * Devolve { estado, adicionadas, repetidas, recusados } ou { estado, erro }.
   */
  function adicionarLote(estado, { bloco, texto, andar, tipo }) {
    const v = validarLote({ texto, andar, tipo });
    if (v.erro) return { estado, erro: v.erro };
    const blocoLimpo = limpar(bloco);
    const canonico = blocoLimpo ? (blocosConhecidos(estado).get(minus(blocoLimpo)) || blocoLimpo) : '';
    if (canonico.length > MAX_BLOCO) return { estado, erro: `Nome do bloco com no máximo ${MAX_BLOCO} caracteres.` };
    const existentes = new Set(estado.itens.map(chaveDe));
    const recusados = [...v.lote.recusados];
    const repetidas = [];
    const novos = [];
    let atual = estado;
    v.lote.nomes.forEach((nome) => {
      if (nome.length > MAX_NOME) { recusados.push(nome); return; }
      const campos = { bloco: canonico, nome, andar: v.andar, tipo: v.tipo };
      if (existentes.has(chaveDe(campos))) { repetidas.push(nome); return; }
      existentes.add(chaveDe(campos));
      const n = novoItem(atual, campos);
      atual = { ...atual, seq: n.seq };
      novos.push(n.item);
    });
    const resultado = novos.length ? comItens(atual, [...estado.itens, ...novos]) : estado;
    return { estado: resultado, adicionadas: novos.length, repetidas, recusados };
  }

  function removerUnidade(estado, chave) {
    return comItens(estado, estado.itens.filter((u) => u.chave !== chave));
  }

  function trocarTipo(estado, chave, tipo) {
    const achado = unidadeLib.tipoUnidade(tipo);
    if (!achado) return estado;
    return comItens(estado, estado.itens.map((u) => (u.chave === chave ? { ...u, tipo: achado.id } : u)));
  }

  /** Limites que a planilha não confere (o servidor recusaria a linha). */
  function motivoDeTamanho(u) {
    if (u.nome.length > MAX_NOME) return `Unidade acima de ${MAX_NOME} caracteres`;
    if (u.bloco.length > MAX_BLOCO) return `Bloco/Torre/Quadra acima de ${MAX_BLOCO} caracteres`;
    if (u.andar.length > MAX_ANDAR) return `Andar acima de ${MAX_ANDAR} caracteres`;
    return '';
  }

  /** Uma linha já válida da planilha aplicada aos itens; devolve o que aconteceu. */
  function aplicarLinha(acc, u) {
    const k = chaveDe(u);
    const i = acc.itens.findIndex((x) => chaveDe(x) === k);
    if (i < 0) {
      const n = novoItem(acc, u);
      return { ...acc, seq: n.seq, itens: [...acc.itens, n.item], novas: acc.novas + 1 };
    }
    const velho = acc.itens[i];
    if (velho.andar === u.andar && velho.tipo === u.tipo) return acc;
    const itens = acc.itens.map((x, j) => (j === i ? { ...x, andar: u.andar, tipo: u.tipo } : x));
    return { ...acc, itens, atualizadas: acc.atualizadas + 1 };
  }

  /**
   * Linhas de sheet_to_json (com defval '' e blankrows true: linha i = i+2)
   * carregadas no editor para conferir. Soma ao que já está: o que não está
   * na planilha continua. Mesma unidade (bloco + nome) recebe andar e tipo.
   */
  function importarLinhas(estado, rows) {
    const recusadas = [];
    const vistas = new Set();
    let acc = { ...estado, itens: [...estado.itens], novas: 0, atualizadas: 0 };
    (Array.isArray(rows) ? rows : []).forEach((row, i) => {
      const linha = i + 2;
      const r = unidadeLib.linhasDaPlanilha([row]);
      if (r.recusadas.length) { recusadas.push({ linha, motivo: r.recusadas[0].motivo }); return; }
      if (!r.unidades.length) return; // linha em branco
      const u = { bloco: limpar(r.unidades[0].bloco), nome: limpar(r.unidades[0].nome), andar: limpar(r.unidades[0].andar), tipo: r.unidades[0].tipo };
      const motivo = motivoDeTamanho(u);
      if (motivo) { recusadas.push({ linha, motivo }); return; }
      if (vistas.has(chaveDe(u))) { recusadas.push({ linha, motivo: 'Unidade duplicada no mesmo agrupador' }); return; }
      vistas.add(chaveDe(u));
      const canonico = u.bloco ? (blocosConhecidos(acc).get(minus(u.bloco)) || u.bloco) : '';
      acc = aplicarLinha(acc, { ...u, bloco: canonico });
    });
    return { estado: comItens(estado, acc.itens, { seq: acc.seq }), novas: acc.novas, atualizadas: acc.atualizadas, recusadas };
  }

  function camposMudados(antes, depois) {
    const patch = {};
    CAMPOS.forEach((c) => { if (antes[c] !== depois[c]) patch[c] = depois[c]; });
    return patch;
  }

  const semCampos = (u) => ({ bloco: u.bloco, nome: u.nome, andar: u.andar, tipo: u.tipo });

  /**
   * O que o "Salvar" envia. Unidade removida e adicionada de novo (mesmo bloco
   * e nome) volta a ser a do servidor: vira PUT (ou nada), nunca DELETE + POST.
   */
  function diffParaSalvar(estado) {
    const presentes = new Set(estado.itens.filter((u) => u.id).map((u) => u.id));
    const removidasPorChave = new Map();
    Object.keys(estado.original).forEach((id) => {
      if (!presentes.has(id)) removidasPorChave.set(chaveDe(estado.original[id]), id);
    });
    const novas = [];
    const alteradas = [];
    estado.itens.forEach((u) => {
      let id = u.id;
      if (!id && removidasPorChave.has(chaveDe(u))) {
        id = removidasPorChave.get(chaveDe(u));
        removidasPorChave.delete(chaveDe(u));
      }
      if (!id) { novas.push(semCampos(u)); return; }
      const patch = camposMudados(estado.original[id], u);
      if (Object.keys(patch).length) alteradas.push({ id, patch });
    });
    return { novas, removidas: [...removidasPorChave.values()], alteradas };
  }

  function temAlteracoes(estado) {
    const d = diffParaSalvar(estado);
    return d.novas.length + d.removidas.length + d.alteradas.length > 0;
  }

  function resumoAlteracoes(d) {
    const partes = [];
    if (d.novas.length) partes.push(plural(d.novas.length, 'nova', 'novas'));
    if (d.removidas.length) partes.push(plural(d.removidas.length, 'removida', 'removidas'));
    if (d.alteradas.length) partes.push(plural(d.alteradas.length, 'alterada', 'alteradas'));
    return partes.length ? partes.join(' · ') : 'Nenhuma alteração';
  }

  function emLotes(lista, tamanho = TAMANHO_LOTE_SALVAR) {
    const lotes = [];
    for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho));
    return lotes;
  }

  /**
   * Depois de um "Salvar" com falha: estado = servidor recarregado + o que
   * não foi salvo (mesmo formato do diff), para quem salvou tentar de novo.
   */
  function reaplicarPendentes(lista, pendentes) {
    let e = estadoDoServidor(lista);
    const removidas = new Set(pendentes.removidas || []);
    const patches = new Map((pendentes.alteradas || []).map((a) => [a.id, a.patch]));
    let itens = e.itens.filter((u) => !removidas.has(u.id)).map((u) => (patches.has(u.id) ? { ...u, ...patches.get(u.id) } : u));
    (pendentes.novas || []).forEach((u) => {
      const n = novoItem(e, { bloco: u.bloco || '', nome: u.nome, andar: u.andar || '', tipo: tipoId(u.tipo) });
      e = { ...e, seq: n.seq };
      itens = [...itens, n.item];
    });
    return comItens(e, itens);
  }

  // ---------------------------------------------------------------- planilha

  function linhasExportar(estado) {
    const ordenadas = grupos(estado).flatMap((g) => g.unidades);
    return unidadeLib.linhasParaPlanilha(ordenadas);
  }

  // Exemplos fictícios do modelo (o repositório é público: nada de cliente real).
  const EXEMPLOS_MODELO = [
    { bloco: 'Torre 1', nome: '101', andar: '1', tipo: 'apartamento' },
    { bloco: 'Torre 1', nome: '102', andar: '1', tipo: 'apartamento' },
    { bloco: 'Quadra A', nome: 'Lote 5', andar: '', tipo: 'lote' },
    { bloco: '', nome: 'Loja 1', andar: '', tipo: 'loja' },
    { bloco: '', nome: 'Área 2', andar: '', tipo: 'fip' },
  ];

  function linhasModelo() {
    return unidadeLib.linhasParaPlanilha(EXEMPLOS_MODELO);
  }

  // ---------------------------------------------------------------- HTML

  function htmlOpcoesTipo(selecionado) {
    return unidadeLib.TIPOS_UNIDADE.map((t) => `<option value="${esc(t.id)}"${t.id === selecionado ? ' selected' : ''}>${esc(t.rotulo)}</option>`).join('');
  }

  function rotuloTipo(id) {
    const t = unidadeLib.tipoUnidade(id);
    return t ? t.rotulo : '';
  }

  /** Etiqueta: nome (+ tipo se não for Apartamento); clicar no nome troca o tipo. */
  function htmlEtiqueta(u) {
    const tipo = u.tipo !== TIPO_PADRAO ? ` <small>${esc(rotuloTipo(u.tipo))}</small>` : '';
    const andar = u.andar ? ` · andar ${u.andar}` : '';
    const titulo = `${rotuloTipo(u.tipo)}${andar} — clique para trocar o tipo`;
    return `<li class="ed-etq${u.id ? '' : ' ed-etq-nova'}" data-chave="${esc(u.chave)}">`
      + `<button type="button" class="ed-etq-nome" data-acao="tipo" data-chave="${esc(u.chave)}" title="${esc(titulo)}">${esc(u.nome)}${tipo}</button>`
      + `<button type="button" class="ed-etq-x" data-acao="remover" data-chave="${esc(u.chave)}" aria-label="Remover ${esc(u.nome)}">×</button></li>`;
  }

  /** Seletor que substitui o nome da etiqueta enquanto o tipo é trocado. */
  function htmlSeletorTipo(u) {
    return `<select class="ed-etq-tipo" data-acao="escolher-tipo" data-chave="${esc(u.chave)}" aria-label="Tipo de ${esc(u.nome)}">${htmlOpcoesTipo(u.tipo)}</select>`;
  }

  function htmlCartao(grupo) {
    const b = esc(grupo.bloco);
    const remover = grupo.bloco
      ? `<button type="button" class="btn btn-ghost btn-sm ed-remover-bloco" data-acao="remover-bloco" data-bloco="${b}">Remover bloco</button>`
      : '';
    const etiquetas = grupo.unidades.length
      ? `<ul class="ed-etiquetas">${grupo.unidades.map(htmlEtiqueta).join('')}</ul>`
      : '<p class="ed-vazio">Nenhuma unidade.</p>';
    return `<section class="ed-cartao" data-bloco="${b}">`
      + `<header class="ed-cartao-topo"><h4>${esc(grupo.titulo)}</h4>`
      + `<span class="ed-conta">${esc(plural(grupo.unidades.length, 'unidade', 'unidades'))}</span>${remover}</header>`
      + '<div class="ed-lote">'
      + '<label class="ed-campo ed-campo-texto"><span>Unidades (ex.: 101 102 ou 101-110)</span>'
      + `<input type="text" data-campo="texto" data-bloco="${b}" autocomplete="off" placeholder="101 102 103-110"></label>`
      + `<label class="ed-campo ed-campo-andar"><span>Andar</span><input type="text" data-campo="andar" data-bloco="${b}" maxlength="${MAX_ANDAR}" autocomplete="off"></label>`
      + `<label class="ed-campo ed-campo-tipo"><span>Tipo</span><select data-campo="tipo" data-bloco="${b}">${htmlOpcoesTipo(TIPO_PADRAO)}</select></label>`
      + `<button type="button" class="btn btn-primary btn-sm" data-acao="adicionar" data-bloco="${b}">Adicionar</button>`
      + '</div>'
      + '<p class="ed-aviso" role="status" aria-live="polite"></p>'
      + etiquetas
      + '</section>';
  }

  function htmlEditor(estado) {
    return grupos(estado).map(htmlCartao).join('');
  }

  function htmlRecusadas(recusadas) {
    if (!recusadas || !recusadas.length) return '';
    return `<p>${esc(plural(recusadas.length, 'linha recusada', 'linhas recusadas'))}:</p><ul>`
      + recusadas.map((r) => `<li>Linha ${esc(r.linha)}: ${esc(r.motivo)}</li>`).join('') + '</ul>';
  }

  return Object.freeze({
    TAMANHO_LOTE_SALVAR, MAX_BLOCO, MAX_NOME, MAX_ANDAR,
    estadoDoServidor, grupos, contadores, textoContadores,
    adicionarBloco, removerBloco, adicionarLote, removerUnidade, trocarTipo, importarLinhas,
    diffParaSalvar, temAlteracoes, resumoAlteracoes, emLotes, reaplicarPendentes,
    linhasExportar, linhasModelo,
    htmlEditor, htmlCartao, htmlEtiqueta, htmlSeletorTipo, htmlRecusadas, esc,
  });
});
