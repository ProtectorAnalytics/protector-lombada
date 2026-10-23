/**
 * lib/email-sender: destinatários nunca se veem (vão em Cco, com o próprio
 * remetente no Para) e ninguém é cortado em silêncio — listas grandes saem em
 * lotes. Offline: nodemailer stubado, dados fictícios.
 * Uso: node test/email-sender.test.js
 */
const assert = require('node:assert');

const enviados = [];
const idNodemailer = require.resolve('nodemailer');
require.cache[idNodemailer] = {
  id: idNodemailer, filename: idNodemailer, loaded: true,
  exports: { createTransport: () => ({ sendMail: async (m) => { enviados.push(m); return { messageId: `m${enviados.length}` }; } }) },
};
process.env.SMTP_USER = 'remetente@exemplo.test';
delete process.env.SMTP_HOST;

const { enviarAlerta, enviarEmailSimples, LOTE_CCO } = require('../lib/email-sender');

const alerta = (destinatarios) => enviarAlerta({
  destinatarios, placa: 'ABC1D23', velocidade: 50, timestamp: '2026-10-23T12:00:00Z',
  nomeCondominio: 'Condomínio Teste', localVia: 'Rua Teste', limite: 30, pdfBuffer: Buffer.from('pdf'), cameraNome: 'Radar 1',
});
const emails = (n) => Array.from({ length: n }, (_, i) => `pessoa${i}@exemplo.test`);
const ccoDe = (m) => String(m.bcc || '').split(',').map((e) => e.trim()).filter(Boolean);

let passou = 0;
async function caso(nome, fn) { enviados.length = 0; await fn(); passou++; console.log(`ok - ${nome}`); }

(async () => {
  await caso('alerta: destinatários só em Cco; o Para é o remetente', async () => {
    await alerta(['a@exemplo.test', 'b@exemplo.test']);
    assert.strictEqual(enviados.length, 1);
    assert.strictEqual(enviados[0].to, 'remetente@exemplo.test');
    assert.deepStrictEqual(ccoDe(enviados[0]), ['a@exemplo.test', 'b@exemplo.test']);
    assert.ok(!enviados[0].cc);
    assert.strictEqual(enviados[0].attachments.length, 1);
  });

  await caso('alerta: mais destinatários que o lote → vários envios, ninguém cortado', async () => {
    const lista = emails(LOTE_CCO * 2 + 5);
    await alerta(lista);
    assert.strictEqual(enviados.length, 3);
    assert.deepStrictEqual(enviados.flatMap(ccoDe), lista);
    enviados.forEach((m) => assert.ok(ccoDe(m).length <= LOTE_CCO));
  });

  await caso('alerta: e-mail repetido sai uma vez; inválido fica de fora', async () => {
    await alerta(['a@exemplo.test', 'A@Exemplo.test ', 'sem-arroba', 'x\r\nBcc: y@exemplo.test']);
    assert.deepStrictEqual(ccoDe(enviados[0]), ['a@exemplo.test']);
  });

  await caso('alerta sem destinatário válido não envia nada', async () => {
    await alerta(['sem-arroba']);
    assert.strictEqual(enviados.length, 0);
  });

  await caso('e-mail simples: também em Cco, em lotes, sem corte silencioso', async () => {
    const lista = emails(LOTE_CCO + 1);
    await enviarEmailSimples({ destinatarios: lista, assunto: 'Teste', texto: 'Corpo' });
    assert.strictEqual(enviados.length, 2);
    enviados.forEach((m) => assert.strictEqual(m.to, 'remetente@exemplo.test'));
    assert.deepStrictEqual(enviados.flatMap(ccoDe), lista);
  });

  await caso('e-mail simples sem destinatário válido lança', async () => {
    await assert.rejects(() => enviarEmailSimples({ destinatarios: ['x'], assunto: 'a', texto: 'b' }), /Nenhum destinatário/);
  });

  console.log(`\n${passou} casos ok`);
})().catch((e) => { console.log(e); process.exit(1); });
