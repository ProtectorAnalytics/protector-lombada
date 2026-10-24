/**
 * quadro.js — regras puras do Quadro no PC da portaria (v1.17.0, /quadro):
 *
 *  - navegação ‹ › nas passagens de hoje com "ao vivo" (a mais recente) e
 *    "histórico" (o porteiro voltou); voltar até a mais nova retoma o ao vivo;
 *  - filtro de câmera deste PC (vazio = todas);
 *  - o que a tela mostra de uma passagem: placa, hora, câmera, velocidade,
 *    acima do limite, tipo + nome + unidade de quem estava vinculado NA HORA
 *    (ou "Sem cadastro") e, para visitante/prestador, "cadastrado em … por …";
 *  - perfis aceitos, condomínio lembrado da Protector e links externos que o
 *    programa do Windows pode abrir no navegador.
 *
 * Nada aqui toca no DOM. Carregado no browser (window.quadroLib, depois de
 * placa.js, vinculo-placa.js, unidade.js, severidade-velocidade.js,
 * painel-visual.js e acesso-painel.js) e no Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./placa'), require('./vinculo-placa'), require('./unidade'),
      require('./severidade-velocidade'), require('./painel-visual'), require('./acesso-painel'),
    );
  } else {
    root.quadroLib = factory(
      root.placaLib, root.vinculoPlacaLib, root.unidadeLib,
      root.severidadeVelocidadeLib, root.painelVisualLib, root.acessoPainel,
    );
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (placaLib, vinculoLib, unidadeLib, severidade, visual, acesso) {
  'use strict';

  const FUSO = 'America/Sao_Paulo';
  // Brasil sem horário de verão desde 2019: meia-noite de SP = 03:00 UTC.
  const OFFSET_SP = '-03:00';
  const MAX_PASSAGENS = 50;
  const ORIGEM = 'https://lombada.appps.com.br';
  const PAINEL = `${ORIGEM}/dashboard`;
  const TIPOS_COM_LINHA_CADASTRO = new Set(['visitante', 'prestador']);
  const PAPEIS_DO_CONDOMINIO = new Set(['portaria', 'operador', 'admin_cliente']);

  const tempo = (v) => {
    const t = Date.parse(v);
    return Number.isNaN(t) ? 0 : t;
  };

  // ---------------------------------------------------------------- navegação

  /** Estado vazio: ao vivo, sem passagens. */
  function estadoInicial() {
    return Object.freeze({ lista: Object.freeze([]), indice: 0, aoVivo: true });
  }

  /** Mais recente primeiro, sem id repetido, no máximo MAX_PASSAGENS. */
  function ordenar(passagens) {
    const vistos = new Set();
    const unicas = [];
    for (const c of passagens || []) {
      if (!c || c.id === undefined || c.id === null || vistos.has(c.id)) continue;
      vistos.add(c.id);
      unicas.push(c);
    }
    return unicas.sort((a, b) => tempo(b.timestamp) - tempo(a.timestamp)).slice(0, MAX_PASSAGENS);
  }

  /**
   * Nova leitura das passagens. Ao vivo: mostra a mais recente. No histórico:
   * continua na MESMA passagem (a nova que chegou não troca a tela); se ela
   * saiu da lista, fica na mais antiga que restou.
   */
  function receberPassagens(estado, passagens) {
    const lista = Object.freeze(ordenar(passagens));
    if (estado.aoVivo || lista.length === 0) return Object.freeze({ lista, indice: 0, aoVivo: true });
    const atual = estado.lista[estado.indice];
    const achou = atual ? lista.findIndex((c) => c.id === atual.id) : -1;
    const indice = achou >= 0 ? achou : lista.length - 1;
    return Object.freeze({ lista, indice, aoVivo: indice === 0 });
  }

  const podeVoltar = (estado) => estado.indice < estado.lista.length - 1;
  const podeAvancar = (estado) => estado.indice > 0;

  /** ‹ : passagem anterior (mais antiga). Sai do ao vivo. */
  function voltar(estado) {
    if (!podeVoltar(estado)) return estado;
    return Object.freeze({ ...estado, indice: estado.indice + 1, aoVivo: false });
  }

  /** › : passagem seguinte (mais nova). Chegando na mais nova, volta ao vivo. */
  function avancar(estado) {
    if (!podeAvancar(estado)) return Object.freeze({ ...estado, aoVivo: true });
    const indice = estado.indice - 1;
    return Object.freeze({ ...estado, indice, aoVivo: indice === 0 });
  }

  function irAoVivo(estado) {
    return Object.freeze({ ...estado, indice: 0, aoVivo: true });
  }

  function passagemAtual(estado) {
    return estado.lista[estado.indice] || null;
  }

  /** "2 de 12" (posição da passagem na tela, 1 = a mais recente). */
  function posicao(estado) {
    return estado.lista.length ? `${estado.indice + 1} de ${estado.lista.length}` : '';
  }

  // ---------------------------------------------------------------- câmeras

  function filtrarPorCamera(passagens, cameraId) {
    const lista = Array.isArray(passagens) ? passagens : [];
    return cameraId ? lista.filter((c) => c && c.camera_id === cameraId) : lista;
  }

  /** Câmera guardada neste PC, se ainda é do condomínio; senão '' (todas). */
  function cameraValida(guardada, cameras) {
    if (!guardada) return '';
    return (cameras || []).some((c) => c.id === guardada) ? guardada : '';
  }

  function nomeCamera(cameras, id) {
    const c = (cameras || []).find((x) => x.id === id);
    return (c && (c.nome_exibicao || c.nome)) || 'Câmera';
  }

  // ---------------------------------------------------------------- passagem

  /** "cadastrado em DD/MM às HH:MM por Fulano" só para visitante/prestador. */
  function linhaCadastro(vinculo) {
    if (!vinculo || !TIPOS_COM_LINHA_CADASTRO.has(vinculo.tipo_pessoa)) return '';
    return vinculoLib.rotuloCadastro(vinculo);
  }

  const formatoHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  function horaDe(ts) {
    const t = tempo(ts);
    return t ? formatoHora.format(new Date(t)) : '';
  }

  function nomeUnidadeDe(vinculo, unidades) {
    if (!vinculo) return '';
    const u = vinculo.unidade_id ? (unidades || []).find((x) => x.id === vinculo.unidade_id) : null;
    return u ? unidadeLib.rotuloUnidade(u) : String(vinculo.unidade || '').trim();
  }

  /**
   * O que a tela mostra da passagem. ctx: { indice (vínculos indexados),
   * cameras, unidades, limite }. Só texto: quem desenha escapa tudo.
   */
  function descreverPassagem(captura, ctx) {
    const c = captura || {};
    const { indice, cameras, unidades, limite } = ctx || {};
    const vinculo = indice ? vinculoLib.vinculoNaHora(indice, c.placa, c.timestamp) : null;
    const tipo = vinculoLib.tipoPessoa(vinculo && vinculo.tipo_pessoa);
    const camera = (cameras || []).find((x) => x.id === c.camera_id) || null;
    const medida = severidade.velocidadeMedida(c.velocidade);
    return Object.freeze({
      id: c.id,
      placa: placaLib.limpar(c.placa || '') || String(c.placa || ''),
      hora: horaDe(c.timestamp),
      camera: nomeCamera(cameras, c.camera_id),
      velocidade: medida ? `${c.velocidade} km/h` : '— km/h',
      acimaDoLimite: severidade.acimaDoLimite(c.velocidade, limite),
      temCadastro: Boolean(vinculo),
      tipo: Object.freeze({ id: tipo.id, rotulo: tipo.rotulo, icone: tipo.icone, cor: tipo.cor }),
      nome: vinculo ? String(vinculo.nome_morador || '').trim() : '',
      unidade: nomeUnidadeDe(vinculo, unidades),
      cadastro: linhaCadastro(vinculo),
      recorte: visual.recorteDaFoto(camera, 'mini'),
    });
  }

  // ---------------------------------------------------------------- dia, perfis e links

  /** ISO (UTC) da meia-noite de hoje em São Paulo. */
  function inicioDoDia(agora) {
    const partes = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(agora instanceof Date ? agora : new Date());
    const p = (tipo) => partes.find((x) => x.type === tipo).value;
    return new Date(`${p('year')}-${p('month')}-${p('day')}T00:00:00${OFFSET_SP}`).toISOString();
  }

  /**
   * Quem usa o quadro: portaria, operador e síndico ficam no próprio
   * condomínio; a equipe Protector (super_admin) escolhe numa lista.
   */
  function modoDoPerfil(perfil) {
    if (!perfil) return { modo: 'negado' };
    if (perfil.role === 'super_admin') return { modo: 'admin' };
    if (PAPEIS_DO_CONDOMINIO.has(perfil.role) && perfil.cliente_id) return { modo: 'cliente', clienteId: perfil.cliente_id };
    return { modo: 'negado' };
  }

  /** Condomínio guardado pela Protector neste PC, se ainda está na lista. */
  function clienteLembrado(guardado, clientes) {
    if (!guardado) return '';
    return (clientes || []).some((c) => c.id === guardado) ? guardado : '';
  }

  /** Painel completo de hoje (o painel abre em "Hoje" por padrão). */
  function urlDoPainel(modo, clienteId) {
    if (modo === 'admin' && acesso.ehUuid(clienteId)) return `${PAINEL}?cliente=${clienteId.toLowerCase()}`;
    return PAINEL;
  }

  /** O programa do Windows só abre no navegador páginas da própria Lombada. */
  function urlExternaPermitida(url) {
    if (typeof url !== 'string' || !url) return false;
    try {
      const u = new URL(url);
      return u.protocol === 'https:' && u.host === 'lombada.appps.com.br';
    } catch (e) {
      return false;
    }
  }

  return Object.freeze({
    MAX_PASSAGENS, ORIGEM, estadoInicial, receberPassagens, voltar, avancar, irAoVivo, passagemAtual,
    podeVoltar, podeAvancar, posicao, filtrarPorCamera, cameraValida, nomeCamera, linhaCadastro,
    descreverPassagem, inicioDoDia, modoDoPerfil, clienteLembrado, urlDoPainel, urlExternaPermitida,
  });
});
