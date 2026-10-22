/**
 * Testes de site/js/vinculo-placa.js.
 * Uso: node test/vinculo-placa.test.js
 */
const assert = require('node:assert');
const lib = require('../site/js/vinculo-placa');
const { TIPOS_PESSOA, SEM_CADASTRO, tipoPessoa, indexarVinculos, vinculoNaHora, vinculoVigente, rotuloCadastro } = lib;

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

console.log(`${passou} casos passaram`);
