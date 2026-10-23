/**
 * Testes de site/js/leitor-placa.js.
 * Uso: node test/leitor-placa.test.js
 */
const assert = require('node:assert');
const lib = require('../site/js/leitor-placa');
const { ALFABETO, CONF_MIN, LEITURAS_IGUAIS, decodificar, corrigirPorPosicao, placaValida, criarEstabilizador } = lib;

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

// Monta um tensor [slots x 37] com a prob. `p` no caractere escolhido de cada posição.
function tensor(texto, p = 0.9, slots = 10) {
  const n = ALFABETO.length;
  const out = new Array(slots * n).fill(0.001);
  for (let i = 0; i < slots; i++) {
    const c = i < texto.length ? texto[i] : '_';
    const probs = Array.isArray(p) ? p[i] : p;
    out[i * n + ALFABETO.indexOf(c)] = i < texto.length ? probs : 0.99;
  }
  return out;
}

caso('constantes do modelo', () => {
  assert.strictEqual(ALFABETO, '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_');
  assert.strictEqual(CONF_MIN, 0.55);
  assert.strictEqual(LEITURAS_IGUAIS, 3);
});

caso('decodificar monta o texto e usa a menor probabilidade como confiança', () => {
  const r = decodificar(tensor('JRK0869', [0.9, 0.8, 0.95, 0.7, 0.85, 0.9, 0.99]));
  assert.strictEqual(r.texto, 'JRK0869');
  assert.strictEqual(r.confianca, 0.7);
  assert.deepStrictEqual(decodificar(new Float32Array(tensor('ABC1D23'))).texto, 'ABC1D23');
});

caso('decodificar para no primeiro "_"', () => {
  const t = tensor('AB', 0.9);
  const n = ALFABETO.length;
  t[5 * n + ALFABETO.indexOf('Z')] = 0.99; // lixo depois do vazio
  assert.strictEqual(decodificar(t).texto, 'AB');
});

caso('corrigirPorPosicao troca número por letra nas 3 primeiras e letra por número nas posições 4, 6 e 7', () => {
  assert.strictEqual(corrigirPorPosicao('08K0869'), 'OBK0869');
  assert.strictEqual(corrigirPorPosicao('0RK0869'), 'ORK0869');
  assert.strictEqual(corrigirPorPosicao('JRK08G9'), 'JRK0869');
  assert.strictEqual(corrigirPorPosicao('JRKOSIO'), 'JRK0S10');
});

caso('posição 5 é livre e tamanho diferente de 7 não é tocado', () => {
  assert.strictEqual(corrigirPorPosicao('ABC1D23'), 'ABC1D23');
  assert.strictEqual(corrigirPorPosicao('ABC1523'), 'ABC1523');
  assert.strictEqual(corrigirPorPosicao('0BC123'), '0BC123');
});

caso('placaValida', () => {
  assert.strictEqual(placaValida('ABC1D23'), true);
  assert.strictEqual(placaValida('ABC1234'), true);
  assert.strictEqual(placaValida('AB1234'), false);
  assert.strictEqual(placaValida('abc1234'), false);
  assert.strictEqual(placaValida(''), false);
});

caso('estabilizador: 2 iguais não bastam, a 3ª captura', () => {
  const e = criarEstabilizador();
  const l = { texto: 'ABC1D23', confianca: 0.9 };
  assert.strictEqual(e.registrar(l), null);
  assert.strictEqual(e.registrar(l), null);
  assert.strictEqual(e.registrar(l), 'ABC1D23');
});

caso('estabilizador: leitura inválida ou diferente zera a sequência', () => {
  const e = criarEstabilizador();
  const l = { texto: 'ABC1D23', confianca: 0.9 };
  e.registrar(l); e.registrar(l);
  assert.strictEqual(e.registrar({ texto: 'AB12', confianca: 0.9 }), null);
  assert.strictEqual(e.registrar(l), null);
  assert.strictEqual(e.registrar(l), null);
  assert.strictEqual(e.registrar(l), 'ABC1D23');
  const f = criarEstabilizador();
  f.registrar(l); f.registrar(l);
  f.registrar({ texto: 'ABC1D24', confianca: 0.9 });
  assert.strictEqual(f.registrar(l), null);
});

caso('estabilizador: confiança 0,5 não conta e zera', () => {
  const e = criarEstabilizador();
  const l = { texto: 'ABC1D23', confianca: 0.9 };
  e.registrar(l); e.registrar(l);
  assert.strictEqual(e.registrar({ texto: 'ABC1D23', confianca: 0.5 }), null);
  assert.strictEqual(e.registrar(l), null);
});

caso('estabilizador aplica a correção por posição e zerar() limpa', () => {
  const e = criarEstabilizador();
  e.registrar({ texto: 'JRK08G9', confianca: 0.9 });
  e.registrar({ texto: 'JRK0869', confianca: 0.9 });
  assert.strictEqual(e.registrar({ texto: 'JRK0869', confianca: 0.9 }), 'JRK0869');
  const f = criarEstabilizador(2);
  f.registrar({ texto: 'JRK0869', confianca: 0.9 });
  f.zerar();
  assert.strictEqual(f.registrar({ texto: 'JRK0869', confianca: 0.9 }), null);
});

console.log(`\n${passou} casos passaram`);
