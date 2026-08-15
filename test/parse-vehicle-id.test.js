/**
 * Testes de parseVehicleId (lib/validators.js).
 *
 * Regressão que motivou o arquivo: a primeira versão usava
 * `Number.isFinite(+v) ? +v : null`. Como `+null` e `+''` valem 0 e passam em
 * isFinite, toda captura de uma câmera que não envia vehicleId era gravada com
 * vehicle_id = 0. A partir da segunda, o dedupe de api/captura.js encontraria a
 * anterior e descartaria a passagem como retransmissão — perdendo captura real.
 *
 * Uso: node test/parse-vehicle-id.test.js
 */

const assert = require('node:assert');
const { parseVehicleId } = require('../lib/validators');

const casos = [
  // [entrada, esperado, descrição]
  [898243, 898243, 'id numérico do AlarmInfoPlate'],
  ['898243', 898243, 'id como string (payload em form-urlencoded)'],
  [2522529, 2522529, 'id observado em produção na CPC-LOMB4'],

  [null, null, 'null NÃO pode virar 0 — era a regressão'],
  ['', null, 'string vazia NÃO pode virar 0 — era a regressão'],
  [undefined, null, 'campo ausente'],
  [0, null, 'zero é sentinela, não id de evento'],
  ['0', null, 'zero como string'],

  [-1, null, 'negativo não é id válido'],
  [NaN, null, 'NaN'],
  ['abc', null, 'texto não numérico'],
  [Infinity, null, 'infinito'],
  [{}, null, 'objeto'],
  [[], null, 'array vazio (+[] === 0)'],
];

let falhas = 0;

for (const [entrada, esperado, descricao] of casos) {
  const obtido = parseVehicleId(entrada);
  try {
    assert.strictEqual(obtido, esperado);
    console.log(`  ok   ${descricao} -> ${JSON.stringify(obtido)}`);
  } catch {
    falhas++;
    console.error(`  FALHA ${descricao}: esperado ${JSON.stringify(esperado)}, obtido ${JSON.stringify(obtido)}`);
  }
}

// Duas capturas sem vehicleId têm de resultar em null — e null nunca casa com
// null no dedupe, porque findCapturaRecentePorVehicleId rejeita não-positivos.
assert.strictEqual(parseVehicleId(null), parseVehicleId(undefined));
assert.strictEqual(parseVehicleId(null), null);

console.log('');
if (falhas > 0) {
  console.error(`❌ ${falhas} de ${casos.length} casos falharam`);
  process.exit(1);
}
console.log(`✅ ${casos.length} casos passaram`);
