/**
 * Estado único dos filtros do painel do síndico.
 * Uso: node test/estado-filtros.test.js
 */
const assert = require('node:assert');
const {
  normalizarPlacaBusca, montarFiltros, filtrosPadrao, intervaloDoPeriodo,
  periodoIncluiAgora, chaveFiltros, precisaRecarregarPeriodo,
  PLACA_BUSCA_MAX, MARGEM_ATRASO_MS,
} = require('../site/js/estado-filtros');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

const VEICULO_VAZIO = { marca: '', modelo: '', cor: '', anoDe: null, anoAte: null };

// ---- normalizarPlacaBusca
caso('placa colada com hífen vira a placa sem hífen', () => {
  assert.strictEqual(normalizarPlacaBusca('ABC-1D23'), 'ABC1D23');
});
caso('remove espaços e põe em maiúsculas', () => {
  assert.strictEqual(normalizarPlacaBusca('  abc 1d23 '), 'ABC1D23');
});
caso('tira curingas do ilike (% e _) e qualquer símbolo', () => {
  assert.strictEqual(normalizarPlacaBusca('A%B_C.1'), 'ABC1');
});
caso('corta em 7 caracteres úteis', () => {
  assert.strictEqual(PLACA_BUSCA_MAX, 7);
  assert.strictEqual(normalizarPlacaBusca('ABC1D234'), 'ABC1D23');
});
caso('vazio, nulo e indefinido viram texto vazio', () => {
  assert.strictEqual(normalizarPlacaBusca(''), '');
  assert.strictEqual(normalizarPlacaBusca(null), '');
  assert.strictEqual(normalizarPlacaBusca(undefined), '');
});
caso('busca parcial continua parcial', () => {
  assert.strictEqual(normalizarPlacaBusca('ab-c'), 'ABC');
});

// ---- montarFiltros / filtrosPadrao
caso('padrão: o dia de hoje inteiro, sem nenhum outro filtro', () => {
  const f = filtrosPadrao('2026-10-05');
  assert.deepStrictEqual(f, {
    dataInicio: '2026-10-05', horaInicio: '00:00', dataFim: '2026-10-05', horaFim: '23:59',
    placa: '', velMin: 0, velMax: null, cameraId: '', soAlertas: false, veiculo: VEICULO_VAZIO,
  });
});
caso('copia os campos do formulário normalizando placa e velocidades', () => {
  const f = montarFiltros({
    dataInicio: '2026-10-01', horaInicio: '06:00', dataFim: '2026-10-03', horaFim: '18:30',
    placa: 'abc-1d23', velMin: '20', velMax: '60', cameraId: 'cam-1', soAlertas: true,
    veiculo: { marca: 'FIAT', modelo: '', cor: 'prata', anoDe: 2010, anoAte: null },
  }, '2026-10-05');
  assert.strictEqual(f.placa, 'ABC1D23');
  assert.strictEqual(f.velMin, 20);
  assert.strictEqual(f.velMax, 60);
  assert.strictEqual(f.soAlertas, true);
  assert.strictEqual(f.cameraId, 'cam-1');
  assert.deepStrictEqual(f.veiculo, { marca: 'FIAT', modelo: '', cor: 'prata', anoDe: 2010, anoAte: null });
});
caso('datas e horas vazias caem no dia de hoje inteiro', () => {
  const f = montarFiltros({ dataInicio: '', horaInicio: '', dataFim: '', horaFim: '' }, '2026-10-05');
  assert.strictEqual(f.dataInicio, '2026-10-05');
  assert.strictEqual(f.dataFim, '2026-10-05');
  assert.strictEqual(f.horaInicio, '00:00');
  assert.strictEqual(f.horaFim, '23:59');
});
caso('velocidades inválidas ou negativas não filtram', () => {
  const f = montarFiltros({ velMin: 'abc', velMax: '-3' }, '2026-10-05');
  assert.strictEqual(f.velMin, 0);
  assert.strictEqual(f.velMax, null);
});
caso('o estado devolvido é congelado (ninguém altera por fora)', () => {
  const f = montarFiltros({}, '2026-10-05');
  assert.ok(Object.isFrozen(f));
  assert.ok(Object.isFrozen(f.veiculo));
});
caso('não altera o objeto de campos recebido', () => {
  const campos = Object.freeze({ placa: 'abc-1d23', veiculo: Object.freeze({ marca: 'VW' }) });
  assert.doesNotThrow(() => montarFiltros(campos, '2026-10-05'));
});

// ---- intervaloDoPeriodo
caso('intervalo usa as horas com segundos de borda', () => {
  const r = intervaloDoPeriodo(filtrosPadrao('2026-10-05'));
  assert.deepStrictEqual(r, { tsInicio: '2026-10-05T00:00:00', tsFim: '2026-10-05T23:59:59', umDia: true });
});
caso('período de vários dias não é dia único', () => {
  const f = montarFiltros({ dataInicio: '2026-10-01', dataFim: '2026-10-03' }, '2026-10-05');
  assert.strictEqual(intervaloDoPeriodo(f).umDia, false);
});

// ---- periodoIncluiAgora
const local = (s) => new Date(s); // sem fuso: hora local
caso('hoje inteiro inclui agora', () => {
  assert.strictEqual(periodoIncluiAgora(filtrosPadrao('2026-10-05'), local('2026-10-05T14:00:00')), true);
});
caso('período todo no passado não inclui agora', () => {
  const f = montarFiltros({ dataInicio: '2026-10-01', dataFim: '2026-10-03' }, '2026-10-05');
  assert.strictEqual(periodoIncluiAgora(f, local('2026-10-05T14:00:00')), false);
});
caso('hoje até 10h, às 14h, já é passado', () => {
  const f = montarFiltros({ dataInicio: '2026-10-05', horaFim: '10:00', dataFim: '2026-10-05' }, '2026-10-05');
  assert.strictEqual(periodoIncluiAgora(f, local('2026-10-05T14:00:00')), false);
});
caso('fim recente ainda recarrega dentro da margem de atraso do envio', () => {
  assert.ok(MARGEM_ATRASO_MS > 0);
  const f = montarFiltros({ dataInicio: '2026-10-05', horaFim: '13:58', dataFim: '2026-10-05' }, '2026-10-05');
  assert.strictEqual(periodoIncluiAgora(f, local('2026-10-05T14:00:00')), true);
});
caso('período que só começa no futuro não inclui agora', () => {
  const f = montarFiltros({ dataInicio: '2026-10-06', dataFim: '2026-10-07' }, '2026-10-05');
  assert.strictEqual(periodoIncluiAgora(f, local('2026-10-05T14:00:00')), false);
});
caso('data inválida recarrega por segurança', () => {
  const f = montarFiltros({ dataInicio: 'xx', dataFim: 'yy' }, '2026-10-05');
  assert.strictEqual(periodoIncluiAgora(f, local('2026-10-05T14:00:00')), true);
});

// ---- chaveFiltros / precisaRecarregarPeriodo
caso('mesmos filtros têm a mesma chave; filtros diferentes, chaves diferentes', () => {
  const a = filtrosPadrao('2026-10-05');
  const b = montarFiltros({}, '2026-10-05');
  assert.strictEqual(chaveFiltros(a), chaveFiltros(b));
  const c = montarFiltros({ soAlertas: true }, '2026-10-05');
  assert.notStrictEqual(chaveFiltros(a), chaveFiltros(c));
});
caso('passado já carregado com os mesmos filtros não recarrega', () => {
  const f = montarFiltros({ dataInicio: '2026-10-01', dataFim: '2026-10-03' }, '2026-10-05');
  assert.strictEqual(precisaRecarregarPeriodo(f, chaveFiltros(f), local('2026-10-05T14:00:00')), false);
});
caso('passado com filtros mudados recarrega', () => {
  const f = montarFiltros({ dataInicio: '2026-10-01', dataFim: '2026-10-03' }, '2026-10-05');
  const g = montarFiltros({ dataInicio: '2026-10-01', dataFim: '2026-10-03', placa: 'ABC' }, '2026-10-05');
  assert.strictEqual(precisaRecarregarPeriodo(g, chaveFiltros(f), local('2026-10-05T14:00:00')), true);
});
caso('nada carregado ainda (chave nula) recarrega', () => {
  const f = montarFiltros({ dataInicio: '2026-10-01', dataFim: '2026-10-03' }, '2026-10-05');
  assert.strictEqual(precisaRecarregarPeriodo(f, null, local('2026-10-05T14:00:00')), true);
});
caso('período que inclui agora sempre recarrega', () => {
  const f = filtrosPadrao('2026-10-05');
  assert.strictEqual(precisaRecarregarPeriodo(f, chaveFiltros(f), local('2026-10-05T14:00:00')), true);
});

console.log(`\n${passou} casos passaram`);
