/**
 * Cliente da APIPLACAS (wdapi2.com.br).
 *
 * O token vai NO CAMINHO da URL, então nada daqui pode devolver URL ou
 * mensagem de erro do fetch: só o nome do erro e o status HTTP.
 *
 * Medido em 04/10/2026: consulta ~0,5 s (máx 0,74 s); placa de formato
 * inválido volta 406 (não 401, como diz a documentação) e não consome saldo.
 */
const BASE = 'https://wdapi2.com.br';

const COR_NEUTRA = {
  branca: 'branco', preta: 'preto', dourada: 'dourado',
  vermelha: 'vermelho', amarela: 'amarelo', roxa: 'roxo',
};

function normalizarCor(cor) {
  const s = String(cor || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!s) return null;
  return COR_NEUTRA[s] || s;
}

function texto(v) {
  const s = v === undefined || v === null ? '' : String(v).trim();
  return s || null;
}

function ano(v) {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n > 1900 && n < 2100 ? n : null;
}

function mapearDados(c) {
  const extra = c.extra && typeof c.extra === 'object' ? c.extra : {};
  return {
    marca: texto(c.MARCA || c.marca),
    modelo: texto(c.MODELO || c.modelo),
    versao: texto(c.VERSAO),
    cor: texto(c.cor),
    cor_normalizada: normalizarCor(c.cor),
    ano_fabricacao: ano(c.ano || extra.ano_fabricacao),
    ano_modelo: ano(c.anoModelo || extra.ano_modelo),
    municipio: texto(c.municipio),
    uf: texto(c.uf),
    tipo_veiculo: texto(extra.tipo_veiculo),
    situacao: texto(c.situacao),
  };
}

function classificar(http, corpo) {
  const msg = String((corpo && corpo.message) || '');
  if (http === 200 && (corpo.MARCA || corpo.marca)) return 'ok';
  if (http === 401 || (http === 406 && /inv[aá]lida/i.test(msg))) return 'placa_invalida';
  if (http === 406) return 'sem_resultado';
  if (http === 402) return 'token_invalido';
  if (http === 429) return 'limite';
  return 'erro';
}

// "sem_resultado" conta como consumido por precaução: a APIPLACAS não
// documenta se cobra, e o teto precisa errar para o lado seguro.
const CONSOME = new Set(['ok', 'sem_resultado']);

function criarClienteApiplacas({ token, fetchImpl = fetch, timeoutMs = 3000 } = {}) {
  const tok = String(token || '').trim();
  if (!tok) throw new Error('APIPLACAS_TOKEN não configurado');

  async function chamar(caminho) {
    const inicio = Date.now();
    try {
      const r = await fetchImpl(`${BASE}/${caminho}/${tok}`, { signal: AbortSignal.timeout(timeoutMs) });
      let corpo = {};
      try {
        corpo = await r.json();
      } catch (e) {
        // timeout/abort durante json() vira timeout; outros erros de parse são engolidos
        if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
          throw e;
        }
        // parse error (SyntaxError, etc) em qualquer status: manter http e corpo vazio
        corpo = {};
      }
      return { http: r.status, corpo: corpo || {}, duracaoMs: Date.now() - inicio, falha: null };
    } catch (e) {
      const nome = e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'timeout' : 'erro';
      return { http: null, corpo: {}, duracaoMs: Date.now() - inicio, falha: nome };
    }
  }

  async function consultar(placa) {
    const r = await chamar(`consulta/${encodeURIComponent(placa)}`);
    const resultado = r.falha || classificar(r.http, r.corpo);
    return {
      resultado,
      httpStatus: r.http,
      duracaoMs: r.duracaoMs,
      consome: CONSOME.has(resultado),
      dados: resultado === 'ok' ? mapearDados(r.corpo) : null,
    };
  }

  async function saldo() {
    const r = await chamar('saldo');
    const qtd = r.corpo.qtdConsultas;
    if (r.http !== 200) return null;
    if (typeof qtd === 'number' && Number.isFinite(qtd)) return qtd;
    if (typeof qtd === 'string' && qtd.trim() !== '') {
      const n = Number(qtd);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  return { consultar, saldo };
}

module.exports = { criarClienteApiplacas, normalizarCor };
