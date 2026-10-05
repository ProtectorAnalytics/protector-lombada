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

console.log(`\n${passou} casos passaram${falhou ? `, ${falhou} falharam` : ''}`);
if (falhou) process.exit(1);
