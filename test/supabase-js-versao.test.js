/**
 * Toda página que carrega o supabase-js do CDN usa versão exata (X.Y.Z), o
 * mesmo CDN (jsDelivr) e SRI (integrity + crossorigin). Sem "@2" solto: uma
 * versão nova publicada não entra no ar sem passar por aqui.
 * Uso: node test/supabase-js-versao.test.js
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const IGNORAR = new Set(['node_modules', '.git', '.claude', 'tmp', 'output', '.vercel']);

function htmls(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (IGNORAR.has(e.name)) return [];
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return htmls(p);
    return e.name.endsWith('.html') ? [p] : [];
  });
}

const TAG = /<script\b[^>]*@supabase\/supabase-js[^>]*>/g;
const EXATA = /@supabase\/supabase-js@(\d+\.\d+\.\d+)\//;

let passou = 0;
const versoes = new Set();
const tags = htmls(RAIZ).flatMap((arq) =>
  (fs.readFileSync(arq, 'utf8').match(TAG) || []).map((tag) => ({ arq: path.relative(RAIZ, arq), tag })));

assert.ok(tags.length >= 4, `esperava ao menos 4 páginas com supabase-js, achei ${tags.length}`);

for (const { arq, tag } of tags) {
  const m = tag.match(EXATA);
  assert.ok(m, `${arq}: supabase-js sem versão exata → ${tag}`);
  versoes.add(m[1]);
  assert.ok(tag.includes('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@'), `${arq}: use o jsDelivr`);
  assert.match(tag, /integrity="sha384-[A-Za-z0-9+/=]+"/, `${arq}: falta integrity (SRI)`);
  assert.match(tag, /crossorigin="anonymous"/, `${arq}: falta crossorigin="anonymous"`);
  passou++;
  console.log(`ok - ${arq} fixa supabase-js@${m[1]} com SRI`);
}

assert.strictEqual(versoes.size, 1, `todas as páginas na mesma versão: ${[...versoes].join(', ')}`);
console.log(`\n${passou} páginas ok (supabase-js@${[...versoes][0]})`);
