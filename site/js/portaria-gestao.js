/**
 * portaria-gestao.js — tela "Portaria" (unidades e porteiros) montada igual no
 * admin (aba do condomínio, super_admin) e no painel do síndico (admin_cliente).
 *
 * Estado e HTML do editor: site/js/editor-unidades.js; regras dos porteiros:
 * site/js/gestao-porteiros.js. Aqui só DOM, eventos e chamadas à API.
 *
 * Nada do editor é salvo sem "Salvar". Confirmações usam a função `confirmar`
 * da página (admin: confirmarAcao) ou, sem ela, um diálogo na própria página —
 * nunca as caixas nativas do navegador. Todo texto dinâmico entra escapado.
 *
 * Uso: const g = portariaGestao.montar(elemento, { api, confirmar?, toast?, aoCarregarUnidades? });
 *      await g.carregar({ clienteId, nomeCondominio });
 * `api(caminho, metodo, corpo)` recebe caminhos como '/unidades?cliente_id=…'.
 */
(function (root) {
  'use strict';

  const ed = root.editorUnidadesLib;
  const gp = root.gestaoPorteirosLib;
  const esc = ed.esc;
  const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  const MAX_ARQUIVO = 5 * 1024 * 1024;
  const EM_PARALELO = 5;
  let montagens = 0;
  let xlsxPromessa = null;

  /** SheetJS sob demanda (mesma versão fixa do painel); reaproveita se já carregado. */
  function carregarXlsx() {
    if (root.XLSX) return Promise.resolve(root.XLSX);
    if (!xlsxPromessa) {
      xlsxPromessa = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = XLSX_URL;
        s.onload = () => resolve(root.XLSX);
        s.onerror = () => { xlsxPromessa = null; reject(new Error('Não foi possível carregar a planilha. Tente de novo.')); };
        document.head.appendChild(s);
      });
    }
    return xlsxPromessa;
  }

  const nomeArquivo = (s) => String(s || 'condominio').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').slice(0, 60);

  /** Roda `fn` em cada item, `EM_PARALELO` por vez; devolve os itens que falharam e o último erro. */
  async function emGrupos(itens, fn) {
    const falhas = [];
    let erro = null;
    for (let i = 0; i < itens.length; i += EM_PARALELO) {
      const grupo = itens.slice(i, i + EM_PARALELO);
      const r = await Promise.allSettled(grupo.map(fn));
      r.forEach((x, j) => { if (x.status === 'rejected') { falhas.push(grupo[j]); erro = x.reason; } });
    }
    return { falhas, erro };
  }

  function htmlEsqueleto(p) {
    return `<p class="pg-mensagem" data-ref="mensagem" role="status" aria-live="polite"></p>
<div class="pg-grade">
  <section class="pg-secao" aria-labelledby="${p}-un-t">
    <div class="pg-secao-topo">
      <h3 id="${p}-un-t">Unidades</h3>
      <span class="ed-contadores" data-ref="contadores"></span>
    </div>
    <p class="pg-dica">Crie os blocos, torres ou quadras e digite as unidades em lote (ex.: <code>101 102</code> ou <code>101-110</code>). Nada é gravado até clicar em <strong>Salvar</strong>.</p>
    <div class="ed-barra">
      <form class="ed-novo-bloco" data-ref="form-bloco" novalidate>
        <label class="ed-campo"><span>Novo bloco/torre/quadra</span>
          <input type="text" name="bloco" maxlength="${ed.MAX_BLOCO}" autocomplete="off" placeholder="Ex.: Torre 1, Bloco A, Quadra 3"></label>
        <button type="submit" class="btn btn-ghost btn-sm">Criar</button>
      </form>
      <div class="ed-planilha">
        <button type="button" class="btn btn-ghost btn-sm" data-acao="modelo">Baixar modelo (.xlsx)</button>
        <button type="button" class="btn btn-ghost btn-sm" data-acao="exportar">Exportar (.xlsx)</button>
        <button type="button" class="btn btn-ghost btn-sm" data-acao="importar">Importar (.xlsx)</button>
        <input type="file" data-ref="arquivo" accept=".xlsx,.xls" hidden>
      </div>
    </div>
    <p class="ed-aviso" data-ref="aviso-bloco" role="status" aria-live="polite"></p>
    <div class="ed-importacao" data-ref="importacao" role="status" aria-live="polite"></div>
    <div class="ed-cartoes" data-ref="cartoes"><p class="ed-vazio">Carregando…</p></div>
    <div class="ed-rodape">
      <span class="ed-pendentes" data-ref="pendentes" role="status" aria-live="polite"></span>
      <button type="button" class="btn btn-ghost btn-sm" data-acao="descartar" disabled>Descartar alterações</button>
      <button type="button" class="btn btn-primary btn-sm" data-acao="salvar" disabled>Salvar</button>
    </div>
  </section>
  <section class="pg-secao" aria-labelledby="${p}-po-t">
    <div class="pg-secao-topo">
      <h3 id="${p}-po-t">Porteiros</h3>
      <button type="button" class="btn btn-primary btn-sm" data-acao="novo-porteiro">Novo porteiro</button>
    </div>
    <p class="pg-dica">Cada porteiro entra na portaria com o próprio usuário e senha; o cadastro sai no nome dele. Sem e-mail: a senha é definida e trocada aqui.</p>
    <form class="pg-form" data-ref="form-porteiro" novalidate hidden>
      <label class="ed-campo"><span>Nome</span><input type="text" name="nome" maxlength="120" autocomplete="off" aria-describedby="${p}-e-nome"></label>
      <p class="pg-erro" id="${p}-e-nome" data-erro="nome" role="alert"></p>
      <label class="ed-campo"><span>Usuário (sugerido, pode editar)</span><input type="text" name="usuario" maxlength="40" autocomplete="off" autocapitalize="none" spellcheck="false" aria-describedby="${p}-e-usuario"></label>
      <p class="pg-erro" id="${p}-e-usuario" data-erro="usuario" role="alert"></p>
      <label class="ed-campo"><span>Senha (mínimo ${gp.SENHA_MIN} caracteres)</span>
        <span class="pg-senha"><input type="password" name="senha" autocomplete="new-password" aria-describedby="${p}-e-senha">
        <button type="button" class="btn btn-ghost btn-sm" data-acao="mostrar-senha" aria-pressed="false">Mostrar</button></span></label>
      <p class="pg-erro" id="${p}-e-senha" data-erro="senha" role="alert"></p>
      <div class="pg-form-acoes">
        <button type="button" class="btn btn-ghost btn-sm" data-acao="cancelar-porteiro">Cancelar</button>
        <button type="submit" class="btn btn-primary btn-sm">Criar porteiro</button>
      </div>
    </form>
    <div data-ref="porteiros"><p class="pg-vazio">Carregando…</p></div>
  </section>
</div>`;
  }

  function htmlTrocaSenha(id) {
    return `<form class="pg-troca" data-id="${esc(id)}" novalidate>
  <label class="ed-campo"><span>Nova senha (mínimo ${gp.SENHA_MIN} caracteres)</span>
    <span class="pg-senha"><input type="password" name="senha" autocomplete="new-password">
    <button type="button" class="btn btn-ghost btn-sm" data-acao="mostrar-senha" aria-pressed="false">Mostrar</button></span></label>
  <p class="pg-erro" role="alert"></p>
  <div class="pg-form-acoes">
    <button type="button" class="btn btn-ghost btn-sm" data-acao="cancelar-troca">Cancelar</button>
    <button type="submit" class="btn btn-primary btn-sm">Salvar senha</button>
  </div>
</form>`;
  }

  /** Confirmação na própria página (painel sem confirmarAcao). Promise<boolean>. */
  function confirmarNaPagina({ titulo, mensagem, textoOk = 'Confirmar', textoCancel = 'Cancelar' }) {
    return new Promise((resolve) => {
      const fundo = document.createElement('div');
      fundo.className = 'pg-confirma-fundo';
      fundo.innerHTML = `<div class="pg-confirma" role="alertdialog" aria-modal="true" aria-labelledby="pg-confirma-t" aria-describedby="pg-confirma-m">
  <h4 id="pg-confirma-t"></h4><p id="pg-confirma-m">${mensagem}</p>
  <div class="pg-form-acoes"><button type="button" class="btn btn-ghost btn-sm" data-r="nao"></button>
  <button type="button" class="btn btn-primary btn-sm" data-r="sim"></button></div></div>`;
      fundo.querySelector('h4').textContent = titulo;
      const nao = fundo.querySelector('[data-r="nao"]');
      const sim = fundo.querySelector('[data-r="sim"]');
      nao.textContent = textoCancel;
      sim.textContent = textoOk;
      const anterior = document.activeElement;
      const fechar = (v) => {
        fundo.remove();
        if (anterior && document.contains(anterior)) anterior.focus({ preventScroll: true });
        resolve(v);
      };
      fundo.addEventListener('click', (e) => {
        if (e.target === fundo) fechar(false);
        else if (e.target.dataset.r) fechar(e.target.dataset.r === 'sim');
      });
      fundo.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); fechar(false); }
        if (e.key === 'Tab') { e.preventDefault(); (document.activeElement === nao ? sim : nao).focus(); }
      });
      document.body.appendChild(fundo);
      nao.focus();
    });
  }

  function montar(raiz, opcoes) {
    const prefixo = `pg${++montagens}`;
    const api = opcoes.api;
    const confirmar = opcoes.confirmar || confirmarNaPagina;
    // Sem toast da página: a mensagem aparece no topo da própria tela.
    const toast = opcoes.toast || ((msg, erro) => {
      const el = raiz.querySelector('[data-ref="mensagem"]');
      el.textContent = msg;
      el.classList.toggle('erro', Boolean(erro));
    });
    const aoCarregarUnidades = opcoes.aoCarregarUnidades || (() => {});
    let ctx = { clienteId: null, nomeCondominio: '' };
    let estado = ed.estadoDoServidor([]);
    let carregado = false;
    let salvando = false;
    let porteiros = [];
    let usuarioEditado = false;

    raiz.classList.add('pg-raiz');
    raiz.innerHTML = htmlEsqueleto(prefixo);
    const ref = (n) => raiz.querySelector(`[data-ref="${n}"]`);
    const cartaoDo = (bloco) => [...raiz.querySelectorAll('.ed-cartao')].find((c) => c.dataset.bloco === bloco);

    // ------------------------------------------------------------ unidades: desenho

    function camposDosCartoes() {
      const valores = new Map();
      raiz.querySelectorAll('.ed-cartao [data-campo]').forEach((el) => valores.set(`${el.dataset.bloco}\u0000${el.dataset.campo}`, el.value));
      return valores;
    }

    function desenharUnidades() {
      const valores = camposDosCartoes();
      ref('cartoes').innerHTML = ed.htmlEditor(estado);
      raiz.querySelectorAll('.ed-cartao [data-campo]').forEach((el) => {
        const v = valores.get(`${el.dataset.bloco}\u0000${el.dataset.campo}`);
        if (v !== undefined) el.value = v;
      });
      desenharRodape();
    }

    function desenharRodape() {
      ref('contadores').textContent = ed.textoContadores(ed.contadores(estado));
      const d = ed.diffParaSalvar(estado);
      const mudou = d.novas.length + d.removidas.length + d.alteradas.length > 0;
      ref('pendentes').textContent = mudou ? `Alterações não salvas: ${ed.resumoAlteracoes(d)}` : '';
      raiz.querySelector('[data-acao="salvar"]').disabled = !mudou || salvando;
      raiz.querySelector('[data-acao="descartar"]').disabled = !mudou || salvando;
    }

    function avisoNoCartao(bloco, texto) {
      const c = cartaoDo(bloco);
      if (c) c.querySelector('.ed-aviso').textContent = texto;
    }

    // ------------------------------------------------------------ unidades: ações

    function criarBloco(form) {
      const campo = form.elements.bloco;
      const r = ed.adicionarBloco(estado, campo.value);
      ref('aviso-bloco').textContent = r.erro || '';
      if (r.erro) { campo.focus(); return; }
      const nome = ed.grupos(r.estado).find((g) => g.bloco.toLowerCase() === campo.value.trim().replace(/\s+/g, ' ').toLowerCase());
      estado = r.estado;
      campo.value = '';
      desenharUnidades();
      const c = nome && cartaoDo(nome.bloco);
      if (c) { c.scrollIntoView({ block: 'nearest' }); c.querySelector('[data-campo="texto"]').focus(); }
    }

    function resumoLote(r) {
      const partes = [`${r.adicionadas} adicionada${r.adicionadas === 1 ? '' : 's'}`];
      if (r.repetidas.length) partes.push(`já estavam: ${r.repetidas.join(', ')}`);
      if (r.recusados.length) partes.push(`recusadas (faixa acima de 500 ou nome longo): ${r.recusados.join(', ')}`);
      return partes.join(' · ');
    }

    function adicionarNoCartao(bloco) {
      const c = cartaoDo(bloco);
      if (!c) return;
      const valor = (campo) => c.querySelector(`[data-campo="${campo}"]`).value;
      const r = ed.adicionarLote(estado, { bloco, texto: valor('texto'), andar: valor('andar'), tipo: valor('tipo') });
      if (r.erro) { avisoNoCartao(bloco, r.erro); c.querySelector('[data-campo="texto"]').focus(); return; }
      estado = r.estado;
      c.querySelector('[data-campo="texto"]').value = '';
      desenharUnidades();
      avisoNoCartao(bloco, resumoLote(r)); // textContent: nomes digitados nunca viram HTML
      const novo = cartaoDo(bloco);
      if (novo) novo.querySelector('[data-campo="texto"]').focus();
    }

    async function removerBlocoComConfirmacao(bloco) {
      const g = ed.grupos(estado).find((x) => x.bloco === bloco);
      if (!g) return;
      if (g.unidades.length) {
        const ok = await confirmar({
          titulo: 'Remover bloco?',
          mensagem: `<strong>${esc(bloco)}</strong> e as ${g.unidades.length} unidades dele saem do editor. Só deixam de aparecer na portaria depois de <strong>Salvar</strong>.`,
          textoOk: 'Sim, remover', textoCancel: 'Cancelar',
        });
        if (!ok) return;
      }
      estado = ed.removerBloco(estado, bloco);
      desenharUnidades();
    }

    function abrirSeletorTipo(botao) {
      const u = estado.itens.find((x) => x.chave === botao.dataset.chave);
      if (!u) return;
      botao.outerHTML = ed.htmlSeletorTipo(u);
      const sel = raiz.querySelector(`select[data-acao="escolher-tipo"]`);
      if (sel) sel.focus();
    }

    // ------------------------------------------------------------ planilha

    function baixar(XLSX, linhas, arquivo, aba) {
      const ws = XLSX.utils.json_to_sheet(linhas, { header: ['Bloco/Torre/Quadra', 'Unidade', 'Andar', 'Tipo'] });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, aba);
      XLSX.writeFile(wb, arquivo);
    }

    async function planilha(acao) {
      try {
        const XLSX = await carregarXlsx();
        if (acao === 'modelo') baixar(XLSX, ed.linhasModelo(), 'modelo_unidades.xlsx', 'Unidades');
        if (acao === 'exportar') baixar(XLSX, ed.linhasExportar(estado), `unidades_${nomeArquivo(ctx.nomeCondominio)}.xlsx`, 'Unidades');
        if (acao === 'importar') ref('arquivo').click();
      } catch (err) { toast(err.message, true); }
    }

    function lerArquivo(arquivo) {
      return new Promise((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onload = () => resolve(leitor.result);
        leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
        leitor.readAsArrayBuffer(arquivo);
      });
    }

    async function importar(input) {
      const arquivo = input.files && input.files[0];
      input.value = '';
      if (!arquivo) return;
      const caixa = ref('importacao');
      if (arquivo.size > MAX_ARQUIVO) { caixa.textContent = 'Arquivo grande demais (máximo 5 MB).'; return; }
      try {
        const XLSX = await carregarXlsx();
        const wb = XLSX.read(await lerArquivo(arquivo), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        // blankrows + defval: o índice da linha bate com a planilha (linha = i + 2)
        const rows = ws ? XLSX.utils.sheet_to_json(ws, { defval: '', blankrows: true }) : [];
        const r = ed.importarLinhas(estado, rows);
        estado = r.estado;
        desenharUnidades();
        caixa.innerHTML = `<p>Planilha carregada: ${r.novas} nova${r.novas === 1 ? '' : 's'}, ${r.atualizadas} atualizada${r.atualizadas === 1 ? '' : 's'}. Confira e clique em <strong>Salvar</strong>.</p>${ed.htmlRecusadas(r.recusadas)}`;
      } catch (err) {
        console.error('Importar unidades:', err);
        caixa.textContent = 'Não foi possível ler a planilha. Use o modelo (.xlsx).';
      }
    }

    // ------------------------------------------------------------ salvar

    async function enviarNovas(novas) {
      const falhas = [];
      const recusadas = [];
      let criadas = 0;
      let jaExistiam = 0;
      let erro = null;
      for (const lote of ed.emLotes(novas)) {
        try {
          const r = await api('/unidades', 'POST', { cliente_id: ctx.clienteId, unidades: lote });
          criadas += r.criadas || 0;
          jaExistiam += r.ja_existiam || 0;
          (r.recusadas || []).forEach((x) => { const u = lote[x.linha - 1]; recusadas.push(`${u ? u.nome : '?'} (${x.motivo})`); });
        } catch (e) { falhas.push(...lote); erro = e; }
      }
      return { falhas, recusadas, criadas, jaExistiam, erro };
    }

    async function salvar(botao) {
      const d = ed.diffParaSalvar(estado);
      if (salvando || !d.novas.length && !d.removidas.length && !d.alteradas.length) return;
      salvando = true;
      botao.classList.add('loading');
      desenharRodape();
      ref('pendentes').textContent = 'Salvando…';
      try {
        const rem = await emGrupos(d.removidas, (id) => api(`/unidades?id=${encodeURIComponent(id)}`, 'DELETE'));
        const alt = await emGrupos(d.alteradas, (a) => api(`/unidades?id=${encodeURIComponent(a.id)}`, 'PUT', a.patch));
        const nov = await enviarNovas(d.novas);
        const pendentes = { novas: nov.falhas, removidas: rem.falhas, alteradas: alt.falhas };
        const erro = rem.erro || alt.erro || nov.erro;
        const lista = await api(`/unidades?cliente_id=${encodeURIComponent(ctx.clienteId)}`, 'GET');
        estado = ed.reaplicarPendentes(lista, pendentes);
        aoCarregarUnidades(lista);
        ref('importacao').textContent = '';
        desenharUnidades();
        const recusadas = nov.recusadas.length ? ` Recusadas pelo servidor: ${nov.recusadas.join(', ')}.` : '';
        if (erro) {
          const resto = ed.resumoAlteracoes(pendentes);
          ref('importacao').textContent = `Parte não foi salva (${resto}): ${erro.message || 'tente de novo'}. Confira e clique em Salvar de novo.${recusadas}`;
          toast('Algumas alterações não foram salvas.', true);
        } else {
          if (recusadas) ref('importacao').textContent = recusadas.trim();
          toast('Unidades salvas!');
        }
      } catch (err) {
        // A releitura falhou: o editor continua com tudo, o próximo Salvar só manda o que faltar.
        console.error('Salvar unidades:', err);
        toast('Não foi possível confirmar o que foi salvo. Recarregue a lista antes de salvar de novo.', true);
      } finally {
        salvando = false;
        botao.classList.remove('loading');
        desenharRodape();
      }
    }

    async function descartar() {
      const ok = await confirmar({
        titulo: 'Descartar alterações?',
        mensagem: 'As unidades voltam a ser as que estão salvas.',
        textoOk: 'Sim, descartar', textoCancel: 'Cancelar',
      });
      if (ok) await carregarUnidades();
    }

    // ------------------------------------------------------------ porteiros

    function desenharPorteiros() {
      ref('porteiros').innerHTML = gp.htmlListaPorteiros(porteiros);
    }

    function erroDeCarga(alvo, recarregar) {
      alvo.innerHTML = '<div role="alert" class="pg-vazio">Não foi possível carregar. <button type="button" class="btn btn-ghost btn-sm">Tentar de novo</button></div>';
      alvo.querySelector('button').addEventListener('click', recarregar);
    }

    async function carregarPorteiros() {
      try {
        porteiros = await api(`/porteiros?cliente_id=${encodeURIComponent(ctx.clienteId)}`, 'GET');
        desenharPorteiros();
      } catch (err) {
        console.error('Carregar porteiros:', err);
        erroDeCarga(ref('porteiros'), carregarPorteiros);
      }
    }

    function formPorteiro() { return ref('form-porteiro'); }

    function limparErros(form) { form.querySelectorAll('.pg-erro').forEach((p) => { p.textContent = ''; }); }

    function abrirNovoPorteiro() {
      const f = formPorteiro();
      f.reset();
      limparErros(f);
      usuarioEditado = false;
      f.hidden = false;
      f.elements.nome.focus();
    }

    function sugerirUsuario() {
      const f = formPorteiro();
      f.elements.usuario.value = gp.usuarioSugerido({
        nome: f.elements.nome.value, condominio: ctx.nomeCondominio, atual: f.elements.usuario.value, editado: usuarioEditado,
      });
    }

    async function criarPorteiro(form, botao) {
      limparErros(form);
      const v = gp.validarNovoPorteiro({ nome: form.elements.nome.value, usuario: form.elements.usuario.value, senha: form.elements.senha.value });
      if (v.erros) {
        Object.entries(v.erros).forEach(([campo, msg]) => { form.querySelector(`[data-erro="${campo}"]`).textContent = msg; });
        form.elements[Object.keys(v.erros)[0]].focus();
        return;
      }
      botao.disabled = true;
      try {
        const criado = await api('/porteiros', 'POST', { cliente_id: ctx.clienteId, ...v.corpo });
        form.hidden = true;
        form.reset();
        toast(`Porteiro criado. Usuário: ${criado.usuario}`);
        await carregarPorteiros();
      } catch (err) {
        const campo = err.status === 409 ? 'usuario' : 'senha';
        form.querySelector(`[data-erro="${campo}"]`).textContent = gp.mensagemErro(err);
        form.elements[campo].focus();
      } finally { botao.disabled = false; }
    }

    function abrirTrocaSenha(id) {
      raiz.querySelectorAll('.pg-troca').forEach((f) => f.remove());
      const botao = raiz.querySelector(`[data-acao="senha"][data-id="${CSS.escape(id)}"]`);
      if (!botao) return;
      botao.closest('.pg-item').insertAdjacentHTML('beforeend', htmlTrocaSenha(id));
      raiz.querySelector('.pg-troca input[name="senha"]').focus();
    }

    async function trocarSenha(form, botao) {
      const erro = form.querySelector('.pg-erro');
      const senha = form.elements.senha.value;
      erro.textContent = gp.erroSenha(senha);
      if (erro.textContent) { form.elements.senha.focus(); return; }
      botao.disabled = true;
      try {
        await api(`/porteiros?id=${encodeURIComponent(form.dataset.id)}`, 'PUT', { senha });
        form.remove();
        toast('Senha trocada!');
      } catch (err) { erro.textContent = gp.mensagemErro(err); botao.disabled = false; }
    }

    async function desativar(id) {
      const p = porteiros.find((x) => x.id === id);
      const ok = await confirmar({
        titulo: 'Desativar porteiro?',
        mensagem: `<strong>${esc(p ? p.nome : '')}</strong> não consegue mais entrar na portaria. Os cadastros feitos por ele continuam. Dá para reativar depois.`,
        textoOk: 'Sim, desativar', textoCancel: 'Cancelar',
      });
      if (!ok) return;
      try {
        await api(`/porteiros?id=${encodeURIComponent(id)}`, 'DELETE');
        toast('Porteiro desativado.');
        await carregarPorteiros();
      } catch (err) { toast(gp.mensagemErro(err), true); }
    }

    async function reativar(id, botao) {
      botao.disabled = true;
      try {
        await api(`/porteiros?id=${encodeURIComponent(id)}`, 'PUT', { ativo: true });
        toast('Porteiro reativado.');
        await carregarPorteiros();
      } catch (err) { toast(gp.mensagemErro(err), true); botao.disabled = false; }
    }

    function alternarSenha(botao) {
      const campo = botao.parentElement.querySelector('input');
      const mostrar = campo.type === 'password';
      campo.type = mostrar ? 'text' : 'password';
      botao.textContent = mostrar ? 'Ocultar' : 'Mostrar';
      botao.setAttribute('aria-pressed', String(mostrar));
    }

    // ------------------------------------------------------------ eventos

    const ACOES = {
      adicionar: (b) => adicionarNoCartao(b.dataset.bloco),
      remover: (b) => { estado = ed.removerUnidade(estado, b.dataset.chave); desenharUnidades(); },
      tipo: (b) => abrirSeletorTipo(b),
      'remover-bloco': (b) => removerBlocoComConfirmacao(b.dataset.bloco),
      modelo: () => planilha('modelo'),
      exportar: () => planilha('exportar'),
      importar: () => planilha('importar'),
      salvar: (b) => salvar(b),
      descartar: () => descartar(),
      'novo-porteiro': () => abrirNovoPorteiro(),
      'cancelar-porteiro': () => { formPorteiro().hidden = true; },
      'mostrar-senha': (b) => alternarSenha(b),
      senha: (b) => abrirTrocaSenha(b.dataset.id),
      'cancelar-troca': (b) => b.closest('.pg-troca').remove(),
      desativar: (b) => desativar(b.dataset.id),
      reativar: (b) => reativar(b.dataset.id, b),
    };

    raiz.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-acao]');
      if (!b || !raiz.contains(b) || b.disabled) return;
      const fn = ACOES[b.dataset.acao];
      if (fn) fn(b);
    });

    raiz.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      const botao = f.querySelector('button[type="submit"]');
      if (f.dataset.ref === 'form-bloco') criarBloco(f);
      else if (f.dataset.ref === 'form-porteiro') criarPorteiro(f, botao);
      else if (f.classList.contains('pg-troca')) trocarSenha(f, botao);
    });

    raiz.addEventListener('keydown', (e) => {
      const el = e.target;
      if (e.key === 'Enter' && el.dataset && el.dataset.campo && el.tagName === 'INPUT') {
        e.preventDefault();
        adicionarNoCartao(el.dataset.bloco);
      }
      if (e.key === 'Escape' && el.dataset && el.dataset.acao === 'escolher-tipo') { e.stopPropagation(); desenharUnidades(); }
    });

    raiz.addEventListener('change', (e) => {
      const el = e.target;
      if (el.dataset && el.dataset.acao === 'escolher-tipo') {
        estado = ed.trocarTipo(estado, el.dataset.chave, el.value);
        desenharUnidades();
      }
      if (el.dataset && el.dataset.ref === 'arquivo') importar(el);
    });

    // Seletor de tipo aberto e o foco saiu sem escolher: volta a etiqueta.
    raiz.addEventListener('focusout', (e) => {
      const el = e.target;
      if (el.dataset && el.dataset.acao === 'escolher-tipo') setTimeout(() => { if (document.contains(el)) desenharUnidades(); }, 0);
    });

    raiz.addEventListener('input', (e) => {
      const f = formPorteiro();
      if (e.target === f.elements.nome) sugerirUsuario();
      if (e.target === f.elements.usuario) usuarioEditado = e.target.value.trim() !== '';
    });

    // Fechar a aba com alterações: o navegador pergunta (aviso padrão dele, fora do nosso controle).
    root.addEventListener('beforeunload', (e) => {
      if (!carregado || !ed.temAlteracoes(estado)) return;
      e.preventDefault();
      e.returnValue = '';
    });

    // ------------------------------------------------------------ carga

    async function carregarUnidades() {
      try {
        const lista = await api(`/unidades?cliente_id=${encodeURIComponent(ctx.clienteId)}`, 'GET');
        estado = ed.estadoDoServidor(lista);
        carregado = true;
        ref('importacao').textContent = '';
        desenharUnidades();
        aoCarregarUnidades(lista);
        return lista;
      } catch (err) {
        console.error('Carregar unidades:', err);
        carregado = false;
        estado = ed.estadoDoServidor([]);
        erroDeCarga(ref('cartoes'), carregarUnidades);
        desenharRodape();
        aoCarregarUnidades(null); // null = falhou (a página decide se limpa a lista dela)
        throw err;
      }
    }

    async function carregar(novo) {
      if (novo) ctx = { clienteId: novo.clienteId, nomeCondominio: novo.nomeCondominio || '' };
      formPorteiro().hidden = true;
      ref('aviso-bloco').textContent = '';
      const [un] = await Promise.allSettled([carregarUnidades(), carregarPorteiros()]);
      return un.status === 'fulfilled' ? un.value : [];
    }

    return {
      carregar,
      temAlteracoes: () => carregado && ed.temAlteracoes(estado),
      // Volta ao que estava salvo (sem ir ao servidor): usado ao sair da tela.
      descartar: () => {
        estado = ed.estadoDoServidor(Object.keys(estado.original).map((id) => ({ id, ...estado.original[id] })));
        ref('importacao').textContent = '';
        desenharUnidades();
      },
    };
  }

  root.portariaGestao = Object.freeze({ montar, confirmarNaPagina });
})(typeof globalThis !== 'undefined' ? globalThis : this);
