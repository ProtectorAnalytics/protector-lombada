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

  await caso('suspeita de c2 passando em c1 sem vizinha frequente em c1 vira consultada com 1 chamada', async () => {
    const { repo, api, vb } = montar({ passagens: { c2: { ABC1D23: 10 } } });
    await repo.reservar({ placa: 'ABC1D28', status: 'suspeita', suspeita_de: 'ABC1D23', suspeita_cliente_id: 'c2' });
    const l = await vb.aoPassar({ placa: 'ABC1D28', clienteId: 'c1' });
    assert.strictEqual(api.chamadas.length, 1);
    assert.strictEqual(l.status, 'consultado');
    const g = repo.linhas.get('ABC1D28');
    assert.strictEqual(g.suspeita_de, null);
    assert.strictEqual(g.suspeita_cliente_id, null);
  });

  await caso('suspeita de c2 passando em c1 com vizinha frequente em c1 continua suspeita, 0 chamadas', async () => {
    const { repo, api, vb } = montar({ passagens: { c1: { ABC1D23: 10 }, c2: { ABC1D23: 10 } } });
    await repo.reservar({ placa: 'ABC1D28', status: 'suspeita', suspeita_de: 'ABC1D23', suspeita_cliente_id: 'c2' });
    await vb.aoPassar({ placa: 'ABC1D28', clienteId: 'c1' });
    assert.strictEqual(api.chamadas.length, 0);
    assert.strictEqual(repo.linhas.get('ABC1D28').status, 'suspeita');
    assert.strictEqual(repo.linhas.get('ABC1D28').suspeita_cliente_id, 'c2');
  });

  await caso('RAJADA em suspeita de outro cliente: 10 chegadas = 1 chamada', async () => {
    const { repo, api, vb } = montar({ passagens: { c2: { ABC1D23: 10 } }, api: apiFalsa('ok', { atraso: 30 }) });
    await repo.reservar({ placa: 'ABC1D28', status: 'suspeita', suspeita_de: 'ABC1D23', suspeita_cliente_id: 'c2' });
    await Promise.all(Array.from({ length: 10 }, () => vb.aoPassar({ placa: 'ABC1D28', clienteId: 'c1' })));
    assert.strictEqual(api.chamadas.length, 1);
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

  await caso('fila consulta pendentes vencidas e respeita o lote', async () => {
    const { repo, api, vb } = montar();
    for (const p of ['AAA1A11', 'BBB2B22', 'CCC3C33']) {
      await repo.reservar({ placa: p, status: 'pendente', visto_por_ultimo_em: '2026-10-04T00:00:00Z' });
    }
    await repo.reservar({ placa: 'DDD4D44', status: 'erro', tentativas: 1, proxima_tentativa_em: '2026-10-05T00:00:00Z', visto_por_ultimo_em: 'x' });
    const r = await vb.processarFila({ limite: 2 });
    assert.strictEqual(r.consultadas, 2);
    assert.strictEqual(api.chamadas.length, 2);
    assert.ok(!api.chamadas.includes('DDD4D44'));
  });

  await caso('fila PARA no meio quando o gasto alcança o teto', async () => {
    const { repo, api, vb } = montar({ config: { teto_mensal: 0.06 } });
    for (const p of ['AAA1A11', 'BBB2B22', 'CCC3C33', 'EEE5E55']) {
      await repo.reservar({ placa: p, status: 'pendente', visto_por_ultimo_em: 'x' });
    }
    const r = await vb.processarFila({ limite: 50 });
    assert.strictEqual(api.chamadas.length, 2);
    assert.strictEqual(r.parou, 'teto');
  });

  await caso('fila pula placa em_andamento e consulta a próxima', async () => {
    const { repo, api, vb } = montar();
    for (const p of ['AAA1A11', 'BBB2B22']) {
      await repo.reservar({ placa: p, status: 'pendente', visto_por_ultimo_em: 'x' });
    }
    const orig = repo.reivindicar;
    repo.reivindicar = async (placa, a, b) => (placa === 'AAA1A11' ? false : orig(placa, a, b));
    const r = await vb.processarFila({ limite: 50 });
    assert.deepStrictEqual(api.chamadas, ['BBB2B22']);
    assert.strictEqual(r.consultadas, 1);
    assert.strictEqual(r.parou, null);
  });

  await caso('exceção em uma placa pula e segue o lote', async () => {
    const { repo, api, vb } = montar();
    for (const p of ['AAA1A11', 'BBB2B22']) {
      await repo.reservar({ placa: p, status: 'pendente', visto_por_ultimo_em: 'x' });
    }
    const orig = repo.buscar;
    repo.buscar = async (placa) => { if (placa === 'AAA1A11') throw new Error('banco fora'); return orig(placa); };
    const r = await vb.processarFila({ limite: 50 });
    assert.deepStrictEqual(api.chamadas, ['BBB2B22']);
    assert.strictEqual(r.consultadas, 1);
    assert.strictEqual(r.parou, null);
  });

  await caso('10 consultarAgora paralelos numa linha pendente sem posse = 1 chamada', async () => {
    const { repo, api, vb } = montar();
    await repo.reservar({ placa: 'ABC1D23', status: 'pendente', proxima_tentativa_em: null, visto_por_ultimo_em: 'x' });
    const rs = await Promise.all(Array.from({ length: 10 }, () => vb.consultarAgora('ABC1D23', 'repescagem')));
    assert.strictEqual(api.chamadas.length, 1);
    assert.strictEqual(rs.filter((r) => r.executou).length, 1);
    const outros = rs.filter((r) => !r.executou);
    assert.strictEqual(outros.length, 9);
    assert.ok(outros.every((r) => r.motivo === 'em_andamento'));
  });

  console.log(`\n${passou} casos passaram`);
})().catch((e) => { console.error(e); process.exit(1); });
