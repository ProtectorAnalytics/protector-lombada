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
// Janela de posse: enquanto alguém consulta a placa, a fila não a enxerga.
const POSSE_MIN = 5;

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
    await repo.registrarConsulta({
      placa: linha.placa, resultado: r.resultado, http_status: r.httpStatus,
      duracao_ms: r.duracaoMs, custo: r.consome ? Number(cfg.preco_consulta) : 0, origem,
    });
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
    const agoraIso = agora().toISOString();
    if (!(await repo.reivindicar(placa, agoraIso, emMin(POSSE_MIN)))) {
      return { executou: false, motivo: 'em_andamento' };
    }
    const r = await api.consultar(placa);
    return { executou: true, linha: await aplicarResultado(linha, r, t.cfg, origem) };
  }

  // Quem reservou (ou liberou) a linha já detém a posse: consulta direto.
  async function consultarReservada(linha, origem) {
    const t = await travas();
    if (!t.ok) {
      await repo.atualizar(linha.placa, { ultimo_erro: t.motivo });
      return { ...linha, ultimo_erro: t.motivo };
    }
    const r = await api.consultar(linha.placa);
    return await aplicarResultado(linha, r, t.cfg, origem);
  }

  async function aoPassar({ placa, clienteId }) {
    try {
      const m = paraMercosul(placa);
      if (!m) return null;

      const existente = await repo.buscar(m);
      if (existente && existente.status === 'suspeita' && existente.suspeita_cliente_id !== clienteId) {
        // A suspeita foi levantada em outro condomínio; aqui vale o juízo deste.
        const aqui = await validador.avaliar({ placa: m, clienteId });
        if (!aqui.suspeita) {
          if (!(await repo.liberarSuspeita(m, existente.suspeita_cliente_id, emMin(POSSE_MIN)))) {
            return await repo.buscar(m); // outra chegada liberou primeiro
          }
          const liberada = { ...existente, status: 'pendente', suspeita_de: null, suspeita_cliente_id: null, tentativas: 0, proxima_tentativa_em: emMin(POSSE_MIN) };
          return await consultarReservada(liberada, 'captura');
        }
      }
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

      const linha = { ...base, status: 'pendente', tentativas: 0, proxima_tentativa_em: emMin(POSSE_MIN) };
      if (!(await repo.reservar(linha))) return await repo.buscar(m); // outra chegada reservou

      return await consultarReservada(linha, 'captura');
    } catch {
      return null;
    }
  }

  // Repescagem: consulta pendentes/erros vencidos. 'em_andamento' e exceção
  // pulam a placa; travas (desligado/teto/sem_saldo) param o lote.
  async function processarFila({ limite = 50 } = {}) {
    const lote = await repo.fila(limite, agora().toISOString());
    let consultadas = 0;
    for (const linha of lote) {
      let r;
      try {
        r = await consultarAgora(linha.placa, 'repescagem');
      } catch {
        continue;
      }
      if (!r.executou) {
        if (r.motivo === 'em_andamento' || r.motivo === 'inexistente') continue;
        return { consultadas, parou: r.motivo };
      }
      consultadas++;
      if (['token_invalido', 'limite'].includes(r.linha.ultimo_erro)) {
        return { consultadas, parou: r.linha.ultimo_erro };
      }
    }
    return { consultadas, parou: null };
  }

  return { aoPassar, consultarAgora, processarFila, travas, aplicarResultado };
}

module.exports = { criarVeiculosBase, BACKOFF_MIN, POSSE_MIN };
