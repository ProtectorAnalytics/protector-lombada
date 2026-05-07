const PDFDocument = require('pdfkit');
const path = require('path');
const crypto = require('crypto');

/**
 * Hash SHA-256 truncado dos dados críticos da captura — assinatura
 * criptográfica que detecta adulteração do PDF: basta recalcular a
 * partir do banco e comparar com o hash impresso.
 */
function calcHashAuditavel(captura, serial) {
  try {
    const canonical = [
      String(captura.placa || '').toUpperCase().trim(),
      String(captura.velocidade ?? 0),
      new Date(captura.timestamp).toISOString(),
      String(serial || '').toUpperCase().trim(),
    ].join('|');
    return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 8);
  } catch {
    return '';
  }
}

// Fontes TTF com suporte completo a caracteres acentuados
const FONT_REGULAR = path.join(__dirname, '..', 'fonts', 'Inter-Regular.ttf');
const FONT_BOLD = path.join(__dirname, '..', 'fonts', 'Inter-Bold.ttf');
const PROTECTOR_LOGO = path.join(__dirname, 'assets', 'logo-protector.png');

/**
 * Gera PDF de notificação orientativa
 * @param {Object} params
 * @param {Object} params.cliente - Dados do cliente
 * @param {Object} params.captura - Dados da captura
 * @param {Object|null} params.veiculo - Dados do veículo (se cadastrado)
 * @param {Buffer|null} params.fotoBuffer - Buffer da foto JPEG
 * @param {Array} params.historico - Últimas 30 passagens
 * @returns {Promise<Buffer>} Buffer do PDF
 */
async function gerarPDF({ cliente, captura, veiculo, fotoBuffer, historico, cameraNome, camera }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 30, bottom: 30, left: 40, right: 40 },
      });

      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width - 80; // margins
      const ts = new Date(captura.timestamp);
      const dataStr = formatDate(ts);
      const horaStr = formatTime(ts);
      const velReport = captura.velocidade <= 10 ? 1 : captura.velocidade;

      // =========================================
      // LOGO PROTECTOR (canto superior esquerdo)
      // =========================================
      try {
        doc.image(PROTECTOR_LOGO, 30, 18, { width: 90 });
      } catch {
        // logo ausente no bundle — segue sem
      }

      // =========================================
      // CABEÇALHO
      // =========================================
      const pdfTitulo = cliente.pdf_titulo || 'NOTIFICAÇÃO ORIENTATIVA';
      const pdfSubtitulo = cliente.pdf_subtitulo || 'Transitar em velocidade superior à máxima permitida';
      const usaCorpoCustom = !!(cliente.pdf_corpo_texto && cliente.pdf_corpo_texto.trim());

      if (usaCorpoCustom) {
        // Cabeçalho ultracompacto: 1 linha de título + 1 linha de
        // identificação. Marca "Protector Traffic Control" foi
        // movida pro rodapé fixo da página.
        doc.fontSize(13).font(FONT_BOLD).fillColor('#CC0000')
          .text(pdfTitulo, { align: 'center' });
        doc.moveDown(0.15);
        const partesIdent = [cliente.nome];
        const linhaLocal = [cliente.local_via, cliente.cidade_uf].filter(Boolean).join(' · ');
        if (linhaLocal) partesIdent.push(linhaLocal);
        if (cameraNome) partesIdent.push(`Radar: ${cameraNome}`);
        doc.fontSize(9).font(FONT_REGULAR).fillColor('#3C3C3C')
          .text(partesIdent.join('  ·  '), { align: 'center' });
        doc.moveDown(0.3);
      } else {
        doc.fontSize(18).font(FONT_BOLD).fillColor('#CC0000')
          .text(pdfTitulo, { align: 'center' });

        doc.moveDown(0.3);
        doc.fontSize(10).font(FONT_REGULAR).fillColor('#333333')
          .text(pdfSubtitulo, { align: 'center' });

        doc.moveDown(0.3);
        doc.fontSize(12).font(FONT_BOLD).fillColor('#000000')
          .text(cliente.nome, { align: 'center' });

        doc.fontSize(10).font(FONT_REGULAR).fillColor('#555555')
          .text(`${cliente.local_via}`, { align: 'center' });

        doc.text(`${cliente.cidade_uf}`, { align: 'center' });

        if (cameraNome) {
          doc.moveDown(0.2);
          doc.fontSize(9).font(FONT_BOLD).fillColor('#333333')
            .text(`Radar: ${cameraNome}`, { align: 'center' });
        }

        doc.moveDown(0.2);
        doc.fontSize(9).font(FONT_BOLD).fillColor('#046bd2')
          .text('Protector Traffic Control - Lombada Educativa', { align: 'center' });

        doc.moveDown(0.5);
      }

      // Ordem (a pedido do cliente PARAISO DO MAR):
      //   cabeçalho → medição (tabelas + foto) → histórico → termo
      drawLine(doc);

      // =========================================
      // TABELA 1: PLACA | NOME MORADOR | UNIDADE
      // =========================================
      const y1 = doc.y + 5;
      const col3Width = pageWidth / 3;

      // Headers
      doc.fontSize(8).font(FONT_BOLD).fillColor('#666666');
      doc.text('PLACA VEÍCULO', 40, y1, { width: col3Width, align: 'center' });
      doc.text('NOME MORADOR', 40 + col3Width, y1, { width: col3Width, align: 'center' });
      doc.text('UNIDADE', 40 + col3Width * 2, y1, { width: col3Width, align: 'center' });

      // Values
      const y1v = y1 + 15;
      doc.fontSize(14).font(FONT_BOLD).fillColor('#CC0000');
      doc.text(captura.placa, 40, y1v, { width: col3Width, align: 'center' });

      doc.fontSize(10).font(FONT_REGULAR).fillColor('#000000');
      doc.text(veiculo?.nome_morador || '---', 40 + col3Width, y1v + 2, { width: col3Width, align: 'center' });
      doc.text(veiculo?.unidade || '---', 40 + col3Width * 2, y1v + 2, { width: col3Width, align: 'center' });

      doc.y = y1v + 25;
      drawLine(doc);

      // =========================================
      // TABELA 2: VELOCIDADE | DATA | HORA
      // =========================================
      const y2 = doc.y + 5;

      // Headers
      doc.fontSize(8).font(FONT_BOLD).fillColor('#666666');
      doc.text('VELOCIDADE REGISTRADA', 40, y2, { width: col3Width, align: 'center' });
      doc.text('DATA DA OCORRÊNCIA', 40 + col3Width, y2, { width: col3Width, align: 'center' });
      doc.text('HORA OCORRÊNCIA', 40 + col3Width * 2, y2, { width: col3Width, align: 'center' });

      // Values
      const y2v = y2 + 15;
      doc.fontSize(22).font(FONT_BOLD).fillColor('#CC0000');
      doc.text(`${velReport} km/h`, 40, y2v, { width: col3Width, align: 'center' });

      doc.fontSize(16).font(FONT_BOLD).fillColor('#000000');
      doc.text(dataStr, 40 + col3Width, y2v + 3, { width: col3Width, align: 'center' });
      doc.text(horaStr, 40 + col3Width * 2, y2v + 3, { width: col3Width, align: 'center' });

      doc.y = y2v + 35;
      drawLine(doc);

      // =========================================
      // FOTO DO VEÍCULO
      // =========================================
      if (fotoBuffer && fotoBuffer.length > 0) {
        doc.moveDown(0.3);
        try {
          const fotoH = usaCorpoCustom ? 170 : 250;
          doc.image(fotoBuffer, 40, doc.y, {
            fit: [pageWidth, fotoH],
            align: 'center',
          });
          doc.y += fotoH + 5;
        } catch {
          doc.fontSize(9).fillColor('#999999')
            .text('[Foto indisponível]', { align: 'center' });
          doc.moveDown(1);
        }
      }

      drawLine(doc);

      // =========================================
      // RODAPÉ - TEXTO INFORMATIVO
      // =========================================
      doc.moveDown(0.3);
      doc.fontSize(7).font(FONT_REGULAR).fillColor('#888888')
        .text(
          'Velocidades igual ou inferior a 10km/h serão registradas com velocidade igual a 1 neste relatório.',
          { align: 'center' }
        );

      doc.moveDown(0.5);
      doc.fontSize(10).font(FONT_BOLD).fillColor('#000000')
        .text(cliente.nome, { align: 'center' });

      // Histórico de passagens. Modo custom limita a 20 (2 linhas de 10);
      // modo padrão mostra tudo que veio de historico.
      doc.moveDown(0.2);
      doc.fontSize(usaCorpoCustom ? 8 : 9).font(FONT_REGULAR).fillColor('#555555')
        .text(
          usaCorpoCustom
            ? 'Últimas 20 passagens por data / velocidade'
            : 'Últimas passagens por data / Velocidades',
          { align: 'center' }
        );
      doc.moveDown(0.4);
      const historicoRender = usaCorpoCustom && historico
        ? historico.slice(0, 20)
        : historico;
      if (historicoRender && historicoRender.length > 0) {
        drawHistoricoGrid(doc, historicoRender, cliente.limite_velocidade, pageWidth);
      }

      // Termo / corpo de texto formal — abaixo do histórico no modo custom
      if (usaCorpoCustom) {
        doc.moveDown(0.5);
        drawLine(doc);
        doc.moveDown(0.3);
        const corpoTexto = cliente.pdf_corpo_texto
          .replace(/\{\{DATA_OCORRENCIA\}\}/g, dataStr)
          .replace(/\{\{HORA_OCORRENCIA\}\}/g, horaStr)
          .replace(/\{\{ID_RADAR\}\}/g, cameraNome || '—')
          .replace(/\{\{PLACA_VEICULO\}\}/g, captura.placa)
          .replace(/\{\{VELOCIDADE_REGISTRADA\}\}/g, `${velReport} km/h`);
        doc.fontSize(7.5).font(FONT_REGULAR).fillColor('#222222').text(
          corpoTexto,
          40,
          doc.y,
          {
            width: pageWidth,
            align: 'justify',
            paragraphGap: 2,
            lineGap: 0,
          }
        );
      }

      // =========================================
      // ASSINATURA
      // =========================================
      doc.moveDown(1);
      drawLine(doc);
      doc.moveDown(0.3);

      // Rodapé personalizado
      if (cliente.pdf_rodape) {
        doc.fontSize(9).font(FONT_REGULAR).fillColor('#555555')
          .text(cliente.pdf_rodape, { align: 'center' });
        doc.moveDown(0.2);
      }

      doc.fontSize(8).font(FONT_REGULAR).fillColor('#888888')
        .text('Protector Traffic Control | Protector Sistemas de Segurança Eletrônica', { align: 'center' });

      // ============================================
      // RODAPÉ AUDITÁVEL (modo compacto)
      // ============================================
      if (usaCorpoCustom) {
        const pageH = doc.page.height;
        const serial = camera?.serial_number || '';
        const modelo = camera?.modelo || '';
        const firmware = camera?.firmware || '';
        const capId = String(captura.id || '').slice(0, 8);
        const hashAud = calcHashAuditavel(captura, serial);
        const partesAud = [];
        if (capId) partesAud.push(`Captura: ${capId}`);
        if (serial) partesAud.push(`Serial: ${serial}`);
        if (modelo) partesAud.push(`Modelo: ${modelo}`);
        if (firmware) partesAud.push(`Firmware: ${firmware}`);
        if (hashAud) partesAud.push(`Hash: ${hashAud}`);
        const agora = new Date();
        const dt = agora.toLocaleDateString('pt-BR', { timeZone: 'America/Bahia' });
        const tm = agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Bahia' });
        partesAud.push(`Emitido ${dt} ${tm}`);

        doc.fontSize(6).font(FONT_REGULAR).fillColor('#787878').text(
          partesAud.join('  ·  '),
          40,
          pageH - 32,
          { width: pageWidth, align: 'center' }
        );

        doc.fontSize(7).font(FONT_BOLD).fillColor('#046bd2')
          .text(
            'Protector Traffic Control - Lombada Educativa',
            40,
            pageH - 18,
            { width: pageWidth, align: 'center' }
          );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Desenha grid de histórico de passagens (10 colunas por linha)
 */
function drawHistoricoGrid(doc, historico, limite, pageWidth) {
  const colsPerRow = 10;
  const cellWidth = pageWidth / colsPerRow;
  const cellHeight = 36;
  const startX = 40;

  for (let i = 0; i < historico.length; i++) {
    const col = i % colsPerRow;
    const row = Math.floor(i / colsPerRow);

    if (col === 0 && row > 0) {
      // check if new row fits on page
      if (doc.y + cellHeight > doc.page.height - 60) {
        doc.addPage();
      }
    }

    const x = startX + col * cellWidth;
    const y = doc.y + row * cellHeight;

    const h = historico[i];
    const ts = new Date(h.timestamp);
    const vel = h.velocidade <= 10 ? 1 : h.velocidade;
    const acima = vel > limite;

    // Cell border
    doc.save();
    doc.lineWidth(0.5).strokeColor('#CCCCCC')
      .rect(x, y, cellWidth, cellHeight).stroke();
    doc.restore();

    // Date
    doc.fontSize(5.5).font(FONT_REGULAR).fillColor('#666666');
    doc.text(formatDate(ts), x + 2, y + 2, { width: cellWidth - 4, align: 'center' });

    // Time
    doc.fontSize(5.5).font(FONT_REGULAR).fillColor('#666666');
    doc.text(formatTime(ts), x + 2, y + 10, { width: cellWidth - 4, align: 'center' });

    // Speed (highlighted if above limit)
    doc.fontSize(10).font(FONT_BOLD)
      .fillColor(acima ? '#CC0000' : '#333333');
    doc.text(`${vel}`, x + 2, y + 19, { width: cellWidth - 4, align: 'center' });
  }

  // Move doc.y past the grid
  const totalRows = Math.ceil(historico.length / colsPerRow);
  doc.y += totalRows * cellHeight + 5;
}

function drawLine(doc) {
  const y = doc.y;
  doc.save();
  doc.lineWidth(0.5).strokeColor('#CCCCCC')
    .moveTo(40, y).lineTo(doc.page.width - 40, y).stroke();
  doc.restore();
  doc.y = y + 2;
}

function formatDate(date) {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function formatTime(date) {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  const s = date.getSeconds().toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

module.exports = { gerarPDF };
