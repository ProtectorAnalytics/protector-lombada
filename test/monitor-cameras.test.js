/**
 * Monitor de câmeras offline (auditoria C2): regras e texto do e-mail.
 * Uso: node test/monitor-cameras.test.js
 */
const assert = require('node:assert');
const { classificarCameras, montarEmail } = require('../lib/monitor-cameras');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

const AGORA = Date.parse('2026-10-15T15:00:00Z');
const min = (m) => new Date(AGORA - m * 60000).toISOString();
const cam = (nome, lastSeen, alerta = null) => ({
  id: nome, nome_exibicao: nome, last_seen: lastSeen, last_offline_alert_at: alerta, cliente: { nome: 'Cond X' },
});

caso('câmera com sinal recente e sem alerta não entra em nada', () => {
  assert.deepStrictEqual(classificarCameras([cam('A', min(5))], AGORA), { offline: [], voltaram: [] });
});

caso('sem sinal há mais de 30 min e nunca alertada entra como offline', () => {
  const r = classificarCameras([cam('A', min(31)), cam('B', null)], AGORA);
  assert.deepStrictEqual(r.offline.map((c) => c.id), ['A', 'B']);
  assert.strictEqual(r.offline[1].semSinal, 'nunca enviou');
});

caso('offline já alertada há menos de 6 h não repete; há mais de 6 h repete', () => {
  const r = classificarCameras([cam('A', min(600), min(300)), cam('B', min(600), min(361))], AGORA);
  assert.deepStrictEqual(r.offline.map((c) => c.id), ['B']);
});

caso('alertada que voltou a enviar entra como voltou', () => {
  const r = classificarCameras([cam('A', min(2), min(100))], AGORA);
  assert.deepStrictEqual(r.voltaram.map((c) => c.id), ['A']);
});

caso('nada a avisar = sem e-mail', () => {
  assert.strictEqual(montarEmail({ offline: [], voltaram: [] }), null);
});

caso('e-mail traz nome, cliente e hora de Brasília', () => {
  const r = classificarCameras([cam('PORTARIA', '2026-10-15T13:00:00Z'), cam('CLUBE', min(1), min(90))], AGORA);
  const email = montarEmail(r);
  assert.strictEqual(email.assunto, 'Lombada: 1 câmera(s) sem sinal');
  assert.match(email.texto, /PORTARIA \(Cond X\) — último sinal 15\/10\/2026, 10:00 \(2 h\)/);
  assert.match(email.texto, /Voltaram a enviar:\n- CLUBE \(Cond X\)/);
});

console.log(`\n${passou} casos passaram`);
