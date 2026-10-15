/**
 * POST /api/admin/acesso-painel: registra "a equipe Protector abriu o painel
 * do condomínio X" antes de o painel aparecer (fail-closed). Módulos stubados.
 * Uso: node test/api-admin-acesso-painel.test.js
 */
const assert = require('node:assert');
const path = require('node:path');

const UUID = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b';
const estado = { profile: null, clientes: [], auditorias: [], falhaAuditoria: false, falhaConsulta: false };

function stub(rel, exports) {
  const id = require.resolve(path.join('..', rel));
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

function tabelaClientes() {
  const filtros = [];
  const q = {
    select() { return q; },
    eq(c, v) { filtros.push((r) => r[c] === v); return q; },
    maybeSingle() {
      if (estado.falhaConsulta) return Promise.resolve({ data: null, error: { message: 'timeout' } });
      const l = estado.clientes.filter((r) => filtros.every((f) => f(r)));
      return Promise.resolve({ data: l[0] || null, error: null });
    },
  };
  return q;
}

stub('lib/auth-middleware', {
  autenticar: async (_req, roles) => {
    if (!roles.includes(estado.profile.role)) throw { status: 403, error: 'Permissão insuficiente' };
    return { profile: estado.profile };
  },
  registrarAuditoria: async (a) => {
    if (estado.falhaAuditoria) return { error: { message: 'insert falhou' } };
    estado.auditorias.push(a);
    return { error: null };
  },
  supabase: { from: () => tabelaClientes() },
});

const handler = require('../api/admin/acesso-painel');

function resp() {
  const r = { code: null, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
const post = (body) => ({ method: 'POST', headers: { 'x-forwarded-for': '1.2.3.4' }, body });

let passou = 0;
async function caso(nome, fn) {
  estado.profile = { id: 'adm1', role: 'super_admin', cliente_id: null };
  estado.clientes = [{ id: UUID, nome: 'Condomínio Teste', ativo: true }];
  estado.auditorias = []; estado.falhaAuditoria = false; estado.falhaConsulta = false;
  await fn(); passou++; console.log(`ok - ${nome}`);
}

(async () => {
  await caso('equipe Protector abre condomínio ativo: 200, nome e auditoria gravada', async () => {
    const r = resp();
    await handler(post({ cliente_id: UUID }), r);
    assert.strictEqual(r.code, 200);
    assert.deepStrictEqual(r.body, { ok: true, cliente: { id: UUID, nome: 'Condomínio Teste' } });
    assert.strictEqual(estado.auditorias.length, 1);
    const a = estado.auditorias[0];
    assert.strictEqual(a.usuarioId, 'adm1');
    assert.strictEqual(a.acao, 'abrir_painel_cliente');
    assert.strictEqual(a.tabela, 'clientes');
    assert.strictEqual(a.registroId, UUID);
    assert.deepStrictEqual(a.detalhes, { cliente_id: UUID, cliente_nome: 'Condomínio Teste' });
    assert.strictEqual(a.ip, '1.2.3.4');
  });

  await caso('síndico não registra acesso: 403 e nada gravado', async () => {
    estado.profile = { id: 's1', role: 'admin_cliente', cliente_id: UUID };
    const r = resp();
    await handler(post({ cliente_id: UUID }), r);
    assert.strictEqual(r.code, 403);
    assert.strictEqual(estado.auditorias.length, 0);
  });

  await caso('id que não é UUID: 400', async () => {
    for (const id of ['abc', '', null, [UUID], `${UUID}'`]) {
      const r = resp();
      await handler(post({ cliente_id: id }), r);
      assert.strictEqual(r.code, 400, String(id));
    }
    assert.strictEqual(estado.auditorias.length, 0);
  });

  await caso('condomínio inexistente: 404 sem auditoria', async () => {
    const r = resp();
    await handler(post({ cliente_id: '00000000-0000-4000-8000-000000000000' }), r);
    assert.strictEqual(r.code, 404);
    assert.strictEqual(estado.auditorias.length, 0);
  });

  await caso('condomínio inativo: 404 sem auditoria', async () => {
    estado.clientes[0].ativo = false;
    const r = resp();
    await handler(post({ cliente_id: UUID }), r);
    assert.strictEqual(r.code, 404);
    assert.strictEqual(estado.auditorias.length, 0);
  });

  await caso('auditoria falhou: 503 e o painel não abre (fail-closed)', async () => {
    estado.falhaAuditoria = true;
    const r = resp();
    await handler(post({ cliente_id: UUID }), r);
    assert.strictEqual(r.code, 503);
    assert.strictEqual(r.body.ok, undefined);
  });

  await caso('falha ao consultar o condomínio: 500 sem auditoria', async () => {
    estado.falhaConsulta = true;
    const r = resp();
    await handler(post({ cliente_id: UUID }), r);
    assert.strictEqual(r.code, 500);
    assert.strictEqual(estado.auditorias.length, 0);
  });

  await caso('GET não é permitido: 405', async () => {
    const r = resp();
    await handler({ method: 'GET', headers: {}, query: {} }, r);
    assert.strictEqual(r.code, 405);
  });

  await caso('UUID em maiúsculas é normalizado', async () => {
    const r = resp();
    await handler(post({ cliente_id: UUID.toUpperCase() }), r);
    assert.strictEqual(r.code, 200);
    assert.strictEqual(estado.auditorias[0].registroId, UUID);
  });

  console.log(`\n${passou} casos passaram`);
})().catch((e) => { console.error(e); process.exit(1); });
