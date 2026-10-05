/**
 * Testes de lib/validador-placa.js.
 * Uso: node test/validador-placa.test.js
 */
const assert = require('node:assert');
const { criarValidador } = require('../lib/validador-placa');

let passou = 0;
async function caso(nome, fn) { await fn(); passou++; console.log(`ok - ${nome}`); }

function contador(contagens) {
  const chamadas = [];
  const fn = async (clienteId, placas, desde) => {
    chamadas.push({ clienteId, placas, desde });
    return Object.fromEntries(placas.filter((p) => contagens[p]).map((p) => [p, contagens[p]]));
  };
  fn.chamadas = chamadas;
  return fn;
}

(async () => {
  await caso('quase gêmea de placa frequente vira suspeita apontando a original', async () => {
    const v = criarValidador({ contarPassagens: contador({ ABC1D23: 12 }) });
    assert.deepStrictEqual(await v.avaliar({ placa: 'ABC1D28', clienteId: 'c1' }), { suspeita: true, de: 'ABC1D23' });
  });

  await caso('vizinha com menos de 3 passagens não conta', async () => {
    const v = criarValidador({ contarPassagens: contador({ ABC1D23: 2 }) });
    assert.deepStrictEqual(await v.avaliar({ placa: 'ABC1D28', clienteId: 'c1' }), { suspeita: false });
  });

  await caso('placa sem vizinhas é ok', async () => {
    const v = criarValidador({ contarPassagens: contador({}) });
    assert.deepStrictEqual(await v.avaliar({ placa: 'QWE4R56', clienteId: 'c1' }), { suspeita: false });
  });

  await caso('vizinha gravada no formato antigo é reconhecida e devolvida em Mercosul', async () => {
    const v = criarValidador({ contarPassagens: contador({ ABC1234: 5 }) });
    assert.deepStrictEqual(await v.avaliar({ placa: 'ABC1235', clienteId: 'c1' }), { suspeita: true, de: 'ABC1C34' });
  });

  await caso('com várias vizinhas, escolhe a mais frequente', async () => {
    const v = criarValidador({ contarPassagens: contador({ ABC1D23: 4, ABC1D28: 9 }) });
    assert.deepStrictEqual(await v.avaliar({ placa: 'ABC1D20', clienteId: 'c1' }), { suspeita: true, de: 'ABC1D28' });
  });

  await caso('consulta o cliente certo, numa janela de 30 dias', async () => {
    const c = contador({});
    await criarValidador({ contarPassagens: c, agora: () => new Date('2026-10-04T12:00:00Z') })
      .avaliar({ placa: 'ABC1D23', clienteId: 'cli-x' });
    assert.strictEqual(c.chamadas[0].clienteId, 'cli-x');
    assert.strictEqual(c.chamadas[0].desde, '2026-09-04T12:00:00.000Z');
  });

  await caso('falha na contagem não bloqueia: trata como ok', async () => {
    const v = criarValidador({ contarPassagens: async () => { throw new Error('banco fora'); } });
    assert.deepStrictEqual(await v.avaliar({ placa: 'ABC1D23', clienteId: 'c1' }), { suspeita: false });
  });

  // Regressão 05/10/2026: a placa real (37 passagens) foi marcada como suspeita
  // de ser a leitura errada (4 passagens) dela mesma.
  await caso('placa frequente NÃO é suspeita de uma vizinha menos frequente', async () => {
    const v = criarValidador({ contarPassagens: contador({ ABC1D23: 37, XBC1D23: 4 }) });
    assert.deepStrictEqual(await v.avaliar({ placa: 'ABC1D23', clienteId: 'c1' }), { suspeita: false });
  });

  await caso('a leitura errada continua suspeita da placa frequente', async () => {
    const v = criarValidador({ contarPassagens: contador({ ABC1D23: 37, XBC1D23: 4 }) });
    assert.deepStrictEqual(await v.avaliar({ placa: 'XBC1D23', clienteId: 'c1' }), { suspeita: true, de: 'ABC1D23' });
  });

  await caso('vizinha com menos de 3x as passagens da placa não torna a placa suspeita', async () => {
    const v = criarValidador({ contarPassagens: contador({ ABC1D23: 10, ABC1D28: 20 }) });
    assert.deepStrictEqual(await v.avaliar({ placa: 'ABC1D23', clienteId: 'c1' }), { suspeita: false });
  });

  await caso('vizinha com 3x ou mais as passagens da placa mantém a suspeita', async () => {
    const v = criarValidador({ contarPassagens: contador({ ABC1D23: 9, ABC1D28: 42 }) });
    assert.deepStrictEqual(await v.avaliar({ placa: 'ABC1D23', clienteId: 'c1' }), { suspeita: true, de: 'ABC1D28' });
  });

  await caso('as passagens da própria placa somam as duas grafias', async () => {
    // ABC1234 (antiga) + ABC1C34 (Mercosul) = 30; vizinha ABC1C35 com 40 < 3 × 30
    const v = criarValidador({ contarPassagens: contador({ ABC1234: 20, ABC1C34: 10, ABC1C35: 40 }) });
    assert.deepStrictEqual(await v.avaliar({ placa: 'ABC1C34', clienteId: 'c1' }), { suspeita: false });
  });

  console.log(`\n${passou} casos passaram`);
})().catch((e) => { console.error(e); process.exit(1); });
