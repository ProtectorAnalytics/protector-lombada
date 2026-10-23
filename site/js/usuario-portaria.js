/**
 * usuario-portaria.js — regras do usuário do porteiro: nome de login sem
 * e-mail (a-z 0-9 ponto, 3–40), convertido no e-mail técnico
 * `<usuario>@porteiro.invalid` que o Supabase Auth exige.
 *
 * Nada aqui toca no DOM. Carregado no browser (window.usuarioPortariaLib) e
 * no Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.usuarioPortariaLib = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DOMINIO = 'porteiro.invalid';
  const MIN = 3;
  const MAX = 40;
  const PALAVRAS_VAZIAS = ['condominio', 'residencial', 'do', 'da', 'de'];

  // Remove acentos (NFD + marcas combinantes, faixa escapada).
  const semAcento = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '');

  /** Trim, minúsculas, sem acento; espaços viram ponto. */
  function normalizarUsuario(texto) {
    return semAcento(texto).trim().toLowerCase().replace(/\s+/g, '.');
  }

  /** 3–40 caracteres de a-z 0-9 ., sem ponto no início/fim nem "..". */
  function usuarioValido(u) {
    if (typeof u !== 'string' || u.length < MIN || u.length > MAX) return false;
    return /^[a-z0-9]+(\.[a-z0-9]+)*$/.test(u);
  }

  function emailDoUsuario(u) {
    return `${u}@${DOMINIO}`;
  }

  /** Usuário de um e-mail técnico; null se não for do domínio ou inválido. */
  function usuarioDoEmail(email) {
    const e = String(email == null ? '' : email).trim().toLowerCase();
    const sufixo = `@${DOMINIO}`;
    if (!e.endsWith(sufixo)) return null;
    const u = e.slice(0, -sufixo.length);
    return usuarioValido(u) ? u : null;
  }

  /** Entrada do login: com "@" vale como e-mail; sem "@" vira o e-mail técnico. */
  function paraLogin(entrada) {
    const txt = String(entrada == null ? '' : entrada).trim().toLowerCase();
    if (txt.includes('@')) return txt;
    return emailDoUsuario(normalizarUsuario(txt));
  }

  const soAlfanum = (s) => semAcento(s).toLowerCase().replace(/[^a-z0-9]/g, '');

  /** Sugestão: primeiro nome da pessoa + primeira palavra significativa do condomínio. */
  function sugerirUsuario(nomePessoa, nomeCondominio) {
    const primeiro = soAlfanum(String(nomePessoa || '').trim().split(/\s+/)[0]);
    const palavras = String(nomeCondominio || '').trim().split(/\s+/).map(soAlfanum).filter(Boolean);
    const sig = palavras.find((p) => !PALAVRAS_VAZIAS.includes(p)) || '';
    return [primeiro, sig].filter(Boolean).join('.');
  }

  return Object.freeze({ DOMINIO, normalizarUsuario, usuarioValido, emailDoUsuario, usuarioDoEmail, paraLogin, sugerirUsuario });
});
