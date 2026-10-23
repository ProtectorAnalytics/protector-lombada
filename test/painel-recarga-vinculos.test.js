/**
 * Painel aberto recarrega os vínculos (spec §5.1.6: "a próxima passagem já
 * aparece identificada"): passagem nova de placa sem vínculo vigente no
 * índice recarrega (no máximo 1 vez por minuto) e, com a aba visível, a cada
 * 5 min. Funções do <script> inline de dashboard/index.html num VM do Node.
 * Uso: node test/painel-recarga-vinculos.test.js
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const placaLib = require('../site/js/placa');
const vinculoPlacaLib = require('../site/js/vinculo-placa');

const PAINEL = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'index.html'), 'utf8');

function extrair(fonte, inicio) {
  const i = fonte.indexOf(inicio);
  if (i < 0) throw new Error(`não achei "${inicio}"`);
  let nivel = 0;
  // corpo = a chave depois de ") {" (parâmetros podem ter { } de desestruturação)
  for (let j = fonte.indexOf(') {', i) + 2; j < fonte.length; j++) {
    if (fonte[j] === '{') nivel++;
    else if (fonte[j] === '}' && --nivel === 0) return fonte.slice(i, j + 1);
  }
  throw new Error(`chaves desbalanceadas em "${inicio}"`);
}

function carregar(nomes, extras = {}) {
  const ctx = vm.createContext({ placaLib, vinculoPlacaLib, Date, Promise, ...extras });
  const consts = ['RECARGA_VINCULOS_MIN_MS', 'RECARGA_VINCULOS_PERIODO_MS']
    .map((n) => PAINEL.match(new RegExp(`const ${n} = [^;]+;`))[0]).join('\n').replace(/const /g, 'var ');
  const codigo = nomes.map((n) => extrair(PAINEL, `function ${n}(`)).join('\n');
  vm.runInContext(`${consts}\n${codigo}`, ctx);
  return ctx;
}

let passou = 0;
let falhou = 0;
const fila = [];
const caso = (nome, fn) => fila.push([nome, fn]);

const MIN = 60 * 1000;
const T0 = Date.parse('2026-10-22T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const indice = vinculoPlacaLib.indexarVinculos([
  { placa: 'AAA1A11', encerrado_em: null, vigente_desde: null, criado_em: '2026-01-01T00:00:00Z' },
  { placa: 'BBB2B22', encerrado_em: '2026-05-01T00:00:00Z', vigente_desde: null, criado_em: '2026-01-01T00:00:00Z' },
]);

caso('constantes: mínimo de 60 s e período de 5 min', () => {
  const ctx = carregar([]);
  assert.strictEqual(ctx.RECARGA_VINCULOS_MIN_MS, 60 * 1000);
  assert.strictEqual(ctx.RECARGA_VINCULOS_PERIODO_MS, 5 * 60 * 1000);
});

caso('passagem nova de placa sem vínculo vigente recarrega (passado o mínimo de 60 s)', () => {
  const { deveRecarregarVinculos: deve } = carregar(['deveRecarregarVinculos']);
  const caps = [{ placa: 'CCC3C33', timestamp: iso(T0 + 30 * 1000) }];
  assert.strictEqual(deve({ capturas: caps, indice, ultimaCargaMs: T0, agoraMs: T0 + 61 * 1000 }), true);
  assert.strictEqual(deve({ capturas: caps, indice, ultimaCargaMs: T0, agoraMs: T0 + 59 * 1000 }), false, 'mínimo de 60 s');
});

caso('placa já vigente, SEM PLACA ou passagem anterior à última carga não recarregam', () => {
  const { deveRecarregarVinculos: deve } = carregar(['deveRecarregarVinculos']);
  const agoraMs = T0 + 2 * MIN;
  // AAA1011 = AAA1A11 na grafia antiga (vigente)
  assert.strictEqual(deve({ capturas: [{ placa: 'AAA1011', timestamp: iso(T0 + 1000) }], indice, ultimaCargaMs: T0, agoraMs }), false);
  assert.strictEqual(deve({ capturas: [{ placa: 'SEM PLACA', timestamp: iso(T0 + 1000) }], indice, ultimaCargaMs: T0, agoraMs }), false);
  assert.strictEqual(deve({ capturas: [{ placa: 'CCC3C33', timestamp: iso(T0 - 1000) }], indice, ultimaCargaMs: T0, agoraMs }), false);
  assert.strictEqual(deve({ capturas: [], indice, ultimaCargaMs: T0, agoraMs }), false);
  // vínculo encerrado não conta como cadastrado: recadastro recente precisa recarregar
  assert.strictEqual(deve({ capturas: [{ placa: 'BBB2B22', timestamp: iso(T0 + 1000) }], indice, ultimaCargaMs: T0, agoraMs }), true);
});

caso('a cada 5 min recarrega mesmo sem passagem nova; nunca enquanto outra carga está em curso', () => {
  const { deveRecarregarVinculos: deve } = carregar(['deveRecarregarVinculos']);
  assert.strictEqual(deve({ capturas: [], indice, ultimaCargaMs: T0, agoraMs: T0 + 5 * MIN }), true);
  assert.strictEqual(deve({ capturas: [], indice, ultimaCargaMs: T0, agoraMs: T0 + 5 * MIN - 1 }), false);
  assert.strictEqual(deve({ capturas: [], indice, ultimaCargaMs: T0, agoraMs: T0 + 6 * MIN, emCurso: true }), false);
});

caso('recarregarVinculosSePreciso: uma carga por vez e devolve a promessa para quem espera', async () => {
  let cargas = 0;
  let liberar;
  const ctx = carregar(['deveRecarregarVinculos', 'recarregarVinculosSePreciso'], {
    indiceVinculos: indice, vinculosCargaEm: T0, vinculosRecarregando: null, veiculosCachePronto: Promise.resolve('antigo'),
    loadVeiculosCache: () => { cargas++; return new Promise((r) => { liberar = r; }); },
  });
  ctx.Date = { now: () => T0 + 6 * MIN, parse: Date.parse };
  const p1 = ctx.recarregarVinculosSePreciso([]);
  const p2 = ctx.recarregarVinculosSePreciso([{ placa: 'CCC3C33', timestamp: iso(T0 + 6 * MIN) }]);
  assert.strictEqual(cargas, 1);
  assert.strictEqual(p1, p2, 'a segunda espera a mesma carga');
  assert.strictEqual(ctx.veiculosCachePronto, p1, '"Não cadastrados" também espera a carga nova');
  liberar();
  await p1;
  assert.strictEqual(ctx.vinculosRecarregando, null);
  ctx.Date = { now: () => T0 + 6 * MIN + 1000, parse: Date.parse };
  ctx.vinculosCargaEm = T0 + 6 * MIN;
  assert.strictEqual(await ctx.recarregarVinculosSePreciso([]), undefined, 'sem motivo: devolve o cache pronto');
  assert.strictEqual(cargas, 1);
});

caso('ligações: carga marca a hora; cards esperam a recarga antes de desenhar; loadAll faz a periódica', () => {
  assert.ok(extrair(PAINEL, 'async function loadVeiculosCache(').includes('vinculosCargaEm = Date.now()'));
  const cards = extrair(PAINEL, 'async function loadRecentCards(');
  const iRecarga = cards.indexOf('await recarregarVinculosSePreciso(rawData');
  assert.ok(iRecarga > 0, 'loadRecentCards espera a recarga');
  assert.ok(iRecarga < cards.indexOf('container.innerHTML = data.map'), 'antes de desenhar os cards');
  assert.ok(extrair(PAINEL, 'async function loadAll(').includes('recarregarVinculosSePreciso([])'), 'periódica no ciclo do painel (só roda com a aba visível)');
});

(async () => {
  for (const [nome, fn] of fila) {
    try { await fn(); passou++; console.log(`ok - ${nome}`); }
    catch (e) { falhou++; console.log(`FALHOU - ${nome}\n  ${String(e && e.stack || e).split('\n').slice(0, 4).join('\n  ')}`); }
  }
  console.log(`${passou} casos passaram${falhou ? `, ${falhou} falharam` : ''}`);
  if (falhou) process.exit(1);
})();
