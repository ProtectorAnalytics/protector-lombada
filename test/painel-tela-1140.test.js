/**
 * Painel v1.14.0 (tela aprovada): "Veículos hoje", faixa de tipos, faixa de
 * 6 fotos, lista opção B (Tipo/Nome/Unidade, hora, cabeçalho do dia, alerta
 * na linha, "Nª hoje", "+ Cadastrar"), abas do gráfico e lista paginada no
 * servidor sem o teto de 300. Funções do <script> inline rodam num VM.
 * Dados fictícios.
 * Uso: node test/painel-tela-1140.test.js
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const textoSeguro = require('../site/js/texto-seguro');
const placaLib = require('../site/js/placa');
const vinculoPlacaLib = require('../site/js/vinculo-placa');
const veiculosDoDiaLib = require('../site/js/veiculos-do-dia');
const unidadeLib = require('../site/js/unidade');
const severidade = require('../site/js/severidade-velocidade');

const PAINEL = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'index.html'), 'utf8');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

function extrair(inicio) {
  const i = PAINEL.indexOf(inicio);
  if (i < 0) throw new Error(`não achei "${inicio}"`);
  let nivel = 0;
  for (let j = PAINEL.indexOf(') {', i) + 2; j < PAINEL.length; j++) {
    if (PAINEL[j] === '{') nivel++;
    else if (PAINEL[j] === '}' && --nivel === 0) return PAINEL.slice(i, j + 1);
  }
  throw new Error(`chaves desbalanceadas em "${inicio}"`);
}

function contexto(extra) {
  const ctx = vm.createContext(Object.assign({
    esc: textoSeguro.esc, placaLib, vinculoPlacaLib, unidadeLib, veiculosDoDia: veiculosDoDiaLib,
    unidadesLista: [], indiceVinculos: new Map(), podeEditarVeiculos: () => true, console,
  }, extra || {}));
  ['function botaoFiltro(', 'function seloTipoPessoa(', 'function botaoTipoCadastro(', 'function botaoUnidade(',
    'function nomeUnidade(', 'function vinculoDaPassagem(', 'function celulasCadastro(']
    .forEach((f) => vm.runInContext(extrair(f), ctx));
  return ctx;
}

caso('topo: "Veículos hoje" com passagens e barra; "Dentro do limite" no lugar do limite', () => {
  assert.ok(!PAINEL.includes('<div class="label">Passagens hoje</div>'));
  assert.ok(PAINEL.includes('<div class="label">Veículos hoje</div>'));
  assert.ok(PAINEL.includes('id="stat-veiculos"') && PAINEL.includes('id="stat-passagens"') && PAINEL.includes('id="barra-tipos"'));
  assert.ok(PAINEL.includes('<div class="label">Dentro do limite hoje</div>'));
  assert.ok(PAINEL.includes('<div class="stat-sub">limite <span id="stat-limite">30</span> km/h</div>'));
  assert.ok(!PAINEL.includes('Limite configurado'));
  // Sidebar: só hora pico e reincidentes (média e conformidade subiram)
  assert.ok(!PAINEL.includes('id="ind-vel-media"') && !PAINEL.includes('id="ind-conformidade"'));
  assert.ok(PAINEL.includes('id="ind-hora-pico"') && PAINEL.includes('id="ind-reincidentes"'));
  // Os números do topo são do dia inteiro, sem os filtros da lista
  assert.ok(PAINEL.includes("veiculosDoDia.resumoDoDia(capturas, indiceVinculos)"));
  assert.ok(PAINEL.includes("escreverDentroDoLimite(veiculosDoDia.indicadoresDeVelocidade(data, limite), limite);"));
});

caso('faixa de tipos: cinco tipos; clicar filtra e clicar no ativo tira o filtro', () => {
  assert.ok(PAINEL.includes('id="faixa-tipos-chips"'));
  const mudancas = [];
  const ctx = vm.createContext({
    filtrosAtivos: { tipoCadastro: '' }, mudarFiltros: (m, o) => mudancas.push([m, o]), ESTREITO_MQ: { matches: false },
  });
  vm.runInContext(extrair('function aoClicarFaixaTipos('), ctx);
  const ev = (tipo) => ({ target: { closest: () => ({ dataset: { tipo } }) } });
  ctx.aoClicarFaixaTipos(ev('prestador'));
  ctx.filtrosAtivos = { tipoCadastro: 'prestador' };
  ctx.aoClicarFaixaTipos(ev('prestador'));
  assert.deepStrictEqual(mudancas.map((m) => m[0].tipoCadastro), ['prestador', '']);
  assert.deepStrictEqual(veiculosDoDiaLib.TIPOS, ['morador', 'proprietario', 'visitante', 'prestador', 'sem']);
  assert.ok(PAINEL.includes("addEventListener('click', aoClicarFaixaTipos)"));
  // o pressionado segue o estado dos filtros (chips, URL, drill-down)
  assert.ok(PAINEL.includes('escreverFaixaTipos(); // o tipo pressionado na faixa é o filtro de tipo da lista'));
});

caso('últimas passagens: uma faixa de 6; 3 abaixo de 1.200 px', () => {
  assert.ok(/@media \(min-width: 601px\) \{\s*\/\* altura do cartão já reservada[^}]*\.recent-cards \{ grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/.test(PAINEL));
  assert.ok(/@media \(max-width: 1199px\) \{\s*\.recent-cards \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}\s*\.recent-cards > \.recent-card:nth-child\(n\+4\) \{ display: none; \}/.test(PAINEL));
});

caso('lista opção B: colunas na ordem, sem Status', () => {
  const cab = PAINEL.slice(PAINEL.indexOf('<div class="table-header">'), PAINEL.indexOf('<div class="table-body" id="table-body">'));
  const colunas = [...cab.matchAll(/<div class="c-[a-z]+">([^<]+)<\/div>/g)].map((m) => m[1]);
  assert.deepStrictEqual(colunas, ['Foto', 'Placa', 'Velocidade', 'Hora', 'Radar', 'Veículo', 'Tipo', 'Nome', 'Unidade']);
  assert.ok(!cab.includes('Status') && !cab.includes('Data / Hora') && !cab.includes('Cadastro'));
  assert.ok(PAINEL.includes('@media (max-width: 1199px) {\n      .table-header, .table-row {'), 'duas linhas abaixo de 1.200 px');
});

caso('Tipo · Nome · Unidade do vínculo da hora; sem cadastro: "+ Cadastrar"', () => {
  const indice = vinculoPlacaLib.indexarVinculos([
    { id: 'v1', placa: 'TST1A11', tipo_pessoa: 'prestador', nome_morador: 'Empresa Teste', unidade: 'ADM', vigente_desde: null, encerrado_em: null },
    { id: 'v2', placa: 'TST2B22', tipo_pessoa: 'visitante', nome_morador: 'Fulano', vigente_desde: '2026-10-23T20:00:00Z', encerrado_em: null },
  ]);
  const ctx = contexto({ indiceVinculos: indice });
  const cadastrado = ctx.celulasCadastro({ placa: 'TST1A11', timestamp: '2026-10-23T12:00:00Z' }, 0);
  assert.ok(cadastrado.includes('Prestador') && cadastrado.includes('Empresa Teste') && cadastrado.includes('data-filtro="unidade"'));
  assert.ok(!cadastrado.includes('+ Cadastrar'));
  const sem = ctx.celulasCadastro({ placa: 'XYZ9B87', timestamp: '2026-10-23T12:00:00Z' }, 3);
  assert.ok(sem.includes('Sem cadastro') && sem.includes('data-acao="cadastrar-passagem" data-indice="3"'));
  assert.ok(sem.includes('aria-label="Cadastrar a placa XYZ9B87"'));
  // Sem cadastro na hora, mas já cadastrada hoje: não oferece cadastrar de novo
  const depois = ctx.celulasCadastro({ placa: 'TST2B22', timestamp: '2026-10-23T12:00:00Z' }, 1);
  assert.ok(depois.includes('Sem cadastro') && !depois.includes('+ Cadastrar'));
  // "SEM PLACA" e quem não pode editar: sem botão
  assert.ok(!ctx.celulasCadastro({ placa: 'SEM PLACA', timestamp: '2026-10-23T12:00:00Z' }, 0).includes('+ Cadastrar'));
  const leitor = contexto({ podeEditarVeiculos: () => false });
  assert.ok(!leitor.celulasCadastro({ placa: 'XYZ9B87', timestamp: '2026-10-23T12:00:00Z' }, 0).includes('+ Cadastrar'));
  // O botão abre o MESMO formulário de cadastro da passagem (sem duplicar)
  assert.ok(PAINEL.includes('if (captura) openModal(captura, { focoCadastro: true });'));
  assert.ok(PAINEL.includes("const form = body.querySelector('form[data-acao=\"cadastrar\"]');\n      if (!form) return;"));
});

caso('linha: alerta pinta a linha e põe ▲ (com texto acessível); hora + "Nª hoje"', () => {
  const ctx = contexto({
    ...severidade, camerasMap: { r1: 'RADAR TESTE' }, allThumbUrls: {}, ESTREITO_MQ: { matches: false },
    htmlFotoLista: () => '', celulaVeiculoTabela: () => '<div class="vb-nome">MODELO</div>',
  });
  vm.runInContext(extrair('function htmlLinhaDaLista('), ctx);
  const ordinais = new Map([['a', 3]]);
  const alerta = ctx.htmlLinhaDaLista({ id: 'a', placa: 'TST1A11', velocidade: 41, camera_id: 'r1', timestamp: '2026-10-23T20:24:35Z' },
    0, ordinais, '2026-10-23', 33);
  assert.ok(alerta.startsWith('<div class="table-row alerta"'));
  assert.ok(alerta.includes('▲ 41 km/h'));
  assert.ok(alerta.includes('acima do limite — filtrar só acima do limite'));
  assert.ok(alerta.includes('>3ª hoje</span>'));
  assert.ok(/>\d{2}:\d{2}:\d{2}<\/button>/.test(alerta), 'só a hora (HH:MM:SS)');
  const ok = ctx.htmlLinhaDaLista({ id: 'b', placa: 'TST1A11', velocidade: 20, camera_id: 'r1', timestamp: '2026-10-23T20:00:00Z' },
    1, new Map([['b', 1]]), '2026-10-23', 33);
  assert.ok(ok.startsWith('<div class="table-row"') && !ok.includes('▲') && !ok.includes('selo-dia'));
  // Cabeçalho do dia sempre que o dia muda
  assert.ok(PAINEL.includes("veiculosDoDia.comCabecalhosDeDia(pageData)"));
  assert.ok(PAINEL.includes('`<div class="linha-dia">${esc(item.rotulo)}</div>`'));
});

caso('fim do limite de 300: total exato, página pelo servidor, conferência honesta', () => {
  assert.ok(!PAINEL.includes('LIMITE_CAPTURAS'));
  assert.ok(!PAINEL.includes('consulta limitada às'));
  assert.ok(PAINEL.includes("consultaDaLista(f, fv, fc, 'id', { count: 'exact', head: true })"));
  assert.ok(PAINEL.includes('await ordenarLista(q).range(faixa.de, faixa.ate)'));
  assert.ok(PAINEL.includes("q.order('timestamp', { ascending: false }).order('id')"));
  assert.ok(PAINEL.includes('pgInfo.textContent = textoFaixa(faixa, lista.total, lista.incompleta);'));
  // Sem velocidade ocultas: o filtro vai ao servidor e a contagem é exata
  assert.ok(PAINEL.includes("const soComVelocidade = (q) => q.gt('velocidade', 0);"));
  // Conferência no cliente lê o período inteiro (leve) e avisa se parar no teto
  assert.ok(PAINEL.includes("consultaDaLista(f, fv, fc, 'id, placa, timestamp, velocidade')"));
  assert.ok(PAINEL.includes("sb.from('capturas').select('*').eq('cliente_id', currentCliente.id).in('id', ids)"));
});

caso('"Não cadastrados" é o filtro tipo=sem: a regra antiga saiu do painel', () => {
  ['naoCadastrados', 'placasCadastradas', 'filtrarNaoCadastradas', 'soNaoCadastradasSeAtivo', 'aviso-nc', '(até 300)']
    .forEach((t) => assert.ok(!PAINEL.includes(t), t));
});

caso('gráfico com abas "Por hora" e "Por dia" (RPC com recuo no navegador)', () => {
  assert.ok(PAINEL.includes('role="tab" id="aba-por-hora"') && PAINEL.includes('role="tab" id="aba-por-dia"'));
  assert.ok(PAINEL.includes('role="tabpanel" id="painel-por-dia"'));
  assert.ok(PAINEL.includes("sb.rpc('primeiras_passagens_por_dia', {"));
  assert.ok(PAINEL.includes('porDiaSemRpc = true; // função ausente no banco: agrupa no navegador'));
  assert.ok(PAINEL.includes('veiculosDoDia.serieVeiculosPorDia(anteriores.concat(deHoje), indiceVinculos, dias, hoje)'));
  assert.ok(PAINEL.includes('const DIAS_POR_DIA = 8;'));
});

caso('scripts das libs novas na ordem certa', () => {
  const ordem = ['/js/placa.js', '/js/vinculo-placa.js', '/js/veiculos-do-dia.js', '/js/severidade-velocidade.js', '/js/exportacao-passagens.js']
    .map((s) => PAINEL.indexOf(`<script src="${s}"></script>`));
  ordem.forEach((i) => assert.ok(i > 0));
  assert.deepStrictEqual([...ordem].sort((a, b) => a - b), ordem);
});

console.log(`\n${passou} casos ok`);
