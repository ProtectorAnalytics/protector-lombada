/**
 * avisos-painel.js — tela "Avisos por e-mail" (Portaria 2.2): quem do
 * condomínio recebe os alertas de excesso e o relatório periódico, e os
 * contatos "Só recebe e-mail" (sem login). Usada no painel do síndico
 * (admin_cliente); `salvarOpcao` também serve à aba Usuários do admin.
 *
 * Regras e HTML da lista: site/js/avisos-email.js (window.avisosEmailLib).
 * API: /api/admin/avisos. Marcar/desmarcar uma opção salva na hora; se falhar,
 * a caixa volta ao que era e o erro aparece. Confirmações usam a função
 * `confirmar` da página ou o diálogo da própria página (portariaGestao) —
 * nunca as caixas nativas do navegador. Texto dinâmico entra escapado.
 *
 * Uso: const t = avisosPainel.montar(elemento, { api, confirmar?, toast? });
 *      await t.carregar({ clienteId });
 * `api(caminho, metodo, corpo)` recebe caminhos como '/avisos?cliente_id=…'.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./avisos-email'));
  } else {
    root.avisosPainel = factory(root.avisosEmailLib);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (lib) {
  'use strict';

  const ERRO_PADRAO = 'Não foi possível salvar. Tente de novo.';
  const esc = lib.esc;
  let montagens = 0;

  const caminhoDo = (id) => `/avisos?id=${encodeURIComponent(id)}`;
  const mensagemDe = (err) => (err && err.message) || ERRO_PADRAO;

  /**
   * Salva na hora a opção da caixa (data-id, data-opcao). Trava a caixa
   * enquanto salva; se a API falhar, desfaz a marcação e avisa.
   * @returns {Promise<boolean>} true quando salvou
   */
  async function salvarOpcao(caixa, { api, avisar }) {
    const { id, opcao } = caixa.dataset;
    if (!id || !lib.OPCOES.includes(opcao)) return false;
    const valor = caixa.checked === true;
    caixa.disabled = true;
    try {
      await api(caminhoDo(id), 'PUT', { [opcao]: valor });
      avisar(`${valor ? 'Ligado' : 'Desligado'}: ${lib.ROTULOS[opcao]}.`, false);
      return true;
    } catch (err) {
      caixa.checked = !valor;
      avisar(mensagemDe(err), true);
      return false;
    } finally {
      caixa.disabled = false;
    }
  }

  function htmlTela(p) {
    return '<p class="pg-mensagem" data-ref="mensagem" role="status" aria-live="polite"></p>'
      + '<p class="pg-dica">Marque quem recebe cada aviso. A mudança vale na hora. '
      + `Para alguém que não usa o painel, crie um contato "${esc(lib.ROTULOS.so_email)}" (sem senha, sem acesso).</p>`
      + '<div class="av-topo"><button type="button" class="btn btn-primary btn-sm" data-acao="novo">'
      + 'Novo contato (só recebe e-mail)</button></div>'
      + `<form class="pg-form" data-ref="form" hidden novalidate aria-labelledby="${p}-ft">`
      + `<h4 id="${p}-ft" data-ref="titulo-form"></h4>`
      + `<label class="ed-campo" for="${p}-nome"><span>Nome</span>`
      + `<input type="text" id="${p}-nome" name="nome" maxlength="${lib.NOME_MAX}" autocomplete="off" aria-describedby="${p}-nome-e"></label>`
      + `<p class="pg-erro" id="${p}-nome-e" data-erro="nome"></p>`
      + `<label class="ed-campo" for="${p}-email"><span>E-mail</span>`
      + `<input type="email" id="${p}-email" name="email" maxlength="254" autocomplete="off" autocapitalize="none" aria-describedby="${p}-email-e"></label>`
      + `<p class="pg-erro" id="${p}-email-e" data-erro="email"></p>`
      + '<p class="pg-erro" role="alert" data-erro="geral"></p>'
      + '<div class="pg-form-acoes"><button type="button" class="btn btn-ghost btn-sm" data-acao="cancelar">Cancelar</button>'
      + '<button type="submit" class="btn btn-primary btn-sm">Salvar</button></div></form>'
      + '<div data-ref="lista"><p class="pg-vazio">Carregando…</p></div>';
  }

  function toastNaTela(raiz) {
    return (msg, erro) => {
      const el = raiz.querySelector('[data-ref="mensagem"]');
      el.textContent = msg;
      el.classList.toggle('erro', Boolean(erro));
    };
  }

  /** Página com confirmarAcao (HTML) ou o diálogo da página do painel (texto). */
  function criarConfirmar(daPagina) {
    if (daPagina) return (p) => daPagina({ ...p, mensagem: esc(p.texto) });
    return (p) => globalThis.portariaGestao.confirmarNaPagina(p);
  }

  function desenhar(T) {
    T.ref.lista.innerHTML = lib.htmlListaAvisos(T.usuarios, { podeEditarContato: true });
  }

  async function carregarLista(T) {
    T.ref.lista.innerHTML = '<p class="pg-vazio">Carregando…</p>';
    try {
      T.usuarios = await T.api(`/avisos?cliente_id=${encodeURIComponent(T.clienteId)}`, 'GET');
      desenhar(T);
    } catch (err) {
      T.ref.lista.innerHTML = '<div role="alert" class="pg-vazio">Não foi possível carregar. '
        + '<button type="button" class="btn btn-ghost btn-sm" data-acao="recarregar">Tentar de novo</button></div>';
    }
  }

  function limparErros(form) {
    form.querySelectorAll('[data-erro]').forEach((el) => { el.textContent = ''; });
    form.querySelectorAll('input').forEach((el) => el.removeAttribute('aria-invalid'));
  }

  function abrirForm(T, contato) {
    const { form } = T.ref;
    T.editando = contato ? contato.id : null;
    limparErros(form);
    T.ref.tituloForm.textContent = contato ? 'Editar contato' : `Novo contato "${lib.ROTULOS.so_email}"`;
    form.elements.nome.value = contato ? contato.nome : '';
    form.elements.email.value = contato ? contato.email : '';
    form.hidden = false;
    form.elements.nome.focus();
  }

  function fecharForm(T) {
    T.ref.form.hidden = true;
    T.editando = null;
  }

  function mostrarErros(form, erros) {
    Object.entries(erros).forEach(([campo, msg]) => {
      form.querySelector(`[data-erro="${campo}"]`).textContent = msg;
      if (form.elements[campo]) form.elements[campo].setAttribute('aria-invalid', 'true');
    });
    const primeiro = Object.keys(erros).find((c) => form.elements[c]);
    if (primeiro) form.elements[primeiro].focus();
  }

  async function salvarContato(T) {
    const { form } = T.ref;
    limparErros(form);
    const r = lib.validarContato({ nome: form.elements.nome.value, email: form.elements.email.value });
    if (r.erros) { mostrarErros(form, r.erros); return; }
    const botao = form.querySelector('[type="submit"]');
    botao.disabled = true;
    try {
      if (T.editando) await T.api(caminhoDo(T.editando), 'PUT', r.corpo);
      else await T.api('/avisos', 'POST', { cliente_id: T.clienteId, ...r.corpo });
      T.toast(T.editando ? 'Contato atualizado.' : 'Contato criado.', false);
      fecharForm(T);
      await carregarLista(T);
    } catch (err) {
      form.querySelector('[data-erro="geral"]').textContent = mensagemDe(err);
    } finally {
      botao.disabled = false;
    }
  }

  async function alternarContato(T, id, ativar) {
    const contato = T.usuarios.find((u) => u.id === id);
    if (!contato) return;
    if (!ativar) {
      const ok = await T.confirmar({
        titulo: 'Desativar contato?', destaque: contato.nome,
        texto: 'deixa de receber os e-mails deste condomínio. Dá para reativar depois.',
        textoOk: 'Desativar', textoCancel: 'Cancelar',
      });
      if (!ok) return;
    }
    try {
      if (ativar) await T.api(caminhoDo(id), 'PUT', { ativo: true });
      else await T.api(caminhoDo(id), 'DELETE');
      T.toast(ativar ? 'Contato reativado.' : 'Contato desativado.', false);
      await carregarLista(T);
    } catch (err) {
      T.toast(mensagemDe(err), true);
    }
  }

  function aoClicar(T, e) {
    const botao = e.target.closest('[data-acao]');
    if (!botao || botao.disabled) return;
    const { acao, id } = botao.dataset;
    if (acao === 'novo') abrirForm(T, null);
    else if (acao === 'cancelar') fecharForm(T);
    else if (acao === 'recarregar') carregarLista(T);
    else if (acao === 'editar') abrirForm(T, T.usuarios.find((u) => u.id === id));
    else if (acao === 'desativar' || acao === 'reativar') alternarContato(T, id, acao === 'reativar');
  }

  function ligarEventos(T, raiz) {
    raiz.addEventListener('click', (e) => aoClicar(T, e));
    raiz.addEventListener('change', (e) => {
      if (!e.target.matches('input[data-opcao]')) return;
      salvarOpcao(e.target, { api: T.api, avisar: T.toast }).then((ok) => {
        const u = ok && T.usuarios.find((x) => x.id === e.target.dataset.id);
        if (u) T.usuarios = T.usuarios.map((x) => (x === u ? { ...u, [e.target.dataset.opcao]: e.target.checked } : x));
      });
    });
    T.ref.form.addEventListener('submit', (e) => { e.preventDefault(); salvarContato(T); });
  }

  function montar(raiz, opcoes) {
    const prefixo = `av${++montagens}`;
    raiz.classList.add('pg-raiz', 'av-raiz');
    raiz.innerHTML = htmlTela(prefixo);
    const ref = {
      form: raiz.querySelector('[data-ref="form"]'),
      tituloForm: raiz.querySelector('[data-ref="titulo-form"]'),
      lista: raiz.querySelector('[data-ref="lista"]'),
    };
    const T = {
      ref, api: opcoes.api, usuarios: [], clienteId: null, editando: null,
      confirmar: criarConfirmar(opcoes.confirmar), toast: opcoes.toast || toastNaTela(raiz),
    };
    ligarEventos(T, raiz);
    return {
      async carregar({ clienteId }) {
        T.clienteId = clienteId;
        fecharForm(T);
        await carregarLista(T);
      },
    };
  }

  return Object.freeze({ montar, salvarOpcao });
});
