/**
 * Validação da config editada no admin. Uso: node test/apiplacas-config.test.js
 */
const assert = require('node:assert');
const { validarConfig } = require('../lib/apiplacas-config');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

caso('aceita config válida e normaliza e-mails', () => {
  const r = validarConfig({ ativo: true, preco_consulta: '0,03', teto_mensal: 150, aviso_percentual: 80, saldo_minimo: 200,
    emails_aviso: [' Glauber@Appps.com.br ', 'suporte@appps.com.br', 'suporte@appps.com.br'] });
  assert.deepStrictEqual(r.erros, []);
  assert.strictEqual(r.config.preco_consulta, 0.03);
  assert.deepStrictEqual(r.config.emails_aviso, ['glauber@appps.com.br', 'suporte@appps.com.br']);
});

caso('rejeita e-mail inválido, lista vazia e mais de 10', () => {
  assert.ok(validarConfig({ emails_aviso: ['x@'] }).erros.includes('emails_aviso'));
  assert.ok(validarConfig({ emails_aviso: [] }).erros.includes('emails_aviso'));
  assert.ok(validarConfig({ emails_aviso: Array.from({ length: 11 }, (_, i) => `a${i}@x.com`) }).erros.includes('emails_aviso'));
});

caso('rejeita números fora da faixa', () => {
  const r = validarConfig({ teto_mensal: -1, aviso_percentual: 0, saldo_minimo: -5, preco_consulta: 'abc' });
  assert.deepStrictEqual(r.erros.sort(), ['aviso_percentual', 'preco_consulta', 'saldo_minimo', 'teto_mensal']);
});

caso('ignora campos não editáveis', () => {
  const r = validarConfig({ teto_mensal: 100, saldo_atual: 999999, avisos_enviados: { x: 1 }, id: 7 });
  assert.deepStrictEqual(Object.keys(r.config), ['teto_mensal']);
});

caso('rejeita vazio, null, booleano e array em campos numéricos', () => {
  assert.deepStrictEqual(validarConfig({ teto_mensal: '' }).erros, ['teto_mensal']);
  assert.deepStrictEqual(validarConfig({ preco_consulta: null }).erros, ['preco_consulta']);
  assert.deepStrictEqual(validarConfig({ saldo_minimo: true }).erros, ['saldo_minimo']);
  assert.deepStrictEqual(validarConfig({ aviso_percentual: [5] }).erros, ['aviso_percentual']);
});

caso('preco_consulta precisa ser > 0 (mínimo 0,001) (F12)', () => {
  assert.deepStrictEqual(validarConfig({ preco_consulta: 0 }).erros, ['preco_consulta']);
  assert.deepStrictEqual(validarConfig({ preco_consulta: '0,0009' }).erros, ['preco_consulta']);
  assert.strictEqual(validarConfig({ preco_consulta: '0,001' }).config.preco_consulta, 0.001);
});

console.log(`\n${passou} casos passaram`);
