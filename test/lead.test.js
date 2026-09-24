/**
 * Testes de validateLead (lib/lead.js).
 *
 * Regressão que motivou o arquivo: o formulário "Solicitar proposta" do site
 * mostrava "Enviado com sucesso!" sem enviar nada (havia só um TODO). Agora o
 * form faz POST em /api/lead, e esta validação decide o que é aceito.
 *
 * Uso: node test/lead.test.js
 */

const assert = require('node:assert');
const { validateLead } = require('../lib/lead');

const valido = {
  nome: 'Maria Souza',
  email: 'maria@exemplo.com',
  condominio: 'Residencial das Flores',
  cidade: 'Salvador - BA',
  mensagem: 'Temos 2 portarias.',
};

let passou = 0;
function caso(nome, fn) {
  fn();
  passou++;
  console.log(`ok - ${nome}`);
}

caso('aceita lead completo e devolve os campos limpos', () => {
  const r = validateLead(valido);
  assert.deepStrictEqual(r.errors, []);
  assert.strictEqual(r.lead.nome, 'Maria Souza');
  assert.strictEqual(r.lead.mensagem, 'Temos 2 portarias.');
});

caso('mensagem é opcional', () => {
  const r = validateLead({ ...valido, mensagem: undefined });
  assert.deepStrictEqual(r.errors, []);
  assert.strictEqual(r.lead.mensagem, '');
});

caso('rejeita form vazio listando todos os obrigatórios', () => {
  const r = validateLead({});
  assert.deepStrictEqual(r.errors.sort(), ['cidade', 'condominio', 'email', 'nome']);
});

caso('rejeita e-mail sem domínio', () => {
  assert.deepStrictEqual(validateLead({ ...valido, email: 'maria@' }).errors, ['email']);
});

caso('rejeita campos só com espaços', () => {
  assert.deepStrictEqual(validateLead({ ...valido, nome: '   ' }).errors, ['nome']);
});

caso('remove caracteres de controle e corta no limite', () => {
  const r = validateLead({ ...valido, nome: 'Ana\x00 Lima', mensagem: 'x'.repeat(5000) });
  assert.strictEqual(r.lead.nome, 'Ana Lima');
  assert.strictEqual(r.lead.mensagem.length, 2000);
});

caso('aceita body nulo sem lançar', () => {
  assert.strictEqual(validateLead(null).errors.length, 4);
});

console.log(`\n${passou} testes passaram`);
