/**
 * Cron do monitor de câmeras com Supabase e e-mail stubados (auditoria C2).
 * Uso: node test/cron-monitor-cameras.test.js
 */
const assert = require('node:assert');
const path = require('node:path');

const estado = { cams: [], emails: [], updates: [], falharEmail: false, aviso: ['ops@exemplo.com'] };

function stub(rel, exports) {
  const id = require.resolve(path.join('..', rel));
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

stub('lib/supabase', {
  supabase: {
    from: (tabela) => ({
      select: () => ({
        eq: async () => ({ data: estado.cams, error: null }),
        limit: () => ({ maybeSingle: async () => ({ data: { emails_aviso: estado.aviso }, error: null }) }),
      }),
      update: (valores) => ({
        in: async (_col, ids) => { estado.updates.push({ tabela, valores, ids }); return { error: null }; },
      }),
    }),
  },
});
stub('lib/email-sender', {
  enviarEmailSimples: async (msg) => {
    if (estado.falharEmail) throw new Error('SMTP fora');
    estado.emails.push(msg);
  },
});

process.env.CRON_SECRET = 'segredo-monitor';
const handler = require('../api/cron-monitor-cameras');

let passou = 0;
async function caso(nome, fn) {
  Object.assign(estado, { emails: [], updates: [], falharEmail: false, aviso: ['ops@exemplo.com'] });
  await fn(); passou++; console.log(`ok - ${nome}`);
}
function resp() {
  const r = { code: null, body: null };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
const chamar = async () => {
  const r = resp();
  await handler({ method: 'GET', headers: { authorization: 'Bearer segredo-monitor' } }, r);
  return r;
};
const atras = (min) => new Date(Date.now() - min * 60000).toISOString();

(async () => {
  await caso('câmera offline gera um e-mail e marca o alerta depois do envio', async () => {
    estado.cams = [{ id: 1, nome_exibicao: 'PORTARIA', last_seen: atras(90), last_offline_alert_at: null, cliente: { nome: 'C' } }];
    const r = await chamar();
    assert.strictEqual(r.code, 200);
    assert.strictEqual(estado.emails.length, 1);
    assert.deepStrictEqual(estado.emails[0].destinatarios, ['ops@exemplo.com']);
    assert.strictEqual(estado.updates.length, 1);
    assert.deepStrictEqual(estado.updates[0].ids, [1]);
    assert.ok(estado.updates[0].valores.last_offline_alert_at);
  });

  await caso('falha no e-mail não marca nada (tenta de novo no próximo ciclo)', async () => {
    estado.falharEmail = true;
    const r = await chamar();
    assert.strictEqual(r.code, 500);
    assert.strictEqual(estado.updates.length, 0);
  });

  await caso('sem destinatário configurado = 500 e nada marcado', async () => {
    estado.aviso = [];
    const r = await chamar();
    assert.strictEqual(r.code, 500);
    assert.strictEqual(estado.updates.length, 0);
  });

  await caso('câmera que voltou limpa a marca depois do e-mail', async () => {
    estado.cams = [{ id: 2, nome_exibicao: 'CLUBE', last_seen: atras(1), last_offline_alert_at: atras(60), cliente: { nome: 'C' } }];
    await chamar();
    assert.strictEqual(estado.emails.length, 1);
    assert.deepStrictEqual(estado.updates, [{ tabela: 'cameras', valores: { last_offline_alert_at: null }, ids: [2] }]);
  });

  await caso('tudo online = sem e-mail', async () => {
    estado.cams = [{ id: 3, nome_exibicao: 'OK', last_seen: atras(2), last_offline_alert_at: null }];
    const r = await chamar();
    assert.strictEqual(r.code, 200);
    assert.strictEqual(estado.emails.length, 0);
  });

  console.log(`\n${passou} casos passaram`);
})().catch((e) => { console.error(e); process.exit(1); });
