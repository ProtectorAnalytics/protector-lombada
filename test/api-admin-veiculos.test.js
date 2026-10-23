/**
 * API de vínculos de placa (/api/admin/veiculos) e findVeiculo (offline, módulos stubados).
 * Uso: node test/api-admin-veiculos.test.js
 */
const assert = require('node:assert');
const path = require('node:path');

const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const PORTEIRO_C1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PORTEIRO_C2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PORTEIRO_INATIVO = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const UNIDADE_C1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const UNIDADE_C2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const V_VIGENTE = 'f0000000-0000-4000-8000-000000000001';
const V_ENCERRADO = 'f0000000-0000-4000-8000-000000000002';
const SEGREDO = 'detalhe-interno-secreto';
const V_PORT_5 = 'f0000000-0000-4000-8000-000000000003';
const V_PORT_20 = 'f0000000-0000-4000-8000-000000000004';
const V_PORT_OUTRO = 'f0000000-0000-4000-8000-000000000005';
const V_PORT_C2 = 'f0000000-0000-4000-8000-000000000006';
const V_PAINEL_5 = 'f0000000-0000-4000-8000-000000000007';
const minutosAtras = (m) => new Date(Date.now() - m * 60000).toISOString();
const vPort = (id, extra) => ({
  id, cliente_id: C1, placa: 'QWE1R23', encerrado_em: null, origem: 'portaria',
  cadastrado_por_usuario: 'u-port', criado_em: minutosAtras(5), ...extra,
});

const TABELAS = {
  porteiros: [
    { id: PORTEIRO_C1, cliente_id: C1, nome: 'Seu Zé', ativo: true },
    { id: PORTEIRO_C2, cliente_id: C2, nome: 'Outro', ativo: true },
    { id: PORTEIRO_INATIVO, cliente_id: C1, nome: 'Antigo', ativo: false },
  ],
  unidades: [
    { id: UNIDADE_C1, cliente_id: C1, nome: 'Casa 1', ativo: true },
    { id: UNIDADE_C2, cliente_id: C2, nome: 'Casa 9', ativo: true },
  ],
  veiculos: [
    { id: V_VIGENTE, cliente_id: C1, placa: 'ABC1D23', encerrado_em: null },
    { id: V_ENCERRADO, cliente_id: C1, placa: 'XYZ9A87', encerrado_em: '2026-01-01T00:00:00Z' },
    vPort(V_PORT_5),
    vPort(V_PORT_20, { criado_em: minutosAtras(20) }),
    vPort(V_PORT_OUTRO, { cadastrado_por_usuario: 'u-outro' }),
    vPort(V_PORT_C2, { cliente_id: C2 }),
    vPort(V_PAINEL_5, { origem: 'painel' }),
  ],
};

const estado = { perfil: null, ops: [], rpc: [], auditoria: [], erroRpc: null };

function stub(rel, exports) {
  const id = require.resolve(path.join('..', rel));
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

// Query builder falso: grava a operação e resolve filtrando TABELAS por eq().
function tabela(nome) {
  const op = { tabela: nome, modo: 'select', filtros: [], patch: null, colunas: null };
  estado.ops.push(op);
  const linhas = () => (TABELAS[nome] || []).filter((l) =>
    op.filtros.every(([tipo, c, v]) => {
      if (tipo === 'eq' || tipo === 'is') return l[c] === v;
      if (tipo === 'gte') return String(l[c]) >= String(v);
      return true;
    }));
  const resultado = (unico) => {
    if (op.modo === 'delete') return { data: null, error: null };
    const ls = linhas().map((l) => (op.patch ? { ...l, ...op.patch } : l));
    if (unico) return { data: ls[0] || null, error: null };
    return { data: ls, error: null };
  };
  const q = {
    select(cols) { op.colunas = cols; return q; },
    update(p) { op.modo = 'update'; op.patch = p; return q; },
    insert(p) { op.modo = 'insert'; op.patch = p; return q; },
    delete() { op.modo = 'delete'; return q; },
    eq(c, v) { op.filtros.push(['eq', c, v]); return q; },
    is(c, v) { op.filtros.push(['is', c, v]); return q; },
    gte(c, v) { op.filtros.push(['gte', c, v]); return q; },
    in(c, v) { op.filtros.push(['in', c, v]); return q; },
    ilike(c, v) { op.filtros.push(['ilike', c, v]); return q; },
    order() { return q; },
    limit() { return q; },
    single() { return Promise.resolve(resultado(true)); },
    maybeSingle() { return Promise.resolve(resultado(true)); },
    then(ok, falha) { return Promise.resolve(resultado(false)).then(ok, falha); },
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
  supabase: {
    from: tabela,
    rpc: async (fn, args) => {
      estado.rpc.push({ fn, args, opsAntes: estado.ops.length });
      if (estado.erroRpc) return { data: null, error: estado.erroRpc };
      return { data: { id: 'novo', cliente_id: args.p_cliente_id, placa: args.p_placa }, error: null };
    },
  },
});

const handler = require('../api/admin/veiculos');

const PERFIS = {
  admin: { id: 'u-admin', role: 'admin_cliente', cliente_id: C1, nome: 'Síndica Ana' },
  super: { id: 'u-super', role: 'super_admin', cliente_id: null, nome: 'Protector' },
  portaria: { id: 'u-port', role: 'portaria', cliente_id: C1, nome: 'Tablet Portaria' },
};

function resp() {
  const r = { code: null, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

async function chamar(perfil, method, { query = {}, body } = {}) {
  estado.perfil = PERFIS[perfil];
  estado.ops = []; estado.rpc = []; estado.auditoria = [];
  const r = resp();
  await handler({ method, headers: {}, query, body }, r);
  return r;
}

const base = (extra) => ({ cliente_id: C1, placa: 'ABC1234', tipo_pessoa: 'morador', nome_morador: 'João', ...extra });
const escritas = () => estado.ops.filter((o) => o.modo !== 'select');

let passou = 0;
async function caso(nome, fn) {
  await fn();
  passou++; console.log(`ok - ${nome}`);
}

const originalError = console.error;
console.error = () => {};

(async () => {
  // ---------- POST ----------
  await caso('POST sem tipo_pessoa → 400 sem chamar a RPC', async () => {
    const r = await chamar('admin', 'POST', { body: base({ tipo_pessoa: undefined }) });
    assert.strictEqual(r.code, 400);
    assert.strictEqual(estado.rpc.length, 0);
  });
  await caso('POST com tipo_pessoa desconhecido (parente) → 400', async () => {
    const r = await chamar('admin', 'POST', { body: base({ tipo_pessoa: 'parente' }) });
    assert.strictEqual(r.code, 400);
    assert.strictEqual(estado.rpc.length, 0);
  });
  await caso('POST com placa inválida → 400', async () => {
    const r = await chamar('admin', 'POST', { body: base({ placa: 'XX' }) });
    assert.strictEqual(r.code, 400);
    assert.strictEqual(estado.rpc.length, 0);
  });
  await caso('POST como admin_cliente chama vincular_placa com origem painel e nome do usuário', async () => {
    const r = await chamar('admin', 'POST', { body: base({ unidade_id: UNIDADE_C1, marca: 'Fiat', cor: 'Prata' }) });
    assert.strictEqual(r.code, 201);
    assert.strictEqual(estado.rpc.length, 1);
    const { fn, args } = estado.rpc[0];
    assert.strictEqual(fn, 'vincular_placa');
    assert.deepStrictEqual(args, {
      p_cliente_id: C1, p_placa: 'ABC1234', p_tipo: 'morador', p_nome: 'João', p_unidade: null,
      p_unidade_id: UNIDADE_C1, p_marca: 'Fiat', p_cor: 'Prata', p_origem: 'painel',
      p_cadastrado_por: 'Síndica Ana', p_usuario: 'u-admin',
    });
    assert.strictEqual(estado.auditoria.length, 1);
    assert.strictEqual(estado.auditoria[0].tabela, 'veiculos');
  });
  await caso('POST como super_admin grava origem admin; planilha é respeitada', async () => {
    await chamar('super', 'POST', { body: base() });
    assert.strictEqual(estado.rpc[0].args.p_origem, 'admin');
    await chamar('admin', 'POST', { body: base({ origem: 'planilha' }) });
    assert.strictEqual(estado.rpc[0].args.p_origem, 'planilha');
    await chamar('admin', 'POST', { body: base({ origem: 'condfy' }) });
    assert.strictEqual(estado.rpc[0].args.p_origem, 'painel');
  });
  await caso('POST como portaria ignora origem enviada e usa o nome do porteiro', async () => {
    const r = await chamar('portaria', 'POST', { body: base({ origem: 'condfy', porteiro_id: PORTEIRO_C1 }) });
    assert.strictEqual(r.code, 201);
    assert.strictEqual(estado.rpc[0].args.p_origem, 'portaria');
    assert.strictEqual(estado.rpc[0].args.p_cadastrado_por, 'Seu Zé');
    assert.strictEqual(estado.auditoria.length, 1);
  });
  await caso('POST como portaria sem porteiro_id → 400', async () => {
    const r = await chamar('portaria', 'POST', { body: base() });
    assert.strictEqual(r.code, 400);
    assert.strictEqual(estado.rpc.length, 0);
  });
  await caso('POST como portaria com porteiro de outro cliente → 400', async () => {
    const r = await chamar('portaria', 'POST', { body: base({ porteiro_id: PORTEIRO_C2 }) });
    assert.strictEqual(r.code, 400);
    assert.strictEqual(estado.rpc.length, 0);
  });
  await caso('POST como portaria com porteiro inativo → 400', async () => {
    const r = await chamar('portaria', 'POST', { body: base({ porteiro_id: PORTEIRO_INATIVO }) });
    assert.strictEqual(r.code, 400);
    assert.strictEqual(estado.rpc.length, 0);
  });
  await caso('POST com unidade_id de outro cliente → 400', async () => {
    const r = await chamar('admin', 'POST', { body: base({ unidade_id: UNIDADE_C2 }) });
    assert.strictEqual(r.code, 400);
    assert.strictEqual(estado.rpc.length, 0);
  });
  await caso('portaria em cliente diferente do seu → 403', async () => {
    const r = await chamar('portaria', 'POST', { body: base({ cliente_id: C2, porteiro_id: PORTEIRO_C2 }) });
    assert.strictEqual(r.code, 403);
    assert.strictEqual(estado.rpc.length, 0);
    const g = await chamar('portaria', 'GET', { query: { cliente_id: C2 } });
    assert.strictEqual(g.code, 403);
  });
  await caso('erro 22023 da RPC → 400 sem texto interno', async () => {
    estado.erroRpc = { code: '22023', message: SEGREDO };
    const r = await chamar('admin', 'POST', { body: base() });
    estado.erroRpc = null;
    assert.strictEqual(r.code, 400);
    assert.ok(!JSON.stringify(r.body).includes(SEGREDO));
  });
  await caso('outro erro da RPC → 500 sem texto interno', async () => {
    estado.erroRpc = { code: '42501', message: SEGREDO };
    const r = await chamar('admin', 'POST', { body: base() });
    estado.erroRpc = null;
    assert.strictEqual(r.code, 500);
    assert.ok(!JSON.stringify(r.body).includes(SEGREDO));
  });

  // ---------- GET ----------
  await caso('GET padrão filtra só vigentes; historico=1 traz todos', async () => {
    const r = await chamar('portaria', 'GET', { query: { cliente_id: C1 } });
    assert.strictEqual(r.code, 200);
    assert.ok(estado.ops[0].filtros.some(([t, c, v]) => t === 'is' && c === 'encerrado_em' && v === null));
    const doC1 = TABELAS.veiculos.filter((v) => v.cliente_id === C1);
    assert.deepStrictEqual(r.body.map((v) => v.id), doC1.filter((v) => v.encerrado_em === null).map((v) => v.id));
    const h = await chamar('admin', 'GET', { query: { cliente_id: C1, historico: '1' } });
    assert.strictEqual(h.code, 200);
    assert.ok(!estado.ops[0].filtros.some(([t, c]) => t === 'is' && c === 'encerrado_em'));
    assert.strictEqual(h.body.length, doC1.length);
    assert.ok(/\bmarca\b/.test(estado.ops[0].colunas), 'admin continua vendo marca no histórico');
  });
  await caso('GET portaria historico=1 traz só as colunas de sugestão (sem marca/cor/origem)', async () => {
    const h = await chamar('portaria', 'GET', { query: { cliente_id: C1, historico: '1' } });
    assert.strictEqual(h.code, 200);
    const cols = estado.ops[0].colunas.split(',').map((c) => c.trim());
    assert.deepStrictEqual(cols, ['id', 'placa', 'nome_morador', 'unidade', 'unidade_id', 'tipo_pessoa',
      'vigente_desde', 'encerrado_em', 'criado_em', 'cadastrado_por']);
    assert.ok(!estado.ops[0].filtros.some(([t, c]) => t === 'is' && c === 'encerrado_em'));
    const v = await chamar('portaria', 'GET', { query: { cliente_id: C1 } });
    assert.strictEqual(v.code, 200);
    assert.ok(/\bmarca\b/.test(estado.ops[0].colunas), 'vigentes da portaria sem mudança');
  });

  // ---------- POST com substitui_id (correção da portaria) ----------
  const corrige = (id, extra) => base({ placa: 'QWE1R24', porteiro_id: PORTEIRO_C1, substitui_id: id, ...extra });
  await caso('portaria corrige o próprio cadastro de 5 min: encerra e depois vincula a placa nova', async () => {
    const r = await chamar('portaria', 'POST', { body: corrige(V_PORT_5) });
    assert.strictEqual(r.code, 201);
    const ws = escritas();
    assert.strictEqual(ws.length, 1);
    assert.strictEqual(ws[0].modo, 'update');
    assert.deepStrictEqual(Object.keys(ws[0].patch), ['encerrado_em']);
    assert.ok(!Number.isNaN(Date.parse(ws[0].patch.encerrado_em)));
    const f = ws[0].filtros;
    assert.ok(f.some(([t, c, v]) => t === 'eq' && c === 'id' && v === V_PORT_5));
    assert.ok(f.some(([t, c, v]) => t === 'eq' && c === 'cliente_id' && v === C1));
    assert.ok(f.some(([t, c, v]) => t === 'eq' && c === 'cadastrado_por_usuario' && v === 'u-port'));
    assert.ok(f.some(([t, c, v]) => t === 'eq' && c === 'origem' && v === 'portaria'));
    assert.ok(f.some(([t, c, v]) => t === 'is' && c === 'encerrado_em' && v === null));
    assert.ok(f.some(([t, c]) => t === 'gte' && c === 'criado_em'));
    assert.strictEqual(estado.rpc.length, 1);
    assert.strictEqual(estado.rpc[0].args.p_placa, 'QWE1R24');
    assert.ok(estado.ops.indexOf(ws[0]) < estado.rpc[0].opsAntes, 'encerra antes de vincular');
    const acoes = estado.auditoria.map((a) => a.acao);
    assert.deepStrictEqual(acoes, ['encerrar', 'vincular']);
    assert.strictEqual(estado.auditoria[0].registroId, V_PORT_5);
    assert.strictEqual(estado.auditoria[1].detalhes.substitui_id, V_PORT_5);
  });
  const recusa = async (nome, perfil, body) => caso(nome, async () => {
    const r = await chamar(perfil, 'POST', { body });
    assert.strictEqual(r.code, 400);
    assert.ok(typeof r.body.error === 'string' && r.body.error.length > 0);
    assert.strictEqual(escritas().length, 0);
    assert.strictEqual(estado.rpc.length, 0);
    assert.strictEqual(estado.auditoria.length, 0);
  });
  await recusa('portaria com substitui_id de 20 min → 400 sem escrita', 'portaria', corrige(V_PORT_20));
  await recusa('portaria com substitui_id de outro usuário → 400 sem escrita', 'portaria', corrige(V_PORT_OUTRO));
  await recusa('portaria com substitui_id de outro cliente → 400 sem escrita', 'portaria', corrige(V_PORT_C2));
  await recusa('portaria com substitui_id de origem painel → 400 sem escrita', 'portaria', corrige(V_PAINEL_5));
  await recusa('portaria com substitui_id já encerrado → 400 sem escrita', 'portaria', corrige(V_ENCERRADO));
  await recusa('portaria com substitui_id inexistente → 400 sem escrita', 'portaria', corrige('f0000000-0000-4000-8000-0000000000ff'));
  await recusa('portaria com substitui_id inválido → 400 sem escrita', 'portaria', corrige('nao-e-uuid'));
  await recusa('admin_cliente com substitui_id → 400 sem escrita', 'admin', corrige(V_PORT_5, { porteiro_id: undefined }));
  await recusa('super_admin com substitui_id → 400 sem escrita', 'super', corrige(V_PORT_5, { porteiro_id: undefined }));
  await caso('falha da RPC depois de encerrar reabre o cadastro original e não vaza erro', async () => {
    estado.erroRpc = { code: '42501', message: SEGREDO };
    const r = await chamar('portaria', 'POST', { body: corrige(V_PORT_5) });
    estado.erroRpc = null;
    assert.strictEqual(r.code, 500);
    assert.ok(!JSON.stringify(r.body).includes(SEGREDO));
    const ws = escritas();
    assert.strictEqual(ws.length, 2);
    assert.ok(ws[0].patch.encerrado_em);
    assert.deepStrictEqual(ws[1].patch, { encerrado_em: null });
    assert.ok(ws[1].filtros.some(([t, c, v]) => t === 'eq' && c === 'id' && v === V_PORT_5));
    assert.ok(ws[1].filtros.some(([t, c, v]) => t === 'eq' && c === 'encerrado_em' && v === ws[0].patch.encerrado_em));
    assert.deepStrictEqual(estado.auditoria.map((a) => a.acao), ['encerrar', 'reabrir']);
  });
  await caso('erro 22023 da RPC na correção → 400 e reabre o original', async () => {
    estado.erroRpc = { code: '22023', message: SEGREDO };
    const r = await chamar('portaria', 'POST', { body: corrige(V_PORT_5) });
    estado.erroRpc = null;
    assert.strictEqual(r.code, 400);
    assert.ok(!JSON.stringify(r.body).includes(SEGREDO));
    assert.deepStrictEqual(escritas()[1].patch, { encerrado_em: null });
  });

  // ---------- PUT ----------
  await caso('PUT com placa no corpo → 400 sem gravar', async () => {
    const r = await chamar('admin', 'PUT', { query: { id: V_VIGENTE }, body: { placa: 'ZZZ1234', nome_morador: 'X' } });
    assert.strictEqual(r.code, 400);
    assert.strictEqual(escritas().length, 0);
  });
  await caso('PUT só grava os campos permitidos (ativo e cliente_id ignorados)', async () => {
    const r = await chamar('admin', 'PUT', {
      query: { id: V_VIGENTE },
      body: { nome_morador: 'Maria', tipo_pessoa: 'visitante', ativo: true, cliente_id: C2, encerrado_em: null, origem: 'admin' },
    });
    assert.strictEqual(r.code, 200);
    const [w] = escritas();
    assert.deepStrictEqual(w.patch, { nome_morador: 'Maria', tipo_pessoa: 'visitante' });
    assert.strictEqual(estado.auditoria.length, 1);
  });
  await caso('PUT com tipo_pessoa inválido → 400', async () => {
    const r = await chamar('admin', 'PUT', { query: { id: V_VIGENTE }, body: { tipo_pessoa: 'parente' } });
    assert.strictEqual(r.code, 400);
    assert.strictEqual(escritas().length, 0);
  });
  await caso('PUT com unidade_id de outro cliente → 400', async () => {
    const r = await chamar('admin', 'PUT', { query: { id: V_VIGENTE }, body: { unidade_id: UNIDADE_C2 } });
    assert.strictEqual(r.code, 400);
    assert.strictEqual(escritas().length, 0);
  });
  await caso('PUT em vínculo encerrado → 409', async () => {
    const r = await chamar('admin', 'PUT', { query: { id: V_ENCERRADO }, body: { nome_morador: 'Maria' } });
    assert.strictEqual(r.code, 409);
    assert.strictEqual(escritas().length, 0);
  });

  // ---------- DELETE ----------
  await caso('DELETE comum encerra com encerrado_em ISO, sem delete()', async () => {
    const r = await chamar('admin', 'DELETE', { query: { id: V_VIGENTE } });
    assert.strictEqual(r.code, 200);
    const ws = escritas();
    assert.strictEqual(ws.length, 1);
    assert.strictEqual(ws[0].modo, 'update');
    assert.deepStrictEqual(Object.keys(ws[0].patch), ['encerrado_em']);
    assert.ok(!Number.isNaN(Date.parse(ws[0].patch.encerrado_em)));
    assert.strictEqual(new Date(ws[0].patch.encerrado_em).toISOString(), ws[0].patch.encerrado_em);
    assert.strictEqual(estado.auditoria.length, 1);
  });
  await caso('DELETE permanent=true como admin_cliente → 403', async () => {
    const r = await chamar('admin', 'DELETE', { query: { id: V_VIGENTE, permanent: 'true' } });
    assert.strictEqual(r.code, 403);
    assert.strictEqual(escritas().length, 0);
  });
  await caso('DELETE permanent=true como super_admin apaga e audita', async () => {
    const r = await chamar('super', 'DELETE', { query: { id: V_VIGENTE, permanent: 'true' } });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(escritas()[0].modo, 'delete');
    assert.strictEqual(estado.auditoria.length, 1);
  });
  await caso('DELETE como portaria → 403', async () => {
    const r = await chamar('portaria', 'DELETE', { query: { id: V_VIGENTE } });
    assert.strictEqual(r.code, 403);
    assert.strictEqual(escritas().length, 0);
  });

  // ---------- findVeiculo ----------
  await caso('findVeiculo filtra vigente e casa as duas grafias', async () => {
    const supaId = require.resolve('@supabase/supabase-js');
    const chamadas = [];
    require.cache[supaId] = {
      id: supaId, filename: supaId, loaded: true,
      exports: { createClient: () => ({ from: (t) => { const q = tabela(t); chamadas.push(estado.ops[estado.ops.length - 1]); return q; } }) },
    };
    delete require.cache[require.resolve('../lib/supabase')];
    const { findVeiculo } = require('../lib/supabase');
    estado.ops = [];
    await findVeiculo(C1, 'ABC1234');
    const op = chamadas[0];
    assert.ok(op.filtros.some(([t, c, v]) => t === 'is' && c === 'encerrado_em' && v === null));
    assert.ok(op.filtros.some(([t, c, v]) => t === 'in' && c === 'placa' && JSON.stringify(v) === JSON.stringify(['ABC1C34', 'ABC1234'])));
    assert.ok(!op.filtros.some(([, c]) => c === 'ativo'));
  });

  console.error = originalError;
  console.log(`${passou} testes passaram`);
})().catch((e) => { console.error = originalError; console.error(e); process.exit(1); });
