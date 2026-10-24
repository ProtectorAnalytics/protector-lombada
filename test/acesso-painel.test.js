/**
 * Qual condomínio o painel abre: síndico/operador sempre o próprio; a equipe
 * Protector (super_admin) o escolhido em ?cliente=<uuid>.
 * Uso: node test/acesso-painel.test.js
 */
const assert = require('node:assert');
const {
  ehUuid, clienteDaUrl, resolverAcesso, comCliente, urlDoPainel, podeEditarVeiculos,
} = require('../site/js/acesso-painel');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

const UUID = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b';
const OUTRO = '00000000-0000-4000-8000-00000000abcd';

// ---- podeEditarVeiculos (Parte 1: a portaria só consulta; o cadastro dela vem na Parte 2)
caso('portaria não edita veículos no painel; os demais perfis editam', () => {
  assert.strictEqual(podeEditarVeiculos('portaria'), false);
  ['admin_cliente', 'operador', 'super_admin', undefined, null].forEach((r) => {
    assert.strictEqual(podeEditarVeiculos(r), true, String(r));
  });
});

// ---- ehUuid
caso('aceita UUID em minúsculas e maiúsculas', () => {
  assert.strictEqual(ehUuid(UUID), true);
  assert.strictEqual(ehUuid(UUID.toUpperCase()), true);
});
caso('recusa texto que não é UUID', () => {
  ['', 'abc', `${UUID}x`, `'; drop table x;--`, '3f2b8c1e9a4d4e6f8b2a1c3d5e7f9a0b'].forEach((v) => {
    assert.strictEqual(ehUuid(v), false, v);
  });
});
caso('recusa o que não é texto (array vindo de ?a=1&a=2, nulo, número)', () => {
  [null, undefined, 42, [UUID], {}].forEach((v) => assert.strictEqual(ehUuid(v), false));
});

// ---- clienteDaUrl
caso('lê ?cliente= da query string', () => {
  assert.strictEqual(clienteDaUrl(`?cliente=${UUID}&de=2026-10-01`), UUID);
});
caso('sem ?cliente devolve nulo', () => {
  assert.strictEqual(clienteDaUrl('?de=2026-10-01'), null);
  assert.strictEqual(clienteDaUrl(''), null);
});
caso('normaliza para minúsculas', () => {
  assert.strictEqual(clienteDaUrl(`?cliente=${UUID.toUpperCase()}`), UUID);
});

// ---- resolverAcesso
caso('síndico abre o próprio condomínio', () => {
  assert.deepStrictEqual(
    resolverAcesso({ role: 'admin_cliente', parametro: null }),
    { modo: 'proprio' });
});
caso('síndico com ?cliente de outro condomínio: o parâmetro é ignorado', () => {
  assert.deepStrictEqual(
    resolverAcesso({ role: 'admin_cliente', parametro: OUTRO }),
    { modo: 'proprio' });
  assert.deepStrictEqual(
    resolverAcesso({ role: 'operador', parametro: OUTRO }),
    { modo: 'proprio' });
});
caso('perfil desconhecido ou ausente nunca vira admin', () => {
  assert.deepStrictEqual(resolverAcesso({ role: undefined, parametro: UUID }), { modo: 'proprio' });
  assert.deepStrictEqual(resolverAcesso({}), { modo: 'proprio' });
});
caso('admin com ?cliente válido abre aquele condomínio', () => {
  assert.deepStrictEqual(
    resolverAcesso({ role: 'super_admin', parametro: UUID }),
    { modo: 'admin', clienteId: UUID });
});
caso('admin sem ?cliente volta ao /admin para escolher', () => {
  assert.deepStrictEqual(
    resolverAcesso({ role: 'super_admin', parametro: null }),
    { modo: 'ir-admin', motivo: 'sem-cliente' });
});
caso('admin com ?cliente inválido volta ao /admin com aviso', () => {
  assert.deepStrictEqual(
    resolverAcesso({ role: 'super_admin', parametro: 'nao-e-uuid' }),
    { modo: 'ir-admin', motivo: 'cliente-invalido' });
});

// ---- comCliente: o ?cliente sobrevive à reescrita da URL pelos filtros
caso('acrescenta cliente na frente dos filtros', () => {
  assert.strictEqual(comCliente('de=2026-10-01&placa=ABC1D23', UUID),
    `cliente=${UUID}&de=2026-10-01&placa=ABC1D23`);
});
caso('sem filtros, fica só o cliente', () => {
  assert.strictEqual(comCliente('', UUID), `cliente=${UUID}`);
});
caso('sem cliente (síndico), a query string não muda', () => {
  assert.strictEqual(comCliente('de=2026-10-01', null), 'de=2026-10-01');
  assert.strictEqual(comCliente('', null), '');
});
caso('cliente inválido não entra na URL', () => {
  assert.strictEqual(comCliente('de=2026-10-01', 'x&placa=1'), 'de=2026-10-01');
});

// ---- urlDoPainel: trocar de condomínio é navegação completa, sem filtros
caso('monta a URL do painel do condomínio', () => {
  assert.strictEqual(urlDoPainel(UUID), `/dashboard?cliente=${UUID}`);
});
caso('id inválido leva ao /admin', () => {
  assert.strictEqual(urlDoPainel('javascript:alert(1)'), '/admin');
});

// ---- podeVerQuadroPc: link "Quadro para o PC da portaria" (v1.17)
caso('síndico, operador e equipe Protector veem o link do quadro; portaria e desconhecido não', () => {
  const { podeVerQuadroPc } = require('../site/js/acesso-painel');
  assert.strictEqual(podeVerQuadroPc('admin_cliente'), true);
  assert.strictEqual(podeVerQuadroPc('operador'), true);
  assert.strictEqual(podeVerQuadroPc('super_admin'), true);
  assert.strictEqual(podeVerQuadroPc('portaria'), false);
  assert.strictEqual(podeVerQuadroPc(undefined), false);
});

console.log(`\n${passou} casos passaram`);
