/**
 * portaria-gestao.js — tela "Portaria" (unidades e porteiros) montada igual no
 * admin (aba do condomínio, super_admin) e no painel do síndico (admin_cliente).
 *
 * Estado e HTML do editor: site/js/editor-unidades.js; regras dos porteiros:
 * site/js/gestao-porteiros.js. Aqui só DOM, eventos e chamadas à API.
 *
 * Cada seção guarda o seu estado num objeto de contexto (U para unidades,
 * P para porteiros) e as funções abaixo recebem esse contexto.
 *
 * Nada do editor é salvo sem "Salvar"; enquanto salva, o editor fica travado
 * (inert), para nenhuma edição feita no meio sumir. Confirmações usam a função
 * `confirmar` da página (admin: confirmarAcao) ou, sem ela, um diálogo na
 * própria página — nunca as caixas nativas do navegador. Todo texto dinâmico
 * entra escapado ou por textContent.
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
  const XLSX_URL = '/vendor/xlsx-0.20.3/xlsx.full.min.js';
  const COLUNAS_PLANILHA = ['Bloco/Torre/Quadra', 'Unidade', 'Andar', 'Tipo'];
  const MAX_ARQUIVO = 5 * 1024 * 1024;
  const EM_PARALELO = 5;
  let montagens = 0;
  let xlsxPromessa = null;

  // ================================================================ utilidades

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
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

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

  function erroDeCarga(alvo, recarregar) {
    alvo.innerHTML = '<div role="alert" class="pg-vazio">Não foi possível carregar. <button type="button" class="btn btn-ghost btn-sm">Tentar de novo</button></div>';
    alvo.querySelector('button').addEventListener('click', recarregar);
  }

  function alternarSenha(botao) {
    const campo = botao.parentElement.querySelector('input');
    const mostrar = campo.type === 'password';
    campo.type = mostrar ? 'text' : 'password';
    botao.textContent = mostrar ? 'Ocultar' : 'Mostrar';
    botao.setAttribute('aria-pressed', String(mostrar));
  }

  // ================================================================ confirmação

  /**
   * Pergunta da tela: { titulo, destaque?, texto, textoOk, textoCancel }.
   * `destaque` (ex.: nome do bloco) sai em negrito antes do texto; ambos são
   * texto puro. Para o confirmarAcao do admin (que recebe HTML) vira HTML escapado.
   */
  function paraHtml({ destaque, texto }) {
    return `${destaque ? `<strong>${esc(destaque)}</strong> ` : ''}${esc(texto)}`;
  }

  function htmlDialogo() {
    return `<div class="pg-confirma" role="alertdialog" aria-modal="true" aria-labelledby="pg-confirma-t" aria-describedby="pg-confirma-m">
  <h4 id="pg-confirma-t"></h4><p id="pg-confirma-m"></p>
  <div class="pg-form-acoes"><button type="button" class="btn btn-ghost btn-sm" data-r="nao"></button>
  <button type="button" class="btn btn-primary btn-sm" data-r="sim"></button></div></div>`;
  }

  /** Preenche o diálogo só com textContent (nada do que vem do chamador vira HTML). */
  function preencherDialogo(fundo, { titulo, destaque, texto, textoOk, textoCancel }) {
    fundo.querySelector('h4').textContent = titulo;
    const p = fundo.querySelector('p');
    if (destaque) {
      const forte = document.createElement('strong');
      forte.textContent = destaque;
      p.append(forte, ' ');
    }
    p.append(texto || '');
    fundo.querySelector('[data-r="nao"]').textContent = textoCancel || 'Cancelar';
    fundo.querySelector('[data-r="sim"]').textContent = textoOk || 'Confirmar';
  }

  /** Confirmação na própria página (painel sem confirmarAcao). Promise<boolean>. */
  function confirmarNaPagina(pergunta) {
    return new Promise((resolve) => {
      const fundo = document.createElement('div');
      fundo.className = 'pg-confirma-fundo';
      fundo.innerHTML = htmlDialogo();
      preencherDialogo(fundo, pergunta);
      const nao = fundo.querySelector('[data-r="nao"]');
      const sim = fundo.querySelector('[data-r="sim"]');
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

  /** `confirmar` da página recebe HTML (contrato do confirmarAcao); sem ela, o diálogo daqui. */
  function criarConfirmar(daPagina) {
    if (!daPagina) return confirmarNaPagina;
    return (pergunta) => daPagina({ ...pergunta, mensagem: paraHtml(pergunta) });
  }

  // ================================================================ HTML fixo

  function htmlSecaoUnidades(p) {
    return `<section class="pg-secao" data-ref="secao-unidades" aria-labelledby="${p}-un-t">
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
  </section>`;
  }

  function htmlCampoPorteiro(p, nome, rotulo, extra) {
    return `<label class="ed-campo"><span>${rotulo}</span><input type="text" name="${nome}" ${extra} aria-describedby="${p}-e-${nome}"></label>
      <p class="pg-erro" id="${p}-e-${nome}" data-erro="${nome}" role="alert"></p>`;
  }

  function htmlSecaoPorteiros(p) {
    return `<section class="pg-secao" aria-labelledby="${p}-po-t">
    <div class="pg-secao-topo">
      <h3 id="${p}-po-t">Porteiros</h3>
      <button type="button" class="btn btn-primary btn-sm" data-acao="novo-porteiro">Novo porteiro</button>
    </div>
    <p class="pg-dica">Cada porteiro entra na portaria com o próprio usuário e senha; o cadastro sai no nome dele. Sem e-mail: a senha é definida e trocada aqui.</p>
    <form class="pg-form" data-ref="form-porteiro" novalidate hidden>
      ${htmlCampoPorteiro(p, 'nome', 'Nome', 'maxlength="120" autocomplete="off"')}
      ${htmlCampoPorteiro(p, 'usuario', 'Usuário (sugerido, pode editar)', 'maxlength="40" autocomplete="off" autocapitalize="none" spellcheck="false"')}
      <label class="ed-campo"><span>Senha (mínimo ${gp.SENHA_MIN} caracteres; letras e números, sem o nome)</span>
        <span class="pg-senha"><input type="password" name="senha" autocomplete="new-password" aria-describedby="${p}-e-senha">
        <button type="button" class="btn btn-ghost btn-sm" data-acao="mostrar-senha" aria-pressed="false">Mostrar</button></span></label>
      <p class="pg-erro" id="${p}-e-senha" data-erro="senha" role="alert"></p>
      <p class="pg-erro" data-erro="geral" role="alert"></p>
      <div class="pg-form-acoes">
        <button type="button" class="btn btn-ghost btn-sm" data-acao="cancelar-porteiro">Cancelar</button>
        <button type="submit" class="btn btn-primary btn-sm">Criar porteiro</button>
      </div>
    </form>
    <div data-ref="porteiros"><p class="pg-vazio">Carregando…</p></div>
  </section>`;
  }

  function htmlTrocaSenha(id) {
    return `<form class="pg-troca" data-id="${esc(id)}" novalidate>
  <label class="ed-campo"><span>Nova senha (mínimo ${gp.SENHA_MIN} caracteres; letras e números, sem o nome)</span>
    <span class="pg-senha"><input type="password" name="senha" autocomplete="new-password">
    <button type="button" class="btn btn-ghost btn-sm" data-acao="mostrar-senha" aria-pressed="false">Mostrar</button></span></label>
  <p class="pg-dica">Os aparelhos em que esse porteiro já estava logado saem em até 1 hora depois da troca.</p>
  <p class="pg-erro" role="alert"></p>
  <div class="pg-form-acoes">
    <button type="button" class="btn btn-ghost btn-sm" data-acao="cancelar-troca">Cancelar</button>
    <button type="submit" class="btn btn-primary btn-sm">Salvar senha</button>
  </div>
</form>`;
  }

  // ================================================================ unidades: desenho

  const refDe = (raiz) => (n) => raiz.querySelector(`[data-ref="${n}"]`);
  const cartaoDo = (U, bloco) => [...U.raiz.querySelectorAll('.ed-cartao')].find((c) => c.dataset.bloco === bloco);

  function camposDosCartoes(U) {
    const valores = new Map();
    U.raiz.querySelectorAll('.ed-cartao [data-campo]').forEach((el) => valores.set(`${el.dataset.bloco}\u0000${el.dataset.campo}`, el.value));
    return valores;
  }

  /** Redesenha os cartões mantendo o que estava digitado nos campos de lote. */
  function desenharUnidades(U) {
    const valores = camposDosCartoes(U);
    U.ref('cartoes').innerHTML = ed.htmlEditor(U.estado);
    U.raiz.querySelectorAll('.ed-cartao [data-campo]').forEach((el) => {
      const v = valores.get(`${el.dataset.bloco}\u0000${el.dataset.campo}`);
      if (v !== undefined) el.value = v;
    });
    desenharRodape(U);
  }

  function desenharRodape(U) {
    U.ref('contadores').textContent = ed.textoContadores(ed.contadores(U.estado));
    const d = ed.diffParaSalvar(U.estado);
    const mudou = d.novas.length + d.removidas.length + d.alteradas.length > 0;
    U.ref('pendentes').textContent = mudou ? `Alterações não salvas: ${ed.resumoAlteracoes(d)}` : '';
    U.raiz.querySelector('[data-acao="salvar"]').disabled = !mudou || U.salvando;
    U.raiz.querySelector('[data-acao="descartar"]').disabled = !mudou || U.salvando;
  }

  function avisoNoCartao(U, bloco, texto) {
    const c = cartaoDo(U, bloco);
    if (c) c.querySelector('.ed-aviso').textContent = texto;
  }

  /** Trava (ou solta) o editor inteiro enquanto o "Salvar" roda. */
  function travarEditor(U, travar) {
    U.salvando = travar;
    const secao = U.ref('secao-unidades');
    secao.inert = travar;
    secao.setAttribute('aria-busy', String(travar));
    secao.classList.toggle('ed-salvando', travar);
  }

  // ================================================================ unidades: ações

  function criarBloco(U, form) {
    const campo = form.elements.bloco;
    const r = ed.adicionarBloco(U.estado, campo.value);
    U.ref('aviso-bloco').textContent = r.erro || '';
    if (r.erro) { campo.focus(); return; }
    const digitado = campo.value.trim().replace(/\s+/g, ' ').toLowerCase();
    const grupo = ed.grupos(r.estado).find((g) => g.bloco.toLowerCase() === digitado);
    U.estado = r.estado;
    campo.value = '';
    desenharUnidades(U);
    const c = grupo && cartaoDo(U, grupo.bloco);
    if (c) { c.scrollIntoView({ block: 'nearest' }); c.querySelector('[data-campo="texto"]').focus(); }
  }

  function resumoLote(r) {
    const partes = [`${r.adicionadas} adicionada${r.adicionadas === 1 ? '' : 's'}`];
    if (r.repetidas.length) partes.push(`já estavam: ${r.repetidas.join(', ')}`);
    if (r.recusados.length) partes.push(`recusadas (faixa acima de 500 ou nome longo): ${r.recusados.join(', ')}`);
    return partes.join(' · ');
  }

  function adicionarNoCartao(U, bloco) {
    const c = cartaoDo(U, bloco);
    if (!c) return;
    const valor = (campo) => c.querySelector(`[data-campo="${campo}"]`).value;
    const r = ed.adicionarLote(U.estado, { bloco, texto: valor('texto'), andar: valor('andar'), tipo: valor('tipo') });
    if (r.erro) { avisoNoCartao(U, bloco, r.erro); c.querySelector('[data-campo="texto"]').focus(); return; }
    U.estado = r.estado;
    c.querySelector('[data-campo="texto"]').value = '';
    desenharUnidades(U);
    avisoNoCartao(U, bloco, resumoLote(r)); // textContent: nomes digitados nunca viram HTML
    const novo = cartaoDo(U, bloco);
    if (novo) novo.querySelector('[data-campo="texto"]').focus();
  }

  async function removerBlocoComConfirmacao(U, bloco) {
    const g = ed.grupos(U.estado).find((x) => x.bloco === bloco);
    if (!g) return;
    if (g.unidades.length) {
      const ok = await U.confirmar({
        titulo: 'Remover bloco?',
        destaque: bloco,
        texto: `e as ${g.unidades.length} unidades dele saem do editor. Só deixam de aparecer na portaria depois de Salvar.`,
        textoOk: 'Sim, remover', textoCancel: 'Cancelar',
      });
      if (!ok || U.salvando) return;
    }
    U.estado = ed.removerBloco(U.estado, bloco);
    desenharUnidades(U);
  }

  function abrirSeletorTipo(U, botao) {
    const u = U.estado.itens.find((x) => x.chave === botao.dataset.chave);
    if (!u) return;
    botao.outerHTML = ed.htmlSeletorTipo(u);
    const sel = U.raiz.querySelector('select[data-acao="escolher-tipo"]');
    if (sel) sel.focus();
  }

  async function descartarComConfirmacao(U) {
    const ok = await U.confirmar({
      titulo: 'Descartar alterações?',
      texto: 'As unidades voltam a ser as que estão salvas.',
      textoOk: 'Sim, descartar', textoCancel: 'Cancelar',
    });
    if (ok && !U.salvando) await carregarUnidades(U).catch(() => {});
  }

  // ================================================================ planilha

  function baixar(XLSX, linhas, arquivo) {
    const ws = XLSX.utils.json_to_sheet(linhas, { header: COLUNAS_PLANILHA });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Unidades');
    XLSX.writeFile(wb, arquivo);
  }

  async function planilha(U, acao) {
    try {
      const XLSX = await carregarXlsx();
      if (acao === 'modelo') baixar(XLSX, ed.linhasModelo(), 'modelo_unidades.xlsx');
      if (acao === 'exportar') baixar(XLSX, ed.linhasExportar(U.estado), `unidades_${nomeArquivo(U.sessao.nomeCondominio)}.xlsx`);
      if (acao === 'importar') U.ref('arquivo').click();
    } catch (err) { U.toast(err.message, true); }
  }

  function lerArquivo(arquivo) {
    return new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(leitor.result);
      leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
      leitor.readAsArrayBuffer(arquivo);
    });
  }

  async function lerLinhasDaPlanilha(arquivo) {
    const XLSX = await carregarXlsx();
    const wb = XLSX.read(await lerArquivo(arquivo), { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    // blankrows + defval: o índice da linha bate com a planilha (linha = i + 2)
    return ws ? XLSX.utils.sheet_to_json(ws, { defval: '', blankrows: true }) : [];
  }

  async function importar(U, input) {
    const arquivo = input.files && input.files[0];
    input.value = '';
    if (!arquivo || U.salvando) return;
    const caixa = U.ref('importacao');
    if (arquivo.size > MAX_ARQUIVO) { caixa.textContent = 'Arquivo grande demais (máximo 5 MB).'; return; }
    try {
      const rows = await lerLinhasDaPlanilha(arquivo);
      if (U.salvando) return;
      const r = ed.importarLinhas(U.estado, rows);
      U.estado = r.estado;
      desenharUnidades(U);
      caixa.innerHTML = `<p>Planilha carregada: ${plural(r.novas, 'nova', 'novas')}, ${plural(r.atualizadas, 'atualizada', 'atualizadas')}. Confira e clique em <strong>Salvar</strong>.</p>${ed.htmlRecusadas(r.recusadas)}`;
    } catch (err) {
      console.error('Importar unidades:', err);
      caixa.textContent = 'Não foi possível ler a planilha. Use o modelo (.xlsx).';
    }
  }

  // ================================================================ salvar

  async function enviarNovas(U, novas) {
    const res = { falhas: [], recusadas: [], erro: null };
    for (const lote of ed.emLotes(novas)) {
      try {
        const r = await U.api('/unidades', 'POST', { cliente_id: U.sessao.clienteId, unidades: lote });
        (r.recusadas || []).forEach((x) => { const u = lote[x.linha - 1]; res.recusadas.push(`${u ? u.nome : '?'} (${x.motivo})`); });
      } catch (e) { res.falhas.push(...lote); res.erro = e; }
    }
    return res;
  }

  /** DELETE, PUT e POST do diff; devolve o que falhou (formato do diff), o erro e as recusadas. */
  async function enviarDiff(U, d) {
    const id = (x) => encodeURIComponent(x);
    const rem = await emGrupos(d.removidas, (x) => U.api(`/unidades?id=${id(x)}`, 'DELETE'));
    const alt = await emGrupos(d.alteradas, (a) => U.api(`/unidades?id=${id(a.id)}`, 'PUT', a.patch));
    const nov = await enviarNovas(U, d.novas);
    return {
      pendentes: { novas: nov.falhas, removidas: rem.falhas, alteradas: alt.falhas },
      erro: rem.erro || alt.erro || nov.erro,
      recusadas: nov.recusadas,
    };
  }

  function avisarResultado(U, { pendentes, erro, recusadas }) {
    const extra = recusadas.length ? ` Recusadas pelo servidor: ${recusadas.join(', ')}.` : '';
    if (erro) {
      U.ref('importacao').textContent = `Parte não foi salva (${ed.resumoAlteracoes(pendentes)}): ${erro.message || 'tente de novo'}. Confira e clique em Salvar de novo.${extra}`;
      U.toast('Algumas alterações não foram salvas.', true);
      return;
    }
    if (extra) U.ref('importacao').textContent = extra.trim();
    U.toast('Unidades salvas!');
  }

  async function salvar(U, botao) {
    const d = ed.diffParaSalvar(U.estado);
    if (U.salvando || !d.novas.length && !d.removidas.length && !d.alteradas.length) return;
    travarEditor(U, true);
    botao.classList.add('loading');
    desenharRodape(U);
    U.ref('pendentes').textContent = 'Salvando…';
    try {
      const resultado = await enviarDiff(U, d);
      const lista = await U.api(`/unidades?cliente_id=${encodeURIComponent(U.sessao.clienteId)}`, 'GET');
      U.estado = ed.reaplicarPendentes(lista, resultado.pendentes);
      U.aoCarregarUnidades(lista);
      U.ref('importacao').textContent = '';
      desenharUnidades(U);
      avisarResultado(U, resultado);
    } catch (err) {
      // A releitura falhou: o editor continua com tudo, o próximo Salvar só manda o que faltar.
      console.error('Salvar unidades:', err);
      U.toast('Não foi possível confirmar o que foi salvo. Recarregue a lista antes de salvar de novo.', true);
    } finally {
      travarEditor(U, false);
      botao.classList.remove('loading');
      desenharRodape(U);
    }
  }

  // ================================================================ unidades: carga e eventos

  async function carregarUnidades(U) {
    try {
      const lista = await U.api(`/unidades?cliente_id=${encodeURIComponent(U.sessao.clienteId)}`, 'GET');
      U.estado = ed.estadoDoServidor(lista);
      U.carregado = true;
      U.ref('importacao').textContent = '';
      desenharUnidades(U);
      U.aoCarregarUnidades(lista);
      return lista;
    } catch (err) {
      console.error('Carregar unidades:', err);
      U.carregado = false;
      U.estado = ed.estadoDoServidor([]);
      erroDeCarga(U.ref('cartoes'), () => carregarUnidades(U).catch(() => {}));
      desenharRodape(U);
      U.aoCarregarUnidades(null); // null = falhou (a página decide se limpa a lista dela)
      throw err;
    }
  }

  const ACOES_UNIDADES = {
    adicionar: (U, b) => adicionarNoCartao(U, b.dataset.bloco),
    remover: (U, b) => { U.estado = ed.removerUnidade(U.estado, b.dataset.chave); desenharUnidades(U); },
    tipo: (U, b) => abrirSeletorTipo(U, b),
    'remover-bloco': (U, b) => removerBlocoComConfirmacao(U, b.dataset.bloco),
    modelo: (U) => planilha(U, 'modelo'),
    exportar: (U) => planilha(U, 'exportar'),
    importar: (U) => planilha(U, 'importar'),
    salvar: (U, b) => salvar(U, b),
    descartar: (U) => descartarComConfirmacao(U),
  };

  function aoMudarUnidades(U, el) {
    if (U.salvando || !el.dataset) return;
    if (el.dataset.acao === 'escolher-tipo') {
      U.estado = ed.trocarTipo(U.estado, el.dataset.chave, el.value);
      desenharUnidades(U);
    }
    if (el.dataset.ref === 'arquivo') importar(U, el);
  }

  function aoTeclarUnidades(U, e) {
    const el = e.target;
    if (U.salvando || !el.dataset) return;
    if (e.key === 'Enter' && el.dataset.campo && el.tagName === 'INPUT') {
      e.preventDefault();
      adicionarNoCartao(U, el.dataset.bloco);
    }
    if (e.key === 'Escape' && el.dataset.acao === 'escolher-tipo') { e.stopPropagation(); desenharUnidades(U); }
  }

  function ligarEventosUnidades(U) {
    const secao = U.ref('secao-unidades');
    secao.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-acao]');
      if (!b || b.disabled || U.salvando) return;
      const fn = ACOES_UNIDADES[b.dataset.acao];
      if (fn) fn(U, b);
    });
    U.ref('form-bloco').addEventListener('submit', (e) => { e.preventDefault(); if (!U.salvando) criarBloco(U, e.target); });
    secao.addEventListener('keydown', (e) => aoTeclarUnidades(U, e));
    secao.addEventListener('change', (e) => aoMudarUnidades(U, e.target));
    // Seletor de tipo aberto e o foco saiu sem escolher: volta a etiqueta.
    secao.addEventListener('focusout', (e) => {
      const el = e.target;
      if (el.dataset && el.dataset.acao === 'escolher-tipo') setTimeout(() => { if (document.contains(el)) desenharUnidades(U); }, 0);
    });
    // Fechar a aba com alterações (ou salvando): o navegador pergunta com o aviso padrão dele.
    root.addEventListener('beforeunload', (e) => {
      if (!U.salvando && !(U.carregado && ed.temAlteracoes(U.estado))) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  function montarUnidades(raiz, sessao, deps) {
    const U = {
      raiz, sessao, ref: refDe(raiz), estado: ed.estadoDoServidor([]), carregado: false, salvando: false, ...deps,
    };
    ligarEventosUnidades(U);
    return {
      carregar: () => carregarUnidades(U),
      limparAvisos: () => { U.ref('aviso-bloco').textContent = ''; },
      temAlteracoes: () => U.carregado && ed.temAlteracoes(U.estado),
      // Volta ao que estava salvo (sem ir ao servidor): usado ao sair da tela.
      descartar: () => {
        U.estado = ed.estadoDoServidor(Object.keys(U.estado.original).map((id) => ({ id, ...U.estado.original[id] })));
        U.ref('importacao').textContent = '';
        desenharUnidades(U);
      },
    };
  }

  // ================================================================ porteiros

  async function carregarPorteiros(P) {
    try {
      P.lista = await P.api(`/porteiros?cliente_id=${encodeURIComponent(P.sessao.clienteId)}`, 'GET');
      P.ref('porteiros').innerHTML = gp.htmlListaPorteiros(P.lista);
    } catch (err) {
      console.error('Carregar porteiros:', err);
      erroDeCarga(P.ref('porteiros'), () => carregarPorteiros(P));
    }
  }

  const limparErros = (form) => form.querySelectorAll('.pg-erro').forEach((p) => { p.textContent = ''; });

  function abrirNovoPorteiro(P) {
    const f = P.ref('form-porteiro');
    f.reset();
    limparErros(f);
    P.usuarioEditado = false;
    f.hidden = false;
    f.elements.nome.focus();
  }

  function sugerirUsuario(P) {
    const f = P.ref('form-porteiro');
    f.elements.usuario.value = gp.usuarioSugerido({
      nome: f.elements.nome.value, condominio: P.sessao.nomeCondominio, atual: f.elements.usuario.value, editado: P.usuarioEditado,
    });
  }

  function mostrarErrosDoForm(form, erros) {
    Object.entries(erros).forEach(([campo, msg]) => { form.querySelector(`[data-erro="${campo}"]`).textContent = msg; });
    form.elements[Object.keys(erros)[0]].focus();
  }

  async function criarPorteiro(P, form, botao) {
    limparErros(form);
    const v = gp.validarNovoPorteiro({ nome: form.elements.nome.value, usuario: form.elements.usuario.value, senha: form.elements.senha.value });
    if (v.erros) { mostrarErrosDoForm(form, v.erros); return; }
    botao.disabled = true;
    try {
      const criado = await P.api('/porteiros', 'POST', { cliente_id: P.sessao.clienteId, ...v.corpo });
      form.hidden = true;
      form.reset();
      P.toast(`Porteiro criado. Usuário: ${criado.usuario}`);
      await carregarPorteiros(P);
    } catch (err) {
      // 409 é do usuário; o resto (400 do servidor, 403, rede) vai na mensagem geral do formulário
      if (err.status === 409) mostrarErrosDoForm(form, { usuario: gp.mensagemErro(err) });
      else form.querySelector('[data-erro="geral"]').textContent = gp.mensagemErro(err);
    } finally { botao.disabled = false; }
  }

  function abrirTrocaSenha(P, id) {
    P.raiz.querySelectorAll('.pg-troca').forEach((f) => f.remove());
    const botao = P.raiz.querySelector(`[data-acao="senha"][data-id="${CSS.escape(id)}"]`);
    if (!botao) return;
    botao.closest('.pg-item').insertAdjacentHTML('beforeend', htmlTrocaSenha(id));
    P.raiz.querySelector('.pg-troca input[name="senha"]').focus();
  }

  async function trocarSenha(P, form, botao) {
    const erro = form.querySelector('.pg-erro');
    const senha = form.elements.senha.value;
    const alvo = P.lista.find((x) => x.id === form.dataset.id) || {};
    // porteiro antigo com e-mail: vale a parte antes do @, como na API
    erro.textContent = gp.erroSenha(senha, { usuario: String(alvo.usuario || '').split('@')[0], nome: alvo.nome });
    if (erro.textContent) { form.elements.senha.focus(); return; }
    botao.disabled = true;
    try {
      const r = await P.api(`/porteiros?id=${encodeURIComponent(form.dataset.id)}`, 'PUT', { senha });
      form.remove();
      if (r && r.aviso) P.toast(r.aviso, true);
      else P.toast('Senha trocada! Os aparelhos em que o porteiro já estava logado saem em até 1 hora.');
    } catch (err) { erro.textContent = gp.mensagemErro(err); botao.disabled = false; }
  }

  async function desativar(P, id) {
    const p = P.lista.find((x) => x.id === id);
    const ok = await P.confirmar({
      titulo: 'Desativar porteiro?',
      destaque: p ? p.nome : '',
      texto: 'não consegue mais entrar na portaria. Os cadastros feitos por ele continuam. Dá para reativar depois.',
      textoOk: 'Sim, desativar', textoCancel: 'Cancelar',
    });
    if (!ok) return;
    try {
      const r = await P.api(`/porteiros?id=${encodeURIComponent(id)}`, 'DELETE');
      P.toast(r && r.aviso ? r.aviso : 'Porteiro desativado.', !!(r && r.aviso));
      await carregarPorteiros(P);
    } catch (err) { P.toast(gp.mensagemErro(err), true); }
  }

  async function reativar(P, id, botao) {
    botao.disabled = true;
    try {
      await P.api(`/porteiros?id=${encodeURIComponent(id)}`, 'PUT', { ativo: true });
      P.toast('Porteiro reativado.');
      await carregarPorteiros(P);
    } catch (err) { P.toast(gp.mensagemErro(err), true); botao.disabled = false; }
  }

  const ACOES_PORTEIROS = {
    'novo-porteiro': (P) => abrirNovoPorteiro(P),
    'cancelar-porteiro': (P) => { P.ref('form-porteiro').hidden = true; },
    'mostrar-senha': (P, b) => alternarSenha(b),
    senha: (P, b) => abrirTrocaSenha(P, b.dataset.id),
    'cancelar-troca': (P, b) => b.closest('.pg-troca').remove(),
    desativar: (P, b) => desativar(P, b.dataset.id),
    reativar: (P, b) => reativar(P, b.dataset.id, b),
  };

  function ligarEventosPorteiros(P) {
    const secao = P.ref('form-porteiro').closest('.pg-secao');
    secao.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-acao]');
      if (!b || b.disabled) return;
      const fn = ACOES_PORTEIROS[b.dataset.acao];
      if (fn) fn(P, b);
    });
    secao.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      const botao = f.querySelector('button[type="submit"]');
      if (f.dataset.ref === 'form-porteiro') criarPorteiro(P, f, botao);
      else if (f.classList.contains('pg-troca')) trocarSenha(P, f, botao);
    });
    secao.addEventListener('input', (e) => {
      const f = P.ref('form-porteiro');
      if (e.target === f.elements.nome) sugerirUsuario(P);
      if (e.target === f.elements.usuario) P.usuarioEditado = e.target.value.trim() !== '';
    });
  }

  function montarPorteiros(raiz, sessao, deps) {
    const P = { raiz, sessao, ref: refDe(raiz), lista: [], usuarioEditado: false, ...deps };
    ligarEventosPorteiros(P);
    return {
      carregar: () => carregarPorteiros(P),
      fecharForm: () => { P.ref('form-porteiro').hidden = true; },
    };
  }

  // ================================================================ montagem

  /** Sem toast da página: a mensagem aparece no topo da própria tela. */
  function toastNaTela(raiz) {
    return (msg, erro) => {
      const el = raiz.querySelector('[data-ref="mensagem"]');
      el.textContent = msg;
      el.classList.toggle('erro', Boolean(erro));
    };
  }

  function montar(raiz, opcoes) {
    const prefixo = `pg${++montagens}`;
    raiz.classList.add('pg-raiz');
    raiz.innerHTML = '<p class="pg-mensagem" data-ref="mensagem" role="status" aria-live="polite"></p>'
      + `<div class="pg-grade">${htmlSecaoUnidades(prefixo)}${htmlSecaoPorteiros(prefixo)}</div>`;
    const sessao = { clienteId: null, nomeCondominio: '' };
    const deps = {
      api: opcoes.api,
      confirmar: criarConfirmar(opcoes.confirmar),
      toast: opcoes.toast || toastNaTela(raiz),
      aoCarregarUnidades: opcoes.aoCarregarUnidades || (() => {}),
    };
    const unidades = montarUnidades(raiz, sessao, deps);
    const porteiros = montarPorteiros(raiz, sessao, deps);
    return {
      async carregar(novo) {
        if (novo) Object.assign(sessao, { clienteId: novo.clienteId, nomeCondominio: novo.nomeCondominio || '' });
        porteiros.fecharForm();
        unidades.limparAvisos();
        const [un] = await Promise.allSettled([unidades.carregar(), porteiros.carregar()]);
        return un.status === 'fulfilled' ? un.value : [];
      },
      temAlteracoes: unidades.temAlteracoes,
      descartar: unidades.descartar,
    };
  }

  root.portariaGestao = Object.freeze({ montar, confirmarNaPagina });
})(typeof globalThis !== 'undefined' ? globalThis : this);
