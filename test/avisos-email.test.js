/**
 * avisos-email.js — regras de tela dos avisos por e-mail (Portaria 2.2).
 * Dados fictícios. Uso: node test/avisos-email.test.js
 */
const assert = require('node:assert');
const lib = require('../site/js/avisos-email');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

const u = (o) => ({
  id: 'id-1', nome: 'Fulano', email: 'fulano@exemplo.test', role: 'operador', ativo: true,
  recebe_alertas: false, recebe_relatorio: false, ...o,
});

caso('ROTULOS com os textos exatos', () => {
  assert.strictEqual(lib.ROTULOS.so_email, 'Só recebe e-mail');
  assert.strictEqual(lib.ROTULOS.recebe_alertas, 'Recebe alertas de excesso');
  assert.strictEqual(lib.ROTULOS.recebe_relatorio, 'Recebe relatório periódico');
  assert.ok(Object.isFrozen(lib.ROTULOS));
});

caso('validarContato aceita nome e e-mail válidos, normalizando', () => {
  const r = lib.validarContato({ nome: '  Maria Teste ', email: '  Maria@Exemplo.TEST ' });
  assert.deepStrictEqual(r, { corpo: { nome: 'Maria Teste', email: 'maria@exemplo.test' } });
});

caso('validarContato recusa nome vazio, nome > 80 e e-mail inválido', () => {
  const r = lib.validarContato({ nome: '   ', email: 'sem-arroba' });
  assert.ok(r.erros.nome);
  assert.ok(r.erros.email);
  assert.ok(!r.corpo);
  assert.ok(lib.validarContato({ nome: 'a'.repeat(81), email: 'a@b.test' }).erros.nome);
  assert.ok(lib.validarContato({ nome: 'a'.repeat(80), email: 'a@b.test' }).corpo);
  assert.ok(lib.validarContato({ nome: '​​', email: 'a@b.test' }).erros.nome);
  assert.ok(lib.validarContato({ nome: 'X', email: null }).erros.email);
});

caso('validarContato recusa o domínio técnico do porteiro', () => {
  assert.ok(lib.validarContato({ nome: 'X', email: 'jose@porteiro.invalid' }).erros.email);
});

caso('lista vazia mostra aviso', () => {
  assert.match(lib.htmlListaAvisos([], {}), /Nenhum/);
  assert.match(lib.htmlListaAvisos(null, {}), /Nenhum/);
});

caso('checkboxes com rótulos exatos e estado marcado', () => {
  const html = lib.htmlListaAvisos([u({ recebe_alertas: true })], {});
  assert.ok(html.includes('Recebe alertas de excesso'));
  assert.ok(html.includes('Recebe relatório periódico'));
  assert.match(html, /data-opcao="recebe_alertas"[^>]*checked/);
  assert.doesNotMatch(html, /data-opcao="recebe_relatorio"[^>]*checked/);
});

caso('selo "Só recebe e-mail" só no so_email; botões de contato só com podeEditarContato', () => {
  const lista = [u({ id: 'c1', role: 'so_email' }), u({ id: 'o1', role: 'operador' })];
  const sem = lib.htmlListaAvisos(lista, { podeEditarContato: false });
  assert.strictEqual(sem.split('Só recebe e-mail').length - 1, 1);
  assert.doesNotMatch(sem, /data-acao="editar"/);
  const com = lib.htmlListaAvisos(lista, { podeEditarContato: true });
  assert.match(com, /data-acao="editar" data-id="c1"/);
  assert.match(com, /data-acao="desativar" data-id="c1"/);
  assert.doesNotMatch(com, /data-acao="editar" data-id="o1"/);
});

caso('portaria e super_admin não mostram opções', () => {
  const html = lib.htmlListaAvisos([u({ id: 'p1', role: 'portaria', email: 'jose@porteiro.invalid' }), u({ id: 's1', role: 'super_admin' })], {});
  assert.doesNotMatch(html, /data-id="p1"/);
  assert.doesNotMatch(html, /data-opcao="recebe_alertas" data-id="s1"/);
});

caso('inativo aparece como Desativado, com Reativar no so_email', () => {
  const html = lib.htmlListaAvisos([u({ id: 'c9', role: 'so_email', ativo: false })], { podeEditarContato: true });
  assert.ok(html.includes('Desativado'));
  assert.match(html, /data-acao="reativar" data-id="c9"/);
});

caso('XSS: nome, e-mail e id escapados', () => {
  const html = lib.htmlListaAvisos([u({
    id: '"><img src=x onerror=alert(1)>', nome: '<script>alert(1)</script>', email: '"onmouseover="x@y.test', role: 'so_email',
  })], { podeEditarContato: true });
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('"onmouseover="'));
  assert.ok(html.includes('&lt;script&gt;'));
});

// ---------------------------------------------------------------- telas (Task 4)
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const painel = require('../site/js/avisos-painel');

const raizRepo = path.join(__dirname, '..');
const ler = (rel) => fs.readFileSync(path.join(raizRepo, rel), 'utf8');
const ADMIN = ler('admin/index.html');
const DASH = ler('dashboard/index.html');

/** Recorta a declaração que começa em `inicio` até a chave que fecha a primeira chave aberta. */
function extrair(fonte, inicio) {
  const i = fonte.indexOf(inicio);
  if (i < 0) throw new Error(`não achei "${inicio}"`);
  let nivel = 0;
  for (let j = fonte.indexOf('{', i); j < fonte.length; j++) {
    if (fonte[j] === '{') nivel++;
    else if (fonte[j] === '}' && --nivel === 0) return fonte.slice(i, j + 1);
  }
  throw new Error(`chaves desbalanceadas em "${inicio}"`);
}

caso('nenhuma referência à aba E-mails nem a /api/admin/emails em admin/, dashboard/, site/', () => {
  const achados = [];
  const varrer = (dir) => {
    for (const ent of fs.readdirSync(path.join(raizRepo, dir), { withFileTypes: true })) {
      const rel = path.join(dir, ent.name);
      if (ent.isDirectory()) { if (ent.name !== 'vendor') varrer(rel); continue; }
      if (!/\.(html|js|css)$/.test(rel) || /manual|novidades/.test(rel)) continue;
      const src = ler(rel);
      if (/tab-emails|showTab\('emails'\)|\/api\/admin\/emails|api\('\/emails|loadEmails|emails-body/.test(src)) achados.push(rel);
    }
  };
  ['admin', 'dashboard', 'site'].forEach(varrer);
  assert.deepStrictEqual(achados, []);
  assert.ok(!fs.existsSync(path.join(raizRepo, 'api/admin/emails.js')), 'api/admin/emails.js removido');
  assert.ok(!ler('vercel.json').includes('/api/admin/emails"'), 'rota removida do vercel.json');
  assert.doesNotMatch(ADMIN, /aba E-mails/);
});

caso('admin: aba Usuários mostra as duas opções e o tipo "Só recebe e-mail" no novo usuário', () => {
  assert.match(ADMIN, /<script src="\/js\/avisos-email\.js"><\/script>/);
  assert.match(ADMIN, /<script src="\/js\/avisos-painel\.js"><\/script>/);
  const render = extrair(ADMIN, 'function renderUsuariosCli(');
  assert.match(render, /htmlOpcoesUsuario\(/);
  const opcoes = extrair(ADMIN, 'function htmlOpcoesUsuario(');
  assert.match(opcoes, /avisosEmailLib\.ROTULOS/);
  const modal = extrair(ADMIN, 'function openUsuarioModal(');
  assert.match(modal, /value="so_email"/);
  assert.match(modal, /avisosEmailLib\.ROTULOS\.so_email/);
  assert.match(extrair(ADMIN, 'async function saveUsuario('), /role === 'so_email'[\s\S]*salvarContatoSoEmail\(/);
  const contato = extrair(ADMIN, 'async function salvarContatoSoEmail(');
  assert.match(contato, /api\('\/avisos/);
  assert.match(contato, /validarContato/);
  assert.doesNotMatch(contato, /\/usuarios|senha/);
});

caso('admin: opções não aparecem para portaria nem super_admin', () => {
  const fn = new Function('avisosEmailLib', 'esc', `${extrair(ADMIN, 'function htmlOpcoesUsuario(')}; return htmlOpcoesUsuario;`)(lib, lib.esc);
  assert.strictEqual(fn(u({ role: 'portaria', email: 'p@porteiro.invalid' })), '—');
  assert.strictEqual(fn(u({ role: 'super_admin' })), '—');
  const html = fn(u({ id: 'o1', recebe_relatorio: true }));
  assert.match(html, /data-opcao="recebe_alertas" data-id="o1"/);
  assert.match(html, /data-opcao="recebe_relatorio" data-id="o1"[^>]*checked/);
  assert.ok(html.includes('Recebe alertas de excesso') && html.includes('Recebe relatório periódico'));
});

caso('validarContato recusa e-mail com aspas, HTML, parênteses, crase, \\ ou espaço; nome com < >', () => {
  for (const email of ["x'-alert(1)-'@a.co", 'a"b@a.co', 'a<b@a.co', 'a(b)@a.co', 'a`b@a.co', 'a\\b@a.co', 'a b@a.co']) {
    assert.ok(lib.validarContato({ nome: 'X', email }).erros.email, email);
  }
  assert.ok(lib.validarContato({ nome: 'a<b>', email: 'a@b.test' }).erros.nome);
  assert.ok(lib.validarContato({ nome: "Maria D'Ávila", email: 'maria.davila+avisos@exemplo.test' }).corpo);
});

caso("admin: lista de usuários com ' no nome e no e-mail não leva dado do usuário a nenhum onclick", () => {
  const tbodies = { 'usuarios-cli-body': { innerHTML: '' }, 'usuarios-global-body': { innerHTML: '' } };
  const document = { getElementById: (id) => tbodies[id] };
  const mau = {
    id: '33333333-3333-4333-8333-333333333333', role: 'so_email', ativo: true, cliente_id: 'c1',
    nome: "a')+alert(1)+('", email: "x'-alert(document.cookie)-'@a.co", clientes: { nome: "Cond'o" },
    recebe_alertas: true, recebe_relatorio: false,
  };
  const codigo = ['const ROLE_LABEL = ', extrair(ADMIN, 'const ROLE_LABEL = {').replace('const ROLE_LABEL = ', ''), ';\n',
    extrair(ADMIN, 'function esc('), extrair(ADMIN, 'function htmlOpcoesUsuario('), extrair(ADMIN, 'function htmlAcoesUsuario('),
    extrair(ADMIN, 'function renderUsuariosCli('), extrair(ADMIN, 'function renderUsuariosGlobal('),
    '; renderUsuariosCli(); renderUsuariosGlobal();'].join('\n');
  new Function('document', 'avisosEmailLib', 'usuariosCliData', 'usuariosData', codigo)(document, lib, [mau], [mau]);
  for (const [id, { innerHTML }] of Object.entries(tbodies)) {
    assert.ok(innerHTML.includes('data-usr-acao="excluir"'), id);
    const handlers = [...innerHTML.matchAll(/\bon\w+="([^"]*)"/g)].map((m) => m[1]);
    assert.deepStrictEqual(handlers, [], `${id}: nenhum handler inline`);
    assert.ok(!innerHTML.includes("'"), `${id}: apóstrofo cru no HTML`);
    assert.ok(innerHTML.includes('&#39;'), id);
  }
});

caso('admin: ações de usuário vão por um ouvinte que busca o usuário pelo id', () => {
  assert.match(ADMIN, /closest\('#usuarios-cli-body \[data-usr-acao\], #usuarios-global-body \[data-usr-acao\]'\)/);
  assert.match(extrair(ADMIN, 'function usuarioCarregado('), /usuariosCliData\.find[\s\S]*usuariosData\.find/);
  assert.doesNotMatch(ADMIN, /onclick="(openUsuarioModal\([^)]|toggleUsuario\(|deleteUsuario\()/);
  const del = extrair(ADMIN, 'async function deleteUsuario(');
  assert.match(del, /remover o contato/);
  assert.match(del, /remover o login/);
});

caso('dashboard: item "Avisos por e-mail\" no menu da conta, só para admin_cliente', () => {
  assert.match(DASH, /id="conta-avisos-email"[^>]*hidden[^>]*>Avisos por e-mail</);
  assert.match(DASH, /<script src="\/js\/avisos-email\.js"><\/script>/);
  assert.match(DASH, /<script src="\/js\/avisos-painel\.js"><\/script>/);
  const aplicar = `${extrair(DASH, 'function podeEditarVeiculos(')}\n${extrair(DASH, 'function aplicarPermissaoVeiculos(')}`;
  const els = {};
  const document = { getElementById: (id) => (els[id] = els[id] || { hidden: false }) };
  const acessoPainel = { podeEditarVeiculos: (r) => r !== 'portaria' };
  for (const [role, escondido] of [['admin_cliente', false], ['operador', true], ['portaria', true], ['super_admin', true]]) {
    new Function('document', 'acessoPainel', 'currentProfile', `${aplicar}; aplicarPermissaoVeiculos();`)(document, acessoPainel, { role });
    assert.strictEqual(els['conta-avisos-email'].hidden, escondido, role);
  }
  const abrir = extrair(DASH, 'function abrirPainelAvisos(');
  assert.match(abrir, /currentProfile\.role !== 'admin_cliente'\) return/);
  assert.match(abrir, /avisosPainel\.montar\(/);
  const novo = `${abrir}${extrair(DASH, 'function fecharPainelAvisos(')}${ler('site/js/avisos-painel.js')}`;
  assert.doesNotMatch(novo, /\bconfirm\(|\balert\(/);
});

caso('scripts inline do admin e do painel passam no node --check', () => {
  fs.mkdirSync(path.join(raizRepo, 'tmp'), { recursive: true });
  const dir = fs.mkdtempSync(path.join(raizRepo, 'tmp', 'check-'));
  try {
    for (const [nome, html] of [['admin', ADMIN], ['dash', DASH]]) {
      const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
      scripts.forEach((src, i) => {
        const arq = path.join(dir, `${nome}-${i}.js`);
        fs.writeFileSync(arq, src);
        execFileSync(process.execPath, ['--check', arq]);
      });
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

(async () => {
  const caixa = (o) => ({ dataset: { id: 'id-1', opcao: 'recebe_alertas' }, checked: true, disabled: false, ...o });
  const chamadas = [];
  const avisos = [];
  const avisar = (m, erro) => avisos.push([m, erro]);

  let c = caixa();
  let ok = await painel.salvarOpcao(c, { api: async (...a) => { chamadas.push(a); assert.strictEqual(c.disabled, true); return {}; }, avisar });
  assert.strictEqual(ok, true);
  assert.deepStrictEqual(chamadas[0], ['/avisos?id=id-1', 'PUT', { recebe_alertas: true }]);
  assert.strictEqual(c.checked, true);
  assert.strictEqual(c.disabled, false);
  assert.strictEqual(avisos[0][1], false);
  passou++; console.log('ok - opção salva na hora (PUT só com a opção), caixa travada enquanto salva');

  c = caixa({ checked: false, dataset: { id: 'a&b', opcao: 'recebe_relatorio' } });
  ok = await painel.salvarOpcao(c, { api: async () => { throw new Error('Usuário não encontrado'); }, avisar });
  assert.strictEqual(ok, false);
  assert.strictEqual(c.checked, true, 'volta ao que era');
  assert.strictEqual(c.disabled, false);
  assert.deepStrictEqual(avisos[1], ['Usuário não encontrado', true]);
  passou++; console.log('ok - falha: a caixa volta ao estado anterior e o erro aparece');

  const antes = chamadas.length;
  ok = await painel.salvarOpcao(caixa({ dataset: { id: 'x', opcao: 'role' } }), { api: async (...a) => { chamadas.push(a); }, avisar });
  assert.strictEqual(ok, false);
  assert.strictEqual(chamadas.length, antes);
  passou++; console.log('ok - opção desconhecida não chama a API');

  console.log(`\n${passou} casos ok`);
})().catch((e) => { console.error(e); process.exit(1); });
