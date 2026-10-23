/**
 * Texto colado (uma entrada por linha) → lista limpa de nomes.
 * Usado nas listas de unidades e de porteiros do condomínio.
 */
const MAX_LINHAS = 500;
const MAX_TAMANHO = 60;

function parseLinhas(texto, { max = MAX_LINHAS, maxLen = MAX_TAMANHO } = {}) {
  if (typeof texto !== 'string') return { itens: [], ignoradas: [] };
  const vistos = new Set();
  const itens = [];
  const ignoradas = [];
  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.trim().replace(/\s+/g, ' ');
    if (!linha) continue;
    if (linha.length > maxLen) { ignoradas.push(linha); continue; }
    const chave = linha.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    itens.push(linha);
    if (itens.length > max) throw new Error(`Máximo de ${max} linhas`);
  }
  return { itens, ignoradas };
}

module.exports = { parseLinhas, MAX_LINHAS, MAX_TAMANHO };
