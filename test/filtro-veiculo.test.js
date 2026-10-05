/**
 * Filtros e exibição dos dados do veículo no painel do síndico.
 * Uso: node test/filtro-veiculo.test.js
 */
const assert = require('node:assert');
const {
  temFiltroVeiculo, placasParaFiltro, normalizarAno, termoModelo,
  montarFiltroVeiculo, opcoesDistintas, corExibicao, corHex,
  LIMITE_PLACAS_FILTRO,
} = require('../site/js/filtro-veiculo');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

// ---- temFiltroVeiculo
caso('sem nenhum campo preenchido não há filtro de veículo', () => {
  assert.strictEqual(temFiltroVeiculo({}), false);
  assert.strictEqual(temFiltroVeiculo(null), false);
  assert.strictEqual(temFiltroVeiculo({ marca: '', modelo: '', cor: '', anoDe: null, anoAte: null }), false);
});
caso('qualquer campo preenchido liga o filtro de veículo', () => {
  assert.strictEqual(temFiltroVeiculo({ marca: 'FIAT' }), true);
  assert.strictEqual(temFiltroVeiculo({ modelo: 'gol' }), true);
  assert.strictEqual(temFiltroVeiculo({ cor: 'prata' }), true);
  assert.strictEqual(temFiltroVeiculo({ anoDe: 2010 }), true);
  assert.strictEqual(temFiltroVeiculo({ anoAte: 2020 }), true);
});

// ---- placasParaFiltro
caso('devolve as duas grafias da placa, sem duplicatas', () => {
  const r = placasParaFiltro([
    { placa: 'ABC1D23', placa_antiga: 'ABC1323' },
    { placa: 'XYZ9A87', placa_antiga: null },
    { placa: 'ABC1D23', placa_antiga: 'ABC1323' },
  ]);
  assert.deepStrictEqual(r, ['ABC1D23', 'ABC1323', 'XYZ9A87']);
});
caso('ignora linhas vazias e normaliza caixa e espaços', () => {
  assert.deepStrictEqual(placasParaFiltro([null, {}, { placa: ' abc1d23 ', placa_antiga: '' }]), ['ABC1D23']);
  assert.deepStrictEqual(placasParaFiltro(null), []);
});
caso('limite defensivo é 800 placas', () => {
  assert.strictEqual(LIMITE_PLACAS_FILTRO, 800);
});

// ---- normalizarAno
caso('ano válido vira inteiro', () => {
  assert.strictEqual(normalizarAno('2015', 2026), 2015);
  assert.strictEqual(normalizarAno(' 1950 ', 2026), 1950);
  assert.strictEqual(normalizarAno(2027, 2026), 2027);
});
caso('ano fora de 1950..atual+1 ou não numérico vira null', () => {
  assert.strictEqual(normalizarAno('1949', 2026), null);
  assert.strictEqual(normalizarAno('2028', 2026), null);
  assert.strictEqual(normalizarAno('', 2026), null);
  assert.strictEqual(normalizarAno('abc', 2026), null);
  assert.strictEqual(normalizarAno('2015.5', 2026), null);
  assert.strictEqual(normalizarAno(null, 2026), null);
});

// ---- termoModelo
caso('remove vírgula, parênteses e asterisco do termo (não quebra o filtro PostgREST)', () => {
  assert.strictEqual(termoModelo('gol, (1.0)*'), 'gol 1.0');
  assert.strictEqual(termoModelo('  onix   plus '), 'onix plus');
  assert.strictEqual(termoModelo('***'), '');
  assert.strictEqual(termoModelo(null), '');
});
caso('remove também aspas e barra invertida (sintaxe de valor do PostgREST)', () => {
  assert.strictEqual(termoModelo('"onix"\\'), 'onix');
});

// ---- montarFiltroVeiculo
caso('monta os parâmetros a partir dos campos do formulário', () => {
  const f = montarFiltroVeiculo({ marca: ' FIAT ', modelo: 'Strada,', cor: 'PRATA', anoDe: '2015', anoAte: '2020' }, 2026);
  assert.deepStrictEqual(f, { marca: 'FIAT', modelo: 'Strada', cor: 'prata', anoDe: 2015, anoAte: 2020 });
});
caso('anos invertidos são trocados; inválidos somem', () => {
  const f = montarFiltroVeiculo({ anoDe: '2020', anoAte: '2015' }, 2026);
  assert.strictEqual(f.anoDe, 2015);
  assert.strictEqual(f.anoAte, 2020);
  const g = montarFiltroVeiculo({ anoDe: '1800', anoAte: 'x' }, 2026);
  assert.strictEqual(g.anoDe, null);
  assert.strictEqual(g.anoAte, null);
  assert.strictEqual(temFiltroVeiculo(g), false);
});
caso('sem campos devolve filtro vazio', () => {
  assert.deepStrictEqual(montarFiltroVeiculo(undefined, 2026), { marca: '', modelo: '', cor: '', anoDe: null, anoAte: null });
});

// ---- opcoesDistintas
caso('valores distintos, sem vazios, ordenados em pt-BR', () => {
  const linhas = [{ marca: 'VW' }, { marca: 'FIAT' }, { marca: 'VW' }, { marca: null }, { marca: '' }, { marca: 'CITROËN' }];
  assert.deepStrictEqual(opcoesDistintas(linhas, 'marca'), ['CITROËN', 'FIAT', 'VW']);
  assert.deepStrictEqual(opcoesDistintas(null, 'marca'), []);
});

// ---- cor
caso('corExibicao: primeira letra maiúscula, resto minúsculo', () => {
  assert.strictEqual(corExibicao('BRANCA'), 'Branca');
  assert.strictEqual(corExibicao('cinza'), 'Cinza');
  assert.strictEqual(corExibicao(' pRATA '), 'Prata');
  assert.strictEqual(corExibicao(''), '');
  assert.strictEqual(corExibicao(null), '');
});
caso('corHex: mapa das cores normalizadas', () => {
  assert.strictEqual(corHex('branco'), '#f5f5f5');
  assert.strictEqual(corHex('prata'), '#c0c4c8');
  assert.strictEqual(corHex('cinza'), '#8a8f96');
  assert.strictEqual(corHex('preto'), '#1f2328');
  assert.strictEqual(corHex('vermelho'), '#c62828');
  assert.strictEqual(corHex('azul'), '#1e5bb8');
  assert.strictEqual(corHex('verde'), '#2e7d32');
  assert.strictEqual(corHex('amarelo'), '#f2c200');
  assert.strictEqual(corHex('laranja'), '#ef6c00');
  assert.strictEqual(corHex('marrom'), '#6d4c41');
  assert.strictEqual(corHex('bege'), '#d8c3a0');
  assert.strictEqual(corHex('dourado'), '#c9a227');
  assert.strictEqual(corHex('vinho'), '#7b1f2b');
  assert.strictEqual(corHex('rosa'), '#e91e63');
  assert.strictEqual(corHex('roxo'), '#6a1b9a');
});
caso('corHex: ignora caixa e espaços; desconhecida → null', () => {
  assert.strictEqual(corHex(' PRETO '), '#1f2328');
  assert.strictEqual(corHex('fantasia'), null);
  assert.strictEqual(corHex(''), null);
  assert.strictEqual(corHex(null), null);
  assert.strictEqual(corHex('toString'), null);
});

console.log(`\n${passou} casos ok`);
