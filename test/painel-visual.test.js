/**
 * Regras puras do visual 1.15.0 (site/js/painel-visual.js): semana de
 * segunda a domingo (inclusive o domingo), tabela da semana por tipo,
 * intensidade do mapa de calor, ícone de status da câmera e anel.
 * Dados fictícios.
 * Uso: node test/painel-visual.test.js
 */
const assert = require('node:assert');
const lib = require('../site/js/painel-visual');
const cameraStatusLib = require('../site/js/camera-status');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

caso('a semana começa na segunda; domingo fica na semana que começou 6 dias antes', () => {
  assert.strictEqual(lib.inicioDaSemana('2026-10-19'), '2026-10-19'); // segunda
  assert.strictEqual(lib.inicioDaSemana('2026-10-23'), '2026-10-19'); // sexta
  assert.strictEqual(lib.inicioDaSemana('2026-10-24'), '2026-10-19'); // sábado
  assert.strictEqual(lib.inicioDaSemana('2026-10-25'), '2026-10-19', 'domingo é o último dia da semana');
  assert.strictEqual(lib.inicioDaSemana('2026-10-26'), '2026-10-26'); // segunda seguinte
  assert.strictEqual(lib.inicioDaSemana('2026-11-01'), '2026-10-26'); // domingo virando o mês
  assert.strictEqual(lib.inicioDaSemana('2027-01-03'), '2026-12-28'); // domingo virando o ano
  assert.strictEqual(lib.inicioDaSemana('lixo'), '');
});

caso('7 dias de segunda a domingo; ‹ › trocam de semana', () => {
  const s = lib.diasDaSemana('2026-10-25', 0);
  assert.deepStrictEqual(s, ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
  assert.strictEqual(lib.diaDaSemana(s[0]), 1);
  assert.strictEqual(lib.diaDaSemana(s[6]), 0);
  assert.deepStrictEqual(lib.diasDaSemana('2026-10-23', -1)[0], '2026-10-12');
  assert.deepStrictEqual(lib.diasDaSemana('2026-10-23', -1)[6], '2026-10-18');
  assert.strictEqual(lib.podeAvancar(0), false, 'não há semana futura');
  assert.strictEqual(lib.podeAvancar(-1), true);
});

caso('rótulo da semana: mesmo mês, virada de mês e de ano', () => {
  assert.strictEqual(lib.rotuloSemana(lib.diasDaSemana('2026-10-23', 0)), '19–25/10');
  assert.strictEqual(lib.rotuloSemana(lib.diasDaSemana('2026-10-01', 0)), '28/09–04/10');
  assert.strictEqual(lib.rotuloSemana(lib.diasDaSemana('2026-12-31', 0)), '28/12/2026–03/01/2027');
  assert.strictEqual(lib.rotuloSemanaLongo(lib.diasDaSemana('2026-10-23', 0)), 'Semana 19 a 25/10');
});

caso('intensidade do mapa de calor: 0 sem passagem; 6% a 22% conforme o maior da linha', () => {
  assert.strictEqual(lib.intensidadeCalor(0, 10), 0);
  assert.strictEqual(lib.intensidadeCalor(5, 0), 0);
  assert.strictEqual(lib.intensidadeCalor(10, 10), 22);
  assert.strictEqual(lib.intensidadeCalor(5, 10), 14);
  assert.strictEqual(lib.intensidadeCalor(1, 190), 6.1);
  assert.strictEqual(lib.intensidadeCalor(50, 10), 22, 'nunca passa do teto');
});

caso('tabela da semana: futuro "—", hoje marcado, maior total, tipo zerado sai', () => {
  const dias = lib.diasDaSemana('2026-10-23', 0);
  const hoje = '2026-10-23';
  const tipos = ['morador', 'proprietario', 'visitante', 'prestador', 'sem'];
  const porTipo = (m, v, p, s) => ({ morador: m, proprietario: 0, visitante: v, prestador: p, sem: s });
  const serie = [
    { dia: '2026-10-19', total: 184, porTipo: porTipo(16, 1, 27, 140) },
    { dia: '2026-10-20', total: 211, porTipo: porTipo(20, 0, 28, 163) },
    { dia: '2026-10-21', total: 210, porTipo: porTipo(10, 2, 27, 171) },
    { dia: '2026-10-22', total: 229, porTipo: porTipo(17, 0, 37, 175) },
    { dia: '2026-10-23', total: 229, porTipo: porTipo(14, 1, 24, 190) },
  ];
  const t = lib.tabelaDaSemana(serie, dias, hoje, tipos);
  assert.deepStrictEqual(t.colunas.map((c) => c.semana), ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']);
  assert.deepStrictEqual(t.colunas.map((c) => c.hoje), [false, false, false, false, true, false, false]);
  assert.deepStrictEqual(t.colunas.map((c) => c.futuro), [false, false, false, false, false, true, true]);
  assert.deepStrictEqual(t.linhas.map((l) => l.tipo), ['total', 'morador', 'visitante', 'prestador', 'sem'], 'proprietário zerado sai');
  assert.deepStrictEqual(t.linhas[0].valores, [184, 211, 210, 229, 229, null, null]);
  assert.strictEqual(t.pico, 4, 'empate no maior total: o mais novo');
  assert.strictEqual(t.linhas[4].intensidades[4], 22); // 190 é o maior de "sem cadastro"
  assert.strictEqual(t.linhas[0].intensidades[5], 0);
  // Dia sem série (sem passagens) vale 0, não "—"
  const vazia = lib.tabelaDaSemana([], dias, hoje, tipos);
  assert.deepStrictEqual(vazia.linhas[0].valores, [0, 0, 0, 0, 0, null, null]);
  assert.strictEqual(vazia.pico, -1);
  assert.deepStrictEqual(lib.diasComDados(dias, hoje).length, 5);
  // Semana passada inteira: nenhum futuro
  const passada = lib.tabelaDaSemana([], lib.diasDaSemana(hoje, -1), hoje, tipos);
  assert.ok(passada.colunas.every((c) => !c.futuro && !c.hoje));
});

caso('status da câmera vira o estado do ícone do topo (cor + texto da dica)', () => {
  const agora = Date.now();
  const st = (min) => cameraStatusLib.cameraStatus(new Date(agora - min * 60000).toISOString());
  assert.deepStrictEqual(lib.estadoIconeCamera(st(0)), { estado: 'on', rotulo: 'online', dica: 'online · leitura agora' });
  assert.strictEqual(lib.estadoIconeCamera(st(12)).dica, 'online · última leitura há 12 min');
  assert.strictEqual(lib.estadoIconeCamera(st(120)).estado, 'atencao');
  assert.strictEqual(lib.estadoIconeCamera(st(120)).dica, 'sem leitura recente · última leitura há 2h');
  assert.strictEqual(lib.estadoIconeCamera(st(60 * 30)).estado, 'off');
  assert.strictEqual(lib.estadoIconeCamera(cameraStatusLib.cameraStatus(null)).estado, 'aguardando');
  assert.strictEqual(lib.estadoIconeCamera(null).estado, 'aguardando');
});

caso('anel "Dentro do limite" e selo curto da lista', () => {
  assert.strictEqual(lib.tracoDoAnel(95), '155.2 163.4');
  assert.strictEqual(lib.tracoDoAnel(0), '0.0 163.4');
  assert.strictEqual(lib.tracoDoAnel(140), '163.4 163.4');
  assert.strictEqual(lib.ordinalCurto(8), '8ª');
  assert.strictEqual(lib.ordinalCurto(1), '');
  assert.strictEqual(lib.ordinalCurto(undefined), '');
});

caso('foto limpa + zoom no carro: padrão, ajuste por modelo/id e valores inválidos', () => {
  assert.deepStrictEqual(lib.recorteDaFoto(null, 'mini'), { zoom: 1.9, x: 47, y: 26 });
  assert.deepStrictEqual(lib.recorteDaFoto({ id: 'c1' }, 'destaque'), { zoom: 1.35, x: 47, y: 22 });
  const ajustes = { 'MOD-A': { mini: { y: 30 } }, c9: { mini: { zoom: 1.5 } }, ruim: { mini: { zoom: 9, x: -5, y: 'a' } } };
  assert.deepStrictEqual(lib.recorteDaFoto({ id: 'c1', modelo: 'MOD-A' }, 'mini', ajustes), { zoom: 1.9, x: 47, y: 30 });
  assert.deepStrictEqual(lib.recorteDaFoto({ id: 'c9', modelo: 'MOD-A' }, 'mini', ajustes), { zoom: 1.5, x: 47, y: 30 });
  assert.deepStrictEqual(lib.recorteDaFoto({ id: 'ruim' }, 'mini', ajustes), { zoom: 1.9, x: 47, y: 26 });
  assert.strictEqual(lib.estiloRecorte({ zoom: 1.9, x: 47, y: 26 }), '--zoom:1.9;--ox:47%;--oy:26%');
});

caso('comparação com ontem no mesmo horário: setas, p.p. e verde quando melhora', () => {
  const c = lib.comparacaoComOntem({ alertas: 28, maxVel: 46, dentroPct: 95 }, { alertas: 42, maxVel: 48, dentroPct: 92 });
  assert.deepStrictEqual(c.alertas, { texto: '▼ 14 vs ontem', bom: true });
  assert.deepStrictEqual(c.maxVel, { texto: 'ontem 48 km/h', bom: true });
  assert.deepStrictEqual(c.dentro, { texto: '▲ 3 p.p. vs ontem', bom: true });
  const pior = lib.comparacaoComOntem({ alertas: 5, maxVel: 60, dentroPct: 80 }, { alertas: 2, maxVel: 50, dentroPct: 90 });
  assert.deepStrictEqual(pior.alertas, { texto: '▲ 3 vs ontem', bom: false });
  assert.strictEqual(pior.maxVel.bom, false);
  assert.deepStrictEqual(pior.dentro, { texto: '▼ 10 p.p. vs ontem', bom: false });
  assert.strictEqual(lib.comparacaoComOntem({ alertas: 2, maxVel: 0, dentroPct: null }, { alertas: 2, maxVel: 0, dentroPct: 90 }).alertas.texto, 'igual a ontem');
  assert.strictEqual(lib.comparacaoComOntem({ alertas: 2, maxVel: 0, dentroPct: null }, { alertas: 2, maxVel: 0, dentroPct: 90 }).dentro.texto, '');
  assert.strictEqual(lib.comparacaoComOntem({ alertas: 1, maxVel: 30 }, { alertas: 0, maxVel: 0 }).maxVel.texto, 'ontem sem velocidade medida');
  assert.strictEqual(lib.comparacaoComOntem(null, null).alertas.texto, '');
});

console.log(`\n${passou} casos ok`);
