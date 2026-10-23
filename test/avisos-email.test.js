/**
 * avisos-email.js — regras de tela dos avisos por e-mail (Portaria 2.2).
 * Dados fictícios. Uso: node test/avisos-email.test.js
 */
const assert = require('node:assert');
const lib = require('../site/js/avisos-email');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

const u = (o) => ({
  id: 'id-1', nome: 'Fulano', email: 'fulano@exemplo.test', role: 'operador', ativo: true,
  recebe_alertas: false, recebe_relatorio: false, ...o,
});

caso('ROTULOS com os textos exatos', () => {
  assert.strictEqual(lib.ROTULOS.so_email, 'Só recebe e-mail');
  assert.strictEqual(lib.ROTULOS.recebe_alertas, 'Recebe alertas de excesso');
  assert.strictEqual(lib.ROTULOS.recebe_relatorio, 'Recebe relatório periódico');
  assert.ok(Object.isFrozen(lib.ROTULOS));
});

caso('validarContato aceita nome e e-mail válidos, normalizando', () => {
  const r = lib.validarContato({ nome: '  Maria Teste ', email: '  Maria@Exemplo.TEST ' });
  assert.deepStrictEqual(r, { corpo: { nome: 'Maria Teste', email: 'maria@exemplo.test' } });
});

caso('validarContato recusa nome vazio, nome > 80 e e-mail inválido', () => {
  const r = lib.validarContato({ nome: '   ', email: 'sem-arroba' });
  assert.ok(r.erros.nome);
  assert.ok(r.erros.email);
  assert.ok(!r.corpo);
  assert.ok(lib.validarContato({ nome: 'a'.repeat(81), email: 'a@b.test' }).erros.nome);
  assert.ok(lib.validarContato({ nome: 'a'.repeat(80), email: 'a@b.test' }).corpo);
  assert.ok(lib.validarContato({ nome: '​​', email: 'a@b.test' }).erros.nome);
  assert.ok(lib.validarContato({ nome: 'X', email: null }).erros.email);
});

caso('validarContato recusa o domínio técnico do porteiro', () => {
  assert.ok(lib.validarContato({ nome: 'X', email: 'jose@porteiro.invalid' }).erros.email);
});

caso('lista vazia mostra aviso', () => {
  assert.match(lib.htmlListaAvisos([], {}), /Nenhum/);
  assert.match(lib.htmlListaAvisos(null, {}), /Nenhum/);
});

caso('checkboxes com rótulos exatos e estado marcado', () => {
  const html = lib.htmlListaAvisos([u({ recebe_alertas: true })], {});
  assert.ok(html.includes('Recebe alertas de excesso'));
  assert.ok(html.includes('Recebe relatório periódico'));
  assert.match(html, /data-opcao="recebe_alertas"[^>]*checked/);
  assert.doesNotMatch(html, /data-opcao="recebe_relatorio"[^>]*checked/);
});

caso('selo "Só recebe e-mail" só no so_email; botões de contato só com podeEditarContato', () => {
  const lista = [u({ id: 'c1', role: 'so_email' }), u({ id: 'o1', role: 'operador' })];
  const sem = lib.htmlListaAvisos(lista, { podeEditarContato: false });
  assert.strictEqual(sem.split('Só recebe e-mail').length - 1, 1);
  assert.doesNotMatch(sem, /data-acao="editar"/);
  const com = lib.htmlListaAvisos(lista, { podeEditarContato: true });
  assert.match(com, /data-acao="editar" data-id="c1"/);
  assert.match(com, /data-acao="desativar" data-id="c1"/);
  assert.doesNotMatch(com, /data-acao="editar" data-id="o1"/);
});

caso('portaria e super_admin não mostram opções', () => {
  const html = lib.htmlListaAvisos([u({ id: 'p1', role: 'portaria', email: 'jose@porteiro.invalid' }), u({ id: 's1', role: 'super_admin' })], {});
  assert.doesNotMatch(html, /data-id="p1"/);
  assert.doesNotMatch(html, /data-opcao="recebe_alertas" data-id="s1"/);
});

caso('inativo aparece como Desativado, com Reativar no so_email', () => {
  const html = lib.htmlListaAvisos([u({ id: 'c9', role: 'so_email', ativo: false })], { podeEditarContato: true });
  assert.ok(html.includes('Desativado'));
  assert.match(html, /data-acao="reativar" data-id="c9"/);
});

caso('XSS: nome, e-mail e id escapados', () => {
  const html = lib.htmlListaAvisos([u({
    id: '"><img src=x onerror=alert(1)>', nome: '<script>alert(1)</script>', email: '"onmouseover="x@y.test', role: 'so_email',
  })], { podeEditarContato: true });
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('"onmouseover="'));
  assert.ok(html.includes('&lt;script&gt;'));
});

console.log(`\n${passou} casos ok`);
