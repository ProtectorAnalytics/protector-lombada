/**
 * Regra: toda atualização publica a versão em todos os lugares e ganha
 * novidade + aviso na tela. Se algum ponto não bater, o CI falha.
 * Uso: node test/versao-novidades.test.js
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const novidades = require('../site/js/novidades-atual');

const ler = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const { versao } = novidades;

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

caso('package.json tem a mesma versão do aviso de novidades', () => {
  assert.strictEqual(JSON.parse(ler('package.json')).version, versao,
    'suba a versão em site/js/novidades-atual.js junto com o package.json');
});

caso('rodapés do painel mostram a versão atual (e só ela)', () => {
  const html = ler('dashboard/index.html');
  const versoes = [...html.matchAll(/v(\d+\.\d+\.\d+) &middot;|&middot; v(\d+\.\d+\.\d+)/g)]
    .map((m) => m[1] || m[2]);
  assert.ok(versoes.length >= 2, 'rodapés de versão não encontrados');
  versoes.forEach((v) => assert.strictEqual(v, versao));
});

caso('manuais mostram a versão atual', () => {
  ['dashboard/manual.html', 'admin/manual-usuario.html'].forEach((arq) => {
    assert.ok(ler(arq).includes(`v${versao} |`), `${arq} sem v${versao}`);
  });
});

caso('a primeira novidade da página é a versão atual', () => {
  const primeira = ler('dashboard/novidades.html').match(/class="release-date">[^<]*versão (\d+\.\d+\.\d+)/);
  assert.ok(primeira, 'nenhum card de novidade encontrado');
  assert.strictEqual(primeira[1], versao, 'falta o card desta versão em dashboard/novidades.html');
});

caso('o aviso tem data, título e itens', () => {
  assert.match(novidades.data, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(novidades.titulo.length > 0);
  assert.ok(novidades.itens.length > 0);
});

caso('o painel carrega o aviso de novidades', () => {
  assert.ok(ler('dashboard/index.html').includes('<script src="/js/novidades-atual.js"></script>'));
});

console.log(`\n${passou} casos ok`);
