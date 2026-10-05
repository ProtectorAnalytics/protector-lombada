/**
 * Cron de limpeza (15 dias) com o supabase-js stubado: as miniaturas saem do
 * Storage junto com os originais, em capturas e capturas_historico; erro no
 * remove é registrado e o registro é limpo mesmo assim; lotes grandes são
 * divididos em blocos.
 * Uso: node test/cron-limpeza.test.js
 */
const assert = require('node:assert');

let estado;
function zerar(tabelas, { erroRemove = null } = {}) {
  estado = { tabelas, removidos: [], blocos: [], updates: [], erroRemove, erros: [] };
}

function consulta(nome) {
  let modo = 'select';
  let patch = null;
  const q = {
    select: () => q, lt: () => q, not: () => q, eq: () => q, limit: () => q,
    in: (_c, ids) => { if (modo === 'update') estado.updates.push({ tabela: nome, patch, ids }); return q; },
    update: (p) => { modo = 'update'; patch = p; return q; },
    then(ok, ko) {
      let res = { data: [], error: null };
      if (modo === 'select') { res = { data: estado.tabelas[nome] || [], error: null }; estado.tabelas[nome] = []; }
      return Promise.resolve(res).then(ok, ko);
    },
  };
  return q;
}

const sdk = require.resolve('@supabase/supabase-js');
require.cache[sdk] = {
  id: sdk, filename: sdk, loaded: true,
  exports: {
    createClient: () => ({
      from: consulta,
      storage: {
        from: () => ({
          remove: async (paths) => {
            estado.blocos.push(paths.length);
            if (estado.erroRemove) return { error: { message: estado.erroRemove } };
            estado.removidos.push(...paths);
            return { error: null };
          },
        }),
      },
    }),
  },
};
process.env.CRON_SECRET = 'segredo-de-teste';
const handler = require('../api/cron-limpeza');

async function rodar() {
  let corpo = null;
  const res = { status() { return res; }, json(b) { corpo = b; return res; } };
  const errOriginal = console.error;
  console.error = (...a) => { estado.erros.push(a.join(' ')); };
  try {
    await handler({ method: 'GET', headers: { authorization: 'Bearer segredo-de-teste' } }, res);
  } finally { console.error = errOriginal; }
  return corpo;
}

let passou = 0;
const casos = [];
function caso(nome, fn) { casos.push(async () => { await fn(); passou++; console.log(`ok - ${nome}`); }); }

caso('miniaturas removidas junto com os originais (capturas e histórico)', async () => {
  zerar({
    capturas: [{ id: 1, foto_path: 'c/k/a.jpg' }, { id: 2, foto_path: 'c/k/b.jpg' }],
    capturas_historico: [{ id: 9, foto_path: 'c/k/h.jpg' }],
  });
  const corpo = await rodar();
  assert.strictEqual(corpo.ok, true);
  assert.deepStrictEqual(estado.removidos.sort(), [
    'c/k/a.jpg', 'c/k/a.mini.jpg', 'c/k/b.jpg', 'c/k/b.mini.jpg', 'c/k/h.jpg', 'c/k/h.mini.jpg',
  ]);
  // Os contadores seguem contando fotos (originais), não arquivos
  assert.strictEqual(corpo.capturas.fotos, 2);
  assert.strictEqual(corpo.capturas_historico.fotos, 1);
});

caso('erro no remove é registrado e o registro é limpo mesmo assim', async () => {
  zerar({
    capturas: [{ id: 1, foto_path: 'c/k/a.jpg' }],
    capturas_historico: [{ id: 9, foto_path: 'c/k/h.jpg' }],
  }, { erroRemove: 'storage fora' });
  const corpo = await rodar();
  assert.strictEqual(corpo.ok, true);
  assert.ok(estado.erros.some((e) => /capturas storage: storage fora/.test(e)));
  assert.ok(estado.erros.some((e) => /historico storage: storage fora/.test(e)));
  assert.deepStrictEqual(estado.updates.find((u) => u.tabela === 'capturas'), { tabela: 'capturas', patch: { foto_path: null }, ids: [1] });
  assert.deepStrictEqual(
    estado.updates.find((u) => u.tabela === 'capturas_historico'),
    { tabela: 'capturas_historico', patch: { foto_path: null, foto_disponivel: false }, ids: [9] },
  );
});

caso('mais de 500 arquivos são removidos em blocos de até 500', async () => {
  const linhas = Array.from({ length: 300 }, (_, i) => ({ id: i, foto_path: `c/k/f${i}.jpg` }));
  zerar({ capturas: linhas, capturas_historico: [] });
  const corpo = await rodar();
  assert.deepStrictEqual(estado.blocos, [500, 100]); // 300 fotos = 600 arquivos
  assert.strictEqual(new Set(estado.removidos).size, 600);
  assert.strictEqual(corpo.capturas.fotos, 300);
});

(async () => {
  for (const c of casos) await c();
  console.log(`\n${passou} casos ok`);
})().catch((e) => { console.error(e); process.exit(1); });
