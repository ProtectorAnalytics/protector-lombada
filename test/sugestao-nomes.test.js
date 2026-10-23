/**
 * Testes de site/js/sugestao-nomes.js.
 * Uso: node test/sugestao-nomes.test.js
 */
const assert = require('node:assert');
const { sugerirNomes } = require('../site/js/sugestao-nomes');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

const A = 'uni-a';
const vinculos = [
  { nome_morador: 'Maria Souza', unidade_id: A, criado_em: '2026-03-01T10:00:00Z', encerrado_em: '2026-06-01T00:00:00Z' },
  { nome_morador: 'José Álvares', unidade_id: A, criado_em: '2026-05-01T10:00:00Z', encerrado_em: null },
  { nome_morador: 'JOSE ALVARES', unidade_id: A, criado_em: '2026-01-01T10:00:00Z', encerrado_em: '2026-02-01T00:00:00Z' },
  { nome_morador: 'Outro Bloco', unidade_id: 'uni-b', criado_em: '2026-09-01T10:00:00Z', encerrado_em: null },
  { nome_morador: '   ', unidade_id: A, criado_em: '2026-08-01T10:00:00Z', encerrado_em: null },
];

caso('mesma unidade: sem repetir (caixa/acento), mais recentes primeiro, ignora vazio e outras unidades', () => {
  assert.deepStrictEqual(sugerirNomes(vinculos, { unidadeId: A }), ['José Álvares', 'Maria Souza']);
});

caso('empate de criado_em: vigente antes do encerrado', () => {
  const t = '2026-04-01T10:00:00Z';
  const r = sugerirNomes([
    { nome_morador: 'Encerrado', unidade_id: A, criado_em: t, encerrado_em: '2026-05-01T00:00:00Z' },
    { nome_morador: 'Vigente', unidade_id: A, criado_em: t, encerrado_em: null },
  ], { unidadeId: A });
  assert.deepStrictEqual(r, ['Vigente', 'Encerrado']);
});

caso('legado sem unidade_id casa pelo texto da unidade, sem diferenciar caixa/espaços', () => {
  const legado = [
    { nome_morador: 'Legado', unidade_id: null, unidade: 'Bloco 2 · 302 ', criado_em: '2026-01-01T00:00:00Z' },
    { nome_morador: 'Não entra', unidade_id: null, unidade: 'Bloco 2 · 303', criado_em: '2026-01-02T00:00:00Z' },
  ];
  assert.deepStrictEqual(sugerirNomes(legado, { unidadeNome: 'bloco 2 · 302' }), ['Legado']);
});

caso('limite respeitado (padrão 8)', () => {
  const muitos = Array.from({ length: 12 }, (_, i) => ({
    nome_morador: `Pessoa ${i}`, unidade_id: A, criado_em: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
  }));
  assert.strictEqual(sugerirNomes(muitos, { unidadeId: A }).length, 8);
  assert.deepStrictEqual(sugerirNomes(muitos, { unidadeId: A }, 2), ['Pessoa 11', 'Pessoa 10']);
});

caso('entrada vazia ou sem unidade devolve lista vazia', () => {
  assert.deepStrictEqual(sugerirNomes(null, { unidadeId: A }), []);
  assert.deepStrictEqual(sugerirNomes(vinculos, {}), []);
});

console.log(`\n${passou} casos passaram`);
