/**
 * Testes de site/js/unidade.js.
 * Uso: node test/unidade.test.js
 */
const assert = require('node:assert');
const lib = require('../site/js/unidade');
const { TIPOS_UNIDADE, tipoUnidade, rotuloUnidade, expandirLote, linhasDaPlanilha, linhasParaPlanilha } = lib;

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

caso('tipos na ordem e com rótulos exatos', () => {
  assert.deepStrictEqual(TIPOS_UNIDADE.map((t) => t.id), ['apartamento', 'casa', 'sala', 'loja', 'lote', 'fip']);
  assert.strictEqual(TIPOS_UNIDADE[5].rotulo, 'FIP (Fração Ideal)');
});

caso('tipoUnidade aceita id ou rótulo, sem acento/maiúscula', () => {
  assert.strictEqual(tipoUnidade('fip').id, 'fip');
  assert.strictEqual(tipoUnidade('FIP').id, 'fip');
  assert.strictEqual(tipoUnidade('Fração Ideal').id, 'fip');
  assert.strictEqual(tipoUnidade('fracao ideal').id, 'fip');
  assert.strictEqual(tipoUnidade('FIP (Fração Ideal)').rotulo, 'FIP (Fração Ideal)');
  assert.strictEqual(tipoUnidade(' Casa ').id, 'casa');
  assert.strictEqual(tipoUnidade('galpão'), null);
  assert.strictEqual(tipoUnidade(''), null);
});

caso('rótulo da unidade', () => {
  assert.strictEqual(rotuloUnidade({ bloco: 'Torre 1', nome: '101' }), 'Torre 1 · 101');
  assert.strictEqual(rotuloUnidade({ bloco: '', nome: '101' }), '101');
  assert.strictEqual(rotuloUnidade({ nome: '101' }), '101');
  assert.strictEqual(rotuloUnidade({ bloco: ' Q2 ', nome: ' L5 ' }), 'Q2 · L5');
});

caso('lote: separadores e faixas', () => {
  assert.deepStrictEqual(expandirLote('101 102, 103-105'), { nomes: ['101', '102', '103', '104', '105'], recusados: [] });
  assert.deepStrictEqual(expandirLote('1\n2;3').nomes, ['1', '2', '3']);
  assert.deepStrictEqual(expandirLote('A1, B2').nomes, ['A1', 'B2']);
});

caso('lote: faixa invertida aceita, repetição removida', () => {
  assert.deepStrictEqual(expandirLote('105-101').nomes, ['101', '102', '103', '104', '105']);
  assert.deepStrictEqual(expandirLote('101 101, 101-102').nomes, ['101', '102']);
  assert.deepStrictEqual(expandirLote('abc ABC').nomes, ['abc']);
});

caso('lote: faixa acima de 500 recusada; 500 aceita', () => {
  const r = expandirLote('1-502 7');
  assert.deepStrictEqual(r.recusados, ['1-502']);
  assert.deepStrictEqual(r.nomes, ['7']);
  assert.strictEqual(expandirLote('1-500').nomes.length, 500);
  assert.strictEqual(expandirLote('1-501').nomes.length, 0);
});

caso('lote: faixa não numérica recusada', () => {
  const r = expandirLote('A1-A5');
  assert.deepStrictEqual(r.recusados, ['A1-A5']);
  assert.deepStrictEqual(r.nomes, []);
  assert.deepStrictEqual(expandirLote('').nomes, []);
});

caso('planilha: tipo por rótulo, vazio = apartamento', () => {
  const r = linhasDaPlanilha([
    { 'Bloco/Torre/Quadra': 'Torre 1', Unidade: 101, Andar: 1, Tipo: 'fração ideal' },
    { 'Bloco/Torre/Quadra': '', Unidade: '102', Andar: '', Tipo: '' },
    { Unidade: 'Loja 3', Tipo: 'LOJA' },
  ]);
  assert.deepStrictEqual(r.recusadas, []);
  assert.deepStrictEqual(r.unidades, [
    { bloco: 'Torre 1', nome: '101', andar: '1', tipo: 'fip' },
    { bloco: '', nome: '102', andar: '', tipo: 'apartamento' },
    { bloco: '', nome: 'Loja 3', andar: '', tipo: 'loja' },
  ]);
});

caso('planilha: cabeçalhos sem acento/maiúscula e apelidos', () => {
  const r = linhasDaPlanilha([
    { BLOCO: 'A', apartamento: '11', andar: '2', tipo: 'Casa' },
    { Torre: 'B', unidade: '12' },
    { Quadra: 'Q1', Unidade: '13' },
    { 'bloco/torre/quadra': 'C', 'UNIDADE': '14' },
  ]);
  assert.deepStrictEqual(r.recusadas, []);
  assert.deepStrictEqual(r.unidades.map((u) => [u.bloco, u.nome, u.tipo]), [
    ['A', '11', 'casa'], ['B', '12', 'apartamento'], ['Q1', '13', 'apartamento'], ['C', '14', 'apartamento'],
  ]);
});

caso('planilha: tipo inválido, unidade vazia e duplicada são recusados com motivo', () => {
  const r = linhasDaPlanilha([
    { Unidade: '1', Tipo: 'galpão' },
    { 'Bloco/Torre/Quadra': 'A', Unidade: '' },
    { 'Bloco/Torre/Quadra': 'A', Unidade: '5' },
    { 'Bloco/Torre/Quadra': 'a', Unidade: '5' },
    { 'Bloco/Torre/Quadra': 'B', Unidade: '5' },
  ]);
  assert.deepStrictEqual(r.unidades.map((u) => [u.bloco, u.nome]), [['A', '5'], ['B', '5']]);
  assert.deepStrictEqual(r.recusadas.map((x) => x.linha), [1, 2, 4]);
  assert.ok(r.recusadas.every((x) => typeof x.motivo === 'string' && x.motivo));
  assert.match(r.recusadas[0].motivo, /tipo/i);
  assert.match(r.recusadas[1].motivo, /unidade/i);
  assert.match(r.recusadas[2].motivo, /duplicad/i);
});

caso('planilha: linhas totalmente vazias são ignoradas', () => {
  const r = linhasDaPlanilha([{ Unidade: '', Tipo: '' }, {}, { Unidade: '9' }]);
  assert.strictEqual(r.unidades.length, 1);
  assert.deepStrictEqual(r.recusadas, []);
});

caso('exportação usa as colunas exatas e o rótulo do tipo', () => {
  const rows = linhasParaPlanilha([
    { bloco: 'Torre 1', nome: '101', andar: '1', tipo: 'fip' },
    { bloco: '', nome: '102', andar: '', tipo: 'apartamento' },
  ]);
  assert.deepStrictEqual(rows, [
    { 'Bloco/Torre/Quadra': 'Torre 1', Unidade: '101', Andar: '1', Tipo: 'FIP (Fração Ideal)' },
    { 'Bloco/Torre/Quadra': '', Unidade: '102', Andar: '', Tipo: 'Apartamento' },
  ]);
  // ida e volta
  const volta = linhasDaPlanilha(rows);
  assert.strictEqual(volta.unidades[0].tipo, 'fip');
});

console.log(`\n${passou} casos passaram`);
