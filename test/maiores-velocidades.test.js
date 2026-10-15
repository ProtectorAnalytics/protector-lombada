/**
 * Ranking "Maiores velocidades · últimos 6 meses" (card abaixo do Top 10).
 * Uso: TZ=America/Sao_Paulo node test/maiores-velocidades.test.js
 */
const assert = require('node:assert');
const {
  JANELA_DIAS, LIMITE, desdeIso, valorDoClique, mudancaDoRecorde,
} = require('../site/js/maiores-velocidades');

assert.strictEqual(new Date('2026-10-05T00:00:00').getTimezoneOffset(), 180,
  'rode com TZ=America/Sao_Paulo');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

caso('janela de 180 dias (retenção do histórico) e 10 veículos', () => {
  assert.strictEqual(JANELA_DIAS, 180);
  assert.strictEqual(LIMITE, 10);
});

caso('desdeIso volta 180 dias a partir de agora', () => {
  const agora = new Date('2026-10-14T12:00:00Z');
  assert.strictEqual(desdeIso(agora), '2026-04-17T12:00:00.000Z');
});

caso('clique leva placa e o dia LOCAL do recorde', () => {
  // 01:30 UTC de 15/10 ainda é 14/10 em Brasília
  assert.strictEqual(valorDoClique('ABC1D23', '2026-10-15T01:30:00Z'), 'ABC1D23|2026-10-14');
});

caso('valor do clique vira filtro da placa no dia do recorde, sem câmera nem só-alertas', () => {
  assert.deepStrictEqual(mudancaDoRecorde('ABC1D23|2026-10-14'), {
    placa: 'ABC1D23', cameraId: '', soAlertas: false,
    dataInicio: '2026-10-14', horaInicio: '00:00', dataFim: '2026-10-14', horaFim: '23:59',
  });
});

caso('valor adulterado no HTML não vira filtro', () => {
  ['', 'ABC1D23', 'ABC1D23|ontem', 'abc|2026-10-14', 'ABC1D23|2026-13-40|x', null].forEach((v) => {
    assert.strictEqual(mudancaDoRecorde(v), null, String(v));
  });
});

console.log(`\n${passou} casos passaram`);
