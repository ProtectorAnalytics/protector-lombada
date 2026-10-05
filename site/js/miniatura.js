/**
 * miniatura.js — regras puras das miniaturas leves das fotos.
 *
 * - caminhoMiniatura: a miniatura mora na MESMA pasta do original (herda a
 *   política de leitura do bucket, que é por pasta = cliente) e o nome é
 *   derivado do original — nenhuma coluna nova no banco.
 * - escolherFoto: miniatura quando houver; captura antiga (sem miniatura)
 *   cai no original. Nunca imagem quebrada.
 * - criarCacheUrlAssinada: URL assinada reaproveitada por path enquanto
 *   faltar mais que a margem para expirar. O polling não troca a URL e o
 *   navegador reaproveita o cache HTTP. Relógio e assinatura injetados.
 *
 * Usado no servidor (captura, limpeza, admin) e no painel. Carregado no
 * browser (window.miniaturaLib) e no Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.miniaturaLib = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SUFIXO_MINI = '.mini.jpg';
  const EXTENSAO_JPEG = /\.jpe?g$/i;
  const TTL_PADRAO_S = 3600;
  const MARGEM_PADRAO_S = 300;

  /** 'a/b/x.jpg' → 'a/b/x.mini.jpg'. Inválido → null. */
  function caminhoMiniatura(fotoPath) {
    if (typeof fotoPath !== 'string' || fotoPath === '') return null;
    if (fotoPath.toLowerCase().endsWith(SUFIXO_MINI)) return fotoPath;
    const base = EXTENSAO_JPEG.test(fotoPath) ? fotoPath.replace(EXTENSAO_JPEG, '') : fotoPath;
    return base + SUFIXO_MINI;
  }

  /** Miniatura e original de cada foto, sem repetir e sem vazios (assinar em lote, apagar junto). */
  function comMiniaturas(fotoPaths) {
    const saida = [];
    const vistos = new Set();
    const incluir = (p) => { if (p && !vistos.has(p)) { vistos.add(p); saida.push(p); } };
    for (const p of fotoPaths || []) {
      if (typeof p !== 'string' || p === '') continue;
      incluir(caminhoMiniatura(p));
      incluir(p);
    }
    return saida;
  }

  /**
   * { src, original } para desenhar a foto de uma lista: src é a miniatura
   * (ou o original, se não houver miniatura); original é o recuo para quando
   * a miniatura falhar ao carregar (null se não houver recuo).
   */
  function escolherFoto(fotoPath, urls) {
    if (typeof fotoPath !== 'string' || fotoPath === '' || !urls) return null;
    const mini = urls[caminhoMiniatura(fotoPath)] || null;
    const original = urls[fotoPath] || null;
    if (mini) return { src: mini, original: original && original !== mini ? original : null };
    if (original) return { src: original, original: null };
    return null;
  }

  /** A URL guardada ainda serve se faltar MAIS que `margemMs` para expirar. */
  function urlAindaVale(entrada, agoraMs, margemMs) {
    if (!entrada || typeof entrada.url !== 'string' || entrada.url === '') return false;
    if (!Number.isFinite(entrada.expiraEm) || !Number.isFinite(agoraMs)) return false;
    return entrada.expiraEm - agoraMs > margemMs;
  }

  /**
   * Cache de URL assinada por path.
   * assinar(paths, ttlSegundos) → Promise<[{ path, signedUrl, error }]>
   * (formato do createSignedUrls do supabase-js, já desembrulhado de `data`).
   */
  function criarCacheUrlAssinada({ assinar, agora, ttlSegundos = TTL_PADRAO_S, margemSegundos = MARGEM_PADRAO_S }) {
    let entradas = new Map();
    let geracao = 0;
    const margemMs = margemSegundos * 1000;
    const relogio = typeof agora === 'function' ? agora : () => Date.now();

    async function assinarFaltantes(faltam) {
      try {
        const lista = await assinar(faltam, ttlSegundos);
        return Array.isArray(lista) ? lista : [];
      } catch {
        return [];
      }
    }

    function gravar(lista, assinadoEm) {
      const novas = new Map();
      for (const [p, e] of entradas) if (urlAindaVale(e, assinadoEm, 0)) novas.set(p, e);
      const expiraEm = assinadoEm + ttlSegundos * 1000;
      for (const item of lista) {
        if (!item || item.error || !item.signedUrl || typeof item.path !== 'string') continue;
        novas.set(item.path, { url: item.signedUrl, expiraEm });
      }
      entradas = novas;
    }

    /** Mapa path → URL (null se não deu para assinar). Nunca lança. */
    async function urls(paths) {
      const unicos = [...new Set((paths || []).filter((p) => typeof p === 'string' && p !== ''))];
      const agoraMs = relogio();
      const faltam = unicos.filter((p) => !urlAindaVale(entradas.get(p), agoraMs, margemMs));
      if (faltam.length > 0) {
        const minhaGeracao = geracao;
        const assinadoEm = relogio();
        const lista = await assinarFaltantes(faltam);
        // limpar() durante a espera (troca de sessão): nada volta ao cache
        if (minhaGeracao !== geracao) return Object.fromEntries(unicos.map((p) => [p, null]));
        gravar(lista, assinadoEm);
      }
      return Object.fromEntries(unicos.map((p) => [p, entradas.has(p) ? entradas.get(p).url : null]));
    }

    function limpar() { geracao++; entradas = new Map(); }
    function tamanho() { return entradas.size; }

    return { urls, limpar, tamanho };
  }

  return {
    SUFIXO_MINI,
    caminhoMiniatura,
    comMiniaturas,
    escolherFoto,
    urlAindaVale,
    criarCacheUrlAssinada,
  };
});
