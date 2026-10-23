/**
 * /api/admin/porteiros — porteiros como usuários (role 'portaria') com login
 * próprio. Offline: auth-middleware e Supabase (tabela + Auth admin) stubados.
 * Uso: node test/api-admin-porteiros-usuarios.test.js
 */
const assert = require('node:assert');
const path = require('node:path');

const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const P_C1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const P_C2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ADM_C1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const P_INATIVO = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SEGREDO = 'detalhe-interno-secreto';

let usuarios;
const estado = {};

function reset() {
  usuarios = [
    { id: P_C1, auth_id: 'auth-p1', cliente_id: C1, nome: 'José', email: 'jose.castelo@porteiro.invalid', role: 'portaria', ativo: true, criado_em: '2026-10-01' },
    { id: P_INATIVO, auth_id: 'auth-pi', cliente_id: C1, nome: 'Antigo', email: 'portaria@castelo.com', role: 'portaria', ativo: false, criado_em: '2026-09-01' },
    { id: ADM_C1, auth_id: 'auth-a1', cliente_id: C1, nome: 'Síndico', email: 'sindico@castelo.com', role: 'admin_cliente', ativo: true, criado_em: '2026-08-01' },
    { id: P_C2, auth_id: 'auth-p2', cliente_id: C2, nome: 'Outro', email: 'outro.mar@porteiro.invalid', role: 'portaria', ativo: true, criado_em: '2026-10-02' },
  ];
  Object.assign(estado, {
    perfil: null, ops: [], auditoria: [], auth: [], rpc: [],
    erroLeitura: null, erroInsert: null, erroAuthCriar: null, erroAuthAtualizar: null, erroAuthApagar: null, erroRpc: null,
  });
}

function stub(rel, exports) {
  const id = require.resolve(path.join('..', rel));
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

function tabela(nome) {
  assert.strictEqual(nome, 'usuarios');
  const op = { modo: 'select', filtros: [], patch: null };
  estado.ops.push(op);
  const casa = (l) => op.filtros.every(([c, v]) => l[c] === v);
  const executar = () => {
    if (op.modo === 'insert') {
      if (estado.erroInsert) return { data: null, error: estado.erroInsert };
      const nova = { id: 'novo-id', criado_em: '2026-10-23', ...op.patch };
      usuarios.push(nova);
      return { data: [nova], error: null };
    }
    if (estado.erroLeitura) return { data: null, error: estado.erroLeitura };
    const alvo = usuarios.filter(casa);
    if (op.modo === 'update') alvo.forEach((l) => Object.assign(l, op.patch));
    return { data: alvo.map((l) => ({ ...l })), error: null };
  };
  const um = () => { const r = executar(); return Promise.resolve({ data: (r.data && r.data[0]) || null, error: r.error }); };
  const q = {
    select() { return q; },
    insert(p) { op.modo = 'insert'; op.patch = p; return q; },
    update(p) { op.modo = 'update'; op.patch = p; return q; },
    eq(c, v) { op.filtros.push([c, v]); return q; },
    order() { return q; },
    single: um,
    maybeSingle: um,
    then(ok, falha) { return Promise.resolve(executar()).then(ok, falha); },
  };
  return q;
}

const authAdmin = {
  createUser: async (a) => {
    estado.auth.push(['criar', a]);
    if (estado.erroAuthCriar) return { data: { user: null }, error: estado.erroAuthCriar };
    return { data: { user: { id: 'auth-novo' } }, error: null };
  },
  updateUserById: async (id, a) => {
    estado.auth.push(['atualizar', id, a]);
    return { data: { user: { id } }, error: estado.erroAuthAtualizar };
  },
  deleteUser: async (id) => { estado.auth.push(['apagar', id]); return { data: {}, error: estado.erroAuthApagar || null }; },
};

stub('lib/auth-middleware', {
  autenticar: async (req, roles) => {
    if (!roles.includes(estado.perfil.role)) throw { status: 403, error: 'Permissão insuficiente' };
    return { profile: estado.perfil };
  },
  verificarAcessoCliente: (p, c) => p.role === 'super_admin' || p.cliente_id === c,
  registrarAuditoria: async (a) => { estado.auditoria.push(a); return { error: null }; },
  supabase: {
    from: tabela,
    auth: { admin: authAdmin },
    rpc: async (nome, args) => { estado.rpc.push([nome, args]); return { data: null, error: estado.erroRpc }; },
  },
});

const handler = require('../api/admin/porteiros');

const PERFIS = {
  admin: { id: 'u-admin', role: 'admin_cliente', cliente_id: C1 },
  adminC2: { id: 'u-admin2', role: 'admin_cliente', cliente_id: C2 },
  super: { id: 'u-super', role: 'super_admin', cliente_id: null },
  operador: { id: 'u-op', role: 'operador', cliente_id: C1 },
  portaria: { id: 'u-port', role: 'portaria', cliente_id: C1 },
};

async function chamar(perfil, method, { query = {}, body, rawBody } = {}) {
  estado.perfil = PERFIS[perfil];
  estado.ops = []; estado.auditoria = []; estado.auth = []; estado.rpc = [];
  const r = { code: null, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } };
  const req = { method, headers: {}, query, body };
  if (rawBody !== undefined) {
    req.body = undefined;
    req.on = (ev, fn) => { if (ev === 'data') fn(rawBody); if (ev === 'end') fn(); };
  }
  await handler(req, r);
  return r;
}
const escritas = () => estado.ops.filter((o) => o.modo !== 'select');
const semEscrita = () => {
  assert.strictEqual(escritas().length, 0);
  assert.strictEqual(estado.auth.length, 0);
  assert.strictEqual(estado.rpc.length, 0);
};
const ENCERRAR_P1 = [['encerrar_sessoes_usuario', { p_user: 'auth-p1' }]];
const NOVO = { cliente_id: C1, nome: 'Maria Souza', usuario: 'maria.castelo', senha: 'Girassol42' };

let passou = 0;
async function caso(nome, fn) { reset(); await fn(); passou++; console.log(`ok - ${nome}`); }
console.error = () => {};

(async () => {
  // --- perfis sem permissão ---
  await caso('operador e portaria → 403 em todos os métodos, sem escrever', async () => {
    for (const perfil of ['operador', 'portaria']) {
      assert.strictEqual((await chamar(perfil, 'GET', { query: { cliente_id: C1 } })).code, 403);
      assert.strictEqual((await chamar(perfil, 'POST', { body: NOVO })).code, 403);
      semEscrita();
      assert.strictEqual((await chamar(perfil, 'PUT', { query: { id: P_C1 }, body: { nome: 'X' } })).code, 403);
      semEscrita();
      assert.strictEqual((await chamar(perfil, 'DELETE', { query: { id: P_C1 } })).code, 403);
      semEscrita();
    }
  });

  // --- GET ---
  await caso('GET lista só role portaria do cliente, usuario sem domínio, e-mail normal como está', async () => {
    const r = await chamar('admin', 'GET', { query: { cliente_id: C1 } });
    assert.strictEqual(r.code, 200);
    assert.deepStrictEqual(r.body.map((u) => u.id).sort(), [P_C1, P_INATIVO].sort());
    const jose = r.body.find((u) => u.id === P_C1);
    assert.deepStrictEqual(jose, { id: P_C1, nome: 'José', usuario: 'jose.castelo', ativo: true, criado_em: '2026-10-01' });
    assert.strictEqual(r.body.find((u) => u.id === P_INATIVO).usuario, 'portaria@castelo.com');
    assert.ok(r.body.every((u) => !('auth_id' in u) && !('email' in u)));
    const filtros = estado.ops[0].filtros;
    assert.ok(filtros.some(([c, v]) => c === 'cliente_id' && v === C1));
    assert.ok(filtros.some(([c, v]) => c === 'role' && v === 'portaria'));
  });
  await caso('GET sem cliente_id usa o do síndico; super_admin sem cliente_id → 400', async () => {
    const r = await chamar('admin', 'GET', {});
    assert.strictEqual(r.code, 200);
    assert.strictEqual(r.body.length, 2);
    assert.strictEqual((await chamar('super', 'GET', {})).code, 400);
  });
  await caso('GET de outro cliente pelo síndico → 403; super_admin lê qualquer um', async () => {
    assert.strictEqual((await chamar('adminC2', 'GET', { query: { cliente_id: C1 } })).code, 403);
    const r = await chamar('super', 'GET', { query: { cliente_id: C2 } });
    assert.strictEqual(r.code, 200);
    assert.deepStrictEqual(r.body.map((u) => u.usuario), ['outro.mar']);
  });

  // --- POST ---
  await caso('POST cria login com e-mail técnico e insere usuarios role portaria + auditoria', async () => {
    const r = await chamar('admin', 'POST', { body: { ...NOVO, usuario: '  Maria.Castelo ' } });
    assert.strictEqual(r.code, 201);
    assert.deepStrictEqual(estado.auth, [['criar', { email: 'maria.castelo@porteiro.invalid', password: 'Girassol42', email_confirm: true }]]);
    const ins = escritas().find((o) => o.modo === 'insert').patch;
    assert.deepStrictEqual(ins, {
      auth_id: 'auth-novo', cliente_id: C1, nome: 'Maria Souza',
      email: 'maria.castelo@porteiro.invalid', role: 'portaria', ativo: true,
    });
    assert.deepStrictEqual(r.body, { id: 'novo-id', nome: 'Maria Souza', usuario: 'maria.castelo', ativo: true, criado_em: '2026-10-23' });
    assert.strictEqual(estado.auditoria.length, 1);
    assert.strictEqual(estado.auditoria[0].acao, 'criar');
    assert.strictEqual(estado.auditoria[0].tabela, 'usuarios');
    assert.strictEqual(estado.auditoria[0].registroId, 'novo-id');
    assert.ok(!JSON.stringify(estado.auditoria).includes('Girassol42'));
  });
  await caso('POST: role e ativo do corpo são ignorados (sempre portaria)', async () => {
    const r = await chamar('admin', 'POST', { body: { ...NOVO, role: 'super_admin', ativo: false } });
    assert.strictEqual(r.code, 201);
    const ins = escritas().find((o) => o.modo === 'insert').patch;
    assert.strictEqual(ins.role, 'portaria');
    assert.strictEqual(ins.ativo, true);
  });
  await caso('POST do síndico em outro cliente → 403 sem criar login', async () => {
    const r = await chamar('adminC2', 'POST', { body: NOVO });
    assert.strictEqual(r.code, 403);
    semEscrita();
  });
  await caso('POST do super_admin em qualquer cliente', async () => {
    const r = await chamar('super', 'POST', { body: { ...NOVO, cliente_id: C2 } });
    assert.strictEqual(r.code, 201);
    assert.strictEqual(escritas().find((o) => o.modo === 'insert').patch.cliente_id, C2);
  });
  await caso('POST com dados inválidos → 400 sem criar login', async () => {
    const invalidos = [
      { ...NOVO, senha: '12345' },
      { ...NOVO, senha: 'abc123456' },
      { ...NOVO, senha: 'girassolazul' },
      { ...NOVO, senha: '9876543210' },
      { ...NOVO, senha: 'Portaria123' },
      { ...NOVO, senha: 'castelo2026' },
      { ...NOVO, senha: 'Maria2026xyz' },
      { ...NOVO, senha: `a1${'ç'.repeat(38)}` },
      { ...NOVO, senha: 123456 },
      { ...NOVO, senha: undefined },
      { ...NOVO, usuario: 'ab' },
      { ...NOVO, usuario: '.jose' },
      { ...NOVO, usuario: 'jo..se' },
      { ...NOVO, usuario: 'jose@x.com' },
      { ...NOVO, usuario: 5 },
      { ...NOVO, nome: '   ' },
      { ...NOVO, nome: undefined },
      { ...NOVO, nome: 'x'.repeat(121) },
      { ...NOVO, cliente_id: 'x' },
    ];
    for (const body of invalidos) {
      const r = await chamar('admin', 'POST', { body });
      assert.strictEqual(r.code, 400, JSON.stringify(body));
      semEscrita();
    }
    for (const rawBody of ['[1]', 'null', '{x']) {
      assert.strictEqual((await chamar('admin', 'POST', { rawBody })).code, 400);
      semEscrita();
    }
  });
  await caso('POST com senha fraca tem mensagem clara para o síndico', async () => {
    let r = await chamar('admin', 'POST', { body: { ...NOVO, senha: '12345' } });
    assert.match(r.body.error, /pelo menos 10 caracteres/);
    r = await chamar('admin', 'POST', { body: { ...NOVO, senha: 'castelo2026' } });
    assert.match(r.body.error, /usuário nem o nome/);
    r = await chamar('admin', 'POST', { body: { ...NOVO, senha: 'senha12345' } });
    assert.match(r.body.error, /comum/);
    r = await chamar('admin', 'POST', { body: { ...NOVO, senha: `a1${'b'.repeat(71)}` } });
    assert.match(r.body.error, /longa/);
  });
  await caso('POST usuário já existente no Auth → 409 "Esse usuário já existe", sem vazar mensagem', async () => {
    estado.erroAuthCriar = { message: `A user with this email address has already been registered ${SEGREDO}`, status: 422, code: 'email_exists' };
    const r = await chamar('admin', 'POST', { body: NOVO });
    assert.strictEqual(r.code, 409);
    assert.deepStrictEqual(r.body, { error: 'Esse usuário já existe' });
    assert.ok(!escritas().some((o) => o.modo === 'insert'));
  });
  await caso('POST: outro erro do Auth → erro genérico sem detalhe', async () => {
    estado.erroAuthCriar = { message: SEGREDO, status: 500 };
    const r = await chamar('admin', 'POST', { body: NOVO });
    assert.ok(r.code >= 500);
    assert.ok(!JSON.stringify(r.body).includes(SEGREDO));
    assert.ok(!escritas().some((o) => o.modo === 'insert'));
  });
  await caso('POST: insert falha → apaga o login do Auth (sem usuário pela metade)', async () => {
    estado.erroInsert = { message: SEGREDO, code: 'XX000' };
    const r = await chamar('admin', 'POST', { body: NOVO });
    assert.strictEqual(r.code, 500);
    assert.ok(!JSON.stringify(r.body).includes(SEGREDO));
    assert.deepStrictEqual(estado.auth.at(-1), ['apagar', 'auth-novo']);
    assert.strictEqual(estado.auditoria.length, 0);
  });
  await caso('POST: rollback do Auth falha → bane o login órfão como segunda tentativa', async () => {
    estado.erroInsert = { message: SEGREDO, code: 'XX000' };
    estado.erroAuthApagar = { message: SEGREDO };
    const r = await chamar('admin', 'POST', { body: NOVO });
    assert.strictEqual(r.code, 500);
    assert.deepStrictEqual(estado.auth.slice(-2), [['apagar', 'auth-novo'], ['atualizar', 'auth-novo', { ban_duration: '876000h' }]]);
  });
  await caso('POST/PUT: nome perde caracteres invisíveis e de direção de texto', async () => {
    let r = await chamar('admin', 'POST', { body: { ...NOVO, nome: '\u202EMaria\u200B Souza\uFEFF' } });
    assert.strictEqual(r.code, 201);
    assert.strictEqual(escritas().find((o) => o.modo === 'insert').patch.nome, 'Maria Souza');
    r = await chamar('admin', 'PUT', { query: { id: P_C1 }, body: { nome: '\u2066José\u2069' } });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(usuarios.find((u) => u.id === P_C1).nome, 'José');
    assert.strictEqual((await chamar('admin', 'POST', { body: { ...NOVO, nome: '\u200B\u202E' } })).code, 400);
  });
  await caso('POST: insert com e-mail duplicado → 409 e rollback do Auth', async () => {
    estado.erroInsert = { message: SEGREDO, code: '23505' };
    const r = await chamar('admin', 'POST', { body: NOVO });
    assert.strictEqual(r.code, 409);
    assert.deepStrictEqual(r.body, { error: 'Esse usuário já existe' });
    assert.deepStrictEqual(estado.auth.at(-1), ['apagar', 'auth-novo']);
  });

  // --- PUT ---
  await caso('PUT nome e senha do próprio cliente → atualiza + updateUserById + auditoria sem senha', async () => {
    const r = await chamar('admin', 'PUT', { query: { id: P_C1 }, body: { nome: 'José Silva', senha: 'Ventania2026' } });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(usuarios.find((u) => u.id === P_C1).nome, 'José Silva');
    assert.deepStrictEqual(estado.auth, [['atualizar', 'auth-p1', { password: 'Ventania2026' }]]);
    assert.deepStrictEqual(r.body, { id: P_C1, nome: 'José Silva', usuario: 'jose.castelo', ativo: true, criado_em: '2026-10-01' });
    assert.strictEqual(estado.auditoria.length, 1);
    assert.strictEqual(estado.auditoria[0].acao, 'atualizar');
    assert.strictEqual(estado.auditoria[0].registroId, P_C1);
    assert.strictEqual(estado.auditoria[0].detalhes.senha_alterada, true);
    assert.strictEqual(estado.auditoria[0].detalhes.sessoes_encerradas, true);
    assert.ok(!estado.auditoria[0].detalhes.incompleto);
    assert.ok(!JSON.stringify(estado.auditoria).includes('Ventania2026'));
    assert.deepStrictEqual(estado.rpc, ENCERRAR_P1, 'troca de senha derruba as sessões abertas');
  });
  await caso('PUT senha: encerrar sessões falha → 200 com aviso, auditoria incompleta, sem vazar', async () => {
    estado.erroRpc = { message: SEGREDO, code: 'XX000' };
    const r = await chamar('admin', 'PUT', { query: { id: P_C1 }, body: { senha: 'Ventania2026' } });
    assert.strictEqual(r.code, 200);
    assert.match(r.body.aviso, /aparelhos/);
    assert.ok(!JSON.stringify(r.body).includes(SEGREDO));
    assert.deepStrictEqual(estado.rpc, ENCERRAR_P1);
    const d = estado.auditoria[0].detalhes;
    assert.strictEqual(d.senha_alterada, true);
    assert.strictEqual(d.sessoes_encerradas, false);
    assert.strictEqual(d.incompleto, true);
    assert.ok(!JSON.stringify(estado.auditoria).includes(SEGREDO));
  });
  await caso('PUT senha fraca usa o usuário e o nome do porteiro alvo → 400 sem escrever', async () => {
    for (const senha of ['Jose12345678', 'castelo2026x', 'portaria123', 'girassolazul']) {
      const r = await chamar('admin', 'PUT', { query: { id: P_C1 }, body: { senha } });
      assert.strictEqual(r.code, 400, senha);
      semEscrita();
    }
    // porteiro antigo com e-mail normal: a parte antes do @ conta como usuário
    const r = await chamar('admin', 'PUT', { query: { id: P_INATIVO }, body: { senha: 'xportaria2026' } });
    assert.strictEqual(r.code, 400);
    assert.match(r.body.error, /usuário nem o nome/);
    semEscrita();
  });
  await caso('PUT só nome ou reativar não mexe nas sessões', async () => {
    await chamar('admin', 'PUT', { query: { id: P_C1 }, body: { nome: 'Zé' } });
    assert.deepStrictEqual(estado.rpc, []);
    await chamar('admin', 'PUT', { query: { id: P_INATIVO }, body: { ativo: true } });
    assert.deepStrictEqual(estado.rpc, []);
  });
  await caso('PUT só altera nome/ativo (ignora email, role, cliente_id do corpo)', async () => {
    const r = await chamar('admin', 'PUT', { query: { id: P_C1 }, body: { nome: 'Zé', role: 'super_admin', cliente_id: C2, email: 'x@y.z', auth_id: 'h' } });
    assert.strictEqual(r.code, 200);
    const u = usuarios.find((x) => x.id === P_C1);
    assert.strictEqual(u.role, 'portaria');
    assert.strictEqual(u.cliente_id, C1);
    assert.strictEqual(u.email, 'jose.castelo@porteiro.invalid');
    assert.strictEqual(u.auth_id, 'auth-p1');
    const upd = escritas().find((o) => o.modo === 'update');
    assert.deepStrictEqual(Object.keys(upd.patch), ['nome']);
  });
  await caso('PUT ativo=false → bane no Auth; ativo=true → remove o ban', async () => {
    let r = await chamar('admin', 'PUT', { query: { id: P_C1 }, body: { ativo: false } });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(usuarios.find((u) => u.id === P_C1).ativo, false);
    assert.deepStrictEqual(estado.auth, [['atualizar', 'auth-p1', { ban_duration: '876000h' }]]);
    assert.deepStrictEqual(estado.rpc, ENCERRAR_P1);
    r = await chamar('admin', 'PUT', { query: { id: P_C1 }, body: { ativo: true } });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(usuarios.find((u) => u.id === P_C1).ativo, true);
    assert.deepStrictEqual(estado.auth, [['atualizar', 'auth-p1', { ban_duration: 'none' }]]);
    assert.strictEqual(estado.auditoria.length, 1);
  });
  await caso('PUT do síndico em porteiro de outro cliente → 403 sem escrever', async () => {
    const r = await chamar('admin', 'PUT', { query: { id: P_C2 }, body: { senha: 'Ventania2026', ativo: false } });
    assert.strictEqual(r.code, 403);
    semEscrita();
    assert.strictEqual(usuarios.find((u) => u.id === P_C2).ativo, true);
  });
  await caso('PUT em alvo admin_cliente (mesmo cliente) → 403 sem escrever', async () => {
    const r = await chamar('admin', 'PUT', { query: { id: ADM_C1 }, body: { senha: 'Ventania2026' } });
    assert.strictEqual(r.code, 403);
    semEscrita();
  });
  await caso('PUT do super_admin em alvo que não é portaria → 403', async () => {
    const r = await chamar('super', 'PUT', { query: { id: ADM_C1 }, body: { nome: 'X' } });
    assert.strictEqual(r.code, 403);
    semEscrita();
  });
  await caso('PUT do super_admin em porteiro de qualquer cliente', async () => {
    const r = await chamar('super', 'PUT', { query: { id: P_C2 }, body: { nome: 'Novo Nome' } });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(usuarios.find((u) => u.id === P_C2).nome, 'Novo Nome');
  });
  await caso('PUT com id inválido → 400; id inexistente → 404', async () => {
    assert.strictEqual((await chamar('admin', 'PUT', { query: { id: 'x' }, body: { nome: 'A' } })).code, 400);
    const r = await chamar('admin', 'PUT', { query: { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }, body: { nome: 'A' } });
    assert.strictEqual(r.code, 404);
    semEscrita();
  });
  await caso('PUT com campos inválidos ou vazio → 400 sem escrever', async () => {
    for (const body of [{}, { senha: '123' }, { senha: 'Girassol4' }, { nome: '' }, { ativo: 'sim' }, { nome: 'x'.repeat(121) }]) {
      const r = await chamar('admin', 'PUT', { query: { id: P_C1 }, body });
      assert.strictEqual(r.code, 400, JSON.stringify(body));
      semEscrita();
    }
  });
  await caso('PUT: erro do Auth na troca de senha → genérico, sem vazar e sem gravar nada', async () => {
    estado.erroAuthAtualizar = { message: SEGREDO, status: 422 };
    const r = await chamar('admin', 'PUT', { query: { id: P_C1 }, body: { nome: 'Outro', senha: 'Ventania2026' } });
    assert.ok(r.code >= 400);
    assert.ok(!JSON.stringify(r.body).includes(SEGREDO));
    assert.ok(!escritas().some((o) => o.modo === 'update'));
    assert.strictEqual(usuarios.find((u) => u.id === P_C1).nome, 'José');
  });

  // --- DELETE ---
  await caso('DELETE desativa + bane + auditoria desativar', async () => {
    const r = await chamar('admin', 'DELETE', { query: { id: P_C1 } });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(usuarios.find((u) => u.id === P_C1).ativo, false);
    assert.deepStrictEqual(estado.auth, [['atualizar', 'auth-p1', { ban_duration: '876000h' }]]);
    assert.strictEqual(estado.auditoria.length, 1);
    assert.strictEqual(estado.auditoria[0].acao, 'desativar');
    assert.strictEqual(estado.auditoria[0].registroId, P_C1);
    assert.strictEqual(estado.auditoria[0].detalhes.sessoes_encerradas, true);
    assert.deepStrictEqual(estado.rpc, ENCERRAR_P1, 'desativar derruba as sessões abertas');
    assert.strictEqual(r.body.aviso, undefined);
  });
  await caso('DELETE: encerrar sessões falha → ainda desativa e bane, 200 com aviso e auditoria incompleta', async () => {
    estado.erroRpc = { message: SEGREDO };
    const r = await chamar('admin', 'DELETE', { query: { id: P_C1 } });
    assert.strictEqual(r.code, 200);
    assert.match(r.body.aviso, /aparelhos/);
    assert.ok(!JSON.stringify(r.body).includes(SEGREDO));
    assert.strictEqual(usuarios.find((u) => u.id === P_C1).ativo, false);
    assert.deepStrictEqual(estado.auth, [['atualizar', 'auth-p1', { ban_duration: '876000h' }]]);
    const d = estado.auditoria[0].detalhes;
    assert.strictEqual(d.login_bloqueado, true);
    assert.strictEqual(d.sessoes_encerradas, false);
    assert.strictEqual(d.incompleto, true);
  });
  await caso('DELETE do síndico em outro cliente ou em admin_cliente → 403 sem escrever', async () => {
    assert.strictEqual((await chamar('admin', 'DELETE', { query: { id: P_C2 } })).code, 403);
    semEscrita();
    assert.strictEqual((await chamar('admin', 'DELETE', { query: { id: ADM_C1 } })).code, 403);
    semEscrita();
    assert.strictEqual(usuarios.find((u) => u.id === ADM_C1).ativo, true);
  });
  await caso('DELETE: ban do Auth falha → ativo=false já gravado, auditoria incompleta, erro genérico', async () => {
    estado.erroAuthAtualizar = { message: SEGREDO, status: 500 };
    const r = await chamar('admin', 'DELETE', { query: { id: P_C1 } });
    assert.strictEqual(r.code, 500);
    assert.ok(!JSON.stringify(r.body).includes(SEGREDO));
    assert.strictEqual(usuarios.find((u) => u.id === P_C1).ativo, false);
    assert.strictEqual(estado.auditoria.length, 1);
    assert.strictEqual(estado.auditoria[0].detalhes.ativo, false);
    assert.strictEqual(estado.auditoria[0].detalhes.incompleto, true);
    assert.ok(!estado.auditoria[0].detalhes.login_bloqueado);
  });
  await caso('DELETE com id inválido → 400', async () => {
    assert.strictEqual((await chamar('admin', 'DELETE', { query: { id: 'x' } })).code, 400);
    semEscrita();
  });

  // --- geral ---
  await caso('erro interno de leitura não vaza detalhe', async () => {
    estado.erroLeitura = { message: SEGREDO, code: 'XX000' };
    const r = await chamar('admin', 'GET', { query: { cliente_id: C1 } });
    assert.strictEqual(r.code, 500);
    assert.ok(!JSON.stringify(r.body).includes(SEGREDO));
  });
  await caso('método inválido → 405', async () => {
    assert.strictEqual((await chamar('admin', 'PATCH', {})).code, 405);
  });
  console.log(`${passou} casos`);
})().catch((e) => { console.error = () => {}; process.stderr.write(`${e.stack}\n`); process.exit(1); });
