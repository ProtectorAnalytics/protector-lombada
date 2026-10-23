/**
 * Página da portaria (parte 2): funções do <script> inline de
 * portaria/index.html rodadas num VM do Node com stubs, e conferências
 * estáticas (sintaxe, rotas, colunas pedidas ao banco, nada de imagem saindo).
 * Uso: node test/portaria-pagina.test.js
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const placaLib = require('../site/js/placa');
const vinculoPlacaLib = require('../site/js/vinculo-placa');
const { esc } = require('../site/js/texto-seguro');
const usuarioPortariaLib = require('../site/js/usuario-portaria');
const unidadeLib = require('../site/js/unidade');
const captchaLib = require('../site/js/captcha');

const ler = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const PAGINA = ler('portaria/index.html');
const VERCEL = JSON.parse(ler('vercel.json'));
const MIGRATION = ler('sql/migration-portaria-base.sql');

/** Scripts inline (sem src) da página. */
const SCRIPTS = [...PAGINA.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const FONTE = SCRIPTS.join('\n');

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

/** Roda as funções pedidas num contexto isolado com os stubs dados; devolve as funções. */
function carregarComContexto(nomes, extras = {}) {
  const ctx = vm.createContext({ placaLib, vinculoPlacaLib, unidadeLib, esc, Intl, Date, Promise, JSON, Set, Map, ...extras });
  const codigo = nomes.map((n) => extrair(FONTE, FONTE.includes(`async function ${n}(`) ? `async function ${n}(` : `function ${n}(`)).join('\n');
  vm.runInContext(`${codigo}\nthis.__f = { ${nomes.join(', ')} };`, ctx);
  return { f: ctx.__f, ctx };
}
const carregar = (nomes, extras) => carregarComContexto(nomes, extras).f;

let passou = 0;
let falhou = 0;
const fila = [];
function caso(nome, fn) { fila.push([nome, fn]); }
async function rodar() {
  for (const [nome, fn] of fila) {
    try { await fn(); passou++; console.log(`ok - ${nome}`); }
    catch (e) { falhou++; console.log(`FALHOU - ${nome}\n  ${String(e && e.stack || e).split('\n').slice(0, 4).join('\n  ')}`); }
  }
  console.log(`${passou} casos passaram${falhou ? `, ${falhou} falharam` : ''}`);
  if (falhou) process.exit(1);
}

const UNIDADES = [{ id: 'u1', nome: 'Casa 1' }, { id: 'u2', nome: 'Casa 2' }];
const ctxPortaria = () => ({ clienteId: 'c1', role: 'portaria', unidades: UNIDADES });
const ctxAdmin = () => ({ clienteId: 'c1', role: 'admin_cliente', unidades: UNIDADES });

function novoCadastro(contexto) {
  const { criarCadastro } = carregar(['criarCadastro', 'corpoCadastro', 'limparPlacaDigitada']);
  const chamadas = [];
  const c = criarCadastro({ contexto, enviar: async (corpo) => { chamadas.push(corpo); return { id: 'v-novo', placa: corpo.placa }; } });
  return { c, chamadas };
}

// ---- Placa digitada
caso('placa digitada: só A–Z/0–9, maiúsculas, no máximo 7', () => {
  const { limparPlacaDigitada } = carregar(['limparPlacaDigitada']);
  assert.strictEqual(limparPlacaDigitada('abc-1d23'), 'ABC1D23');
  assert.strictEqual(limparPlacaDigitada(' rst 4567 99'), 'RST4567');
  assert.strictEqual(limparPlacaDigitada('ç<b>1'), 'B1');
  assert.strictEqual(limparPlacaDigitada(null), '');
});

// ---- Salvar
caso('Salvar: nada é enviado enquanto o porteiro preenche; só no toque', async () => {
  const { c, chamadas } = novoCadastro(ctxPortaria);
  c.definirPlaca('abc1d23');
  c.escolherUnidade('u1');
  c.definirNome('Maria');
  c.escolherTipo('morador');
  assert.strictEqual(chamadas.length, 0);
  const r = await c.salvar();
  assert.strictEqual(r.ok, true);
  assert.strictEqual(chamadas.length, 1);
});

caso('Salvar sem tipo escolhido não envia e pede o tipo', async () => {
  const { c, chamadas } = novoCadastro(ctxPortaria);
  c.definirPlaca('ABC1D23');
  c.escolherUnidade('u1');
  c.definirNome('Maria');
  const r = await c.salvar();
  assert.strictEqual(r.ok, false);
  assert.match(r.erro, /tipo/i);
  assert.strictEqual(chamadas.length, 0);
  assert.match(c.estado().erro, /tipo/i);
});

caso('Salvar com placa inválida não envia', async () => {
  const { c, chamadas } = novoCadastro(ctxPortaria);
  c.definirPlaca('AB12');
  c.escolherTipo('visitante');
  const r = await c.salvar();
  assert.strictEqual(r.ok, false);
  assert.strictEqual(chamadas.length, 0);
});

caso('Salvar envia unidade com nome da lista e placa limpa, sem porteiro_id', async () => {
  const { c, chamadas } = novoCadastro(ctxPortaria);
  c.definirPlaca('abc-1d23');
  c.escolherUnidade('u2');
  c.definirNome('  Maria Silva ');
  c.escolherTipo('visitante');
  await c.salvar();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(chamadas[0])), {
    cliente_id: 'c1', placa: 'ABC1D23', tipo_pessoa: 'visitante', nome_morador: 'Maria Silva',
    unidade_id: 'u2', unidade: 'Casa 2',
  });
});

caso('portaria grava sem porteiro_id (o cadastro sai no nome do login)', async () => {
  const { c, chamadas } = novoCadastro(ctxPortaria);
  c.definirPlaca('ABC1D23');
  c.escolherTipo('morador');
  const r = await c.salvar();
  assert.strictEqual(r.ok, true);
  assert.strictEqual(chamadas.length, 1);
  assert.ok(!('porteiro_id' in chamadas[0]), JSON.stringify(chamadas[0]));
});

caso('admin_cliente grava sem porteiro_id', async () => {
  const { c, chamadas } = novoCadastro(ctxAdmin);
  c.definirPlaca('ABC1234');
  c.escolherTipo('proprietario');
  await c.salvar();
  assert.strictEqual(chamadas.length, 1);
  assert.ok(!('porteiro_id' in chamadas[0]), JSON.stringify(chamadas[0]));
  assert.strictEqual(chamadas[0].unidade_id, null);
});

caso('dois toques seguidos em Salvar enviam uma vez só ("Salvando…")', async () => {
  const { criarCadastro } = carregar(['criarCadastro', 'corpoCadastro', 'limparPlacaDigitada']);
  let soltar;
  let chamadas = 0;
  const c = criarCadastro({ contexto: ctxPortaria, enviar: () => { chamadas++; return new Promise((r) => { soltar = r; }); } });
  c.definirPlaca('ABC1D23');
  c.escolherTipo('morador');
  const p1 = c.salvar();
  assert.strictEqual(c.estado().salvando, true);
  const r2 = await c.salvar();
  assert.strictEqual(r2.ok, false);
  soltar({ id: 'v1' });
  const r1 = await p1;
  assert.strictEqual(r1.ok, true);
  assert.strictEqual(chamadas, 1);
  assert.strictEqual(c.estado().salvando, false);
});

caso('erro de rede mantém o formulário preenchido e mostra a mensagem', async () => {
  const { criarCadastro } = carregar(['criarCadastro', 'corpoCadastro', 'limparPlacaDigitada']);
  const mudancas = [];
  const c = criarCadastro({
    contexto: ctxPortaria,
    enviar: async () => { throw new TypeError('Failed to fetch'); },
    aoMudar: (e) => mudancas.push(e),
  });
  c.definirPlaca('ABC1D23');
  c.escolherUnidade('u1');
  c.definirNome('Maria');
  c.escolherTipo('morador');
  const r = await c.salvar();
  assert.strictEqual(r.ok, false);
  const e = c.estado();
  assert.strictEqual(e.placa, 'ABC1D23');
  assert.strictEqual(e.unidadeId, 'u1');
  assert.strictEqual(e.nome, 'Maria');
  assert.strictEqual(e.tipo, 'morador');
  assert.strictEqual(e.salvando, false);
  assert.match(e.erro, /conex|internet|rede/i);
  assert.ok(mudancas.some((m) => m.salvando === true), 'não avisou "Salvando…"');
});

caso('erro da API mostra a mensagem da API', async () => {
  const { criarCadastro } = carregar(['criarCadastro', 'corpoCadastro', 'limparPlacaDigitada']);
  const c = criarCadastro({
    contexto: ctxPortaria,
    enviar: async () => { const e = new Error('Placa inválida. Use formato ABC1234 ou ABC1D23'); e.status = 400; throw e; },
  });
  c.definirPlaca('ABC1D23');
  c.escolherTipo('morador');
  await c.salvar();
  assert.strictEqual(c.estado().erro, 'Placa inválida. Use formato ABC1234 ou ABC1D23');
});

caso('estado devolvido é cópia (mexer nele não muda o cadastro)', () => {
  const { c } = novoCadastro(ctxPortaria);
  c.definirPlaca('ABC1D23');
  const e = c.estado();
  e.placa = 'XXX';
  assert.strictEqual(c.estado().placa, 'ABC1D23');
});

caso('trocar um cadastro existente exige unidade ou nome (não grava vínculo vazio)', async () => {
  const { c, chamadas } = novoCadastro(ctxPortaria);
  c.definirPlaca('ABC1D23');
  c.formularioNovo({ temVinculo: true });
  assert.strictEqual(c.estado().tipo, '', 'tipo não pode vir pré-marcado ao trocar');
  c.escolherTipo('visitante');
  let r = await c.salvar();
  assert.strictEqual(r.ok, false);
  assert.match(r.erro, /já tem cadastro.*unidade.*nome/);
  assert.strictEqual(chamadas.length, 0);
  c.definirNome('Ana');
  r = await c.salvar();
  assert.strictEqual(r.ok, true);
  const d = novoCadastro(ctxPortaria);
  d.c.definirPlaca('ABC1D23');
  d.c.formularioNovo({ temVinculo: true });
  d.c.escolherTipo('morador');
  d.c.escolherUnidade('u1');
  assert.strictEqual((await d.c.salvar()).ok, true);
});

caso('placa sem cadastro grava só com o tipo (formulário novo zera o resto e mantém a placa)', async () => {
  const { c, chamadas } = novoCadastro(ctxPortaria);
  c.definirPlaca('ABC1D23');
  c.escolherTipo('morador');
  c.definirNome('X');
  c.formularioNovo({});
  const e = c.estado();
  assert.deepStrictEqual([e.placa, e.tipo, e.nome, e.temVinculo], ['ABC1D23', '', '', false]);
  c.escolherTipo('prestador');
  assert.strictEqual((await c.salvar()).ok, true);
  assert.strictEqual(chamadas.length, 1);
});

caso('"Não"/"Trocar" abre o formulário sem tipo pré-marcado', () => {
  const linha = FONTE.split('\n').find((l) => l.includes("$('pergunta-nao').addEventListener"));
  assert.ok(linha, 'listener do pergunta-nao');
  assert.ok(!/tipo/.test(linha), linha.trim());
  assert.ok(/temVinculo/.test(linha), linha.trim());
});

// ---- Vínculo vigente
const fnsVinculo = () => carregar(['htmlVinculo', 'perguntaDoVinculo', 'nomeUnidadeDe']);

caso('vínculo de visitante pergunta "Continua com <unidade>?"', () => {
  const { perguntaDoVinculo } = fnsVinculo();
  const p = perguntaDoVinculo({ tipo_pessoa: 'visitante', unidade_id: 'u2', unidade: 'velho' }, UNIDADES);
  assert.strictEqual(p.texto, 'Continua com Casa 2?');
  assert.strictEqual(p.sim, 'Sim');
  assert.strictEqual(p.nao, 'Não');
  const q = perguntaDoVinculo({ tipo_pessoa: 'prestador', unidade: 'Bloco B' }, UNIDADES);
  assert.strictEqual(q.texto, 'Continua com Bloco B?');
});

caso('vínculo de morador pergunta se mantém; sem vínculo, nenhuma pergunta', () => {
  const { perguntaDoVinculo } = fnsVinculo();
  const p = perguntaDoVinculo({ tipo_pessoa: 'morador', unidade_id: 'u1' }, UNIDADES);
  assert.strictEqual(p.texto, 'Manter este cadastro?');
  assert.strictEqual(perguntaDoVinculo(null, UNIDADES), null);
});

caso('vínculo mostra ícone, tipo, nome, unidade e "cadastrado em … por …"', () => {
  const { htmlVinculo } = fnsVinculo();
  const html = htmlVinculo({
    tipo_pessoa: 'visitante', nome_morador: 'Ana', unidade_id: 'u1',
    vigente_desde: '2026-10-20T22:15:00-03:00', cadastrado_por: 'João',
  }, UNIDADES);
  assert.ok(html.includes('#ic-cracha'), html);
  assert.ok(html.includes('Visitante'), html);
  assert.ok(html.includes('Ana'), html);
  assert.ok(html.includes('Casa 1'), html);
  assert.ok(html.includes('cadastrado em 20/10 às 22:15 por João'), html);
  assert.ok(html.includes('--tipo-visitante'), html);
});

caso("nome com D'Ávila & <b> aparece escapado", () => {
  const { htmlVinculo } = fnsVinculo();
  const html = htmlVinculo({
    tipo_pessoa: 'morador', nome_morador: "D'Ávila & <b>", unidade: '<img src=x onerror=alert(1)>',
    cadastrado_por: '<script>',
  }, UNIDADES);
  assert.ok(html.includes('D&#39;Ávila &amp; &lt;b&gt;'), html);
  assert.ok(!html.includes('<b>'), html);
  assert.ok(!html.includes('<img'), html);
  assert.ok(!html.includes('<script>'), html);
});

// ---- Perfis
caso('perfil operador vê "Este acesso não é da portaria" com link para o painel', () => {
  const { modoDeAcesso } = carregar(['modoDeAcesso']);
  assert.strictEqual(modoDeAcesso({ role: 'operador', cliente_id: 'c1' }), 'negado');
  assert.strictEqual(modoDeAcesso({ role: 'super_admin' }), 'negado');
  assert.strictEqual(modoDeAcesso(null), 'negado');
  assert.strictEqual(modoDeAcesso({ role: 'portaria', cliente_id: 'c1' }), 'portaria');
  assert.strictEqual(modoDeAcesso({ role: 'admin_cliente', cliente_id: 'c1' }), 'admin');
  assert.strictEqual(modoDeAcesso({ role: 'portaria' }), 'negado'); // sem condomínio
  const aviso = PAGINA.match(/<section[^>]*id="tela-aviso"[\s\S]*?<\/section>/);
  assert.ok(aviso, 'tela-aviso não encontrada');
  assert.ok(aviso[0].includes('Este acesso não é da portaria'), aviso[0]);
  assert.ok(/href="\/dashboard"/.test(aviso[0]), aviso[0]);
});

// ---- Login próprio do porteiro (sem escolha de turno no aparelho)
function rodarEntrar(valor, senha = 'segredo1', captcha = captchaLib.criarCaptcha({}), resposta = { data: { user: { id: 'auth-1' } }, error: null }) {
  const els = {
    'login-email': { value: valor }, 'login-senha': { value: senha },
    'login-erro': { textContent: '' }, 'botao-entrar': { disabled: false },
  };
  const chamadas = [];
  const perfis = [];
  const { f } = carregarComContexto(['entrar'], {
    $: (id) => els[id],
    usuarioPortariaLib,
    sb: { auth: { signInWithPassword: async (cred) => { chamadas.push(cred); return resposta; } } },
    carregarPerfil: async (u) => { perfis.push(u); },
    captchaLib,
    captcha,
  });
  return f.entrar({ preventDefault() {} }).then(() => ({ chamadas, perfis, els }));
}

caso('login com "José.PraiaDoCastelo" entra com o e-mail técnico', async () => {
  const { chamadas, perfis } = await rodarEntrar('  José.PraiaDoCastelo ');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(chamadas)), [{ email: 'jose.praiadocastelo@porteiro.invalid', password: 'segredo1' }]);
  assert.strictEqual(perfis.length, 1);
});

caso('login com e-mail normal continua valendo (síndico)', async () => {
  const { chamadas } = await rodarEntrar(' Sindica@Exemplo.com.br ');
  assert.strictEqual(chamadas[0].email, 'sindica@exemplo.com.br');
});

caso('com captcha ligado, o porteiro entra mandando o token', async () => {
  const { chamadas } = await rodarEntrar('jose.castelo', 'segredo1', { obterToken: async () => 'tok-9', parar() {} });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(chamadas)),
    [{ email: 'jose.castelo@porteiro.invalid', password: 'segredo1', options: { captchaToken: 'tok-9' } }]);
});

caso('captcha falhou → mensagem anti-robô, botão volta e não chama o Supabase', async () => {
  const { chamadas, els } = await rodarEntrar('jose.castelo', 'segredo1', { obterToken: async () => { throw new Error('x'); } });
  assert.strictEqual(chamadas.length, 0);
  assert.strictEqual(els['login-erro'].textContent, captchaLib.MSG_FALHA);
  assert.strictEqual(els['botao-entrar'].disabled, false);
});

caso('Supabase recusou o captcha → mensagem anti-robô', async () => {
  const { els, perfis } = await rodarEntrar('jose.castelo', 'segredo1', { obterToken: async () => 'tok', parar() {} },
    { data: {}, error: { code: 'captcha_failed', message: 'captcha protection: request disallowed' } });
  assert.strictEqual(els['login-erro'].textContent, captchaLib.MSG_FALHA);
  assert.strictEqual(perfis.length, 0);
});

caso('login vazio não chama o Supabase', async () => {
  const { chamadas, els } = await rodarEntrar('   ');
  assert.strictEqual(chamadas.length, 0);
  assert.ok(els['login-erro'].textContent);
});

caso('campo de login aceita usuário: texto, sem maiúscula automática, rótulo "E-mail ou usuário"', () => {
  const tag = PAGINA.match(/<input[^>]*id="login-email"[^>]*>/)[0];
  assert.ok(/type="text"/.test(tag), tag);
  assert.ok(/autocapitalize="none"/.test(tag), tag);
  assert.ok(/autocomplete="username"/.test(tag), tag);
  assert.ok(!/inputmode="email"/.test(tag), tag);
  assert.ok(/<label[^>]*for="login-email"[^>]*>E-mail ou usuário<\/label>/.test(PAGINA));
  const srcs = [...PAGINA.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(srcs.includes('/js/usuario-portaria.js'), 'lib do usuário carregada');
  assert.ok(extrair(FONTE, 'async function entrar(').includes('usuarioPortariaLib.paraLogin('));
});

caso('página não pede porteiro: sem tela de turno, sem porteiro guardado, nunca chama /api/admin/porteiros', () => {
  ['/api/admin/porteiros', 'CHAVE_PORTEIRO', 'porteiroGuardado', 'esquecerPorteiro', 'porteiroAtual',
    'porteiro_id', 'lombada-portaria-porteiro', 'mostrarTurno', 'escolherPorteiro', 'tela-turno', 'botao-trocar']
    // A única menção à chave antiga é a limpeza única no carregamento.
    .forEach((t) => assert.ok(!FONTE.replace("localStorage.removeItem('lombada-portaria-porteiro')", '').includes(t), `sobrou ${t}`));
  ['tela-turno', 'Trocar porteiro', 'Quem está no turno', 'lista-porteiros', 'botao-trocar']
    .forEach((t) => assert.ok(!PAGINA.includes(t), `sobrou ${t} no HTML`));
});

caso('carregarListas da portaria só pede unidades e vínculos, depois abre o app', async () => {
  const urls = [];
  let abriu = 0;
  const { f, ctx } = carregarComContexto(['carregarListas'], {
    cliente: { id: 'c1' }, modo: 'portaria', unidades: [],
    chamarApi: async (url) => { urls.push(url); return [{ id: 'u1', nome: 'Casa 1' }]; },
    recarregarVinculos: async () => {},
    abrirApp: () => { abriu++; },
    falhaAoCarregar: (t) => { throw new Error(`falhou: ${t}`); },
    encodeURIComponent,
  });
  await f.carregarListas();
  assert.deepStrictEqual(urls, ['/api/admin/unidades?cliente_id=c1']);
  assert.strictEqual(abriu, 1);
  assert.strictEqual(ctx.unidades.length, 1);
});

caso('topo mostra o nome do login e o botão Sair', () => {
  const els = { 'topo-cliente': {}, 'topo-quem': {} };
  const rodarAbrir = (perfil, modo) => {
    const { f } = carregarComContexto(['abrirApp'], {
      $: (id) => els[id], cliente: { nome: 'Praia do Castelo' }, perfil, modo, abaAtual: 'cadastrar',
      mostrarTela: () => {}, trocarAba: () => {}, preCarregarLeitor: () => {},
    });
    f.abrirApp();
    return els['topo-quem'].textContent;
  };
  assert.ok(rodarAbrir({ nome: 'José Santos' }, 'portaria').includes('José Santos'));
  assert.ok(rodarAbrir({ nome: 'Síndica Ana' }, 'admin').includes('Síndica Ana'));
  assert.strictEqual(els['topo-cliente'].textContent, 'Praia do Castelo');
  const i = PAGINA.indexOf('<header class="topo">');
  assert.ok(PAGINA.slice(i, PAGINA.indexOf('</header>', i)).includes('data-acao="sair"'));
});

caso('rede de segurança: lombada leu 1 caractere diferente e a cadastrada não passou', () => {
  const { correcaoSugerida } = carregar(['correcaoSugerida']);
  const cap = (placa) => ({ placa, timestamp: '2026-10-22T10:00:00Z' });
  assert.strictEqual(correcaoSugerida('ABC1D23', [cap('ABC1D28')]), 'ABC1D28');
  assert.strictEqual(correcaoSugerida('ABC1D23', [cap('ABC1D28'), cap('ABC1D23')]), null); // a cadastrada passou
  assert.strictEqual(correcaoSugerida('ABC1D23', [cap('ABC1323')]), null); // mesma placa na grafia antiga
  assert.strictEqual(correcaoSugerida('ABC1D23', [cap('XYZ9K88')]), null);
  assert.strictEqual(correcaoSugerida('ABC1D23', [cap('SEM PLACA'), cap('')]), null);
  assert.strictEqual(correcaoSugerida('ABC1234', [cap('ABC1284')]), 'ABC1284');
  assert.strictEqual(correcaoSugerida('ABC1D23', []), null);
});

caso('rede de segurança ignora placa lida que já tem cadastro vigente (outro carro conhecido)', () => {
  const { correcaoSugerida } = carregar(['correcaoSugerida']);
  const cap = (placa) => ({ placa, timestamp: '2026-10-22T10:00:00Z' });
  const indice = vinculoPlacaLib.indexarVinculos([
    { placa: 'ABC1D28', encerrado_em: null, vigente_desde: null, criado_em: '2026-01-01T00:00:00Z' },
    { placa: 'ABC1D29', encerrado_em: '2026-05-01T00:00:00Z', vigente_desde: null, criado_em: '2026-01-01T00:00:00Z' },
  ]);
  assert.strictEqual(correcaoSugerida('ABC1D23', [cap('ABC1D28')], indice), null);
  assert.strictEqual(correcaoSugerida('ABC1D23', [cap('ABC1D28'), cap('ABC1D29')], indice), 'ABC1D29'); // encerrado não conta
  assert.strictEqual(correcaoSugerida('ABC1D23', [cap('ABC1D28')], new Map()), 'ABC1D28');
});

caso('rede de segurança só no cadastro feito pela entrada (não pela lista "Sem cadastro")', () => {
  const { redeSeAplica } = carregar(['redeSeAplica']);
  const salvo = { id: 'v1' };
  assert.strictEqual(redeSeAplica('portaria', 'entrada', salvo), true);
  assert.strictEqual(redeSeAplica('portaria', 'lista', salvo), false);
  assert.strictEqual(redeSeAplica('admin', 'entrada', salvo), false);
  assert.strictEqual(redeSeAplica('portaria', 'entrada', null), false);
  assert.strictEqual(redeSeAplica('portaria', 'entrada', {}), false);
  const daLista = extrair(FONTE, 'function cadastrarDaLista(');
  assert.ok(daLista.indexOf("origemCadastro = 'lista'") > daLista.indexOf('recomecar()'), 'marca a origem depois de recomeçar');
  assert.ok(extrair(FONTE, 'function recomecar(').includes("origemCadastro = 'entrada'"));
  assert.ok(extrair(FONTE, 'async function aoSalvar(').includes('iniciarRede(r.salvo, c, origemCadastro)'));
  assert.ok(extrair(FONTE, 'function iniciarRede(').includes('redeSeAplica(modo, origem, salvo)'));
});

caso('editar a placa com o formulário aberto mantém unidade/nome/tipo e só recarrega o vínculo', () => {
  const els = {};
  const el = (id) => els[id] || (els[id] = { id, hidden: true, value: '', textContent: '', innerHTML: '', blur() {} });
  const { f, ctx } = carregarComContexto(
    ['aoDigitarPlaca', 'atualizarVinculoNoFormulario', 'desenharVinculoNoFormulario', 'criarCadastro', 'corpoCadastro', 'limparPlacaDigitada',
      'htmlVinculo', 'nomeUnidadeDe'],
    {
      $: el, indiceVinculos: vinculoPlacaLib.indexarVinculos([
        { placa: 'XYZ9A88', nome_morador: 'Rita', tipo_pessoa: 'morador', encerrado_em: null, vigente_desde: null, criado_em: '2026-01-01T00:00:00Z' },
      ]),
      unidades: UNIDADES, vinculoMostrado: null,
      etapa: (q) => { ctx.etapaAtual = q; }, confirmarPlaca: () => { ctx.confirmou = (ctx.confirmou || 0) + 1; },
      mostrarConferencia: (p) => { ctx.conferida = p; },
    },
  );
  vm.runInContext("var cadastro = criarCadastro({ contexto: () => ({}), enviar: async () => ({}) });", ctx);
  const cad = ctx.cadastro;
  cad.formularioNovo({ placa: 'XYZ9A87' });
  cad.escolherUnidade('u1'); cad.definirNome('Rita'); cad.escolherTipo('morador');
  el('etapa-formulario').hidden = false;
  el('campo-placa').value = 'XYZ9A8';
  f.aoDigitarPlaca();
  assert.strictEqual(ctx.confirmou, undefined, 'placa incompleta com formulário aberto não reabre nada');
  el('campo-placa').value = 'XYZ9A88';
  f.aoDigitarPlaca();
  const e = cad.estado();
  assert.strictEqual(e.placa, 'XYZ9A88');
  assert.strictEqual(e.unidadeId, 'u1');
  assert.strictEqual(e.nome, 'Rita');
  assert.strictEqual(e.tipo, 'morador');
  assert.strictEqual(e.temVinculo, true, 'a nova placa tem cadastro');
  assert.strictEqual(ctx.confirmou, undefined, 'não reabre o formulário (que zeraria tudo)');
  assert.strictEqual(ctx.etapaAtual, undefined, 'formulário continua aberto');
  assert.strictEqual(el('sem-vinculo').hidden, true);
  assert.strictEqual(el('form-vinculo').hidden, false);
  assert.ok(el('form-vinculo').innerHTML.includes('Rita'), 'mostra o cadastro que será trocado');
  assert.strictEqual(ctx.conferida, 'XYZ9A88');
  el('campo-placa').value = 'XYZ9A89';
  f.aoDigitarPlaca();
  assert.strictEqual(cad.estado().temVinculo, false);
  assert.strictEqual(cad.estado().unidadeId, 'u1');
  assert.strictEqual(el('sem-vinculo').hidden, false);
  assert.strictEqual(el('form-vinculo').hidden, true);
});

caso('ORT e modelo pré-carregados depois do login, sem bloquear a tela', () => {
  const abrir = extrair(FONTE, 'function abrirApp(');
  assert.ok(abrir.includes('preCarregarLeitor()'));
  const pre = extrair(FONTE, 'function preCarregarLeitor(');
  assert.ok(pre.includes('cameraPlaca.preCarregar'), 'usa o preCarregar da câmera');
  assert.ok(/setTimeout|requestIdleCallback/.test(pre), 'fora do caminho da tela');
  assert.ok(!/await\s+preCarregarLeitor/.test(FONTE), 'ninguém espera o pré-carregamento');
});

caso('link para o manual na tela de login', () => {
  ['tela-login'].forEach((id) => {
    const i = PAGINA.indexOf(`id="${id}"`);
    const trecho = PAGINA.slice(i, PAGINA.indexOf('</section>', i));
    assert.ok(trecho.includes('href="/portaria/manual.html"'), id);
  });
});

// ---- Manual da portaria
const MANUAL = ler('portaria/manual.html');
const secao = (id) => { const i = MANUAL.indexOf(`<h2 id="${id}">`); return MANUAL.slice(i, MANUAL.indexOf('<h2', i + 4)); };
const semTags = (h) => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');

caso('manual: "Sim" e "Manter" não registram visita; nada muda', () => {
  const t = semTags(secao('visitante'));
  assert.ok(!/registra a nova visita/.test(t));
  assert.match(t, /Sim: nada muda; o cadastro continua com a unidade\./);
  assert.match(t, /Manter[^.]*faz o mesmo/);
});

caso('manual: "Sem cadastro" fora da tabela de tipos escolhíveis, explicado à parte como selo', () => {
  const s3 = secao('salvar');
  const tabela = s3.slice(s3.indexOf('<table'), s3.indexOf('</table>'));
  assert.ok(!tabela.includes('Sem cadastro'), 'não é um tipo que se escolhe');
  assert.match(semTags(s3), /Sem cadastro[^.]*selo[^.]*placa sem dono/i);
});

caso('manual e tela de login dizem o mesmo sobre as credenciais', () => {
  const frase = 'Entre com o seu usuário (ou e-mail) e a sua senha. Cada porteiro tem o próprio login. O síndico também pode entrar com o login do painel.';
  assert.ok(semTags(secao('turno')).includes(frase), 'manual');
  const i = PAGINA.indexOf('id="tela-login"');
  assert.ok(semTags(PAGINA.slice(i, PAGINA.indexOf('</section>', i))).includes(frase), 'tela de login');
});

caso('manual §1: login próprio, senha esquecida com o síndico ou a Protector, Sair no fim do turno', () => {
  const t = semTags(secao('turno'));
  assert.ok(!/Trocar porteiro|lista de porteiros|toque no seu nome/i.test(t), t);
  assert.match(t, /Esqueceu a senha\? Peça ao síndico ou à Protector/);
  assert.match(t, /fim do turno, toque em Sair/);
  assert.ok(!/Trocar porteiro/.test(MANUAL));
});

caso('manual §7: aviso vale nos 3 min após salvar e só para o acesso da portaria', () => {
  const t = semTags(secao('correcao'));
  assert.match(t, /3 minutos depois de salvar/);
  assert.match(t, /só no acesso da portaria/);
  assert.match(t, /não aparece[^.]*lista Sem cadastro/);
});

// ---- Suspeita só do próprio condomínio
caso('suspeita: só exclui quando a API diz que é deste condomínio; falha da API não exclui; cache na sessão', async () => {
  const { suspeitasDoCondominio } = carregar(['suspeitasDoCondominio']);
  const perguntas = [];
  const respostas = { AAA1A11: { suspeita_de: 'AAA1A17' }, BBB2B22: {}, CCC3C33: 'falha' };
  const perguntar = async (placa) => {
    perguntas.push(placa);
    if (respostas[placa] === 'falha') throw new Error('rede');
    return respostas[placa];
  };
  const cache = new Map();
  const fora = await suspeitasDoCondominio(['AAA1A11', 'BBB2B22', 'CCC3C33'], perguntar, cache);
  assert.deepStrictEqual([...fora], ['AAA1A11']);
  assert.ok(!cache.has('CCC3C33'), 'falha não vai para o cache');
  const fora2 = await suspeitasDoCondominio(['AAA1A11', 'BBB2B22', 'CCC3C33'], perguntar, cache);
  assert.deepStrictEqual([...fora2], ['AAA1A11']);
  assert.deepStrictEqual(perguntas, ['AAA1A11', 'BBB2B22', 'CCC3C33', 'CCC3C33']);
});

caso('lista sem cadastro: suspeita de outro condomínio continua na lista', async () => {
  const { suspeitasDoCondominio } = carregar(['suspeitasDoCondominio']);
  const semCadastroLib = require('../site/js/sem-cadastro');
  const capturas = [{ placa: 'AAA1A11', timestamp: '2026-10-22T10:00:00Z' }, { placa: 'BBB2B22', timestamp: '2026-10-22T10:01:00Z' }];
  const suspeitas = await suspeitasDoCondominio(['AAA1A11', 'BBB2B22'], async (p) => (p === 'AAA1A11' ? { suspeita_de: 'X' } : {}), new Map());
  const lista = semCadastroLib.listarSemCadastro(capturas, new Map(), { suspeitas });
  assert.deepStrictEqual(lista.map((g) => g.placa), ['BBB2B22']);
  assert.ok(FONTE.includes('/api/admin/veiculos-base?placa='), 'a página pergunta à API de quem é a suspeita');
});

// ---- Aparelho compartilhado
caso('sair limpa rede de segurança e avisos', () => {
  const els = { 'aviso-correcao': { hidden: false }, 'aviso-sucesso': { hidden: false } };
  const limpos = [];
  const { f, ctx } = carregarComContexto(['limparAvisos', 'pararRede'], {
    $: (id) => els[id],
    rede: { id: 'v1', timer: 7, lida: 'ABC1D28' },
    timerSucesso: 9,
    clearInterval: (t) => limpos.push(['i', t]),
    clearTimeout: (t) => limpos.push(['t', t]),
  });
  f.limparAvisos();
  assert.strictEqual(ctx.rede, null);
  assert.strictEqual(ctx.timerSucesso, null);
  assert.strictEqual(els['aviso-correcao'].hidden, true);
  assert.strictEqual(els['aviso-sucesso'].hidden, true);
  assert.deepStrictEqual(limpos, [['i', 7], ['t', 9]]);
  ['function sairDaPagina('].forEach((n) => assert.ok(extrair(FONTE, n).includes('limparAvisos()'), n));
});

caso('cartão do vínculo sem borda lateral grossa', () => {
  assert.ok(!/\.vinculo\s*\{[^}]*border-left/.test(PAGINA));
});

// ---- Estáticos
caso('scripts inline compilam (node --check)', () => {
  assert.ok(SCRIPTS.length >= 2, `achei ${SCRIPTS.length} scripts inline`);
  SCRIPTS.forEach((s, i) => { new vm.Script(s, { filename: `portaria-inline-${i}.js` }); });
});

caso('libs carregadas na ordem certa e câmera da Task 5', () => {
  const srcs = [...PAGINA.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
  const ordem = ['/js/placa.js', '/js/vinculo-placa.js', '/js/leitor-placa.js', '/js/sugestao-nomes.js', '/js/sem-cadastro.js', '/portaria/camera-placa.js'];
  const pos = ordem.map((s) => srcs.indexOf(s));
  pos.forEach((p, i) => assert.ok(p >= 0, `${ordem[i]} não carregado`));
  assert.deepStrictEqual([...pos].sort((a, b) => a - b), pos, `ordem errada: ${srcs.join(', ')}`);
  assert.ok(srcs.includes('/js/texto-seguro.js'));
});

caso('nenhuma imagem sai do aparelho (sem upload/toDataURL/toBlob na página)', () => {
  ['toDataURL', 'toBlob', 'FormData', '.upload(', 'getImageData'].forEach((t) => assert.ok(!FONTE.includes(t), t));
});

caso('innerHTML só recebe vazio ou o retorno de uma função html*() (que escapa)', () => {
  const linhas = FONTE.split('\n').filter((l) => /\.innerHTML\s*=/.test(l));
  assert.ok(linhas.length > 0);
  linhas.forEach((l) => assert.ok(/\.innerHTML\s*=\s*(''|html[A-Z]\w*\()/.test(l), `innerHTML suspeito: ${l.trim()}`));
  assert.ok(!/insertAdjacentHTML|outerHTML\s*=|document\.write/.test(FONTE));
});

caso('selects de clientes/cameras ⊆ grant da v1.8.0; nada de select("*")', () => {
  assert.strictEqual(FONTE.match(/\.select\(\s*['"]\*['"]/g), null);
  const grant = (tabela) => {
    const m = MIGRATION.match(new RegExp(`grant select \\(([^)]*)\\)\\s+on public\\.${tabela} to authenticated`));
    assert.ok(m, `grant de ${tabela}`);
    return new Set(m[1].split(',').map((c) => c.trim()));
  };
  for (const tabela of ['clientes', 'cameras']) {
    const selects = [...FONTE.matchAll(new RegExp(`from\\('${tabela}'\\)\\s*\\.select\\('([^']+)'\\)`, 'g'))].map((x) => x[1]);
    assert.ok(selects.length >= 1, `nenhum select de ${tabela}`);
    const g = grant(tabela);
    selects.forEach((s) => s.split(',').map((c) => c.trim()).forEach((c) => assert.ok(g.has(c), `${tabela}.${c} fora do grant`)));
  }
});

caso('vercel.json: build estático e rotas /portaria antes do catch-all', () => {
  assert.ok(VERCEL.builds.some((b) => b.src === 'portaria/**' && b.use === '@vercel/static'), 'build portaria/** ausente');
  const rotas = VERCEL.routes.map((r) => r.src);
  const iPagina = rotas.indexOf('/portaria');
  const iArquivos = rotas.indexOf('/portaria/(.*)');
  const iFinal = rotas.indexOf('/(.*)');
  assert.ok(iPagina >= 0 && iArquivos >= 0, 'rotas /portaria ausentes');
  assert.strictEqual(VERCEL.routes[iPagina].dest, '/portaria/index.html');
  assert.strictEqual(VERCEL.routes[iArquivos].dest, '/portaria/$1');
  assert.ok(iPagina < iFinal && iArquivos < iFinal, 'rotas depois do catch-all');
});

caso('manifest da portaria', () => {
  const m = JSON.parse(ler('portaria/manifest.webmanifest'));
  assert.strictEqual(m.name, 'Lombada · Portaria');
  assert.strictEqual(m.short_name, 'Portaria');
  assert.strictEqual(m.start_url, '/portaria');
  assert.strictEqual(m.display, 'standalone');
  const tamanhos = m.icons.map((i) => i.sizes);
  assert.ok(tamanhos.includes('192x192') && tamanhos.includes('512x512'), tamanhos.join());
  m.icons.forEach((i) => assert.ok(fs.existsSync(path.join(__dirname, '..', i.src.replace(/^\//, ''))), i.src));
  assert.ok(PAGINA.includes('rel="manifest" href="/portaria/manifest.webmanifest"'));
});

caso('[hidden] vence o display das classes', () => {
  assert.ok(/\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(PAGINA));
});

rodar();
