/**
 * Miniaturas leves das fotos: caminho derivado do original, escolha da URL
 * (miniatura com recuo para o original) e cache de URL assinada com relógio
 * injetado.
 * Uso: node test/miniatura.test.js
 */
const assert = require('node:assert');
const {
  caminhoMiniatura, comMiniaturas, escolherFoto, urlAindaVale, criarCacheUrlAssinada,
} = require('../site/js/miniatura');

let passou = 0;
const pendentes = [];
function caso(nome, fn) {
  pendentes.push(async () => { await fn(); passou++; console.log(`ok - ${nome}`); });
}

// ---- caminhoMiniatura
caso('troca a extensão .jpg por .mini.jpg na mesma pasta', () => {
  assert.strictEqual(caminhoMiniatura('a/b/x.jpg'), 'a/b/x.mini.jpg');
  assert.strictEqual(
    caminhoMiniatura('c1/cam2/2026-10-05T12-00-00_ABC1D23.jpg'),
    'c1/cam2/2026-10-05T12-00-00_ABC1D23.mini.jpg',
  );
});
caso('aceita .jpeg e extensão em maiúsculas', () => {
  assert.strictEqual(caminhoMiniatura('a/x.jpeg'), 'a/x.mini.jpg');
  assert.strictEqual(caminhoMiniatura('a/x.JPG'), 'a/x.mini.jpg');
});
caso('sem extensão, acrescenta .mini.jpg', () => {
  assert.strictEqual(caminhoMiniatura('a/x'), 'a/x.mini.jpg');
});
caso('caminho que já é miniatura volta igual', () => {
  assert.strictEqual(caminhoMiniatura('a/x.mini.jpg'), 'a/x.mini.jpg');
});
caso('caminho vazio ou inválido devolve null', () => {
  assert.strictEqual(caminhoMiniatura(''), null);
  assert.strictEqual(caminhoMiniatura(null), null);
  assert.strictEqual(caminhoMiniatura(undefined), null);
  assert.strictEqual(caminhoMiniatura(42), null);
});
caso('o ponto de uma pasta não vira extensão', () => {
  assert.strictEqual(caminhoMiniatura('a.b/x'), 'a.b/x.mini.jpg');
});

// ---- comMiniaturas
caso('lista a miniatura e o original de cada foto, sem repetir nem vazios', () => {
  assert.deepStrictEqual(
    comMiniaturas(['a/x.jpg', null, 'a/y.jpg', 'a/x.jpg', '']),
    ['a/x.mini.jpg', 'a/x.jpg', 'a/y.mini.jpg', 'a/y.jpg'],
  );
});

// ---- escolherFoto
caso('usa a miniatura e guarda o original para o recuo', () => {
  const urls = { 'a/x.mini.jpg': 'U-MINI', 'a/x.jpg': 'U-ORIG' };
  assert.deepStrictEqual(escolherFoto('a/x.jpg', urls), { src: 'U-MINI', original: 'U-ORIG' });
});
caso('sem miniatura (captura antiga), usa o original e não há recuo', () => {
  const urls = { 'a/x.mini.jpg': null, 'a/x.jpg': 'U-ORIG' };
  assert.deepStrictEqual(escolherFoto('a/x.jpg', urls), { src: 'U-ORIG', original: null });
});
caso('nenhuma URL ou sem foto devolve null', () => {
  assert.strictEqual(escolherFoto('a/x.jpg', {}), null);
  assert.strictEqual(escolherFoto(null, { 'a/x.jpg': 'U' }), null);
});
caso('só a miniatura assinada: mostra a miniatura sem recuo', () => {
  assert.deepStrictEqual(escolherFoto('a/x.jpg', { 'a/x.mini.jpg': 'U-MINI' }), { src: 'U-MINI', original: null });
});

// ---- urlAindaVale
caso('reusa enquanto faltar mais que a margem para expirar', () => {
  const e = { url: 'U', expiraEm: 1_000_000 };
  assert.strictEqual(urlAindaVale(e, 1_000_000 - 300_001, 300_000), true);
  assert.strictEqual(urlAindaVale(e, 1_000_000 - 300_000, 300_000), false);
  assert.strictEqual(urlAindaVale(e, 1_000_000 + 1, 300_000), false);
});
caso('entrada ausente ou malformada não vale', () => {
  assert.strictEqual(urlAindaVale(null, 0, 300_000), false);
  assert.strictEqual(urlAindaVale({ url: '', expiraEm: 9e15 }, 0, 300_000), false);
  assert.strictEqual(urlAindaVale({ url: 'U', expiraEm: NaN }, 0, 300_000), false);
});

// ---- criarCacheUrlAssinada
function montar({ falharPaths = [], lancar = false } = {}) {
  const chamadas = [];
  let agora = 1_000_000;
  let n = 0;
  const assinar = async (paths, ttl) => {
    chamadas.push({ paths: [...paths], ttl });
    if (lancar) throw new Error('rede');
    return paths.map((p) => (falharPaths.includes(p)
      ? { path: p, signedUrl: null, error: 'Either the object does not exist or you do not have access to it' }
      : { path: p, signedUrl: `https://x/${p}?t=${++n}`, error: null }));
  };
  const cache = criarCacheUrlAssinada({ assinar, agora: () => agora, ttlSegundos: 3600, margemSegundos: 300 });
  return { cache, chamadas, avancar: (ms) => { agora += ms; } };
}

caso('assina em lote numa chamada só, com TTL de 3600 s', async () => {
  const { cache, chamadas } = montar();
  const urls = await cache.urls(['a', 'b', 'c']);
  assert.strictEqual(chamadas.length, 1);
  assert.deepStrictEqual(chamadas[0], { paths: ['a', 'b', 'c'], ttl: 3600 });
  assert.ok(urls.a && urls.b && urls.c);
});
caso('polling seguinte reaproveita a mesma URL (sem nova chamada)', async () => {
  const { cache, chamadas, avancar } = montar();
  const u1 = await cache.urls(['a', 'b']);
  avancar(30_000);
  const u2 = await cache.urls(['a', 'b']);
  assert.strictEqual(chamadas.length, 1);
  assert.deepStrictEqual(u2, u1);
});
caso('só assina o que falta no cache', async () => {
  const { cache, chamadas } = montar();
  await cache.urls(['a']);
  await cache.urls(['a', 'b']);
  assert.strictEqual(chamadas.length, 2);
  assert.deepStrictEqual(chamadas[1].paths, ['b']);
});
caso('a 5 min de expirar, assina de novo', async () => {
  const { cache, chamadas, avancar } = montar();
  const u1 = await cache.urls(['a']);
  avancar(3600_000 - 300_000 - 1);
  await cache.urls(['a']);
  assert.strictEqual(chamadas.length, 1);
  avancar(1);
  const u3 = await cache.urls(['a']);
  assert.strictEqual(chamadas.length, 2);
  assert.notStrictEqual(u3.a, u1.a);
});
caso('erro por item vira null e não fica no cache', async () => {
  const { cache, chamadas } = montar({ falharPaths: ['a.mini'] });
  const u = await cache.urls(['a.mini', 'a']);
  assert.strictEqual(u['a.mini'], null);
  assert.ok(u.a);
  await cache.urls(['a.mini', 'a']);
  assert.strictEqual(chamadas.length, 2);
  assert.deepStrictEqual(chamadas[1].paths, ['a.mini']);
});
caso('falha da chamada inteira devolve null para todos, sem lançar', async () => {
  const { cache } = montar({ lancar: true });
  assert.deepStrictEqual(await cache.urls(['a', 'b']), { a: null, b: null });
});
caso('lista vazia ou só nulos não chama a API', async () => {
  const { cache, chamadas } = montar();
  assert.deepStrictEqual(await cache.urls([]), {});
  assert.deepStrictEqual(await cache.urls([null, '']), {});
  assert.strictEqual(chamadas.length, 0);
});
caso('limpar() zera o cache', async () => {
  const { cache, chamadas } = montar();
  await cache.urls(['a']);
  cache.limpar();
  assert.strictEqual(cache.tamanho(), 0);
  await cache.urls(['a']);
  assert.strictEqual(chamadas.length, 2);
});
caso('resposta em voo de antes do limpar() não volta para o cache', async () => {
  let soltar;
  const trava = new Promise((r) => { soltar = r; });
  const cache = criarCacheUrlAssinada({
    assinar: async (paths) => { await trava; return paths.map((p) => ({ path: p, signedUrl: `U-${p}`, error: null })); },
    agora: () => 0,
  });
  const emVoo = cache.urls(['a']);
  cache.limpar(); // troca de sessão enquanto a assinatura estava em voo
  soltar();
  await emVoo;
  assert.strictEqual(cache.tamanho(), 0);
});
caso('expiradas são descartadas ao gravar novas', async () => {
  const { cache, avancar } = montar();
  await cache.urls(['a', 'b']);
  avancar(3600_000 + 1);
  await cache.urls(['c']);
  assert.strictEqual(cache.tamanho(), 1);
});
caso('resposta fora de ordem é casada pelo path', async () => {
  const cache = criarCacheUrlAssinada({
    assinar: async (paths) => paths.slice().reverse().map((p) => ({ path: p, signedUrl: `U-${p}`, error: null })),
    agora: () => 0,
  });
  assert.deepStrictEqual(await cache.urls(['a', 'b']), { a: 'U-a', b: 'U-b' });
});

(async () => {
  for (const p of pendentes) await p();
  console.log(`\n${passou} casos ok`);
})().catch((e) => { console.error(e); process.exit(1); });
