/**
 * texto-seguro.js — escape de HTML para texto vindo do banco no painel.
 * Nome de morador, unidade, marca e cor são digitados por usuários: sem
 * escape, viram XSS armazenado no navegador de quem abre a passagem.
 * Serve também dentro de atributos (aspas simples e duplas escapadas).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.textoSeguro = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MAPA = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, (c) => MAPA[c]);
  }
  return { esc };
});
