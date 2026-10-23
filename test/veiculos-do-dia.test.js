/**
 * Veículos do dia: contagem distinta por dia (fuso de São Paulo), tipo pelo
 * vínculo da primeira passagem, "Nª hoje", grupos por dia da lista e
 * velocidade do dia. Dados fictícios.
 * Uso: TZ=America/Sao_Paulo node test/veiculos-do-dia.test.js
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const lib = require('../site/js/veiculos-do-dia');
const vinculoLib = require('../site/js/vinculo-placa');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

const cap = (id, placa, ts, extra) => Object.assign({ id, placa, timestamp: ts }, extra || {});

caso('veículo = placa normalizada; grafia antiga e Mercosul são o mesmo', () => {
  assert.strictEqual(lib.chaveVeiculo('abc-1234'), 'ABC1C34');
  assert.strictEqual(lib.chaveVeiculo('ABC1C34'), 'ABC1C34');
  assert.strictEqual(lib.chaveVeiculo('SEM PLACA'), null);
  assert.strictEqual(lib.chaveVeiculo('AB12'), null);
  assert.strictEqual(lib.chaveVeiculo(null), null);
});

caso('dia no fuso de São Paulo (23:59 local ainda é o mesmo dia)', () => {
  assert.strictEqual(lib.diaDe('2026-10-24T02:59:59Z'), '2026-10-23');
  assert.strictEqual(lib.diaDe('2026-10-24T03:00:00Z'), '2026-10-24');
  assert.strictEqual(lib.diaDe('lixo'), '');
  assert.strictEqual(lib.inicioDoDiaIso('2026-10-23'), '2026-10-23T03:00:00.000Z');
});

caso('conta cada veículo uma vez por dia, qualquer radar, sem leituras sem placa', () => {
  const capturas = [
    cap(1, 'TST1A11', '2026-10-23T10:00:00Z', { camera_id: 'r1' }),
    cap(2, 'TST1011', '2026-10-23T11:00:00Z', { camera_id: 'r2' }), // mesma placa, grafia antiga
    cap(3, 'TST-1A11', '2026-10-23T12:00:00Z'),
    cap(4, 'SEM PLACA', '2026-10-23T12:30:00Z'),
    cap(5, 'XYZ9B87', '2026-10-23T13:00:00Z'),
    cap(6, 'TST1A11', '2026-10-24T13:00:00Z'), // outro dia
  ];
  const p = lib.primeirasDoDia(capturas);
  assert.deepStrictEqual(p, [
    { dia: '2026-10-23', placa: 'TST1A11', primeira: '2026-10-23T10:00:00.000Z', passagens: 3 },
    { dia: '2026-10-23', placa: 'XYZ9B87', primeira: '2026-10-23T13:00:00.000Z', passagens: 1 },
    { dia: '2026-10-24', placa: 'TST1A11', primeira: '2026-10-24T13:00:00.000Z', passagens: 1 },
  ]);
  const r = lib.resumoDoDia(capturas.slice(0, 5), new Map());
  assert.strictEqual(r.veiculos, 2);
  assert.strictEqual(r.passagens, 5); // todas as leituras do dia, inclusive "SEM PLACA"
  assert.strictEqual(r.porTipo.sem, 2);
});

caso('primeira do dia independe da ordem das capturas', () => {
  const p = lib.primeirasDoDia([
    cap(2, 'TST1A11', '2026-10-23T15:00:00Z'),
    cap(1, 'TST1A11', '2026-10-23T09:00:00Z'),
  ]);
  assert.strictEqual(p[0].primeira, '2026-10-23T09:00:00.000Z');
});

caso('tipo do veículo = vínculo válido na primeira passagem do dia', () => {
  const indice = vinculoLib.indexarVinculos([
    // visitante até 12h; depois vira morador: o dia conta como visitante
    { placa: 'TST1A11', tipo_pessoa: 'visitante', vigente_desde: null, encerrado_em: '2026-10-23T12:00:00Z' },
    { placa: 'TST1A11', tipo_pessoa: 'morador', vigente_desde: '2026-10-23T12:00:00Z', encerrado_em: null },
    // cadastrado depois da primeira passagem: o dia conta como sem cadastro
    { placa: 'XYZ9B87', tipo_pessoa: 'prestador', vigente_desde: '2026-10-23T14:00:00Z', encerrado_em: null },
    { placa: 'QWE1234', tipo_pessoa: 'proprietario', vigente_desde: null, encerrado_em: null },
  ]);
  const r = lib.resumoDoDia([
    cap(1, 'TST1A11', '2026-10-23T10:00:00Z'),
    cap(2, 'TST1A11', '2026-10-23T13:00:00Z'),
    cap(3, 'XYZ9B87', '2026-10-23T13:00:00Z'),
    cap(4, 'XYZ9B87', '2026-10-23T15:00:00Z'),
    cap(5, 'QWE1C34', '2026-10-23T15:00:00Z'), // Mercosul da placa antiga cadastrada
  ], indice);
  assert.deepStrictEqual(r.porTipo, { morador: 0, proprietario: 1, visitante: 1, prestador: 0, sem: 1 });
  assert.deepStrictEqual(r.passagensPorTipo, { morador: 0, proprietario: 1, visitante: 2, prestador: 0, sem: 2 });
  assert.strictEqual(r.veiculos, 3);
});

caso('série por dia: 8 dias, pico em destaque e hoje parcial', () => {
  const dias = lib.ultimosDias('2026-10-23', 8);
  assert.deepStrictEqual(dias, ['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19',
    '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']);
  const prim = [
    { dia: '2026-10-22', placa: 'AAA1A11', primeira: '2026-10-22T10:00:00Z', passagens: 2 },
    { dia: '2026-10-22', placa: 'BBB1B11', primeira: '2026-10-22T10:00:00Z', passagens: 1 },
    { dia: '2026-10-23', placa: 'AAA1A11', primeira: '2026-10-23T10:00:00Z', passagens: 1 },
    { dia: '2026-10-01', placa: 'CCC1C11', primeira: '2026-10-01T10:00:00Z', passagens: 1 }, // fora da janela
  ];
  const s = lib.serieVeiculosPorDia(prim, new Map(), dias, '2026-10-23');
  assert.strictEqual(s.length, 8);
  assert.strictEqual(s[6].total, 2);
  assert.strictEqual(s[6].pico, true);
  assert.strictEqual(s[7].parcial, true);
  assert.strictEqual(s[7].pico, false);
  assert.strictEqual(s.filter((x) => x.pico).length, 1);
  assert.strictEqual(s[0].total, 0);
  assert.strictEqual(lib.serieVeiculosPorDia([], new Map(), dias, '2026-10-23').some((x) => x.pico), false);
});

caso('"Nª hoje": ordem da passagem no dia da placa (as duas grafias)', () => {
  const doDia = [
    cap('a', 'TST1A11', '2026-10-23T10:00:00Z'),
    cap('b', 'TST1011', '2026-10-23T11:00:00Z'),
    cap('c', 'TST1A11', '2026-10-23T12:00:00Z'),
    cap('d', 'TST1A11', '2026-10-22T12:00:00Z'), // ontem não conta
    cap('e', 'XYZ9B87', '2026-10-23T12:00:00Z'),
  ];
  const lista = [doDia[2], doDia[1], doDia[4], cap('f', 'SEM PLACA', '2026-10-23T12:00:00Z')];
  const o = lib.ordinaisNoDia(lista, doDia);
  assert.strictEqual(o.get('c'), 3);
  assert.strictEqual(o.get('b'), 2);
  assert.strictEqual(o.get('e'), 1);
  assert.strictEqual(o.has('f'), false);
  assert.strictEqual(lib.textoOrdinal(3, '2026-10-23', '2026-10-23'), '3ª hoje');
  assert.strictEqual(lib.textoOrdinal(2, '2026-10-22', '2026-10-23'), '2ª no dia');
  assert.strictEqual(lib.textoOrdinal(1, '2026-10-23', '2026-10-23'), '');
});

caso('"Nª hoje": empate de horário desempata pelo id', () => {
  const doDia = [cap('x1', 'TST1A11', '2026-10-23T10:00:00Z'), cap('x2', 'TST1A11', '2026-10-23T10:00:00Z')];
  const o = lib.ordinaisNoDia(doDia, doDia);
  assert.strictEqual(o.get('x1'), 1);
  assert.strictEqual(o.get('x2'), 2);
});

caso('lista com cabeçalho de dia sempre que o dia muda', () => {
  const itens = lib.comCabecalhosDeDia([
    cap(1, 'A', '2026-10-23T20:00:00Z'),
    cap(2, 'B', '2026-10-23T03:00:00Z'),
    cap(3, 'C', '2026-10-23T02:59:00Z'), // 22/10 23:59 em São Paulo
  ]);
  assert.deepStrictEqual(itens.map((i) => (i.tipo === 'dia' ? i.rotulo : i.linha.id)),
    ['Sexta, 23 de outubro', 1, 2, 'Quinta, 22 de outubro', 3]);
  assert.strictEqual(itens[4].indice, 2);
  assert.deepStrictEqual(lib.comCabecalhosDeDia([]), []);
  assert.strictEqual(lib.rotuloDiaCurto('2026-10-23'), 'sex 23');
  assert.strictEqual(lib.rotuloDiaLongo('2026-03-01'), 'Domingo, 1 de março');
});

caso('velocidade do dia: dentro do limite e média só das medidas', () => {
  const r = lib.indicadoresDeVelocidade([
    { velocidade: 0 }, { velocidade: 20 }, { velocidade: 30 }, { velocidade: 40 },
    { velocidade: 300 }, { velocidade: 90, velocidade_invalida: true },
  ], 33);
  assert.strictEqual(r.media, 30);
  assert.strictEqual(r.medidas, 3);
  assert.strictEqual(r.validas, 4);
  assert.strictEqual(r.dentroPct, 75);
  assert.deepStrictEqual(lib.indicadoresDeVelocidade([], 33), { media: null, medidas: 0, dentroPct: null, validas: 0 });
});

caso('barra fina por tipo: só os tipos com veículo, em %', () => {
  assert.deepStrictEqual(lib.fatiasDaBarra({ morador: 14, proprietario: 0, visitante: 1, prestador: 23, sem: 187 }, 225), [
    { tipo: 'morador', pct: 6.2 }, { tipo: 'visitante', pct: 0.4 }, { tipo: 'prestador', pct: 10.2 }, { tipo: 'sem', pct: 83.1 },
  ]);
  assert.deepStrictEqual(lib.fatiasDaBarra({}, 0), []);
});

caso('lib carrega no browser (window.veiculosDoDiaLib)', () => {
  const ctx = vm.createContext({ Intl });
  ctx.window = ctx;
  ['placa.js', 'vinculo-placa.js', 'veiculos-do-dia.js'].forEach((f) =>
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'site', 'js', f), 'utf8'), ctx));
  assert.strictEqual(ctx.veiculosDoDiaLib.chaveVeiculo('TST1011'), 'TST1A11');
});

console.log(`\n${passou} casos ok`);
