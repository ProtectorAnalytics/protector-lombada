/**
 * Página /quadro (Quadro no PC da portaria, v1.17.0) e o acesso a ela no
 * painel: marcação essencial, sem innerHTML com dado do banco, login igual ao
 * do painel (usuário sem "@" + "não sou um robô"), só a anon key, links
 * externos só para a Lombada. Uso: node test/quadro-pagina.test.js
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');
const semComentarios = (js) => js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

const html = ler('quadro/index.html');
const app = semComentarios(ler('quadro/app.js'));
const casca = semComentarios(ler('quadro/casca.js'));
const painel = ler('dashboard/index.html');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

caso('marcação essencial: barra de arrastar, Fixar, minimizar, menu, login, quadro e setas', () => {
  ['id="barra"', 'data-tauri-drag-region', 'id="botao-fixar"', 'id="botao-minimizar"', 'id="botao-menu"',
    'id="menu-camera"', 'id="menu-autostart"', 'id="login-usuario"', 'id="login-senha"', 'id="captcha-login"',
    'id="tela-escolha"', 'id="passagem"', 'id="foto"', 'class="mer"', 'id="p-tipo"', 'id="p-nome"', 'id="p-unidade"',
    'id="p-camera"', 'id="p-hora"', 'id="p-vel"', 'id="botao-voltar"', 'id="botao-avancar"',
    'id="botao-ao-vivo"', 'id="estado"',
  ].forEach((trecho) => assert.ok(html.includes(trecho), `falta ${trecho}`));
});

caso('a passagem não é botão (clicar para arrastar não abre o site); o painel abre pelo botão da barra', () => {
  assert.match(html, /<div class="passagem" id="passagem" role="group">/);
  assert.ok(!app.includes("$('passagem').addEventListener('click'"), 'passagem sem clique');
  assert.match(html, /<button type="button" class="ic-btn" id="botao-painel" hidden[^>]*aria-label="Abrir o painel completo de hoje"/);
  assert.ok(app.includes("$('botao-painel').addEventListener('click', abrirPainel)"));
  assert.ok(app.includes("$('botao-painel').hidden = id !== 'tela-quadro';"), 'botão só na tela do quadro');
});

caso('a janela toda arrasta (barra e conteúdo em "deep") e o Fixar desliga tudo', () => {
  assert.match(html, /<header class="barra" id="barra" data-arrastar="deep" data-tauri-drag-region="deep">/);
  assert.match(html, /<main class="conteudo" data-arrastar="deep" data-tauri-drag-region="deep">/);
  assert.ok(casca.includes("raiz.querySelectorAll('[data-arrastar]')"));
  assert.ok(casca.includes("el.setAttribute('data-tauri-drag-region', el.getAttribute('data-arrastar'))"));
  assert.ok(app.includes('casca.aplicarFixado(fixado, document)'));
});

caso('login: marca, ícones, mostrar senha e usuário lembrado (nunca a senha)', () => {
  ['class="marca"', 'id="titulo-login"', 'id="botao-ver-senha"', 'aria-controls="login-senha"', 'id="ic-pessoa"', 'id="ic-cadeado"', 'class="botao primario botao-entrar"']
    .forEach((t) => assert.ok(html.includes(t), t));
  assert.ok(app.includes("gravarLocal(CHAVE_USUARIO, entrada)"));
  assert.ok(!/gravarLocal\([^)]*senha/i.test(app), 'senha nunca vai ao localStorage');
  assert.ok(app.includes("$('login-senha').type = mostrar ? 'text' : 'password'"));
});

caso('as setas têm nome acessível', () => {
  assert.match(html, /id="botao-voltar" aria-label="Passagem anterior"/);
  assert.match(html, /id="botao-avancar" aria-label="Passagem seguinte"/);
});

caso('ícones dos 4 tipos e de "Sem cadastro" na página', () => {
  ['casa', 'chave', 'cracha', 'ferramenta', 'interrogacao'].forEach((i) => assert.ok(html.includes(`id="ic-${i}"`), i));
});

caso('scripts: libs puras antes da página, mesma supabase-js (versão e SRI) do painel', () => {
  const tag = (h) => (h.match(/<script\b[^>]*@supabase\/supabase-js[^>]*><\/script>/) || [''])[0];
  assert.ok(tag(html), 'supabase-js na página');
  assert.strictEqual(tag(html), tag(painel), 'mesma tag (versão + integrity) do painel');
  const ordem = ['/js/placa.js', '/js/captcha.js', '/js/usuario-portaria.js', '/js/vinculo-placa.js', '/js/quadro.js', '/quadro/casca.js', '/quadro/app.js']
    .map((s) => html.indexOf(`<script src="${s}"></script>`));
  ordem.forEach((i) => assert.ok(i > 0));
  assert.deepStrictEqual([...ordem].sort((a, b) => a - b), ordem, 'ordem dos scripts');
});

caso('nada de innerHTML/outerHTML/insertAdjacentHTML/document.write no código da página', () => {
  [['app.js', app], ['casca.js', casca]].forEach(([nome, js]) => {
    assert.ok(!/\.(inner|outer)HTML\b/.test(js), `${nome}: innerHTML/outerHTML`);
    assert.ok(!/insertAdjacentHTML|document\.write/.test(js), `${nome}: HTML cru`);
  });
  assert.ok(!/<script>\s*[^<]/.test(html), 'sem script inline na página');
});

caso('sem a linha "cadastrado em … por …" (CEO: fica para a futura página de auditoria)', () => {
  [html, app, ler('site/js/quadro.js')].forEach((t) => {
    assert.ok(!/cadastrado em|rotuloCadastro|p-cadastro|linhaCadastro/.test(t));
  });
});

caso('dado do banco entra por textContent', () => {
  ['p-placa', 'p-nome', 'p-unidade', 'p-camera', 'p-hora'].forEach((id) => {
    assert.ok(app.includes(`$('${id}').textContent =`), id);
  });
});

caso('login igual ao do painel: usuário de porteiro sem "@", captcha com código na mensagem', () => {
  assert.ok(app.includes('usuarioPortariaLib.paraLogin(entrada)'));
  assert.ok(app.includes("criarCaptcha({ siteKey: cfg.turnstileSiteKey, container: 'captcha-login' })"));
  assert.ok(app.includes('captchaLib.mensagemFalha('));
  assert.ok(app.includes('captchaLib.credenciais('));
});

caso('só a anon key (via /api/config); nenhuma chave no código', () => {
  assert.ok(app.includes("fetch('/api/config')"));
  assert.ok(app.includes('cfg.supabaseAnonKey'));
  [app, casca, html].forEach((t) => {
    assert.ok(!/service_role|eyJ[A-Za-z0-9_-]{20,}|sb_secret_/.test(t), 'segredo no cliente');
  });
});

caso('equipe Protector: a visita ao condomínio passa pela auditoria antes de abrir', () => {
  const ini = app.indexOf('async function abrirComoAdmin');
  const corpo = app.slice(ini, app.indexOf('\n  }\n', ini));
  assert.ok(corpo.includes("'/api/admin/acesso-painel'"));
  assert.ok(corpo.indexOf('acesso-painel') < corpo.indexOf('abrirCliente('), 'auditoria antes de abrir');
});

caso('links externos só pela regra urlExternaPermitida (https://lombada.appps.com.br)', () => {
  const chamadas = app.match(/casca\.abrirExterno\([^;]*;/g) || [];
  assert.ok(chamadas.length >= 2);
  chamadas.forEach((c) => assert.ok(c.includes('q.urlExternaPermitida'), c));
  assert.ok(casca.includes('if (!permitida(url)) return'));
});

caso('a casca só usa o que a capability libera (arrastar, minimizar, tamanho, autostart, abrir URL)', () => {
  const usados = new Set([
    ...(casca.match(/T\.[a-z]+/g) || []).map((s) => s.slice(2)),
    ...(casca.match(/plugin\('([a-z]+)'\)/g) || []).map((s) => s.slice(8, -2)),
  ]);
  assert.deepStrictEqual([...usados].sort(), ['autostart', 'opener', 'window']);
  ['setResizable', 'minimize', 'isEnabled', 'enable', 'disable', 'openUrl'].forEach((f) => assert.ok(casca.includes(`.${f}(`), f));
  assert.ok(!/invoke\(/.test(casca) && !/invoke\(/.test(app), 'sem invoke genérico');
});

caso('câmera escolhida e condomínio da Protector ficam neste PC (localStorage)', () => {
  assert.ok(app.includes("CHAVE_CAMERA = 'quadro.camera'"));
  assert.ok(app.includes("CHAVE_CLIENTE = 'quadro.cliente'"));
});

// ---------------------------------------------------------------- painel
caso('painel: "Quadro para o PC da portaria" no menu da conta, escondido até saber o perfil', () => {
  assert.match(painel, /<button type="button" class="conta-link" id="conta-quadro" onclick="abrirQuadroPc\(\)" hidden>Quadro para o PC da portaria<\/button>/);
  assert.ok(painel.includes("document.getElementById('conta-quadro').hidden = !acessoPainel.podeVerQuadroPc("));
  assert.ok(painel.includes('aplicarPermissaoVeiculos();\n      aplicarAcessoQuadroPc();'), 'aplicado junto com as permissões');
});

caso('painel: o quadro explica, baixa para Windows, avisa do SmartScreen e abre no navegador', () => {
  const ini = painel.indexOf('id="quadro-overlay"');
  assert.ok(ini > 0);
  const bloco = painel.slice(ini, painel.indexOf('id="vm-overlay"', ini));
  assert.ok(bloco.includes('href="/baixar/quadro-windows"'));
  assert.ok(bloco.includes('Baixar para Windows'));
  assert.ok(bloco.includes('Mais informações') && bloco.includes('Executar assim mesmo'));
  assert.ok(bloco.includes('href="/baixar/quadro-macos"') && bloco.includes('Baixar para Mac'));
  assert.ok(bloco.includes('Privacidade e Segurança') && bloco.includes('Abrir Mesmo Assim'), 'aviso do Mac sem assinatura');
  assert.ok(bloco.includes('href="/quadro"') && bloco.includes('Ou abrir no navegador'));
  assert.ok(bloco.includes('role="dialog"') && bloco.includes('aria-modal="true"'));
});

caso('manual do painel tem a seção do quadro', () => {
  const manual = ler('dashboard/manual.html');
  assert.ok(manual.includes('id="quadro-pc"'));
  ['Fixar', 'Abrir ao ligar o computador', 'Mais informações', 'Baixar para Mac', 'Abrir Mesmo Assim'].forEach((t) => assert.ok(manual.includes(t), t));
});

caso('site: rodapé com os downloads do quadro para Windows e Mac', () => {
  const site = ler('site/index.html');
  const rodape = site.slice(site.indexOf('<footer'));
  assert.ok(rodape.includes('href="/baixar/quadro-windows"') && rodape.includes('Baixar para Windows'));
  assert.ok(rodape.includes('href="/baixar/quadro-macos"') && rodape.includes('Baixar para Mac'));
});

console.log(`\n${passou} casos ok`);
