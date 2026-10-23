/**
 * usuario-portaria.js — regras do usuário do porteiro: nome de login sem
 * e-mail (a-z 0-9 ponto, 3–40), convertido no e-mail técnico
 * `<usuario>@porteiro.invalid` que o Supabase Auth exige.
 *
 * Também a regra da senha do porteiro (erroSenhaPorteiro), a mesma na API e
 * na tela.
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
  const SENHA_MIN_PORTEIRO = 10;
  const SENHA_MAX_BYTES = 72; // limite do bcrypt no Supabase Auth, em bytes UTF-8
  const PARTE_MIN = 3;
  const DISTINTOS_MIN = 5;
  // Espaços e caracteres invisíveis (largura zero, direção de texto, BOM) não contam.
  const SEM_CONTAR = /[\s\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/gu;
  // Recusadas em qualquer parte da senha (já normalizadas).
  const TRECHOS_PROIBIDOS = Object.freeze(['portaria', 'porteiro', 'senha', 'condominio', '123456', 'abcdef', 'mudar', 'qwerty']);
  // Já normalizadas (minúsculas, sem acento, só letras e números).
  const SENHAS_COMUNS = Object.freeze([
    'portaria123', 'portaria1234', 'porteiro123', 'porteiro1234', '1234567890', '0123456789',
    '12345678910', 'senha12345', 'senha123456', 'mudar12345', 'mudar123456', 'qwerty1234',
    'qwerty12345', 'abc1234567', 'abcd123456', 'admin12345', 'password123', 'condominio123',
  ]);

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

  const MSG_RECUPERACAO_PORTEIRO = 'Porteiro: peça uma nova senha ao síndico ou à Protector.';

  /**
   * "Esqueci minha senha" não serve ao porteiro: sem "@" é usuário de porteiro
   * e o e-mail técnico nunca recebe nada (só gastaria o limite de e-mails do Auth).
   */
  function recuperacaoDePorteiro(entrada) {
    const txt = String(entrada == null ? '' : entrada).trim().toLowerCase();
    return !txt.includes('@') || txt.endsWith(`@${DOMINIO}`);
  }

  const bytesUtf8 = (s) => new TextEncoder().encode(s).length;

  /** Partes do usuário (separadas por ponto) e o primeiro nome, com 3+ caracteres. */
  function partesProibidas(usuario, nome) {
    const doUsuario = String(usuario || '').split('.');
    const primeiroNome = String(nome || '').trim().split(/\s+/)[0];
    return [...doUsuario, primeiroNome].map(soAlfanum).filter((p) => p.length >= PARTE_MIN);
  }

  const MSG_COMUM = 'Essa senha é muito comum ou fácil de adivinhar. Escolha outra.';

  /**
   * Regra da senha do porteiro. Devolve a mensagem do problema ou null se a
   * senha serve: 10+ caracteres sem contar espaços e invisíveis, até 72
   * bytes, letras e números, 5+ caracteres diferentes, nada do usuário nem do
   * primeiro nome e sem palavras/sequências óbvias.
   */
  function erroSenhaPorteiro(senha, { usuario, nome } = {}) {
    const visiveis = typeof senha === 'string' ? [...senha.replace(SEM_CONTAR, '')] : [];
    if (visiveis.length < SENHA_MIN_PORTEIRO) {
      return `A senha precisa ter pelo menos ${SENHA_MIN_PORTEIRO} caracteres (espaços não contam).`;
    }
    if (bytesUtf8(senha) > SENHA_MAX_BYTES) return 'A senha está longa demais. Use uma senha mais curta (acentos ocupam mais espaço).';
    if (!/\p{L}/u.test(senha) || !/\d/.test(senha)) return 'Use letras e números na senha.';
    const distintos = new Set(visiveis.map((c) => semAcento(c).toLowerCase()));
    if (distintos.size < DISTINTOS_MIN) return `Use pelo menos ${DISTINTOS_MIN} caracteres diferentes na senha.`;
    const simples = soAlfanum(senha);
    if (partesProibidas(usuario, nome).some((p) => simples.includes(p))) {
      return 'A senha não pode ter o usuário nem o nome do porteiro.';
    }
    if (SENHAS_COMUNS.includes(simples) || TRECHOS_PROIBIDOS.some((t) => simples.includes(t))) return MSG_COMUM;
    return null;
  }

  return Object.freeze({
    DOMINIO, SENHA_MIN_PORTEIRO, normalizarUsuario, usuarioValido, emailDoUsuario, usuarioDoEmail, paraLogin, sugerirUsuario, erroSenhaPorteiro,
    MSG_RECUPERACAO_PORTEIRO, recuperacaoDePorteiro,
  });
});
