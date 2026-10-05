/**
 * Repositório em memória com a mesma interface de lib/veiculos-base-repo.js.
 * Cada método cede a vez (await) antes de agir, para que chamadas paralelas
 * se intercalem como no banco; reservar() é atômico como o ON CONFLICT.
 */
function criarRepoMemoria({ config = {}, passagens = {} } = {}) {
  const linhas = new Map();
  const consultas = [];
  let cfg = {
    ativo: true, preco_consulta: 0.03, teto_mensal: 150, aviso_percentual: 80,
    saldo_minimo: 200, saldo_atual: null, emails_aviso: ['a@x.com'], avisos_enviados: {},
    ...config,
  };
  const ceder = () => new Promise((r) => setImmediate(r));
  return {
    linhas, consultas,
    async buscar(placa) { await ceder(); return linhas.has(placa) ? { ...linhas.get(placa) } : null; },
    async tocar(placa) { await ceder(); if (linhas.has(placa)) linhas.get(placa).visto_por_ultimo_em = new Date().toISOString(); },
    async reservar(linha) {
      await ceder();
      if (linhas.has(linha.placa)) return false;
      linhas.set(linha.placa, { tentativas: 0, ...linha });
      return true;
    },
    async atualizar(placa, campos) { await ceder(); Object.assign(linhas.get(placa), campos); },
    async reivindicar(placa, agoraIso, ateIso) {
      await ceder();
      const l = linhas.get(placa);
      if (!l || !['pendente', 'erro'].includes(l.status)) return false;
      if (l.proxima_tentativa_em && l.proxima_tentativa_em > agoraIso) return false;
      l.proxima_tentativa_em = ateIso;
      return true;
    },
    async liberarSuspeita(placa, clienteAntigo, posseIso) {
      await ceder();
      const l = linhas.get(placa);
      if (!l || l.status !== 'suspeita' || l.suspeita_cliente_id !== clienteAntigo) return false;
      Object.assign(l, { status: 'pendente', suspeita_de: null, suspeita_cliente_id: null, tentativas: 0, proxima_tentativa_em: posseIso });
      return true;
    },
    async registrarConsulta(c) { await ceder(); consultas.push({ criado_em: new Date().toISOString(), ...c }); },
    async consultasUltimaHora() {
      await ceder();
      const desde = new Date(Date.now() - 3600000).toISOString();
      return consultas.filter((c) => c.custo > 0 && c.criado_em && c.criado_em >= desde).length;
    },
    async ultimoResultado() {
      await ceder();
      return consultas.length ? consultas[consultas.length - 1].resultado : null;
    },
    async lerConfig() { await ceder(); return { ...cfg }; },
    async atualizarConfig(campos) { await ceder(); cfg = { ...cfg, ...campos }; },
    async gastoDoMes() { await ceder(); return consultas.reduce((s, c) => s + c.custo, 0); },
    async contarPassagens(clienteId, placas) {
      await ceder();
      const doCliente = passagens[clienteId] || {};
      return Object.fromEntries(placas.filter((p) => doCliente[p]).map((p) => [p, doCliente[p]]));
    },
    async fila(limite, agoraIso) {
      await ceder();
      return [...linhas.values()]
        .filter((l) => ['pendente', 'erro'].includes(l.status) && (!l.proxima_tentativa_em || l.proxima_tentativa_em <= agoraIso))
        .slice(0, limite).map((l) => ({ ...l }));
    },
    async tamanhoFila() { await ceder(); return [...linhas.values()].filter((l) => ['pendente', 'erro'].includes(l.status)).length; },
    async apagarVistosAntesDe(iso) {
      await ceder();
      let n = 0;
      for (const [p, l] of linhas) if (l.visto_por_ultimo_em < iso) { linhas.delete(p); n++; }
      return n;
    },
    async apagar(placa) { await ceder(); linhas.delete(placa); },
  };
}
module.exports = { criarRepoMemoria };
