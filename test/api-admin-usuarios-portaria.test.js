/**
 * /api/admin/usuarios aceita role 'portaria' (exige cliente_id) e, para esse
 * role, aplica a mesma regra de senha de /api/admin/porteiros e encerra as
 * sessões na troca de senha e no desativar. Offline, módulos stubados.
 * Uso: node test/api-admin-usuarios-portaria.test.js
 */
const assert = require('node:assert');
const path = require('node:path');

const C1 = '11111111-1111-4111-8111-111111111111';
const SEGREDO = 'detalhe-interno-secreto';
const estado = {};
let linhas;

function reset() {
  linhas = [
    { id: 'u-port', auth_id: 'auth-port', cliente_id: C1, nome: 'José Silva', email: 'jose.castelo@porteiro.invalid', role: 'portaria', ativo: true },
    { id: 'u-op', auth_id: 'auth-op', cliente_id: C1, nome: 'Ana Lima', email: 'ana@cond.com', role: 'operador', ativo: true },
  ];
  Object.assign(estado, {
    perfil: { id: 'u-super', role: 'super_admin' },
    inserts: [], updates: [], authCriados: [], authAtualizados: [], rpc: [], auditoria: [],
    erroAuthCriar: null, erroAuthAtualizar: null, erroRpc: null,
  });
}

function stub(rel, exports) {
  const id = require.resolve(path.join('..', rel));
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

function tabela() {
  const op = { modo: 'select', patch: null, filtros: [] };
  const alvo = () => linhas.find((l) => op.filtros.every(([c, v]) => l[c] === v));
  const um = () => {
    if (op.modo === 'insert') return Promise.resolve({ data: { id: 'novo', ...op.patch }, error: null });
    const l = alvo();
    if (op.modo === 'update' && l) Object.assign(l, op.patch);
    return Promise.resolve({ data: l ? { ...l } : null, error: null });
  };
  const q = {
    select() { return q; },
    insert(p) { op.modo = 'insert'; op.patch = p; estado.inserts.push(p); return q; },
    update(p) { op.modo = 'update'; op.patch = p; estado.updates.push(p); return q; },
    eq(c, v) { op.filtros.push([c, v]); return q; },
    single: um,
    maybeSingle: um,
  };
  return q;
}

stub('lib/auth-middleware', {
  autenticar: async (req, roles) => {
    if (!roles.includes(estado.perfil.role)) throw { status: 403, error: 'Permissão insuficiente' };
    return { profile: estado.perfil };
  },
  verificarAcessoCliente: () => true,
  registrarAuditoria: async (a) => { estado.auditoria.push(a); return { error: null }; },
  supabase: {
    from: tabela,
    rpc: async (nome, args) => { estado.rpc.push([nome, args]); return { data: null, error: estado.erroRpc }; },
    auth: { admin: {
      createUser: async (a) => {
        estado.authCriados.push(a);
        if (estado.erroAuthCriar) return { data: { user: null }, error: estado.erroAuthCriar };
        return { data: { user: { id: 'auth-1' } }, error: null };
      },
      updateUserById: async (id, a) => { estado.authAtualizados.push([id, a]); return { data: {}, error: estado.erroAuthAtualizar }; },
      deleteUser: async () => ({}),
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
const base = { email: 'portaria@x.com', senha: 'Tucano8Verde', nome: 'Carlos Souza' };
const ENCERRAR = [['encerrar_sessoes_usuario', { p_user: 'auth-port' }]];

let passou = 0;
async function caso(nome, fn) { reset(); await fn(); passou++; console.log(`ok - ${nome}`); }

(async () => {
  await caso('portaria com cliente_id aceito', async () => {
    const r = await chamar('POST', { body: { ...base, role: 'portaria', cliente_id: C1 } });
    assert.strictEqual(r.code, 201);
    assert.strictEqual(estado.inserts[0].role, 'portaria');
    assert.strictEqual(estado.inserts[0].cliente_id, C1);
  });
  await caso('portaria sem cliente_id → 400 sem criar login', async () => {
    const r = await chamar('POST', { body: { ...base, role: 'portaria' } });
    assert.strictEqual(r.code, 400);
    assert.strictEqual(estado.authCriados.length, 0);
  });
  await caso('role desconhecido continua 400', async () => {
    assert.strictEqual((await chamar('POST', { body: { ...base, role: 'inexistente', cliente_id: C1 } })).code, 400);
  });

  await caso('POST portaria com senha fraca → 400 com a regra do porteiro, sem criar login', async () => {
    for (const senha of ['curta1', 'Portaria2026', 'aaaaaaaaa1', 'Carlos2026xy', 'xxportaria9z']) {
      const r = await chamar('POST', { body: { ...base, senha, role: 'portaria', cliente_id: C1 } });
      assert.strictEqual(r.code, 400, senha);
      assert.strictEqual(estado.authCriados.length, 0, senha);
    }
    const r = await chamar('POST', { body: { ...base, senha: 'Carlos2026xy', role: 'portaria', cliente_id: C1 } });
    assert.match(r.body.error, /nome/);
  });
  await caso('POST de outro role não usa a regra do porteiro', async () => {
    const r = await chamar('POST', { body: { ...base, senha: 'Portaria2026', role: 'operador', cliente_id: C1 } });
    assert.strictEqual(r.code, 201);
  });
  await caso('POST: erro do Auth não vaza a mensagem crua', async () => {
    estado.erroAuthCriar = { message: SEGREDO };
    const r = await chamar('POST', { body: { ...base, role: 'operador', cliente_id: C1 } });
    assert.strictEqual(r.code, 400);
    assert.ok(!JSON.stringify(r.body).includes(SEGREDO));
  });

  await caso('PUT senha de porteiro: regra contra usuário e nome NOVO; nada é gravado se fraca', async () => {
    for (const body of [{ senha: 'Jose7Tucano9' }, { senha: 'castelo2026x' }, { senha: 'aaaaaaaaa1' }, { nome: 'Pedro Alves', senha: 'Pedro2026xy' }]) {
      const r = await chamar('PUT', { body: { id: 'u-port', ...body } });
      assert.strictEqual(r.code, 400, JSON.stringify(body));
      assert.strictEqual(estado.updates.length, 0);
      assert.strictEqual(estado.authAtualizados.length, 0);
    }
  });
  await caso('PUT promovendo operador a portaria aplica a regra', async () => {
    const r = await chamar('PUT', { body: { id: 'u-op', role: 'portaria', senha: 'Portaria2026' } });
    assert.strictEqual(r.code, 400);
    assert.strictEqual(estado.updates.length, 0);
  });
  await caso('PUT senha de porteiro válida → troca e encerra sessões', async () => {
    const r = await chamar('PUT', { body: { id: 'u-port', senha: 'Tucano8Verde' } });
    assert.strictEqual(r.code, 200);
    assert.deepStrictEqual(estado.authAtualizados, [['auth-port', { password: 'Tucano8Verde' }]]);
    assert.deepStrictEqual(estado.rpc, ENCERRAR);
    assert.strictEqual(r.body.aviso, undefined);
    assert.strictEqual(estado.auditoria[0].detalhes.sessoes_encerradas, true);
    assert.ok(!JSON.stringify(estado.auditoria).includes('Tucano8Verde'));
  });
  await caso('PUT senha de porteiro: encerrar sessões falha → 200 com aviso e auditoria incompleta', async () => {
    estado.erroRpc = { message: SEGREDO };
    const r = await chamar('PUT', { body: { id: 'u-port', senha: 'Tucano8Verde' } });
    assert.strictEqual(r.code, 200);
    assert.match(r.body.aviso, /aparelhos/);
    assert.ok(!JSON.stringify(r.body).includes(SEGREDO));
    assert.strictEqual(estado.auditoria[0].detalhes.sessoes_encerradas, false);
    assert.strictEqual(estado.auditoria[0].detalhes.incompleto, true);
  });
  await caso('PUT ativo=false de porteiro encerra sessões; operador não', async () => {
    let r = await chamar('PUT', { body: { id: 'u-port', ativo: false } });
    assert.strictEqual(r.code, 200);
    assert.deepStrictEqual(estado.rpc, ENCERRAR);
    reset();
    r = await chamar('PUT', { body: { id: 'u-op', senha: 'qualquer1' } });
    assert.strictEqual(r.code, 200);
    assert.deepStrictEqual(estado.rpc, []);
  });
  await caso('PUT: erro do Auth na senha não vaza a mensagem crua', async () => {
    estado.erroAuthAtualizar = { message: SEGREDO };
    const r = await chamar('PUT', { body: { id: 'u-op', senha: 'qualquer1' } });
    assert.strictEqual(r.code, 400);
    assert.ok(!JSON.stringify(r.body).includes(SEGREDO));
  });
  await caso('PUT de id inexistente → 404', async () => {
    assert.strictEqual((await chamar('PUT', { body: { id: 'nao-existe', nome: 'X' } })).code, 404);
  });
  await caso('DELETE (desativar) de porteiro encerra sessões; falha vira aviso', async () => {
    let r = await chamar('DELETE', { query: { id: 'u-port' } });
    assert.strictEqual(r.code, 200);
    assert.deepStrictEqual(estado.rpc, ENCERRAR);
    assert.strictEqual(r.body.aviso, undefined);
    reset();
    estado.erroRpc = { message: SEGREDO };
    r = await chamar('DELETE', { query: { id: 'u-port' } });
    assert.strictEqual(r.code, 200);
    assert.match(r.body.aviso, /aparelhos/);
    assert.strictEqual(estado.auditoria[0].detalhes.incompleto, true);
    reset();
    await chamar('DELETE', { query: { id: 'u-op' } });
    assert.deepStrictEqual(estado.rpc, []);
  });
  console.log(`${passou} testes passaram`);
})().catch((e) => { process.stderr.write(`${e.stack}\n`); process.exit(1); });
