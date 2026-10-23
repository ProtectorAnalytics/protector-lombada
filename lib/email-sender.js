const nodemailer = require('nodemailer');
const { escapeHtml } = require('./validators');

// Suporta Gmail (service: 'gmail') e SMTP genérico (cPanel, etc.)
function createTransporter() {
  // Se SMTP_HOST está definido, usa SMTP genérico (cPanel, etc.)
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '465', 10),
      secure: (process.env.SMTP_SECURE || 'true') === 'true', // true para 465, false para 587
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== 'false',
      },
    });
  }

  // Fallback: Gmail
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_USER || process.env.GMAIL_USER,
      pass: process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD,
    },
  });
}

const transporter = createTransporter();

// Destinatários vão sempre em Cco (com o próprio remetente no Para): quem
// recebe não vê o e-mail dos outros. Listas grandes saem em lotes, para ficar
// bem abaixo do limite de destinatários por mensagem do SMTP — ninguém é
// cortado em silêncio.
const LOTE_CCO = 50;
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** E-mails válidos, sem espaços nem maiúsculas, sem repetição, na ordem recebida. */
function listaDeEnvio(destinatarios) {
  const limpos = (destinatarios || []).map((e) => String(e || '').trim().toLowerCase());
  return [...new Set(limpos.filter((e) => EMAIL_VALIDO.test(e)))];
}

function emLotes(lista) {
  const lotes = [];
  for (let i = 0; i < lista.length; i += LOTE_CCO) lotes.push(lista.slice(i, i + LOTE_CCO));
  return lotes;
}

/** Envia `mensagem` para `lista` em Cco, lote a lote. Lança na primeira falha. */
async function enviarEmCco(mensagem, lista, rotulo) {
  const fromEmail = process.env.SMTP_USER || process.env.GMAIL_USER;
  const lotes = emLotes(lista);
  if (lotes.length > 1) console.info(`[email-sender] ${rotulo}: ${lista.length} destinatários em ${lotes.length} lotes`);
  const infos = [];
  for (const lote of lotes) {
    infos.push(await transporter.sendMail({
      ...mensagem, from: `"Protector Lombada" <${fromEmail}>`, to: fromEmail, bcc: lote.join(', '),
    }));
  }
  return infos;
}

/**
 * Envia e-mail de alerta de velocidade com PDF anexo
 */
async function enviarAlerta({
  destinatarios,
  placa,
  velocidade,
  timestamp,
  nomeCondominio,
  localVia,
  limite,
  pdfBuffer,
  cameraNome,
}) {
  const lista = listaDeEnvio(destinatarios);
  if (!lista.length) return [];

  // Sanitizar placa para evitar header injection
  const placaLimpa = (placa || '').replace(/[\r\n\t]/g, '').slice(0, 10);
  const nomeLimpo = (nomeCondominio || '').replace(/[\r\n\t]/g, '').slice(0, 100);

  const ts = new Date(timestamp);
  const data = ts.toLocaleDateString('pt-BR');
  const hora = ts.toLocaleTimeString('pt-BR');

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1a1a2e; color: white; padding: 20px; text-align: center;">
        <h2 style="margin: 0; color: #FF6B00;">&#9888;&#65039; Alerta de Velocidade</h2>
        <p style="margin: 5px 0; color: #ccc;">${escapeHtml(nomeCondominio)}</p>
      </div>

      <div style="padding: 20px; background: #f5f5f5;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Placa:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd; color: #CC0000; font-weight: bold; font-size: 18px;">${escapeHtml(placa)}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Velocidade:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd; color: #CC0000; font-weight: bold; font-size: 18px;">${escapeHtml(velocidade)} km/h</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Limite:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${escapeHtml(limite)} km/h</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Local:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${escapeHtml(localVia)}</td>
          </tr>${cameraNome ? `
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Radar:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd; font-weight: bold;">${escapeHtml(cameraNome)}</td>
          </tr>` : ''}
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Data:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${data}</td>
          </tr>
          <tr>
            <td style="padding: 10px;"><strong>Hora:</strong></td>
            <td style="padding: 10px;">${hora}</td>
          </tr>
        </table>
      </div>

      <div style="padding: 15px; background: #1a1a2e; color: #888; text-align: center; font-size: 12px;">
        <p>Protector Sistemas de Seguran&ccedil;a Eletr&ocirc;nica</p>
        <p>Relat&oacute;rio completo em anexo (PDF)</p>
      </div>
    </div>
  `;

  const mailOptions = {
    subject: `Alerta de Velocidade - ${placaLimpa} - ${nomeLimpo}`,
    html,
    attachments: [
      {
        filename: `notificacao_${placa}_${data.replace(/\//g, '-')}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  };

  return enviarEmCco(mailOptions, lista, 'alerta');
}

/**
 * E-mail de texto simples para avisos internos (APIPLACAS). Lança em falha.
 */
async function enviarEmailSimples({ destinatarios, assunto, texto }) {
  const lista = listaDeEnvio(destinatarios);
  // Sem destinatário válido é falha, não envio: quem chama não pode marcar
  // o aviso como entregue.
  if (!lista.length) throw new Error('Nenhum destinatário de e-mail válido');
  await enviarEmCco({
    subject: String(assunto).slice(0, 200),
    text: String(texto).slice(0, 4000),
  }, lista, 'aviso');
}

module.exports = { enviarAlerta, enviarEmailSimples, LOTE_CCO };
