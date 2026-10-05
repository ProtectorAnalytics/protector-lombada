/**
 * Handler admin da APIPLACAS com módulos stubados (offline).
 * Uso: node test/api-admin-apiplacas.test.js
 */
const assert = require('node:assert');
const path = require('node:path');

const estado = { autenticar: null, motivos: [], consultas: [], capturas: [] };

function stub(rel, exports) {
  const id = require.resolve(path.join('..', rel));
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

const tabela = (rows) => ({
  select() { return this; },
  gte() { return this; },
  limit() { return Promise.resolve({ data: rows, error: null }); },
});

stub('lib/auth-middleware', {
  autenticar: (...a) => estado.autenticar(...a),
  registrarAuditoria: async () => {},
  supabase: { from: () => tabela(estado.capturas) },
});
stub('lib/veiculos-base-repo', {
  criarRepoSupabase: () => ({
    buscar: async () => null,
    reservar: async () => true,
    atualizar: async () => {},
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
  estado.motivos = []; estado.consultas = []; estado.capturas = [];
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
    assert.deepStrictEqual(r.body, { placas: 4, consultadas: 1, puladas: 1, parou: 'teto' });
    assert.strictEqual(estado.consultas.length, 3);
    assert.ok(!JSON.stringify(r.body).includes('ABC1D'));
  });

  console.log(`\n${passou} casos passaram`);
})().catch((e) => { console.error(e); process.exit(1); });
