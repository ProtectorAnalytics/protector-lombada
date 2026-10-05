/**
 * Testes de lib/veiculos-base.js (orquestrador), com repo em memória e API
 * simulada — nenhuma consulta real.
 * Uso: node test/veiculos-base.test.js
 */
const assert = require('node:assert');
const { criarVeiculosBase } = require('../lib/veiculos-base');
const { criarValidador } = require('../lib/validador-placa');
const { criarRepoMemoria } = require('./helpers/repo-memoria');

let passou = 0;
async function caso(nome, fn) { await fn(); passou++; console.log(`ok - ${nome}`); }

const DADOS = {
  marca: 'VW', modelo: 'GOL', versao: null, cor: 'Branca', cor_normalizada: 'branco',
  ano_fabricacao: 2020, ano_modelo: 2021, municipio: 'Salvador', uf: 'BA',
  tipo_veiculo: 'Automovel', situacao: 'Sem restrição',
};

function apiFalsa(resultado = 'ok', { atraso = 5 } = {}) {
  const chamadas = [];
  return {
    chamadas,
    async consultar(placa) {
      chamadas.push(placa);
      await new Promise((r) => setTimeout(r, atraso));
      return {
        resultado, httpStatus: resultado === 'ok' ? 200 : 406, duracaoMs: atraso,
        consome: ['ok', 'sem_resultado'].includes(resultado),
        dados: resultado === 'ok' ? DADOS : null,
      };
    },
    async saldo() { return 900; },
  };
}

function montar({ config, passagens, api = apiFalsa() } = {}) {
  const repo = criarRepoMemoria({ config, passagens });
  const validador = criarValidador({ contarPassagens: repo.contarPassagens });
  const vb = criarVeiculosBase({ repo, api, validador, agora: () => new Date('2026-10-04T12:00:00Z') });
  return { repo, api, vb };
}

(async () => {
  await caso('placa nova é consultada e gravada como consultado', async () => {
    const { repo, api, vb } = montar();
    const l = await vb.aoPassar({ placa: 'ABC1D23', clienteId: 'c1' });
    assert.strictEqual(api.chamadas.length, 1);
    assert.strictEqual(l.status, 'consultado');
    assert.strictEqual(l.modelo, 'GOL');
    assert.strictEqual(repo.consultas[0].custo, 0.03);
    assert.strictEqual(repo.consultas[0].origem, 'captura');
  });

  await caso('RAJADA: 10 chegadas simultâneas da mesma placa = 1 chamada paga', async () => {
    const { api, vb } = montar({ api: apiFalsa('ok', { atraso: 30 }) });
    await Promise.all(Array.from({ length: 10 }, () => vb.aoPassar({ placa: 'ABC1D23', clienteId: 'c1' })));
    assert.strictEqual(api.chamadas.length, 1);
  });

  await caso('antiga e Mercosul do mesmo carro = 1 linha e 1 chamada', async () => {
    const { repo, api, vb } = montar();
    await vb.aoPassar({ placa: 'ABC1234', clienteId: 'c1' });
    await vb.aoPassar({ placa: 'ABC1C34', clienteId: 'c2' });
    assert.strictEqual(api.chamadas.length, 1);
    assert.strictEqual(api.chamadas[0], 'ABC1C34');
    assert.strictEqual(repo.linhas.size, 1);
    assert.strictEqual(repo.linhas.get('ABC1C34').placa_antiga, 'ABC1234');
  });

  await caso('placa já na base não chama a API em outro condomínio', async () => {
    const { api, vb } = montar();
    await vb.aoPassar({ placa: 'ABC1D23', clienteId: 'c1' });
    await vb.aoPassar({ placa: 'ABC1D23', clienteId: 'c2' });
    assert.strictEqual(api.chamadas.length, 1);
  });

  await caso('formato inválido não grava nem consulta', async () => {
    const { repo, api, vb } = montar();
    assert.strictEqual(await vb.aoPassar({ placa: 'XX12', clienteId: 'c1' }), null);
    assert.strictEqual(api.chamadas.length, 0);
    assert.strictEqual(repo.linhas.size, 0);
  });

  await caso('quase gêmea de placa frequente vira suspeita sem consultar', async () => {
    const { repo, api, vb } = montar({ passagens: { c1: { ABC1D23: 10 } } });
    const l = await vb.aoPassar({ placa: 'ABC1D28', clienteId: 'c1' });
    assert.strictEqual(api.chamadas.length, 0);
    assert.strictEqual(l.status, 'suspeita');
    assert.strictEqual(l.suspeita_de, 'ABC1D23');
    assert.strictEqual(repo.linhas.get('ABC1D28').suspeita_cliente_id, 'c1');
  });

  for (const [nome, config, motivo] of [
    ['consultas desligadas', { ativo: false }, 'desligado'],
    ['saldo zerado', { saldo_atual: 0 }, 'sem_saldo'],
  ]) {
    await caso(`trava "${nome}": fica pendente e não chama`, async () => {
      const { repo, api, vb } = montar({ config });
      const l = await vb.aoPassar({ placa: 'ABC1D23', clienteId: 'c1' });
      assert.strictEqual(api.chamadas.length, 0);
      assert.strictEqual(l.status, 'pendente');
      assert.strictEqual(repo.linhas.get('ABC1D23').ultimo_erro, motivo);
    });
  }

  await caso('trava teto: com gasto = teto fica pendente e não chama', async () => {
    const { repo, api, vb } = montar({ config: { teto_mensal: 0.06 } });
    repo.consultas.push({ custo: 0.03 }, { custo: 0.03 });
    const l = await vb.aoPassar({ placa: 'ABC1D23', clienteId: 'c1' });
    assert.strictEqual(api.chamadas.length, 0);
    assert.strictEqual(l.status, 'pendente');
  });

  await caso('sem_resultado é final e conta custo', async () => {
    const { repo, vb } = montar({ api: apiFalsa('sem_resultado') });
    const l = await vb.aoPassar({ placa: 'ABC1D23', clienteId: 'c1' });
    assert.strictEqual(l.status, 'sem_resultado');
    assert.strictEqual(repo.consultas[0].custo, 0.03);
  });

  await caso('timeout vira erro com próxima tentativa em 5 min e custo 0', async () => {
    const { repo, vb } = montar({ api: apiFalsa('timeout') });
    const l = await vb.aoPassar({ placa: 'ABC1D23', clienteId: 'c1' });
    assert.strictEqual(l.status, 'erro');
    assert.strictEqual(l.tentativas, 1);
    assert.strictEqual(l.proxima_tentativa_em, '2026-10-04T12:05:00.000Z');
    assert.strictEqual(repo.consultas[0].custo, 0);
  });

  await caso('token inválido desliga as consultas', async () => {
    const { repo, vb } = montar({ api: apiFalsa('token_invalido') });
    await vb.aoPassar({ placa: 'ABC1D23', clienteId: 'c1' });
    assert.strictEqual((await repo.lerConfig()).ativo, false);
    assert.strictEqual(repo.linhas.get('ABC1D23').status, 'pendente');
  });

  await caso('ultimoResultado devolve o resultado da consulta mais recente (null se nenhuma)', async () => {
    const { repo, vb } = montar({ api: apiFalsa('token_invalido') });
    assert.strictEqual(await repo.ultimoResultado(), null);
    await vb.aoPassar({ placa: 'ABC1D23', clienteId: 'c1' });
    assert.strictEqual(await repo.ultimoResultado(), 'token_invalido');
  });

  await caso('limite (429) zera o saldo conhecido e mantém pendente', async () => {
    const { repo, vb } = montar({ api: apiFalsa('limite') });
    await vb.aoPassar({ placa: 'ABC1D23', clienteId: 'c1' });
    assert.strictEqual((await repo.lerConfig()).saldo_atual, 0);
    assert.strictEqual(repo.linhas.get('ABC1D23').status, 'pendente');
  });

  await caso('falha do repositório não lança (a notificação segue)', async () => {
    const { repo, vb } = montar();
    repo.buscar = async () => { throw new Error('banco fora'); };
    assert.strictEqual(await vb.aoPassar({ placa: 'ABC1D23', clienteId: 'c1' }), null);
  });

  await caso('captura em voo + fila = 1 chamada', async () => {
    const { api, vb } = montar({ api: apiFalsa('ok', { atraso: 50 }) });
    const captura = vb.aoPassar({ placa: 'ABC1D23', clienteId: 'c1' });
    await new Promise((r) => setTimeout(r, 10));
    const r = await vb.consultarAgora('ABC1D23', 'repescagem');
    await captura;
    assert.strictEqual(api.chamadas.length, 1);
    assert.strictEqual(r.executou, false);
    assert.strictEqual(r.motivo, 'em_andamento');
  });

  await caso('consultarAgora não paga placa já consultada', async () => {
    const { api, vb } = montar();
    await vb.aoPassar({ placa: 'ABC1D23', clienteId: 'c1' });
    const r = await vb.consultarAgora('ABC1D23', 'repescagem');
    assert.strictEqual(r.executou, false);
    assert.strictEqual(api.chamadas.length, 1);
  });

  await caso('linha reservada nasce com posse de 5 min', async () => {
    const { repo, vb } = montar({ config: { ativo: false } });
    await vb.aoPassar({ placa: 'ABC1D23', clienteId: 'c1' });
    const l = repo.linhas.get('ABC1D23');
    assert.strictEqual(l.status, 'pendente');
    assert.strictEqual(l.proxima_tentativa_em, '2026-10-04T12:05:00.000Z');
    assert.strictEqual((await repo.fila(50, '2026-10-04T12:00:00.000Z')).length, 0);
  });

  await caso('atualizar antes de registrarConsulta', async () => {
    const { repo, vb } = montar();
    repo.registrarConsulta = async () => { throw new Error('extrato fora'); };
    await vb.aoPassar({ placa: 'ABC1D23', clienteId: 'c1' });
    assert.strictEqual(repo.linhas.get('ABC1D23').status, 'consultado');
  });

  console.log(`\n${passou} casos passaram`);
})().catch((e) => { console.error(e); process.exit(1); });
