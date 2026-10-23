/**
 * gestao-porteiros.js — regras da tela de porteiros (admin e painel do
 * síndico): usuário sugerido editável, validação do "Novo porteiro" com as
 * mesmas regras da API (/api/admin/porteiros) e a lista em HTML escapado.
 * Os eventos ficam em site/js/portaria-gestao.js.
 *
 * Browser: window.gestaoPorteirosLib (depende de window.usuarioPortariaLib). Node: require.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./usuario-portaria'));
  } else {
    root.gestaoPorteirosLib = factory(root.usuarioPortariaLib);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (usuarioLib) {
  'use strict';

  const SENHA_MIN = 6;
  const SENHA_MAX = 72;
  const NOME_MAX = 120;
  const MSG_USUARIO = 'Usuário inválido: use 3 a 40 letras minúsculas, números ou ponto (sem ponto no início, no fim ou repetido).';

  const MAPA_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => (s === null || s === undefined ? '' : String(s).replace(/[&<>"']/g, (c) => MAPA_ESC[c]));

  /** Sugestão "primeironome.condominio" até quem cadastra editar o campo. */
  function usuarioSugerido({ nome, condominio, atual, editado }) {
    if (editado) return atual || '';
    if (!String(nome || '').trim()) return '';
    return usuarioLib.sugerirUsuario(nome, condominio);
  }

  function erroSenha(senha) {
    if (typeof senha !== 'string' || senha.length < SENHA_MIN) return `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`;
    if (senha.length > SENHA_MAX) return `A senha pode ter no máximo ${SENHA_MAX} caracteres.`;
    return '';
  }

  /** { corpo } pronto para o POST, ou { erros: { nome?, usuario?, senha? } }. */
  function validarNovoPorteiro({ nome, usuario, senha }) {
    const erros = {};
    const nomeLimpo = String(nome == null ? '' : nome).trim();
    if (!nomeLimpo) erros.nome = 'Informe o nome do porteiro.';
    else if (nomeLimpo.length > NOME_MAX) erros.nome = `Nome com no máximo ${NOME_MAX} caracteres.`;
    const u = usuarioLib.normalizarUsuario(usuario);
    if (!usuarioLib.usuarioValido(u)) erros.usuario = MSG_USUARIO;
    const s = erroSenha(senha);
    if (s) erros.senha = s;
    if (Object.keys(erros).length) return { erros };
    return { corpo: { nome: nomeLimpo, usuario: u, senha } };
  }

  /** Mensagem para a tela; a API já devolve texto sem detalhe interno. */
  function mensagemErro(err) {
    if (err && err.status === 409) return 'Esse usuário já existe. Escolha outro.';
    return (err && err.message) || 'Não foi possível concluir. Tente de novo.';
  }

  function htmlPorteiro(p) {
    const id = esc(p.id);
    const situacao = p.ativo ? '' : ' <span class="pg-desativado">Desativado</span>';
    const alternar = p.ativo
      ? `<button type="button" class="btn btn-ghost btn-sm" data-acao="desativar" data-id="${id}">Desativar</button>`
      : `<button type="button" class="btn btn-ghost btn-sm" data-acao="reativar" data-id="${id}">Reativar</button>`;
    return `<li class="pg-item${p.ativo ? '' : ' pg-inativo'}">`
      + `<div class="pg-quem"><strong>${esc(p.nome)}</strong>${situacao}<span class="pg-usuario">${esc(p.usuario)}</span></div>`
      + '<div class="pg-acoes">'
      + `<button type="button" class="btn btn-ghost btn-sm" data-acao="senha" data-id="${id}">Trocar senha</button>${alternar}`
      + '</div></li>';
  }

  /** Ativos primeiro, depois desativados; cada grupo por nome. */
  function htmlListaPorteiros(lista) {
    const itens = Array.isArray(lista) ? [...lista] : [];
    if (!itens.length) return '<p class="pg-vazio">Nenhum porteiro cadastrado.</p>';
    itens.sort((a, b) => (a.ativo === b.ativo ? String(a.nome).localeCompare(String(b.nome), 'pt-BR') : a.ativo ? -1 : 1));
    return `<ul class="pg-lista">${itens.map(htmlPorteiro).join('')}</ul>`;
  }

  return Object.freeze({ SENHA_MIN, usuarioSugerido, erroSenha, validarNovoPorteiro, mensagemErro, htmlListaPorteiros, esc });
});
