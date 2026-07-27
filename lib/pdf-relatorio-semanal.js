/**
 * PDF CONSOLIDADO DO RELATÓRIO SEMANAL
 *
 * Documento anexado ao e-mail semanal — o insumo que o síndico leva para a
 * assembleia. Diferente do lib/pdf-generator.js, que emite a notificação
 * orientativa de uma ocorrência individual, aqui o recorte é o período.
 *
 * Reaproveita o mesmo motor (pdfkit), as mesmas fontes e a mesma identidade
 * visual da notificação, além do hash auditável — de modo que os dois
 * documentos sejam reconhecíveis como da mesma família.
 */

const PDFDocument = require('pdfkit');
const path = require('path');
const crypto = require('crypto');

const FONT_REGULAR = path.join(__dirname, '..', 'fonts', 'Inter-Regular.ttf');
const FONT_BOLD = path.join(__dirname, '..', 'fonts', 'Inter-Bold.ttf');
const PROTECTOR_LOGO = path.join(__dirname, 'assets', 'logo-protector.png');

const AZUL = '#046bd2';
const VERMELHO = '#CC0000';
const VERDE = '#16803C';
const CINZA = '#666666';
const CINZA_CLARO = '#999999';
const PRETO = '#1a1a1a';

const N = (v) => Number(v ?? 0).toLocaleString('pt-BR');
const pct = (v) => String(v ?? 0).replace('.', ',');

/**
 * Hash do conteúdo consolidado — permite conferir que o PDF não foi adulterado
 * recalculando a partir do banco. Mesma ideia do calcHashAuditavel da
 * notificação individual, aplicada ao período.
 */
function hashRelatorio(clienteId, m) {
  try {
    const canonical = [
      String(clienteId || ''),
      m.periodo_inicio, m.periodo_fim,
      String(m.total_passagens), String(m.acima_limite), String(m.conformidade),
    ].join('|');
    return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 8);
  } catch {
    return '';
  }
}

function fmtBR(iso) {
  if (!iso) return '—';
  const [a, mm, d] = String(iso).split('-');
  return `${d}/${mm}/${a}`;
}

function linha(doc, y, x0 = 40, x1 = null) {
  doc.save().lineWidth(0.5).strokeColor('#DDDDDD')
    .moveTo(x0, y).lineTo(x1 || doc.page.width - 40, y).stroke().restore();
}

/**
 * @param {object}  params
 * @param {object}  params.cliente  - registro de clientes
 * @param {object}  params.metricas - saída de calcularMetricas()
 * @returns {Promise<Buffer>}
 */
async function gerarRelatorioSemanalPDF({ cliente, metricas: m }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 30, bottom: 40, left: 40, right: 40 } });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W = doc.page.width - 80;
      const X = 40;

      // ── Cabeçalho ────────────────────────────────────────────────────────
      try { doc.image(PROTECTOR_LOGO, 30, 18, { width: 90 }); } catch { /* sem logo */ }

      doc.fontSize(15).font(FONT_BOLD).fillColor(AZUL)
        .text('RELATÓRIO SEMANAL DE CIRCULAÇÃO', X, 46, { width: W, align: 'center' });

      doc.moveDown(0.35);
      doc.fontSize(11).font(FONT_BOLD).fillColor(PRETO)
        .text(cliente.nome, { width: W, align: 'center' });

      const ident = [cliente.local_via, cliente.cidade_uf].filter(Boolean).join(' - ');
      if (ident) {
        doc.fontSize(8.5).font(FONT_REGULAR).fillColor(CINZA)
          .text(ident, { width: W, align: 'center' });
      }
      doc.fontSize(9).font(FONT_BOLD).fillColor(PRETO)
        .text(`Período de ${fmtBR(m.periodo_inicio)} a ${fmtBR(m.periodo_fim)}`,
          { width: W, align: 'center' });

      doc.moveDown(0.6);
      linha(doc, doc.y);
      doc.moveDown(0.5);

      // ── Indicadores ──────────────────────────────────────────────────────
      const varTxt = m.variacao_pct === null || m.variacao_pct === undefined
        ? 'sem base anterior'
        : `${m.variacao_pct <= 0 ? '↓' : '↑'} ${Math.abs(m.variacao_pct)}% vs. semana anterior`;

      const cards = [
        { rot: 'PASSAGENS', val: N(m.total_passagens), sub: `${N(m.placas_distintas)} veículos`, cor: PRETO },
        { rot: 'ACIMA DO LIMITE', val: N(m.acima_limite), sub: `limite ${m.limite} km/h`, cor: VERMELHO },
        { rot: 'CONFORMIDADE', val: `${pct(m.conformidade)}%`, sub: varTxt, cor: m.conformidade >= 90 ? VERDE : VERMELHO },
        { rot: 'REINCIDENTES', val: N(m.reincidentes), sub: '2+ excessos', cor: PRETO },
      ];

      const cardW = W / 4;
      const yCards = doc.y + 4;
      cards.forEach((c, i) => {
        const cx = X + i * cardW;
        doc.fontSize(6.5).font(FONT_BOLD).fillColor(CINZA_CLARO)
          .text(c.rot, cx, yCards, { width: cardW, align: 'center' });
        doc.fontSize(19).font(FONT_BOLD).fillColor(c.cor)
          .text(c.val, cx, yCards + 11, { width: cardW, align: 'center' });
        doc.fontSize(6.5).font(FONT_REGULAR).fillColor(CINZA)
          .text(c.sub, cx, yCards + 33, { width: cardW, align: 'center' });
      });

      doc.y = yCards + 48;
      linha(doc, doc.y);
      doc.moveDown(0.5);

      // ── Movimento diário ─────────────────────────────────────────────────
      const serie = m.serie_diaria || [];
      if (serie.length) {
        doc.fontSize(8).font(FONT_BOLD).fillColor(CINZA)
          .text('MOVIMENTO DIÁRIO', X, doc.y);
        doc.moveDown(0.4);

        const gY = doc.y;
        const gH = 62;
        const colW = W / serie.length;
        const maxP = Math.max(...serie.map((d) => d.passagens), 1);

        serie.forEach((d, i) => {
          const cx = X + i * colW;
          const barW = colW * 0.5;
          const barX = cx + (colW - barW) / 2;

          // Passagens (barra base) e excessos (sobreposta, proporcional)
          const hP = Math.max(1, (d.passagens / maxP) * gH);
          doc.save().fillColor('#D6E4F5')
            .rect(barX, gY + gH - hP, barW, hP).fill().restore();

          if (d.acima > 0) {
            const hA = Math.max(1, (d.acima / maxP) * gH);
            doc.save().fillColor(VERMELHO)
              .rect(barX, gY + gH - hA, barW, hA).fill().restore();
          }

          doc.fontSize(6).font(FONT_REGULAR).fillColor(CINZA)
            .text(d.rotulo, cx, gY + gH + 4, { width: colW, align: 'center' });
          doc.fontSize(6.5).font(FONT_BOLD).fillColor(PRETO)
            .text(N(d.passagens), cx, gY + gH + 12, { width: colW, align: 'center' });
          // A barra vermelha é proporcionalmente minúscula (excessos são ~4%
          // do movimento). Mantemos a escala honesta e damos o número ao lado,
          // senão o dado fica ilegível.
          doc.fontSize(6).font(FONT_BOLD).fillColor(d.acima > 0 ? VERMELHO : CINZA_CLARO)
            .text(d.acima > 0 ? `${N(d.acima)} acima` : '—', cx, gY + gH + 20, { width: colW, align: 'center' });
        });

        doc.y = gY + gH + 32;
        doc.fontSize(6.5).font(FONT_REGULAR).fillColor(CINZA_CLARO)
          .text('Barra clara: total de passagens · Barra vermelha: passagens acima do limite',
            X, doc.y, { width: W, align: 'center' });
        doc.moveDown(0.7);
        linha(doc, doc.y);
        doc.moveDown(0.5);
      }

      // ── Duas colunas: perfil de velocidade | veículos reincidentes ───────
      const yCols = doc.y;
      const colW2 = W / 2 - 10;

      doc.fontSize(8).font(FONT_BOLD).fillColor(CINZA)
        .text('PERFIL DE VELOCIDADE', X, yCols, { width: colW2 });

      let yL = yCols + 14;
      const itens = [
        ['Velocidade média medida', `${pct(m.vel_media)} km/h`],
        ['Maior velocidade', `${N(m.pico_velocidade)} km/h`],
        ['Abaixo de 10 km/h', N(m.abaixo_piso)],
        ['Ponto de maior atenção', String(m.ponto_critico || '—')],
        ['Horário de concentração',
          m.hora_pico === null || m.hora_pico === undefined ? '—' : `${String(m.hora_pico).padStart(2, '0')}h`],
      ];
      itens.forEach(([k, v]) => {
        const wRot = colW2 * 0.58;
        const wVal = colW2 * 0.42;
        doc.fontSize(7.5).font(FONT_REGULAR).fillColor(CINZA)
          .text(k, X, yL, { width: wRot });
        doc.fontSize(7.5).font(FONT_BOLD).fillColor(PRETO)
          .text(v, X + wRot, yL, { width: wVal, align: 'right' });
        // Nome de câmera é longo e quebra em duas linhas — avançar altura fixa
        // fazia a linha seguinte colidir com ela.
        const alturaRot = doc.font(FONT_REGULAR).fontSize(7.5).heightOfString(k, { width: wRot });
        const alturaVal = doc.font(FONT_BOLD).fontSize(7.5).heightOfString(v, { width: wVal });
        yL += Math.max(alturaRot, alturaVal) + 4;
      });

      const xR = X + colW2 + 20;
      doc.fontSize(8).font(FONT_BOLD).fillColor(CINZA)
        .text('VEÍCULOS COM MAIS EXCESSOS', xR, yCols, { width: colW2 });

      let yR = yCols + 14;
      const top = (m.top_placas || []).slice(0, 5);
      if (top.length === 0) {
        doc.fontSize(7.5).font(FONT_REGULAR).fillColor(CINZA_CLARO)
          .text('Nenhum excesso registrado no período.', xR, yR, { width: colW2 });
        yR += 13;
      } else {
        top.forEach((p, i) => {
          doc.fontSize(7.5).font(FONT_REGULAR).fillColor(CINZA_CLARO)
            .text(String(i + 1), xR, yR, { width: 12 });
          doc.fontSize(7.5).font(FONT_BOLD).fillColor(PRETO)
            .text(p.placa, xR + 14, yR, { width: colW2 * 0.55 });
          doc.fontSize(7.5).font(FONT_BOLD).fillColor(VERMELHO)
            .text(`${N(p.vezes)}×`, xR + colW2 * 0.6, yR, { width: colW2 * 0.4 - 4, align: 'right' });
          yR += 13;
        });
      }

      doc.y = Math.max(yL, yR) + 6;
      linha(doc, doc.y);
      doc.moveDown(0.5);

      // ── Detalhamento por câmera ──────────────────────────────────────────
      const cams = m.por_camera || [];
      if (cams.length) {
        doc.fontSize(8).font(FONT_BOLD).fillColor(CINZA)
          .text('DETALHAMENTO POR PONTO DE MEDIÇÃO', X, doc.y);
        doc.moveDown(0.45);

        const cols = [
          { t: 'Ponto', w: W * 0.44, a: 'left' },
          { t: 'Passagens', w: W * 0.18, a: 'right' },
          { t: 'Acima do limite', w: W * 0.20, a: 'right' },
          { t: '% do total', w: W * 0.18, a: 'right' },
        ];
        let yT = doc.y;
        let cx = X;
        cols.forEach((c) => {
          doc.fontSize(6.5).font(FONT_BOLD).fillColor(CINZA_CLARO)
            .text(c.t.toUpperCase(), cx, yT, { width: c.w, align: c.a });
          cx += c.w;
        });
        yT += 11;
        linha(doc, yT - 2);

        cams.forEach((c) => {
          const share = c.passagens > 0 ? Math.round((c.acima / c.passagens) * 1000) / 10 : 0;
          cx = X;
          doc.fontSize(7.5).font(FONT_REGULAR).fillColor(PRETO)
            .text(c.camera, cx, yT, { width: cols[0].w, ellipsis: true });
          cx += cols[0].w;
          doc.fontSize(7.5).font(FONT_REGULAR).fillColor(PRETO)
            .text(N(c.passagens), cx, yT, { width: cols[1].w, align: 'right' });
          cx += cols[1].w;
          doc.fontSize(7.5).font(FONT_BOLD).fillColor(c.acima > 0 ? VERMELHO : PRETO)
            .text(N(c.acima), cx, yT, { width: cols[2].w, align: 'right' });
          cx += cols[2].w;
          doc.fontSize(7.5).font(FONT_REGULAR).fillColor(CINZA)
            .text(`${pct(share)}%`, cx, yT, { width: cols[3].w, align: 'right' });
          yT += 12;
        });

        doc.y = yT + 4;
        linha(doc, doc.y);
        doc.moveDown(0.5);
      }

      // ── Nota metodológica ────────────────────────────────────────────────
      doc.fontSize(8).font(FONT_BOLD).fillColor(CINZA)
        .text('COMO LER ESTES NÚMEROS', X, doc.y);
      doc.moveDown(0.35);

      let nota = 'O sensor de velocidade da Lombada Educativa mede a partir de 10 km/h. '
        + `As ${N(m.abaixo_piso)} passagens abaixo dessa faixa aparecem separadas: contam como `
        + 'conformidade — são condutores em velocidade de segurança — mas ficam fora do cálculo '
        + 'da média, que considera apenas medições efetivas. Todas as passagens permanecem '
        + 'registradas no sistema, inclusive essas.';

      if (m.fora_faixa > 0) {
        const teto = cliente.velocidade_maxima_plausivel;
        nota += ` ${N(m.fora_faixa)} leitura(s) foram descartadas por ultrapassar o teto de `
          + `sanidade do radar${teto ? ` (${teto} km/h)` : ''}: acima desse valor a medição indica `
          + 'ruído do sensor — reflexo ou veículo grande manobrando — e não velocidade real. '
          + 'Essas passagens seguem registradas, apenas não entram nos indicadores.';
      }

      doc.fontSize(7.5).font(FONT_REGULAR).fillColor(CINZA)
        .text(nota, X, doc.y, { width: W, align: 'justify', lineGap: 1 });

      // Rodapé personalizado do cliente, se houver
      if (cliente.pdf_rodape) {
        doc.moveDown(0.8);
        doc.fontSize(8).font(FONT_REGULAR).fillColor(CINZA)
          .text(cliente.pdf_rodape, X, doc.y, { width: W, align: 'center' });
      }

      // ── Rodapé auditável ─────────────────────────────────────────────────
      const pageH = doc.page.height;
      const agora = new Date();
      const partes = [
        `Período: ${m.periodo_inicio} a ${m.periodo_fim}`,
        `Hash: ${hashRelatorio(cliente.id, m)}`,
        `Emitido ${agora.toLocaleDateString('pt-BR', { timeZone: 'America/Bahia' })} `
          + `${agora.toLocaleTimeString('pt-BR', { timeZone: 'America/Bahia' })}`,
      ];

      // Escrever abaixo da margem inferior faz o pdfkit abrir página nova.
      // Zeramos a margem só para o rodapé fixo e restauramos em seguida.
      const margemOriginal = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;

      doc.fontSize(6).font(FONT_REGULAR).fillColor('#787878')
        .text(partes.join('  ·  '), X, pageH - 34, { width: W, align: 'center' });
      doc.fontSize(7).font(FONT_BOLD).fillColor(AZUL)
        .text('Protector Traffic Control - Lombada Educativa', X, pageH - 20,
          { width: W, align: 'center' });

      doc.page.margins.bottom = margemOriginal;
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { gerarRelatorioSemanalPDF, hashRelatorio };
