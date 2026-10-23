/**
 * Regras do "Editar cadastro" (vínculo alvo e corpo do PUT) e a ligação no painel.
 * Uso: node test/edicao-cadastro.test.js
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { alvoEdicao, unidadeDaEdicao, montarEdicao, urlEdicao, ERRO_TIPO, ERRO_NOME } = require('../site/js/edicao-cadastro');
const { podeEditarVeiculos, podeVerHistorico } = require('../site/js/acesso-painel');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

const VIGENTE = { id: 'v2', encerrado_em: null, unidade_id: 'u1', unidade: 'Casa 1' };
const ANTIGO = { id: 'v1', encerrado_em: '2026-01-01T00:00:00Z' };

// ---- alvoEdicao
caso('quadro mostra o vínculo vigente → "Editar cadastro" nele', () => {
  assert.deepStrictEqual(alvoEdicao(VIGENTE, VIGENTE), { vinculo: VIGENTE, titulo: 'Editar cadastro' });
});
caso('quadro mostra vínculo antigo → edita o vigente e avisa "Editar cadastro atual"', () => {
  assert.deepStrictEqual(alvoEdicao(ANTIGO, VIGENTE), { vinculo: VIGENTE, titulo: 'Editar cadastro atual' });
});
caso('sem vínculo vigente → sem edição', () => {
  assert.strictEqual(alvoEdicao(ANTIGO, null), null);
  assert.strictEqual(alvoEdicao(null, null), null);
  assert.strictEqual(alvoEdicao(ANTIGO, { id: 'x', encerrado_em: '2026-01-01' }), null);
  assert.strictEqual(alvoEdicao(null, {}), null);
});

// ---- unidadeDaEdicao
caso('lista: unidade escolhida vai com id e rótulo', () => {
  assert.deepStrictEqual(unidadeDaEdicao(VIGENTE, { lista: true, valor: 'u2', rotulo: 'Casa 2' }), { unidade_id: 'u2', unidade: 'Casa 2' });
});
caso('lista: "Sem unidade" limpa só quando havia unidade da lista', () => {
  assert.deepStrictEqual(unidadeDaEdicao(VIGENTE, { lista: true, valor: '' }), { unidade_id: null, unidade: null });
  assert.deepStrictEqual(unidadeDaEdicao({ unidade: 'Bloco A antigo' }, { lista: true, valor: '' }), {});
});
caso('texto livre igual ao atual não mexe; diferente troca o rótulo', () => {
  assert.deepStrictEqual(unidadeDaEdicao({ unidade: 'Bloco A' }, { lista: false, valor: ' Bloco A ' }), {});
  assert.deepStrictEqual(unidadeDaEdicao({ unidade: 'Bloco A' }, { lista: false, valor: 'Bloco B' }), { unidade: 'Bloco B', unidade_id: null });
  assert.deepStrictEqual(unidadeDaEdicao({ unidade: 'Bloco A' }, { lista: false, valor: '' }), { unidade: null, unidade_id: null });
});

// ---- montarEdicao
caso('tipo e nome são obrigatórios (mesmas mensagens do cadastro)', () => {
  assert.deepStrictEqual(montarEdicao(VIGENTE, { nome_morador: 'N' }), { erro: ERRO_TIPO, campo: 'tipo_pessoa' });
  assert.deepStrictEqual(montarEdicao(VIGENTE, { tipo_pessoa: 'morador', nome_morador: '  ' }), { erro: ERRO_NOME, campo: 'nome_morador' });
});
caso('corpo do PUT: tipo, nome, unidade, marca e cor (vazio = nulo), sem placa nem id', () => {
  const r = montarEdicao(VIGENTE, {
    tipo_pessoa: 'prestador', nome_morador: ' Prestador Teste ', marca: '', cor: ' Prata ',
    unidade: { lista: true, valor: 'u2', rotulo: 'Casa 2' },
  });
  assert.deepStrictEqual(r, { corpo: { tipo_pessoa: 'prestador', nome_morador: 'Prestador Teste', unidade_id: 'u2', unidade: 'Casa 2', marca: null, cor: 'Prata' } });
});
caso('urlEdicao codifica o id', () => {
  assert.strictEqual(urlEdicao('f0000000-0000-4000-8000-000000000001'), '/api/admin/veiculos?id=f0000000-0000-4000-8000-000000000001');
  assert.strictEqual(urlEdicao('a&b=c'), '/api/admin/veiculos?id=a%26b%3Dc');
});

// ---- quem vê os botões
caso('Editar e Histórico: síndico, operador e equipe Protector; portaria e só-e-mail não', () => {
  ['admin_cliente', 'operador', 'super_admin'].forEach((r) => {
    assert.strictEqual(podeEditarVeiculos(r), true, r);
    assert.strictEqual(podeVerHistorico(r), true, r);
  });
  ['portaria', 'so_email', undefined, null].forEach((r) => assert.strictEqual(podeVerHistorico(r), false, String(r)));
  assert.strictEqual(podeEditarVeiculos('portaria'), false);
});

// ---- ligação estática no painel
const html = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'index.html'), 'utf8');
caso('painel carrega as libs de edição e histórico', () => {
  assert.ok(html.includes('<script src="/js/edicao-cadastro.js"></script>'));
  assert.ok(html.includes('<script src="/js/historico-cadastro.js"></script>'));
});
caso('detalhes da passagem: botão "Editar cadastro" com data-acao, ligado por addEventListener', () => {
  assert.match(html, /class="btn-zoom" data-acao="editar-cadastro"/);
  assert.match(html, /querySelector\('\[data-acao="editar-cadastro"\]'\)/);
  assert.match(html, /data-acao="ver-historico-placa"/);
});
caso('lista de veículos: botão "Editar" com data-acao (sem dado em onclick)', () => {
  assert.match(html, /class="vm-li-edit" data-acao="editar-veiculo"/);
  assert.ok(!/editar[^"]*" onclick=/.test(html), 'edição não usa onclick');
});
caso('uma só função de salvar a edição, usada nos dois lugares, com PUT', () => {
  assert.strictEqual((html.match(/async function salvarEdicaoCadastro\(/g) || []).length, 1);
  assert.match(html, /edicaoCadastroLib\.urlEdicao\(vinculo\.id\), 'PUT'/);
  assert.ok((html.match(/abrirFormEdicao\(/g) || []).length >= 3, 'formulário compartilhado usado no modal e na lista');
});
caso('aba "Histórico de alterações" no modal de veículos', () => {
  assert.match(html, /id="vm-tab-historico"/);
  assert.match(html, /id="vm-body-historico"/);
  assert.match(html, /\/api\/admin\/historico-cadastros\?/);
});

console.log(`\n${passou} casos ok`);
