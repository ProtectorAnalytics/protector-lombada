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

  console.log(`\n${passou} casos passaram`);
})().catch((e) => { console.error(e); process.exit(1); });
