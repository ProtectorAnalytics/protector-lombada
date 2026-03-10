const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Busca destinatários ativos da tabela email_destinatarios.
 * Fallback para o campo emails_notificacao do cliente se a tabela estiver vazia.
 */
async function getDestinatarios(clienteId, tipo = 'alerta') {
  const { data } = await supabase
    .from('email_destinatarios')
    .select('nome, email')
    .eq('cliente_id', clienteId)
    .eq('ativo', true)
    .in('tipo', [tipo, 'todos']);

  if (data && data.length > 0) {
    return data.map(d => d.email);
  }

  // Fallback: campo TEXT[] legado
  const { data: cliente } = await supabase
    .from('clientes')
    .select('emails_notificacao')
    .eq('id', clienteId)
    .single();

  return cliente?.emails_notificacao || [];
}

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
        rejectUnauthorized: false, // cPanel com certificado self-signed
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
}) {
  const ts = new Date(timestamp);
  const data = ts.toLocaleDateString('pt-BR');
  const hora = ts.toLocaleTimeString('pt-BR');
  const fromEmail = process.env.SMTP_USER || process.env.GMAIL_USER;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1a1a2e; color: white; padding: 20px; text-align: center;">
        <h2 style="margin: 0; color: #FF6B00;">&#9888;&#65039; Alerta de Velocidade</h2>
        <p style="margin: 5px 0; color: #ccc;">${nomeCondominio}</p>
      </div>

      <div style="padding: 20px; background: #f5f5f5;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Placa:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd; color: #CC0000; font-weight: bold; font-size: 18px;">${placa}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Velocidade:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd; color: #CC0000; font-weight: bold; font-size: 18px;">${velocidade} km/h</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Limite:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${limite} km/h</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Local:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${localVia}</td>
          </tr>
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
    from: `"Protector Lombada" <${fromEmail}>`,
    to: destinatarios.join(', '),
    subject: `Alerta de Velocidade - ${placa} - ${nomeCondominio}`,
    html,
    attachments: [
      {
        filename: `notificacao_${placa}_${data.replace(/\//g, '-')}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  };

  const info = await transporter.sendMail(mailOptions);
  return info;
}

module.exports = { enviarAlerta, getDestinatarios };
