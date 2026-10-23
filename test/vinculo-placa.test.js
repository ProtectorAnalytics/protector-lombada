/**
 * Testes de site/js/vinculo-placa.js.
 * Uso: node test/vinculo-placa.test.js
 */
const assert = require('node:assert');
const lib = require('../site/js/vinculo-placa');
const { TIPOS_PESSOA, SEM_CADASTRO, tipoPessoa, indexarVinculos, vinculoNaHora, vinculoVigente, rotuloCadastro, mesmaPlaca } = lib;

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

const TROCA = '2026-10-23T12:40:00Z';
const fulano = { placa: 'ABC1234', nome_morador: 'Fulano', vigente_desde: null, encerrado_em: TROCA };
const beltrano = { placa: 'ABC1234', nome_morador: 'Beltrano', vigente_desde: TROCA, encerrado_em: null };
// ordem embaralhada de propósito: o índice é quem ordena
const indice = indexarVinculos([beltrano, fulano]);

caso('devolve Fulano antes da troca e Beltrano depois', () => {
  assert.strictEqual(vinculoNaHora(indice, 'ABC1234', '2026-10-23T12:39:59Z').nome_morador, 'Fulano');
  assert.strictEqual(vinculoNaHora(indice, 'ABC1234', '2026-10-23T15:00:00Z').nome_morador, 'Beltrano');
});

caso('passagem exatamente na troca pertence a Beltrano', () => {
  assert.strictEqual(vinculoNaHora(indice, 'ABC1234', TROCA).nome_morador, 'Beltrano');
  assert.strictEqual(vinculoNaHora(indice, 'ABC1234', new Date(TROCA)).nome_morador, 'Beltrano');
});

caso('vigente_desde nulo vale desde sempre', () => {
  assert.strictEqual(vinculoNaHora(indice, 'ABC1234', '2026-05-01T10:00:00Z').nome_morador, 'Fulano');
});

caso('placa antiga e Mercosul casam entre si', () => {
  assert.strictEqual(vinculoNaHora(indice, 'ABC1C34', '2026-10-24T00:00:00Z').nome_morador, 'Beltrano');
  const outro = indexarVinculos([{ placa: 'ABC1C34', nome_morador: 'Sicrano', vigente_desde: null, encerrado_em: null }]);
  assert.strictEqual(vinculoNaHora(outro, 'ABC1234', '2026-10-24T00:00:00Z').nome_morador, 'Sicrano');
});

caso('duas linhas casam: vence a de vigente_desde mais recente, em qualquer ordem', () => {
  const antiga = { placa: 'DEF1234', nome_morador: 'Antiga', vigente_desde: null, encerrado_em: null, criado_em: '2026-01-01T00:00:00Z' };
  const nova = { placa: 'DEF1234', nome_morador: 'Nova', vigente_desde: '2026-06-01T00:00:00Z', encerrado_em: null, criado_em: '2025-01-01T00:00:00Z' };
  for (const ordem of [[antiga, nova], [nova, antiga]]) {
    assert.strictEqual(vinculoNaHora(indexarVinculos(ordem), 'DEF1234', '2026-07-01T00:00:00Z').nome_morador, 'Nova');
  }
});

caso('empate de vigente_desde nulo: vence a de criado_em mais recente, em qualquer ordem', () => {
  const velha = { placa: 'GHI1234', nome_morador: 'Velha', vigente_desde: null, encerrado_em: '2026-09-01T00:00:00Z', criado_em: '2026-01-01T00:00:00Z' };
  const recente = { placa: 'GHI1C34', nome_morador: 'Recente', vigente_desde: null, encerrado_em: null, criado_em: '2026-03-01T00:00:00Z' };
  for (const ordem of [[velha, recente], [recente, velha]]) {
    const idx = indexarVinculos(ordem);
    assert.strictEqual(vinculoNaHora(idx, 'GHI1234', '2026-08-01T00:00:00Z').nome_morador, 'Recente');
    assert.strictEqual(vinculoVigente(idx, 'GHI1234').nome_morador, 'Recente');
  }
});

caso('recadastro após encerramento: antes do encerramento é A, depois é B', () => {
  const FIM = '2026-10-01T12:00:00Z';
  const a = { placa: 'JKL1234', nome_morador: 'A', vigente_desde: null, encerrado_em: FIM, criado_em: '2026-01-01T00:00:00Z' };
  const b = { placa: 'JKL1234', nome_morador: 'B', vigente_desde: FIM, encerrado_em: null, criado_em: '2026-10-05T00:00:00Z' };
  const idx = indexarVinculos([b, a]);
  assert.strictEqual(vinculoNaHora(idx, 'JKL1234', '2026-09-30T00:00:00Z').nome_morador, 'A');
  assert.strictEqual(vinculoNaHora(idx, 'JKL1234', '2026-10-02T00:00:00Z').nome_morador, 'B');
});

caso('mesmaPlaca: grafias antiga e Mercosul do mesmo carro são a mesma placa', () => {
  assert.strictEqual(mesmaPlaca('ABC1234', 'ABC1C34'), true);
  assert.strictEqual(mesmaPlaca('abc-1c34', 'ABC1234'), true);
  assert.strictEqual(mesmaPlaca('ABC1234', 'ABC1234'), true);
  assert.strictEqual(mesmaPlaca('ABC1234', 'ABC1D34'), false);
  assert.strictEqual(mesmaPlaca('', ''), false);
  assert.strictEqual(mesmaPlaca(null, 'ABC1234'), false);
});

caso('placa sem vínculo devolve null; tipo desconhecido vira SEM_CADASTRO', () => {
  assert.strictEqual(vinculoNaHora(indice, 'ZZZ9999', TROCA), null);
  assert.strictEqual(vinculoNaHora(indice, '', TROCA), null);
  assert.strictEqual(tipoPessoa('xyz'), SEM_CADASTRO);
  assert.strictEqual(tipoPessoa('morador').id, 'morador');
});

caso('vinculoVigente devolve o não encerrado', () => {
  assert.strictEqual(vinculoVigente(indice, 'ABC1234').nome_morador, 'Beltrano');
  assert.strictEqual(vinculoVigente(indexarVinculos([fulano]), 'ABC1234'), null);
});

caso('rotuloCadastro formata em America/Sao_Paulo', () => {
  assert.strictEqual(rotuloCadastro({ vigente_desde: '2026-10-21T01:15:00Z', cadastrado_por: 'João' }), 'cadastrado em 20/10 às 22:15 por João');
  assert.strictEqual(rotuloCadastro({ vigente_desde: '2026-10-21T01:15:00Z' }), 'cadastrado em 20/10 às 22:15');
  assert.strictEqual(rotuloCadastro({ vigente_desde: null, criado_em: '2026-10-21T15:00:00Z', cadastrado_por: 'Ana' }), 'cadastrado em 21/10 às 12:00 por Ana');
});

caso('TIPOS_PESSOA na ordem combinada e congelado', () => {
  assert.deepStrictEqual(TIPOS_PESSOA.map((t) => t.id), ['morador', 'proprietario', 'visitante', 'prestador']);
  assert.ok(Object.isFrozen(TIPOS_PESSOA));
  assert.deepStrictEqual(TIPOS_PESSOA.map((t) => t.icone), ['casa', 'chave', 'cracha', 'ferramenta']);
});

caso('2 000 vínculos: vinculoNaHora em média < 5 ms por chamada', () => {
  const linhas = [];
  for (let i = 0; i < 2000; i++) {
    const placa = `ABC${String(i).padStart(4, '0')}`;
    linhas.push({ placa, nome_morador: `N${i}`, vigente_desde: null, encerrado_em: i % 2 ? TROCA : null });
    if (i % 2) linhas.push({ placa, nome_morador: `M${i}`, vigente_desde: TROCA, encerrado_em: null });
  }
  const idx = indexarVinculos(linhas);
  const N = 2000;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) vinculoNaHora(idx, `ABC${String(i).padStart(4, '0')}`, '2026-10-24T00:00:00Z');
  const mediaMs = Number(process.hrtime.bigint() - t0) / 1e6 / N;
  assert.ok(mediaMs < 5, `média ${mediaMs.toFixed(3)} ms`);
  assert.strictEqual(vinculoNaHora(idx, 'ABC0001', '2026-10-24T00:00:00Z').nome_morador, 'M1');
});

console.log(`${passou} casos passaram`);
