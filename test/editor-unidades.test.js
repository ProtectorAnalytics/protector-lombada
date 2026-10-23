/**
 * Editor de unidades em massa (site/js/editor-unidades.js) e gestão de
 * porteiros (site/js/gestao-porteiros.js): estado puro, diff para salvar,
 * planilha e HTML escapado. Também confere que os dois carregam no browser
 * (VM com window) e que as telas ligam os scripts certos.
 * Uso: node test/editor-unidades.test.js
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ed = require('../site/js/editor-unidades');
const gp = require('../site/js/gestao-porteiros');

const ler = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

let passou = 0;
let falhou = 0;
function caso(nome, fn) {
  try { fn(); passou++; console.log(`ok - ${nome}`); }
  catch (e) { falhou++; console.log(`FALHOU - ${nome}\n  ${e.message.split('\n').join('\n  ')}`); }
}

const SERVIDOR = [
  { id: 'a1', bloco: 'Torre 1', nome: '101', andar: '1', tipo: 'apartamento', ordem: 1 },
  { id: 'a2', bloco: 'Torre 1', nome: '102', andar: null, tipo: 'apartamento', ordem: 2 },
  { id: 'a3', bloco: null, nome: 'Loja 1', andar: null, tipo: 'loja', ordem: 3 },
];
const inicial = () => ed.estadoDoServidor(SERVIDOR);
const nomesDo = (estado, bloco) => ed.grupos(estado).find((g) => g.bloco === bloco).unidades.map((u) => u.nome);

// ---------------------------------------------------------------- estado inicial

caso('estado do servidor: grupos por bloco, "Sem bloco" por último, sem alterações', () => {
  const e = inicial();
  const g = ed.grupos(e);
  assert.deepStrictEqual(g.map((x) => x.titulo), ['Torre 1', 'Sem bloco']);
  assert.deepStrictEqual(nomesDo(e, 'Torre 1'), ['101', '102']);
  assert.deepStrictEqual(nomesDo(e, ''), ['Loja 1']);
  assert.strictEqual(ed.temAlteracoes(e), false);
  assert.deepStrictEqual(ed.contadores(e), { blocos: 1, unidades: 3 });
  assert.strictEqual(ed.textoContadores(ed.contadores(e)), '1 bloco · 3 unidades');
});

caso('estado é imutável: operações devolvem estado novo', () => {
  const e = inicial();
  const r = ed.adicionarLote(e, { bloco: 'Torre 1', texto: '103', andar: '', tipo: 'apartamento' });
  assert.notStrictEqual(r.estado, e);
  assert.deepStrictEqual(nomesDo(e, 'Torre 1'), ['101', '102']);
  assert.throws(() => { 'use strict'; e.itens.push({}); });
});

// ---------------------------------------------------------------- blocos

caso('novo bloco: nome livre, aparece vazio; repetido (sem maiúscula) é recusado', () => {
  let r = ed.adicionarBloco(inicial(), '  Quadra   2 ');
  assert.strictEqual(r.erro, undefined);
  assert.deepStrictEqual(ed.grupos(r.estado).map((x) => x.titulo), ['Quadra 2', 'Torre 1', 'Sem bloco']);
  assert.deepStrictEqual(ed.contadores(r.estado), { blocos: 2, unidades: 3 });
  r = ed.adicionarBloco(r.estado, 'torre 1');
  assert.match(r.erro, /já existe/i);
  assert.match(ed.adicionarBloco(inicial(), '   ').erro, /nome/i);
  assert.match(ed.adicionarBloco(inicial(), 'x'.repeat(41)).erro, /40/);
});

caso('blocos em ordem natural (Torre 2 antes de Torre 10)', () => {
  let e = inicial();
  e = ed.adicionarBloco(e, 'Torre 10').estado;
  e = ed.adicionarBloco(e, 'Torre 2').estado;
  assert.deepStrictEqual(ed.grupos(e).map((x) => x.titulo), ['Torre 1', 'Torre 2', 'Torre 10', 'Sem bloco']);
});

caso('remover bloco tira o bloco e as unidades dele', () => {
  const e = ed.removerBloco(inicial(), 'Torre 1');
  assert.deepStrictEqual(ed.grupos(e).map((x) => x.titulo), ['Sem bloco']);
  assert.deepStrictEqual(ed.diffParaSalvar(e).removidas.sort(), ['a1', 'a2']);
});

// ---------------------------------------------------------------- lote

caso('adicionar lote: faixa e separadores, andar e tipo do lote; repetidas puladas', () => {
  const r = ed.adicionarLote(inicial(), { bloco: 'Torre 1', texto: '102, 103-105 106', andar: ' 3 ', tipo: 'sala' });
  assert.strictEqual(r.adicionadas, 4);
  assert.deepStrictEqual(r.repetidas, ['102']);
  assert.deepStrictEqual(r.recusados, []);
  assert.deepStrictEqual(nomesDo(r.estado, 'Torre 1'), ['101', '102', '103', '104', '105', '106']);
  const u = ed.grupos(r.estado)[0].unidades.find((x) => x.nome === '104');
  assert.strictEqual(u.andar, '3');
  assert.strictEqual(u.tipo, 'sala');
  assert.strictEqual(u.id, null);
  assert.strictEqual(ed.temAlteracoes(r.estado), true);
});

caso('adicionar lote: tipo padrão Apartamento; repetido só por maiúscula conta como repetido', () => {
  const r = ed.adicionarLote(inicial(), { bloco: '', texto: 'Casa9', andar: '', tipo: '' });
  assert.strictEqual(ed.grupos(r.estado).find((g) => g.bloco === '').unidades.find((x) => x.nome === 'Casa9').tipo, 'apartamento');
  const r2 = ed.adicionarLote(r.estado, { bloco: '', texto: 'CASA9 casa10', andar: '', tipo: '' });
  assert.deepStrictEqual(r2.repetidas, ['CASA9']);
  assert.strictEqual(r2.adicionadas, 1);
});

caso('adicionar lote: faixa grande demais, nome longo e andar longo são recusados', () => {
  const r = ed.adicionarLote(inicial(), { bloco: '', texto: '1-900 ' + 'x'.repeat(61) + ' 7', andar: '', tipo: 'casa' });
  assert.deepStrictEqual(r.recusados, ['1-900', 'x'.repeat(61)]);
  assert.strictEqual(r.adicionadas, 1);
  assert.match(ed.adicionarLote(inicial(), { bloco: '', texto: '8', andar: '12345678901', tipo: '' }).erro, /andar/i);
  assert.match(ed.adicionarLote(inicial(), { bloco: '', texto: '  ', andar: '', tipo: '' }).erro, /unidade/i);
  assert.match(ed.adicionarLote(inicial(), { bloco: '', texto: '8', andar: '', tipo: 'galpão' }).erro, /tipo/i);
});

caso('adicionar lote num bloco novo (vazio) leva o nome do bloco', () => {
  const e = ed.adicionarBloco(inicial(), 'Quadra B').estado;
  const r = ed.adicionarLote(e, { bloco: 'Quadra B', texto: 'L1 L2', andar: '', tipo: 'lote' });
  assert.deepStrictEqual(nomesDo(r.estado, 'Quadra B'), ['L1', 'L2']);
  assert.deepStrictEqual(ed.diffParaSalvar(r.estado).novas, [
    { bloco: 'Quadra B', nome: 'L1', andar: '', tipo: 'lote' },
    { bloco: 'Quadra B', nome: 'L2', andar: '', tipo: 'lote' },
  ]);
});

// ---------------------------------------------------------------- etiquetas

caso('remover etiqueta: existente vira DELETE; nova some sem ir ao servidor', () => {
  let r = ed.adicionarLote(inicial(), { bloco: 'Torre 1', texto: '103', andar: '', tipo: '' });
  const nova = ed.grupos(r.estado)[0].unidades.find((u) => u.nome === '103');
  let e = ed.removerUnidade(r.estado, nova.chave);
  e = ed.removerUnidade(e, 'a1');
  const d = ed.diffParaSalvar(e);
  assert.deepStrictEqual(d, { novas: [], removidas: ['a1'], alteradas: [] });
  assert.deepStrictEqual(nomesDo(e, 'Torre 1'), ['102']);
});

caso('remover e adicionar de novo a mesma unidade não gera DELETE + POST', () => {
  let e = ed.removerUnidade(inicial(), 'a1');
  e = ed.adicionarLote(e, { bloco: 'torre 1', texto: '101', andar: '1', tipo: 'apartamento' }).estado;
  assert.deepStrictEqual(ed.diffParaSalvar(e), { novas: [], removidas: [], alteradas: [] });
  assert.strictEqual(ed.temAlteracoes(e), false);
  // de novo com outro tipo: vira PUT do mesmo id
  e = ed.removerUnidade(inicial(), 'a1');
  e = ed.adicionarLote(e, { bloco: 'Torre 1', texto: '101', andar: '1', tipo: 'casa' }).estado;
  assert.deepStrictEqual(ed.diffParaSalvar(e), { novas: [], removidas: [], alteradas: [{ id: 'a1', patch: { tipo: 'casa' } }] });
});

caso('trocar tipo: existente vira PUT só do tipo; voltar ao original desfaz', () => {
  let e = ed.trocarTipo(inicial(), 'a2', 'fip');
  assert.deepStrictEqual(ed.diffParaSalvar(e).alteradas, [{ id: 'a2', patch: { tipo: 'fip' } }]);
  assert.strictEqual(ed.grupos(e)[0].unidades[1].tipo, 'fip');
  e = ed.trocarTipo(e, 'a2', 'apartamento');
  assert.strictEqual(ed.temAlteracoes(e), false);
  assert.strictEqual(ed.trocarTipo(inicial(), 'a2', 'galpão').itens.find((u) => u.chave === 'a2').tipo, 'apartamento');
});

caso('etiqueta mostra o tipo só quando não é Apartamento (rótulo exato do FIP)', () => {
  const e = ed.trocarTipo(inicial(), 'a2', 'fip');
  const html = ed.htmlEditor(e);
  assert.ok(html.includes('FIP (Fração Ideal)'));
  assert.ok(html.includes('Loja'));
  assert.ok(!/>Apartamento</.test(html.replace(/<option[^>]*>Apartamento<\/option>/g, '')));
});

// ---------------------------------------------------------------- planilha

caso('importar: carrega no editor (novas e atualizadas), lista recusadas com a linha', () => {
  const rows = [
    { 'Bloco/Torre/Quadra': 'Torre 1', Unidade: '101', Andar: '1', Tipo: 'Casa' }, // linha 2: altera tipo de a1
    { 'Bloco/Torre/Quadra': 'Torre 2', Unidade: '201', Andar: '2', Tipo: 'FIP' },  // linha 3: nova
    { 'Bloco/Torre/Quadra': '', Unidade: '', Andar: '', Tipo: '' },                 // linha 4: em branco
    { 'Bloco/Torre/Quadra': 'Torre 2', Unidade: '', Andar: '', Tipo: 'Casa' },      // linha 5: sem unidade
    { 'Bloco/Torre/Quadra': '', Unidade: 'X', Andar: '', Tipo: 'galpão' },          // linha 6: tipo inválido
    { 'Bloco/Torre/Quadra': '', Unidade: 'Loja 1', Andar: '', Tipo: 'Loja' },       // linha 7: igual
  ];
  const r = ed.importarLinhas(inicial(), rows);
  assert.strictEqual(r.novas, 1);
  assert.strictEqual(r.atualizadas, 1);
  assert.deepStrictEqual(r.recusadas.map((x) => x.linha), [5, 6]);
  const d = ed.diffParaSalvar(r.estado);
  assert.deepStrictEqual(d.novas, [{ bloco: 'Torre 2', nome: '201', andar: '2', tipo: 'fip' }]);
  assert.deepStrictEqual(d.alteradas, [{ id: 'a1', patch: { tipo: 'casa' } }]);
  assert.deepStrictEqual(d.removidas, []); // importar não apaga o que não está na planilha
});

caso('importar: nome longo demais é recusado com a linha', () => {
  const r = ed.importarLinhas(inicial(), [{ Unidade: 'y'.repeat(61) }]);
  assert.deepStrictEqual(r.recusadas.map((x) => x.linha), [2]);
  assert.strictEqual(r.novas, 0);
});

caso('exportar e modelo usam as colunas da planilha', () => {
  const rows = ed.linhasExportar(inicial());
  assert.deepStrictEqual(Object.keys(rows[0]), ['Bloco/Torre/Quadra', 'Unidade', 'Andar', 'Tipo']);
  assert.deepStrictEqual(rows.map((x) => x.Unidade), ['101', '102', 'Loja 1']);
  assert.strictEqual(rows[2].Tipo, 'Loja');
  const modelo = ed.linhasModelo();
  assert.ok(modelo.length >= 2);
  assert.ok(modelo.some((x) => x.Tipo === 'FIP (Fração Ideal)'));
});

// ---------------------------------------------------------------- salvar

caso('diff: novas → POST (em lotes abaixo do teto), removidas → DELETE, alteradas → PUT', () => {
  let e = ed.trocarTipo(inicial(), 'a2', 'sala');
  e = ed.removerUnidade(e, 'a3');
  e = ed.adicionarLote(e, { bloco: 'Torre 1', texto: '1-500', andar: '', tipo: '' }).estado;
  e = ed.adicionarLote(e, { bloco: 'Torre 3', texto: '1-500', andar: '', tipo: '' }).estado;
  const d = ed.diffParaSalvar(e);
  assert.strictEqual(d.novas.length, 998); // 101 e 102 da Torre 1 já existiam
  assert.deepStrictEqual(d.removidas, ['a3']);
  assert.deepStrictEqual(d.alteradas, [{ id: 'a2', patch: { tipo: 'sala' } }]);
  const lotes = ed.emLotes(d.novas, 400);
  assert.deepStrictEqual(lotes.map((l) => l.length), [400, 400, 198]);
  assert.ok(ed.TAMANHO_LOTE_SALVAR <= 2000);
  assert.strictEqual(ed.resumoAlteracoes(d), '998 novas · 1 removida · 1 alterada');
});

caso('reaplicar pendentes após salvar com falha: o que não foi salvo volta ao editor', () => {
  // servidor depois do salvamento parcial: a2 removida não foi; 103 não entrou
  const pend = { novas: [{ bloco: 'Torre 1', nome: '103', andar: '', tipo: 'casa' }], removidas: ['a2'], alteradas: [{ id: 'a3', patch: { tipo: 'sala' } }] };
  const e = ed.reaplicarPendentes(SERVIDOR, pend);
  assert.deepStrictEqual(ed.diffParaSalvar(e), pend);
});

caso('reaplicar pendentes: nova que a releitura já trouxe (POST gravou, resposta perdida) não duplica', () => {
  const relida = [...SERVIDOR, { id: 'a9', bloco: 'Torre 1', nome: '103', andar: null, tipo: 'casa' }];
  const pend = {
    novas: [{ bloco: 'torre 1', nome: ' 103 ', andar: '', tipo: 'casa' }, { bloco: 'Torre 1', nome: '104', andar: '', tipo: '' }],
    removidas: [], alteradas: [],
  };
  const e = ed.reaplicarPendentes(relida, pend);
  assert.deepStrictEqual(nomesDo(e, 'Torre 1'), ['101', '102', '103', '104']);
  assert.deepStrictEqual(ed.diffParaSalvar(e).novas, [{ bloco: 'Torre 1', nome: '104', andar: '', tipo: 'apartamento' }]);
});

// ---------------------------------------------------------------- HTML seguro

caso('HTML do editor escapa bloco e unidade (XSS)', () => {
  const mau = '<img src=x onerror=alert(1)>';
  const e = ed.estadoDoServidor([{ id: 'z', bloco: `"${mau}`, nome: `${mau}'`, andar: null, tipo: 'apartamento' }]);
  const html = ed.htmlEditor(e);
  assert.ok(!html.includes('<img'), html);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!/data-bloco="[^"]*"[^ >]*</.test(html));
  assert.ok(!html.includes(`'"`));
  const rec = ed.htmlRecusadas([{ linha: 3, motivo: `Tipo "${mau}" desconhecido` }]);
  assert.ok(!rec.includes('<img'));
  assert.ok(rec.includes('Linha 3'));
});

caso('HTML do editor: um cartão por bloco + "Sem bloco", com campos de lote e "Adicionar"', () => {
  const html = ed.htmlEditor(ed.adicionarBloco(inicial(), 'Quadra 9').estado);
  assert.strictEqual((html.match(/class="ed-cartao"/g) || []).length, 3);
  assert.ok(html.includes('Sem bloco'));
  assert.strictEqual((html.match(/data-acao="adicionar"/g) || []).length, 3);
  assert.ok(html.includes('aria-label="Remover 101"'));
  ['Apartamento', 'Casa', 'Sala', 'Loja', 'Lote', 'FIP (Fração Ideal)'].forEach((t) => assert.ok(html.includes(`>${t}</option>`), t));
});

// ---------------------------------------------------------------- porteiros

caso('porteiro: usuário sugerido acompanha o nome até ser editado', () => {
  assert.strictEqual(gp.usuarioSugerido({ nome: 'José da Silva', condominio: 'Condomínio Praia do Castelo', atual: '', editado: false }), 'jose.praia');
  assert.strictEqual(gp.usuarioSugerido({ nome: 'José', condominio: 'Praia', atual: 'ze.portao', editado: true }), 'ze.portao');
  assert.strictEqual(gp.usuarioSugerido({ nome: '', condominio: 'Praia', atual: '', editado: false }), '');
});

caso('porteiro: senha fraca bloqueada, usuário inválido e nome vazio apontam o campo', () => {
  const r = gp.validarNovoPorteiro({ nome: ' ', usuario: 'Jo', senha: '12345' });
  assert.strictEqual(r.corpo, undefined);
  assert.match(r.erros.nome, /nome/i);
  assert.match(r.erros.usuario, /3 a 40/);
  assert.match(r.erros.senha, /10 caracteres/);
  assert.strictEqual(gp.SENHA_MIN, 10);
  assert.strictEqual(gp.erroSenha('girassol42'), '');
  assert.match(gp.erroSenha('abc123456'), /10 caracteres/);
  assert.match(gp.erroSenha('girassolazul'), /letras e números/);
  assert.match(gp.erroSenha('jose.castelo7', { usuario: 'jose.castelo', nome: 'José' }), /nome/);
  assert.match(gp.erroSenha('portaria123'), /comum/);
  const comNome = gp.validarNovoPorteiro({ nome: 'Maria Souza', usuario: 'maria.castelo', senha: 'Castelo2026' });
  assert.match(comNome.erros.senha, /nome/, 'compara com o usuário digitado');
  const comPrimeiroNome = gp.validarNovoPorteiro({ nome: 'Maria Souza', usuario: 'portao.um', senha: 'maria2026xx' });
  assert.match(comPrimeiroNome.erros.senha, /nome/, 'compara com o primeiro nome');
  const ok = gp.validarNovoPorteiro({ nome: ' José ', usuario: ' Jose.Castelo ', senha: 'girassol42' });
  assert.deepStrictEqual(ok, { corpo: { nome: 'José', usuario: 'jose.castelo', senha: 'girassol42' } });
});

caso('porteiro: lista escapa nome e usuário (XSS) e mostra Trocar senha / Desativar / Reativar', () => {
  const html = gp.htmlListaPorteiros([
    { id: 'p1', nome: '<script>alert(1)</script>', usuario: 'jose.castelo', ativo: true },
    { id: 'p2', nome: "D'Ávila", usuario: '"><img src=x>', ativo: false },
  ]);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('D&#39;Ávila'));
  assert.ok(html.includes('data-acao="senha" data-id="p1"'));
  assert.ok(html.includes('data-acao="desativar" data-id="p1"'));
  assert.ok(html.includes('data-acao="reativar" data-id="p2"'));
  assert.ok(html.includes('Desativado'));
  assert.match(gp.htmlListaPorteiros([]), /Nenhum porteiro/);
});

caso('porteiro: 409 vira mensagem de usuário repetido; outros erros usam a mensagem da API', () => {
  assert.match(gp.mensagemErro({ status: 409, message: 'x' }), /já existe/i);
  assert.strictEqual(gp.mensagemErro({ status: 400, message: 'Informe o nome do porteiro' }), 'Informe o nome do porteiro');
  assert.match(gp.mensagemErro({}), /tente de novo/i);
});

// ---------------------------------------------------------------- browser e telas

caso('libs carregam no browser (window) com unidadeLib e usuarioPortariaLib', () => {
  const ctx = vm.createContext({});
  ctx.window = ctx;
  ['site/js/unidade.js', 'site/js/usuario-portaria.js', 'site/js/editor-unidades.js', 'site/js/gestao-porteiros.js']
    .forEach((f) => vm.runInContext(ler(f), ctx, { filename: f }));
  assert.strictEqual(typeof ctx.editorUnidadesLib.adicionarLote, 'function');
  assert.strictEqual(typeof ctx.gestaoPorteirosLib.validarNovoPorteiro, 'function');
  const r = ctx.editorUnidadesLib.adicionarLote(ctx.editorUnidadesLib.estadoDoServidor([]), { bloco: '', texto: '1-3', andar: '', tipo: '' });
  assert.strictEqual(r.adicionadas, 3);
});

caso('telas: admin e painel carregam os scripts da gestão; sem confirm() nativo no controlador', () => {
  const ctl = ler('site/js/portaria-gestao.js');
  assert.ok(!/[^.\w]confirm\(/.test(ctl));
  assert.ok(!/\balert\(/.test(ctl));
  assert.ok(ctl.includes("{ defval: '', blankrows: true }"));
  // SheetJS 0.20.3 hospedado no próprio site (0.18.5 tem CVE ao ler planilha)
  assert.ok(ctl.includes("'/vendor/xlsx-0.20.3/xlsx.full.min.js'"));
  assert.ok(!/cdnjs\.cloudflare\.com\/ajax\/libs\/xlsx/.test(ctl));
  const dash = ler('dashboard/index.html');
  assert.ok(dash.includes("s.src = '/vendor/xlsx-0.20.3/xlsx.full.min.js';"));
  assert.ok(!/xlsx\/0\.18\.5/.test(dash), 'painel sem a 0.18.5');
  const lib = ler('site/vendor/xlsx-0.20.3/xlsx.full.min.js');
  assert.ok(lib.startsWith('/*! xlsx.js (C) 2013-present SheetJS'));
  const ctxX = { console }; ctxX.window = ctxX; ctxX.self = ctxX; vm.createContext(ctxX);
  vm.runInContext(lib, ctxX);
  assert.strictEqual(ctxX.XLSX.version, '0.20.3');
  const wb = ctxX.XLSX.utils.book_new();
  ctxX.XLSX.utils.book_append_sheet(wb, ctxX.XLSX.utils.json_to_sheet([{ Unidade: '101' }, {}, { Unidade: '102' }], { header: ['Unidade', 'Tipo'] }), 'U');
  const lido = ctxX.XLSX.read(ctxX.XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), { type: 'array' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(ctxX.XLSX.utils.sheet_to_json(lido.Sheets.U, { defval: '', blankrows: true }))),
    [{ Unidade: '101', Tipo: '' }, { Unidade: '', Tipo: '' }, { Unidade: '102', Tipo: '' }]);
  for (const pagina of ['admin/index.html', 'dashboard/index.html']) {
    const h = ler(pagina);
    ['unidade', 'usuario-portaria', 'editor-unidades', 'gestao-porteiros', 'portaria-gestao']
      .forEach((s) => assert.ok(h.includes(`<script src="/js/${s}.js"></script>`), `${pagina}: ${s}`));
    assert.ok(h.includes('<link rel="stylesheet" href="/css/portaria-gestao.css">'), pagina);
  }
  const portaria = ler('portaria/index.html');
  assert.ok(portaria.includes("localStorage.removeItem('lombada-portaria-porteiro')"));
  assert.ok(portaria.includes('<script src="/js/unidade.js"></script>'));
});

/** Recorta a função que começa em `inicio` até a chave que fecha o corpo. */
function corpoDaFuncao(fonte, i) {
  let nivel = 0;
  const abre = fonte.indexOf('{', fonte.indexOf(')', i));
  for (let j = abre; j < fonte.length; j++) {
    if (fonte[j] === '{') nivel++;
    else if (fonte[j] === '}' && --nivel === 0) return fonte.slice(i, j + 1);
  }
  throw new Error('chaves desbalanceadas');
}

caso('controlador: editor travado durante o Salvar (inert + guarda nos eventos)', () => {
  const ctl = ler('site/js/portaria-gestao.js');
  const salvar = corpoDaFuncao(ctl, ctl.indexOf('async function salvar('));
  assert.ok(/travarEditor\(U, true\)[\s\S]*finally[\s\S]*travarEditor\(U, false\)/.test(salvar), salvar);
  const travar = corpoDaFuncao(ctl, ctl.indexOf('function travarEditor('));
  assert.ok(travar.includes('secao.inert = travar'));
  ['function aoMudarUnidades(', 'function aoTeclarUnidades(', 'function ligarEventosUnidades(', 'async function importar(']
    .forEach((f) => assert.ok(corpoDaFuncao(ctl, ctl.indexOf(f)).includes('U.salvando'), f));
});

caso('controlador: nenhuma função com 50 linhas ou mais', () => {
  const ctl = ler('site/js/portaria-gestao.js');
  const inicio = ctl.indexOf('{', ctl.indexOf("'use strict'") - 30);
  const corpo = ctl.slice(inicio + 1);
  const grandes = [...corpo.matchAll(/^ {2}(?:async )?function (\w+)\(/gm)]
    .map((m) => [m[1], corpoDaFuncao(corpo, m.index).split('\n').length])
    .filter(([, n]) => n >= 50);
  assert.deepStrictEqual(grandes, []);
});

caso('confirmarNaPagina põe título e texto por textContent (sem HTML do chamador)', () => {
  const ctl = ler('site/js/portaria-gestao.js');
  const preencher = corpoDaFuncao(ctl, ctl.indexOf('function preencherDialogo('));
  assert.ok(!preencher.includes('innerHTML'));
  assert.ok(preencher.includes('textContent = titulo'));
  const dialogo = corpoDaFuncao(ctl, ctl.indexOf('function htmlDialogo('));
  assert.ok(!dialogo.includes('${'), 'o HTML fixo do diálogo não interpola nada');
});

caso('scripts inline de admin, painel e portaria compilam (node --check)', () => {
  for (const pagina of ['admin/index.html', 'dashboard/index.html', 'portaria/index.html']) {
    const h = ler(pagina);
    [...h.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
      .forEach((m, i) => { new vm.Script(m[1], { filename: `${pagina}-inline-${i}.js` }); });
  }
  ['site/js/editor-unidades.js', 'site/js/gestao-porteiros.js', 'site/js/portaria-gestao.js']
    .forEach((f) => { new vm.Script(ler(f), { filename: f }); });
});

console.log(`${passou} casos passaram${falhou ? `, ${falhou} falharam` : ''}`);
if (falhou) process.exit(1);
