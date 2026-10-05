/**
 * Decide quais e-mails de aviso da APIPLACAS mandar. Função pura: quem envia
 * e grava `avisos_enviados` é o cron.
 *
 * Teto: chave por mês (`teto80:AAAA-MM`). Saldo e token: chave única, limpa
 * quando o saldo volta acima do mínimo (recarga). Nenhum texto cita placa.
 */
const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function avisosPendentes({ cfg, gasto, saldo, mes, tokenInvalido = false, fila = 0 }) {
  const enviados = cfg.avisos_enviados || {};
  const teto = Number(cfg.teto_mensal);
  const lista = [];
  const add = (chave, assunto, texto) => { if (!enviados[chave]) lista.push({ chave, assunto, texto }); };

  if (teto > 0 && gasto >= teto * (cfg.aviso_percentual / 100)) {
    add(`teto80:${mes}`, `APIPLACAS: ${cfg.aviso_percentual}% do teto do mês`,
      `As consultas de placa do mês chegaram a ${brl(gasto)} de um teto de ${brl(teto)}.`);
  }
  if (teto > 0 && gasto >= teto) {
    add(`teto100:${mes}`, 'APIPLACAS: teto do mês atingido — consultas pausadas',
      `O gasto chegou a ${brl(gasto)}. As consultas estão pausadas e ${fila} placa(s) aguardam na fila. ` +
      'Para liberar, aumente o teto em Admin → Consulta de placas, ou aguarde a virada do mês.');
  }
  if (saldo !== null && saldo !== undefined) {
    if (saldo < cfg.saldo_minimo) {
      add('saldo_baixo', 'APIPLACAS: saldo do pacote baixo',
        `Restam ${saldo} consultas no pacote (mínimo configurado: ${cfg.saldo_minimo}). Compre mais consultas na APIPLACAS.`);
    }
    if (saldo <= 0) {
      add('saldo_zerado', 'APIPLACAS: saldo zerado — consultas na fila',
        `O pacote acabou. ${fila} placa(s) aguardam na fila e serão consultadas sozinhas após a recarga.`);
    }
  }
  if (tokenInvalido) {
    add('token_invalido', 'APIPLACAS: token inválido — consultas desligadas',
      'A APIPLACAS recusou o token (HTTP 402). As consultas foram desligadas. ' +
      'Confira APIPLACAS_TOKEN no Vercel e religue em Admin → Consulta de placas.');
  }
  return lista;
}

function chavesLimpas({ cfg, saldo }) {
  const enviados = { ...(cfg.avisos_enviados || {}) };
  if (saldo !== null && saldo !== undefined && saldo >= cfg.saldo_minimo) {
    delete enviados.saldo_baixo;
    delete enviados.saldo_zerado;
  }
  if (cfg.ativo) delete enviados.token_invalido;
  return enviados;
}

module.exports = { avisosPendentes, chavesLimpas };
