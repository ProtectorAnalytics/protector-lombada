/**
 * Testes do captcha anti-robô (site/js/captcha.js) e do /api/config.
 *
 * Regra que motivou: com o captcha ligado no Supabase, login sem token
 * quebra. Sem site key configurada nada pode mudar (feature flag).
 * Uso: node test/captcha.test.js
 */
const assert = require('node:assert');
const captchaLib = require('../site/js/captcha');

const { criarCaptcha, credenciais, opcoes, ehErroDeCaptcha, normalizarChave, mensagemFalha, MSG_FALHA, SCRIPT_URL } = captchaLib;

let passou = 0;
let falhou = 0;
const fila = [];
function caso(nome, fn) { fila.push([nome, fn]); }
const tick = () => new Promise((r) => setTimeout(r, 5));

/** Documento falso que conta scripts injetados. */
function docFalso() {
  const scripts = [];
  return {
    scripts,
    createElement: () => ({}),
    head: { appendChild: (s) => scripts.push(s) },
    getElementById: (id) => ({ id }),
  };
}

/** Turnstile falso: guarda os parâmetros do render e conta os resets. */
function turnstileFalso() {
  const t = { params: null, resets: 0, renders: 0 };
  t.render = (el, params) => { t.renders++; t.el = el; t.params = params; return 'w1'; };
  t.reset = (id) => { assert.strictEqual(id, 'w1'); t.resets++; };
  return t;
}

caso('sem site key: obterToken devolve null e nunca injeta o script', async () => {
  for (const siteKey of [undefined, null, '', '   ']) {
    const doc = docFalso();
    const c = criarCaptcha({ siteKey, container: 'x', win: {}, doc });
    assert.strictEqual(c.ativo, false);
    assert.strictEqual(await c.obterToken(), null);
    await c.iniciar();
    c.resetar();
    assert.strictEqual(doc.scripts.length, 0, `script injetado com siteKey=${JSON.stringify(siteKey)}`);
  }
});

caso('sem token: credenciais e opções saem idênticas às de hoje', () => {
  const cred = { email: 'a@b.com', password: 'x' };
  assert.strictEqual(credenciais(cred, null), cred);
  const base = { redirectTo: 'https://x/admin/' };
  assert.strictEqual(opcoes(base, null), base);
});

caso('com token: signInWithPassword recebe options.captchaToken; reset mantém redirectTo', () => {
  const cred = { email: 'a@b.com', password: 'x' };
  assert.deepStrictEqual(credenciais(cred, 'tok'), { email: 'a@b.com', password: 'x', options: { captchaToken: 'tok' } });
  assert.deepStrictEqual(cred, { email: 'a@b.com', password: 'x' }, 'não muta o original');
  assert.deepStrictEqual(opcoes({ redirectTo: 'r' }, 'tok'), { redirectTo: 'r', captchaToken: 'tok' });
});

caso('com site key: injeta o script do Turnstile (render explícito) uma vez só', async () => {
  const doc = docFalso();
  const win = {};
  const c = criarCaptcha({ siteKey: ' 0xCHAVE ', container: 'captcha-login', win, doc });
  assert.strictEqual(c.ativo, true);
  const p1 = c.iniciar();
  const p2 = c.iniciar();
  assert.strictEqual(doc.scripts.length, 1);
  assert.strictEqual(doc.scripts[0].src, SCRIPT_URL);
  assert.ok(SCRIPT_URL.endsWith('?render=explicit'));
  const ts = turnstileFalso();
  win.turnstile = ts;
  doc.scripts[0].onload();
  await Promise.all([p1, p2]);
  assert.strictEqual(ts.renders, 1);
  assert.strictEqual(ts.el.id, 'captcha-login');
  assert.strictEqual(ts.params.sitekey, '0xCHAVE');
  assert.strictEqual(ts.params.language, 'pt-br');
  assert.strictEqual(ts.params.appearance, 'always', 'quadro "não sou robô" sempre visível');
});

caso('token é de uso único: entrega e reseta o widget a cada uso', async () => {
  const ts = turnstileFalso();
  const c = criarCaptcha({ siteKey: 'k', container: 'c', win: { turnstile: ts }, doc: docFalso() });
  await c.iniciar();
  ts.params.callback('tok-1');
  assert.strictEqual(await c.obterToken(), 'tok-1');
  assert.strictEqual(ts.resets, 1);
  // Sem token novo ainda: espera o próximo callback
  const proximo = c.obterToken();
  ts.params.callback('tok-2');
  assert.strictEqual(await proximo, 'tok-2');
  await tick();
  assert.strictEqual(ts.resets, 2);
});

caso('token vencido não é entregue', async () => {
  const ts = turnstileFalso();
  const c = criarCaptcha({ siteKey: 'k', container: 'c', win: { turnstile: ts }, doc: docFalso(), esperaMs: 20 });
  await c.iniciar();
  ts.params.callback('velho');
  ts.params['expired-callback']();
  await assert.rejects(c.obterToken(), { message: MSG_FALHA });
});

caso('erro do widget rejeita com a mensagem em PT-BR', async () => {
  const ts = turnstileFalso();
  const c = criarCaptcha({ siteKey: 'k', container: 'c', win: { turnstile: ts }, doc: docFalso() });
  await c.iniciar();
  const p = c.obterToken();
  await tick();
  assert.strictEqual(ts.params['error-callback'](), true);
  await assert.rejects(p, { message: MSG_FALHA });
  assert.strictEqual(MSG_FALHA, 'Não foi possível confirmar que você não é um robô. Tente de novo.');
});

caso('script bloqueado: obterToken devolve null (login segue) e a próxima tentativa injeta de novo', async () => {
  const doc = docFalso();
  const c = criarCaptcha({ siteKey: 'k', container: 'c', win: {}, doc });
  const p = c.obterToken();
  doc.scripts[0].onerror();
  assert.strictEqual(await p, null);
  c.iniciar().catch(() => {});
  assert.strictEqual(doc.scripts.length, 2, 'segunda tentativa injeta de novo');
});

caso('erro do widget reseta para a próxima tentativa não esperar o limite', async () => {
  const ts = turnstileFalso();
  const c = criarCaptcha({ siteKey: 'k', container: 'c', win: { turnstile: ts }, doc: docFalso() });
  await c.iniciar();
  ts.params['error-callback']();
  await tick();
  assert.strictEqual(ts.resets, 1);
  const p = c.obterToken();
  ts.params.callback('tok-novo');
  assert.strictEqual(await p, 'tok-novo');
});

caso('container estreito (< 300 px) usa o widget compacto; largo ou oculto usa flexível', async () => {
  for (const [largura, esperado] of [[280, 'compact'], [320, 'flexible'], [0, 'flexible']]) {
    const ts = turnstileFalso();
    const doc = { ...docFalso(), getElementById: () => ({ clientWidth: largura }) };
    await criarCaptcha({ siteKey: 'k', container: 'c', win: { turnstile: ts }, doc }).iniciar();
    assert.strictEqual(ts.params.size, esperado, `largura ${largura}`);
  }
});

caso('parar remove o widget; iniciar desenha de novo (depois de sair)', async () => {
  const ts = turnstileFalso();
  const removidos = [];
  ts.remove = (id) => removidos.push(id);
  const c = criarCaptcha({ siteKey: 'k', container: 'c', win: { turnstile: ts }, doc: docFalso() });
  await c.iniciar();
  ts.params.callback('tok');
  c.parar();
  assert.deepStrictEqual(removidos, ['w1']);
  c.resetar(); // sem widget: não chama reset
  assert.strictEqual(ts.resets, 0);
  await c.iniciar();
  assert.strictEqual(ts.renders, 2);
  criarCaptcha({}).parar(); // inerte também tem parar
});

caso('reconhece a recusa do Supabase por captcha', () => {
  assert.strictEqual(ehErroDeCaptcha({ code: 'captcha_failed', message: 'x' }), true);
  assert.strictEqual(ehErroDeCaptcha({ message: 'captcha protection: request disallowed (no captcha response)' }), true);
  assert.strictEqual(ehErroDeCaptcha({ code: 'invalid_credentials', message: 'Invalid login credentials' }), false);
  assert.strictEqual(ehErroDeCaptcha({ message: 'captcha protection: request disallowed (no captcha response)', code: 'captcha_failed' }), true);
  assert.strictEqual(ehErroDeCaptcha(null), false);
});

caso('normalizarChave aceita só string não vazia', () => {
  assert.strictEqual(normalizarChave(' 0xabc '), '0xabc');
  assert.strictEqual(normalizarChave(''), null);
  assert.strictEqual(normalizarChave(123), null);
});

function chamarConfig(env) {
  const salvo = { ...process.env };
  Object.assign(process.env, { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon' });
  delete process.env.TURNSTILE_SITE_KEY;
  Object.assign(process.env, env);
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; } };
  delete require.cache[require.resolve('../api/config')];
  return require('../api/config')({}, res).then(() => { process.env = salvo; return res.body; });
}

caso('/api/config: sem TURNSTILE_SITE_KEY devolve turnstileSiteKey null', async () => {
  assert.strictEqual((await chamarConfig({})).turnstileSiteKey, null);
  assert.strictEqual((await chamarConfig({ TURNSTILE_SITE_KEY: '  ' })).turnstileSiteKey, null);
});

caso('/api/config: com TURNSTILE_SITE_KEY expõe só a site key (pública)', async () => {
  const body = await chamarConfig({ TURNSTILE_SITE_KEY: ' 0xSITE ', TURNSTILE_SECRET_KEY: 'segredo' });
  assert.strictEqual(body.turnstileSiteKey, '0xSITE');
  assert.ok(!JSON.stringify(body).includes('segredo'));
});

const fs = require('node:fs');
const path = require('node:path');
const ler = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const PAGINAS = ['admin/index.html', 'dashboard/index.html', 'portaria/index.html'];

caso('telas de login carregam a lib e têm o lugar do widget', () => {
  for (const arq of PAGINAS) {
    const h = ler(arq);
    assert.ok(h.includes('<script src="/js/captcha.js"></script>'), `${arq} sem /js/captcha.js`);
    assert.ok(/<div[^>]*id="captcha-login"/.test(h), `${arq} sem #captcha-login`);
    assert.ok(h.includes('cfg.turnstileSiteKey'), `${arq} não lê a site key do /api/config`);
  }
});

caso('todo login e "esqueci a senha" do navegador manda o token do captcha', () => {
  for (const arq of PAGINAS) {
    const h = ler(arq);
    const logins = [...h.matchAll(/auth\.signInWithPassword\(([^;]*)\)/g)].map((m) => m[1]);
    assert.ok(logins.length >= 1, `${arq} sem login`);
    logins.forEach((a) => assert.ok(a.startsWith('captchaLib.credenciais('), `${arq}: ${a}`));
    const resets = [...h.matchAll(/auth\.resetPasswordForEmail\(([\s\S]*?)\);/g)].map((m) => m[1]);
    resets.forEach((a) => assert.ok(a.includes('captchaLib.opcoes('), `${arq}: ${a}`));
    assert.ok(!/auth\.(signUp|signInWithOtp|signInAnonymously)\(/.test(h), `${arq}: chamada nova do Auth sem captcha`);
  }
});

caso('mensagem de falha mostra o código do erro (para diagnosticar pela foto da tela)', () => {
  assert.strictEqual(mensagemFalha(null), MSG_FALHA);
  assert.strictEqual(mensagemFalha(''), MSG_FALHA);
  assert.strictEqual(mensagemFalha('110200'), `${MSG_FALHA} (código 110200)`);
  assert.strictEqual(mensagemFalha(300030), `${MSG_FALHA} (código 300030)`);
  assert.strictEqual(mensagemFalha('<b>x</b>"; y'), `${MSG_FALHA} (código bxby)`, 'só letras, números e hífen');
  assert.strictEqual(mensagemFalha('a'.repeat(40)).length, MSG_FALHA.length + ' (código )'.length + 24, 'até 24 caracteres');
});

caso('ultimoErro guarda o código da Cloudflare, do tempo esgotado e do script bloqueado; limpa ao receber token', async () => {
  const inerte = criarCaptcha({});
  assert.strictEqual(inerte.ultimoErro(), null);

  const ts = turnstileFalso();
  const c = criarCaptcha({ siteKey: 'k', container: 'c', win: { turnstile: ts }, doc: docFalso(), esperaMs: 10 });
  await c.iniciar();
  assert.strictEqual(c.ultimoErro(), null);
  const p = c.obterToken();
  await tick();
  ts.params['error-callback']('600010');
  await assert.rejects(p, { message: MSG_FALHA });
  assert.strictEqual(c.ultimoErro(), '600010');
  ts.params['error-callback']();
  assert.strictEqual(c.ultimoErro(), 'desconhecido');
  await assert.rejects(c.obterToken(), { message: MSG_FALHA });
  assert.strictEqual(c.ultimoErro(), 'tempo');
  const p2 = c.obterToken();
  ts.params.callback('tok');
  assert.strictEqual(await p2, 'tok');
  assert.strictEqual(c.ultimoErro(), null);

  const doc = docFalso();
  const b = criarCaptcha({ siteKey: 'k', container: 'c', win: {}, doc });
  const pb = b.obterToken();
  doc.scripts[0].onerror();
  assert.strictEqual(await pb, null);
  assert.strictEqual(b.ultimoErro(), 'script');
});

caso('telas de login mostram a mensagem com o código (nunca só a fixa)', () => {
  for (const arq of PAGINAS) {
    const h = ler(arq);
    assert.ok(!/textContent = captchaLib\.MSG_FALHA/.test(h), `${arq}: mensagem sem código`);
    assert.ok(!/\? captchaLib\.MSG_FALHA :/.test(h), `${arq}: recusa do servidor sem código`);
    assert.ok(/captchaLib\.mensagemFalha\(captcha\.ultimoErro\(\)/.test(h), `${arq}: sem mensagemFalha`);
  }
});

(async () => {
  for (const [nome, fn] of fila) {
    try { await fn(); passou++; console.log(`ok - ${nome}`); }
    catch (e) { falhou++; console.log(`FALHOU - ${nome}\n  ${String(e && e.stack || e).split('\n').slice(0, 4).join('\n  ')}`); }
  }
  console.log(`\n${passou} casos passaram${falhou ? `, ${falhou} falharam` : ''}`);
  if (falhou) process.exit(1);
})();
