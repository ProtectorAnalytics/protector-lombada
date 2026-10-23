/**
 * Testes de site/js/usuario-portaria.js.
 * Uso: node test/usuario-portaria.test.js
 */
const assert = require('node:assert');
const lib = require('../site/js/usuario-portaria');
const { DOMINIO, normalizarUsuario, usuarioValido, emailDoUsuario, usuarioDoEmail, paraLogin, sugerirUsuario, erroSenhaPorteiro, SENHA_MIN_PORTEIRO, recuperacaoDePorteiro, MSG_RECUPERACAO_PORTEIRO } = lib;

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


// ---------------------------------------------------------------- senha do porteiro
const QUEM = { usuario: 'jose.castelo', nome: 'José da Silva' };

caso('senha forte: aceita 10+ caracteres com letra e número, sem usuário nem nome', () => {
  assert.strictEqual(SENHA_MIN_PORTEIRO, 10);
  assert.strictEqual(erroSenhaPorteiro('Portao7Azul', QUEM), null);
  assert.strictEqual(erroSenhaPorteiro('girassol42', QUEM), null);
  assert.strictEqual(erroSenhaPorteiro('Mar4ndré9x', QUEM), null);
  assert.strictEqual(erroSenhaPorteiro('girassol42'), null, 'sem contexto também funciona');
});

caso('senha forte: menos de 10 caracteres ou tipo errado → mínimo', () => {
  assert.match(erroSenhaPorteiro('abc12345x', QUEM), /pelo menos 10 caracteres/);
  assert.match(erroSenhaPorteiro('', QUEM), /pelo menos 10/);
  assert.match(erroSenhaPorteiro(undefined, QUEM), /pelo menos 10/);
  assert.match(erroSenhaPorteiro(1234567890, QUEM), /pelo menos 10/);
});

caso('senha forte: limite de 72 bytes (UTF-8), não de caracteres', () => {
  assert.strictEqual(erroSenhaPorteiro(`a1${'b'.repeat(70)}`, QUEM), null, '72 bytes passa');
  assert.match(erroSenhaPorteiro(`a1${'b'.repeat(71)}`, QUEM), /longa/);
  // 40 caracteres, mas "ç" ocupa 2 bytes: 2 + 38*2 = 78 bytes
  assert.match(erroSenhaPorteiro(`a1${'ç'.repeat(38)}`, QUEM), /longa/);
});

caso('senha forte: precisa de letra e de número', () => {
  assert.match(erroSenhaPorteiro('9876543210', QUEM), /letras e números/);
  assert.match(erroSenhaPorteiro('girassolazul', QUEM), /letras e números/);
  assert.match(erroSenhaPorteiro('!!!!!!!!!!1', QUEM), /letras e números/);
});

caso('senha forte: não pode conter o usuário, partes dele ou o primeiro nome', () => {
  for (const s of ['jose.castelo1', 'castelo2026', 'Jose12345678', 'xxJOSÉ99yyzz', 'CaStElO-7788']) {
    assert.match(erroSenhaPorteiro(s, QUEM), /nome/, s);
  }
  // partes com menos de 3 letras não contam
  assert.strictEqual(erroSenhaPorteiro('ze1234567890', { usuario: 'ze.mar', nome: 'Zé' }), null);
  // nome (não o usuário) também conta, sem acento e sem diferença de maiúsculas
  assert.match(erroSenhaPorteiro('ANTONIA2026x', { usuario: 'toninha.mar', nome: 'Antônia Lima' }), /nome/);
});

caso('senha forte: recusa senhas comuns (normalizadas)', () => {
  for (const s of ['portaria123', 'Portaria123', '1234567890', 'senha12345', 'SENHA12345', 'mudar12345', 'qwerty1234', 'abc1234567', 'Portaria-123']) {
    assert.ok(erroSenhaPorteiro(s, QUEM), s);
  }
  assert.match(erroSenhaPorteiro('qwerty1234', QUEM), /comum/);
  assert.match(erroSenhaPorteiro('Mudar12345', QUEM), /comum/);
});

// ---------------------------------------------------------------- recuperação de senha
caso('recuperação: usuário sem @ ou e-mail técnico do porteiro não pede link ao Auth', () => {
  assert.strictEqual(recuperacaoDePorteiro('jose.castelo'), true);
  assert.strictEqual(recuperacaoDePorteiro(' Jose.Castelo@Porteiro.Invalid '), true);
  assert.strictEqual(recuperacaoDePorteiro('x@porteiro.invalid'), true);
  assert.strictEqual(recuperacaoDePorteiro('sindico@cond.com'), false);
  assert.strictEqual(recuperacaoDePorteiro('ana@porteiro.invalid.com.br'), false);
  assert.strictEqual(MSG_RECUPERACAO_PORTEIRO, 'Porteiro: peça uma nova senha ao síndico ou à Protector.');
});

caso('recuperação: painel e admin checam antes de resetPasswordForEmail', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  for (const pagina of ['dashboard/index.html', 'admin/index.html']) {
    const h = fs.readFileSync(path.join(__dirname, '..', pagina), 'utf8');
    const ini = h.indexOf('async function doResetPassword()');
    assert.ok(ini > 0, pagina);
    const corpo = h.slice(ini, h.indexOf('resetPasswordForEmail', ini));
    assert.ok(corpo.includes('usuarioPortariaLib.recuperacaoDePorteiro(email)'), pagina);
    assert.ok(corpo.includes('usuarioPortariaLib.MSG_RECUPERACAO_PORTEIRO'), pagina);
    assert.ok(/recuperacaoDePorteiro\(email\)\) \{[\s\S]*?return;/.test(corpo), `${pagina}: para antes de chamar o Auth`);
  }
});

console.log(`\n${passou} casos passaram`);
