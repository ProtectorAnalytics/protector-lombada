/**
 * Barra de filtros do painel do síndico: chips, rótulos, busca tipada,
 * "não cadastrados" e texto do resultado.
 * Uso: node test/barra-filtros.test.js
 */
const assert = require('node:assert');
const {
  rotuloDoPeriodo, chipsDosFiltros, decidirEnter, sugestoesBusca, textoResultado,
  conjuntoCadastradas, filtrarNaoCadastradas,
} = require('../site/js/barra-filtros');
const { filtrosPadrao, comMudancas, estadoDaVisao, montarFiltros } = require('../site/js/estado-filtros');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }
const HOJE = '2026-10-05';

// ---- rotuloDoPeriodo
caso('botão de período mostra o atalho ativo', () => {
  assert.strictEqual(rotuloDoPeriodo(filtrosPadrao(HOJE), HOJE), 'Hoje');
  assert.strictEqual(rotuloDoPeriodo(estadoDaVisao('ontem', HOJE), HOJE), 'Ontem');
  assert.strictEqual(rotuloDoPeriodo(estadoDaVisao('7d', HOJE), HOJE), 'Últimos 7 dias');
});
caso('personalizado com horas mostra "dd/mm HH:MM – dd/mm HH:MM"', () => {
  const f = montarFiltros({ dataInicio: HOJE, horaInicio: '08:00', dataFim: '2026-10-06', horaFim: '18:00' }, HOJE);
  assert.strictEqual(rotuloDoPeriodo(f, HOJE), '05/10 08:00 – 06/10 18:00');
});
caso('personalizado em dias inteiros mostra só as datas', () => {
  const f = montarFiltros({ dataInicio: '2026-10-01', dataFim: '2026-10-03' }, HOJE);
  assert.strictEqual(rotuloDoPeriodo(f, HOJE), '01/10 – 03/10');
  const umDia = montarFiltros({ dataInicio: '2026-10-01', dataFim: '2026-10-01' }, HOJE);
  assert.strictEqual(rotuloDoPeriodo(umDia, HOJE), '01/10');
});

// ---- chipsDosFiltros
const nomes = { nomeCamera: (id) => ({ c1: 'Clube Mata' })[id] || '' };
caso('estado padrão não tem chips', () => {
  assert.deepStrictEqual(chipsDosFiltros(filtrosPadrao(HOJE), HOJE, nomes), []);
});
caso('um chip por filtro, com o tipo no rótulo', () => {
  const f = comMudancas(estadoDaVisao('ontem', HOJE), {
    cameraId: 'c1', soAlertas: true, naoCadastrados: true, placa: 'oni', velMin: 30, velMax: 60,
    veiculo: { marca: 'CHEVROLET', modelo: 'Onix', cor: 'prata', anoDe: 2019, anoAte: 2023 },
  }, HOJE);
  assert.deepStrictEqual(chipsDosFiltros(f, HOJE, nomes), [
    { chave: 'periodo', rotulo: 'Ontem' },
    { chave: 'camera', rotulo: 'Câmera: Clube Mata' },
    { chave: 'alerta', rotulo: 'Acima do limite' },
    { chave: 'naoCadastrados', rotulo: 'Não cadastrados' },
    { chave: 'placa', rotulo: 'Placa contém ONI' },
    { chave: 'marca', rotulo: 'Marca: CHEVROLET' },
    { chave: 'modelo', rotulo: 'Modelo: Onix' },
    { chave: 'cor', rotulo: 'Cor: Prata' },
    { chave: 'ano', rotulo: 'Ano 2019–2023' },
    { chave: 'velocidade', rotulo: 'Velocidade 30–60 km/h' },
  ]);
});
caso('faixas com uma ponta só', () => {
  const r = (m) => chipsDosFiltros(comMudancas(filtrosPadrao(HOJE), m, HOJE), HOJE, nomes)[0].rotulo;
  assert.strictEqual(r({ veiculo: { anoDe: 2019 } }), 'Ano a partir de 2019');
  assert.strictEqual(r({ veiculo: { anoAte: 2023 } }), 'Ano até 2023');
  assert.strictEqual(r({ velMin: 30 }), 'Velocidade a partir de 30 km/h');
  assert.strictEqual(r({ velMax: 60 }), 'Velocidade até 60 km/h');
});
caso('câmera sem nome conhecido ainda vira chip', () => {
  const f = comMudancas(filtrosPadrao(HOJE), { cameraId: 'x9' }, HOJE);
  assert.deepStrictEqual(chipsDosFiltros(f, HOJE, nomes), [{ chave: 'camera', rotulo: 'Câmera: x9' }]);
});
caso('cor usa o nome legível (formatador opcional)', () => {
  const f = comMudancas(filtrosPadrao(HOJE), { veiculo: { cor: 'branco' } }, HOJE);
  assert.strictEqual(chipsDosFiltros(f, HOJE, {})[0].rotulo, 'Cor: Branco');
  assert.strictEqual(chipsDosFiltros(f, HOJE, { nomeCor: () => 'Branca' })[0].rotulo, 'Cor: Branca');
});

// ---- decidirEnter
caso('Enter com dígito busca placa (normalizada)', () => {
  assert.deepStrictEqual(decidirEnter('abc-1d'), { tipo: 'placa', valor: 'ABC1D' });
  assert.deepStrictEqual(decidirEnter('1d23'), { tipo: 'placa', valor: '1D23' });
});
caso('Enter sem dígito busca modelo; com dígito no meio do texto, placa', () => {
  assert.deepStrictEqual(decidirEnter('  onix '), { tipo: 'modelo', valor: 'onix' });
  assert.deepStrictEqual(decidirEnter('gol (g5)'), { tipo: 'placa', valor: 'GOLG5' });
  assert.deepStrictEqual(decidirEnter('hb, s'), { tipo: 'modelo', valor: 'hb s' });
});
caso('Enter com menos de 2 caracteres não cria filtro', () => {
  assert.strictEqual(decidirEnter('a'), null);
  assert.strictEqual(decidirEnter(' 1 '), null);
  assert.strictEqual(decidirEnter('-1-'), null);
});
caso('Enter vazio não faz nada', () => {
  assert.strictEqual(decidirEnter(''), null);
  assert.strictEqual(decidirEnter('   '), null);
  assert.strictEqual(decidirEnter(null), null);
  assert.strictEqual(decidirEnter('*,()'), null);
});

// ---- sugestoesBusca
const fontes = {
  placas: ['ONI1A23', 'ABC1D23', 'XONI999', 'oni1a23', 'QWE2E34'],
  modelos: ['Onix', 'Onix Plus', 'Gol', 'Corolla', 'Fiorino'],
  marcas: ['CHEVROLET', 'FIAT', 'TOYOTA'],
};
caso('menos de 2 caracteres não sugere nada', () => {
  assert.deepStrictEqual(sugestoesBusca('o', fontes), []);
  assert.deepStrictEqual(sugestoesBusca('', fontes), []);
});
caso('"oni" sugere Placas e Modelos em grupos separados, prefixo primeiro', () => {
  const g = sugestoesBusca('oni', fontes);
  assert.deepStrictEqual(g, [
    { tipo: 'placa', titulo: 'Placas', itens: ['ONI1A23', 'XONI999'] },
    { tipo: 'modelo', titulo: 'Modelos', itens: ['Onix', 'Onix Plus'] },
  ]);
});
caso('marcas aparecem no grupo Marcas, sem diferenciar maiúsculas e acentos', () => {
  const g = sugestoesBusca('toyo', fontes);
  assert.deepStrictEqual(g, [{ tipo: 'marca', titulo: 'Marcas', itens: ['TOYOTA'] }]);
  const a = sugestoesBusca('citroe', { marcas: ['CITROËN'] });
  assert.deepStrictEqual(a, [{ tipo: 'marca', titulo: 'Marcas', itens: ['CITROËN'] }]);
});
caso('placa colada com hífen encontra a placa', () => {
  const g = sugestoesBusca('abc-1d', fontes);
  assert.deepStrictEqual(g[0], { tipo: 'placa', titulo: 'Placas', itens: ['ABC1D23'] });
});
caso('cada grupo respeita o limite', () => {
  const muitas = Array.from({ length: 20 }, (_, i) => `ONI${String(i).padStart(4, '0')}`);
  assert.strictEqual(sugestoesBusca('oni', { placas: muitas })[0].itens.length, 8);
  assert.strictEqual(sugestoesBusca('oni', { placas: muitas }, 3)[0].itens.length, 3);
});
caso('fontes ausentes não quebram', () => {
  assert.deepStrictEqual(sugestoesBusca('oni', {}), []);
  assert.deepStrictEqual(sugestoesBusca('oni'), []);
});

// ---- textoResultado
caso('anúncio do resultado em português', () => {
  assert.strictEqual(textoResultado(0), 'Nenhuma passagem');
  assert.strictEqual(textoResultado(1), '1 passagem');
  assert.strictEqual(textoResultado(36), '36 passagens');
});
caso('no limite da consulta o resultado vira "N+"', () => {
  assert.strictEqual(textoResultado(300, true), '300+ passagens');
  // conta o que a lista mostra (ex.: "Não cadastrados" filtrados no navegador)
  assert.strictEqual(textoResultado(287, true), '287+ passagens');
  assert.strictEqual(textoResultado(1, true), '1+ passagem');
  assert.strictEqual(textoResultado(0, true), 'Nenhuma passagem');
  assert.strictEqual(textoResultado(36, false), '36 passagens');
});

// ---- não cadastrados
caso('placa cadastrada em qualquer grafia não entra em "não cadastrados"', () => {
  const cad = conjuntoCadastradas(['ABC1234', 'XYZ9A87']); // antiga e Mercosul
  const linhas = [
    { placa: 'ABC1C34' }, // Mercosul de ABC1234 → cadastrada
    { placa: 'XYZ9087' }, // antiga de XYZ9A87 → cadastrada
    { placa: 'QWE2E34' }, // não cadastrada
    { placa: 'abc-1234' }, // grafia suja da cadastrada
  ];
  assert.deepStrictEqual(filtrarNaoCadastradas(linhas, cad), [{ placa: 'QWE2E34' }]);
});
caso('placa fora do padrão compara pelo texto limpo', () => {
  const cad = conjuntoCadastradas(['MOTO1']);
  assert.deepStrictEqual(filtrarNaoCadastradas([{ placa: 'moto1' }, { placa: 'X1' }], cad), [{ placa: 'X1' }]);
});
caso('lista vazia ou nula', () => {
  assert.deepStrictEqual(filtrarNaoCadastradas(null, conjuntoCadastradas([])), []);
  assert.deepStrictEqual(filtrarNaoCadastradas([{ placa: 'ABC1234' }], conjuntoCadastradas(null)), [{ placa: 'ABC1234' }]);
});
caso('não altera a lista recebida', () => {
  const linhas = [{ placa: 'ABC1234' }, { placa: 'QWE2E34' }];
  const copia = JSON.parse(JSON.stringify(linhas));
  filtrarNaoCadastradas(linhas, conjuntoCadastradas(['ABC1234']));
  assert.deepStrictEqual(linhas, copia);
});

console.log(`\n${passou} casos passaram`);
