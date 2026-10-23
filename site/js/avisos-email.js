/**
 * avisos-email.js — regras de tela dos avisos por e-mail (Portaria 2.2):
 * quem recebe alertas de excesso e o relatório periódico sai do cadastro de
 * usuários. Também o contato "Só recebe e-mail" (role so_email, sem login).
 *
 * validarContato é a mesma regra de nome/e-mail da API (/api/admin/avisos).
 * htmlListaAvisos devolve HTML com todo valor escapado. Nada aqui toca no DOM.
 * Browser: window.avisosEmailLib. Node: require.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.avisosEmailLib = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ROTULOS = Object.freeze({
    so_email: 'Só recebe e-mail',
    recebe_alertas: 'Recebe alertas de excesso',
    recebe_relatorio: 'Recebe relatório periódico',
  });
  const OPCOES = ['recebe_alertas', 'recebe_relatorio'];
  const ROLE_CONTATO = 'so_email';
  const SEM_OPCOES = ['portaria', 'super_admin'];
  const NOME_MAX = 80;
  const EMAIL_MAX = 254;
  const DOMINIO_PORTEIRO = '@porteiro.invalid';
  // Mesma expressão de isValidEmail (lib/validators.js).
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // Defesa extra: e-mail de contato sem aspas, sinais de HTML, parênteses,
  // crase, barra invertida ou espaço (nenhum e-mail real precisa deles aqui).
  const EMAIL_PROIBIDOS = /['"<>()`\\\s]/;
  // No nome, apóstrofo fica (D'Ávila); só < e > são recusados.
  const NOME_PROIBIDOS = /[<>]/;
  // Controle (C0/DEL) e invisíveis/direção de texto (zero-width, bidi, BOM).
  const INVISIVEIS = /[\u0000-\u001F\u007F​-‏‪-‮⁠-⁩﻿]/g;

  const MAPA_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => (s === null || s === undefined ? '' : String(s).replace(/[&<>"']/g, (c) => MAPA_ESC[c]));

  const limparNome = (nome) => (typeof nome === 'string' ? nome.replace(INVISIVEIS, '').trim() : '');
  const normalizarEmail = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : '');

  /** Mensagem de erro do nome, ou '' quando serve. */
  function erroNome(nome) {
    if (!nome) return 'Informe o nome.';
    if (nome.length > NOME_MAX) return `Nome com no máximo ${NOME_MAX} caracteres.`;
    if (NOME_PROIBIDOS.test(nome)) return 'O nome não pode ter os sinais < ou >.';
    return '';
  }

  /** Mensagem de erro do e-mail (já normalizado), ou '' quando serve. */
  function erroEmail(email) {
    if (!email || email.length > EMAIL_MAX || !EMAIL_RE.test(email) || EMAIL_PROIBIDOS.test(email)) return 'Informe um e-mail válido.';
    if (email.endsWith(DOMINIO_PORTEIRO)) return 'Use um e-mail real, que receba mensagens.';
    return '';
  }

  /** { corpo: { nome, email } } normalizado, ou { erros: { nome?, email? } }. */
  function validarContato({ nome, email } = {}) {
    const corpo = { nome: limparNome(nome), email: normalizarEmail(email) };
    const erros = {};
    const n = erroNome(corpo.nome);
    const e = erroEmail(corpo.email);
    if (n) erros.nome = n;
    if (e) erros.email = e;
    return Object.keys(erros).length ? { erros } : { corpo };
  }

  function htmlOpcao(u, opcao) {
    const marcado = u[opcao] === true ? ' checked' : '';
    return `<label class="av-opcao"><input type="checkbox" data-opcao="${opcao}" data-id="${esc(u.id)}"${marcado}> `
      + `${esc(ROTULOS[opcao])}</label>`;
  }

  function htmlAcoesContato(u) {
    const id = esc(u.id);
    const alternar = u.ativo
      ? `<button type="button" class="btn btn-ghost btn-sm" data-acao="desativar" data-id="${id}">Desativar</button>`
      : `<button type="button" class="btn btn-ghost btn-sm" data-acao="reativar" data-id="${id}">Reativar</button>`;
    return '<div class="av-acoes">'
      + `<button type="button" class="btn btn-ghost btn-sm" data-acao="editar" data-id="${id}">Editar</button>${alternar}</div>`;
  }

  function htmlUsuario(u, podeEditarContato) {
    const contato = u.role === ROLE_CONTATO;
    const selo = contato ? ` <span class="av-selo">${esc(ROTULOS.so_email)}</span>` : '';
    const situacao = u.ativo ? '' : ' <span class="av-desativado">Desativado</span>';
    const opcoes = SEM_OPCOES.includes(u.role) ? '' : `<div class="av-opcoes">${OPCOES.map((o) => htmlOpcao(u, o)).join('')}</div>`;
    const acoes = contato && podeEditarContato ? htmlAcoesContato(u) : '';
    return `<li class="av-item${u.ativo ? '' : ' av-inativo'}">`
      + `<div class="av-quem"><strong>${esc(u.nome)}</strong>${selo}${situacao}<span class="av-email">${esc(u.email)}</span></div>`
      + `${opcoes}${acoes}</li>`;
  }

  /** Ativos primeiro, depois desativados; cada grupo por nome. Porteiros nunca aparecem. */
  function htmlListaAvisos(usuarios, { podeEditarContato = false } = {}) {
    const itens = (Array.isArray(usuarios) ? usuarios : []).filter((u) => u && u.role !== 'portaria');
    if (!itens.length) return '<p class="av-vazio">Nenhum usuário ou contato cadastrado.</p>';
    const ordenados = [...itens].sort((a, b) => (a.ativo === b.ativo
      ? String(a.nome).localeCompare(String(b.nome), 'pt-BR') : a.ativo ? -1 : 1));
    return `<ul class="av-lista">${ordenados.map((u) => htmlUsuario(u, podeEditarContato)).join('')}</ul>`;
  }

  return Object.freeze({
    ROTULOS, OPCOES, NOME_MAX, validarContato, limparNome, normalizarEmail, erroNome, erroEmail, htmlListaAvisos, esc,
  });
});
