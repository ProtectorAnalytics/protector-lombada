/**
 * Handler admin da APIPLACAS com módulos stubados (offline).
 * Uso: node test/api-admin-apiplacas.test.js
 */
const assert = require('node:assert');
const path = require('node:path');

const estado = { autenticar: null, motivos: [], consultas: [], capturas: [], existente: null, buscarLanca: false, escritas: [], contagemErro: null, filtrosMes: [] };

function stub(rel, exports) {
  const id = require.resolve(path.join('..', rel));
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

const tabela = (rows) => ({
  select() { return this; },
  gte() { return this; },
  order() { return this; },
  range(de, ate) { return Promise.resolve({ data: rows.slice(de, ate + 1), error: null }); },
});
const contagem = () => {
  const q = { select() { return q; }, eq() { return q; }, gte(_, v) { estado.filtrosMes.push(v); return q; },
    then(ok) { return Promise.resolve({ count: 0, error: estado.contagemErro }).then(ok); } };
  return q;
};

stub('lib/auth-middleware', {
  autenticar: (...a) => estado.autenticar(...a),
  registrarAuditoria: async () => {},
  supabase: { from: (t) => (t === 'capturas' ? tabela(estado.capturas) : contagem()) },
});
stub('lib/veiculos-base-repo', {
  criarRepoSupabase: () => ({
    buscar: async () => { if (estado.buscarLanca) throw new Error('db'); return estado.existente; },
    reservar: async () => true,
    atualizar: async (p, c) => { estado.escritas.push(c); },
    gastoDoMes: async () => 0,
    tamanhoFila: async () => 0,
    atualizarConfig: async () => {},
    lerConfig: async () => ({}),
  }),
});
stub('lib/apiplacas', { criarClienteApiplacas: () => ({}) });
stub('lib/validador-placa', { criarValidador: () => ({}) });
stub('lib/veiculos-base', {
  criarVeiculosBase: () => ({
    consultarAgora: async (placa) => {
      estado.consultas.push(placa);
      const m = estado.motivos.shift();
      return m === 'ok' ? { executou: true, linha: {} } : { executou: false, motivo: m };
    },
  }),
});

const handler = require('../api/admin/apiplacas');
const { inicioDoMesSP } = handler;

function resp() {
  const r = { code: null, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
const req = (extra) => ({ method: 'POST', headers: {}, query: {}, ...extra });

let passou = 0;
async function caso(nome, fn) {
  estado.autenticar = async () => ({ profile: { id: 'u1' } });
  estado.motivos = []; estado.consultas = []; estado.capturas = []; estado.existente = null; estado.buscarLanca = false; estado.escritas = []; estado.contagemErro = null; estado.filtrosMes = [];
  handler.relogio.agora = () => 0;
  await fn(); passou++; console.log(`ok - ${nome}`);
}

(async () => {
  await caso('propaga 403 quando não é super_admin', async () => {
    estado.autenticar = async () => { throw { status: 403, error: 'Acesso negado' }; };
    const r = resp();
    await handler(req({ method: 'GET' }), r);
    assert.strictEqual(r.code, 403);
    assert.deepStrictEqual(r.body, { error: 'Acesso negado' });
  });

  await caso('PUT com campos inválidos devolve 400 com campos', async () => {
    const r = resp();
    await handler(req({ method: 'PUT', body: { teto_mensal: -1, aviso_percentual: 0 } }), r);
    assert.strictEqual(r.code, 400);
    assert.deepStrictEqual(r.body.campos.sort(), ['aviso_percentual', 'teto_mensal']);
  });

  await caso('validar_hoje pula em_andamento, para no teto e devolve só contagens', async () => {
    estado.capturas = ['ABC1D23', 'ABC1D24', 'ABC1D25', 'ABC1D26'].map((placa) => ({ placa }));
    estado.motivos = ['ok', 'em_andamento', 'teto', 'ok'];
    const r = resp();
    await handler(req({ body: { acao: 'validar_hoje' } }), r);
    assert.strictEqual(r.code, 200);
    assert.deepStrictEqual(r.body, { placas: 4, consultadas: 1, puladas: 1, falhas: 0, parou: 'teto' });
    assert.strictEqual(estado.consultas.length, 3);
    assert.ok(!JSON.stringify(r.body).includes('ABC1D'));
  });

  await caso('validar_hoje pagina capturas (2350 linhas em 3 páginas)', async () => {
    estado.capturas = Array.from({ length: 2350 }, (_, i) => ({ placa: `AAA${String(i).padStart(4, '0')}` }));
    estado.motivos = Array(2350).fill('ok');
    const r = resp();
    await handler(req({ body: { acao: 'validar_hoje' } }), r);
    assert.strictEqual(r.body.placas, 2350);
  });

  await caso('inicioDoMesSP respeita o fuso de São Paulo', () => {
    assert.strictEqual(inicioDoMesSP(new Date('2026-11-01T02:59:59Z')), '2026-10-01T03:00:00.000Z');
    assert.strictEqual(inicioDoMesSP(new Date('2026-11-01T03:00:00Z')), '2026-11-01T03:00:00.000Z');
  });

  await caso('resumo lança 500 quando a contagem falha', async () => {
    estado.contagemErro = { message: 'segredo do banco' };
    const r = resp();
    await handler(req({ method: 'GET' }), r);
    assert.strictEqual(r.code, 500);
    assert.deepStrictEqual(r.body, { error: 'Erro interno' });
  });

  await caso('resumo usa início do mês em SP no filtro', async () => {
    const r = resp();
    await handler(req({ method: 'GET' }), r);
    assert.strictEqual(r.code, 200);
    assert.ok(estado.filtrosMes[0].endsWith('T03:00:00.000Z') && estado.filtrosMes[0].endsWith('-01T03:00:00.000Z'));
  });

  await caso('validar_hoje aborta após 3 exceções seguidas', async () => {
    estado.capturas = Array.from({ length: 10 }, (_, i) => ({ placa: `AAA000${i}` }));
    estado.buscarLanca = true;
    const r = resp();
    await handler(req({ body: { acao: 'validar_hoje' } }), r);
    assert.deepStrictEqual(r.body, { placas: 10, consultadas: 0, puladas: 0, falhas: 3, parou: 'falhas' });
  });

  await caso('validar_hoje para por tempo após 8 s', async () => {
    estado.capturas = Array.from({ length: 10 }, (_, i) => ({ placa: `AAA000${i}` }));
    estado.motivos = Array(10).fill('ok');
    let t = 0;
    handler.relogio.agora = () => { const v = t; t += 3000; return v; };
    const r = resp();
    await handler(req({ body: { acao: 'validar_hoje' } }), r);
    assert.strictEqual(r.body.parou, 'tempo');
    assert.ok(r.body.consultadas >= 1 && r.body.consultadas < 10);
  });

  await caso('validar_hoje não toca proxima_tentativa_em de linha em posse', async () => {
    estado.capturas = [{ placa: 'ABC1D23' }];
    estado.existente = { status: 'pendente', proxima_tentativa_em: '2999-01-01T00:00:00Z' };
    estado.motivos = ['em_andamento'];
    const r = resp();
    await handler(req({ body: { acao: 'validar_hoje' } }), r);
    assert.strictEqual(estado.escritas.length, 0);
    assert.strictEqual(r.body.puladas, 1);
  });

  console.log(`\n${passou} casos passaram`);
})().catch((e) => { console.error(e); process.exit(1); });
