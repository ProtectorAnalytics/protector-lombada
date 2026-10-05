/**
 * CRON DA APIPLACAS — a cada 5 min (vercel.json).
 *
 * 1. Lê o saldo (não consome) e guarda em apiplacas_config.
 * 2. Consulta a fila (pendente/erro vencidos), respeitando teto e saldo.
 * 3. Manda os avisos por e-mail (1x por período) e grava avisos_enviados.
 * 4. Retenção: apaga veículos sem passagem há 6 meses.
 *
 * Auth: SOMENTE `Authorization: Bearer ${CRON_SECRET}` (o Vercel Cron envia
 * esse header quando CRON_SECRET está definido). Sem segredo = recusa tudo.
 */
const { criarClienteApiplacas } = require('../lib/apiplacas');
const { criarRepoSupabase } = require('../lib/veiculos-base-repo');
const { criarValidador } = require('../lib/validador-placa');
const { criarVeiculosBase } = require('../lib/veiculos-base');
const { enviarAvisos } = require('../lib/apiplacas-avisos');
const { enviarEmailSimples } = require('../lib/email-sender');
const { supabase } = require('../lib/supabase');

const RETENCAO_MESES = 6;

function mesSP(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' })
    .format(d).slice(0, 7);
}

module.exports = async function handler(req, res) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.authorization !== `Bearer ${segredo}`) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const repo = criarRepoSupabase();
  const resumo = { saldo: null, fila: null, avisos: [], avisosFalhos: [], apagados: 0 };
  try {
    let api = null;
    try { api = criarClienteApiplacas({ token: process.env.APIPLACAS_TOKEN }); } catch { /* sem token: só avisos/retenção */ }

    if (api) {
      resumo.saldo = await api.saldo();
      if (resumo.saldo !== null) await repo.atualizarConfig({ saldo_atual: resumo.saldo, saldo_em: new Date().toISOString() });
      const vb = criarVeiculosBase({ repo, api, validador: criarValidador({ contarPassagens: repo.contarPassagens }) });
      resumo.fila = await vb.processarFila({ limite: 50 });
    }

    const cfg = await repo.lerConfig();
    const gasto = await repo.gastoDoMes();
    const fila = await repo.tamanhoFila();
    const tokenInvalido = !cfg.ativo && (await repo.ultimoResultado()) === 'token_invalido';
    const r = await enviarAvisos({
      cfg, gasto, saldo: cfg.saldo_atual, mes: mesSP(), tokenInvalido, fila,
      enviarEmail: ({ assunto, texto }) => enviarEmailSimples({ destinatarios: cfg.emails_aviso, assunto, texto }),
      salvarAvisos: (av) => repo.atualizarConfig({ avisos_enviados: av }),
    });
    resumo.avisos = r.enviados;
    resumo.avisosFalhos = r.falhas;

    const limite = new Date();
    limite.setMonth(limite.getMonth() - RETENCAO_MESES);
    resumo.apagados = await repo.apagarVistosAntesDe(limite.toISOString());

    return res.status(200).json({ ok: true, ...resumo });
  } catch (err) {
    try {
      // Só a mensagem do erro: nunca token, URL ou placa.
      await supabase.from('debug_log').insert({
        content_type: 'cron-apiplacas-error',
        raw_body: String(err.message).slice(0, 500),
      });
    } catch { /* log é melhor-esforço */ }
    return res.status(500).json({ ok: false });
  }
};
