/**
 * camera-status.js — fonte ÚNICA da lógica de online/offline.
 *
 * Carregado pelo browser (admin/index.html, dashboard/index.html) via
 * <script src="/js/camera-status.js"> e pelo server-side
 * (api/admin/dashboard.js) via require. UMD permite os dois usos.
 *
 * Thresholds calibrados pra realidade de lombada educativa: condomínio
 * pode ficar horas sem carro, e câmera ALPHADIGI sem heartbeat só
 * atualiza last_seen quando passa veículo.
 *
 *   online   < 30min          (verde)
 *   alerta   30min – 6h       (amarelo)
 *   offline  > 6h ou nunca    (vermelho)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.cameraStatusLib = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ONLINE_MAX_MIN = 30;
  const ALERTA_MAX_HOURS = 6;
  // Tabela única de cores por status: o item e o total usam a mesma
  const STATUS_COLORS = {
    aguardando: '#3b82f6',
    online: '#4ade80',
    alerta: '#facc15',
    offline: '#ef4444',
  };

  /**
   * Devolve { status, label, color } a partir do last_seen ISO.
   * status ∈ 'aguardando' | 'online' | 'alerta' | 'offline'
   */
  function cameraStatus(lastSeen) {
    if (!lastSeen) {
      return { status: 'aguardando', label: 'Aguardando', color: STATUS_COLORS.aguardando };
    }
    const mins = (Date.now() - new Date(lastSeen).getTime()) / 60000;
    if (mins < 1) return { status: 'online', label: 'Agora', color: STATUS_COLORS.online };
    if (mins < ONLINE_MAX_MIN) {
      return { status: 'online', label: `Há ${Math.floor(mins)} min`, color: STATUS_COLORS.online };
    }
    if (mins < ALERTA_MAX_HOURS * 60) {
      const label = mins < 60 ? `Há ${Math.floor(mins)} min` : `Há ${Math.floor(mins / 60)}h`;
      return { status: 'alerta', label, color: STATUS_COLORS.alerta };
    }
    if (mins < 1440) {
      return { status: 'offline', label: `Há ${Math.floor(mins / 60)}h`, color: STATUS_COLORS.offline };
    }
    return { status: 'offline', label: `Há ${Math.floor(mins / 1440)}d`, color: STATUS_COLORS.offline };
  }

  /**
   * Conta { online, alerta, offline, aguardando } a partir de uma lista de
   * câmeras com campo last_seen. Reuse do mesmo critério de cameraStatus.
   *
   * `offline` inclui as 'aguardando' (contrato do stat global, que soma
   * online + alerta + offline = total). `aguardando` é o subconjunto das que
   * nunca transmitiram, para a UI distinguir câmera nova de câmera caída.
   */
  function countByStatus(cameras) {
    const out = { online: 0, alerta: 0, offline: 0, aguardando: 0 };
    for (const cam of cameras || []) {
      const s = cameraStatus(cam.last_seen).status;
      if (s === 'online') out.online++;
      else if (s === 'alerta') out.alerta++;
      else {
        out.offline++;
        if (s === 'aguardando') out.aguardando++;
      }
    }
    return out;
  }

  /**
   * Retorna { online, total } por cliente_id, usando o mesmo critério.
   */
  function statusByCliente(cameras) {
    const map = {};
    for (const cam of cameras || []) {
      const cid = cam.cliente_id;
      if (!cid) continue;
      if (!map[cid]) map[cid] = { online: 0, total: 0 };
      map[cid].total++;
      if (cameraStatus(cam.last_seen).status === 'online') map[cid].online++;
    }
    return map;
  }

  return {
    ONLINE_MAX_MIN,
    ALERTA_MAX_HOURS,
    STATUS_COLORS,
    cameraStatus,
    countByStatus,
    statusByCliente,
  };
});
