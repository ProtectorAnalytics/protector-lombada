/**
 * Orquestrador da base única de veículos.
 *
 * Regra de ouro: cada veículo é pago no máximo uma vez. A garantia contra
 * rajada é a reserva (INSERT … ON CONFLICT DO NOTHING na PK Mercosul): só
 * quem reservou chama a API. Nada aqui lança para quem chama — a captura e a
 * notificação nunca podem cair por causa da APIPLACAS.
 */
const { paraMercosul, paraAntiga } = require('../site/js/placa');

const BACKOFF_MIN = [5, 30, 120, 1440];

function criarVeiculosBase({ repo, api, validador, agora = () => new Date() }) {
  const emMin = (min) => new Date(agora().getTime() + min * 60000).toISOString();

  async function travas() {
    const cfg = await repo.lerConfig();
    if (!cfg.ativo) return { ok: false, motivo: 'desligado', cfg };
    if (cfg.saldo_atual !== null && cfg.saldo_atual !== undefined && cfg.saldo_atual <= 0) {
      return { ok: false, motivo: 'sem_saldo', cfg };
    }
    if ((await repo.gastoDoMes()) >= Number(cfg.teto_mensal)) return { ok: false, motivo: 'teto', cfg };
    return { ok: true, cfg };
  }

  async function aplicarResultado(linha, r, cfg, origem) {
    await repo.registrarConsulta({
      placa: linha.placa, resultado: r.resultado, http_status: r.httpStatus,
      duracao_ms: r.duracaoMs, custo: r.consome ? Number(cfg.preco_consulta) : 0, origem,
    });
    const agoraIso = agora().toISOString();
    let campos;
    if (r.resultado === 'ok') {
      campos = { ...r.dados, status: 'consultado', consultado_em: agoraIso, ultimo_erro: null, proxima_tentativa_em: null };
    } else if (r.resultado === 'sem_resultado' || r.resultado === 'placa_invalida') {
      campos = { status: 'sem_resultado', consultado_em: agoraIso, ultimo_erro: r.resultado, proxima_tentativa_em: null };
    } else if (r.resultado === 'token_invalido') {
      await repo.atualizarConfig({ ativo: false });
      campos = { status: 'pendente', ultimo_erro: 'token_invalido' };
    } else if (r.resultado === 'limite') {
      await repo.atualizarConfig({ saldo_atual: 0, saldo_em: agoraIso });
      campos = { status: 'pendente', ultimo_erro: 'limite' };
    } else {
      const t = (linha.tentativas || 0) + 1;
      campos = {
        status: 'erro', tentativas: t, ultimo_erro: r.resultado,
        proxima_tentativa_em: emMin(BACKOFF_MIN[Math.min(t, BACKOFF_MIN.length) - 1]),
      };
    }
    await repo.atualizar(linha.placa, campos);
    return { ...linha, ...campos };
  }

  // Consulta uma placa já existente na base (fila, reconsulta, validação)
  async function consultarAgora(placa, origem) {
    const linha = await repo.buscar(placa);
    if (!linha) return { executou: false, motivo: 'inexistente' };
    const t = await travas();
    if (!t.ok) {
      await repo.atualizar(placa, { ultimo_erro: t.motivo });
      return { executou: false, motivo: t.motivo };
    }
    const r = await api.consultar(placa);
    return { executou: true, linha: await aplicarResultado(linha, r, t.cfg, origem) };
  }

  async function aoPassar({ placa, clienteId }) {
    try {
      const m = paraMercosul(placa);
      if (!m) return null;

      const existente = await repo.buscar(m);
      if (existente) {
        await repo.tocar(m);
        return existente;
      }

      const v = await validador.avaliar({ placa: m, clienteId });
      const base = { placa: m, placa_antiga: paraAntiga(m), visto_por_ultimo_em: agora().toISOString() };

      if (v.suspeita) {
        const linha = { ...base, status: 'suspeita', suspeita_de: v.de, suspeita_cliente_id: clienteId };
        return (await repo.reservar(linha)) ? linha : await repo.buscar(m);
      }

      const linha = { ...base, status: 'pendente', tentativas: 0 };
      if (!(await repo.reservar(linha))) return await repo.buscar(m); // outra chegada reservou

      const t = await travas();
      if (!t.ok) {
        await repo.atualizar(m, { ultimo_erro: t.motivo });
        return { ...linha, ultimo_erro: t.motivo };
      }
      const r = await api.consultar(m);
      return await aplicarResultado(linha, r, t.cfg, 'captura');
    } catch {
      return null;
    }
  }

  return { aoPassar, consultarAgora, travas, aplicarResultado };
}

module.exports = { criarVeiculosBase, BACKOFF_MIN };
