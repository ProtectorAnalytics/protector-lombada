/**
 * Eliminação atendida apaga a placa da base de veículos (offline, módulos stubados).
 * Uso: node test/api-admin-direitos-eliminacao.test.js
 */
const assert = require('node:assert');
const path = require('node:path');

const estado = { solicitacao: null, apagados: [], erroDelete: null, erroInterno: 'detalhe-interno-secreto' };

function stub(rel, exports) {
  const id = require.resolve(path.join('..', rel));
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

function tabela(nome) {
  let modo = 'select';
  let patch = null;
  const q = {
    select() { return q; },
    update(p) { modo = 'update'; patch = p; return q; },
    delete() { modo = 'delete'; return q; },
    eq(c, v) {
      if (modo === 'delete') {
        if (estado.erroDelete) return Promise.resolve({ error: { message: estado.erroInterno } });
        estado.apagados.push({ tabela: nome, coluna: c, valor: v });
        return Promise.resolve({ error: null });
      }
      return q;
    },
    single() {
      const base = estado.solicitacao;
      return Promise.resolve({ data: modo === 'update' ? { ...base, ...patch } : base, error: null });
    },
  };
  return q;
}

stub('lib/auth-middleware', {
  autenticar: async () => ({ profile: { id: 'u1', role: 'super_admin', nome: 'DPO' } }),
  registrarAuditoria: async () => {},
  supabase: { from: tabela },
});

const handler = require('../api/admin/direitos');

function resp() {
  const r = { code: null, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
const put = (body) => ({ method: 'PUT', headers: {}, query: {}, body });

let passou = 0;
async function caso(nome, solicitacao, body, fn, falhaDelete = false) {
  estado.solicitacao = solicitacao;
  estado.apagados = []; estado.erroDelete = falhaDelete;
  const r = resp();
  await handler(put(body), r);
  fn(r);
  passou++; console.log(`ok - ${nome}`);
}
const sol = (extra) => ({ id: 's1', protocolo: 'P1', tipo: 'eliminacao', status: 'em_analise', placa_veiculo: 'ABC1234', ...extra });
const originalError = console.error;
console.error = () => {};

(async () => {
  await caso('eliminação atendida com placa antiga apaga a placa Mercosul da base', sol(), { id: 's1', status: 'atendida' }, (r) => {
    assert.strictEqual(r.code, 200);
    assert.deepStrictEqual(estado.apagados, [{ tabela: 'veiculos_base', coluna: 'placa', valor: 'ABC1C34' }]);
  });
  await caso('status diferente de atendida não apaga', sol(), { id: 's1', status: 'em_analise' }, (r) => {
    assert.strictEqual(r.code, 200);
    assert.strictEqual(estado.apagados.length, 0);
  });
  await caso('tipo diferente de eliminação não apaga', sol({ tipo: 'acesso' }), { id: 's1', status: 'atendida' }, (r) => {
    assert.strictEqual(r.code, 200);
    assert.strictEqual(estado.apagados.length, 0);
  });
  await caso('placa inválida não apaga e responde 200', sol({ placa_veiculo: 'XX' }), { id: 's1', status: 'atendida' }, (r) => {
    assert.strictEqual(r.code, 200);
    assert.strictEqual(estado.apagados.length, 0);
  });
  await caso('sem placa não apaga', sol({ placa_veiculo: null }), { id: 's1', status: 'atendida' }, (r) => {
    assert.strictEqual(r.code, 200);
    assert.strictEqual(estado.apagados.length, 0);
  });
  await caso('erro no delete vira 500 sem mensagem interna', sol(), { id: 's1', status: 'atendida' }, (r) => {
    assert.strictEqual(r.code, 500);
    assert.ok(!JSON.stringify(r.body).includes(estado.erroInterno));
  }, true);
  console.error = originalError;
  console.log(`${passou} testes passaram`);
})().catch((e) => { console.error = originalError; console.error(e); process.exit(1); });
