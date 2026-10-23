/**
 * /api/admin/clientes DELETE — exclusão permanente é uma única chamada à RPC
 * excluir_cliente_permanente (transação no banco) e confere o `error` dela
 * (supabase-js não lança). Offline: Supabase stubado, dados fictícios.
 * Uso: node test/api-admin-clientes-exclusao.test.js
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const CLI = '11111111-1111-4111-8111-111111111111';
const SEGREDO = 'detalhe-interno-secreto';
const estado = { ops: [], rpcs: [], auditoria: [], falhaEm: null };

function stub(rel, exports) {
  const id = require.resolve(path.join('..', rel));
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

function tabela(nome) {
  const op = { tabela: nome, modo: 'select', filtros: [] };
  estado.ops.push(op);
  const resultado = () => {
    if (estado.falhaEm === `${op.modo}:${nome}`) return { data: null, error: { code: 'XX000', message: SEGREDO } };
    if (op.modo !== 'delete') return { data: { nome: 'Condomínio Teste' }, error: null };
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

async function rpc(nome, args) {
  estado.rpcs.push({ nome, args });
  if (estado.falhaEm === `rpc:${nome}`) return { data: null, error: { code: 'XX000', message: SEGREDO } };
  return { data: { clientes: 1, cameras: 2, capturas: 10 }, error: null };
}

stub('lib/auth-middleware', {
  autenticar: async () => ({ profile: { id: 'super-x', role: 'super_admin', cliente_id: null } }),
  verificarAcessoCliente: () => true,
  registrarAuditoria: async (a) => { estado.auditoria.push(a); return { error: null }; },
  supabase: { from: tabela, rpc },
});
stub('lib/destinatarios', { contarDestinatarios: async () => new Map() });

const handler = require('../api/admin/clientes');

async function excluir() {
  estado.ops = []; estado.rpcs = []; estado.auditoria = [];
  const r = { code: null, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } };
  await handler({ method: 'DELETE', headers: {}, query: { id: CLI, permanent: 'true' } }, r);
  return r;
}
const deletes = () => estado.ops.filter((o) => o.modo === 'delete').map((o) => o.tabela);

let passou = 0;
async function caso(nome, fn) { estado.falhaEm = null; await fn(); passou++; console.log(`ok - ${nome}`); }
console.error = () => {};

(async () => {
  await caso('exclusão permanente chama a RPC uma vez, sem deletes avulsos, e audita', async () => {
    const r = await excluir();
    assert.strictEqual(r.code, 200);
    assert.deepStrictEqual(estado.rpcs, [{ nome: 'excluir_cliente_permanente', args: { p_cliente: CLI } }]);
    assert.deepStrictEqual(deletes(), [], 'nenhum delete fora da transação');
    assert.strictEqual(estado.auditoria.length, 1);
    assert.strictEqual(estado.auditoria[0].acao, 'excluir');
    assert.deepStrictEqual(estado.auditoria[0].detalhes.removidos, { clientes: 1, cameras: 2, capturas: 10 });
  });

  await caso('falha na RPC → 500 sem vazar detalhe e sem auditar', async () => {
    estado.falhaEm = 'rpc:excluir_cliente_permanente';
    const r = await excluir();
    assert.strictEqual(r.code, 500);
    assert.ok(!JSON.stringify(r.body).includes(SEGREDO));
    assert.strictEqual(estado.auditoria.length, 0);
  });

  await caso('falha ao ler o cliente → 500, RPC não é chamada', async () => {
    estado.falhaEm = 'select:clientes';
    const r = await excluir();
    assert.strictEqual(r.code, 500);
    assert.deepStrictEqual(estado.rpcs, []);
  });

  await caso('desativar (sem permanent) não chama a RPC', async () => {
    estado.ops = []; estado.rpcs = [];
    const r = { code: null, status(c) { r.code = c; return r; }, json() { return r; } };
    await handler({ method: 'DELETE', headers: {}, query: { id: CLI } }, r);
    assert.strictEqual(r.code, 200);
    assert.deepStrictEqual(estado.rpcs, []);
  });

  await caso('migration da RPC: security definer, search_path vazio, só service_role', async () => {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'migration-excluir-cliente-atomico.sql'), 'utf8');
    assert.match(sql, /create or replace function public\.excluir_cliente_permanente\(p_cliente uuid\)/);
    assert.match(sql, /security definer/);
    assert.match(sql, /set search_path = ''/);
    assert.match(sql, /revoke all on function public\.excluir_cliente_permanente\(uuid\) from public, anon, authenticated;/);
    assert.match(sql, /grant execute on function public\.excluir_cliente_permanente\(uuid\) to service_role;/);
    for (const t of ['veiculos', 'capturas', 'cameras', 'unidades', 'porteiros', 'email_destinatarios', 'relatorio_envios', 'usuarios', 'clientes']) {
      assert.match(sql, new RegExp(`delete from public\\.${t}\\s`), `apaga ${t}`);
    }
  });

  console.log(`\n${passou} casos ok`);
})().catch((e) => { console.log(e); process.exit(1); });
