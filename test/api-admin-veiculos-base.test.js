/**
 * Handler do painel da base de veículos com módulos stubados (offline).
 * Uso: node test/api-admin-veiculos-base.test.js
 */
const assert = require('node:assert');
const path = require('node:path');

const estado = { profile: null, tabelas: {}, updates: [], vbLinha: null, consultas: [], resultadoConsulta: null, repoEscritas: [] };

function stub(rel, exports) {
  const id = require.resolve(path.join('..', rel));
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

// Mini PostgREST em memória: eq / in / gte / select / update / maybeSingle.
function tabela(nome) {
  const filtros = [];
  let modo = 'select';
  let patch = null;
  let head = false;
  const linhas = () => (estado.tabelas[nome] || []).filter((r) => filtros.every((f) => f(r)));
  const q = {
    select(_c, opts) { head = !!(opts && opts.head); return q; },
    update(p) { modo = 'update'; patch = p; return q; },
    eq(c, v) { filtros.push((r) => r[c] === v); return q; },
    in(c, vs) { filtros.push((r) => vs.includes(r[c])); return q; },
    gte(c, v) { filtros.push((r) => r[c] >= v); return q; },
    maybeSingle() { const l = linhas(); return Promise.resolve({ data: l[0] || null, error: null }); },
    then(ok, ko) {
      let res;
      if (modo === 'update') { estado.updates.push({ tabela: nome, patch, ids: linhas().map((r) => r.id) }); res = { error: null }; }
      else res = head ? { count: linhas().length, error: null } : { data: linhas(), error: null };
      return Promise.resolve(res).then(ok, ko);
    },
  };
  return q;
}

stub('lib/auth-middleware', {
  autenticar: async () => ({ profile: estado.profile }),
  verificarAcessoCliente: (p, c) => p.role === 'super_admin' || p.cliente_id === c,
  registrarAuditoria: async () => {},
  supabase: { from: tabela },
});
stub('lib/veiculos-base-repo', {
  criarRepoSupabase: () => ({
    buscar: async () => estado.vbLinha,
    atualizar: async (p, c) => { estado.repoEscritas.push({ p, c }); },
    contarPassagens: async () => 0,
  }),
});
stub('lib/apiplacas', { criarClienteApiplacas: () => ({}) });
stub('lib/validador-placa', { criarValidador: () => ({}) });
stub('lib/veiculos-base', {
  criarVeiculosBase: () => ({
    consultarAgora: async (placa, origem) => { estado.consultas.push({ placa, origem }); return estado.resultadoConsulta; },
  }),
});

const handler = require('../api/admin/veiculos-base');

function resp() {
  const r = { code: null, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
const req = (extra) => ({ method: 'GET', headers: {}, query: {}, ...extra });
const recente = () => new Date(Date.now() - 86400000).toISOString();

let passou = 0;
async function caso(nome, fn) {
  estado.profile = { id: 'u1', role: 'operador', cliente_id: 'c1' };
  estado.tabelas = {}; estado.updates = []; estado.vbLinha = null; estado.consultas = []; estado.repoEscritas = [];
  estado.resultadoConsulta = { executou: true, linha: { placa: 'ABC1D23', status: 'consultado' } };
  await fn(); passou++; console.log(`ok - ${nome}`);
}

(async () => {
  await caso('GET de placa vista só em outro cliente devolve {}', async () => {
    estado.tabelas.capturas = [{ id: 1, cliente_id: 'c2', placa: 'ABC1D23', timestamp: recente() }];
    estado.tabelas.veiculos_base = [{ placa: 'ABC1D23', status: 'consultado', marca: 'X', modelo: 'Y', cor: 'Preto' }];
    const r = resp();
    await handler(req({ query: { placa: 'ABC1D23' } }), r);
    assert.strictEqual(r.code, 200);
    assert.deepStrictEqual(r.body, {});
  });

  await caso('GET de placa consultada e vista no próprio cliente devolve marca e cor', async () => {
    estado.tabelas.capturas = [{ id: 1, cliente_id: 'c1', placa: 'ABC1D23', timestamp: recente() }];
    estado.tabelas.veiculos_base = [{ placa: 'ABC1D23', status: 'consultado', marca: 'Marca', modelo: 'Modelo', cor: 'Preto' }];
    const r = resp();
    await handler(req({ query: { placa: 'ABC1D23' } }), r);
    assert.deepStrictEqual(r.body, { marca: 'Marca Modelo', cor: 'Preto' });
  });

  await caso('GET sem acesso ao cliente pedido devolve 403', async () => {
    const r = resp();
    await handler(req({ query: { placa: 'ABC1D23', cliente_id: 'c2' } }), r);
    assert.strictEqual(r.code, 403);
  });

  await caso('mesma_placa em captura de outro cliente devolve 404 e não grava', async () => {
    estado.tabelas.capturas = [{ id: 9, cliente_id: 'c2', placa: 'ABC1D2Z' }];
    const r = resp();
    await handler(req({ method: 'POST', body: { acao: 'mesma_placa', captura_id: 9 } }), r);
    assert.strictEqual(r.code, 404);
    assert.strictEqual(estado.updates.length, 0);
  });

  await caso('mesma_placa usa a grafia que o cliente tem (R13); empate fica com suspeita_de', async () => {
    const { paraAntiga } = require('../site/js/placa');
    const susp = 'ABC1D23';
    const antiga = paraAntiga(susp);
    estado.tabelas.capturas = [
      { id: 1, cliente_id: 'c1', placa: 'ZZZ9Z99', timestamp: recente() },
      { id: 2, cliente_id: 'c1', placa: antiga, timestamp: recente() },
      { id: 3, cliente_id: 'c1', placa: antiga, timestamp: recente() },
      { id: 4, cliente_id: 'c1', placa: susp, timestamp: recente() },
    ];
    estado.tabelas.veiculos_base = [{ placa: 'ZZZ9Z99', status: 'suspeita', suspeita_de: susp }];
    let r = resp();
    await handler(req({ method: 'POST', body: { acao: 'mesma_placa', captura_id: 1 } }), r);
    assert.strictEqual(r.body.placa, antiga);
    estado.tabelas.capturas.push({ id: 10, cliente_id: 'c1', placa: susp, timestamp: recente() });
    estado.updates = [];
    r = resp();
    await handler(req({ method: 'POST', body: { acao: 'mesma_placa', captura_id: 1 } }), r);
    assert.strictEqual(r.body.placa, susp);
  });

  await caso('outro_carro em placa não vista no cliente devolve 404 sem chamar a API', async () => {
    estado.tabelas.capturas = [{ id: 1, cliente_id: 'c2', placa: 'ABC1D23', timestamp: recente() }];
    estado.vbLinha = { status: 'suspeita' };
    const r = resp();
    await handler(req({ method: 'POST', body: { acao: 'outro_carro', placa: 'ABC1D23' } }), r);
    assert.strictEqual(r.code, 404);
    assert.strictEqual(estado.consultas.length, 0);
    assert.strictEqual(estado.repoEscritas.length, 0);
  });

  await caso('outro_carro libera a linha e consulta uma única vez', async () => {
    estado.tabelas.capturas = [{ id: 1, cliente_id: 'c1', placa: 'ABC1D23', timestamp: recente() }];
    estado.vbLinha = { status: 'suspeita', suspeita_de: 'ABC1D2Z' };
    const r = resp();
    await handler(req({ method: 'POST', body: { acao: 'outro_carro', placa: 'ABC1D23' } }), r);
    assert.strictEqual(r.code, 200);
    assert.deepStrictEqual(r.body, { placa: 'ABC1D23', status: 'consultado' });
    assert.strictEqual(estado.consultas.length, 1);
    assert.strictEqual(estado.consultas[0].origem, 'reconsulta');
    assert.deepStrictEqual(estado.repoEscritas[0].c, { status: 'pendente', suspeita_de: null, tentativas: 0, proxima_tentativa_em: null });
  });

  await caso('outro_carro não executado devolve placa, status pendente e motivo', async () => {
    estado.tabelas.capturas = [{ id: 1, cliente_id: 'c1', placa: 'ABC1D23', timestamp: recente() }];
    estado.vbLinha = { status: 'suspeita' };
    estado.resultadoConsulta = { executou: false, motivo: 'teto' };
    const r = resp();
    await handler(req({ method: 'POST', body: { acao: 'outro_carro', placa: 'ABC1D23' } }), r);
    assert.deepStrictEqual(r.body, { placa: 'ABC1D23', status: 'pendente', motivo: 'teto' });
  });

  await caso('JSON malformado devolve 400', async () => {
    async function* corpo() { yield '{ruim'; }
    const r = resp();
    await handler({ method: 'POST', headers: {}, query: {}, [Symbol.asyncIterator]: corpo }, r);
    assert.strictEqual(r.code, 400);
  });

  await caso('falha interna devolve 500 sem vazar mensagem', async () => {
    estado.profile = null; // profile.cliente_id lança TypeError
    const r = resp();
    await handler(req({ query: { placa: 'ABC1D23' } }), r);
    assert.strictEqual(r.code, 500);
    assert.deepStrictEqual(r.body, { error: 'Erro interno' });
  });

  console.log(`\n${passou} casos passaram`);
})().catch((e) => { console.error(e); process.exit(1); });
