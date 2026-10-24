/**
 * casca.js — ponte da página /quadro com o programa do Windows (Tauri v2).
 *
 * No navegador comum não há window.__TAURI__: tudo aqui fica inerte (a barra
 * não arrasta, Fixar/minimizar somem, links abrem em nova aba).
 *
 * No programa, a página é remota (https://lombada.appps.com.br/quadro) e só
 * pode chamar o que a capability "quadro-remoto" libera para esta origem:
 * arrastar, minimizar, travar o tamanho, abrir com o Windows e abrir no
 * navegador endereços https://lombada.appps.com.br/* (ver quadro-windows/).
 */
(function (root) {
  'use strict';

  const CHAVE_FIXADO = 'quadro.fixado';
  const T = root.__TAURI__ || null;

  function lerFixado() {
    try { return root.localStorage.getItem(CHAVE_FIXADO) === '1'; } catch (e) { return false; }
  }
  function gravarFixado(v) {
    try { root.localStorage.setItem(CHAVE_FIXADO, v ? '1' : '0'); } catch (e) { /* sem storage: vale só nesta sessão */ }
  }

  function janela() {
    return T && T.window && T.window.getCurrentWindow ? T.window.getCurrentWindow() : null;
  }

  const ehApp = Boolean(janela());

  // Fixar = a barra deixa de arrastar e a janela deixa de mudar de tamanho.
  function aplicarFixado(fixado, barra) {
    const j = janela();
    if (!j) return Promise.resolve();
    barra.querySelectorAll('[data-tauri-drag-region], .barra').forEach((el) => {
      if (fixado) el.removeAttribute('data-tauri-drag-region');
      else el.setAttribute('data-tauri-drag-region', '');
    });
    document.documentElement.classList.toggle('fixado', fixado);
    return j.setResizable(!fixado).catch(() => {});
  }

  function minimizar() {
    const j = janela();
    return j ? j.minimize().catch(() => {}) : Promise.resolve();
  }

  // Os módulos dos plugins (autostart, opener) podem entrar em window.__TAURI__
  // depois deste script: consulta na hora de usar, não no carregamento.
  const plugin = (nome) => (root.__TAURI__ && root.__TAURI__[nome]) || null;
  const autostart = ehApp ? {
    ligado: () => (plugin('autostart') ? plugin('autostart').isEnabled() : Promise.reject(new Error('sem autostart'))),
    ligar: () => plugin('autostart').enable(),
    desligar: () => plugin('autostart').disable(),
  } : null;

  /** Abre no navegador padrão (programa) ou numa aba nova (navegador comum). */
  function abrirExterno(url, permitida) {
    if (!permitida(url)) return Promise.resolve(false);
    const opener = plugin('opener');
    if (opener && opener.openUrl) return opener.openUrl(url).then(() => true, () => false);
    root.open(url, '_blank', 'noopener'); // com noopener o retorno é sempre null
    return Promise.resolve(true);
  }

  root.cascaQuadro = Object.freeze({ ehApp, lerFixado, gravarFixado, aplicarFixado, minimizar, autostart, abrirExterno });
})(typeof window !== 'undefined' ? window : globalThis);
