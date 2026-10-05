/**
 * Repositório Supabase da base de veículos com um db falso (offline): confere
 * a forma das consultas e o tratamento de erro, sem banco.
 * Uso: node test/veiculos-base-repo.test.js
 */
const assert = require('node:assert');
const path = require('node:path');

// lib/supabase cria o cliente real na carga; aqui ele nunca é usado.
const idSupabase = require.resolve(path.join('..', 'lib/supabase'));
require.cache[idSupabase] = { id: idSupabase, filename: idSupabase, loaded: true, exports: { supabase: null } };

const { criarRepoSupabase } = require('../lib/veiculos-base-repo');

/** Db falso: grava a cadeia de chamadas e resolve com a resposta configurada. */
function criarDbFalso(resposta) {
  const chamadas = [];
  const db = {
    chamadas,
    from(tabela) {
      const cadeia = [['from', tabela]];
      chamadas.push(cadeia);
      const q = new Proxy({}, {
        get(_, metodo) {
          if (metodo === 'then') {
            return (ok, ko) => Promise.resolve(resposta(cadeia)).then(ok, ko);
          }
          return (...args) => { cadeia.push([metodo, ...args]); return q; };
        },
      });
      return q;
    },
  };
  return db;
}

const metodo = (cadeia, nome) => cadeia.filter((c) => c[0] === nome).map((c) => c.slice(1));

let passou = 0;
let falhou = 0;
async function caso(nome, fn) {
  try { await fn(); passou++; console.log(`ok - ${nome}`); }
  catch (e) { falhou++; console.log(`FALHOU - ${nome}\n  ${e.message.split('\n').join('\n  ')}`); }
}

(async () => {
  await caso('consultasUltimaHora conta só consultas com custo > 0 na última hora (F2)', async () => {
    const db = criarDbFalso(() => ({ count: 37, error: null }));
    const antes = Date.now();
    const n = await criarRepoSupabase(db).consultasUltimaHora();
    assert.strictEqual(n, 37);
    const c = db.chamadas[0];
    assert.deepStrictEqual(c[0], ['from', 'apiplacas_consultas']);
    assert.deepStrictEqual(metodo(c, 'select')[0][1], { count: 'exact', head: true });
    assert.deepStrictEqual(metodo(c, 'gt'), [['custo', 0]]);
    const [[col, desde]] = metodo(c, 'gte');
    assert.strictEqual(col, 'criado_em');
    const diff = antes - Date.parse(desde);
    assert.ok(diff >= 3600000 - 50 && diff <= 3600000 + 50, `janela de 1 h (${diff} ms)`);
  });

  await caso('consultasUltimaHora lança quando o banco falha (F2)', async () => {
    const db = criarDbFalso(() => ({ count: null, error: { message: 'fora' } }));
    await assert.rejects(() => criarRepoSupabase(db).consultasUltimaHora(), /fora/);
  });

  await caso('reservar devolve false no conflito 23505 do UNIQUE de placa_antiga (F4)', async () => {
    const db = criarDbFalso(() => ({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }));
    assert.strictEqual(await criarRepoSupabase(db).reservar({ placa: 'ABC1C34', placa_antiga: 'ABC1234' }), false);
  });

  await caso('reservar lança em outro erro e devolve true quando reservou (F4)', async () => {
    const ruim = criarDbFalso(() => ({ data: null, error: { code: '42501', message: 'negado' } }));
    await assert.rejects(() => criarRepoSupabase(ruim).reservar({ placa: 'ABC1D23' }), /negado/);
    const bom = criarDbFalso(() => ({ data: [{ placa: 'ABC1D23' }], error: null }));
    assert.strictEqual(await criarRepoSupabase(bom).reservar({ placa: 'ABC1D23' }), true);
  });

  console.log(`\n${passou} casos passaram${falhou ? `, ${falhou} falharam` : ''}`);
  if (falhou) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
