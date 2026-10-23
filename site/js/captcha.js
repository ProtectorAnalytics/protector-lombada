/**
 * captcha.js — verificação anti-robô (Cloudflare Turnstile) no login.
 *
 * O Supabase Auth, com "Enable CAPTCHA protection" ligado, recusa login e
 * "esqueci minha senha" sem um token de captcha. Esta lib dá o token às
 * telas de login (admin, painel e portaria).
 *
 * Feature flag: sem site key (env TURNSTILE_SITE_KEY vazia em /api/config)
 * nada é carregado e obterToken() devolve null — o login fica como antes.
 *
 * Com site key: carrega o script do Turnstile só quando preciso, desenha o
 * widget no container (invisível, só aparece se a Cloudflare pedir um
 * clique), entrega um token por vez e reseta o widget a cada uso (token é
 * de uso único). Tudo inline, sem pop-up: funciona no PWA da portaria.
 *
 * Carregado no browser (window.captchaLib) e no Node (require) para testes.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.captchaLib = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  const MSG_FALHA = 'Não foi possível confirmar que você não é um robô. Tente de novo.';
  const ESPERA_MS = 60000;

  const INERTE = Object.freeze({
    ativo: false,
    iniciar: () => Promise.resolve(),
    obterToken: () => Promise.resolve(null),
    resetar() {},
  });

  /** Site key válida (string não vazia) ou null. */
  function normalizarChave(chave) {
    if (typeof chave !== 'string') return null;
    const limpa = chave.trim();
    return limpa ? limpa : null;
  }

  /** Credenciais do signInWithPassword com o token (sem token, devolve as mesmas). */
  function credenciais(cred, token) {
    if (!token) return cred;
    return { ...cred, options: { ...(cred.options || {}), captchaToken: token } };
  }

  /** Opções de resetPasswordForEmail/signUp com o token (sem token, as mesmas). */
  function opcoes(base, token) {
    if (!token) return base;
    return { ...(base || {}), captchaToken: token };
  }

  /** O Supabase recusou por captcha (ausente, vencido ou inválido)? */
  function ehErroDeCaptcha(error) {
    if (!error) return false;
    if (error.code === 'captcha_failed') return true;
    return /captcha/i.test(String(error.message || ''));
  }

  function carregadorDeScript(win, doc) {
    let carregando = null;
    return function carregar() {
      if (win.turnstile) return Promise.resolve(win.turnstile);
      if (carregando) return carregando;
      carregando = new Promise((resolve, reject) => {
        const s = doc.createElement('script');
        s.src = SCRIPT_URL;
        s.async = true;
        s.defer = true;
        s.onload = () => (win.turnstile ? resolve(win.turnstile) : reject(new Error(MSG_FALHA)));
        s.onerror = () => reject(new Error(MSG_FALHA));
        doc.head.appendChild(s);
      }).catch((e) => { carregando = null; throw e; });
      return carregando;
    };
  }

  /**
   * Cria o captcha de uma tela.
   * @param {{siteKey?: string|null, container?: string|Element, win?: object, doc?: object, esperaMs?: number}} cfg
   */
  function criarCaptcha(cfg = {}) {
    const siteKey = normalizarChave(cfg.siteKey);
    if (!siteKey) return INERTE;

    const win = cfg.win || globalThis;
    const doc = cfg.doc || win.document;
    const esperaMs = cfg.esperaMs || ESPERA_MS;
    const carregarScript = carregadorDeScript(win, doc);
    let widgetId = null;
    let token = null;
    let iniciando = null;
    let espera = [];

    function resetar() {
      token = null;
      if (widgetId === null || !win.turnstile) return;
      try { win.turnstile.reset(widgetId); } catch (_) { /* widget já removido */ }
    }

    function falhar() {
      const fila = espera;
      espera = [];
      fila.forEach((p) => { clearTimeout(p.timer); p.reject(new Error(MSG_FALHA)); });
    }

    function aoReceber(novo) {
      const proximo = espera.shift();
      if (!proximo) { token = novo; return; }
      clearTimeout(proximo.timer);
      proximo.resolve(novo);
      // Fora do callback do Turnstile: o token já foi entregue, prepara o próximo.
      setTimeout(resetar, 0);
    }

    function desenhar(ts) {
      const el = typeof cfg.container === 'string' ? doc.getElementById(cfg.container) : cfg.container;
      if (!el) throw new Error(MSG_FALHA);
      widgetId = ts.render(el, {
        sitekey: siteKey,
        appearance: 'interaction-only',
        language: 'pt-br',
        size: 'flexible',
        'refresh-expired': 'auto',
        callback: aoReceber,
        'expired-callback': () => { token = null; },
        'timeout-callback': () => { token = null; },
        'error-callback': () => { token = null; falhar(); return true; },
      });
    }

    function iniciar() {
      if (!iniciando) {
        iniciando = carregarScript().then(desenhar).catch((e) => { iniciando = null; throw e; });
      }
      return iniciando;
    }

    async function obterToken() {
      await iniciar();
      if (token) {
        const pronto = token;
        resetar();
        return pronto;
      }
      return new Promise((resolve, reject) => {
        const pedido = { resolve, reject, timer: null };
        pedido.timer = setTimeout(() => {
          espera = espera.filter((p) => p !== pedido);
          resetar();
          reject(new Error(MSG_FALHA));
        }, esperaMs);
        espera.push(pedido);
      });
    }

    return Object.freeze({ ativo: true, iniciar, obterToken, resetar });
  }

  return Object.freeze({
    SCRIPT_URL, MSG_FALHA, ESPERA_MS,
    normalizarChave, credenciais, opcoes, ehErroDeCaptcha, criarCaptcha,
  });
});
