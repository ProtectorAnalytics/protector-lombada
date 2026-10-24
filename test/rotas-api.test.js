/**
 * Todo handler em api/ precisa de rota no vercel.json: o projeto usa
 * builds + routes legado e termina em "/(.*)" → /site, então função sem rota
 * dá 404 em produção. Uso: node test/rotas-api.test.js
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const { routes } = JSON.parse(fs.readFileSync(path.join(RAIZ, 'vercel.json'), 'utf8'));

// Arquivos de api/ que ficam sem rota de propósito (cada um com o motivo).
// Hoje nenhum: api/relatorio.js é servido por "/relatorio(.*)".
const SEM_ROTA_DE_PROPOSITO = Object.freeze([]);

function handlers(dir) {
  return fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true }).flatMap((ent) => {
    const rel = `${dir}/${ent.name}`;
    if (ent.isDirectory()) return handlers(rel);
    return ent.name.endsWith('.js') ? [rel] : [];
  });
}

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

caso('todo arquivo de api/ tem rota no vercel.json (ou está na lista de exceções)', () => {
  const destinos = new Set(routes.map((r) => r.dest));
  const semRota = handlers('api')
    .filter((f) => !destinos.has(`/${f}`))
    .filter((f) => !SEM_ROTA_DE_PROPOSITO.includes(f));
  assert.deepStrictEqual(semRota, [], `sem rota: ${semRota.join(', ')}`);
});

caso('endereço antigo (protector-lombada.vercel.app) manda painel/admin/portaria para o domínio oficial, nunca as câmeras', () => {
  const red = routes.filter((r) => r.status === 308 && (r.has || []).some((h) => h.type === 'host' && h.value === 'protector-lombada.vercel.app'));
  assert.strictEqual(red.length, 1);
  const re = new RegExp(red[0].src);
  ['/dashboard', '/dashboard/', '/admin', '/admin/manual-usuario.html', '/portaria', '/portaria/'].forEach((u) => assert.ok(re.test(u), u));
  ['/placa', '/placa/x', '/api/heartbeat', '/api/captura', '/api/config', '/', '/js/captcha.js', '/dashboardx'].forEach((u) => assert.ok(!re.test(u), u));
  assert.strictEqual(red[0].headers.Location, 'https://lombada.appps.com.br/$1$2');
  assert.strictEqual(routes.indexOf(red[0]), 0, 'antes de qualquer rota');
});

caso('/api/admin/avisos aponta para o handler', () => {
  assert.ok(routes.some((r) => r.src === '/api/admin/avisos' && r.dest === '/api/admin/avisos.js'));
});

caso('rotas de api/ ficam antes do coringa final', () => {
  const coringa = routes.findIndex((r) => r.src === '/(.*)');
  assert.strictEqual(coringa, routes.length - 1);
});

console.log(`\n${passou} casos ok`);
