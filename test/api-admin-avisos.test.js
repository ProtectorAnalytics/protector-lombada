/**
 * /api/admin/avisos — opções de e-mail dos usuários e contatos "Só recebe
 * e-mail" (Portaria 2.2). Offline: auth-middleware e Supabase stubados.
 * Dados fictícios. Uso: node test/api-admin-avisos.test.js
 */
const assert = require('node:assert');
const path = require('node:path');

const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const OP_C1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ADM_C1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PORT_C1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SO_C1 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const SO_INATIVO = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const OP_C2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SUPER = '99999999-9999-4999-8999-999999999999';
const SUPER_C1 = '88888888-8888-4888-8888-888888888888';
const OP_INATIVO = '77777777-7777-4777-8777-777777777777';
const SEGREDO = 'detalhe-interno-secreto';

let usuarios;
const estado = {};
const base = { auth_id: 'auth-x', ativo: true, recebe_alertas: false, recebe_relatorio: false };

function reset() {
  usuarios = [
    { ...base, id: OP_C1, cliente_id: C1, nome: 'Operador', email: 'operador@exemplo.test', role: 'operador' },
    { ...base, id: ADM_C1, cliente_id: C1, nome: 'Síndico', email: 'Sindico@Exemplo.test', role: 'admin_cliente' },
    { ...base, id: PORT_C1, cliente_id: C1, nome: 'José', email: 'jose@porteiro.invalid', role: 'portaria' },
    { ...base, id: SO_C1, auth_id: null, cliente_id: C1, nome: 'Contato', email: 'contato@exemplo.test', role: 'so_email', recebe_alertas: true },
    { ...base, id: SO_INATIVO, auth_id: null, cliente_id: C1, nome: 'Antigo', email: 'antigo@exemplo.test', role: 'so_email', ativo: false },
    { ...base, id: OP_C2, cliente_id: C2, nome: 'Outro', email: 'outro@exemplo.test', role: 'operador' },
    { ...base, id: SUPER, cliente_id: null, nome: 'Super', email: 'super@exemplo.test', role: 'super_admin' },
    { ...base, id: SUPER_C1, cliente_id: C1, nome: 'Super C1', email: 'superc1@exemplo.test', role: 'super_admin' },
    { ...base, id: OP_INATIVO, cliente_id: C1, nome: 'Ex-operador', email: 'ex@exemplo.test', role: 'operador', ativo: false },
  ];
  Object.assign(estado, { perfil: null, ops: [], auditoria: [], erroLeitura: null, erroInsert: null, erroUpdate: null, authUsado: false });
}

function stub(rel, exports) {
  const id = require.resolve(path.join('..', rel));
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

function tabela(nome) {
  assert.strictEqual(nome, 'usuarios');
  const op = { modo: 'select', filtros: [], patch: null, faixa: null };
  estado.ops.push(op);
  const casa = (l) => op.filtros.every((f) => f(l));
  const executar = () => {
    if (op.modo === 'insert') {
      if (estado.erroInsert) return { data: null, error: estado.erroInsert };
      const nova = { id: 'novo-id', ...op.patch };
      usuarios.push(nova);
      return { data: [{ ...nova }], error: null };
    }
    if (op.modo === 'update' && estado.erroUpdate) return { data: null, error: estado.erroUpdate };
    if (op.modo === 'select' && estado.erroLeitura) return { data: null, error: estado.erroLeitura };
    let alvo = usuarios.filter(casa);
    if (op.modo === 'update') alvo.forEach((l) => Object.assign(l, op.patch));
    if (op.faixa) alvo = alvo.slice(op.faixa[0], op.faixa[1] + 1);
    return { data: alvo.map((l) => ({ ...l })), error: null };
  };
  const um = () => { const r = executar(); return Promise.resolve({ data: (r.data && r.data[0]) || null, error: r.error }); };
  const q = {
    select() { return q; },
    insert(p) { op.modo = 'insert'; op.patch = p; return q; },
    update(p) { op.modo = 'update'; op.patch = p; return q; },
    eq(c, v) { op.filtros.push((l) => l[c] === v); return q; },
    neq(c, v) { op.filtros.push((l) => l[c] !== v); return q; },
    order() { return q; },
    range(de, ate) { op.faixa = [de, ate]; return q; },
    single: um,
    maybeSingle: um,
    then(ok, falha) { return Promise.resolve(executar()).then(ok, falha); },
  };
  return q;
}

stub('lib/auth-middleware', {
  autenticar: async (req, roles) => {
    if (!roles.includes(estado.perfil.role)) throw { status: 403, error: 'Permissão insuficiente' };
    return { profile: estado.perfil };
  },
  verificarAcessoCliente: (p, c) => p.role === 'super_admin' || (!!c && p.cliente_id === c),
  registrarAuditoria: async (a) => { estado.auditoria.push(a); return { error: null }; },
  supabase: {
    from: tabela,
    get auth() { estado.authUsado = true; return {}; },
    rpc: async () => { estado.authUsado = true; return { data: null, error: null }; },
  },
});

const handler = require('../api/admin/avisos');

const PERFIS = {
  admin: { id: ADM_C1, role: 'admin_cliente', cliente_id: C1 },
  adminC2: { id: 'u-admin2', role: 'admin_cliente', cliente_id: C2 },
  super: { id: SUPER, role: 'super_admin', cliente_id: null },
  operador: { id: OP_C1, role: 'operador', cliente_id: C1 },
  portaria: { id: PORT_C1, role: 'portaria', cliente_id: C1 },
};

async function chamar(perfil, method, { query = {}, body } = {}) {
  estado.perfil = PERFIS[perfil];
  estado.ops = []; estado.auditoria = [];
  const r = { code: null, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } };
  await handler({ method, headers: {}, query, body }, r);
  return r;
}
const escritas = () => estado.ops.filter((o) => o.modo !== 'select');
const semEscrita = () => { assert.strictEqual(escritas().length, 0); assert.strictEqual(estado.auditoria.length, 0); };
const linha = (id) => usuarios.find((l) => l.id === id);
const NOVO = { cliente_id: C1, nome: 'Zelador Teste', email: 'Zelador@Exemplo.test' };

let passou = 0;
async function caso(nome, fn) { reset(); await fn(); assert.strictEqual(estado.authUsado, false, 'nunca usa o Auth'); passou++; console.log(`ok - ${nome}`); }
console.error = () => {};

(async () => {
  await caso('operador e portaria → 403 em todos os métodos', async () => {
    for (const perfil of ['operador', 'portaria']) {
      assert.strictEqual((await chamar(perfil, 'GET', { query: { cliente_id: C1 } })).code, 403);
      assert.strictEqual((await chamar(perfil, 'POST', { body: NOVO })).code, 403);
      assert.strictEqual((await chamar(perfil, 'PUT', { query: { id: OP_C1 }, body: { recebe_alertas: true } })).code, 403);
      assert.strictEqual((await chamar(perfil, 'DELETE', { query: { id: SO_C1 } })).code, 403);
      semEscrita();
    }
  });

  await caso('método não suportado → 405', async () => {
    assert.strictEqual((await chamar('admin', 'PATCH')).code, 405);
  });

  // --- GET ---
  await caso('GET lista o cliente sem portaria, com inativos e as opções', async () => {
    const r = await chamar('admin', 'GET', { query: { cliente_id: C1 } });
    assert.strictEqual(r.code, 200);
    const ids = r.body.map((x) => x.id).sort();
    assert.deepStrictEqual(ids, [OP_C1, ADM_C1, SO_C1, SO_INATIVO, SUPER_C1, OP_INATIVO].sort());
    const inativo = r.body.find((x) => x.id === SO_INATIVO);
    assert.strictEqual(inativo.ativo, false);
    assert.deepStrictEqual(Object.keys(r.body[0]).sort(), ['ativo', 'email', 'id', 'nome', 'recebe_alertas', 'recebe_relatorio', 'role']);
  });

  await caso('GET sem cliente_id usa o do perfil; de outro cliente → 403; inválido → 400', async () => {
    assert.strictEqual((await chamar('admin', 'GET')).code, 200);
    assert.strictEqual((await chamar('admin', 'GET', { query: { cliente_id: C2 } })).code, 403);
    assert.strictEqual((await chamar('super', 'GET')).code, 400);
    assert.strictEqual((await chamar('super', 'GET', { query: { cliente_id: C2 } })).body.length, 1);
  });

  await caso('GET com erro do banco → 500 sem vazar detalhe', async () => {
    estado.erroLeitura = { message: SEGREDO };
    const r = await chamar('admin', 'GET', { query: { cliente_id: C1 } });
    assert.strictEqual(r.code, 500);
    assert.ok(!JSON.stringify(r.body).includes(SEGREDO));
  });

  // --- POST ---
  await caso('POST cria so_email sem login, e-mail normalizado, opções padrão false, auditado', async () => {
    const r = await chamar('admin', 'POST', { body: NOVO });
    assert.strictEqual(r.code, 201);
    const nova = linha('novo-id');
    assert.strictEqual(nova.role, 'so_email');
    assert.strictEqual(nova.auth_id, null);
    assert.strictEqual(nova.cliente_id, C1);
    assert.strictEqual(nova.email, 'zelador@exemplo.test');
    assert.strictEqual(nova.recebe_alertas, false);
    assert.strictEqual(nova.recebe_relatorio, false);
    assert.strictEqual(r.body.role, 'so_email');
    assert.strictEqual(r.body.auth_id, undefined);
    assert.strictEqual(estado.auditoria.length, 1);
    assert.strictEqual(estado.auditoria[0].acao, 'criar');
    assert.strictEqual(estado.auditoria[0].registroId, 'novo-id');
  });

  await caso('POST com opções ligadas', async () => {
    const r = await chamar('admin', 'POST', { body: { ...NOVO, recebe_alertas: true, recebe_relatorio: true } });
    assert.strictEqual(r.code, 201);
    assert.strictEqual(linha('novo-id').recebe_alertas, true);
    assert.strictEqual(linha('novo-id').recebe_relatorio, true);
  });

  await caso('POST com role, auth_id, senha ou campo desconhecido → 400', async () => {
    for (const extra of [{ role: 'super_admin' }, { auth_id: 'x' }, { senha: 'Abc12345678' }, { ativo: false }]) {
      assert.strictEqual((await chamar('admin', 'POST', { body: { ...NOVO, ...extra } })).code, 400);
      semEscrita();
    }
  });

  await caso('POST valida nome (1–80), e-mail e opções booleanas', async () => {
    const ruins = [
      { ...NOVO, nome: '' }, { ...NOVO, nome: 'a'.repeat(81) }, { ...NOVO, email: 'nao-e-email' },
      { ...NOVO, email: 'x@porteiro.invalid' }, { ...NOVO, recebe_alertas: 'sim' },
      // defesa extra: aspas, sinais de HTML, parênteses, crase, \ e espaço no e-mail; < > no nome
      { ...NOVO, email: "x'-alert(1)-'@exemplo.test" }, { ...NOVO, email: 'a"b@exemplo.test' },
      { ...NOVO, email: 'a<b>@exemplo.test' }, { ...NOVO, email: 'a`b@exemplo.test' },
      { ...NOVO, email: 'a\\b@exemplo.test' }, { ...NOVO, email: 'a b@exemplo.test' },
      { ...NOVO, nome: '<img src=x>' },
    ];
    for (const body of ruins) {
      assert.strictEqual((await chamar('admin', 'POST', { body })).code, 400);
      semEscrita();
    }
    assert.strictEqual((await chamar('admin', 'POST', { body: { ...NOVO, nome: 'a'.repeat(80) } })).code, 201);
  });

  await caso("POST aceita apóstrofo no nome (D'Ávila)", async () => {
    assert.strictEqual((await chamar('admin', 'POST', { body: { ...NOVO, nome: "Maria D'Ávila" } })).code, 201);
  });

  await caso('POST em outro cliente → 403', async () => {
    assert.strictEqual((await chamar('admin', 'POST', { body: { ...NOVO, cliente_id: C2 } })).code, 403);
    semEscrita();
  });

  await caso('POST com e-mail de so_email existente (até inativo, maiúsculas/espaços) → 409', async () => {
    for (const email of [' CONTATO@exemplo.test ', 'antigo@exemplo.test']) {
      const r = await chamar('admin', 'POST', { body: { ...NOVO, email } });
      assert.strictEqual(r.code, 409);
      semEscrita();
    }
  });

  await caso('POST com e-mail de outro usuário do cliente → 409 com a mensagem combinada', async () => {
    const r = await chamar('admin', 'POST', { body: { ...NOVO, email: 'sindico@exemplo.test' } });
    assert.strictEqual(r.code, 409);
    assert.strictEqual(r.body.error, 'Este e-mail já é de um usuário; ligue as opções nele');
    semEscrita();
  });

  await caso('POST com e-mail só de usuário INATIVO do cliente cria o so_email', async () => {
    const r = await chamar('admin', 'POST', { body: { ...NOVO, email: ' EX@exemplo.test ' } });
    assert.strictEqual(r.code, 201);
    assert.strictEqual(linha('novo-id').email, 'ex@exemplo.test');
    assert.strictEqual(linha('novo-id').role, 'so_email');
    assert.strictEqual(linha(OP_INATIVO).ativo, false);
  });

  await caso('PUT para e-mail só de usuário INATIVO do cliente é aceito', async () => {
    assert.strictEqual((await chamar('admin', 'PUT', { query: { id: SO_C1 }, body: { email: 'ex@exemplo.test' } })).code, 200);
    assert.strictEqual(linha(SO_C1).email, 'ex@exemplo.test');
  });

  await caso('POST com e-mail de usuário de OUTRO cliente é permitido', async () => {
    assert.strictEqual((await chamar('admin', 'POST', { body: { ...NOVO, email: 'outro@exemplo.test' } })).code, 201);
  });

  await caso('POST com corrida no índice único (23505) → 409; outro erro → 500 sem vazar', async () => {
    estado.erroInsert = { code: '23505', message: SEGREDO };
    assert.strictEqual((await chamar('admin', 'POST', { body: NOVO })).code, 409);
    estado.erroInsert = { code: 'XX000', message: SEGREDO };
    const r = await chamar('admin', 'POST', { body: NOVO });
    assert.strictEqual(r.code, 500);
    assert.ok(!JSON.stringify(r.body).includes(SEGREDO));
    assert.strictEqual(estado.auditoria.length, 0);
  });

  // --- PUT: opções ---
  await caso('PUT liga opções em operador do próprio cliente, auditado', async () => {
    const r = await chamar('admin', 'PUT', { query: { id: OP_C1 }, body: { recebe_alertas: true, recebe_relatorio: true } });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(linha(OP_C1).recebe_alertas, true);
    assert.strictEqual(linha(OP_C1).recebe_relatorio, true);
    assert.strictEqual(r.body.recebe_alertas, true);
    assert.strictEqual(estado.auditoria.length, 1);
    assert.strictEqual(estado.auditoria[0].acao, 'atualizar');
    assert.strictEqual(estado.auditoria[0].detalhes.cliente_id, C1);
  });

  await caso('Foco 4: síndico em usuário de outro condomínio → 404', async () => {
    const r = await chamar('admin', 'PUT', { query: { id: OP_C2 }, body: { recebe_alertas: true } });
    assert.strictEqual(r.code, 404);
    assert.strictEqual(linha(OP_C2).recebe_alertas, false);
    semEscrita();
  });

  await caso('Foco 4: síndico em super_admin → 404 (sem cliente) ou 403 (com cliente)', async () => {
    assert.strictEqual((await chamar('admin', 'PUT', { query: { id: SUPER }, body: { recebe_alertas: true } })).code, 404);
    assert.strictEqual((await chamar('admin', 'PUT', { query: { id: SUPER_C1 }, body: { recebe_alertas: true } })).code, 403);
    assert.strictEqual(linha(SUPER_C1).recebe_alertas, false);
    semEscrita();
  });

  await caso('Foco 4: síndico ou super em porteiro → 403', async () => {
    for (const perfil of ['admin', 'super']) {
      assert.strictEqual((await chamar(perfil, 'PUT', { query: { id: PORT_C1 }, body: { recebe_alertas: true } })).code, 403);
      semEscrita();
    }
    assert.strictEqual(linha(PORT_C1).recebe_alertas, false);
  });

  await caso('Foco 4: super em super_admin → 403', async () => {
    assert.strictEqual((await chamar('super', 'PUT', { query: { id: SUPER }, body: { recebe_alertas: true } })).code, 403);
    semEscrita();
  });

  await caso('Foco 4: mudar role, auth_id, senha, cliente_id → 400', async () => {
    for (const body of [{ role: 'admin_cliente' }, { auth_id: 'x' }, { senha: 'Abc12345678' }, { cliente_id: C2 }, { role: 'so_email', recebe_alertas: true }]) {
      assert.strictEqual((await chamar('admin', 'PUT', { query: { id: SO_C1 }, body })).code, 400);
      semEscrita();
    }
    assert.strictEqual(linha(SO_C1).role, 'so_email');
  });

  await caso('PUT id inválido → 400; inexistente → 404; vazio → 400; opção não booleana → 400', async () => {
    assert.strictEqual((await chamar('admin', 'PUT', { query: { id: 'x' }, body: { recebe_alertas: true } })).code, 400);
    assert.strictEqual((await chamar('admin', 'PUT', { query: { id: '12345678-1234-4234-8234-123456789012' }, body: { recebe_alertas: true } })).code, 404);
    assert.strictEqual((await chamar('admin', 'PUT', { query: { id: OP_C1 }, body: {} })).code, 400);
    assert.strictEqual((await chamar('admin', 'PUT', { query: { id: OP_C1 }, body: { recebe_alertas: 1 } })).code, 400);
    semEscrita();
  });

  await caso('super_admin liga opção em usuário de qualquer cliente', async () => {
    assert.strictEqual((await chamar('super', 'PUT', { query: { id: OP_C2 }, body: { recebe_relatorio: true } })).code, 200);
    assert.strictEqual(linha(OP_C2).recebe_relatorio, true);
  });

  // --- PUT: contato so_email ---
  await caso('PUT nome/email/ativo só em so_email; em operador → 403', async () => {
    for (const body of [{ nome: 'Novo' }, { email: 'novo@exemplo.test' }, { ativo: false }]) {
      assert.strictEqual((await chamar('admin', 'PUT', { query: { id: OP_C1 }, body })).code, 403);
      semEscrita();
    }
  });

  await caso('PUT edita nome e e-mail do so_email e reativa', async () => {
    const r = await chamar('admin', 'PUT', { query: { id: SO_INATIVO }, body: { nome: ' Novo Nome ', email: 'NOVO@exemplo.test', ativo: true } });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(linha(SO_INATIVO).nome, 'Novo Nome');
    assert.strictEqual(linha(SO_INATIVO).email, 'novo@exemplo.test');
    assert.strictEqual(linha(SO_INATIVO).ativo, true);
    assert.strictEqual(estado.auditoria.length, 1);
  });

  await caso('PUT e-mail repetido → 409 (so_email ou usuário); o próprio e-mail passa', async () => {
    assert.strictEqual((await chamar('admin', 'PUT', { query: { id: SO_C1 }, body: { email: 'antigo@exemplo.test' } })).code, 409);
    const r = await chamar('admin', 'PUT', { query: { id: SO_C1 }, body: { email: 'operador@exemplo.test' } });
    assert.strictEqual(r.code, 409);
    assert.strictEqual(r.body.error, 'Este e-mail já é de um usuário; ligue as opções nele');
    semEscrita();
    assert.strictEqual((await chamar('admin', 'PUT', { query: { id: SO_C1 }, body: { email: 'Contato@exemplo.test' } })).code, 200);
  });

  await caso('PUT valida nome e e-mail do contato', async () => {
    for (const body of [{ nome: '' }, { nome: 'a'.repeat(81) }, { email: 'ruim' }, { ativo: 'nao' }]) {
      assert.strictEqual((await chamar('admin', 'PUT', { query: { id: SO_C1 }, body })).code, 400);
      semEscrita();
    }
  });

  await caso('PUT com 23505 → 409; erro de escrita → 500 sem auditoria', async () => {
    estado.erroUpdate = { code: '23505', message: SEGREDO };
    assert.strictEqual((await chamar('admin', 'PUT', { query: { id: SO_C1 }, body: { email: 'livre@exemplo.test' } })).code, 409);
    estado.erroUpdate = { code: 'XX000', message: SEGREDO };
    const r = await chamar('admin', 'PUT', { query: { id: OP_C1 }, body: { recebe_alertas: true } });
    assert.strictEqual(r.code, 500);
    assert.ok(!JSON.stringify(r.body).includes(SEGREDO));
    assert.strictEqual(estado.auditoria.length, 0);
  });

  await caso('PUT reativando so_email cujo e-mail agora é de usuário ATIVO do cliente → 409 sem escrita', async () => {
    linha(OP_C1).email = ' Antigo@Exemplo.test';
    const r = await chamar('admin', 'PUT', { query: { id: SO_INATIVO }, body: { ativo: true } });
    assert.strictEqual(r.code, 409);
    assert.strictEqual(r.body.error, 'Este e-mail já é de um usuário; ligue as opções nele');
    semEscrita();
    assert.strictEqual(linha(SO_INATIVO).ativo, false);
  });

  await caso('PUT reativando so_email com e-mail livre (dono inativo não conta) → 200', async () => {
    linha(OP_INATIVO).email = 'antigo@exemplo.test';
    const r = await chamar('admin', 'PUT', { query: { id: SO_INATIVO }, body: { ativo: true } });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(linha(SO_INATIVO).ativo, true);
  });

  await caso('PUT reativando com e-mail novo confere o e-mail novo', async () => {
    const r = await chamar('admin', 'PUT', { query: { id: SO_INATIVO }, body: { ativo: true, email: 'operador@exemplo.test' } });
    assert.strictEqual(r.code, 409);
    semEscrita();
  });

  await caso('POST com cliente_id UUID válido que não existe (23503) → 404 "Cliente não encontrado"', async () => {
    estado.erroInsert = { code: '23503', message: SEGREDO };
    const r = await chamar('super', 'POST', { body: { ...NOVO, cliente_id: '44444444-4444-4444-8444-444444444444' } });
    assert.strictEqual(r.code, 404);
    assert.strictEqual(r.body.error, 'Cliente não encontrado');
    assert.strictEqual(estado.auditoria.length, 0);
  });

  const encherContatos = (n) => {
    for (let i = 0; i < n; i++) usuarios.push({ ...base, id: `so-${i}`, auth_id: null, cliente_id: C1, nome: `C ${i}`, email: `c${i}@exemplo.test`, role: 'so_email' });
  };
  const MSG_LIMITE = 'Limite de 30 contatos que só recebem e-mail neste condomínio';

  await caso('POST com 30 contatos so_email ativos no cliente → 409 do limite, sem escrita', async () => {
    encherContatos(29); // + SO_C1 ativo = 30
    const r = await chamar('admin', 'POST', { body: NOVO });
    assert.strictEqual(r.code, 409);
    assert.strictEqual(r.body.error, MSG_LIMITE);
    semEscrita();
  });

  await caso('POST com 29 contatos ativos (inativos não contam) → 201', async () => {
    encherContatos(28);
    assert.strictEqual((await chamar('admin', 'POST', { body: NOVO })).code, 201);
  });

  await caso('PUT reativando com 30 contatos ativos → 409 do limite; editar contato ativo não esbarra no limite', async () => {
    encherContatos(29);
    const r = await chamar('admin', 'PUT', { query: { id: SO_INATIVO }, body: { ativo: true } });
    assert.strictEqual(r.code, 409);
    assert.strictEqual(r.body.error, MSG_LIMITE);
    semEscrita();
    assert.strictEqual((await chamar('admin', 'PUT', { query: { id: SO_C1 }, body: { nome: 'Contato Novo' } })).code, 200);
  });

  // --- DELETE ---
  await caso('DELETE desativa so_email, auditado', async () => {
    const r = await chamar('admin', 'DELETE', { query: { id: SO_C1 } });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(linha(SO_C1).ativo, false);
    assert.strictEqual(estado.auditoria.length, 1);
    assert.strictEqual(estado.auditoria[0].acao, 'desativar');
  });

  await caso('DELETE em não so_email → 403; outro cliente → 404; já inativo → 200 sem escrita', async () => {
    assert.strictEqual((await chamar('admin', 'DELETE', { query: { id: OP_C1 } })).code, 403);
    assert.strictEqual((await chamar('adminC2', 'DELETE', { query: { id: SO_C1 } })).code, 404);
    semEscrita();
    assert.strictEqual(linha(SO_C1).ativo, true);
    assert.strictEqual((await chamar('admin', 'DELETE', { query: { id: SO_INATIVO } })).code, 200);
    semEscrita();
  });

  await caso('DELETE com erro de escrita → 500 sem auditoria', async () => {
    estado.erroUpdate = { code: 'XX000', message: SEGREDO };
    assert.strictEqual((await chamar('admin', 'DELETE', { query: { id: SO_C1 } })).code, 500);
    assert.strictEqual(estado.auditoria.length, 0);
  });

  console.log(`\n${passou} casos ok`);
})().catch((e) => { console.log(e); process.exit(1); });
