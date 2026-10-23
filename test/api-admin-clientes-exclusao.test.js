/**
 * /api/admin/clientes DELETE — exclusão permanente confere o erro de cada
 * etapa e para na primeira falha (supabase-js não lança). Offline: Supabase
 * stubado, dados fictícios. Uso: node test/api-admin-clientes-exclusao.test.js
 */
const assert = require('node:assert');
const path = require('node:path');

const CLI = '11111111-1111-4111-8111-111111111111';
const SEGREDO = 'detalhe-interno-secreto';
const estado = { ops: [], auditoria: [], falhaEm: null };

function stub(rel, exports) {
  const id = require.resolve(path.join('..', rel));
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

function tabela(nome) {
  const op = { tabela: nome, modo: 'select', filtros: [] };
  estado.ops.push(op);
  const resultado = () => {
    const chave = `${op.modo}:${nome}${op.filtros.includes('role') ? ':so_email' : ''}`;
    if (estado.falhaEm === chave) return { data: null, error: { code: 'XX000', message: SEGREDO } };
    if (op.modo === 'select') return { data: { nome: 'Condomínio Teste' }, error: null };
    return { data: null, error: null };
  };
  const q = {
    select() { return q; },
    delete() { op.modo = 'delete'; return q; },
    update() { op.modo = 'update'; return q; },
    eq(c) { op.filtros.push(c); return q; },
    single: () => Promise.resolve(resultado()),
    maybeSingle: () => Promise.resolve(resultado()),
    then(ok, falha) { return Promise.resolve(resultado()).then(ok, falha); },
  };
  return q;
}

stub('lib/auth-middleware', {
  autenticar: async () => ({ profile: { id: 'super-x', role: 'super_admin', cliente_id: null } }),
  verificarAcessoCliente: () => true,
  registrarAuditoria: async (a) => { estado.auditoria.push(a); return { error: null }; },
  supabase: { from: tabela },
});
stub('lib/destinatarios', { contarDestinatarios: async () => new Map() });

const handler = require('../api/admin/clientes');

async function excluir() {
  estado.ops = []; estado.auditoria = [];
  const r = { code: null, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } };
  await handler({ method: 'DELETE', headers: {}, query: { id: CLI, permanent: 'true' } }, r);
  return r;
}
const deletes = () => estado.ops.filter((o) => o.modo === 'delete').map((o) => o.tabela);

let passou = 0;
async function caso(nome, fn) { estado.falhaEm = null; await fn(); passou++; console.log(`ok - ${nome}`); }
console.error = () => {};

(async () => {
  await caso('exclusão permanente sem falha apaga tudo, por último o cliente, e audita', async () => {
    const r = await excluir();
    assert.strictEqual(r.code, 200);
    assert.deepStrictEqual(deletes(), ['veiculos', 'usuarios', 'cameras', 'usuarios', 'clientes']);
    assert.strictEqual(estado.auditoria.length, 1);
  });

  for (const etapa of ['delete:veiculos', 'delete:usuarios:so_email', 'delete:cameras', 'delete:usuarios']) {
    await caso(`falha em ${etapa} → 500, para ali, não apaga o cliente nem audita`, async () => {
      estado.falhaEm = etapa;
      const r = await excluir();
      assert.strictEqual(r.code, 500);
      assert.ok(!JSON.stringify(r.body).includes(SEGREDO));
      assert.ok(!deletes().includes('clientes'), 'cliente não pode ser apagado');
      assert.strictEqual(estado.auditoria.length, 0);
    });
  }

  await caso('falha ao ler o cliente → 500, nada apagado', async () => {
    estado.falhaEm = 'select:clientes';
    const r = await excluir();
    assert.strictEqual(r.code, 500);
    assert.deepStrictEqual(deletes(), []);
  });

  console.log(`\n${passou} casos ok`);
})().catch((e) => { console.log(e); process.exit(1); });
