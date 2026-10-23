/**
 * GET /api/admin/historico-cadastros (offline, supabase stubado).
 * Uso: node test/api-admin-historico-cadastros.test.js
 */
const assert = require('node:assert');
const path = require('node:path');

const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';

// Dados fictícios
const AUDIT = [
  {
    id: 'a1', tabela: 'veiculos', acao: 'atualizar', usuario_id: 'u-oper', ip: '10.0.0.9', criado_em: '2026-10-23T19:12:00Z',
    detalhes: { cliente_id: C1, placa: 'TST0A00', tipo_pessoa: 'prestador', antes: { tipo_pessoa: 'morador' }, depois: { tipo_pessoa: 'prestador' } },
  },
  {
    id: 'a2', tabela: 'veiculos', acao: 'vincular', usuario_id: 'u-admin', ip: '10.0.0.8', criado_em: '2026-10-20T12:00:00Z',
    detalhes: { cliente_id: C1, placa: 'TST0000', tipo_pessoa: 'morador', nome_morador: 'Pessoa Teste' },
  },
  {
    id: 'a3', tabela: 'veiculos', acao: 'atualizar', usuario_id: 'u-oper', ip: '10.0.0.9', criado_em: '2026-10-19T12:00:00Z',
    detalhes: { cliente_id: C2, placa: 'OUT1A11', nome_morador: 'De outro condomínio' },
  },
  {
    id: 'a4', tabela: 'usuarios', acao: 'atualizar', usuario_id: 'u-admin', ip: '10.0.0.8', criado_em: '2026-10-18T12:00:00Z',
    detalhes: { cliente_id: C1, email: 'teste@example.com' },
  },
  {
    id: 'a5', tabela: 'veiculos', acao: 'reabrir_falhou', usuario_id: 'u-port', ip: '10.0.0.7', criado_em: '2026-10-17T12:00:00Z',
    detalhes: { cliente_id: C1, placa: 'TST0A00' },
  },
];
const USUARIOS = [
  { id: 'u-oper', nome: 'Operador Teste', role: 'operador', email: 'oper@example.com', auth_id: 'x' },
  { id: 'u-admin', nome: 'Síndica Teste', role: 'admin_cliente', email: 'sind@example.com', auth_id: 'y' },
];

const estado = { perfil: null, ops: [], muitos: 0, erro: null };

function valor(l, c) {
  if (c.startsWith('detalhes->>')) return l.detalhes && l.detalhes[c.slice(11)];
  return l[c];
}

function tabela(nome) {
  const op = { tabela: nome, filtros: [], colunas: null, range: null };
  estado.ops.push(op);
  const fonte = () => {
    if (nome === 'usuarios') return USUARIOS;
    if (estado.muitos) {
      return Array.from({ length: estado.muitos }, (_, i) => ({
        id: `m${i}`, tabela: 'veiculos', acao: 'encerrar', usuario_id: null, ip: 'x',
        criado_em: new Date(Date.UTC(2026, 9, 1) + i * 1000).toISOString(), detalhes: { cliente_id: C1, placa: 'TST0A00' },
      }));
    }
    return AUDIT;
  };
  const resultado = () => {
    if (estado.erro && nome === estado.erro) return { data: null, error: { message: 'falhou' } };
    let ls = fonte().filter((l) => op.filtros.every(([t, c, v]) => {
      const x = valor(l, c);
      if (t === 'eq') return x === v;
      if (t === 'in') return v.includes(x);
      if (t === 'gte') return String(x) >= String(v);
      if (t === 'lte') return String(x) <= String(v);
      return true;
    }));
    ls = [...ls].sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
    if (op.range) ls = ls.slice(op.range[0], op.range[1] + 1);
    // Como o banco: só as colunas pedidas
    const cols = (op.colunas || '').split(',').map((c) => c.trim()).filter(Boolean);
    return { data: ls.map((l) => Object.fromEntries(cols.map((c) => [c, l[c]]))), error: null };
  };
  const q = {
    select(c) { op.colunas = c; return q; },
    eq(c, v) { op.filtros.push(['eq', c, v]); return q; },
    in(c, v) { op.filtros.push(['in', c, v]); return q; },
    gte(c, v) { op.filtros.push(['gte', c, v]); return q; },
    lte(c, v) { op.filtros.push(['lte', c, v]); return q; },
    order() { return q; },
    range(a, b) { op.range = [a, b]; return q; },
    then(ok, falha) { return Promise.resolve(resultado()).then(ok, falha); },
  };
  return q;
}

function stub(rel, exports) {
  const id = require.resolve(path.join('..', rel));
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
stub('lib/auth-middleware', {
  autenticar: async (req, roles) => {
    if (!roles.includes(estado.perfil.role)) throw { status: 403, error: 'Permissão insuficiente' };
    return { profile: estado.perfil };
  },
  verificarAcessoCliente: (p, c) => p.role === 'super_admin' || p.cliente_id === c,
  supabase: { from: tabela },
});

const handler = require('../api/admin/historico-cadastros');

const PERFIS = {
  admin: { id: 'u-admin', role: 'admin_cliente', cliente_id: C1 },
  operador: { id: 'u-oper', role: 'operador', cliente_id: C1 },
  super: { id: 'u-super', role: 'super_admin', cliente_id: null },
  portaria: { id: 'u-port', role: 'portaria', cliente_id: C1 },
  soEmail: { id: 'u-mail', role: 'so_email', cliente_id: C1 },
};

async function chamar(perfil, query = {}, method = 'GET') {
  estado.perfil = PERFIS[perfil];
  estado.ops = [];
  const r = { code: null, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  await handler({ method, headers: {}, query }, r);
  return r;
}

let passou = 0;
async function caso(nome, fn) { await fn(); passou++; console.log(`ok - ${nome}`); }
const originalError = console.error;
console.error = () => {};

(async () => {
  await caso('síndico vê só as alterações de veículos do próprio condomínio', async () => {
    const r = await chamar('admin');
    assert.strictEqual(r.code, 200);
    assert.deepStrictEqual(r.body.itens.map((i) => i.id), ['a1', 'a2']);
    const audit = estado.ops.find((o) => o.tabela === 'audit_log');
    assert.ok(audit.filtros.some(([t, c, v]) => t === 'eq' && c === 'tabela' && v === 'veiculos'));
    assert.ok(audit.filtros.some(([t, c, v]) => t === 'eq' && c === 'detalhes->>cliente_id' && v === C1));
  });
  await caso('nunca devolve ip, usuario_id nem dados extras do autor', async () => {
    const r = await chamar('operador');
    const texto = JSON.stringify(r.body);
    assert.ok(!/10\.0\.0\./.test(texto), 'ip vazou');
    assert.ok(!/u-oper|u-admin/.test(texto), 'usuario_id vazou');
    assert.ok(!/example\.com/.test(texto), 'e-mail vazou');
    r.body.itens.forEach((i) => assert.ok(!('ip' in i) && !('usuario_id' in i)));
    const usu = estado.ops.find((o) => o.tabela === 'usuarios');
    assert.strictEqual(usu.colunas, 'id, nome, role');
  });
  await caso('item traz autor, papel, placa, antes e depois', async () => {
    const r = await chamar('admin');
    const [a1, a2] = r.body.itens;
    assert.deepStrictEqual(
      { nome: a1.autor_nome, papel: a1.autor_papel, placa: a1.placa, antes: a1.antes, depois: a1.depois },
      { nome: 'Operador Teste', papel: 'Operador', placa: 'TST0A00', antes: { tipo_pessoa: 'morador' }, depois: { tipo_pessoa: 'prestador' } });
    assert.strictEqual(a2.autor_papel, 'Síndico');
    assert.deepStrictEqual(a2.agora, { tipo_pessoa: 'morador', nome_morador: 'Pessoa Teste' });
  });
  await caso('ações internas (reabrir_falhou) e outras tabelas ficam fora', async () => {
    const r = await chamar('super', { cliente_id: C1 });
    assert.ok(!r.body.itens.some((i) => i.id === 'a4' || i.id === 'a5'));
  });
  await caso('cliente_id de outro condomínio → 403 sem ler o log', async () => {
    const r = await chamar('admin', { cliente_id: C2 });
    assert.strictEqual(r.code, 403);
    assert.ok(!estado.ops.some((o) => o.tabela === 'audit_log'));
  });
  await caso('operador de outro condomínio → 403', async () => {
    estado.perfil = null;
    const r = await chamar('operador', { cliente_id: C2 });
    assert.strictEqual(r.code, 403);
  });
  await caso('equipe Protector (super_admin) lê o condomínio escolhido', async () => {
    const r = await chamar('super', { cliente_id: C2 });
    assert.strictEqual(r.code, 200);
    assert.deepStrictEqual(r.body.itens.map((i) => i.id), ['a3']);
  });
  await caso('equipe Protector sem cliente_id → 400', async () => {
    const r = await chamar('super');
    assert.strictEqual(r.code, 400);
  });
  for (const perfil of ['portaria', 'soEmail']) {
    await caso(`perfil ${perfil} → 403`, async () => {
      const r = await chamar(perfil);
      assert.strictEqual(r.code, 403);
      assert.strictEqual(estado.ops.length, 0);
    });
  }
  await caso('método diferente de GET → 405', async () => {
    const r = await chamar('admin', {}, 'POST');
    assert.strictEqual(r.code, 405);
  });
  await caso('filtro de placa procura as duas grafias (Mercosul e antiga)', async () => {
    const r = await chamar('admin', { placa: 'tst-0000' });
    const f = estado.ops[0].filtros.find(([t, c]) => t === 'in' && c === 'detalhes->>placa');
    assert.deepStrictEqual(f[2], ['TST0A00', 'TST0000']);
    assert.deepStrictEqual(r.body.itens.map((i) => i.id), ['a1', 'a2']);
  });
  await caso('período em São Paulo (de 00:00 a 23:59 -03:00)', async () => {
    const r = await chamar('admin', { de: '2026-10-21', ate: '2026-10-23' });
    const f = estado.ops[0].filtros;
    assert.ok(f.some(([t, c, v]) => t === 'gte' && c === 'criado_em' && v === '2026-10-21T00:00:00-03:00'));
    assert.ok(f.some(([t, c, v]) => t === 'lte' && c === 'criado_em' && v === '2026-10-23T23:59:59.999-03:00'));
    assert.strictEqual(r.code, 200);
  });
  for (const query of [{ de: '2026-13-01' }, { ate: '23/10/2026' }, { de: '2026-10-23', ate: '2026-10-01' },
    { pagina: '0' }, { pagina: 'x' }, { placa: 'ABCDEFGH1' }, { cliente_id: 'nao-uuid' }, { placa: ['A', 'B'] }]) {
    await caso(`filtro inválido ${JSON.stringify(query)} → 400`, async () => {
      const r = await chamar(query.cliente_id ? 'super' : 'admin', query);
      assert.strictEqual(r.code, 400);
    });
  }
  await caso('50 por página, com tem_mais e segunda página', async () => {
    estado.muitos = 120;
    try {
      const p1 = await chamar('admin');
      assert.strictEqual(p1.body.itens.length, 50);
      assert.strictEqual(p1.body.tem_mais, true);
      assert.deepStrictEqual(estado.ops[0].range, [0, 50]);
      const p3 = await chamar('admin', { pagina: '3' });
      assert.strictEqual(p3.body.itens.length, 20);
      assert.strictEqual(p3.body.tem_mais, false);
      assert.strictEqual(p3.body.pagina, 3);
    } finally { estado.muitos = 0; }
  });
  await caso('erro do banco → 500 genérico (sem detalhe interno)', async () => {
    estado.erro = 'audit_log';
    try {
      const r = await chamar('admin');
      assert.strictEqual(r.code, 500);
      assert.strictEqual(r.body.error, 'Erro interno do servidor');
    } finally { estado.erro = null; }
  });
  await caso('erro ao ler autores → 500', async () => {
    estado.erro = 'usuarios';
    try {
      const r = await chamar('admin');
      assert.strictEqual(r.code, 500);
    } finally { estado.erro = null; }
  });

  console.error = originalError;
  console.log(`${passou} testes passaram`);
})().catch((e) => { console.error = originalError; console.error(e); process.exit(1); });
