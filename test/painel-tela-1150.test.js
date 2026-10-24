/**
 * Painel v1.15.0 (visual novo aprovado): topo fixo com período segmentado e
 * câmeras em ícones; números do dia num quadro só (com a comparação com
 * ontem); última passagem em destaque + 4 (fotos 16:9 com recorte, sem nada
 * por cima); barra de comando única; lista em tabela (Mercosul, "Nª",
 * Lombada, Veículo, Cor, Ano, Tipo, Nome, Unidade); semana seg–dom em mapa de
 * calor e rankings compactos. Segue valendo o que veio da v1.14.0 (veículos
 * do dia, cadastro da hora, lista paginada no servidor sem o teto de 300).
 * Funções do <script> inline rodam num VM. Dados fictícios.
 * Uso: node test/painel-tela-1150.test.js
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
const painelVisualLib = require('../site/js/painel-visual');

const PAINEL = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'site', 'css', 'painel.css'), 'utf8');

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
    esc: textoSeguro.esc, placaLib, vinculoPlacaLib, unidadeLib, veiculosDoDia: veiculosDoDiaLib, painelVisualLib,
    unidadesLista: [], indiceVinculos: new Map(), podeEditarVeiculos: () => true, console,
  }, extra || {}));
  ['function botaoFiltro(', 'function nomeUnidade(', 'function vinculoDaPassagem(', 'function icoTipo(', 'function celulasCadastro(']
    .forEach((f) => vm.runInContext(extrair(f), ctx));
  return ctx;
}

caso('topo fixo: período segmentado (Escolher… abre o seletor), câmeras, ao vivo, Veículos e tema', () => {
  const topo = PAINEL.slice(PAINEL.indexOf('<header class="topbar" id="topo">'), PAINEL.indexOf('</header>'));
  ['data-periodo="hoje"', 'data-periodo="ontem"', 'data-periodo="7d"', 'id="btn-periodo" data-periodo="escolher"', 'aria-controls="painel-periodo"',
    'id="cameras-status"', 'id="ultima-atualizacao"', 'id="btn-topbar-veiculos"', 'data-seletor-tema', 'id="conta-btn"']
    .forEach((t) => assert.ok(topo.includes(t), t));
  assert.ok(/\.topbar \{\s*position: sticky; top: 0;/.test(CSS));
  assert.ok(CSS.includes('backdrop-filter: blur(16px)') && CSS.includes('prefers-reduced-transparency'));
  assert.ok(PAINEL.includes("rotulo.textContent = (ok ? 'Ao vivo · ' : 'Falha ao atualizar às ') + hora;"));
  assert.ok(PAINEL.includes("mudarFiltros(periodoDoAtalho(b.dataset.periodo, todayLocalISO()));"));
  // Botões repetidos saíram (Hoje/Ontem/7 dias moram no topo; "Não cadastrados" é a legenda do tipo)
  assert.ok(!PAINEL.includes('id="visoes"') && !PAINEL.includes('id="seg-alerta"') && !PAINEL.includes('id="faixa-tipos"'));
});

caso('câmeras no topo: ícone na cor do status, balão no mouse e no teclado, clique filtra', () => {
  const ctx = vm.createContext({
    esc: textoSeguro.esc, painelVisualLib,
    window: { cameraStatusLib: require('../site/js/camera-status') },
  });
  vm.runInContext(`var ICONE_CAMERA = '<svg></svg>';${extrair('function cameraStatus(')}${extrair('function htmlIconeCamera(')}`, ctx);
  const html = ctx.htmlIconeCamera({ id: 'cam1', nome: 'Lombada Teste', nome_exibicao: 'Portaria', last_seen: new Date(Date.now() - 3 * 3600000).toISOString() });
  assert.ok(html.startsWith('<button type="button" class="cam atencao" data-filtro="camera" data-valor="cam1"'));
  assert.ok(html.includes('aria-label="Portaria: sem leitura recente · última leitura há 3h. Filtrar a lista por esta câmera"'));
  assert.ok(html.includes('<span class="dica" aria-hidden="true"><b>Portaria</b>'));
  assert.ok(CSS.includes('.cam:hover .dica, .cam:focus-visible .dica { display: flex; }'));
  // Fica no topo mesmo com as fotos recolhidas
  assert.ok(!extrair('async function loadCamerasStatus(').includes('agoraRecolhido()'));
});

caso('números do dia num quadro: veículos + barra + legenda clicável, alertas, máxima (placa e hora), anel', () => {
  ['id="stat-veiculos"', 'id="stat-passagens"', 'id="barra-tipos"', 'id="faixa-tipos-chips"', 'id="stat-alertas"', 'id="stat-limite"',
    'id="stat-maxvel"', 'id="stat-maxvel-quem"', 'id="stat-conformidade"', 'id="anel-limite"', 'id="stat-media"',
    'id="cmp-alertas"', 'id="cmp-maxvel"', 'id="cmp-dentro"'].forEach((id) => assert.ok(PAINEL.includes(id), id));
  assert.ok(PAINEL.includes('<section class="cartao numeros-dia c-dia" aria-label="Números do dia">'));
  // Os números do topo são do dia inteiro, sem os filtros da lista
  assert.ok(PAINEL.includes('veiculosDoDia.resumoDoDia(capturas, indiceVinculos)'));
  assert.ok(PAINEL.includes('escreverDentroDoLimite(veiculosDoDia.indicadoresDeVelocidade(data, limite), limite);'));
  assert.ok(PAINEL.includes("anel.setAttribute('stroke-dasharray', painelVisualLib.tracoDoAnel(pct === null ? 0 : pct));"));
  // Comparação com ontem no MESMO horário (00:00 até agora − 24 h), guardada 5 min
  assert.ok(PAINEL.includes('const ate = new Date(Date.now() - DIA_MS).toISOString();'));
  assert.ok(PAINEL.includes('painelVisualLib.comparacaoComOntem(hoje, ontem)'));
  // Indicadores usam o mesmo padrão de célula (sem caixas internas)
  assert.ok(PAINEL.includes('<section class="cartao numeros-dia indicadores lado c-ind"'));
  assert.ok(PAINEL.includes('id="ind-hora-pico"') && PAINEL.includes('id="ind-reincidentes"'));
});

caso('legenda de tipos: clicar filtra, clicar no ativo tira; tipo zerado some (menos o ativo)', () => {
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
  assert.ok(PAINEL.includes("addEventListener('click', aoClicarFaixaTipos)"));
  const faixa = vm.createContext({
    esc: textoSeguro.esc, plural: (n, um, v) => `${n} ${n === 1 ? um : v}`, document: { getElementById: () => el },
    TIPOS_DA_FAIXA: veiculosDoDiaLib.TIPOS.map((id) => vinculoPlacaLib.tipoPessoa(id)),
    resumoHoje: { porTipo: { morador: 3, proprietario: 0, visitante: 1, prestador: 0, sem: 9 } }, filtrosAtivos: { tipoCadastro: 'prestador' },
  });
  const el = {};
  vm.runInContext(`${extrair('function icoTipo(')}${extrair('function escreverFaixaTipos(')}`, faixa);
  faixa.escreverFaixaTipos();
  assert.deepStrictEqual([...el.innerHTML.matchAll(/data-tipo="([a-z]+)"/g)].map((m) => m[1]), ['morador', 'visitante', 'prestador', 'sem']);
  assert.ok(el.innerHTML.includes('data-tipo="prestador" aria-pressed="true"'));
  assert.ok(el.innerHTML.includes('<use href="#ic-casa"/>'), 'ícone do tipo na legenda');
});

caso('últimas passagens: destaque + 4, fotos 16:9 com recorte por câmera, nada por cima da foto', () => {
  assert.ok(PAINEL.includes('const RECENTES_QTD = 5;'));
  assert.ok(PAINEL.includes("painelVisualLib.recorteDaFoto(camera, destaque ? 'destaque' : 'mini')"));
  assert.ok(/\.foto \{\s*position: relative; aspect-ratio: 16 \/ 9;/.test(CSS));
  assert.ok(CSS.includes('.foto img { transform: scale(var(--zoom, 1.9)); transform-origin: var(--ox, 47%) var(--oy, 26%); }'));
  assert.ok(CSS.includes('object-fit: cover; object-position: 50% 0%;'));
  const cartoes = extrair('function htmlCartaoRecente(');
  assert.ok(!cartoes.includes('pill') && !extrair('function htmlFotoRecente(').includes('class="mer'), 'sem velocidade nem placa por cima da foto');
  assert.ok(cartoes.includes('data-acao="cadastrar-recente"') && cartoes.includes('+ Cadastrar placa'));
  assert.ok(PAINEL.includes('id="btn-recolher-agora"') && PAINEL.includes("classList.toggle('recolhido', recolhido)"));
  // Destaque 2fr + duas colunas de menores; ≤1023 o destaque em cima e 4 numa linha; celular passa com o dedo
  assert.ok(CSS.includes('grid-template-columns: minmax(0, 2fr) repeat(2, minmax(0, 1fr))'));
  assert.ok(CSS.includes('scroll-snap-type: x mandatory'));
});

caso('lista em tabela: 11 colunas na ordem, cabeçalho fixo, "Lombada" com dica', () => {
  const cab = PAINEL.slice(PAINEL.indexOf('<table class="tb" id="tabela-passagens"'), PAINEL.indexOf('</thead>'));
  const colunas = [...cab.matchAll(/<th scope="col"[^>]*>([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepStrictEqual(colunas, ['Foto', 'Placa', 'Veloc.', 'Hora', 'Lombada', 'Veículo', 'Cor', 'Ano', 'Tipo', 'Nome', 'Unidade']);
  assert.ok(cab.includes('title="Lombada Educativa">Lombada</th>'));
  assert.ok(!cab.includes('Radar') && !cab.includes('Cadastro'));
  assert.ok(/\.tb th \{\s*position: sticky; top: var\(--topo-h, 64px\);/.test(CSS));
  // Uma regra de alinhamento: números à direita, o resto à esquerda
  assert.ok(CSS.includes('.tb .c-vel, .tb .c-hora, .tb .c-ano { text-align: right; }'));
  assert.ok(CSS.includes('.ord { display: inline-block; width: 26px;'));
});

caso('Tipo (ícone) · Nome · Unidade do vínculo da hora; sem cadastro: "+ Cadastrar" na coluna Nome', () => {
  const indice = vinculoPlacaLib.indexarVinculos([
    { id: 'v1', placa: 'TST1A11', tipo_pessoa: 'prestador', nome_morador: 'Empresa Teste', unidade: 'ADM', vigente_desde: null, encerrado_em: null },
    { id: 'v2', placa: 'TST2B22', tipo_pessoa: 'visitante', nome_morador: 'Fulano', vigente_desde: '2026-10-23T20:00:00Z', encerrado_em: null },
  ]);
  const ctx = contexto({ indiceVinculos: indice });
  const cadastrado = ctx.celulasCadastro({ placa: 'TST1A11', timestamp: '2026-10-23T12:00:00Z' }, 0);
  assert.strictEqual((cadastrado.match(/<td /g) || []).length, 3);
  assert.ok(cadastrado.includes('Prestador') && cadastrado.includes('<use href="#ic-ferramenta"/>'));
  assert.ok(cadastrado.includes('<td class="c-nome">Empresa Teste</td>') && cadastrado.includes('data-filtro="unidade"'));
  assert.ok(!cadastrado.includes('+ Cadastrar'));
  const sem = ctx.celulasCadastro({ placa: 'XYZ9B87', timestamp: '2026-10-23T12:00:00Z' }, 3);
  assert.ok(sem.includes('Sem cadastro') && sem.includes('<use href="#ic-interrogacao"/>'));
  assert.ok(sem.includes('<td class="c-nome"><button type="button" class="btn-cadastrar" data-acao="cadastrar-passagem" data-indice="3"'));
  assert.ok(sem.includes('aria-label="Cadastrar a placa XYZ9B87"'));
  // Sem cadastro na hora, mas já cadastrada hoje: não oferece cadastrar de novo
  const depois = ctx.celulasCadastro({ placa: 'TST2B22', timestamp: '2026-10-23T12:00:00Z' }, 1);
  assert.ok(depois.includes('Sem cadastro') && !depois.includes('+ Cadastrar'));
  // "SEM PLACA" e quem não pode editar: sem botão
  assert.ok(!ctx.celulasCadastro({ placa: 'SEM PLACA', timestamp: '2026-10-23T12:00:00Z' }, 0).includes('+ Cadastrar'));
  const leitor = contexto({ podeEditarVeiculos: () => false });
  assert.ok(!leitor.celulasCadastro({ placa: 'XYZ9B87', timestamp: '2026-10-23T12:00:00Z' }, 0).includes('+ Cadastrar'));
  // "+ Cadastrar" aparece ao passar o mouse/focar; no toque, sempre
  assert.ok(CSS.includes('.table-row:hover .btn-cadastrar, .table-row:focus-within .btn-cadastrar { opacity: 1; }'));
  // O botão abre o MESMO formulário de cadastro da passagem (sem duplicar)
  assert.ok(PAINEL.includes('if (captura) openModal(captura, { focoCadastro: true });'));
  assert.ok(PAINEL.includes("const form = body.querySelector('form[data-acao=\"cadastrar\"]');\n      if (!form) return;"));
});

caso('linha: Mercosul + "Nª", alerta com ▲ e faixa vermelha, nova com faixa azul; veículo, cor e ano separados', () => {
  const ctx = contexto({
    ...severidade, camerasMap: { r1: 'LOMBADA TESTE' }, allThumbUrls: {}, ESTREITO_MQ: { matches: false },
    htmlFotoLista: () => '',
    celulaVeiculoTabela: () => '<td class="c-veic"><b>MODELO</b></td><td class="c-cor">Prata</td><td class="c-ano">2020</td>',
  });
  vm.runInContext(`var COLUNAS_TABELA = 11;${extrair('function htmlPlacaMercosul(')}${extrair('function htmlLinhaDaLista(')}`, ctx);
  const ordinais = new Map([['a', 3]]);
  const alerta = ctx.htmlLinhaDaLista({ id: 'a', placa: 'TST1A11', velocidade: 41, camera_id: 'r1', timestamp: '2026-10-23T20:24:35Z' },
    0, ordinais, '2026-10-23', 33, true);
  assert.ok(alerta.startsWith('<tr class="table-row alerta novo"'));
  assert.strictEqual((alerta.match(/<td /g) || []).length, 11);
  assert.ok(alerta.includes('<span class="mer"><i></i><b>TST1A11</b></span>'));
  assert.ok(alerta.includes('<span class="seta" aria-hidden="true">▲</span><span>41</span>'));
  assert.ok(alerta.includes('acima do limite — filtrar só acima do limite'));
  assert.ok(alerta.includes('>3ª<span class="visualmente-oculto"> hoje</span></span>'));
  assert.ok(alerta.includes('Filtrar pela lombada LOMBADA TESTE'));
  assert.ok(/>\d{2}:\d{2}:\d{2}<\/button>/.test(alerta), 'só a hora (HH:MM:SS)');
  const ok = ctx.htmlLinhaDaLista({ id: 'b', placa: 'TST1A11', velocidade: 20, camera_id: 'r1', timestamp: '2026-10-23T20:00:00Z' },
    1, new Map([['b', 1]]), '2026-10-23', 33, false);
  assert.ok(ok.startsWith('<tr class="table-row"') && !ok.includes('▲'));
  assert.ok(ok.includes('<span class="ord" aria-hidden="true"></span>'), 'vaga fixa do "Nª": as placas não andam');
  // Linha do dia só quando a lista passa de um dia; período de um dia leva a data às etiquetas
  assert.ok(PAINEL.includes('veiculosDoDia.comCabecalhosDeDia(pageData)'));
  assert.ok(PAINEL.includes("return umDia ? '' : cabecalhoDoDia(item);"));
  assert.ok(PAINEL.includes('${diaDoResumo()}${textoResultado(lista.total, lista.incompleta)}'));
  // Passagem nova: só as mais recentes que a mais nova já vista (página 1, mesmos filtros)
  const novas = vm.createContext({ chaveFiltros: () => 'k', filtrosAtivos: {}, currentPage: 1, listaVista: { chave: null, ids: null } });
  vm.runInContext(extrair('function passagensNovas('), novas);
  assert.strictEqual(novas.passagensNovas([{ id: 'x', timestamp: '2026-10-23T10:00:00Z' }]).size, 0, 'primeira vez: nada é novo');
  const n2 = novas.passagensNovas([{ id: 'y', timestamp: '2026-10-23T10:05:00Z' }, { id: 'x', timestamp: '2026-10-23T10:00:00Z' }, { id: 'w', timestamp: '2026-10-23T09:00:00Z' }]);
  assert.deepStrictEqual([...n2], ['y'], 'linha antiga que entrou por baixo não é nova');
  assert.ok(CSS.includes('@media (prefers-reduced-motion: no-preference)') && CSS.includes('animation: linha-entra 280ms'));
});

caso('veículo, cor e ano em colunas; sem dado do veículo: estado + "—"', () => {
  const ctx = vm.createContext({ esc: textoSeguro.esc });
  vm.runInContext(`${extrair('function bolinhaCor(')}${extrair('function estadoVeiculoHtml(')}${extrair('function botaoFiltro(')}${extrair('function botaoModelo(')}${extrair('function celulaVeiculoTabela(')}`, ctx);
  ctx.infoVeiculo = () => ({ estado: 'consultado', nome: 'VW NIVUS', modelo: 'NIVUS', cor: 'Cinza', hex: '#9ca3af', ano: '2027' });
  const c = ctx.celulaVeiculoTabela('TST1A11', '2026-10-23T12:00:00Z');
  assert.ok(c.startsWith('<td class="c-veic">') && c.includes('<b>VW NIVUS</b>') && c.includes('data-filtro="modelo"'));
  assert.ok(c.includes('<td class="c-cor"><span class="cor">') && c.includes('Cinza') && c.includes('<td class="c-ano">2027</td>'));
  ctx.infoVeiculo = () => ({ estado: 'consultando' });
  const espera = ctx.celulaVeiculoTabela('TST1A11', '2026-10-23T12:00:00Z');
  assert.ok(espera.includes('consultando…') && (espera.match(/<span class="sem-dado">—<\/span>/g) || []).length === 2);
});

caso('barra de comando: busca ("/"), câmera, Acima do limite, Filtros, Exportar; etiquetas embaixo', () => {
  const barra = PAINEL.slice(PAINEL.indexOf('<div class="barra-filtros comando" id="barra-filtros">'), PAINEL.indexOf('<!-- Filtros ativos (etiquetas)'));
  ['id="busca"', 'aria-keyshortcuts="/"', 'id="filter-camera"', 'id="btn-acima" aria-pressed="false"', 'id="btn-mais-filtros"', 'id="btn-exportar"']
    .forEach((t) => assert.ok(barra.includes(t), t));
  assert.ok(PAINEL.includes("if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || !painelAtivo) return;"));
  assert.ok(PAINEL.includes("document.getElementById('btn-acima').addEventListener('click', () => mudarFiltros({ soAlertas: !filtrosAtivos.soAlertas }));"));
  assert.ok(PAINEL.includes('id="chip-periodo"') && PAINEL.includes('id="chips-filtros"') && PAINEL.includes('id="resumo-lista"'));
});

caso('semana seg–dom em mapa de calor: ‹ ›, célula filtra dia + tipo, futuro "—"', () => {
  assert.ok(PAINEL.includes('const dias = painelVisualLib.diasDaSemana(hoje, semanaDesloc);'));
  assert.ok(PAINEL.includes('id="semana-ant"') && PAINEL.includes('id="semana-prox"'));
  const ctx = vm.createContext({ esc: textoSeguro.esc, plural: (n, um, v) => `${n} ${n === 1 ? um : v}`, filtrosAtivos: { dataInicio: '2026-10-19', dataFim: '2026-10-19', horaInicio: '00:00', horaFim: '23:59', tipoCadastro: 'morador' } });
  vm.runInContext(`${extrair('function celulaPressionada(')}${extrair('function htmlCelulaSemana(')}`, ctx);
  const col = { dia: '2026-10-19', semana: 'seg', numero: '19', hoje: false };
  const linha = { tipo: 'morador', intensidades: [22] };
  const html = ctx.htmlCelulaSemana(linha, col, 16, 0, false, { rotulo: 'Morador', cor: '--tipo-morador' });
  assert.ok(html.includes('data-dia="2026-10-19" data-tipo="morador" aria-pressed="true"'));
  assert.ok(html.includes('--c:var(--tipo-morador);--a:22%'));
  assert.ok(ctx.htmlCelulaSemana(linha, col, null, 0, false, {}).includes('class="c vz"'));
  const pico = ctx.htmlCelulaSemana({ tipo: 'total', intensidades: [0] }, col, 229, 0, true, null);
  assert.ok(pico.includes('class="c pk"') && pico.includes('o maior da semana'));
  const mud = [];
  const clique = vm.createContext({ filtrosAtivos: {}, mudarFiltros: (m) => mud.push(m), periodoDoAtalho: () => ({}), todayLocalISO: () => '2026-10-23' });
  vm.runInContext(extrair('function aoClicarSemana('), clique);
  clique.aoClicarSemana({ target: { closest: () => ({ dataset: { dia: '2026-10-20', tipo: 'total' }, getAttribute: () => 'false' }) } });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(mud[0])), { dataInicio: '2026-10-20', dataFim: '2026-10-20', horaInicio: '00:00', horaFim: '23:59', tipoCadastro: '' });
  // "Por dia" antigo (barras de 8 dias) saiu
  assert.ok(!PAINEL.includes('const DIAS_POR_DIA = 8;') && !PAINEL.includes('id="por-dia-legenda"'));
});

caso('lateral: até 1.699 px semana e rankings num quadro com abas; rankings com 3 + "Ver os 10"', () => {
  assert.ok(PAINEL.includes("window.matchMedia('(min-width: 1024px) and (max-width: 1699px)')"));
  ['id="aba-lado-semana"', 'id="aba-lado-mais"', 'id="aba-lado-recordes"', 'id="aba-rank-mais"', 'id="aba-rank-recordes"',
    'data-ver10="ranking-list"', 'data-ver10="recordes-list"'].forEach((t) => assert.ok(PAINEL.includes(t), t));
  assert.ok(CSS.includes('.rk:not(.aberta) > li:nth-child(n+4), .rec:not(.aberta) > li:nth-child(n+4) { display: none; }'));
  // A lista fica sozinha na parte de baixo, largura inteira
  assert.ok(CSS.includes('.c-lista { grid-column: 1 / -1; grid-row: 3; }'));
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

caso('veículos por dia: RPC com recuo no navegador (semana até hoje)', () => {
  assert.ok(PAINEL.includes("sb.rpc('primeiras_passagens_por_dia', {"));
  assert.ok(PAINEL.includes('if (veiculosDoDia.rpcAusente(err)) porDiaSemRpc = true;'));
  assert.ok(PAINEL.includes('veiculosDoDia.serieVeiculosPorDia(anteriores.concat(deHoje), indiceVinculos, comDados, hoje)'));
});

caso('tipografia: Manrope + JetBrains Mono; nada abaixo de 12 px', () => {
  assert.ok(PAINEL.includes('family=JetBrains+Mono:wght@500;700&family=Manrope'));
  assert.ok(!/font-size:\s*0\.(6875|625)rem/.test(PAINEL) && !/font-size:\s*(9|10|11)px/.test(PAINEL + CSS));
  assert.ok(!/\b(8|9|10|11)px (system-ui|Manrope)/.test(PAINEL), 'texto do gráfico em 12 px');
});

caso('scripts das libs novas na ordem certa', () => {
  const ordem = ['/js/camera-status.js', '/js/painel-visual.js', '/js/placa.js', '/js/vinculo-placa.js', '/js/veiculos-do-dia.js', '/js/severidade-velocidade.js', '/js/exportacao-passagens.js']
    .map((s) => PAINEL.indexOf(`<script src="${s}"></script>`));
  ordem.forEach((i) => assert.ok(i > 0));
  assert.deepStrictEqual([...ordem].sort((a, b) => a - b), ordem);
  assert.ok(PAINEL.includes('<link rel="stylesheet" href="/css/painel.css">'));
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
