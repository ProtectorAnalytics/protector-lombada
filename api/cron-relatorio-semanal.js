/**
 * CRON DO RELATÓRIO SEMANAL
 *
 * Agendado no vercel.json para rodar de hora em hora (`0 * * * *`).
 *
 * Por que de hora em hora e não uma vez por semana?
 *   Cada condomínio escolhe seu próprio dia e hora de recebimento, e o
 *   vercel.json só aceita agendamento fixo. Então o cron acorda toda hora e
 *   envia apenas para os clientes cujo relatorio_dia_semana/relatorio_hora
 *   coincidem com o instante atual — avaliado em America/Bahia, não em UTC.
 *
 * Idempotência: o registro em relatorio_envios é gravado ANTES do envio, e há
 * índice único em (cliente_id, destinatario_email, periodo_inicio). Se o cron
 * rodar duas vezes na mesma janela, o segundo insert falha e o e-mail não é
 * reenviado.
 *
 * ENV vars:
 *   - SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   - SMTP_* (ver lib/email-sender.js)
 *   - CRON_SECRET
 *   - PUBLIC_BASE_URL (opcional; default https://lombada.appps.com.br)
 */

const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');
const {
  TZ, TEMPLATE_PADRAO, agoraLocal, calcularMetricas, montarEmailHtml, formatarBR,
} = require('../lib/relatorio-semanal');
const { gerarRelatorioSemanalPDF } = require('../lib/pdf-relatorio-semanal');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://lombada.appps.com.br').replace(/\/$/, '');

function createTransporter() {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '465', 10),
      secure: (process.env.SMTP_SECURE || 'true') === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      tls: { rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== 'false' },
    });
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_USER || process.env.GMAIL_USER,
      pass: process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD,
    },
  });
}

/** Destinatários ativos marcados para receber relatório. */
async function getDestinatariosRelatorio(clienteId) {
  const { data, error } = await supabase
    .from('email_destinatarios')
    .select('nome, email')
    .eq('cliente_id', clienteId)
    .eq('ativo', true)
    .in('tipo', ['relatorio', 'todos']);

  if (error) throw new Error(`destinatarios: ${error.message}`);
  return (data || []).filter((d) => d.email);
}

async function getNomesCameras(clienteId) {
  const { data } = await supabase
    .from('cameras')
    .select('id, nome, nome_exibicao')
    .eq('cliente_id', clienteId);
  return new Map((data || []).map((c) => [c.id, c.nome_exibicao || c.nome]));
}

/**
 * Processa um cliente: calcula métricas uma vez e envia a cada destinatário,
 * com corpo personalizado pelo nome de cada um.
 */
async function processarCliente(cliente, isoRef, transporter) {
  const destinatarios = await getDestinatariosRelatorio(cliente.id);
  if (destinatarios.length === 0) {
    return { cliente: cliente.nome, pulado: 'sem destinatários do tipo relatório' };
  }

  const nomesCameras = await getNomesCameras(cliente.id);
  const metricas = await calcularMetricas(supabase, cliente, isoRef, nomesCameras);

  if (metricas.total_passagens === 0) {
    return { cliente: cliente.nome, pulado: 'nenhuma passagem no período' };
  }

  const fromAddress = process.env.SMTP_USER || process.env.GMAIL_USER || 'noreply@appps.com.br';
  const resultados = [];

  // PDF consolidado: gerado uma vez por cliente (não varia por destinatário).
  // Falha aqui nunca bloqueia o envio — o e-mail sozinho já entrega o resumo.
  let pdfBuffer = null;
  if (cliente.relatorio_anexar_pdf !== false) {
    try {
      pdfBuffer = await gerarRelatorioSemanalPDF({ cliente, metricas });
    } catch (err) {
      console.error(`[cron-relatorio] PDF de ${cliente.nome}:`, err.message);
    }
  }
  const nomePdf = `Relatorio_Semanal_${metricas.periodo_inicio}_a_${metricas.periodo_fim}.pdf`;

  for (const dest of destinatarios) {
    const token = crypto.randomBytes(24).toString('base64url');

    // Grava ANTES de enviar. Conflito no índice único = já enviado nesta
    // janela; segue para o próximo sem reenviar.
    const { data: envio, error: insErr } = await supabase
      .from('relatorio_envios')
      .insert({
        cliente_id: cliente.id,
        destinatario_nome: dest.nome || null,
        destinatario_email: dest.email,
        periodo_inicio: metricas.periodo_inicio,
        periodo_fim: metricas.periodo_fim,
        token,
        metricas,
      })
      .select('id')
      .single();

    if (insErr) {
      const duplicado = /duplicate key|unique constraint/i.test(insErr.message);
      resultados.push({
        email: dest.email,
        enviado: false,
        motivo: duplicado ? 'já enviado nesta semana' : insErr.message,
      });
      continue;
    }

    try {
      const html = montarEmailHtml({
        metricas,
        cliente,
        destinatario: dest,
        corpoTexto: cliente.relatorio_corpo_texto || TEMPLATE_PADRAO,
        linkRelatorio: `${BASE_URL}/relatorio?t=${token}`,
      });

      await transporter.sendMail({
        from: `"Protector Traffic Control" <${fromAddress}>`,
        to: dest.email,
        subject: `Resumo semanal de circulação — ${cliente.nome} — ${formatarBR(metricas.periodo_inicio)} a ${formatarBR(metricas.periodo_fim)}`,
        html,
        attachments: pdfBuffer
          ? [{ filename: nomePdf, content: pdfBuffer, contentType: 'application/pdf' }]
          : [],
      });

      await supabase
        .from('relatorio_envios')
        .update({ enviado_em: new Date().toISOString() })
        .eq('id', envio.id);

      resultados.push({ email: dest.email, enviado: true });
    } catch (err) {
      // enviado_em permanece NULL — o registro fica como evidência da falha
      await supabase
        .from('relatorio_envios')
        .update({ erro: String(err.message).slice(0, 500) })
        .eq('id', envio.id);
      resultados.push({ email: dest.email, enviado: false, motivo: err.message });
    }
  }

  return {
    cliente: cliente.nome,
    periodo: `${metricas.periodo_inicio} a ${metricas.periodo_fim}`,
    passagens: metricas.total_passagens,
    acima_limite: metricas.acima_limite,
    conformidade: metricas.conformidade,
    destinatarios: resultados,
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const authHeader = req.headers['authorization'] || '';
  const vercelCronHeader = req.headers['x-vercel-cron-signature'];
  const expectedSecret = `Bearer ${process.env.CRON_SECRET}`;
  if (!vercelCronHeader && authHeader !== expectedSecret) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  try {
    const agora = agoraLocal();

    // ?forcar=<cliente_id> dispara fora do horário (usado pelo botão de teste
    // do admin e para reprocessar manualmente).
    const forcarId = req.query.forcar;

    let query = supabase
      .from('clientes')
      .select('id, nome, local_via, cidade_uf, pdf_rodape, limite_velocidade, relatorio_corpo_texto, relatorio_dia_semana, relatorio_hora, relatorio_anexar_pdf')
      .eq('ativo', true);

    if (forcarId) {
      query = query.eq('id', forcarId);
    } else {
      query = query
        .eq('relatorio_ativo', true)
        .eq('relatorio_dia_semana', agora.dow)
        .eq('relatorio_hora', agora.hora);
    }

    const { data: clientes, error } = await query;
    if (error) throw new Error(`clientes: ${error.message}`);

    if (!clientes || clientes.length === 0) {
      return res.status(200).json({
        ok: true,
        agora: { tz: TZ, data: agora.iso, dow: agora.dow, hora: agora.hora },
        clientes_processados: 0,
        nota: 'Nenhum cliente agendado para este dia/hora.',
      });
    }

    const transporter = createTransporter();
    const relatorios = [];
    for (const cliente of clientes) {
      try {
        relatorios.push(await processarCliente(cliente, agora.iso, transporter));
      } catch (err) {
        console.error(`[cron-relatorio] ${cliente.nome}:`, err.message);
        relatorios.push({ cliente: cliente.nome, erro: err.message });
      }
    }

    return res.status(200).json({
      ok: true,
      agora: { tz: TZ, data: agora.iso, dow: agora.dow, hora: agora.hora },
      forcado: !!forcarId,
      clientes_processados: relatorios.length,
      relatorios,
    });
  } catch (err) {
    console.error('[cron-relatorio-semanal] Erro:', err.message);
    return res.status(500).json({ error: 'Erro interno do servidor', detalhes: err.message });
  }
};
