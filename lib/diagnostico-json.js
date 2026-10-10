/**
 * Resumo legível de um corpo que o JSON.parse rejeitou, para o debug_log.
 *
 * A câmera manda a foto em base64 dentro do JSON (~1 MB); gravar o corpo
 * inteiro afogaria o log e esconderia o defeito. Aqui os trechos de base64
 * viram um marcador com o tamanho, e o que sobra é o começo, o fim e a região
 * onde o parser parou — o suficiente para ver o que a câmera mandou de errado.
 */

const BASE64_LONGO = /[A-Za-z0-9+/=]{200,}/g;
const MAX_INICIO = 600;
const MAX_FIM = 400;
const MAX_TRECHO = 600;
const RAIO_ERRO = 250;

function semBase64(texto) {
  return texto.replace(BASE64_LONGO, (m) => `<base64 ${m.length}>`);
}

function posicaoDoErro(mensagem) {
  const m = /position (\d+)/.exec(mensagem || '');
  return m ? Number(m[1]) : null;
}

function resumirCorpoInvalido(body, err) {
  const texto = typeof body === 'string' ? body : String(body ?? '');
  const erroParser = err?.message || '';
  const pos = posicaoDoErro(erroParser);
  const trecho = pos === null
    ? ''
    : texto.slice(Math.max(0, pos - RAIO_ERRO), pos + RAIO_ERRO);

  return {
    tamanho: texto.length,
    erro_parser: erroParser.slice(0, 300),
    inicio: semBase64(texto.slice(0, 20000)).slice(0, MAX_INICIO),
    trecho_erro: semBase64(trecho).slice(0, MAX_TRECHO),
    fim: semBase64(texto.slice(-20000)).slice(-MAX_FIM),
  };
}

// Câmeras antigas autenticam com ?token=<segredo>: o log nunca pode guardá-lo
const PARAM_SECRETO = /([?&](?:token|key|secret|senha|password)=)[^&#]*/gi;

/** URL da requisição para o log, com tokens e chaves trocados por <redigido>. */
function urlSemSegredos(url) {
  return String(url ?? '').replace(PARAM_SECRETO, '$1<redigido>');
}

module.exports = { resumirCorpoInvalido, urlSemSegredos };
