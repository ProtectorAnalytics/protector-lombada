/**
 * grafico-acessivel.js — alternativa textual dos gráficos em <canvas>.
 *
 * Leitor de tela não enxerga o que é desenhado num canvas. Para cada gráfico
 * o canvas vira role="img" com um resumo falado (título, total e pico), e uma
 * tabela visualmente oculta ao lado dá os valores ponto a ponto.
 *
 * Carregado pelo browser (admin/index.html, dashboard/index.html) via
 * <script src="/js/grafico-acessivel.js"> e testado no Node via require.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.graficoAcessivel = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const fmtNum = (n) => Number(n).toLocaleString('pt-BR');

  // Esconde da tela e mantém para leitor de tela (padrão "visually hidden")
  const ESTILO_OCULTO = {
    position: 'absolute', width: '1px', height: '1px', padding: '0',
    margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap', border: '0',
  };

  /** @returns {Array<[string, number]>} pares rótulo/valor até o menor comprimento */
  function linhasGrafico(rotulos, valores) {
    const n = Math.min(rotulos.length, valores.length);
    return rotulos.slice(0, n).map((r, i) => [r, valores[i]]);
  }

  /** @param {{titulo: string, rotulos: string[], valores: number[], unidade: string}} g */
  function resumoGrafico({ titulo, rotulos, valores, unidade }) {
    const linhas = linhasGrafico(rotulos, valores);
    const total = linhas.reduce((s, [, v]) => s + v, 0);
    if (total === 0) return `${titulo}. Nenhum registro no período.`;
    const [rotuloPico, pico] = linhas.reduce((m, l) => (l[1] > m[1] ? l : m));
    return `${titulo}. Total: ${fmtNum(total)} ${unidade}. ` +
      `Maior valor: ${fmtNum(pico)} ${unidade} em ${rotuloPico}.`;
  }

  function novaTabela(doc, canvas) {
    const tabela = doc.createElement('table');
    tabela.id = `${canvas.id}-dados`;
    Object.assign(tabela.style, ESTILO_OCULTO);
    canvas.insertAdjacentElement('afterend', tabela);
    return tabela;
  }

  // Monta por DOM (textContent), nunca por innerHTML: rótulos vêm de dados
  function preencherTabela(doc, tabela, g) {
    const cab = doc.createElement('tr');
    [g.cabecalho || 'Período', g.unidade].forEach((t) => {
      const th = doc.createElement('th');
      th.scope = 'col';
      th.textContent = t;
      cab.appendChild(th);
    });
    const caption = doc.createElement('caption');
    caption.textContent = g.titulo;
    const linhas = linhasGrafico(g.rotulos, g.valores).map(([r, v]) => {
      const tr = doc.createElement('tr');
      const th = doc.createElement('th');
      th.scope = 'row';
      th.textContent = r;
      const td = doc.createElement('td');
      td.textContent = fmtNum(v);
      tr.append(th, td);
      return tr;
    });
    tabela.replaceChildren(caption, cab, ...linhas);
  }

  /**
   * Descreve um canvas já desenhado. Idempotente: redesenhar só atualiza.
   * @param {HTMLCanvasElement} canvas
   * @param {{titulo: string, rotulos: string[], valores: number[], unidade: string, cabecalho?: string}} g
   */
  function descreverGrafico(canvas, g) {
    if (!canvas || !canvas.ownerDocument) return;
    const doc = canvas.ownerDocument;
    const tabela = doc.getElementById(`${canvas.id}-dados`) || novaTabela(doc, canvas);
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', resumoGrafico(g));
    preencherTabela(doc, tabela, g);
  }

  return { resumoGrafico, linhasGrafico, descreverGrafico };
});
