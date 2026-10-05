/**
 * Testes de lib/apiplacas.js — API simulada, nenhuma consulta real.
 * Uso: node test/apiplacas.test.js
 */
const assert = require('node:assert');
const { criarClienteApiplacas, normalizarCor } = require('../lib/apiplacas');

const TOKEN = 'tok_secreto_de_teste_0123456789ab';
let passou = 0;
async function caso(nome, fn) { await fn(); passou++; console.log(`ok - ${nome}`); }

function fetchFalso(status, corpo, { atraso = 0, lancar = null } = {}) {
  const chamadas = [];
  const fn = async (url, opts) => {
    chamadas.push(url);
    if (lancar) throw lancar;
    if (atraso) {
      await new Promise((ok, falha) => {
        const t = setTimeout(ok, atraso);
        opts?.signal?.addEventListener('abort', () => {
          clearTimeout(t);
          falha(Object.assign(new Error('aborted'), { name: 'TimeoutError' }));
        });
      });
    }
    return { status, json: async () => corpo };
  };
  fn.chamadas = chamadas;
  return fn;
}

function fetchComJson(status, jsonFn, { ok = status >= 200 && status < 300 } = {}) {
  const chamadas = [];
  const fn = async (url, opts) => {
    chamadas.push(url);
    return { status, ok, json: jsonFn };
  };
  fn.chamadas = chamadas;
  return fn;
}

const RESPOSTA_OK = {
  MARCA: 'VW', MODELO: 'CROSSFOX', VERSAO: 'CROSSFOX 1.6', cor: 'Prata',
  ano: '2007', anoModelo: '2008', municipio: 'São Leopoldo', uf: 'RS',
  situacao: 'Sem restrição', chassi: '*****10137',
  extra: { tipo_veiculo: 'Automovel', tipo_doc_prop: 'Fisica' },
  fipe: { dados: [{ texto_valor: 'R$ 28.799,00' }] },
};

(async () => {
  await caso('200 mapeia só os campos permitidos', async () => {
    const api = criarClienteApiplacas({ token: TOKEN, fetchImpl: fetchFalso(200, RESPOSTA_OK) });
    const r = await api.consultar('ABC1D23');
    assert.strictEqual(r.resultado, 'ok');
    assert.strictEqual(r.consome, true);
    assert.deepStrictEqual(r.dados, {
      marca: 'VW', modelo: 'CROSSFOX', versao: 'CROSSFOX 1.6', cor: 'Prata', cor_normalizada: 'prata',
      ano_fabricacao: 2007, ano_modelo: 2008, municipio: 'São Leopoldo', uf: 'RS',
      tipo_veiculo: 'Automovel', situacao: 'Sem restrição',
    });
    assert.ok(!JSON.stringify(r).includes('chassi'));
    assert.ok(!JSON.stringify(r).includes('Fisica'));
  });

  await caso('URL leva placa e token no caminho', async () => {
    const f = fetchFalso(200, RESPOSTA_OK);
    await criarClienteApiplacas({ token: TOKEN, fetchImpl: f }).consultar('ABC1D23');
    assert.strictEqual(f.chamadas[0], `https://wdapi2.com.br/consulta/ABC1D23/${TOKEN}`);
  });

  await caso('406 "sem resultados" consome e vira sem_resultado', async () => {
    const api = criarClienteApiplacas({ token: TOKEN, fetchImpl: fetchFalso(406, { message: 'Sem resultados!' }) });
    const r = await api.consultar('ABC1D23');
    assert.strictEqual(r.resultado, 'sem_resultado');
    assert.strictEqual(r.consome, true);
  });

  await caso('406 com "Placa Invalida" não consome', async () => {
    const api = criarClienteApiplacas({ token: TOKEN, fetchImpl: fetchFalso(406, { message: 'Placa Invalida favor usar o formato AAA0X00 ou AAA9999 ' }) });
    const r = await api.consultar('ABC1D23');
    assert.strictEqual(r.resultado, 'placa_invalida');
    assert.strictEqual(r.consome, false);
  });

  await caso('401, 402, 429 e 500 classificados sem consumo', async () => {
    const esperado = { 401: 'placa_invalida', 402: 'token_invalido', 429: 'limite', 500: 'erro' };
    for (const [st, res] of Object.entries(esperado)) {
      const r = await criarClienteApiplacas({ token: TOKEN, fetchImpl: fetchFalso(Number(st), { message: 'x' }) }).consultar('ABC1D23');
      assert.strictEqual(r.resultado, res, `HTTP ${st}`);
      assert.strictEqual(r.consome, false);
    }
  });

  await caso('estoura em 3 s e vira timeout', async () => {
    const api = criarClienteApiplacas({ token: TOKEN, timeoutMs: 50, fetchImpl: fetchFalso(200, RESPOSTA_OK, { atraso: 500 }) });
    const r = await api.consultar('ABC1D23');
    assert.strictEqual(r.resultado, 'timeout');
    assert.strictEqual(r.consome, false);
    assert.strictEqual(r.httpStatus, null);
  });

  await caso('erro de rede com a URL na mensagem não vaza o token', async () => {
    const erro = new TypeError(`fetch failed for https://wdapi2.com.br/consulta/ABC1D23/${TOKEN}`);
    const api = criarClienteApiplacas({ token: TOKEN, fetchImpl: fetchFalso(0, {}, { lancar: erro }) });
    const r = await api.consultar('ABC1D23');
    assert.strictEqual(r.resultado, 'erro');
    assert.ok(!JSON.stringify(r).includes(TOKEN));
  });

  await caso('saldo lê qtdConsultas e devolve null se falhar', async () => {
    assert.strictEqual(await criarClienteApiplacas({ token: TOKEN, fetchImpl: fetchFalso(200, { qtdConsultas: 995 }) }).saldo(), 995);
    assert.strictEqual(await criarClienteApiplacas({ token: TOKEN, fetchImpl: fetchFalso(402, { message: 'x' }) }).saldo(), null);
  });

  await caso('sem token o cliente nem é criado', async () => {
    assert.throws(() => criarClienteApiplacas({ token: '' }), /APIPLACAS_TOKEN/);
  });

  await caso('normalizarCor: minúsculas, sem acento, gênero neutro', async () => {
    assert.strictEqual(normalizarCor('PRATA'), 'prata');
    assert.strictEqual(normalizarCor('Branca'), 'branco');
    assert.strictEqual(normalizarCor('Dourada'), 'dourado');
    assert.strictEqual(normalizarCor('Preta'), 'preto');
    assert.strictEqual(normalizarCor('Vermelha'), 'vermelho');
    assert.strictEqual(normalizarCor('Amarela'), 'amarelo');
    assert.strictEqual(normalizarCor('Cinza'), 'cinza');
    assert.strictEqual(normalizarCor(''), null);
  });

  await caso('saldo devolve null para qtdConsultas null, "" e ausente; 995 para 995', async () => {
    assert.strictEqual(await criarClienteApiplacas({ token: TOKEN, fetchImpl: fetchFalso(200, { qtdConsultas: null }) }).saldo(), null);
    assert.strictEqual(await criarClienteApiplacas({ token: TOKEN, fetchImpl: fetchFalso(200, { qtdConsultas: '' }) }).saldo(), null);
    assert.strictEqual(await criarClienteApiplacas({ token: TOKEN, fetchImpl: fetchFalso(200, {}) }).saldo(), null);
    assert.strictEqual(await criarClienteApiplacas({ token: TOKEN, fetchImpl: fetchFalso(200, { qtdConsultas: 995 }) }).saldo(), 995);
  });

  await caso('token com espaço/\\n nas pontas gera URL limpa; só espaços lança', async () => {
    const f1 = fetchFalso(200, RESPOSTA_OK);
    await criarClienteApiplacas({ token: '  tok_secreto_de_teste_0123456789ab\n', fetchImpl: f1 }).consultar('ABC1D23');
    assert.strictEqual(f1.chamadas[0], `https://wdapi2.com.br/consulta/ABC1D23/tok_secreto_de_teste_0123456789ab`);
    assert.throws(() => criarClienteApiplacas({ token: '   \n  ' }), /APIPLACAS_TOKEN/);
  });

  await caso('200 cujo json() rejeita com TimeoutError → timeout, consome false, httpStatus null', async () => {
    const jsonFn = async () => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); };
    const api = criarClienteApiplacas({ token: TOKEN, fetchImpl: fetchComJson(200, jsonFn) });
    const r = await api.consultar('ABC1D23');
    assert.strictEqual(r.resultado, 'timeout');
    assert.strictEqual(r.consome, false);
    assert.strictEqual(r.httpStatus, null);
  });

  await caso('429 cujo json() rejeita com SyntaxError → limite', async () => {
    const jsonFn = async () => { throw new SyntaxError('invalid json'); };
    const api = criarClienteApiplacas({ token: TOKEN, fetchImpl: fetchComJson(429, jsonFn, { ok: false }) });
    const r = await api.consultar('ABC1D23');
    assert.strictEqual(r.resultado, 'limite');
    assert.strictEqual(r.consome, false);
    assert.strictEqual(r.httpStatus, 429);
  });

  await caso('406 cujo json() rejeita com SyntaxError → sem_resultado, consome true', async () => {
    const jsonFn = async () => { throw new SyntaxError('invalid json'); };
    const api = criarClienteApiplacas({ token: TOKEN, fetchImpl: fetchComJson(406, jsonFn, { ok: false }) });
    const r = await api.consultar('ABC1D23');
    assert.strictEqual(r.resultado, 'sem_resultado');
    assert.strictEqual(r.consome, true);
    assert.strictEqual(r.httpStatus, 406);
  });

  await caso('402 cujo json() rejeita com SyntaxError → token_invalido', async () => {
    const jsonFn = async () => { throw new SyntaxError('invalid json'); };
    const api = criarClienteApiplacas({ token: TOKEN, fetchImpl: fetchComJson(402, jsonFn, { ok: false }) });
    const r = await api.consultar('ABC1D23');
    assert.strictEqual(r.resultado, 'token_invalido');
    assert.strictEqual(r.consome, false);
    assert.strictEqual(r.httpStatus, 402);
  });

  console.log(`\n${passou} casos passaram`);
})().catch((e) => { console.error(e); process.exit(1); });
