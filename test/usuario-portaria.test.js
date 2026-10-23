/**
 * Testes de site/js/usuario-portaria.js.
 * Uso: node test/usuario-portaria.test.js
 */
const assert = require('node:assert');
const lib = require('../site/js/usuario-portaria');
const { DOMINIO, normalizarUsuario, usuarioValido, emailDoUsuario, usuarioDoEmail, paraLogin, sugerirUsuario } = lib;

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

caso('domínio técnico', () => assert.strictEqual(DOMINIO, 'porteiro.invalid'));

caso('normaliza: trim, minúsculas, sem acento, espaço vira ponto', () => {
  assert.strictEqual(normalizarUsuario('  José Silva '), 'jose.silva');
  assert.strictEqual(normalizarUsuario('AÇÃO  Rápida'), 'acao.rapida');
  assert.strictEqual(normalizarUsuario(null), '');
});

caso('usuário válido: 3 a 40, a-z 0-9 ponto, sem ponto nas pontas nem ".."', () => {
  assert.strictEqual(usuarioValido('jose.castelo'), true);
  assert.strictEqual(usuarioValido('abc'), true);
  assert.strictEqual(usuarioValido('ab'), false);
  assert.strictEqual(usuarioValido('.jose'), false);
  assert.strictEqual(usuarioValido('jose.'), false);
  assert.strictEqual(usuarioValido('jo..se'), false);
  assert.strictEqual(usuarioValido('Jose'), false);
  assert.strictEqual(usuarioValido('jo_se'), false);
  assert.strictEqual(usuarioValido('a'.repeat(40)), true);
  assert.strictEqual(usuarioValido('a'.repeat(41)), false);
  assert.strictEqual(usuarioValido(undefined), false);
});

caso('e-mail técnico de ida e volta', () => {
  assert.strictEqual(emailDoUsuario('jose.praia'), 'jose.praia@porteiro.invalid');
  assert.strictEqual(usuarioDoEmail('jose.praia@porteiro.invalid'), 'jose.praia');
  assert.strictEqual(usuarioDoEmail(' Jose.Praia@PORTEIRO.invalid '), 'jose.praia');
  assert.strictEqual(usuarioDoEmail('sindico@cond.com'), null);
  assert.strictEqual(usuarioDoEmail('..@porteiro.invalid'), null);
  assert.strictEqual(usuarioDoEmail(''), null);
});

caso('paraLogin aceita usuário sem @ e e-mail normal', () => {
  assert.strictEqual(paraLogin(' José.PraiaDoCastelo '), 'jose.praiadocastelo@porteiro.invalid');
  assert.strictEqual(paraLogin('Sindico@Cond.com '), 'sindico@cond.com');
});

caso('sugere primeiro nome + primeira palavra significativa do condomínio', () => {
  assert.strictEqual(sugerirUsuario('José Silva', 'CONDOMINIO PRAIA DO CASTELO'), 'jose.praia');
  assert.strictEqual(sugerirUsuario('Maria', 'Residencial do Loire'), 'maria.loire');
  assert.strictEqual(sugerirUsuario('Ana Paula', ''), 'ana');
  assert.strictEqual(sugerirUsuario('', 'Condomínio Aldeia'), 'aldeia');
});

console.log(`\n${passou} casos passaram`);
