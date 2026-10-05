/**
 * Cron da APIPLACAS com módulos stubados (offline): nenhuma consulta real,
 * nenhum e-mail.
 * Uso: node test/cron-apiplacas.test.js
 */
const assert = require('node:assert');
const path = require('node:path');

const estado = { saldo: 900, configs: [], apagarAntes: null, anonimizarAntes: null };

function stub(rel, exports) {
  const id = require.resolve(path.join('..', rel));
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

stub('lib/supabase', { supabase: { from: () => ({ insert: async () => ({ error: null }) }) } });
stub('lib/apiplacas', { criarClienteApiplacas: () => ({ saldo: async () => estado.saldo }) });
stub('lib/validador-placa', { criarValidador: () => ({}) });
stub('lib/veiculos-base', { criarVeiculosBase: () => ({ processarFila: async () => ({ consultadas: 0, parou: null }) }) });
stub('lib/apiplacas-avisos', { enviarAvisos: async () => ({ enviados: [], falhas: [] }) });
stub('lib/email-sender', { enviarEmailSimples: async () => { throw new Error('e-mail não pode sair no teste'); } });
stub('lib/veiculos-base-repo', {
  criarRepoSupabase: () => ({
    atualizarConfig: async (c) => { estado.configs.push(c); },
    lerConfig: async () => ({ ativo: true, emails_aviso: [], saldo_atual: estado.saldo }),
    gastoDoMes: async () => 0,
    tamanhoFila: async () => 0,
    ultimoResultado: async () => null,
    apagarVistosAntesDe: async (iso) => { estado.apagarAntes = iso; return 2; },
    anonimizarExtratoAntesDe: async (iso) => { estado.anonimizarAntes = iso; return 5; },
  }),
});

const SEGREDO = 'segredo-de-teste-do-cron-123';
process.env.CRON_SECRET = SEGREDO;
process.env.APIPLACAS_TOKEN = 'tok-falso';
const handler = require('../api/cron-apiplacas');

function resp() {
  const r = { code: null, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
const req = (authorization) => ({ method: 'GET', headers: authorization === undefined ? {} : { authorization } });

let passou = 0;
let falhou = 0;
async function caso(nome, fn) {
  estado.saldo = 900; estado.configs = []; estado.apagarAntes = null; estado.anonimizarAntes = null;
  try { await fn(); passou++; console.log(`ok - ${nome}`); }
  catch (e) { falhou++; console.log(`FALHOU - ${nome}\n  ${e.message.split('\n').join('\n  ')}`); }
}

(async () => {
  await caso('anonimiza o extrato com a mesma data de corte da retenção da base (F7)', async () => {
    const r = resp();
    await handler(req(`Bearer ${SEGREDO}`), r);
    assert.strictEqual(r.code, 200);
    assert.ok(estado.apagarAntes, 'retenção da base rodou');
    assert.strictEqual(estado.anonimizarAntes, estado.apagarAntes);
    assert.strictEqual(r.body.anonimizados, 5);
  });

  console.log(`\n${passou} casos passaram${falhou ? `, ${falhou} falharam` : ''}`);
  if (falhou) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
