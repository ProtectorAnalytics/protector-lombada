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

  /**
   * Devolve { status, label, color } a partir do last_seen ISO.
   * status ∈ 'aguardando' | 'online' | 'alerta' | 'offline'
   */
  function cameraStatus(lastSeen) {
    if (!lastSeen) {
      return { status: 'aguardando', label: 'Aguardando', color: '#3b82f6' };
    }
    const mins = (Date.now() - new Date(lastSeen).getTime()) / 60000;
    if (mins < 1) return { status: 'online', label: 'Agora', color: '#4ade80' };
    if (mins < ONLINE_MAX_MIN) {
      return { status: 'online', label: `Há ${Math.floor(mins)} min`, color: '#4ade80' };
    }
    if (mins < ALERTA_MAX_HOURS * 60) {
      return { status: 'alerta', label: `Há ${Math.floor(mins / 60)}h`, color: '#facc15' };
    }
    if (mins < 1440) {
      return { status: 'offline', label: `Há ${Math.floor(mins / 60)}h`, color: '#ef4444' };
    }
    return { status: 'offline', label: `Há ${Math.floor(mins / 1440)}d`, color: '#ef4444' };
  }

  /**
   * Conta { online, alerta, offline } a partir de uma lista de câmeras
   * com campo last_seen. Reuse do mesmo critério de cameraStatus.
   */
  function countByStatus(cameras) {
    const out = { online: 0, alerta: 0, offline: 0 };
    for (const cam of cameras || []) {
      const s = cameraStatus(cam.last_seen).status;
      if (s === 'online') out.online++;
      else if (s === 'alerta') out.alerta++;
      else out.offline++; // 'aguardando' também conta como offline pro stat global
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
    cameraStatus,
    countByStatus,
    statusByCliente,
  };
});
