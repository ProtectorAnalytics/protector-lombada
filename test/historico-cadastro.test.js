/**
 * Antes/depois do cadastro de placas e a frase do "Histórico de alterações".
 * Uso: TZ=UTC node test/historico-cadastro.test.js (o fuso é fixado em São Paulo pela lib)
 */
const assert = require('node:assert');
const { diferencaCadastro, itemDoHistorico, fraseHistorico, quandoLegivel } = require('../site/js/historico-cadastro');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

const U1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const U2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const ATUAL = { tipo_pessoa: 'morador', nome_morador: 'PRESTADOR-TESTE', unidade: 'Casa 1', unidade_id: U1, marca: 'Fiat', cor: 'Prata' };

// ---- diferencaCadastro
caso('só os campos que mudaram entram em antes/depois', () => {
  const d = diferencaCadastro(ATUAL, { tipo_pessoa: 'prestador', nome_morador: 'PRESTADOR-TESTE', marca: 'Fiat', cor: 'Branco' });
  assert.deepStrictEqual(d, { antes: { tipo_pessoa: 'morador', cor: 'Prata' }, depois: { tipo_pessoa: 'prestador', cor: 'Branco' } });
});
caso('nada mudou (inclusive espaços e vazio = nulo) → vazio', () => {
  const d = diferencaCadastro({ ...ATUAL, marca: null }, { nome_morador: ' PRESTADOR-TESTE ', marca: '', tipo_pessoa: 'morador' });
  assert.deepStrictEqual(d, { antes: {}, depois: {} });
});
caso('unidade da lista trocada entra pelo rótulo', () => {
  const d = diferencaCadastro(ATUAL, { unidade_id: U2, unidade: 'Casa 2' });
  assert.deepStrictEqual(d, { antes: { unidade: 'Casa 1' }, depois: { unidade: 'Casa 2' } });
});
caso('unidade limpa (id e rótulo nulos)', () => {
  const d = diferencaCadastro(ATUAL, { unidade_id: null, unidade: null });
  assert.deepStrictEqual(d, { antes: { unidade: 'Casa 1' }, depois: { unidade: null } });
});
caso('mesma unidade reenviada não conta como mudança', () => {
  assert.deepStrictEqual(diferencaCadastro(ATUAL, { unidade_id: U1, unidade: 'Casa 1' }).depois, {});
});
caso('campo que não veio no PUT não entra', () => {
  assert.deepStrictEqual(diferencaCadastro(ATUAL, { cor: 'Prata' }).depois, {});
});
caso('não altera os objetos recebidos', () => {
  const a = { ...ATUAL };
  const c = { cor: 'Azul' };
  diferencaCadastro(a, c);
  assert.deepStrictEqual(a, ATUAL);
  assert.deepStrictEqual(c, { cor: 'Azul' });
});

// ---- itemDoHistorico
caso('item público: sem ip nem usuario_id; papel legível', () => {
  const i = itemDoHistorico({
    id: 'a1', acao: 'atualizar', criado_em: '2026-10-23T19:12:00Z', usuario_id: 'u1', ip: '1.2.3.4',
    detalhes: { cliente_id: 'c', placa: 'TST0A00', antes: { tipo_pessoa: 'morador', x: 1 }, depois: { tipo_pessoa: 'prestador' } },
  }, { nome: 'Operador Teste', role: 'operador' });
  assert.deepStrictEqual(i, {
    id: 'a1', acao: 'atualizar', placa: 'TST0A00', criado_em: '2026-10-23T19:12:00Z',
    autor_nome: 'Operador Teste', autor_papel: 'Operador',
    antes: { tipo_pessoa: 'morador' }, depois: { tipo_pessoa: 'prestador' }, agora: null,
  });
});
caso('linha antiga de atualizar (sem antes/depois) vira "agora"', () => {
  const i = itemDoHistorico({ id: 'a', acao: 'atualizar', criado_em: 'x', detalhes: { placa: 'TST0A00', tipo_pessoa: 'prestador', nome_morador: 'N', unidade_id: 'u' } }, null);
  assert.deepStrictEqual(i.agora, { tipo_pessoa: 'prestador', nome_morador: 'N' });
  assert.strictEqual(i.autor_nome, null);
  assert.strictEqual(i.autor_papel, null);
});
caso('valor de objeto no jsonb vira texto (nada de objeto na tela)', () => {
  const i = itemDoHistorico({ id: 'a', acao: 'atualizar', criado_em: 'x', detalhes: { depois: { nome_morador: { a: 1 } } } }, null);
  assert.strictEqual(typeof i.depois.nome_morador, 'string');
});

// ---- fraseHistorico
caso('alterou com antes → depois, rótulos legíveis e horário de São Paulo', () => {
  const f = fraseHistorico({
    acao: 'atualizar', placa: 'TST0A00', criado_em: '2026-10-23T19:12:00Z', autor_nome: 'Operador Teste', autor_papel: 'Operador',
    antes: { tipo_pessoa: 'morador', nome_morador: 'A' }, depois: { tipo_pessoa: 'prestador', nome_morador: 'B' },
  });
  assert.deepStrictEqual(f, {
    quando: '23/10/2026 16:12', autor: 'Operador Teste (Operador)', verbo: 'alterou', placa: 'TST0A00',
    detalhe: 'Tipo: Morador → Prestador; Nome: A → B',
  });
});
caso('campo apagado aparece como —', () => {
  const f = fraseHistorico({ acao: 'atualizar', placa: 'P', criado_em: '', antes: { cor: 'Prata' }, depois: { cor: null } });
  assert.strictEqual(f.detalhe, 'Cor: Prata → —');
});
caso('linha antiga: "agora: Tipo Prestador; Nome …"', () => {
  const f = fraseHistorico({ acao: 'atualizar', placa: 'P', criado_em: '', agora: { tipo_pessoa: 'prestador', nome_morador: 'N' } });
  assert.strictEqual(f.detalhe, 'agora: Tipo Prestador; Nome N');
});
caso('verbos: cadastrou, encerrou o vínculo de, excluiu', () => {
  assert.strictEqual(fraseHistorico({ acao: 'vincular', depois: { tipo_pessoa: 'morador', nome_morador: 'N', cor: null } }).verbo, 'cadastrou');
  assert.strictEqual(fraseHistorico({ acao: 'vincular', depois: { tipo_pessoa: 'morador', nome_morador: 'N', cor: null } }).detalhe, 'Tipo Morador; Nome N');
  assert.strictEqual(fraseHistorico({ acao: 'encerrar' }).verbo, 'encerrou o vínculo de');
  assert.strictEqual(fraseHistorico({ acao: 'excluir' }).verbo, 'excluiu');
  assert.strictEqual(fraseHistorico({ acao: 'encerrar' }).detalhe, '');
});
caso('nomes antigos do log: criar = cadastrou (com resumo), desativar = encerrou o vínculo de', () => {
  const f = fraseHistorico({ acao: 'criar', agora: { nome_morador: 'N' } });
  assert.deepStrictEqual([f.verbo, f.detalhe], ['cadastrou', 'Nome N']);
  assert.strictEqual(fraseHistorico({ acao: 'desativar' }).verbo, 'encerrou o vínculo de');
});
caso('sem autor conhecido: "Alguém"', () => {
  assert.strictEqual(fraseHistorico({ acao: 'encerrar' }).autor, 'Alguém');
});
caso('quandoLegivel com data inválida → vazio', () => {
  assert.strictEqual(quandoLegivel('x'), '');
});

console.log(`\n${passou} casos ok`);
