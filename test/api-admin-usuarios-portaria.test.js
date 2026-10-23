/**
 * /api/admin/usuarios aceita role 'portaria' (exige cliente_id). Offline, módulos stubados.
 * Uso: node test/api-admin-usuarios-portaria.test.js
 */
const assert = require('node:assert');
const path = require('node:path');

const C1 = '11111111-1111-4111-8111-111111111111';
const estado = { perfil: { id: 'u-super', role: 'super_admin' }, inserts: [], authCriados: [] };

function stub(rel, exports) {
  const id = require.resolve(path.join('..', rel));
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

function tabela() {
  const op = { modo: 'select', patch: null };
  const q = {
    select() { return q; },
    insert(p) { op.modo = 'insert'; op.patch = p; estado.inserts.push(p); return q; },
    update() { return q; },
    eq() { return q; },
    single() { return Promise.resolve({ data: op.patch ? { id: 'novo', ...op.patch } : null, error: null }); },
  };
  return q;
}

stub('lib/auth-middleware', {
  autenticar: async (req, roles) => {
    if (!roles.includes(estado.perfil.role)) throw { status: 403, error: 'Permissão insuficiente' };
    return { profile: estado.perfil };
  },
  verificarAcessoCliente: () => true,
  registrarAuditoria: async () => ({ error: null }),
  supabase: {
    from: tabela,
    auth: { admin: {
      createUser: async (a) => { estado.authCriados.push(a); return { data: { user: { id: 'auth-1' } }, error: null }; },
      deleteUser: async () => ({}),
    } },
  },
});

const handler = require('../api/admin/usuarios');

function resp() {
  const r = { code: null, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
async function post(body) {
  estado.inserts = []; estado.authCriados = [];
  const r = resp();
  await handler({ method: 'POST', headers: {}, query: {}, body }, r);
  return r;
}
const base = { email: 'portaria@x.com', senha: 'Senha#1234', nome: 'Portaria' };

(async () => {
  let r = await post({ ...base, role: 'portaria', cliente_id: C1 });
  assert.strictEqual(r.code, 201);
  assert.strictEqual(estado.inserts[0].role, 'portaria');
  assert.strictEqual(estado.inserts[0].cliente_id, C1);
  console.log('ok - portaria com cliente_id aceito');

  r = await post({ ...base, role: 'portaria' });
  assert.strictEqual(r.code, 400);
  assert.strictEqual(estado.authCriados.length, 0);
  console.log('ok - portaria sem cliente_id → 400 sem criar login');

  r = await post({ ...base, role: 'inexistente', cliente_id: C1 });
  assert.strictEqual(r.code, 400);
  console.log('ok - role desconhecido continua 400');
  console.log('3 testes passaram');
})().catch((e) => { console.error(e); process.exit(1); });
