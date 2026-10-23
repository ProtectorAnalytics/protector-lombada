/**
 * Telas do módulo portaria (parte 1): funções puras extraídas do <script>
 * inline de admin/index.html e dashboard/index.html, e conferência estática
 * de que o navegador só pede ao banco as colunas que o grant libera.
 * Uso: node test/portaria-telas.test.js
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ler = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const ADMIN = ler('admin/index.html');
const PAINEL = ler('dashboard/index.html');
const MIGRATION = ler('sql/migration-portaria-base.sql');
const TESTE_SQL = ler('test/sql/portaria-base.sql');

/** Recorta a declaração que começa em `inicio` até a chave que fecha a primeira chave aberta. */
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

let passou = 0;
let falhou = 0;
function caso(nome, fn) {
  try { fn(); passou++; console.log(`ok - ${nome}`); }
  catch (e) { falhou++; console.log(`FALHOU - ${nome}\n  ${e.message.split('\n').join('\n  ')}`); }
}

const UNIDADES = [{ id: 'u1', nome: 'Casa 1' }, { id: 'u2', nome: 'Casa 2' }];

// ---- M6: nome da unidade no painel
caso('painel: nome da lista (unidade_id) vale mais que o texto livre antigo', () => {
  const nomeUnidade = new Function('unidadesLista', `${extrair(PAINEL, 'function nomeUnidade(')}; return nomeUnidade;`)(UNIDADES);
  assert.strictEqual(nomeUnidade({ unidade: 'Texto velho', unidade_id: 'u2' }), 'Casa 2');
  assert.strictEqual(nomeUnidade({ unidade: 'Texto velho', unidade_id: 'removida' }), 'Texto velho');
  assert.strictEqual(nomeUnidade({ unidade: 'Só texto' }), 'Só texto');
  assert.strictEqual(nomeUnidade({}), '');
  assert.strictEqual(nomeUnidade(null), '');
});

// ---- M6/M9: o que o admin manda de unidade ao salvar
const camposUnidade = new Function(`${extrair(ADMIN, 'function camposUnidadeDoVeiculo(')}; return camposUnidadeDoVeiculo;`)();

caso('admin: unidade não mexida (inclusive removida) não vai no corpo', () => {
  assert.deepStrictEqual(camposUnidade('removida', { unidade_id: 'removida' }, UNIDADES), {});
  assert.deepStrictEqual(camposUnidade('u1', { unidade_id: 'u1' }, UNIDADES), {});
  assert.deepStrictEqual(camposUnidade('', { unidade_id: null, unidade: 'Antiga' }, UNIDADES), {});
});

caso('admin: unidade escolhida vai com o nome da lista (o texto antigo não fica)', () => {
  assert.deepStrictEqual(camposUnidade('u2', { unidade_id: 'u1', unidade: 'Casa 1' }, UNIDADES), { unidade_id: 'u2', unidade: 'Casa 2' });
  assert.deepStrictEqual(camposUnidade('u1', { unidade_id: null, unidade: 'Antiga' }, UNIDADES), { unidade_id: 'u1', unidade: 'Casa 1' });
  assert.deepStrictEqual(camposUnidade('u1', null, UNIDADES), { unidade_id: 'u1', unidade: 'Casa 1' });
});

caso('admin: "sem unidade" escolhido limpa unidade_id e texto', () => {
  assert.deepStrictEqual(camposUnidade('', { unidade_id: 'u1', unidade: 'Casa 1' }, UNIDADES), { unidade_id: null, unidade: null });
});

caso('admin: unidade atual fora da lista aparece no select como "(removida)"', () => {
  const opcoes = new Function('esc', `${extrair(ADMIN, 'function opcoesUnidadeVeiculo(')}; return opcoesUnidadeVeiculo;`)((s) => String(s));
  const html = opcoes({ unidade_id: 'sumiu', unidade: 'Casa 9' }, UNIDADES);
  assert.ok(html.includes('value="sumiu" selected'), html);
  assert.ok(html.includes('Casa 9 (removida)'), html);
  assert.ok(opcoes({ unidade_id: 'sumiu' }, UNIDADES).includes('Unidade removida'));
  assert.ok(!opcoes({ unidade_id: 'u1' }, UNIDADES).includes('removida'));
  assert.ok(opcoes({ unidade_id: 'u1' }, UNIDADES).includes('value="u1" selected'));
});

// ---- M7: resumo da lista de unidades/porteiros
caso('admin: resumo conta as ignoradas (array) e lista quais', () => {
  const resumo = new Function(`${extrair(ADMIN, 'function resumoListaPortaria(')}; return resumoListaPortaria;`)();
  assert.strictEqual(resumo({ criadas: 2, ja_existiam: 1, ignoradas: [] }), '2 criadas · 1 já existiam · 0 ignoradas');
  assert.strictEqual(resumo({ criadas: 0, ja_existiam: 0, ignoradas: ['A'.repeat(61), 'B'] }),
    `0 criadas · 0 já existiam · 2 ignoradas (nome longo demais): ${'A'.repeat(61)}, B`);
  assert.strictEqual(resumo({ criadas: 1, ja_existiam: 0 }), '1 criadas · 0 já existiam · 0 ignoradas');
});

// ---- I2/I3: colunas pedidas pelo navegador = colunas concedidas
const colunasDoGrant = (tabela) => {
  const m = MIGRATION.match(new RegExp(`grant select \\(([^)]*)\\)\\s+on public\\.${tabela} to authenticated`));
  assert.ok(m, `grant por coluna de ${tabela} não encontrado na migration`);
  return new Set(m[1].split(',').map((c) => c.trim()));
};

caso('navegador não faz select("*") em clientes nem cameras', () => {
  for (const [nome, fonte] of [['dashboard', PAINEL], ['admin', ADMIN]]) {
    const ruins = fonte.match(/from\(['"](clientes|cameras)['"]\)\s*\.select\(\s*['"]\*['"]/g);
    assert.strictEqual(ruins, null, `${nome}: ${ruins}`);
  }
});

caso('COLUNAS_CLIENTE_PAINEL ⊆ grant de clientes e copiada no teste SQL', () => {
  const m = PAINEL.match(/const COLUNAS_CLIENTE_PAINEL = '([^']+)'/);
  assert.ok(m, 'COLUNAS_CLIENTE_PAINEL não encontrada');
  const grant = colunasDoGrant('clientes');
  m[1].split(',').map((c) => c.trim()).forEach((c) => assert.ok(grant.has(c), `clientes.${c} fora do grant`));
  assert.ok(TESTE_SQL.includes(`select ${m[1]}\n`), 'teste SQL não usa a mesma lista de colunas do painel');
  ['notif_emails', 'emails_notificacao', 'telefone', 'contato_nome', 'cnpj', 'user_id', 'cep', 'endereco']
    .forEach((c) => assert.ok(!grant.has(c), `clientes.${c} sensível no grant`));
});

caso('selects de cameras do painel ⊆ grant de cameras (sem token) e copiados no teste SQL', () => {
  const grant = colunasDoGrant('cameras');
  assert.ok(!grant.has('token'), 'cameras.token no grant');
  const selects = [...PAINEL.matchAll(/from\('cameras'\)\s*\.select\('([^']+)'\)/g)].map((x) => x[1]);
  assert.ok(selects.length >= 2, `achei ${selects.length} selects de cameras`);
  for (const s of selects) {
    s.split(',').map((c) => c.trim()).forEach((c) => assert.ok(grant.has(c), `cameras.${c} fora do grant`));
    assert.ok(TESTE_SQL.includes(`select ${s}\n`), `teste SQL sem o select de cameras "${s}"`);
  }
});

// ---- Task 7: perfil portaria só consulta; ganha atalho para a página da portaria
caso('painel: portaria não vê "É a mesma placa"/"É outro carro"; quem edita vê', () => {
  const montar = (pode) => new Function('estadoSelo', 'podeEditarVeiculos', 'esc', 'htmlQuadroVeiculo',
    `${extrair(PAINEL, 'function htmlBaseVeiculo(')}; return htmlBaseVeiculo;`)(() => 'suspeita', () => pode, (s) => String(s), () => '');
  const args = [{ status: 'x' }, 'ABC1D23', { placa: 'ABC1D24', timestamp: 1 }];
  const porteiro = montar(false)(...args);
  assert.ok(!porteiro.includes('data-acao="mesma-placa"'), porteiro);
  assert.ok(!porteiro.includes('data-acao="outro-carro"'), porteiro);
  assert.ok(porteiro.includes('Verificar leitura'), 'o aviso de suspeita continua visível');
  const sindico = montar(true)(...args);
  assert.ok(sindico.includes('data-acao="mesma-placa"') && sindico.includes('data-acao="outro-carro"'));
});

caso('painel: link "Abrir a portaria" só para o perfil portaria', () => {
  assert.match(PAINEL, /<a [^>]*id="conta-portaria"[^>]*href="\/portaria"[^>]*hidden|<a [^>]*href="\/portaria"[^>]*id="conta-portaria"[^>]*hidden/);
  assert.ok(PAINEL.includes('Abrir a portaria'));
  const fn = extrair(PAINEL, 'function aplicarPermissaoVeiculos(');
  assert.ok(/conta-portaria/.test(fn), 'aplicarPermissaoVeiculos não controla o link');
  const el = { hidden: true };
  const rodar = (role) => {
    el.hidden = true;
    new Function('document', 'podeEditarVeiculos', 'currentProfile',
      `${fn}; aplicarPermissaoVeiculos();`)(
      { getElementById: (id) => (id === 'conta-portaria' ? el : { hidden: false }) },
      () => role !== 'portaria', { role });
    return el.hidden;
  };
  assert.strictEqual(rodar('portaria'), false);
  assert.strictEqual(rodar('sindico'), true);
});

console.log(`${passou} casos passaram${falhou ? `, ${falhou} falharam` : ''}`);
if (falhou) process.exit(1);
