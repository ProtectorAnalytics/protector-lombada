/**
 * Painel v1.16.0 (versão final da maquete aprovada): período na linha da
 * busca ("Hoje · 24/10" + calendário), botões da busca em ícone com dica,
 * sem a linha de "Hoje · data · N passagens" (o aviso das ocultas foi para o
 * rodapé da lista), números do dia + indicadores numa faixa compacta (apoio
 * na dica), quadro lateral único ≥1024 px (semana · números · rankings),
 * Veloc. centralizada e, ≥1024 px, Tipo só com o ícone e Cor só com o ponto.
 * Funções do <script> inline rodam num VM. Dados fictícios.
 * Uso: node test/painel-tela-1160.test.js
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const textoSeguro = require('../site/js/texto-seguro');
const vinculoPlacaLib = require('../site/js/vinculo-placa');
const placaLib = require('../site/js/placa');
const unidadeLib = require('../site/js/unidade');
const painelVisualLib = require('../site/js/painel-visual');

const PAINEL = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'site', 'css', 'painel.css'), 'utf8');

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

// Bloco de CSS de uma media query (até a chave que fecha)
function blocoMedia(cabeca, aPartirDe) {
  const i = CSS.indexOf(cabeca, aPartirDe || 0);
  if (i < 0) throw new Error(`não achei "${cabeca}"`);
  let nivel = 0;
  for (let j = CSS.indexOf('{', i); j < CSS.length; j++) {
    if (CSS[j] === '{') nivel++;
    else if (CSS[j] === '}' && --nivel === 0) return CSS.slice(i, j + 1);
  }
  throw new Error('chaves desbalanceadas');
}

const BARRA = PAINEL.slice(PAINEL.indexOf('<div class="barra-filtros comando" id="barra-filtros">'), PAINEL.indexOf('<!-- Filtros ativos (etiquetas'));

// Elemento falso: só o que as funções usam
function el() {
  return { hidden: false, textContent: '', innerHTML: '', dataset: {}, attrs: {}, classes: new Set(),
    setAttribute(k, v) { this.attrs[k] = v; }, querySelector() { return this.filho || null; },
    classList: null };
}

caso('período na linha da busca, logo depois do campo: Hoje · Ontem · 7 dias · calendário', () => {
  const iBusca = BARRA.indexOf('id="busca-wrap"');
  const iSeg = BARRA.indexOf('id="seg-periodo"');
  const iCam = BARRA.indexOf('id="grupo-camera"');
  assert.ok(iBusca >= 0 && iSeg > iBusca && iCam > iSeg, 'busca → período → câmeras');
  ['data-periodo="hoje"', 'data-periodo="ontem"', 'data-periodo="7d"', 'id="btn-periodo" data-periodo="escolher"',
    'aria-controls="painel-periodo"', 'aria-label="Escolher período"', 'data-dica="Escolher período"']
    .forEach((t) => assert.ok(BARRA.includes(t), t));
  assert.ok(!PAINEL.includes('Escolher…') && !PAINEL.includes('id="rotulo-periodo"'), 'o calendário substitui "Escolher…"');
  // O ativo leva a data; o calendário diz o período personalizado
  const estado = extrair('function escreverEstadoNaBarra(');
  assert.ok(estado.includes('painelVisualLib.rotuloBotaoPeriodo(p, p === atalho, f.dataInicio)'));
  assert.ok(estado.includes("`Período: ${personalizado} — escolher outro`"));
  // Mesmo comportamento: atalhos aplicam direto, o calendário abre o seletor
  assert.ok(PAINEL.includes("mudarFiltros(periodoDoAtalho(b.dataset.periodo, todayLocalISO()));"));
  assert.ok(PAINEL.includes("document.getElementById('btn-periodo').addEventListener('click', (e) => abrirPainelFiltro(overlay, e.currentTarget));"));
  assert.ok(/\.seg-periodo \{[^}]*height: 44px;/.test(CSS));
});

caso('botões da busca em ícone 44 × 44 com dica e nome acessível', () => {
  assert.ok(BARRA.includes('placeholder="Buscar placa, modelo, marca…"'));
  assert.ok(BARRA.includes('class="barra-grupo sel-ic" id="grupo-camera" data-dica="Câmeras: todas"'));
  assert.ok(BARRA.includes('<span class="sel-ic-cara" aria-hidden="true">') && BARRA.includes('<span class="seta">▾</span>'));
  assert.ok(BARRA.includes('<select id="filter-camera"'), 'a lista nativa de câmeras segue a mesma');
  assert.ok(BARRA.includes('id="btn-acima" aria-pressed="false" aria-label="Só acima do limite" data-dica="Só acima do limite"'));
  assert.ok(/id="btn-mais-filtros"[^>]*data-dica="Filtros/.test(BARRA) && BARRA.includes('id="contador-filtros"'));
  assert.ok(/id="btn-exportar"[^>]*aria-label="Exportar" data-dica="Exportar"/.test(BARRA));
  assert.ok(/\.comando \.barra-btn\.ic \{[^}]*width: 44px; height: 44px;/.test(CSS));
  assert.ok(/\.comando \.sel-ic \{[^}]*width: 58px; height: 44px;/.test(CSS));
  assert.ok(CSS.includes('.btn-acima[aria-pressed="true"] { color: var(--alerta) !important;'), 'acima do limite ativo em vermelho');
  assert.ok(/\.comando \.contador-filtros \{ position: absolute;/.test(CSS), 'contador pequeno no ícone de filtros');
  assert.ok(CSS.includes('.comando [data-dica]:focus-visible::after') && CSS.includes('content: attr(data-dica)'));
  // Câmera escolhida: dica com o nome e ícone destacado
  const ctx = vm.createContext({ camerasMap: { c1: 'Portaria' } });
  const g = { dataset: {}, classList: { on: false, toggle(c, v) { this.on = v; } } };
  ctx.document = { getElementById: () => g };
  vm.runInContext(extrair('function escreverCameraNaBarra('), ctx);
  ctx.escreverCameraNaBarra('c1');
  assert.deepStrictEqual([g.dataset.dica, g.classList.on], ['Câmera: Portaria', true]);
  ctx.escreverCameraNaBarra('');
  assert.deepStrictEqual([g.dataset.dica, g.classList.on], ['Câmeras: todas', false]);
});

caso('sem a linha "Hoje · data · N passagens": as etiquetas só aparecem com filtro', () => {
  assert.ok(!PAINEL.includes('id="chip-periodo"') && !PAINEL.includes('id="resumo-lista"') && !PAINEL.includes('function diaDoResumo('));
  assert.ok(PAINEL.includes('<div class="chips-linha" id="chips-linha" hidden>'));
  const chips = extrair('function renderChips(');
  assert.ok(chips.includes("document.getElementById('chips-linha').hidden = chips.length === 0;"));
  assert.ok(chips.includes(".filter((c) => c.chave !== 'periodo' || !atalho)"), 'Ontem/7 dias já aparecem no seletor');
  assert.ok(CSS.includes('.chips-linha[hidden] { display: none; }'));
});

caso('rodapé da lista: "1–8 de 543 passagens · 72 abaixo de 10 km/h ocultas · mostrar"', () => {
  const pg = PAINEL.slice(PAINEL.indexOf('<div class="table-pagination sem-paginas" id="table-pagination"'));
  const iInfo = pg.indexOf('id="pg-info"');
  const iSem = pg.indexOf('id="rodape-sem-vel"');
  assert.ok(iInfo > 0 && iSem > iInfo && iSem < pg.indexOf('id="pg-controls"'), 'contagem → ocultas → páginas');
  assert.ok(pg.includes('onclick="toggleSemVel(!mostrarSemVel())"'), 'reaproveita o controle das ocultas');
  const els = {};
  ['rodape-sem-vel', 'btn-sem-vel', 'sem-vel-sep', 'sem-vel-texto', 'pg-info', 'table-pagination'].forEach((id) => { els[id] = el(); });
  els['table-pagination'].style = {};
  els['table-pagination'].classList = { contains: () => true };
  const ctx = vm.createContext({
    document: { getElementById: (id) => els[id] }, filtrosAtivos: {}, buscaPorVeiculo: () => false,
    mostrarSemVel: () => false, textoResultado: require('../site/js/barra-filtros').textoResultado, tabelaEmErro: false,
    lista: { total: 543, semVel: 72, incompleta: false, consulta: {} },
  });
  vm.runInContext(`${extrair('function atualizarRodapeSemVel(')}${extrair('function sincronizarBarraRodape(')}`, ctx);
  ctx.atualizarRodapeSemVel();
  assert.strictEqual(els['sem-vel-texto'].textContent, '72 abaixo de 10 km/h ocultas');
  assert.strictEqual(els['btn-sem-vel'].textContent, 'mostrar');
  assert.strictEqual(els['rodape-sem-vel'].hidden, false);
  assert.strictEqual(els['pg-info'].textContent, '543 passagens');
  assert.strictEqual(els['table-pagination'].style.display, 'flex');
  // Mostrando: o mesmo lugar oferece ocultar; sem ocultas, o trecho some
  ctx.mostrarSemVel = () => true;
  ctx.atualizarRodapeSemVel();
  assert.deepStrictEqual([els['sem-vel-texto'].textContent, els['btn-sem-vel'].textContent], ['72 abaixo de 10 km/h aparecem', 'ocultar']);
  ctx.lista = { total: 10, semVel: 0, incompleta: false, consulta: {} };
  ctx.atualizarRodapeSemVel();
  assert.strictEqual(els['rodape-sem-vel'].hidden, true);
  // Mais de uma página: a faixa "1–8 de 543" substitui a contagem
  const pag = extrair('function escreverPaginacao(');
  assert.ok(pag.includes('pgInfo.textContent = textoFaixa(faixa, lista.total, lista.incompleta);'));
  assert.ok(pag.includes('pgInfo.textContent = textoResultado(lista.total, lista.incompleta);'));
  assert.ok(CSS.includes('.table-pagination.sem-paginas .pg-controls { display: none; }'));
  assert.ok(!CSS.includes('.sem-paginas .pg-info'), 'a contagem fica mesmo com uma página só');
});

caso('faixa de números: veículos (legenda + barra), alertas, máxima, dentro, pico, reincidentes; apoio na dica', () => {
  const faixa = PAINEL.slice(PAINEL.indexOf('<section class="cartao faixa" id="faixa-numeros"'), PAINEL.indexOf('</aside>'));
  const ids = [...faixa.matchAll(/class="fx[^"]*" id="(fx-[a-z]+)" tabindex="0"/g)].map((m) => m[1]);
  assert.deepStrictEqual(ids, ['fx-veiculos', 'fx-alertas', 'fx-maxvel', 'fx-dentro', 'fx-pico', 'fx-reincidentes']);
  ['>Veículos hoje<', '>Alertas<', '>Máxima<', '>Dentro do limite<', '>Pico<', '>Reincidentes<', 'id="falha-indicators"']
    .forEach((t) => assert.ok(faixa.includes(t), t));
  assert.strictEqual((faixa.match(/<span class="visualmente-oculto fx-dica"><\/span>/g) || []).length, 6, 'dica também para o leitor de tela');
  assert.ok(!PAINEL.includes('class="anel'), 'sem o anel do %');
  // escreverDica: atributo da dica (mouse/foco) + texto oculto
  const sr = { textContent: '' };
  const alvo = { dataset: {}, querySelector: () => sr };
  const ctx = vm.createContext({ document: { getElementById: () => alvo } });
  vm.runInContext(extrair('function escreverDica('), ctx);
  ctx.escreverDica('fx-alertas', 'acima de 33 km/h · ontem 42 no mesmo horário');
  assert.strictEqual(alvo.dataset.dica, 'acima de 33 km/h · ontem 42 no mesmo horário');
  assert.strictEqual(sr.textContent, ' (acima de 33 km/h · ontem 42 no mesmo horário)');
  ctx.escreverDica('fx-alertas', '');
  assert.ok(!('dica' in alvo.dataset) && sr.textContent === '');
  // As dicas do dia juntam o apoio e o "ontem" da comparação curta
  const dicas = extrair('function escreverDicasDoDia(');
  ['`acima de ${limite} km/h`', 'cmp.alertas.dica', 'cmp.maxVel.dica', 'cmp.dentro.dica', '`média ${mediaHoje} km/h`']
    .forEach((t) => assert.ok(dicas.includes(t), t));
  assert.ok(CSS.includes('.fx-cmp.bom { color: var(--ok); }') && CSS.includes('.fx-cmp.ruim { color: var(--alerta); }'));
});

caso('≥1024 px: quadro lateral único (semana · números · rankings) da altura da coluna da esquerda', () => {
  const aside = PAINEL.slice(PAINEL.indexOf('<aside class="lateral" id="lateral"'), PAINEL.indexOf('</aside>'));
  const iSem = aside.indexOf('id="card-semana"');
  const iRk = aside.indexOf('id="card-rankings"');
  const iFx = aside.indexOf('id="faixa-numeros"');
  assert.ok(iSem > 0 && iRk > iSem && iFx > iRk, 'no DOM: semana, rankings, números (a ordem visual vem do CSS)');
  const grade = blocoMedia('@media (min-width: 1024px) {', CSS.indexOf('/* Quadro lateral único'));
  ['grid-column: 2; grid-row: 1 / span 2; align-self: stretch;', 'contain: size; overflow: hidden;',
    '.lateral > .c-lado2 { display: contents; }', '.lateral .c-vpd { order: 1;', '.lateral .faixa { order: 2;', '.lateral .c-rk { order: 3;']
    .forEach((t) => assert.ok(grade.includes(t), t));
  assert.ok(CSS.includes('.c-rec { grid-column: 1; grid-row: 1; }') && CSS.includes('.c-lista { grid-column: 1; grid-row: 2; }'));
  // Números em lista vertical (rótulo à esquerda, número à direita)
  assert.ok(CSS.includes('.lateral .fx { flex-direction: row; align-items: center; justify-content: space-between;'));
  // Rankings: até 10, as linhas que couberem; "Ver todos" rola o resto
  assert.ok(CSS.includes('.lateral .c-rk .rk > li:nth-child(n+4), .lateral .c-rk .rec > li:nth-child(n+4) { display: list-item; }'));
  assert.ok(CSS.includes('.lateral .rk.aberta, .lateral .rec.aberta { overflow-y: auto;'));
  // ≤1023: a lateral desmonta e a ordem é fotos, faixa, lista, semana/rankings
  const tablet = blocoMedia('@media (max-width: 1023px) {', CSS.indexOf('/* ---------- tablet'));
  assert.ok(tablet.includes('.lateral { display: contents; }'));
  assert.ok(tablet.includes('.c-rec { order: 1; } .faixa { order: 2; } .c-lista { order: 3; } .c-lado2 { order: 5; }'));
});

caso('"Ver todos" / "Ver os 10": aparece só com linha escondida', () => {
  const botao = { hidden: false, attrs: {}, textContent: '', setAttribute(k, v) { this.attrs[k] = v; } };
  const lista = {
    aberta: false, children: { length: 10 }, scrollHeight: 400, clientHeight: 200,
    classList: { remove() { lista.aberta = false; }, contains: () => lista.aberta },
    querySelectorAll: () => ({ length: 10 }),
  };
  const ctx = vm.createContext({
    LATERAL_MQ: { matches: true },
    document: { querySelector: () => botao, getElementById: () => lista },
  });
  vm.runInContext(`${extrair('function textoVer10(')}${extrair('function atualizarVer10(')}`, ctx);
  ctx.atualizarVer10('ranking-list', 10);
  assert.deepStrictEqual([botao.hidden, botao.textContent], [false, 'Ver todos →'], 'lateral: não coube tudo');
  lista.scrollHeight = 200;
  ctx.atualizarVer10('ranking-list', 10);
  assert.strictEqual(botao.hidden, true, 'lateral: coube tudo, sem botão');
  ctx.LATERAL_MQ.matches = false;
  ctx.atualizarVer10('ranking-list', 10);
  assert.deepStrictEqual([botao.hidden, botao.textContent], [false, 'Ver os 10 →'], 'tablet/celular: 3 + Ver os 10');
  ctx.atualizarVer10('ranking-list', 3);
  assert.strictEqual(botao.hidden, true);
});

caso('tabela: Veloc. centralizada com a seta fora do eixo; ≥1024 Tipo só ícone e Cor só ponto', () => {
  assert.ok(PAINEL.includes('<th scope="col" class="c-vel cen" title="Velocidade (km/h)">Veloc.</th>'));
  assert.ok(PAINEL.includes('<th scope="col" class="c-cor c-ic" title="Cor do veículo">Cor</th>'));
  assert.ok(PAINEL.includes('<th scope="col" class="c-tipo c-ic" title="Tipo de cadastro">Tipo</th>'));
  assert.ok(/\.tb \.v \.v-seta \{ position: absolute; right: calc\(100% \+ 4px\);/.test(CSS));
  const largo = blocoMedia('@media (min-width: 1024px) {', CSS.indexOf('/* ≥1.024 px: Tipo só com o ícone'));
  assert.ok(largo.includes('.tb .tp .tx, .tb .cor .tx { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0);'));
  assert.ok(largo.includes('.tb .c-cor, .tb .c-tipo { text-align: center; }'));
  // O nome do tipo segue no title e no texto (oculto só da vista)
  const ctx = vm.createContext({
    esc: textoSeguro.esc, placaLib, vinculoPlacaLib, unidadeLib, unidadesLista: [], podeEditarVeiculos: () => false,
    indiceVinculos: vinculoPlacaLib.indexarVinculos([{ id: 'v1', placa: 'TST1A11', tipo_pessoa: 'morador', nome_morador: 'Fulano', vigente_desde: null, encerrado_em: null }]),
  });
  ['function botaoFiltro(', 'function nomeUnidade(', 'function vinculoDaPassagem(', 'function icoTipo(', 'function celulasCadastro(']
    .forEach((f) => vm.runInContext(extrair(f), ctx));
  const html = ctx.celulasCadastro({ placa: 'TST1A11', timestamp: '2026-10-24T12:00:00Z' }, 0);
  assert.ok(html.includes('title="Morador"><svg class="ico"') && html.includes('<span class="tx">Morador</span>'));
});

caso('topo sem o seletor de período; o resto igual', () => {
  const topo = PAINEL.slice(PAINEL.indexOf('<header class="topbar" id="topo">'), PAINEL.indexOf('</header>'));
  assert.ok(!topo.includes('seg-periodo'));
  ['id="cameras-status"', 'id="ultima-atualizacao"', 'id="btn-topbar-veiculos"', 'data-seletor-tema', 'id="conta-btn"']
    .forEach((t) => assert.ok(topo.includes(t), t));
});

console.log(`\n${passou} casos ok`);
