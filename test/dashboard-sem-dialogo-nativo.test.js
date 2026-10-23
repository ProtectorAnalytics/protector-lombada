/**
 * Painel do síndico (dashboard/index.html) sem alert()/confirm() nativos:
 * confirmação na própria página (portariaGestao.confirmarNaPagina, que só usa
 * textContent) e recados no aviso flutuante (#aviso, role="status").
 * Uso: node test/dashboard-sem-dialogo-nativo.test.js
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'index.html'), 'utf8');
// Comentários não contam (ex.: "sem confirm()"); "//" de URL fica (precisa de espaço antes).
const codigo = html
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|\s)\/\/.*$/gm, '$1');

/** Corpo da função (até o primeiro "}" na indentação de 4 espaços). */
function funcao(assinatura) {
  const ini = codigo.indexOf(assinatura);
  assert.ok(ini >= 0, `não achei ${assinatura}`);
  return codigo.slice(ini, codigo.indexOf('\n    }\n', ini));
}

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

caso('nenhum alert( nativo', () => {
  const achados = codigo.match(/(?<![\w.$])(?:window\.)?alert\s*\(/g) || [];
  assert.deepStrictEqual(achados, []);
});

caso('nenhum confirm( nativo', () => {
  const achados = codigo.match(/(?<![\w.$])(?:window\.)?confirm\s*\(/g) || [];
  assert.deepStrictEqual(achados, []);
});

caso('nenhum prompt( nativo', () => {
  const achados = codigo.match(/(?<![\w.$])(?:window\.)?prompt\s*\(/g) || [];
  assert.deepStrictEqual(achados, []);
});

caso('encerrar vínculo pergunta na página, placa como destaque (textContent)', () => {
  const corpo = funcao('async function removerVeiculo');
  assert.match(corpo, /portariaGestao\.confirmarNaPagina\(\{/);
  assert.match(corpo, /destaque:\s*placa/);
  assert.ok(!corpo.includes('innerHTML'), 'removerVeiculo não pode usar innerHTML');
});

caso('aviso flutuante tem variante de erro e usa textContent', () => {
  const corpo = funcao('function mostrarAviso');
  assert.match(corpo, /el\.textContent = texto/);
  assert.match(corpo, /classList\.toggle\('erro'/);
  assert.match(codigo, /#aviso\.erro\s*\{/);
});

console.log(`\n${passou} casos ok`);
