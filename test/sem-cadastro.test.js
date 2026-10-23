/**
 * Testes de site/js/sem-cadastro.js.
 * Uso: node test/sem-cadastro.test.js
 */
const assert = require('node:assert');
const { indexarVinculos } = require('../site/js/vinculo-placa');
const { listarSemCadastro } = require('../site/js/sem-cadastro');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

const cap = (id, placa, timestamp) => ({ id, placa, timestamp, camera_id: 'c1', foto_path: `f/${id}.jpg` });
const indice = indexarVinculos([
  { placa: 'AAA1111', nome_morador: 'Fulano', vigente_desde: null, encerrado_em: null },
  { placa: 'BBB2222', nome_morador: 'Antigo', vigente_desde: null, encerrado_em: '2026-10-01T00:00:00Z' },
]);
const nenhuma = { suspeitas: new Set() };

caso('placa com vínculo vigente some', () => {
  assert.deepStrictEqual(listarSemCadastro([cap(1, 'AAA1111', '2026-10-10T10:00:00Z')], indice, nenhuma), []);
});

caso('vínculo encerrado antes da passagem não conta: aparece', () => {
  const r = listarSemCadastro([cap(1, 'BBB2222', '2026-10-10T10:00:00Z')], indice, nenhuma);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].placa, 'BBB2C22');
});

caso('passagens contadas nas duas grafias, agrupadas pela chave Mercosul', () => {
  const r = listarSemCadastro([
    cap(1, 'CCC1234', '2026-10-10T10:00:00Z'),
    cap(2, 'CCC1C34', '2026-10-11T10:00:00Z'),
    cap(3, 'CCC1234', '2026-10-09T10:00:00Z'),
  ], indice, nenhuma);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].passagens, 3);
  assert.strictEqual(r[0].ultima.id, 2);
});

caso('SEM PLACA e inválidas somem', () => {
  const r = listarSemCadastro([cap(1, 'SEM PLACA', '2026-10-10T10:00:00Z'), cap(2, 'AB12', '2026-10-10T10:00:00Z'), cap(3, '', '2026-10-10T10:00:00Z')], indice, nenhuma);
  assert.deepStrictEqual(r, []);
});

caso('placa suspeita some (chave Mercosul, qualquer grafia)', () => {
  const r = listarSemCadastro([cap(1, 'DDD1234', '2026-10-10T10:00:00Z')], indice, { suspeitas: new Set(['DDD1C34']) });
  assert.deepStrictEqual(r, []);
});

caso('ordena por última passagem desc e respeita o limite', () => {
  const caps = [cap(1, 'EEE1111', '2026-10-01T00:00:00Z'), cap(2, 'FFF2222', '2026-10-03T00:00:00Z'), cap(3, 'GGG3333', '2026-10-02T00:00:00Z')];
  assert.deepStrictEqual(listarSemCadastro(caps, indice, nenhuma).map((x) => x.placa), ['FFF2C22', 'GGG3D33', 'EEE1B11']);
  assert.strictEqual(listarSemCadastro(caps, indice, nenhuma, 2).length, 2);
});

caso('vínculo na hora da passagem mais recente decide (não o atual)', () => {
  const caps = [cap(1, 'BBB2222', '2026-09-20T10:00:00Z')]; // antes do encerramento: tinha vínculo
  assert.deepStrictEqual(listarSemCadastro(caps, indice, nenhuma), []);
});

caso('placa recém-cadastrada (vigente_desde depois da passagem) some da lista', () => {
  const idx = indexarVinculos([
    { placa: 'JJJ2222', nome_morador: 'Novo', vigente_desde: '2026-10-10T12:00:00Z', encerrado_em: null },
  ]);
  const caps = [cap(1, 'JJJ2222', '2026-10-10T10:00:00Z'), cap(2, 'KKK3333', '2026-10-10T09:30:00Z')];
  assert.deepStrictEqual(listarSemCadastro(caps, idx, nenhuma).map((x) => x.placa), ['KKK3D33']);
});

console.log(`\n${passou} casos passaram`);
