/**
 * Cron de limpeza (15 dias) com o supabase-js stubado: as miniaturas saem do
 * Storage junto com os originais, em capturas e capturas_historico.
 * Uso: node test/cron-limpeza.test.js
 */
const assert = require('node:assert');

const estado = {
  tabelas: {
    capturas: [{ id: 1, foto_path: 'c/k/a.jpg' }, { id: 2, foto_path: 'c/k/b.jpg' }],
    capturas_historico: [{ id: 9, foto_path: 'c/k/h.jpg' }],
  },
  removidos: [],
};

function consulta(nome) {
  let modo = 'select';
  const q = {
    select: () => q, lt: () => q, not: () => q, eq: () => q, limit: () => q, in: () => q,
    update: () => { modo = 'update'; return q; },
    then(ok, ko) {
      let res = { data: [], error: null };
      if (modo === 'select') { res = { data: estado.tabelas[nome], error: null }; estado.tabelas[nome] = []; }
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
      storage: { from: () => ({ remove: async (paths) => { estado.removidos.push(...paths); return { error: null }; } }) },
    }),
  },
};
process.env.CRON_SECRET = 'segredo-de-teste';
const handler = require('../api/cron-limpeza');

(async () => {
  let corpo = null;
  const res = { status() { return res; }, json(b) { corpo = b; return res; } };
  await handler({ method: 'GET', headers: { authorization: 'Bearer segredo-de-teste' } }, res);

  assert.strictEqual(corpo.ok, true);
  assert.deepStrictEqual(estado.removidos.sort(), [
    'c/k/a.jpg', 'c/k/a.mini.jpg', 'c/k/b.jpg', 'c/k/b.mini.jpg', 'c/k/h.jpg', 'c/k/h.mini.jpg',
  ]);
  // Os contadores seguem contando fotos (originais), não arquivos
  assert.strictEqual(corpo.capturas.fotos, 2);
  assert.strictEqual(corpo.capturas_historico.fotos, 1);
  console.log('ok - miniaturas removidas junto com os originais (capturas e histórico)');
})().catch((e) => { console.error(e); process.exit(1); });
