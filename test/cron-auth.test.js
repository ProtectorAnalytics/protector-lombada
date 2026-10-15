/**
 * Crons só rodam com `Authorization: Bearer ${CRON_SECRET}` (auditoria C1).
 * O header x-vercel-cron-signature, que qualquer um forja, não basta.
 * Uso: node test/cron-auth.test.js
 */
const assert = require('node:assert');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:1';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'chave-falsa';
const SEGREDO = 'segredo-de-teste-cron-auth';
process.env.CRON_SECRET = SEGREDO;

const { autorizado } = require('../lib/cron-auth');
const CRONS = ['cron-limpeza', 'cron-prazos-lgpd', 'cron-monitor-cameras', 'cron-relatorio-semanal', 'cron-apiplacas'];

let passou = 0;
async function caso(nome, fn) { await fn(); passou++; console.log(`ok - ${nome}`); }

function resp() {
  const r = { code: null, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}

(async () => {
  await caso('autorizado: só o Bearer exato do segredo', () => {
    assert.strictEqual(autorizado(`Bearer ${SEGREDO}`, SEGREDO), true);
    assert.strictEqual(autorizado(`Bearer ${SEGREDO}x`, SEGREDO), false);
    assert.strictEqual(autorizado('Bearer undefined', undefined), false);
    assert.strictEqual(autorizado(undefined, SEGREDO), false);
    assert.strictEqual(autorizado(`Bearer ${SEGREDO}`, ''), false);
  });

  for (const nome of CRONS) {
    const handler = require(`../api/${nome}`);
    await caso(`${nome}: x-vercel-cron-signature forjado = 401`, async () => {
      const r = resp();
      await handler({ method: 'GET', query: {}, headers: { 'x-vercel-cron-signature': 'qualquer' } }, r);
      assert.strictEqual(r.code, 401);
    });
    await caso(`${nome}: sem header ou Bearer errado = 401`, async () => {
      for (const headers of [{}, { authorization: 'Bearer errado' }, { authorization: 'Bearer undefined' }]) {
        const r = resp();
        await handler({ method: 'GET', query: {}, headers }, r);
        assert.strictEqual(r.code, 401, JSON.stringify(headers));
      }
    });
  }

  console.log(`\n${passou} casos passaram`);
})().catch((e) => { console.error(e); process.exit(1); });
