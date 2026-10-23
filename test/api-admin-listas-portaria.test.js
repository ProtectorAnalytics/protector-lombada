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
const U_T1 = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const U_INATIVA = 'abababab-abab-4bab-8bab-abababababab';
const SEGREDO = 'detalhe-interno-secreto';

let tabelas;
const estado = { perfil: null, ops: [], auditoria: [], erro: null, antesDoInsert: null, emVoo: 0, maxEmVoo: 0, erroUpdate: null };
const MAX_ROWS = 1000; // corte do PostgREST em cada leitura
const chaveUnica = (l) => `${l.cliente_id}|${String(l.bloco || '').toLowerCase()}|${String(l.nome).toLowerCase()}`;

function reset() {
  tabelas = {
    unidades: [
      { id: U_C1, cliente_id: C1, nome: 'Casa 1', ordem: 4, ativo: true },
      { id: 'u-velha', cliente_id: C1, nome: 'Casa Velha', ordem: 2, ativo: false },
      { id: U_C2, cliente_id: C2, nome: 'Casa 9', ordem: 0, ativo: true },
      { id: U_T1, cliente_id: C1, bloco: 'Torre 1', nome: '101', andar: '1', tipo: 'apartamento', ordem: 1, ativo: true },
      { id: U_INATIVA, cliente_id: C1, bloco: 'Torre 1', nome: '102', andar: null, tipo: 'apartamento', ordem: 3, ativo: false },
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
      if (estado.antesDoInsert) { const f = estado.antesDoInsert; estado.antesDoInsert = null; f(); if (estado.erro) return { data: null, error: estado.erro }; }
      const novas = [].concat(op.patch).map((l, i) => ({ id: `novo-${t.length + i}`, ativo: true, bloco: null, andar: null, tipo: 'apartamento', ...l }));
      // Imita uq_unidades_cliente_bloco_nome (o insert é atômico: tudo ou nada).
      const chaves = new Set(t.map(chaveUnica));
      for (const l of novas) {
        if (chaves.has(chaveUnica(l))) return { data: null, error: { code: '23505', message: SEGREDO } };
        chaves.add(chaveUnica(l));
      }
      t.push(...novas);
      return { data: novas, error: null };
    }
    const alvo = t.filter(casa);
    if (op.modo === 'update') {
      if (estado.erroUpdate && estado.erroUpdate(op)) return { data: null, error: { code: 'XX000', message: SEGREDO } };
      const conflito = alvo.some((l) => {
        const k = chaveUnica({ ...l, ...op.patch });
        return t.some((o) => o !== l && chaveUnica(o) === k);
      });
      if (conflito) return { data: null, error: { code: '23505', message: SEGREDO } };
      alvo.forEach((l) => Object.assign(l, op.patch));
      return { data: alvo, error: null };
    }
    const [de, ate] = op.range || [0, Infinity];
    return { data: alvo.slice(de, Math.min(ate + 1, de + MAX_ROWS)).map((l) => ({ ...l })), error: null };
  };
  const q = {
    select() { return q; },
    insert(p) { op.modo = 'insert'; op.patch = p; return q; },
    update(p) { op.modo = 'update'; op.patch = p; return q; },
    eq(c, v) { op.filtros.push([c, v]); return q; },
    order() { return q; },
    range(de, ate) { op.range = [de, ate]; return q; },
    maybeSingle() { const r = executar(); return Promise.resolve({ data: r.data && r.data[0] || null, error: r.error }); },
    then(ok, falha) {
      if (op.modo !== 'update') return Promise.resolve(executar()).then(ok, falha);
      // Update assíncrono para medir quantos ficam em voo ao mesmo tempo.
      estado.emVoo++; estado.maxEmVoo = Math.max(estado.maxEmVoo, estado.emVoo);
      return new Promise((fim) => setImmediate(() => { estado.emVoo--; fim(executar()); })).then(ok, falha);
    },
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

// ── Unidades estruturadas (agrupador, andar, tipo) ──────────────────────────
const doC1 = () => tabelas.unidades.filter((l) => l.cliente_id === C1);
const acha = (bloco, nome) => doC1().find((l) => (l.bloco || '') === bloco && l.nome === nome);

async function estruturadas() {
  await caso('GET devolve bloco, andar, tipo, ordem e rotulo', async () => {
    const r = await chamar(unidades, 'portaria', 'GET', {});
    assert.strictEqual(r.code, 200);
    const t = r.body.find((l) => l.id === U_T1);
    assert.deepStrictEqual(
      { id: t.id, bloco: t.bloco, nome: t.nome, andar: t.andar, tipo: t.tipo, ordem: t.ordem, rotulo: t.rotulo },
      { id: U_T1, bloco: 'Torre 1', nome: '101', andar: '1', tipo: 'apartamento', ordem: 1, rotulo: 'Torre 1 · 101' });
    assert.strictEqual(r.body.find((l) => l.id === U_C1).rotulo, 'Casa 1');
    assert.ok(!r.body.some((l) => l.id === U_INATIVA));
  });

  await caso('POST unidades: cria, conta existentes (sem diferenciar maiúsculas), reativa inativa, recusa inválidas', async () => {
    const r = await chamar(unidades, 'admin', 'POST', { body: { cliente_id: C1, unidades: [
      { bloco: '  Torre 2 ', nome: ' 201 ', andar: ' 2 ', tipo: 'casa' },
      { bloco: 'torre 1', nome: '101' },                 // já existe (maiúsculas diferentes)
      { bloco: 'Torre 1', nome: '102', tipo: 'Loja' },   // inativa → reativa
      { bloco: '', nome: '101', andar: '' },             // sem bloco: não colide com Torre 1 · 101
      { bloco: 'Torre 2', nome: '202', tipo: 'garagem' },// tipo inválido
      { bloco: 'Torre 2', nome: '   ' },                 // sem nome
      { bloco: 'TORRE 2', nome: '201' },                 // duplicada no lote
      { bloco: 'x'.repeat(41), nome: '1' },              // agrupador longo
      { nome: '3', andar: '12345678901' },               // andar longo
      { nome: 'x'.repeat(61) },                          // nome longo
      'texto solto',                                     // não é objeto
      { nome: 'Lote 7', tipo: 'FIP (Fração Ideal)' },    // rótulo vira id
    ] } });
    assert.strictEqual(r.code, 201);
    assert.strictEqual(r.body.criadas, 4);
    assert.strictEqual(r.body.ja_existiam, 1);
    assert.deepStrictEqual(r.body.recusadas.map((x) => x.linha), [5, 6, 7, 8, 9, 10, 11]);
    assert.ok(r.body.recusadas.every((x) => typeof x.motivo === 'string' && x.motivo));
    assert.match(r.body.recusadas[0].motivo, /tipo/i);
    assert.match(r.body.recusadas[2].motivo, /duplicad/i);
    assert.ok(!JSON.stringify(r.body).includes('garagem'), 'motivo não ecoa a entrada');

    const t2 = acha('Torre 2', '201');
    assert.deepStrictEqual({ bloco: t2.bloco, nome: t2.nome, andar: t2.andar, tipo: t2.tipo }, { bloco: 'Torre 2', nome: '201', andar: '2', tipo: 'casa' });
    const semBloco = acha('', '101');
    assert.strictEqual(semBloco.bloco, null);
    assert.strictEqual(semBloco.andar, null);
    assert.strictEqual(semBloco.tipo, 'apartamento');
    assert.strictEqual(acha('', 'Lote 7').tipo, 'fip');
    const reativada = tabelas.unidades.find((l) => l.id === U_INATIVA);
    assert.strictEqual(reativada.ativo, true);
    assert.strictEqual(reativada.tipo, 'loja');
    assert.strictEqual(doC1().filter((l) => l.bloco === 'Torre 1' && l.nome === '101').length, 1);
    assert.ok(t2.ordem > 4, 'ordem continua após a maior');
    const inserts = escritas().filter((o) => o.modo === 'insert');
    assert.strictEqual(inserts.length, 1, 'um insert só, sem upsert');
    assert.strictEqual(estado.auditoria.length, 1);
  });

  await caso('POST unidades: corpo inválido, lista vazia ou acima do limite → 400 sem escrever', async () => {
    assert.strictEqual((await chamar(unidades, 'admin', 'POST', { body: { cliente_id: C1, unidades: 'x' } })).code, 400);
    assert.strictEqual((await chamar(unidades, 'admin', 'POST', { body: { cliente_id: C1, unidades: [] } })).code, 400);
    const muitas = Array.from({ length: 2001 }, (_, i) => ({ nome: String(i) }));
    const r = await chamar(unidades, 'admin', 'POST', { body: { cliente_id: C1, unidades: muitas } });
    assert.strictEqual(r.code, 400);
    assert.match(r.body.error, /2000/);
    assert.strictEqual(escritas().length, 0);
  });

  await caso('POST unidades: só inválidas → 201 sem escrever', async () => {
    const r = await chamar(unidades, 'admin', 'POST', { body: { cliente_id: C1, unidades: [{ nome: '' }, { nome: '1', tipo: 'x' }] } });
    assert.strictEqual(r.code, 201);
    assert.deepStrictEqual({ criadas: r.body.criadas, ja_existiam: r.body.ja_existiam }, { criadas: 0, ja_existiam: 0 });
    assert.strictEqual(r.body.recusadas.length, 2);
    assert.strictEqual(escritas().length, 0);
  });

  await caso('POST unidades: roles e cliente (portaria/operador 403, outro cliente 403, super qualquer)', async () => {
    const corpo = { cliente_id: C1, unidades: [{ nome: 'N1' }] };
    assert.strictEqual((await chamar(unidades, 'portaria', 'POST', { body: corpo })).code, 403);
    assert.strictEqual((await chamar(unidades, 'operador', 'POST', { body: corpo })).code, 403);
    assert.strictEqual((await chamar(unidades, 'admin', 'POST', { body: { cliente_id: C2, unidades: [{ nome: 'N1' }] } })).code, 403);
    assert.strictEqual(escritas().length, 0);
    const r = await chamar(unidades, 'super', 'POST', { body: { cliente_id: C2, unidades: [{ bloco: 'Q1', nome: 'L1', tipo: 'lote' }] } });
    assert.strictEqual(r.code, 201);
    assert.strictEqual(r.body.criadas, 1);
    assert.ok(tabelas.unidades.find((l) => l.cliente_id === C2 && l.nome === 'L1' && l.tipo === 'lote'));
  });

  await caso('POST unidades: corrida (23505) relê e conta como já existentes, sem 500', async () => {
    estado.antesDoInsert = () => tabelas.unidades.push({ id: 'corrida', cliente_id: C1, bloco: 'Torre 3', nome: '301', tipo: 'apartamento', ordem: 9, ativo: true });
    const r = await chamar(unidades, 'admin', 'POST', { body: { cliente_id: C1, unidades: [{ bloco: 'Torre 3', nome: '301' }, { bloco: 'Torre 3', nome: '302' }] } });
    assert.strictEqual(r.code, 201);
    assert.strictEqual(r.body.criadas, 1);
    assert.strictEqual(r.body.ja_existiam, 1);
    assert.strictEqual(doC1().filter((l) => l.bloco === 'Torre 3').length, 2);
  });

  await caso('POST unidades: mais de 1000 existentes são lidas em páginas (sem 409 permanente)', async () => {
    for (let i = 0; i < 1500; i++) {
      tabelas.unidades.push({ id: `g-${i}`, cliente_id: C1, bloco: 'Torre G', nome: String(i), tipo: 'apartamento', ordem: 10 + i, ativo: true });
    }
    const r = await chamar(unidades, 'admin', 'POST', { body: { cliente_id: C1, unidades: [
      { bloco: 'Torre G', nome: '1499' }, { bloco: 'torre g', nome: '1200' }, { bloco: 'Torre G', nome: '1500' },
    ] } });
    assert.strictEqual(r.code, 201);
    assert.deepStrictEqual({ criadas: r.body.criadas, ja_existiam: r.body.ja_existiam }, { criadas: 1, ja_existiam: 2 });
    assert.strictEqual(acha('Torre G', '1500').ordem, 10 + 1500, 'ordem continua após a maior, mesmo além da 1ª página');
    const leituras = estado.ops.filter((o) => o.modo === 'select' && o.range);
    assert.ok(leituras.length >= 2, 'leu mais de uma página');
  });

  await caso('POST unidades: reativação em grupos paralelos, presa ao cliente', async () => {
    for (let i = 0; i < 25; i++) {
      tabelas.unidades.push({ id: `r-${i}`, cliente_id: C1, bloco: 'Torre R', nome: String(i), tipo: 'apartamento', ordem: 0, ativo: false });
    }
    const r = await chamar(unidades, 'admin', 'POST', { body: { cliente_id: C1, unidades:
      Array.from({ length: 25 }, (_, i) => ({ bloco: 'Torre R', nome: String(i), tipo: i % 2 ? 'casa' : 'loja' })) } });
    assert.strictEqual(r.code, 201);
    assert.strictEqual(r.body.criadas, 25);
    const torreR = doC1().filter((l) => l.bloco === 'Torre R');
    assert.ok(torreR.every((l) => l.ativo && l.tipo === (Number(l.nome) % 2 ? 'casa' : 'loja')));
    assert.strictEqual(new Set(torreR.map((l) => l.ordem)).size, 25, 'cada uma com a sua ordem');
    const updates = escritas().filter((o) => o.modo === 'update');
    assert.strictEqual(updates.length, 25);
    assert.ok(updates.every((o) => o.filtros.some(([c, v]) => c === 'cliente_id' && v === C1)));
    assert.ok(estado.maxEmVoo > 1, 'não é um por vez');
    assert.ok(estado.maxEmVoo <= 10, 'no máximo 10 em voo');
  });

  await caso('POST unidades: falha numa reativação → 500 sem detalhe e sem insert', async () => {
    tabelas.unidades.push({ id: 'r-x', cliente_id: C1, bloco: 'Torre R', nome: 'X', tipo: 'apartamento', ordem: 0, ativo: false });
    estado.erroUpdate = (op) => op.filtros.some(([c, v]) => c === 'id' && v === 'r-x');
    const r = await chamar(unidades, 'admin', 'POST', { body: { cliente_id: C1, unidades: [{ bloco: 'Torre R', nome: 'X' }, { nome: 'Nova Y' }] } });
    assert.strictEqual(r.code, 500);
    assert.ok(!JSON.stringify(r.body).includes(SEGREDO));
    assert.ok(!acha('', 'Nova Y'));
  });

  await caso('POST unidades: corrida dupla (23505 duas vezes) → 409 sem detalhe', async () => {
    const corrida = (n) => () => tabelas.unidades.push({ id: `c-${n}`, cliente_id: C1, bloco: 'Torre 4', nome: `40${n}`, tipo: 'apartamento', ordem: 9, ativo: true });
    estado.antesDoInsert = () => { corrida(1)(); estado.antesDoInsert = corrida(2); };
    const r = await chamar(unidades, 'admin', 'POST', { body: { cliente_id: C1, unidades: [1, 2, 3].map((n) => ({ bloco: 'Torre 4', nome: `40${n}` })) } });
    assert.strictEqual(r.code, 409);
    assert.ok(!JSON.stringify(r.body).includes(SEGREDO));
    assert.ok(!acha('Torre 4', '403'));
  });

  await caso('POST unidades: erro de escrita não é engolido → 500 sem detalhe', async () => {
    const original = tabelas.unidades;
    estado.antesDoInsert = () => { estado.erro = { code: 'XX000', message: SEGREDO }; };
    const r = await chamar(unidades, 'admin', 'POST', { body: { cliente_id: C1, unidades: [{ nome: 'Nova X' }] } });
    assert.strictEqual(r.code, 500);
    assert.ok(!JSON.stringify(r.body).includes(SEGREDO));
    assert.ok(!original.some((l) => l.nome === 'Nova X'));
  });

  await caso('POST texto legado: sem bloco não colide com unidade de agrupador', async () => {
    const r = await chamar(unidades, 'admin', 'POST', { body: { cliente_id: C1, texto: '101' } });
    assert.strictEqual(r.code, 201);
    assert.deepStrictEqual(r.body, { criadas: 1, ja_existiam: 0, ignoradas: [] });
    assert.ok(!acha('', '101').bloco);
  });

  await caso('PUT: edita bloco, nome, andar e tipo (trim, vazio vira null) + auditoria', async () => {
    const r = await chamar(unidades, 'admin', 'PUT', { query: { id: U_T1 }, body: { bloco: '  ', nome: ' 101A ', andar: '', tipo: 'Sala' } });
    assert.strictEqual(r.code, 200);
    const l = tabelas.unidades.find((x) => x.id === U_T1);
    assert.deepStrictEqual({ bloco: l.bloco, nome: l.nome, andar: l.andar, tipo: l.tipo }, { bloco: null, nome: '101A', andar: null, tipo: 'sala' });
    assert.strictEqual(r.body.rotulo, '101A');
    assert.strictEqual(r.body.tipo, 'sala');
    assert.strictEqual(estado.auditoria[0].acao, 'atualizar');
    const upd = escritas().find((o) => o.modo === 'update');
    assert.ok(upd.filtros.some(([c, v]) => c === 'cliente_id' && v === C1));
  });

  await caso('PUT: só o campo enviado muda', async () => {
    const r = await chamar(unidades, 'admin', 'PUT', { query: { id: U_T1 }, body: { andar: 'Térreo' } });
    assert.strictEqual(r.code, 200);
    const l = tabelas.unidades.find((x) => x.id === U_T1);
    assert.deepStrictEqual({ bloco: l.bloco, nome: l.nome, andar: l.andar, tipo: l.tipo }, { bloco: 'Torre 1', nome: '101', andar: 'Térreo', tipo: 'apartamento' });
    assert.strictEqual(r.body.rotulo, 'Torre 1 · 101');
  });

  await caso('PUT: conflito com outra unidade (inclusive desativada) → 409', async () => {
    const r = await chamar(unidades, 'admin', 'PUT', { query: { id: U_T1 }, body: { nome: '102' } });
    assert.strictEqual(r.code, 409);
    assert.ok(!JSON.stringify(r.body).includes(SEGREDO));
    assert.strictEqual(tabelas.unidades.find((x) => x.id === U_T1).nome, '101');
    const r2 = await chamar(unidades, 'admin', 'PUT', { query: { id: U_C1 }, body: { nome: 'CASA 1' } });
    assert.strictEqual(r2.code, 200, 'trocar só a caixa do próprio nome não conflita');
  });

  await caso('PUT: tipo inválido, campo longo, nome vazio ou corpo sem campos → 400 sem escrever', async () => {
    for (const body of [{ tipo: 'garagem' }, { nome: '' }, { nome: {} }, { nome: null }, { bloco: 'x'.repeat(41) }, { andar: '12345678901' }, {}]) {
      const r = await chamar(unidades, 'admin', 'PUT', { query: { id: U_T1 }, body });
      assert.strictEqual(r.code, 400, JSON.stringify(body));
      assert.strictEqual(escritas().length, 0);
    }
  });

  await caso('PUT: id de outro cliente → 404 (IDOR) sem escrever; inativa e inexistente → 404', async () => {
    for (const id of [U_C2, U_INATIVA, '99999999-9999-4999-8999-999999999999']) {
      const r = await chamar(unidades, 'admin', 'PUT', { query: { id }, body: { nome: 'Invasor' } });
      assert.strictEqual(r.code, 404, id);
      assert.strictEqual(escritas().length, 0);
    }
    assert.strictEqual(tabelas.unidades.find((x) => x.id === U_C2).nome, 'Casa 9');
  });

  await caso('PUT: id inválido → 400; portaria/operador → 403; super edita qualquer cliente', async () => {
    assert.strictEqual((await chamar(unidades, 'admin', 'PUT', { query: { id: 'x' }, body: { nome: 'a' } })).code, 400);
    assert.strictEqual((await chamar(unidades, 'portaria', 'PUT', { query: { id: U_T1 }, body: { nome: 'a' } })).code, 403);
    assert.strictEqual((await chamar(unidades, 'operador', 'PUT', { query: { id: U_T1 }, body: { nome: 'a' } })).code, 403);
    const r = await chamar(unidades, 'super', 'PUT', { query: { id: U_C2 }, body: { bloco: 'Quadra A' } });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(r.body.rotulo, 'Quadra A · Casa 9');
  });
}

let passou = 0;
async function caso(nome, fn) { reset(); estado.erro = null; estado.antesDoInsert = null; estado.erroUpdate = null; estado.emVoo = 0; estado.maxEmVoo = 0; await fn(); passou++; console.log(`ok - ${nome}`); }
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
    await caso(`${nomeApi}: DELETE de id de outro cliente → 404 sem escrever (não revela que existe)`, async () => {
      const r = await chamar(h, 'admin', 'DELETE', { query: { id: U_C2 } });
      assert.strictEqual(r.code, 404);
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
    assert.strictEqual((await chamar(unidades, 'admin', 'PATCH', {})).code, 405);
  });
  await estruturadas();
  console.log(`${passou} casos`);
})().catch((e) => { console.error = () => {}; process.stderr.write(`${e.stack}\n`); process.exit(1); });
