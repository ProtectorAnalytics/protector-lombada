/**
 * /api/admin/usuarios e os contatos "Só recebe e-mail" (role so_email,
 * auth_id nulo, Portaria 2.2): o GET devolve as duas opções; criar so_email,
 * trocar senha/tipo/e-mail/cliente dele por aqui é recusado ("use Avisos por
 * e-mail"); desativar/excluir nunca chama o Supabase Auth com auth_id nulo.
 * Offline, módulos stubados, dados fictícios.
 * Uso: node test/api-admin-usuarios-so-email.test.js
 */
const assert = require('node:assert');
const path = require('node:path');

const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const estado = {};
let linhas;

function reset() {
  linhas = [
    { id: 'u-so', auth_id: null, cliente_id: C1, nome: 'Contato Teste', email: 'contato@exemplo.test', role: 'so_email', ativo: true, recebe_alertas: true, recebe_relatorio: false },
    { id: 'u-op', auth_id: 'auth-op', cliente_id: C1, nome: 'Ana Teste', email: 'ana@exemplo.test', role: 'operador', ativo: true, recebe_alertas: null, recebe_relatorio: true },
  ];
  Object.assign(estado, {
    perfil: { id: 'u-super', role: 'super_admin' },
    inserts: [], updates: [], deletes: 0, auth: [], rpc: [], auditoria: [],
  });
}

function stub(rel, exports) {
  const id = require.resolve(path.join('..', rel));
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

function tabela() {
  const op = { modo: 'select', patch: null, filtros: [] };
  const casam = () => linhas.filter((l) => op.filtros.every(([c, v]) => l[c] === v));
  const um = () => {
    if (op.modo === 'insert') return Promise.resolve({ data: { id: 'novo', ...op.patch }, error: null });
    const l = casam()[0];
    if (op.modo === 'update' && l) Object.assign(l, op.patch);
    if (op.modo === 'delete') estado.deletes++;
    return Promise.resolve({ data: l ? { ...l } : null, error: null });
  };
  const q = {
    select() { return q; },
    order() { return q; },
    insert(p) { op.modo = 'insert'; op.patch = p; estado.inserts.push(p); return q; },
    update(p) { op.modo = 'update'; op.patch = p; estado.updates.push(p); return q; },
    delete() { op.modo = 'delete'; return q; },
    eq(c, v) { op.filtros.push([c, v]); return q; },
    single: um,
    maybeSingle: um,
    then(ok, ko) {
      if (op.modo === 'delete') { estado.deletes++; return Promise.resolve({ error: null }).then(ok, ko); }
      return Promise.resolve({ data: casam().map((l) => ({ ...l })), error: null }).then(ok, ko);
    },
  };
  return q;
}

const registrarAuth = (nome) => async (...args) => { estado.auth.push([nome, ...args]); return { data: { user: { id: 'auth-x' } }, error: null }; };

stub('lib/auth-middleware', {
  autenticar: async (req, roles) => {
    if (!roles.includes(estado.perfil.role)) throw { status: 403, error: 'Permissão insuficiente' };
    return { profile: estado.perfil };
  },
  verificarAcessoCliente: (p, c) => p.role === 'super_admin' || p.cliente_id === c,
  registrarAuditoria: async (a) => { estado.auditoria.push(a); return { error: null }; },
  supabase: {
    from: tabela,
    rpc: async (nome, args) => { estado.rpc.push([nome, args]); return { data: null, error: null }; },
    auth: { admin: {
      createUser: registrarAuth('createUser'),
      updateUserById: registrarAuth('updateUserById'),
      deleteUser: registrarAuth('deleteUser'),
    } },
  },
});

const handler = require('../api/admin/usuarios');
console.error = () => {};

async function chamar(method, { body, query = {} } = {}) {
  const r = { code: null, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  await handler({ method, headers: {}, query, body }, r);
  return r;
}

let passou = 0;
async function caso(nome, fn) { reset(); await fn(); passou++; console.log(`ok - ${nome}`); }

(async () => {
  await caso('GET do cliente devolve recebe_alertas e recebe_relatorio como booleanos', async () => {
    const r = await chamar('GET', { query: { cliente_id: C1 } });
    assert.strictEqual(r.code, 200);
    const so = r.body.find((u) => u.id === 'u-so');
    const op = r.body.find((u) => u.id === 'u-op');
    assert.strictEqual(so.recebe_alertas, true);
    assert.strictEqual(so.recebe_relatorio, false);
    assert.strictEqual(op.recebe_alertas, false);
    assert.strictEqual(op.recebe_relatorio, true);
  });
  await caso('GET global (super_admin sem cliente) também traz as opções', async () => {
    const r = await chamar('GET');
    assert.strictEqual(r.code, 200);
    assert.ok(r.body.every((u) => typeof u.recebe_alertas === 'boolean' && typeof u.recebe_relatorio === 'boolean'));
  });
  await caso('GET de admin_cliente em outro cliente continua 403', async () => {
    estado.perfil = { id: 'u-sind', role: 'admin_cliente', cliente_id: C2 };
    assert.strictEqual((await chamar('GET', { query: { cliente_id: C1 } })).code, 403);
  });

  await caso('POST role so_email → 400 "use Avisos por e-mail", sem Auth e sem insert', async () => {
    for (const body of [
      { email: 'novo@exemplo.test', nome: 'Novo', role: 'so_email', cliente_id: C1 },
      { email: 'novo@exemplo.test', senha: 'Qualquer123', nome: 'Novo', role: 'so_email', cliente_id: C1 },
    ]) {
      const r = await chamar('POST', { body });
      assert.strictEqual(r.code, 400);
      assert.match(r.body.error, /use Avisos por e-mail/);
    }
    assert.deepStrictEqual(estado.auth, []);
    assert.deepStrictEqual(estado.inserts, []);
  });

  await caso('PUT em so_email com senha, role, e-mail ou cliente → 400, nada gravado, sem Auth', async () => {
    for (const extra of [{ senha: 'Tucano8Verde' }, { role: 'operador' }, { role: 'admin_cliente', senha: 'Tucano8Verde' }, { email: 'outro@exemplo.test' }, { cliente_id: C2 }]) {
      const r = await chamar('PUT', { body: { id: 'u-so', ...extra } });
      assert.strictEqual(r.code, 400, JSON.stringify(extra));
      assert.match(r.body.error, /use Avisos por e-mail/);
    }
    assert.deepStrictEqual(estado.updates, []);
    assert.deepStrictEqual(estado.auth, []);
  });
  await caso('PUT em so_email com os mesmos role/e-mail/cliente (sem mudar) e nome novo passa', async () => {
    const r = await chamar('PUT', { body: { id: 'u-so', nome: 'Contato Novo', role: 'so_email', cliente_id: C1 } });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(linhas[0].nome, 'Contato Novo');
    assert.deepStrictEqual(estado.auth, []);
  });
  await caso('PUT reativando so_email não chama o Auth', async () => {
    linhas[0].ativo = false;
    const r = await chamar('PUT', { body: { id: 'u-so', ativo: true } });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(linhas[0].ativo, true);
    assert.deepStrictEqual(estado.auth, []);
    assert.deepStrictEqual(estado.rpc, []);
  });
  await caso('PUT transformando usuário com login em so_email → 400', async () => {
    const r = await chamar('PUT', { body: { id: 'u-op', role: 'so_email' } });
    assert.strictEqual(r.code, 400);
    assert.match(r.body.error, /use Avisos por e-mail/);
    assert.deepStrictEqual(estado.updates, []);
  });

  await caso('DELETE (desativar) de so_email desativa sem Auth nem RPC', async () => {
    const r = await chamar('DELETE', { query: { id: 'u-so' } });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(linhas[0].ativo, false);
    assert.deepStrictEqual(estado.auth, []);
    assert.deepStrictEqual(estado.rpc, []);
  });
  await caso('DELETE permanente de so_email apaga a linha e não chama deleteUser', async () => {
    const r = await chamar('DELETE', { query: { id: 'u-so', permanent: 'true' } });
    assert.strictEqual(r.code, 200);
    assert.ok(estado.deletes > 0);
    assert.deepStrictEqual(estado.auth, []);
  });

  console.log(`${passou} testes passaram`);
})().catch((e) => { process.stderr.write(`${e.stack}\n`); process.exit(1); });
