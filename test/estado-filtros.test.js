/**
 * Estado único dos filtros do painel do síndico.
 * Uso: node test/estado-filtros.test.js
 */
const assert = require('node:assert');
const {
  normalizarPlacaBusca, montarFiltros, filtrosPadrao, intervaloDoPeriodo,
  periodoIncluiAgora, chaveFiltros, precisaRecarregarPeriodo,
  virarDia, hojeLocal, PLACA_BUSCA_MAX, MARGEM_ATRASO_MS,
  periodoDoAtalho, atalhoDoPeriodo, comMudancas, removerFiltro, contarMaisFiltros,
  estadoDaVisao, visaoAtiva, VISOES, paraQueryString, deQueryString, validarPeriodo,
} = require('../site/js/estado-filtros');

// Os casos de fuso supõem Brasília (-03, sem horário de verão): rode com
// TZ=America/Sao_Paulo (o npm test já faz isso).
assert.strictEqual(new Date('2026-10-05T00:00:00').getTimezoneOffset(), 180,
  'rode com TZ=America/Sao_Paulo');

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
    placa: '', velMin: 0, velMax: null, cameraId: '', soAlertas: false, naoCadastrados: false,
    veiculo: VEICULO_VAZIO,
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
caso('não altera o objeto de campos recebido (nem ao trocar invertidos)', () => {
  const campos = {
    dataInicio: '2026-10-03', horaInicio: '10:00', dataFim: '2026-10-01', horaFim: '08:00',
    placa: 'abc-1d23', velMin: '50', velMax: '20', veiculo: { marca: 'VW' },
  };
  const copia = JSON.parse(JSON.stringify(campos));
  montarFiltros(campos, '2026-10-05');
  assert.deepStrictEqual(campos, copia);
});
caso('o estado congelado recusa alteração (modo estrito)', () => {
  const f = montarFiltros({}, '2026-10-05');
  assert.throws(() => { 'use strict'; f.placa = 'X'; }, TypeError);
});
caso('vel. mín. maior que a máx. é trocada', () => {
  const f = montarFiltros({ velMin: '60', velMax: '20' }, '2026-10-05');
  assert.strictEqual(f.velMin, 20);
  assert.strictEqual(f.velMax, 60);
});
caso('início depois do fim: troca data e hora juntas', () => {
  const f = montarFiltros({ dataInicio: '2026-10-03', horaInicio: '10:00', dataFim: '2026-10-01', horaFim: '08:00' }, '2026-10-05');
  assert.deepStrictEqual([f.dataInicio, f.horaInicio, f.dataFim, f.horaFim], ['2026-10-01', '08:00', '2026-10-03', '10:00']);
});
caso('data ou hora em formato inválido cai no padrão', () => {
  const f = montarFiltros({ dataInicio: 'xx', horaInicio: '9h', dataFim: 'yy', horaFim: '25' }, '2026-10-05');
  assert.deepStrictEqual([f.dataInicio, f.horaInicio, f.dataFim, f.horaFim], ['2026-10-05', '00:00', '2026-10-05', '23:59']);
});

// ---- intervaloDoPeriodo
caso('intervalo vai em UTC: hoje local (-03) é 03:00Z até 02:59:59.999Z do dia seguinte', () => {
  const r = intervaloDoPeriodo(filtrosPadrao('2026-10-05'));
  assert.deepStrictEqual(r, {
    tsInicio: '2026-10-05T03:00:00.000Z', tsFim: '2026-10-06T02:59:59.999Z', umDia: true,
  });
});
caso('passagem às 22:30 local de hoje cai dentro; ontem 22:30, fora', () => {
  const r = intervaloDoPeriodo(filtrosPadrao('2026-10-05'));
  const dentro = (ts) => ts >= new Date(r.tsInicio).getTime() && ts <= new Date(r.tsFim).getTime();
  assert.strictEqual(dentro(new Date('2026-10-05T22:30:00').getTime()), true);
  assert.strictEqual(dentro(new Date('2026-10-04T22:30:00').getTime()), false);
});
caso('horas do filtro também viram UTC', () => {
  const f = montarFiltros({ dataInicio: '2026-10-05', horaInicio: '06:00', dataFim: '2026-10-05', horaFim: '18:30' }, '2026-10-05');
  const r = intervaloDoPeriodo(f);
  assert.strictEqual(r.tsInicio, '2026-10-05T09:00:00.000Z');
  assert.strictEqual(r.tsFim, '2026-10-05T21:30:59.999Z');
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
caso('fronteira da margem: 11 min depois do fim já não recarrega', () => {
  const f = montarFiltros({ dataInicio: '2026-10-05', horaFim: '13:48', dataFim: '2026-10-05' }, '2026-10-05');
  // fim = 13:48:59; 13:58:59 ainda está na margem de 10 min; 14:00 (11 min) não
  assert.strictEqual(periodoIncluiAgora(f, local('2026-10-05T13:58:59')), true);
  assert.strictEqual(periodoIncluiAgora(f, local('2026-10-05T14:00:00')), false);
});
caso('período que só começa no futuro não inclui agora', () => {
  const f = montarFiltros({ dataInicio: '2026-10-06', dataFim: '2026-10-07' }, '2026-10-05');
  assert.strictEqual(periodoIncluiAgora(f, local('2026-10-05T14:00:00')), false);
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

// ---- hojeLocal / virarDia (relógio injetado)
caso('hojeLocal usa a data do relógio local, não a UTC', () => {
  assert.strictEqual(hojeLocal(local('2026-10-05T22:30:00')), '2026-10-05'); // já é 06/10 em UTC
});
caso('padrão "hoje" vira o dia à meia-noite (23:59 → 00:01)', () => {
  const f = filtrosPadrao('2026-10-05');
  assert.strictEqual(virarDia(f, '2026-10-05', local('2026-10-05T23:59:00')), f);
  const g = virarDia(f, '2026-10-05', local('2026-10-06T00:01:00'));
  assert.deepStrictEqual(g, filtrosPadrao('2026-10-06'));
});
caso('filtro personalizado não vira o dia', () => {
  const f = montarFiltros({ soAlertas: true, placa: 'ABC' }, '2026-10-05');
  assert.strictEqual(virarDia(f, '2026-10-05', local('2026-10-06T00:01:00')), f);
  const g = montarFiltros({ dataInicio: '2026-10-01', dataFim: '2026-10-05' }, '2026-10-05');
  assert.strictEqual(virarDia(g, '2026-10-05', local('2026-10-06T00:01:00')), g);
});

// ---- naoCadastrados no estado
caso('naoCadastrados só liga com true explícito', () => {
  assert.strictEqual(montarFiltros({ naoCadastrados: true }, '2026-10-05').naoCadastrados, true);
  assert.strictEqual(montarFiltros({ naoCadastrados: '1' }, '2026-10-05').naoCadastrados, false);
});

// ---- atalhos de período
const HOJE = '2026-10-05';
caso('atalhos: hoje, ontem e últimos 7 dias (dias inteiros)', () => {
  assert.deepStrictEqual(periodoDoAtalho('hoje', HOJE),
    { dataInicio: HOJE, horaInicio: '00:00', dataFim: HOJE, horaFim: '23:59' });
  assert.deepStrictEqual(periodoDoAtalho('ontem', HOJE),
    { dataInicio: '2026-10-04', horaInicio: '00:00', dataFim: '2026-10-04', horaFim: '23:59' });
  assert.deepStrictEqual(periodoDoAtalho('7d', HOJE),
    { dataInicio: '2026-09-29', horaInicio: '00:00', dataFim: HOJE, horaFim: '23:59' });
});
caso('ontem atravessa virada de mês e de ano', () => {
  assert.strictEqual(periodoDoAtalho('ontem', '2026-03-01').dataInicio, '2026-02-28');
  assert.strictEqual(periodoDoAtalho('ontem', '2027-01-01').dataInicio, '2026-12-31');
});
caso('não existe atalho de 30 dias (lista limitada a 300)', () => {
  assert.strictEqual(periodoDoAtalho('30d', HOJE), null);
});
caso('reconhece o atalho do período; personalizado não tem atalho', () => {
  assert.strictEqual(atalhoDoPeriodo(filtrosPadrao(HOJE), HOJE), 'hoje');
  assert.strictEqual(atalhoDoPeriodo(montarFiltros(periodoDoAtalho('ontem', HOJE), HOJE), HOJE), 'ontem');
  assert.strictEqual(atalhoDoPeriodo(montarFiltros(periodoDoAtalho('7d', HOJE), HOJE), HOJE), '7d');
  const custom = montarFiltros({ dataInicio: HOJE, horaInicio: '08:00', dataFim: HOJE }, HOJE);
  assert.strictEqual(atalhoDoPeriodo(custom, HOJE), null);
});

// ---- comMudancas / removerFiltro
caso('comMudancas devolve estado novo e não altera o anterior', () => {
  const f = filtrosPadrao(HOJE);
  const g = comMudancas(f, { placa: 'oni', veiculo: { cor: 'prata' } }, HOJE);
  assert.strictEqual(g.placa, 'ONI');
  assert.strictEqual(g.veiculo.cor, 'prata');
  assert.strictEqual(f.placa, '');
  assert.strictEqual(f.veiculo.cor, '');
  assert.ok(Object.isFrozen(g));
});
caso('comMudancas no veículo mantém os outros campos do veículo', () => {
  const f = comMudancas(filtrosPadrao(HOJE), { veiculo: { marca: 'FIAT' } }, HOJE);
  const g = comMudancas(f, { veiculo: { modelo: 'Uno' } }, HOJE);
  assert.deepStrictEqual(g.veiculo, { marca: 'FIAT', modelo: 'Uno', cor: '', anoDe: null, anoAte: null });
});
caso('removerFiltro tira só o filtro pedido', () => {
  const f = comMudancas(filtrosPadrao(HOJE), {
    ...periodoDoAtalho('ontem', HOJE), cameraId: 'c1', soAlertas: true, naoCadastrados: true, placa: 'ABC',
    velMin: 30, velMax: 60, veiculo: { marca: 'FIAT', modelo: 'Uno', cor: 'prata', anoDe: 2019, anoAte: 2023 },
  }, HOJE);
  assert.strictEqual(atalhoDoPeriodo(removerFiltro(f, 'periodo', HOJE), HOJE), 'hoje');
  assert.strictEqual(removerFiltro(f, 'camera', HOJE).cameraId, '');
  assert.strictEqual(removerFiltro(f, 'alerta', HOJE).soAlertas, false);
  assert.strictEqual(removerFiltro(f, 'naoCadastrados', HOJE).naoCadastrados, false);
  assert.strictEqual(removerFiltro(f, 'placa', HOJE).placa, '');
  assert.strictEqual(removerFiltro(f, 'marca', HOJE).veiculo.marca, '');
  assert.strictEqual(removerFiltro(f, 'modelo', HOJE).veiculo.modelo, '');
  assert.strictEqual(removerFiltro(f, 'cor', HOJE).veiculo.cor, '');
  const semAno = removerFiltro(f, 'ano', HOJE);
  assert.deepStrictEqual([semAno.veiculo.anoDe, semAno.veiculo.anoAte], [null, null]);
  const semVel = removerFiltro(f, 'velocidade', HOJE);
  assert.deepStrictEqual([semVel.velMin, semVel.velMax], [0, null]);
  assert.strictEqual(semVel.placa, 'ABC'); // o resto fica
});
caso('removerFiltro com chave desconhecida devolve o mesmo estado', () => {
  const f = filtrosPadrao(HOJE);
  assert.strictEqual(removerFiltro(f, 'xyz', HOJE), f);
});

// ---- contarMaisFiltros
caso('Mais filtros (n): conta velocidade, marca, modelo, cor e ano (faixa conta 1)', () => {
  assert.strictEqual(contarMaisFiltros(filtrosPadrao(HOJE)), 0);
  const f = comMudancas(filtrosPadrao(HOJE), {
    velMin: 30, velMax: 60, veiculo: { marca: 'FIAT', modelo: 'Uno', cor: 'prata', anoDe: 2019, anoAte: 2023 },
  }, HOJE);
  assert.strictEqual(contarMaisFiltros(f), 5);
  assert.strictEqual(contarMaisFiltros(comMudancas(filtrosPadrao(HOJE), { velMax: 60 }, HOJE)), 1);
  assert.strictEqual(contarMaisFiltros(comMudancas(filtrosPadrao(HOJE), { veiculo: { anoAte: 2020 } }, HOJE)), 1);
});
caso('Mais filtros (n) não conta placa, câmera, período, alerta nem não cadastrados', () => {
  const f = comMudancas(filtrosPadrao(HOJE), {
    placa: 'ABC', cameraId: 'c1', soAlertas: true, naoCadastrados: true, ...periodoDoAtalho('ontem', HOJE),
  }, HOJE);
  assert.strictEqual(contarMaisFiltros(f), 0);
});

// ---- visões (perguntas prontas)
caso('as cinco visões existem, sem Reincidentes', () => {
  assert.deepStrictEqual(VISOES.map((v) => v.id), ['hoje', 'ontem', 'acima-hoje', '7d', 'nao-cadastrados']);
  assert.deepStrictEqual(VISOES.map((v) => v.rotulo),
    ['Hoje', 'Ontem', 'Acima do limite hoje', 'Últimos 7 dias', 'Não cadastrados']);
});
caso('cada visão é um estado comum (os mesmos campos do filtro)', () => {
  assert.deepStrictEqual(estadoDaVisao('hoje', HOJE), filtrosPadrao(HOJE));
  assert.strictEqual(estadoDaVisao('acima-hoje', HOJE).soAlertas, true);
  assert.strictEqual(atalhoDoPeriodo(estadoDaVisao('acima-hoje', HOJE), HOJE), 'hoje');
  assert.strictEqual(atalhoDoPeriodo(estadoDaVisao('ontem', HOJE), HOJE), 'ontem');
  assert.strictEqual(atalhoDoPeriodo(estadoDaVisao('7d', HOJE), HOJE), '7d');
  const nc = estadoDaVisao('nao-cadastrados', HOJE);
  assert.strictEqual(nc.naoCadastrados, true);
  assert.strictEqual(atalhoDoPeriodo(nc, HOJE), 'hoje');
  assert.strictEqual(estadoDaVisao('reincidentes', HOJE), null);
});
caso('visão ativa só quando o estado é exatamente o dela', () => {
  assert.strictEqual(visaoAtiva(filtrosPadrao(HOJE), HOJE), 'hoje');
  assert.strictEqual(visaoAtiva(estadoDaVisao('acima-hoje', HOJE), HOJE), 'acima-hoje');
  assert.strictEqual(visaoAtiva(estadoDaVisao('nao-cadastrados', HOJE), HOJE), 'nao-cadastrados');
  const mexido = comMudancas(estadoDaVisao('ontem', HOJE), { placa: 'ABC' }, HOJE);
  assert.strictEqual(visaoAtiva(mexido, HOJE), null);
});

// ---- URL (de/para)
caso('estado padrão vira query string vazia', () => {
  assert.strictEqual(paraQueryString(filtrosPadrao(HOJE), HOJE), '');
});
caso('atalho de período vai como p=; personalizado como de/ate', () => {
  assert.strictEqual(paraQueryString(estadoDaVisao('ontem', HOJE), HOJE), 'p=ontem');
  assert.strictEqual(paraQueryString(estadoDaVisao('7d', HOJE), HOJE), 'p=7d');
  const custom = montarFiltros({ dataInicio: HOJE, horaInicio: '08:00', dataFim: '2026-10-06', horaFim: '18:00' }, HOJE);
  assert.strictEqual(paraQueryString(custom, HOJE), 'de=2026-10-05T08%3A00&ate=2026-10-06T18%3A00');
});
caso('todos os filtros vão para a URL em ordem fixa', () => {
  const f = comMudancas(estadoDaVisao('ontem', HOJE), {
    cameraId: 'cam-1', soAlertas: true, placa: 'ONI', velMin: 30, velMax: 60, naoCadastrados: true,
    veiculo: { marca: 'CHEVROLET', modelo: 'Onix', cor: 'prata', anoDe: 2019, anoAte: 2023 },
  }, HOJE);
  assert.strictEqual(paraQueryString(f, HOJE),
    'p=ontem&cam=cam-1&alerta=1&placa=ONI&marca=CHEVROLET&modelo=Onix&cor=prata&ano=2019-2023&vmin=30&vmax=60&nc=1');
});
caso('ano com uma ponta só', () => {
  const de = comMudancas(filtrosPadrao(HOJE), { veiculo: { anoDe: 2019 } }, HOJE);
  const ate = comMudancas(filtrosPadrao(HOJE), { veiculo: { anoAte: 2023 } }, HOJE);
  assert.strictEqual(paraQueryString(de, HOJE), 'ano=2019-');
  assert.strictEqual(paraQueryString(ate, HOJE), 'ano=-2023');
});
caso('ida e volta pela URL devolve o mesmo estado', () => {
  const casos = [
    filtrosPadrao(HOJE),
    estadoDaVisao('7d', HOJE),
    estadoDaVisao('nao-cadastrados', HOJE),
    montarFiltros({ dataInicio: '2026-10-01', horaInicio: '08:00', dataFim: '2026-10-03', horaFim: '18:00' }, HOJE),
    comMudancas(estadoDaVisao('ontem', HOJE), {
      cameraId: 'cam-1', soAlertas: true, placa: 'ONI', velMin: 30, velMax: 60,
      veiculo: { marca: 'VOLKSWAGEN', modelo: 'Gol 1.0', cor: 'prata', anoDe: 2019, anoAte: 2023 },
    }, HOJE),
  ];
  casos.forEach((f) => {
    assert.deepStrictEqual(deQueryString(paraQueryString(f, HOJE), HOJE, 2026), f);
  });
});
caso('lê a URL com ou sem "?"', () => {
  assert.strictEqual(deQueryString('?alerta=1', HOJE, 2026).soAlertas, true);
  assert.strictEqual(deQueryString('alerta=1', HOJE, 2026).soAlertas, true);
});
caso('parâmetros inválidos são ignorados (cada um cai no padrão)', () => {
  const f = deQueryString(
    'p=30d&de=ontem&ate=x&cam=a%20b;drop&alerta=sim&placa=%25_%25&marca=&modelo=(*),&cor=pr4ta&ano=1800-abc&vmin=-5&vmax=abc&nc=2&zzz=1',
    HOJE, 2026);
  assert.deepStrictEqual(f, filtrosPadrao(HOJE));
});
caso('URL vazia, nula ou lixo vira o padrão', () => {
  assert.deepStrictEqual(deQueryString('', HOJE, 2026), filtrosPadrao(HOJE));
  assert.deepStrictEqual(deQueryString(null, HOJE, 2026), filtrosPadrao(HOJE));
  assert.deepStrictEqual(deQueryString('%%%&&==', HOJE, 2026), filtrosPadrao(HOJE));
});
caso('placa colada na URL é normalizada e modelo perde caracteres do filtro', () => {
  const f = deQueryString('placa=abc-1d23&modelo=Onix%2C%20LT', HOJE, 2026);
  assert.strictEqual(f.placa, 'ABC1D23');
  assert.strictEqual(f.veiculo.modelo, 'Onix LT');
});
caso('ano fora da faixa válida é ignorado; ano invertido é trocado', () => {
  assert.deepStrictEqual(
    [deQueryString('ano=2023-2019', HOJE, 2026).veiculo.anoDe, deQueryString('ano=2023-2019', HOJE, 2026).veiculo.anoAte],
    [2019, 2023]);
  assert.strictEqual(deQueryString('ano=2099-', HOJE, 2026).veiculo.anoDe, null);
});
caso('textos longos demais na URL são cortados', () => {
  const longo = 'A'.repeat(200);
  const f = deQueryString(`marca=${longo}&modelo=${longo}`, HOJE, 2026);
  assert.ok(f.veiculo.marca.length <= 40);
  assert.ok(f.veiculo.modelo.length <= 40);
});
caso('p=hoje explícito também vale', () => {
  assert.deepStrictEqual(deQueryString('p=hoje', HOJE, 2026), filtrosPadrao(HOJE));
});

// ---- datas e horas impossíveis (nunca lançar)
caso('data e hora impossíveis caem no padrão (sem lançar)', () => {
  const casos = [
    { dataInicio: '2026-10-05', horaInicio: '24:30' }, { horaFim: '23:60' },
    { dataInicio: '2026-13-01' }, { dataFim: '2026-10-32' }, { dataInicio: '2026-02-31' },
  ];
  casos.forEach((c) => {
    const f = montarFiltros(c, HOJE);
    assert.deepStrictEqual([f.dataInicio, f.horaInicio, f.dataFim, f.horaFim], [HOJE, '00:00', HOJE, '23:59'], JSON.stringify(c));
    assert.doesNotThrow(() => intervaloDoPeriodo(f));
  });
});
caso('intervaloDoPeriodo não lança nem com estado montado à mão inválido', () => {
  const r = intervaloDoPeriodo({ dataInicio: '2026-10-05', horaInicio: '24:30', dataFim: '2026-10-05', horaFim: '23:59' });
  assert.ok(!Number.isNaN(new Date(r.tsInicio).getTime()));
});
caso('URL com data/hora impossível é ignorada (padrão)', () => {
  ['de=2026-10-05T08:00&ate=2026-10-05T24:30', 'de=2026-10-05T08:00&ate=2026-10-05T23:60',
    'de=2026-13-01T08:00&ate=2026-13-02T08:00', 'de=2026-10-32T08:00&ate=2026-10-33T08:00',
    'de=2026-02-31T00:00&ate=2026-03-01T23:59'].forEach((qs) => {
    assert.deepStrictEqual(deQueryString(qs, HOJE, 2026), filtrosPadrao(HOJE), qs);
  });
});
caso('ano anterior a 2000 é ignorado', () => {
  assert.strictEqual(montarFiltros({ dataInicio: '1999-12-31', dataFim: '2000-01-01' }, HOJE).dataInicio, HOJE);
  assert.deepStrictEqual(deQueryString('de=0202-10-05T00:00&ate=2026-10-05T23:59', HOJE, 2026), filtrosPadrao(HOJE));
});
caso('período maior que 31 dias é recusado (estado e URL)', () => {
  assert.strictEqual(validarPeriodo({ dataInicio: '2026-09-01', horaInicio: '00:00', dataFim: '2026-10-05', horaFim: '23:59' }), 'Escolha até 31 dias');
  assert.strictEqual(validarPeriodo({ dataInicio: '2026-09-05', horaInicio: '00:00', dataFim: '2026-10-05', horaFim: '23:59' }), null);
  assert.strictEqual(validarPeriodo({ dataInicio: '2026-10-05', horaInicio: '24:00', dataFim: '2026-10-05', horaFim: '23:59' }), 'Data ou hora inválida');
  assert.strictEqual(validarPeriodo({ dataInicio: '1999-10-05', horaInicio: '00:00', dataFim: '1999-10-05', horaFim: '23:59' }), 'Data ou hora inválida');
  assert.strictEqual(montarFiltros({ dataInicio: '2026-01-01', dataFim: '2026-10-05' }, HOJE).dataInicio, HOJE);
  assert.deepStrictEqual(deQueryString('de=2026-01-01T00:00&ate=2026-10-05T23:59', HOJE, 2026), filtrosPadrao(HOJE));
});
caso('período invertido também é validado pela distância', () => {
  assert.strictEqual(validarPeriodo({ dataInicio: '2026-10-05', horaInicio: '00:00', dataFim: '2026-08-01', horaFim: '23:59' }), 'Escolha até 31 dias');
});

// ---- velocidade limitada a 0–300
caso('velocidade acima de 300 vira 300 (estado e URL fecham a ida e volta)', () => {
  assert.strictEqual(montarFiltros({ velMax: '999' }, HOJE).velMax, 300);
  assert.strictEqual(montarFiltros({ velMin: 450 }, HOJE).velMin, 300);
  const f = deQueryString('vmax=999', HOJE, 2026);
  assert.strictEqual(f.velMax, 300);
  assert.deepStrictEqual(deQueryString(paraQueryString(f, HOJE), HOJE, 2026), f);
});

// ---- visões do dia viram à meia-noite
caso('"Acima do limite hoje" e "Não cadastrados" viram o dia à meia-noite', () => {
  ['acima-hoje', 'nao-cadastrados', 'hoje'].forEach((id) => {
    const g = virarDia(estadoDaVisao(id, '2026-10-05'), '2026-10-05', local('2026-10-06T00:01:00'));
    assert.deepStrictEqual(g, estadoDaVisao(id, '2026-10-06'), id);
  });
});
caso('visão "Ontem" e estado mexido não viram o dia', () => {
  const o = estadoDaVisao('ontem', '2026-10-05');
  assert.strictEqual(virarDia(o, '2026-10-05', local('2026-10-06T00:01:00')), o);
  const m = comMudancas(estadoDaVisao('acima-hoje', '2026-10-05'), { placa: 'ABC' }, '2026-10-05');
  assert.strictEqual(virarDia(m, '2026-10-05', local('2026-10-06T00:01:00')), m);
});

console.log(`\n${passou} casos passaram`);
