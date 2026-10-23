/**
 * Filtros por tipo de cadastro e por unidade (cadastro NA HORA da passagem).
 * Dados fictícios. Uso: TZ=America/Sao_Paulo node test/filtro-cadastro.test.js
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const fc = require('../site/js/filtro-cadastro');
const vinculoPlacaLib = require('../site/js/vinculo-placa');
const placaLib = require('../site/js/placa');
const estado = require('../site/js/estado-filtros');
const barra = require('../site/js/barra-filtros');

const RAIZ = path.join(__dirname, '..');
const PAINEL = fs.readFileSync(path.join(RAIZ, 'dashboard', 'index.html'), 'utf8');
const HOJE = '2026-10-05';

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

const UNIDADES = [
  { id: 'u-a19', bloco: 'Bloco A', nome: '19' },
  { id: 'u-b19', bloco: 'Bloco B', nome: '19' },
  { id: 'u-101', bloco: '', nome: '101' },
  { id: 'u-casa', bloco: 'Quadra 2', nome: 'Casa 7' },
];

const T = (s) => Date.parse(s);
const INI = T('2026-10-01T03:00:00.000Z');
const FIM = T('2026-10-08T03:00:00.000Z');

// ---------------------------------------------------------------- tipo
caso('tipo do filtro: os quatro tipos e "sem"; qualquer outra coisa vira vazio', () => {
  assert.deepStrictEqual(fc.TIPOS_FILTRO.map((t) => t.id), ['morador', 'proprietario', 'visitante', 'prestador', 'sem']);
  assert.strictEqual(fc.normalizarTipo('Prestador'), 'prestador');
  assert.strictEqual(fc.normalizarTipo(' sem '), 'sem');
  assert.strictEqual(fc.normalizarTipo('admin'), '');
  assert.strictEqual(fc.normalizarTipo(null), '');
  assert.strictEqual(fc.rotuloTipo('proprietario'), 'Proprietário');
  assert.strictEqual(fc.rotuloTipo('sem'), 'Sem cadastro');
});

// ---------------------------------------------------------------- unidade
caso('chave de unidade: sem acento, sem zeros à esquerda, separadores viram espaço', () => {
  assert.strictEqual(fc.chaveUnidade('019'), '19');
  assert.strictEqual(fc.chaveUnidade('Bloco A · 019'), 'bloco a 19');
  assert.strictEqual(fc.chaveUnidade('bloco a - 19'), 'bloco a 19');
  assert.strictEqual(fc.chaveUnidade('Área 0'), 'area 0');
  assert.strictEqual(fc.chaveUnidade('101'), '101');
});
caso('"101" e "0101" viram o rótulo da lista', () => {
  assert.deepStrictEqual(fc.resolverUnidade('0101', UNIDADES), { rotulo: '101', ids: ['u-101'] });
  assert.deepStrictEqual(fc.resolverUnidade(' 101 ', UNIDADES), { rotulo: '101', ids: ['u-101'] });
});
caso('"19" em dois blocos: mantém o texto e casa as duas unidades', () => {
  assert.deepStrictEqual(fc.resolverUnidade('019', UNIDADES), { rotulo: '019', ids: ['u-a19', 'u-b19'] });
});
caso('rótulo completo escolhe uma unidade só ("bloco a 019" → "Bloco A · 19")', () => {
  assert.deepStrictEqual(fc.resolverUnidade('bloco a 019', UNIDADES), { rotulo: 'Bloco A · 19', ids: ['u-a19'] });
});
caso('unidade fora da lista fica como digitada (casa pelo texto do cadastro)', () => {
  assert.deepStrictEqual(fc.resolverUnidade('Apto 9', UNIDADES), { rotulo: 'Apto 9', ids: [] });
  assert.deepStrictEqual(fc.resolverUnidade('', UNIDADES), { rotulo: '', ids: [] });
});
caso('texto de unidade: sem caracteres de controle e no máximo 40', () => {
  assert.strictEqual(fc.textoUnidade('  A\u0000 · 19\n '), 'A · 19');
  assert.strictEqual(fc.textoUnidade('x'.repeat(60)).length, 40);
});

// ---------------------------------------------------------------- critério
const V = (o) => Object.assign({ placa: 'ABC1D23', tipo_pessoa: 'morador', vigente_desde: null, encerrado_em: null, criado_em: '2026-01-01T00:00:00Z' }, o);

caso('sem tipo e sem unidade não há critério', () => {
  assert.strictEqual(fc.montarCriterio({ tipoCadastro: '', unidade: '' }, UNIDADES), null);
});
caso('tipo: casa pelo tipo do vínculo; "sem" casa a falta de vínculo', () => {
  const prest = fc.montarCriterio({ tipoCadastro: 'prestador' }, []);
  assert.strictEqual(fc.vinculoAtende(V({ tipo_pessoa: 'prestador' }), prest), true);
  assert.strictEqual(fc.vinculoAtende(V({ tipo_pessoa: 'morador' }), prest), false);
  assert.strictEqual(fc.vinculoAtende(null, prest), false);
  const sem = fc.montarCriterio({ tipoCadastro: 'sem' }, []);
  assert.strictEqual(fc.vinculoAtende(null, sem), true);
  assert.strictEqual(fc.vinculoAtende(V({}), sem), false);
});
caso('unidade: unidade_id da lista vale mais que o texto antigo', () => {
  const c = fc.montarCriterio({ unidade: 'Bloco A · 19' }, UNIDADES);
  assert.strictEqual(fc.vinculoAtende(V({ unidade_id: 'u-a19', unidade: 'texto velho' }), c), true);
  // texto diz "Bloco A · 19", mas a unidade_id aponta para o bloco B (a coluna mostra B)
  assert.strictEqual(fc.vinculoAtende(V({ unidade_id: 'u-b19', unidade: 'Bloco A · 19' }), c), false);
  // sem unidade_id: compara o texto, com "019" = "19"
  assert.strictEqual(fc.vinculoAtende(V({ unidade: 'bloco a 019' }), c), true);
  assert.strictEqual(fc.vinculoAtende(null, c), false);
});
caso('unidade em texto livre: nome que não se repete na lista casa; nome repetido não', () => {
  const casa = fc.montarCriterio({ unidade: 'Quadra 2 · Casa 7' }, UNIDADES);
  assert.strictEqual(fc.vinculoAtende(V({ unidade: 'Casa 7' }), casa), true);
  const clicada = fc.montarCriterio({ unidade: 'Casa 7' }, UNIDADES); // clique na coluna
  assert.strictEqual(fc.vinculoAtende(V({ unidade: 'Casa 7' }), clicada), true);
  assert.strictEqual(fc.vinculoAtende(V({ unidade_id: 'u-casa' }), clicada), true);
  const a19 = fc.montarCriterio({ unidade: 'Bloco A · 19' }, UNIDADES);
  assert.strictEqual(fc.vinculoAtende(V({ unidade: '19' }), a19), false); // pode ser do bloco B
  const so19 = fc.montarCriterio({ unidade: '19' }, UNIDADES);
  assert.strictEqual(fc.vinculoAtende(V({ unidade: '19' }), so19), true);
  assert.strictEqual(fc.vinculoAtende(V({ unidade_id: 'u-b19' }), so19), true);
});
caso('tipo + unidade juntos: precisa dos dois', () => {
  const c = fc.montarCriterio({ tipoCadastro: 'visitante', unidade: '101' }, UNIDADES);
  assert.strictEqual(fc.vinculoAtende(V({ tipo_pessoa: 'visitante', unidade_id: 'u-101' }), c), true);
  assert.strictEqual(fc.vinculoAtende(V({ tipo_pessoa: 'morador', unidade_id: 'u-101' }), c), false);
  const semComUnidade = fc.montarCriterio({ tipoCadastro: 'sem', unidade: '101' }, UNIDADES);
  assert.strictEqual(fc.vinculoAtende(null, semComUnidade), false);
});

// ---------------------------------------------------------------- vínculo na hora
const TROCA = '2026-10-04T15:00:00.000Z';
const VINCULOS = [
  // placa que era de prestador e virou de morador no meio do período
  V({ placa: 'ABC1D23', tipo_pessoa: 'prestador', unidade_id: 'u-101', vigente_desde: '2026-09-01T00:00:00Z', encerrado_em: TROCA }),
  V({ placa: 'ABC1323', tipo_pessoa: 'morador', unidade_id: 'u-101', vigente_desde: TROCA }), // grafia antiga, mesma placa
  // prestador o período todo
  V({ placa: 'XYZ9A87', tipo_pessoa: 'prestador', unidade_id: 'u-a19' }),
  // morador o período todo
  V({ placa: 'QWE4R56', tipo_pessoa: 'morador', unidade: 'Casa 7' }),
];
const IDX = vinculoPlacaLib.indexarVinculos(VINCULOS);

caso('a passagem usa o vínculo da hora, não o de hoje', () => {
  const c = fc.montarCriterio({ tipoCadastro: 'prestador' }, UNIDADES);
  assert.strictEqual(fc.passagemAtende(IDX, 'ABC1D23', '2026-10-03T12:00:00Z', c), true);
  assert.strictEqual(fc.passagemAtende(IDX, 'ABC1D23', '2026-10-05T12:00:00Z', c), false);
  assert.strictEqual(fc.passagemAtende(IDX, 'ABC1323', '2026-10-03T12:00:00Z', c), true); // grafia antiga
  const linhas = [
    { placa: 'ABC1D23', timestamp: '2026-10-03T12:00:00Z' },
    { placa: 'ABC1D23', timestamp: '2026-10-05T12:00:00Z' },
    { placa: 'XYZ9A87', timestamp: '2026-10-05T12:00:00Z' },
    { placa: 'ZZZ0Z00', timestamp: '2026-10-05T12:00:00Z' },
  ];
  assert.deepStrictEqual(fc.filtrarPassagens(linhas, IDX, c).map((l) => l.timestamp + l.placa),
    ['2026-10-03T12:00:00ZABC1D23', '2026-10-05T12:00:00ZXYZ9A87']);
  const sem = fc.montarCriterio({ tipoCadastro: 'sem' }, UNIDADES);
  assert.deepStrictEqual(fc.filtrarPassagens(linhas, IDX, sem).map((l) => l.placa), ['ZZZ0Z00']);
  assert.strictEqual(fc.filtrarPassagens(linhas, IDX, null), linhas);
});

caso('janelas: placa inteira no período e placa com troca ganha só o trecho certo', () => {
  const c = fc.montarCriterio({ tipoCadastro: 'prestador' }, UNIDADES);
  const j = fc.janelasDoFiltro(IDX, c, INI, FIM);
  const porPlaca = Object.fromEntries(j.map((x) => [x.grafias[0], x]));
  assert.deepStrictEqual(Object.keys(porPlaca).sort(), ['ABC1D23', 'XYZ9A87']);
  assert.deepStrictEqual(porPlaca.ABC1D23.grafias.sort(), ['ABC1323', 'ABC1D23']);
  assert.deepStrictEqual(porPlaca.ABC1D23.trechos, [[INI, T(TROCA)]]);
  assert.deepStrictEqual(porPlaca.XYZ9A87.trechos, [[INI, FIM]]);
  const m = fc.janelasDoFiltro(IDX, fc.montarCriterio({ tipoCadastro: 'morador' }, UNIDADES), INI, FIM);
  const abc = m.find((x) => x.grafias.includes('ABC1D23'));
  assert.deepStrictEqual(abc.trechos, [[T(TROCA), FIM]]);
});
caso('janelas: vínculo que começa e termina dentro do período', () => {
  const idx = vinculoPlacaLib.indexarVinculos([
    V({ placa: 'BRA2E19', tipo_pessoa: 'visitante', vigente_desde: '2026-10-02T13:00:00Z', encerrado_em: '2026-10-02T18:00:00Z' }),
  ]);
  const j = fc.janelasDoFiltro(idx, fc.montarCriterio({ tipoCadastro: 'visitante' }, []), INI, FIM);
  assert.deepStrictEqual(j[0].trechos, [[T('2026-10-02T13:00:00Z'), T('2026-10-02T18:00:00Z')]]);
});
caso('janelas: vínculo só fora do período não entra; "sem" não dá janela', () => {
  const idx = vinculoPlacaLib.indexarVinculos([
    V({ placa: 'BRA2E19', tipo_pessoa: 'visitante', vigente_desde: '2026-08-01T00:00:00Z', encerrado_em: '2026-08-02T00:00:00Z' }),
  ]);
  assert.deepStrictEqual(fc.janelasDoFiltro(idx, fc.montarCriterio({ tipoCadastro: 'visitante' }, []), INI, FIM), []);
  assert.strictEqual(fc.janelasDoFiltro(idx, fc.montarCriterio({ tipoCadastro: 'sem' }, []), INI, FIM), null);
});
caso('janelas: unidade por unidade_id e por texto', () => {
  const j = fc.janelasDoFiltro(IDX, fc.montarCriterio({ unidade: 'casa 07' }, UNIDADES), INI, FIM);
  assert.deepStrictEqual(j.map((x) => x.grafias[0]), ['QWE4R56']);
  const u101 = fc.janelasDoFiltro(IDX, fc.montarCriterio({ unidade: '0101' }, UNIDADES), INI, FIM);
  assert.deepStrictEqual(u101.map((x) => x.trechos), [[[INI, FIM]]]); // prestador e depois morador, mesma unidade
});

// ---------------------------------------------------------------- cláusula PostgREST
caso('cláusula: placas inteiras num in.(…) e trechos com timestamp', () => {
  const c = fc.montarCriterio({ tipoCadastro: 'prestador' }, UNIDADES);
  const { ou } = fc.clausulaDoFiltro(fc.janelasDoFiltro(IDX, c, INI, FIM), INI, FIM);
  assert.strictEqual(ou, 'placa.in.(XYZ9A87,XYZ9087),'
    + 'and(placa.in.(ABC1D23,ABC1323),timestamp.gte.2026-10-01T03:00:00.000Z,timestamp.lt.2026-10-04T15:00:00.000Z)');
});
caso('cláusula: nada atende = vazio; "sem" ou grande demais = só no cliente', () => {
  assert.deepStrictEqual(fc.clausulaDoFiltro([], INI, FIM), { vazio: true });
  assert.deepStrictEqual(fc.clausulaDoFiltro(null, INI, FIM), { ou: null });
  const muitas = Array.from({ length: 600 }, (_, i) => ({ grafias: [`AAA${String(i).padStart(4, '0')}`], trechos: [[INI, FIM]] }));
  assert.deepStrictEqual(fc.clausulaDoFiltro(muitas, INI, FIM), { ou: null });
  assert.ok(fc.LIMITE_CLAUSULA <= 4000);
});
caso('cláusula: só grafias A-Z0-9 (nada que quebre o or=(…))', () => {
  const idx = vinculoPlacaLib.indexarVinculos([V({ placa: 'ab,c)1', tipo_pessoa: 'morador' })]);
  const j = fc.janelasDoFiltro(idx, fc.montarCriterio({ tipoCadastro: 'morador' }, []), INI, FIM);
  j.forEach((x) => x.grafias.forEach((g) => assert.match(g, /^[A-Z0-9]+$/)));
});

// ---------------------------------------------------------------- estado, URL e chips
caso('estado: tipo e unidade normalizados; padrão vazio', () => {
  const f = estado.montarFiltros({ tipoCadastro: 'PRESTADOR', unidade: '  Bloco A · 19 ' }, HOJE);
  assert.strictEqual(f.tipoCadastro, 'prestador');
  assert.strictEqual(f.unidade, 'Bloco A · 19');
  assert.strictEqual(estado.montarFiltros({ tipoCadastro: 'chefe' }, HOJE).tipoCadastro, '');
  assert.strictEqual(estado.filtrosPadrao(HOJE).unidade, '');
});
caso('URL: tipo= e unidade= vão e voltam; valor inválido é ignorado', () => {
  const f = estado.comMudancas(estado.filtrosPadrao(HOJE), { tipoCadastro: 'visitante', unidade: 'Bloco A · 19' }, HOJE);
  const qs = estado.paraQueryString(f, HOJE);
  assert.strictEqual(qs, 'tipo=visitante&unidade=Bloco%20A%20%C2%B7%2019');
  assert.deepStrictEqual(estado.deQueryString(`?${qs}`, HOJE, 2026), f);
  const ruim = estado.deQueryString('?tipo=root&unidade=%00%01', HOJE, 2026);
  assert.strictEqual(ruim.tipoCadastro, '');
  assert.strictEqual(ruim.unidade, '');
  assert.strictEqual(estado.deQueryString('?tipo=sem', HOJE, 2026).tipoCadastro, 'sem');
});
caso('combina com os outros filtros e cada chip remove só o seu', () => {
  const f = estado.comMudancas(estado.filtrosPadrao(HOJE), {
    tipoCadastro: 'prestador', unidade: '101', soAlertas: true, veiculo: { modelo: 'Onix' },
  }, HOJE);
  const chips = barra.chipsDosFiltros(f, HOJE, {});
  assert.deepStrictEqual(chips.filter((c) => ['tipoCadastro', 'unidade'].includes(c.chave)),
    [{ chave: 'tipoCadastro', rotulo: 'Cadastro: Prestador' }, { chave: 'unidade', rotulo: 'Unidade: 101' }]);
  const semTipo = estado.removerFiltro(f, 'tipoCadastro', HOJE);
  assert.strictEqual(semTipo.tipoCadastro, '');
  assert.strictEqual(semTipo.unidade, '101');
  assert.strictEqual(semTipo.soAlertas, true);
  assert.strictEqual(estado.removerFiltro(f, 'unidade', HOJE).unidade, '');
  assert.strictEqual(estado.contarMaisFiltros(f), 3); // modelo, tipo, unidade
  assert.strictEqual(estado.temFiltroAtivo(estado.comMudancas(estado.filtrosPadrao(HOJE), { unidade: '9' }, HOJE), HOJE), true);
  assert.strictEqual(barra.chipsDosFiltros(estado.comMudancas(f, { tipoCadastro: 'sem' }, HOJE), HOJE, {})
    .find((c) => c.chave === 'tipoCadastro').rotulo, 'Cadastro: Sem cadastro');
});

// ---------------------------------------------------------------- painel (dashboard/index.html)
function extrair(fonte, inicio) {
  const i = fonte.indexOf(inicio);
  if (i < 0) throw new Error(`não achei "${inicio}"`);
  let nivel = 0;
  for (let j = fonte.indexOf(') {', i) + 2; j < fonte.length; j++) {
    if (fonte[j] === '{') nivel++;
    else if (fonte[j] === '}' && --nivel === 0) return fonte.slice(i, j + 1);
  }
  throw new Error(`chaves desbalanceadas em "${inicio}"`);
}

// Consulta falsa que registra as chamadas do supabase-js
function consultaFalsa() {
  const chamadas = [];
  const q = new Proxy({}, { get: (_, nome) => (...args) => { chamadas.push([nome, ...args]); return q; } });
  return { q, chamadas };
}

caso('aplicarFiltros: placa + cadastro num único or=(…) aninhado', () => {
  const ctx = vm.createContext({ placaLib, currentCliente: { limite_velocidade: 30 } });
  vm.runInContext(extrair(PAINEL, 'function aplicarFiltros('), ctx);
  const f = { placa: 'ABC1D23', velMin: 0 };
  const fcAtivo = { ativo: true, ou: 'placa.in.(XYZ9A87)' };
  const a = consultaFalsa();
  ctx.aplicarFiltros(a.q, f, { ativo: false }, fcAtivo);
  const ors = a.chamadas.filter((c) => c[0] === 'or');
  assert.strictEqual(ors.length, 1);
  assert.strictEqual(ors[0][1], 'and(or(placa.ilike.*ABC1D23*,placa.ilike.*ABC1323*),or(placa.in.(XYZ9A87)))');
  const b = consultaFalsa();
  ctx.aplicarFiltros(b.q, { placa: '', velMin: 0 }, { ativo: false }, fcAtivo);
  assert.deepStrictEqual(b.chamadas, [['or', 'placa.in.(XYZ9A87)']]);
  const c = consultaFalsa();
  ctx.aplicarFiltros(c.q, { placa: '', velMin: 0 }, { ativo: false }, { ativo: true, ou: null });
  assert.deepStrictEqual(c.chamadas, []); // sem `ou`: confere no cliente
  const d = consultaFalsa();
  ctx.aplicarFiltros(d.q, { placa: 'ABC1D23', velMin: 0 }, { ativo: false });
  assert.deepStrictEqual(d.chamadas, [['or', 'placa.ilike.*ABC1D23*,placa.ilike.*ABC1323*']]);
});

caso('painel: campos no "Mais filtros", scripts na ordem e drill-down ligado', () => {
  assert.ok(PAINEL.includes('<select id="filter-tipo-cadastro">'));
  assert.ok(PAINEL.includes('<input type="text" id="filter-unidade" list="lista-unidades-filtro"'));
  assert.ok(PAINEL.includes('<datalist id="lista-unidades-filtro"></datalist>'));
  const ordem = ['/js/placa.js', '/js/vinculo-placa.js', '/js/unidade.js', '/js/filtro-cadastro.js', '/js/estado-filtros.js', '/js/barra-filtros.js']
    .map((s) => PAINEL.indexOf(`<script src="${s}"></script>`));
  ordem.forEach((i) => assert.ok(i > 0));
  assert.deepStrictEqual([...ordem].sort((a, b) => a - b), ordem);
  assert.ok(/'filter-tipo-cadastro': \(v\) => \(\{ tipoCadastro: v \}\)/.test(PAINEL));
  assert.ok(PAINEL.includes("'filter-unidade': (v) => ({ unidade: filtroCadastroLib.resolverUnidade(v, unidadesLista).rotulo })"));
  assert.ok(PAINEL.includes("tipoCadastro: (v) => ({ tipoCadastro: v }),"));
  assert.ok(PAINEL.includes("unidade: (v) => ({ unidade: v }),"));
  assert.ok(PAINEL.includes("ligarDrillDown('modal-body', true, closeModal)"));
  assert.ok(PAINEL.includes("botaoFiltro('tipoCadastro', t.id, seloTipoPessoa(id)"));
  assert.ok(PAINEL.includes("botaoFiltro('unidade', unidade, esc(unidade)"));
  // Unidade na lista do datalist sai escapada
  assert.ok(PAINEL.includes('`<option value="${esc(r)}"></option>`'));
  // Todos os consumidores do período passam pela conferência do cadastro
  assert.ok(!/soNaoCadastradasSeAtivo\(f, await linhasDe/.test(PAINEL));
  assert.strictEqual((PAINEL.match(/filtrarNoCliente\(f, await linhasDe\(montar\)\)/g) || []).length, 4);
  assert.ok(PAINEL.includes("consultaELinhas('placa, velocidade, timestamp')")); // Top 10 precisa da hora
  assert.ok(PAINEL.includes('fc.ativo && !fc.ou\n        ? await listaConferidaNoCliente(f, fv, fc)'));
});

caso('libs carregam no browser (window.filtroCadastroLib)', () => {
  const ctx = vm.createContext({});
  ctx.window = ctx;
  ['site/js/placa.js', 'site/js/vinculo-placa.js', 'site/js/unidade.js', 'site/js/filtro-cadastro.js',
    'site/js/filtro-veiculo.js', 'site/js/estado-filtros.js', 'site/js/barra-filtros.js']
    .forEach((f) => vm.runInContext(fs.readFileSync(path.join(RAIZ, f), 'utf8'), ctx, { filename: f }));
  assert.strictEqual(typeof ctx.filtroCadastroLib.janelasDoFiltro, 'function');
  assert.strictEqual(ctx.estadoFiltrosLib.filtrosPadrao(HOJE).tipoCadastro, '');
});

console.log(`\n${passou} casos ok`);
