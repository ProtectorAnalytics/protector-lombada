/**
 * Funções puras da tela "Consulta de placas" (admin/index.html), extraídas do
 * <script> inline e avaliadas isoladas (sem DOM).
 * Uso: node test/admin-apiplacas-ui.test.js
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'admin', 'index.html'), 'utf8');

/** Recorta a declaração que começa em `inicio` até a chave que fecha a primeira chave aberta. */
function extrair(inicio) {
  const i = HTML.indexOf(inicio);
  if (i < 0) throw new Error(`não achei "${inicio}" no admin/index.html`);
  let nivel = 0;
  for (let j = HTML.indexOf('{', i); j < HTML.length; j++) {
    if (HTML[j] === '{') nivel++;
    else if (HTML[j] === '}' && --nivel === 0) return HTML.slice(i, j + 1);
  }
  throw new Error(`chaves desbalanceadas em "${inicio}"`);
}

const carregar = (inicio, nome) => new Function(`${extrair(inicio)}; return ${nome};`)();

let passou = 0;
let falhou = 0;
function caso(nome, fn) {
  try { fn(); passou++; console.log(`ok - ${nome}`); }
  catch (e) { falhou++; console.log(`FALHOU - ${nome}\n  ${e.message.split('\n').join('\n  ')}`); }
}

caso('validar_hoje parado por limite_hora tem frase própria (F2)', () => {
  const resumoValidacao = carregar('function resumoValidacao(', 'resumoValidacao');
  const t = resumoValidacao({ consultadas: 3, puladas: 0, falhas: 0, parou: 'limite_hora' });
  assert.ok(t.includes('Limite de consultas por hora atingido; continua sozinho na próxima hora.'), t);
});

caso('reconsulta 409 limite_hora tem frase própria (F2)', () => {
  const AP_MOTIVO_409 = carregar('const AP_MOTIVO_409 = {', 'AP_MOTIVO_409');
  assert.strictEqual(AP_MOTIVO_409.limite_hora, 'Limite de consultas por hora atingido; continua sozinho na próxima hora.');
});

caso('campos numéricos vazios vão como string vazia e o servidor acusa o campo (F12)', () => {
  const { validarConfig } = require('../lib/apiplacas-config');
  const corpoConfigApiplacas = carregar('function corpoConfigApiplacas(', 'corpoConfigApiplacas');
  const body = corpoConfigApiplacas({ ativo: true, teto: '', aviso: '', saldoMin: '', preco: '', emails: ['a@x.com'] });
  assert.strictEqual(body.aviso_percentual, '');
  assert.strictEqual(body.saldo_minimo, '');
  assert.deepStrictEqual(validarConfig(body).erros.sort(), ['aviso_percentual', 'preco_consulta', 'saldo_minimo', 'teto_mensal']);
  const ok = corpoConfigApiplacas({ ativo: false, teto: '150', aviso: '80', saldoMin: '200', preco: '0,03', emails: ['a@x.com'] });
  assert.deepStrictEqual(validarConfig(ok).erros, []);
});

caso('dica do preço fala em valor maior que zero (F12)', () => {
  const AP_DICA = carregar('const AP_DICA = {', 'AP_DICA');
  assert.ok(/maior que 0|acima de 0|0,001/.test(AP_DICA.preco_consulta), AP_DICA.preco_consulta);
});

console.log(`\n${passou} casos passaram${falhou ? `, ${falhou} falharam` : ''}`);
if (falhou) process.exit(1);
