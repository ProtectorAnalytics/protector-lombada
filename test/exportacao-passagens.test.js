/**
 * Exportação da lista de passagens: colunas Tipo, Nome e Unidade (cadastro na
 * hora da passagem) no Excel e no PDF, sem perder as demais. Dados fictícios.
 * Uso: node test/exportacao-passagens.test.js
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const exp = require('../site/js/exportacao-passagens');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

const captura = { placa: 'TST1A11', velocidade: 41, timestamp: '2026-10-23T20:24:35Z', tipo_veiculo: 'CARRO', cor_veiculo: 'BRANCO' };

caso('Excel: colunas na ordem da lista (Lombada, Veículo, Cor, Ano, Tipo, Nome, Unidade)', () => {
  assert.deepStrictEqual(exp.COLUNAS_EXCEL, [
    'Placa', 'Velocidade (km/h)', 'Status', 'Data', 'Hora', 'Lombada', 'Veículo', 'Cor', 'Ano', 'Tipo', 'Nome', 'Unidade',
    'Tipo (câmera)', 'Cor (câmera)',
  ]);
});

caso('Excel: linha com o cadastro da hora', () => {
  const l = exp.linhaExcel({
    captura, radar: 'RADAR TESTE', limite: 33, unidade: 'Bloco A · 101',
    vinculo: { tipo_pessoa: 'prestador', nome_morador: 'Fulano de Teste' },
    base: { marca: 'MARCA', modelo: 'MODELO X', cor: 'Branca', ano: '2024' },
  });
  assert.deepStrictEqual(Object.keys(l), exp.COLUNAS_EXCEL);
  assert.strictEqual(l.Data, '23/10/2026');
  assert.strictEqual(l.Hora, '17:24:35'); // fuso de São Paulo
  assert.strictEqual(l.Status, 'ALERTA');
  assert.strictEqual(l.Tipo, 'Prestador');
  assert.strictEqual(l.Nome, 'Fulano de Teste');
  assert.strictEqual(l.Unidade, 'Bloco A · 101');
  assert.strictEqual(l['Tipo (câmera)'], 'CARRO');
  assert.strictEqual(l.Lombada, 'RADAR TESTE');
  assert.strictEqual(l['Veículo'], 'MARCA MODELO X');
  assert.strictEqual(l.Cor, 'Branca');
  assert.strictEqual(l.Ano, '2024');
});

caso('Excel: sem vínculo na hora = "Sem cadastro", nome e unidade vazios', () => {
  const l = exp.linhaExcel({ captura: { ...captura, velocidade: 20 }, limite: 33, vinculo: null });
  assert.strictEqual(l.Tipo, 'Sem cadastro');
  assert.strictEqual(l.Nome, '');
  assert.strictEqual(l.Unidade, '');
  assert.strictEqual(l.Status, 'OK');
  assert.strictEqual(l.Lombada, '—');
  assert.strictEqual(l['Veículo'], '');
});

caso('PDF: colunas somam a largura útil, na ordem da lista, números à direita', () => {
  const soma = exp.COLUNAS_PDF.reduce((s, c) => s + c.w, 0);
  assert.ok(Math.abs(soma - 1) < 1e-9);
  assert.deepStrictEqual(exp.COLUNAS_PDF.map((c) => c.label), [
    'Placa', 'Velocidade', 'Status', 'Data', 'Hora', 'Lombada', 'Veículo', 'Cor', 'Ano', 'Tipo', 'Nome', 'Unidade',
  ]);
  assert.deepStrictEqual(exp.COLUNAS_PDF.filter((c) => c.alinhar === 'right').map((c) => c.label), ['Velocidade', 'Data', 'Hora', 'Ano']);
  assert.strictEqual(exp.COLUNAS_PDF[exp.COLUNA_STATUS_PDF].label, 'Status');
  const v = exp.valoresPdf({
    captura, radar: 'R1', limite: 33, unidade: '036', vinculo: { tipo_pessoa: 'visitante', nome_morador: 'Beltrano' },
    base: { marca: 'MARCA', modelo: 'MODELO', cor: 'Prata', ano: '2020' },
  });
  assert.deepStrictEqual(v, ['TST1A11', '41 km/h', 'ALERTA', '23/10/2026', '17:24:35', 'R1', 'MARCA MODELO', 'Prata', '2020', 'Visitante', 'Beltrano', '036']);
  assert.strictEqual(exp.valoresPdf({ captura, limite: 33 })[10], '—');
  assert.strictEqual(exp.valoresPdf({ captura, limite: 33 })[6], '—');
});

caso('painel usa a lib nos dois formatos', () => {
  const painel = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'index.html'), 'utf8');
  assert.ok(painel.includes('<script src="/js/exportacao-passagens.js"></script>'));
  assert.ok(painel.includes('exportacaoPassagensLib.linhaExcel('));
  assert.ok(painel.includes('exportacaoPassagensLib.valoresPdf('));
  assert.ok(painel.includes('exportacaoPassagensLib.COLUNAS_PDF'));
});

console.log(`\n${passou} casos ok`);
