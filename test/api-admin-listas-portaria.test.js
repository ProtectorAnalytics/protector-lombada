/**
 * API /api/admin/unidades (offline, módulos stubados). Porteiros viraram
 * usuários: ver test/api-admin-porteiros-usuarios.test.js.
 * Uso: node test/api-admin-listas-portaria.test.js
 */
const assert = require('node:assert');
const path = require('node:path');

const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const U_C1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const U_C2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const SEGREDO = 'detalhe-interno-secreto';

let tabelas;
const estado = { perfil: null, ops: [], auditoria: [], erro: null };

function reset() {
  tabelas = {
    unidades: [
      { id: U_C1, cliente_id: C1, nome: 'Casa 1', ordem: 4, ativo: true },
      { id: 'u-velha', cliente_id: C1, nome: 'Casa Velha', ordem: 2, ativo: false },
      { id: U_C2, cliente_id: C2, nome: 'Casa 9', ordem: 0, ativo: true },
    ],
  };
}

function stub(rel, exports) {
  const id = require.resolve(path.join('..', rel));
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

function tabela(nome) {
  const op = { tabela: nome, modo: 'select', filtros: [], patch: null };
  estado.ops.push(op);
  const casa = (l) => op.filtros.every(([c, v]) => l[c] === v);
  const executar = () => {
    if (estado.erro) return { data: null, error: estado.erro };
    const t = tabelas[nome];
    if (op.modo === 'insert') {
      const novas = [].concat(op.patch).map((l, i) => ({ id: `novo-${t.length + i}`, ativo: true, ...l }));
      t.push(...novas);
      return { data: novas, error: null };
    }
    const alvo = t.filter(casa);
    if (op.modo === 'update') { alvo.forEach((l) => Object.assign(l, op.patch)); return { data: alvo, error: null }; }
    return { data: alvo.map((l) => ({ ...l })), error: null };
  };
  const q = {
    select() { return q; },
    insert(p) { op.modo = 'insert'; op.patch = p; return q; },
    update(p) { op.modo = 'update'; op.patch = p; return q; },
    eq(c, v) { op.filtros.push([c, v]); return q; },
    order() { return q; },
    maybeSingle() { const r = executar(); return Promise.resolve({ data: r.data && r.data[0] || null, error: r.error }); },
    then(ok, falha) { return Promise.resolve(executar()).then(ok, falha); },
  };
  return q;
}

stub('lib/auth-middleware', {
  autenticar: async (req, roles) => {
    if (!roles.includes(estado.perfil.role)) throw { status: 403, error: 'Permissão insuficiente' };
    return { profile: estado.perfil };
  },
  verificarAcessoCliente: (p, c) => p.role === 'super_admin' || p.cliente_id === c,
  registrarAuditoria: async (a) => { estado.auditoria.push(a); return { error: null }; },
  supabase: { from: tabela },
});

const unidades = require('../api/admin/unidades');

const PERFIS = {
  admin: { id: 'u-admin', role: 'admin_cliente', cliente_id: C1 },
  super: { id: 'u-super', role: 'super_admin', cliente_id: null },
  operador: { id: 'u-op', role: 'operador', cliente_id: C1 },
  portaria: { id: 'u-port', role: 'portaria', cliente_id: C1 },
};

async function chamar(handler, perfil, method, { query = {}, body, rawBody } = {}) {
  estado.perfil = PERFIS[perfil];
  estado.ops = []; estado.auditoria = [];
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

let passou = 0;
async function caso(nome, fn) { reset(); estado.erro = null; await fn(); passou++; console.log(`ok - ${nome}`); }
console.error = () => {};

(async () => {
  for (const [nomeApi, h, tab] of [['unidades', unidades, 'unidades']]) {
    await caso(`${nomeApi}: portaria faz POST → 403 sem escrever`, async () => {
      const r = await chamar(h, 'portaria', 'POST', { body: { cliente_id: C1, texto: 'X' } });
      assert.strictEqual(r.code, 403);
      assert.strictEqual(escritas().length, 0);
    });
    await caso(`${nomeApi}: operador faz POST e DELETE → 403`, async () => {
      assert.strictEqual((await chamar(h, 'operador', 'POST', { body: { cliente_id: C1, texto: 'X' } })).code, 403);
      assert.strictEqual((await chamar(h, 'operador', 'DELETE', { query: { id: U_C1 } })).code, 403);
    });
    await caso(`${nomeApi}: GET de outro cliente → 403`, async () => {
      assert.strictEqual((await chamar(h, 'portaria', 'GET', { query: { cliente_id: C2 } })).code, 403);
    });
    await caso(`${nomeApi}: portaria lista só as ativas do próprio cliente`, async () => {
      const r = await chamar(h, 'portaria', 'GET', {});
      assert.strictEqual(r.code, 200);
      assert.ok(r.body.every((l) => l.cliente_id === C1 && l.ativo));
      assert.ok(r.body.length >= 1);
    });
    await caso(`${nomeApi}: POST em outro cliente → 403`, async () => {
      const r = await chamar(h, 'admin', 'POST', { body: { cliente_id: C2, texto: 'X' } });
      assert.strictEqual(r.code, 403);
      assert.strictEqual(escritas().length, 0);
    });
    await caso(`${nomeApi}: POST com corpo não-objeto ou texto ausente → 400`, async () => {
      assert.strictEqual((await chamar(h, 'admin', 'POST', { rawBody: '[1,2]' })).code, 400);
      assert.strictEqual((await chamar(h, 'admin', 'POST', { rawBody: 'null' })).code, 400);
      assert.strictEqual((await chamar(h, 'admin', 'POST', { rawBody: '{x' })).code, 400);
      assert.strictEqual((await chamar(h, 'admin', 'POST', { body: { cliente_id: C1 } })).code, 400);
      assert.strictEqual((await chamar(h, 'admin', 'POST', { body: { cliente_id: C1, texto: 5 } })).code, 400);
      assert.strictEqual(escritas().length, 0);
    });
    await caso(`${nomeApi}: mais de 500 linhas → 400`, async () => {
      const texto = Array.from({ length: 501 }, (_, i) => `N ${i}`).join('\n');
      const r = await chamar(h, 'admin', 'POST', { body: { cliente_id: C1, texto } });
      assert.strictEqual(r.code, 400);
      assert.match(r.body.error, /500/);
    });
    await caso(`${nomeApi}: POST cria novas, ignora existentes (sem diferenciar maiúsculas), reativa inativa`, async () => {
      const nomeAtivo = tabelas[tab].find((l) => l.cliente_id === C1 && l.ativo).nome;
      const nomeInativo = tabelas[tab].find((l) => l.cliente_id === C1 && !l.ativo).nome;
      const texto = [nomeAtivo.toUpperCase(), 'Nova A', nomeInativo.toLowerCase(), 'Nova B', 'x'.repeat(61)].join('\n');
      const r = await chamar(h, 'admin', 'POST', { body: { cliente_id: C1, texto } });
      assert.strictEqual(r.code, 201);
      assert.deepStrictEqual(r.body, { criadas: 3, ja_existiam: 1, ignoradas: ['x'.repeat(61)] });
      assert.ok(tabelas[tab].find((l) => l.nome === 'Nova A' && l.cliente_id === C1));
      assert.strictEqual(tabelas[tab].find((l) => l.nome === nomeInativo).ativo, true);
      assert.strictEqual(tabelas[tab].filter((l) => l.nome.toLowerCase() === nomeAtivo.toLowerCase()).length, 1);
      assert.strictEqual(estado.auditoria.length, 1);
      assert.strictEqual(estado.auditoria[0].tabela, tab);
    });
    await caso(`${nomeApi}: preserva apóstrofo e & nos nomes (D'Ávila, A & B)`, async () => {
      const longa = `${"D'Ávila ".repeat(10)}`.trim();
      const r = await chamar(h, 'admin', 'POST', { body: { cliente_id: C1, texto: `D'Ávila\nA & B\nDAvila\n${longa}` } });
      assert.strictEqual(r.code, 201);
      assert.strictEqual(r.body.criadas, 3);
      assert.deepStrictEqual(r.body.ignoradas, [longa]);
      const nomes = tabelas[tab].filter((l) => l.cliente_id === C1).map((l) => l.nome);
      assert.ok(nomes.includes("D'Ávila") && nomes.includes('A & B') && nomes.includes('DAvila'));
    });
    await caso(`${nomeApi}: super_admin cria para qualquer cliente`, async () => {
      const r = await chamar(h, 'super', 'POST', { body: { cliente_id: C2, texto: 'Nova' } });
      assert.strictEqual(r.code, 201);
      assert.strictEqual(r.body.criadas, 1);
    });
    await caso(`${nomeApi}: DELETE de id de outro cliente → 403 sem escrever`, async () => {
      const r = await chamar(h, 'admin', 'DELETE', { query: { id: U_C2 } });
      assert.strictEqual(r.code, 403);
      assert.strictEqual(escritas().length, 0);
    });
    await caso(`${nomeApi}: DELETE com id inválido → 400`, async () => {
      assert.strictEqual((await chamar(h, 'admin', 'DELETE', { query: { id: 'x' } })).code, 400);
    });
    await caso(`${nomeApi}: erro interno não vaza detalhe`, async () => {
      estado.erro = { message: SEGREDO, code: 'XX000' };
      const r = await chamar(h, 'portaria', 'GET', {});
      assert.strictEqual(r.code, 500);
      assert.ok(!JSON.stringify(r.body).includes(SEGREDO));
    });
  }

  await caso('unidades: ordem continua após o maior ordem e segue a ordem colada', async () => {
    await chamar(unidades, 'admin', 'POST', { body: { cliente_id: C1, texto: 'Z1\nA2' } });
    const z = tabelas.unidades.find((l) => l.nome === 'Z1');
    const a = tabelas.unidades.find((l) => l.nome === 'A2');
    assert.strictEqual(z.ordem, 5);
    assert.strictEqual(a.ordem, 6);
  });
  await caso('unidades: DELETE do próprio cliente → ativo=false + auditoria', async () => {
    const r = await chamar(unidades, 'admin', 'DELETE', { query: { id: U_C1 } });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(tabelas.unidades.find((l) => l.id === U_C1).ativo, false);
    assert.strictEqual(estado.auditoria[0].acao, 'desativar');
  });
  await caso('método inválido → 405', async () => {
    assert.strictEqual((await chamar(unidades, 'admin', 'PUT', {})).code, 405);
  });
  console.log(`${passou} casos`);
})().catch((e) => { console.error = () => {}; process.stderr.write(`${e.stack}\n`); process.exit(1); });
