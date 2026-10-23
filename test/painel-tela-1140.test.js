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
const pendentes = [];
function caso(nome, fn) {
  const r = fn();
  const ok = () => { passou++; console.log(`ok - ${nome}`); };
  if (r && typeof r.then === 'function') pendentes.push(r.then(ok)); else ok();
}

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
  assert.ok(PAINEL.includes('if (veiculosDoDia.rpcAusente(err)) porDiaSemRpc = true;'));
  assert.ok(PAINEL.includes('veiculosDoDia.serieVeiculosPorDia(anteriores.concat(deHoje), indiceVinculos, dias, hoje)'));
  assert.ok(PAINEL.includes('const DIAS_POR_DIA = 8;'));
});

caso('scripts das libs novas na ordem certa', () => {
  const ordem = ['/js/placa.js', '/js/vinculo-placa.js', '/js/veiculos-do-dia.js', '/js/severidade-velocidade.js', '/js/exportacao-passagens.js']
    .map((s) => PAINEL.indexOf(`<script src="${s}"></script>`));
  ordem.forEach((i) => assert.ok(i > 0));
  assert.deepStrictEqual([...ordem].sort((a, b) => a - b), ordem);
});

// ---------------------------------------------------------------- revisão do PR #89
const filtroCadastroLib = require('../site/js/filtro-cadastro');

// Consulta falsa de capturas: registra gte('timestamp') e devolve as linhas do período, mais nova primeiro
function capturasFalsas(linhas, leituras) {
  return () => {
    let desde = null;
    const q = {
      gte(campo, v) { if (campo === 'timestamp') desde = v; return q; },
      range(de, ate) {
        leituras.push(desde);
        const todas = linhas()
          .filter((l) => !desde || l.timestamp >= desde)
          .sort(filtroCadastroLib.compararLista);
        return Promise.resolve({ data: todas.slice(de, ate + 1), error: null });
      },
    };
    return q;
  };
}

caso('conferência no polling: só relê a partir da mais nova já lida (com margem) e mescla', async () => {
  const banco = [
    { id: 'a', placa: 'SEMCAD1', timestamp: '2026-10-23T10:00:00.000Z', velocidade: 20 },
    { id: 'b', placa: 'COMCAD1', timestamp: '2026-10-23T11:00:00.000Z', velocidade: 20 },
    { id: 'c', placa: 'SEMCAD2', timestamp: '2026-10-23T12:00:00.000Z', velocidade: 0 },
  ];
  const leituras = [];
  const ctx = vm.createContext({
    filtroCadastroLib, TAMANHO_PAGINA: 1000, MAX_PAGINAS_CONFERENCIA: 50, currentCliente: { id: 'cli' },
    conferenciaCache: null, vinculosVersao: 1, listaMostraSemVel: () => false, Date, Math, JSON,
    consultaDaLista: capturasFalsas(() => banco, leituras), ordenarLista: (q) => q,
    filtrarNoCliente: (f, linhas) => linhas.filter((l) => l.placa.startsWith('SEM')),
  });
  vm.runInContext(extrair('async function lerEConferir('), ctx);
  vm.runInContext(extrair('async function conferirNoCliente('), ctx);
  const f = { tipoCadastro: 'sem', tsStart: '2026-10-23T03:00:00.000Z' };
  const fv = { ativo: false };

  const r1 = await ctx.conferirNoCliente(f, fv, { ativo: true, ou: null });
  assert.deepStrictEqual(r1.conferidas.map((l) => l.id), ['a']); // 'c' é sem velocidade (oculta)
  assert.strictEqual(r1.semVel, 1);
  assert.deepStrictEqual(leituras, [null]); // primeira vez: o período inteiro

  // Polling: passagem nova + uma atrasada dentro da margem de 10 min
  banco.push({ id: 'd', placa: 'SEMCAD3', timestamp: '2026-10-23T12:30:00.000Z', velocidade: 25 });
  banco.push({ id: 'e', placa: 'SEMCAD4', timestamp: '2026-10-23T11:55:00.000Z', velocidade: 25 });
  const r2 = await ctx.conferirNoCliente(f, fv, { ativo: true, ou: null });
  assert.strictEqual(leituras[1], '2026-10-23T11:50:00.000Z', 'só a partir da mais nova lida, menos 10 min');
  assert.deepStrictEqual(r2.conferidas.map((l) => l.id), ['d', 'e', 'a']);
  assert.strictEqual(r2.total, 3);
  assert.strictEqual(r2.semVel, 1); // 'c' relida na margem não conta duas vezes

  // Cadastro novo/editado (versão dos vínculos) ou outro filtro: confere tudo de novo
  ctx.vinculosVersao = 2;
  await ctx.conferirNoCliente(f, fv, { ativo: true, ou: null });
  assert.strictEqual(leituras[2], null);
  await ctx.conferirNoCliente({ ...f, tsStart: '2026-10-22T03:00:00.000Z' }, fv, { ativo: true, ou: null });
  assert.strictEqual(leituras[3], null);
  await ctx.conferirNoCliente({ ...f, tsStart: '2026-10-22T03:00:00.000Z' }, fv, { ativo: true, ou: null });
  assert.notStrictEqual(leituras[4], null); // mesmo filtro de novo: incremental
  // Cadastro (loadVeiculosCache) sobe a versão; correção de leitura zera o guardado
  assert.ok(PAINEL.includes('vinculosVersao++; // a conferência guardada do cadastro da hora deixa de valer'));
  assert.ok(PAINEL.includes('conferenciaCache = null; // a passagem mudou de placa: confere o período de novo'));
});

caso('conferência guardada: mescla sem repetir e na ordem da lista', () => {
  const m = filtroCadastroLib.mesclarConferidas(
    [{ id: 'a', timestamp: '2026-10-23T10:00:00Z' }],
    [{ id: 'b', timestamp: '2026-10-23T11:00:00Z' }, { id: 'a', timestamp: '2026-10-23T10:00:00Z' }]);
  assert.deepStrictEqual(m.map((l) => l.id), ['b', 'a']);
  assert.strictEqual(filtroCadastroLib.inicioIncremental(-Infinity), null);
  assert.strictEqual(filtroCadastroLib.inicioIncremental(Date.parse('2026-10-23T12:00:00Z'), 0), '2026-10-23T12:00:00.000Z');
  assert.notStrictEqual(filtroCadastroLib.chaveConferencia({ a: 1 }, null, 1), filtroCadastroLib.chaveConferencia({ a: 1 }, null, 2));
});

caso('"Nª hoje": uma leitura limitada por dia; dia no teto fica sem selo', async () => {
  const consultas = [];
  const sbFalso = {
    from: () => {
      const reg = {};
      const q = {
        select: () => q, eq: () => q, in: (c, v) => { reg.grafias = v; return q; },
        gte: (c, v) => { reg.desde = v; return q; }, lte: (c, v) => { reg.ate = v; return q; }, order: () => q,
        range: (de, ate) => {
          consultas.push({ ...reg, de });
          // Dia 22: lotado (página sempre cheia → bate no teto); dia 23: duas passagens
          if (reg.desde.startsWith('2026-10-22')) return Promise.resolve({ data: Array.from({ length: 1000 }, (_, i) => ({ id: `x${de + i}`, placa: 'TST1A11', timestamp: '2026-10-22T05:00:00Z' })), error: null });
          return Promise.resolve({ data: [{ id: 'p1', placa: 'TST1A11', timestamp: '2026-10-23T10:00:00Z' }, { id: 'a', placa: 'TST1A11', timestamp: '2026-10-23T15:00:00Z' }], error: null });
        },
      };
      return q;
    },
  };
  const ctx = vm.createContext({
    veiculosDoDia: veiculosDoDiaLib, capturasHoje: [], currentCliente: { id: 'cli' }, sb: sbFalso,
    TAMANHO_PAGINA: 1000, MAX_PAGINAS_ORDINAL: 5, console: { error() {} }, Date, Promise, Set,
  });
  vm.runInContext(extrair('async function ordinaisDaPagina('), ctx);
  const o = await ctx.ordinaisDaPagina([
    { id: 'a', placa: 'TST1A11', timestamp: '2026-10-23T15:00:00Z' },
    { id: 'c', placa: 'TST1A11', timestamp: '2026-10-22T20:00:00Z' },
  ]);
  assert.strictEqual(o.get('a'), 2);
  assert.strictEqual(o.has('c'), false, 'dia cortado no teto: sem selo');
  assert.strictEqual(consultas.filter((c) => c.desde.startsWith('2026-10-22')).length, 5); // limitado
  assert.ok(consultas.every((c) => c.desde.slice(0, 10) === c.ate.slice(0, 10)), 'cada leitura fica no seu dia');
});

caso('"Por dia": só a função ausente vira recuo permanente; falha passageira tenta de novo', async () => {
  let resposta = { data: null, error: { code: 'PGRST202', message: 'função não encontrada' }, status: 404 };
  let chamadasRpc = 0;
  const vazio = { select: () => vazio, eq: () => vazio, gte: () => vazio, lt: () => vazio, order: () => vazio, range: () => Promise.resolve({ data: [], error: null }) };
  const ctx = vm.createContext({
    veiculosDoDia: veiculosDoDiaLib, TAMANHO_PAGINA: 1000, PORDIA_TTL_MS: 1800000, porDiaCache: null, porDiaSemRpc: false,
    sessaoValida: () => true, coletarPaginado: require('../site/js/filtro-veiculo').coletarPaginado, console: { warn() {} }, Date,
    sb: { rpc: () => ({ range: () => { chamadasRpc++; return Promise.resolve(resposta); } }), from: () => vazio },
  });
  ['const MAX_PAGINAS_PORDIA', 'async function primeirasPelaRpc(', 'async function primeirasNoNavegador(', 'async function primeirasDosDiasAnteriores(']
    .forEach((f) => vm.runInContext(f.startsWith('const') ? 'var MAX_PAGINAS_PORDIA = 50;' : extrair(f), ctx));
  const dias = ['2026-10-16', '2026-10-22'];
  const sessao = { clienteId: 'cli' };

  resposta = { data: null, error: { code: '57014', message: 'tempo esgotado' }, status: 500 };
  await ctx.primeirasDosDiasAnteriores(sessao, dias);
  assert.strictEqual(ctx.porDiaSemRpc, false, 'falha passageira não desliga a função');
  assert.strictEqual(ctx.porDiaCache, null, 'resultado do recuo passageiro não fica guardado');
  resposta = { data: [{ dia: '2026-10-22', placa: 'TST1A11', primeira: '2026-10-22T10:00:00Z', passagens: 2 }], error: null, status: 200 };
  const r = await ctx.primeirasDosDiasAnteriores(sessao, dias);
  assert.strictEqual(chamadasRpc, 2, 'tentou a função de novo');
  assert.deepStrictEqual(r.map((p) => p.placa), ['TST1A11']);

  ctx.porDiaCache = null;
  resposta = { data: null, error: { code: 'PGRST202', message: 'função não encontrada' }, status: 404 };
  await ctx.primeirasDosDiasAnteriores(sessao, dias);
  assert.strictEqual(ctx.porDiaSemRpc, true, 'função ausente: agrupa no navegador daqui em diante');
  ctx.porDiaCache = null;
  await ctx.primeirasDosDiasAnteriores(sessao, dias);
  assert.strictEqual(chamadasRpc, 3, 'não chama mais a função ausente');
});

Promise.all(pendentes).then(() => console.log(`\n${passou} casos ok`), (err) => { console.error(err); process.exit(1); });
