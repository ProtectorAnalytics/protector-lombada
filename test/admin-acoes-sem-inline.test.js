/**
 * Admin: as listas de clientes, câmeras e veículos não levam dado do registro
 * (nome, placa, id) para JS inline (onclick). Cada ação vai num data-*-acao com
 * o id escapado, e um ouvinte delegado busca o registro pelo id na lista
 * carregada. Dados fictícios. Uso: node test/admin-acoes-sem-inline.test.js
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ADMIN = fs.readFileSync(path.join(__dirname, '..', 'admin', 'index.html'), 'utf8');

function extrair(fonte, inicio) {
  const i = fonte.indexOf(inicio);
  if (i < 0) throw new Error(`não achei "${inicio}"`);
  let nivel = 0;
  for (let j = fonte.indexOf('{', i); j < fonte.length; j++) {
    if (fonte[j] === '{') nivel++;
    else if (fonte[j] === '}' && --nivel === 0) return fonte.slice(i, j + 1);
  }
  throw new Error(`chaves desbalanceadas em "${inicio}"`);
}

const MAU = "x');alert(document.cookie);('";
const ID = '33333333-3333-4333-8333-333333333333';

function renderizar(funcoes, chamada, dados) {
  const corpos = {};
  const document = {
    getElementById: (id) => (corpos[id] ||= { innerHTML: '', value: '' }),
  };
  const codigo = [extrair(ADMIN, 'function esc('), extrair(ADMIN, 'function fmtDate('),
    ...funcoes.map((f) => extrair(ADMIN, f)), chamada].join('\n');
  const nomes = Object.keys(dados);
  new Function('document', ...nomes, codigo)(document, ...nomes.map((n) => dados[n]));
  return corpos;
}

function semHandlerInline(html, rotulo) {
  const handlers = [...html.matchAll(/\bon\w+="([^"]*)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(handlers, [], `${rotulo}: nenhum handler inline`);
  assert.ok(!html.includes("'"), `${rotulo}: apóstrofo cru no HTML`);
}

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

caso('lista de clientes: ações sem dado do cliente em onclick', () => {
  const c = { id: ID, nome: MAU, cidade_uf: 'Cidade/UF', ativo: true, limite_velocidade: 30, cameras: [{ count: 1 }] };
  const { 'clientes-body': { innerHTML } } = renderizar(['function renderClientes('], 'renderClientes();', {
    clientesData: [c], acessoPainel: { urlDoPainel: () => '/dashboard/' },
  });
  for (const acao of ['abrir', 'editar', 'desativar', 'excluir']) assert.ok(innerHTML.includes(`data-cli-acao="${acao}"`), acao);
  semHandlerInline(innerHTML, 'clientes');
});

caso('tabela de clientes do início: abrir pelo data-id, sem onclick', () => {
  const html = extrair(ADMIN, 'async function loadDashboard(');
  const trecho = html.slice(html.indexOf('// === TABELA CLIENTES ==='), html.indexOf('// === ÚLTIMAS CAPTURAS ==='));
  assert.doesNotMatch(trecho, /onclick=/);
  assert.match(trecho, /data-cli-acao="abrir"/);
});

caso('lista de câmeras: ações sem dado da câmera em onclick', () => {
  const cam = { id: ID, nome: MAU, nome_exibicao: MAU, serial_number: 'SN-TESTE', ativa: true, criado_em: '2026-10-01T10:00:00Z' };
  const { 'cameras-body': { innerHTML } } = renderizar(['function renderCameras('], 'renderCameras();', {
    camerasData: [cam], cameraStatus: () => ({ color: '#999999', label: 'Offline' }),
  });
  for (const acao of ['editar', 'desativar', 'excluir']) assert.ok(innerHTML.includes(`data-cam-acao="${acao}"`), acao);
  semHandlerInline(innerHTML, 'câmeras');
});

caso('lista de veículos: ações sem placa nem id em onclick', () => {
  const v = { id: ID, placa: 'ABC1234', nome_morador: MAU, unidade: MAU, tipo_pessoa: 'morador', marca: MAU, cor: MAU, encerrado_em: null };
  const { 'veiculos-body': { innerHTML } } = renderizar(['function unidadeDoVeiculo(', 'function renderVeiculos('], 'renderVeiculos();', {
    veiculosData: [v], unidadesData: [], unidadeLib: { rotuloUnidade: () => '' }, seloTipoPessoa: () => '<span>Morador</span>',
  });
  for (const acao of ['editar', 'encerrar']) assert.ok(innerHTML.includes(`data-vei-acao="${acao}"`), acao);
  semHandlerInline(innerHTML, 'veiculos');
});

caso('nenhum onclick do admin leva nome ou placa de registro', () => {
  assert.doesNotMatch(ADMIN, /onclick="[^"]*\$\{[^}]*\.(nome|placa|email)\b/);
  assert.doesNotMatch(ADMIN, /onclick="(deleteCliente|deleteCamera|encerrarVinculo|toggleCliente|toggleCamera)\(/);
});

caso('ouvintes delegados buscam o registro pelo id na lista carregada', () => {
  assert.match(ADMIN, /closest\('#clientes-body \[data-cli-acao\], #dash-clientes-body \[data-cli-acao\]'\)/);
  assert.match(ADMIN, /closest\('#cameras-body \[data-cam-acao\]'\)/);
  assert.match(ADMIN, /closest\('#veiculos-body \[data-vei-acao\]'\)/);
  assert.match(ADMIN, /camerasData\.find\(\(x\) => x\.id === botao\.dataset\.id\)/);
  assert.match(ADMIN, /veiculosData\.find\(\(x\) => x\.id === botao\.dataset\.id\)/);
});

console.log(`\n${passou} casos ok`);
