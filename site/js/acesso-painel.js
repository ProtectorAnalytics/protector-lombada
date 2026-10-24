/**
 * acesso-painel.js — qual condomínio o painel do síndico abre.
 *
 * Síndico e operador: sempre o próprio (o ?cliente= é ignorado; a RLS também
 * barra). Equipe Protector (super_admin): o condomínio de ?cliente=<uuid>,
 * aberto pelo /admin. Trocar de condomínio é sempre navegação completa
 * (urlDoPainel), nunca troca em memória: escrita em voo não muda de dono.
 *
 * Carregado no browser (window.acessoPainel) e no Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.acessoPainel = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const PAPEL_ADMIN = 'super_admin';
  const PARAMETRO = 'cliente';

  /** @param {unknown} v @returns {boolean} */
  function ehUuid(v) {
    return typeof v === 'string' && RE_UUID.test(v);
  }

  /** @param {string} search ex.: "?cliente=<uuid>&de=…" @returns {string|null} */
  function clienteDaUrl(search) {
    const v = new URLSearchParams(search || '').get(PARAMETRO);
    return v ? v.toLowerCase() : null;
  }

  /**
   * @param {{ role?: string, parametro?: string|null }} p
   * @returns {{ modo: 'proprio' } | { modo: 'admin', clienteId: string }
   *   | { modo: 'ir-admin', motivo: 'sem-cliente'|'cliente-invalido' }}
   */
  function resolverAcesso({ role, parametro } = {}) {
    if (role !== PAPEL_ADMIN) return { modo: 'proprio' };
    if (!parametro) return { modo: 'ir-admin', motivo: 'sem-cliente' };
    if (!ehUuid(parametro)) return { modo: 'ir-admin', motivo: 'cliente-invalido' };
    return { modo: 'admin', clienteId: parametro.toLowerCase() };
  }

  /** Query string dos filtros com o ?cliente na frente (só se for UUID). */
  function comCliente(qs, clienteId) {
    if (!ehUuid(clienteId)) return qs || '';
    const base = `${PARAMETRO}=${clienteId}`;
    return qs ? `${base}&${qs}` : base;
  }

  /** @param {string} clienteId @returns {string} */
  function urlDoPainel(clienteId) {
    return ehUuid(clienteId) ? `/dashboard?${PARAMETRO}=${clienteId.toLowerCase()}` : '/admin';
  }

  // Parte 1 do módulo portaria: o perfil portaria só consulta veículos no
  // painel (a API recusa a escrita dele sem porteiro_id); o cadastro da
  // portaria chega na Parte 2.
  function podeEditarVeiculos(role) {
    return role !== 'portaria';
  }

  // Histórico de alterações dos cadastros: os mesmos papéis que a API
  // /api/admin/historico-cadastros aceita (síndico, operador, equipe Protector).
  const PAPEIS_HISTORICO = new Set(['super_admin', 'admin_cliente', 'operador']);
  function podeVerHistorico(role) {
    return PAPEIS_HISTORICO.has(role);
  }

  // Quadro do PC da portaria (v1.17): quem instala vê o link no painel
  // (síndico, operador, equipe Protector); o porteiro só usa o quadro.
  const PAPEIS_QUADRO_PC = new Set(['super_admin', 'admin_cliente', 'operador']);
  function podeVerQuadroPc(role) {
    return PAPEIS_QUADRO_PC.has(role);
  }

  return { ehUuid, clienteDaUrl, resolverAcesso, comCliente, urlDoPainel, podeEditarVeiculos, podeVerHistorico, podeVerQuadroPc };
});
