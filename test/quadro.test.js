/**
 * Testes de site/js/quadro.js (Quadro no PC da portaria, v1.17.0): navegação
 * ‹ › com "ao vivo", filtro de câmera, o que a passagem mostra, destaque
 * acima do limite, perfis aceitos e links externos permitidos.
 * Uso: TZ=America/Sao_Paulo node test/quadro.test.js
 */
const assert = require('node:assert');
const q = require('../site/js/quadro');
const { indexarVinculos } = require('../site/js/vinculo-placa');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

const cap = (id, minuto, extra) => ({
  id, placa: 'AAA1A11', camera_id: 'c1', foto_path: `cli/c1/${id}.jpg`, velocidade: 20,
  timestamp: `2026-10-24T13:${String(minuto).padStart(2, '0')}:00Z`, ...extra,
});

// ---------------------------------------------------------------- navegação
caso('começa ao vivo e sem passagem', () => {
  const e = q.estadoInicial();
  assert.strictEqual(e.aoVivo, true);
  assert.strictEqual(q.passagemAtual(e), null);
  assert.strictEqual(q.podeVoltar(e), false);
  assert.strictEqual(q.podeAvancar(e), false);
});

caso('ao vivo mostra a mais recente, ordenando por horário e sem repetir id', () => {
  const e = q.receberPassagens(q.estadoInicial(), [cap('a', 1), cap('c', 3), cap('b', 2), cap('c', 3)]);
  assert.deepStrictEqual(e.lista.map((c) => c.id), ['c', 'b', 'a']);
  assert.strictEqual(q.passagemAtual(e).id, 'c');
});

caso('‹ volta para a anterior e sai do ao vivo; › até a mais nova retoma o ao vivo', () => {
  let e = q.receberPassagens(q.estadoInicial(), [cap('a', 1), cap('b', 2), cap('c', 3)]);
  e = q.voltar(e);
  assert.strictEqual(e.aoVivo, false);
  assert.strictEqual(q.passagemAtual(e).id, 'b');
  e = q.voltar(e);
  assert.strictEqual(q.passagemAtual(e).id, 'a');
  assert.strictEqual(q.podeVoltar(e), false);
  assert.strictEqual(q.passagemAtual(q.voltar(e)).id, 'a', 'não passa da mais antiga');
  e = q.avancar(e);
  assert.strictEqual(e.aoVivo, false);
  e = q.avancar(e);
  assert.strictEqual(e.aoVivo, true);
  assert.strictEqual(q.passagemAtual(e).id, 'c');
  assert.strictEqual(q.podeAvancar(e), false);
});

caso('não altera o estado recebido (imutável)', () => {
  const e = q.receberPassagens(q.estadoInicial(), [cap('a', 1), cap('b', 2)]);
  const copia = JSON.stringify(e);
  q.voltar(e);
  q.receberPassagens(e, [cap('z', 9)]);
  assert.strictEqual(JSON.stringify(e), copia);
});

caso('no histórico, passagem nova não troca a que está na tela', () => {
  let e = q.receberPassagens(q.estadoInicial(), [cap('a', 1), cap('b', 2)]);
  e = q.voltar(e); // mostrando 'a'
  e = q.receberPassagens(e, [cap('a', 1), cap('b', 2), cap('c', 3)]);
  assert.strictEqual(e.aoVivo, false);
  assert.strictEqual(q.passagemAtual(e).id, 'a');
});

caso('ao vivo, passagem nova aparece na hora', () => {
  let e = q.receberPassagens(q.estadoInicial(), [cap('a', 1)]);
  e = q.receberPassagens(e, [cap('a', 1), cap('b', 2)]);
  assert.strictEqual(q.passagemAtual(e).id, 'b');
});

caso('histórico com a passagem mostrada fora da lista nova fica na mais antiga possível', () => {
  let e = q.receberPassagens(q.estadoInicial(), [cap('a', 1), cap('b', 2), cap('c', 3)]);
  e = q.voltar(q.voltar(e)); // 'a'
  e = q.receberPassagens(e, [cap('c', 3), cap('d', 4)]);
  assert.strictEqual(q.passagemAtual(e).id, 'c');
});

caso('irAoVivo volta direto para a mais recente', () => {
  let e = q.receberPassagens(q.estadoInicial(), [cap('a', 1), cap('b', 2)]);
  e = q.irAoVivo(q.voltar(e));
  assert.strictEqual(e.aoVivo, true);
  assert.strictEqual(q.passagemAtual(e).id, 'b');
});

caso('guarda no máximo 50 passagens', () => {
  const muitas = Array.from({ length: 70 }, (_, i) => cap(`p${i}`, 0, { timestamp: new Date(Date.UTC(2026, 9, 24, 12, i)).toISOString() }));
  const e = q.receberPassagens(q.estadoInicial(), muitas);
  assert.strictEqual(e.lista.length, q.MAX_PASSAGENS);
  assert.strictEqual(q.MAX_PASSAGENS, 50);
  assert.strictEqual(q.passagemAtual(e).id, 'p69');
});

caso('posição "3 de 12" para o leitor de tela', () => {
  let e = q.receberPassagens(q.estadoInicial(), [cap('a', 1), cap('b', 2), cap('c', 3)]);
  assert.strictEqual(q.posicao(e), '1 de 3');
  e = q.voltar(e);
  assert.strictEqual(q.posicao(e), '2 de 3');
  assert.strictEqual(q.posicao(q.estadoInicial()), '');
});

// ---------------------------------------------------------------- câmeras
const cameras = [{ id: 'c1', nome: 'Lombada Entrada', nome_exibicao: 'Entrada' }, { id: 'c2', nome: 'Saída' }];

caso('filtro de câmera: vazio mostra todas; id escolhido mostra só ela', () => {
  const lista = [cap('a', 1), cap('b', 2, { camera_id: 'c2' })];
  assert.strictEqual(q.filtrarPorCamera(lista, '').length, 2);
  assert.deepStrictEqual(q.filtrarPorCamera(lista, 'c2').map((c) => c.id), ['b']);
  assert.deepStrictEqual(q.filtrarPorCamera(null, 'c2'), []);
});

caso('câmera guardada que não existe mais (ou de outro condomínio) volta para "todas"', () => {
  assert.strictEqual(q.cameraValida('c2', cameras), 'c2');
  assert.strictEqual(q.cameraValida('c9', cameras), '');
  assert.strictEqual(q.cameraValida(null, cameras), '');
});

caso('nome da câmera: o curto do painel (nome_exibicao), senão o nome', () => {
  assert.strictEqual(q.nomeCamera(cameras, 'c1'), 'Entrada');
  assert.strictEqual(q.nomeCamera(cameras, 'c2'), 'Saída');
  assert.strictEqual(q.nomeCamera(cameras, 'x'), 'Câmera');
});

// ---------------------------------------------------------------- o que a tela mostra
const indice = indexarVinculos([
  { placa: 'AAA1A11', nome_morador: 'Maria Teste', unidade: 'texto antigo', unidade_id: 'u1', tipo_pessoa: 'visitante',
    vigente_desde: '2026-10-24T12:00:00Z', encerrado_em: null, cadastrado_por: 'José' },
  { placa: 'BBB2B22', nome_morador: 'Antigo Dono', unidade: '12', tipo_pessoa: 'morador', vigente_desde: null, encerrado_em: '2026-10-01T00:00:00Z' },
]);
const unidades = [{ id: 'u1', nome: '101', bloco: 'Torre 1' }];
const ctx = { indice, cameras, unidades, limite: 30 };

caso('passagem com cadastro: tipo, nome, unidade da lista, câmera, hora e velocidade', () => {
  const d = q.descreverPassagem(cap('a', 5, { velocidade: 22 }), ctx);
  assert.strictEqual(d.placa, 'AAA1A11');
  assert.strictEqual(d.hora, '10:05');
  assert.strictEqual(d.camera, 'Entrada');
  assert.strictEqual(d.velocidade, '22 km/h');
  assert.strictEqual(d.acimaDoLimite, false);
  assert.strictEqual(d.tipo.rotulo, 'Visitante');
  assert.strictEqual(d.tipo.icone, 'cracha');
  assert.strictEqual(d.nome, 'Maria Teste');
  assert.strictEqual(d.unidade, 'Torre 1 · 101');
  assert.strictEqual('cadastro' in d, false, 'sem a linha "cadastrado em … por …" (decisão do CEO)');
  assert.strictEqual(d.temCadastro, true);
});

caso('acima do limite: destaque (acimaDoLimite) e seta no texto da velocidade', () => {
  const d = q.descreverPassagem(cap('a', 5, { velocidade: 41 }), ctx);
  assert.strictEqual(d.acimaDoLimite, true);
  assert.strictEqual(d.velocidade, '41 km/h');
  assert.strictEqual(q.descreverPassagem(cap('a', 5, { velocidade: 30 }), ctx).acimaDoLimite, false, 'no limite não é alerta');
});

caso('sem radar (velocidade 0) mostra "— km/h" e nunca é alerta', () => {
  const d = q.descreverPassagem(cap('a', 5, { velocidade: 0 }), ctx);
  assert.strictEqual(d.velocidade, '— km/h');
  assert.strictEqual(d.acimaDoLimite, false);
});

caso('sem limite configurado nunca é alerta', () => {
  assert.strictEqual(q.descreverPassagem(cap('a', 5, { velocidade: 90 }), { ...ctx, limite: null }).acimaDoLimite, false);
});

caso('placa sem vínculo na hora vira "Sem cadastro" (vínculo encerrado antes não conta)', () => {
  const d = q.descreverPassagem(cap('b', 5, { placa: 'BBB2B22' }), ctx);
  assert.strictEqual(d.temCadastro, false);
  assert.strictEqual(d.tipo.rotulo, 'Sem cadastro');
  assert.strictEqual(d.tipo.icone, 'interrogacao');
  assert.strictEqual(d.nome, '');
  assert.strictEqual(d.unidade, '');
});

caso('passagem antes do vínculo começar também é "Sem cadastro" (quem estava na hora)', () => {
  const d = q.descreverPassagem(cap('a', 0, { timestamp: '2026-10-24T11:00:00Z' }), ctx);
  assert.strictEqual(d.temCadastro, false);
});

caso('unidade fora da lista usa o texto livre antigo', () => {
  const d = q.descreverPassagem(cap('a', 5), { ...ctx, unidades: [] });
  assert.strictEqual(d.unidade, 'texto antigo');
});

caso('recorte da foto por câmera (foto_enquadramento do banco vence o padrão)', () => {
  const comAjuste = [{ id: 'c1', nome: 'X', foto_enquadramento: { mini: { zoom: 1.4, x: 30, y: 10 } } }];
  const d = q.descreverPassagem(cap('a', 5), { ...ctx, cameras: comAjuste });
  assert.deepStrictEqual(d.recorte, { zoom: 1.4, x: 30, y: 10 });
  assert.deepStrictEqual(q.descreverPassagem(cap('a', 5), ctx).recorte, { zoom: 2.2, x: 45, y: 14 });
});

// ---------------------------------------------------------------- dia, perfis e links
caso('início de hoje no fuso de São Paulo (mesmo depois das 21h, quando o UTC já virou)', () => {
  assert.strictEqual(q.inicioDoDia(new Date('2026-10-25T01:30:00Z')), '2026-10-24T03:00:00.000Z');
  assert.strictEqual(q.inicioDoDia(new Date('2026-10-24T03:00:00Z')), '2026-10-24T03:00:00.000Z');
  assert.strictEqual(q.inicioDoDia(new Date('2026-10-24T02:59:00Z')), '2026-10-23T03:00:00.000Z');
});

caso('perfis: portaria, operador e síndico usam o condomínio deles; Protector escolhe; outros não entram', () => {
  assert.deepStrictEqual(q.modoDoPerfil({ role: 'portaria', cliente_id: 'x' }), { modo: 'cliente', clienteId: 'x' });
  assert.deepStrictEqual(q.modoDoPerfil({ role: 'operador', cliente_id: 'x' }), { modo: 'cliente', clienteId: 'x' });
  assert.deepStrictEqual(q.modoDoPerfil({ role: 'admin_cliente', cliente_id: 'x' }), { modo: 'cliente', clienteId: 'x' });
  assert.deepStrictEqual(q.modoDoPerfil({ role: 'super_admin', cliente_id: null }), { modo: 'admin' });
  assert.deepStrictEqual(q.modoDoPerfil({ role: 'portaria', cliente_id: null }), { modo: 'negado' });
  assert.deepStrictEqual(q.modoDoPerfil({ role: 'outro', cliente_id: 'x' }), { modo: 'negado' });
  assert.deepStrictEqual(q.modoDoPerfil(null), { modo: 'negado' });
});

caso('condomínio lembrado pela Protector só vale se ainda está na lista', () => {
  const lista = [{ id: 'a' }, { id: 'b' }];
  assert.strictEqual(q.clienteLembrado('b', lista), 'b');
  assert.strictEqual(q.clienteLembrado('z', lista), '');
  assert.strictEqual(q.clienteLembrado('', lista), '');
});

caso('clique abre o painel de hoje (Protector com ?cliente=)', () => {
  assert.strictEqual(q.urlDoPainel('cliente', 'x'), 'https://lombada.appps.com.br/dashboard');
  const uuid = '0f8fad5b-d9cb-469f-a165-70867728950e';
  assert.strictEqual(q.urlDoPainel('admin', uuid), `https://lombada.appps.com.br/dashboard?cliente=${uuid}`);
  assert.strictEqual(q.urlDoPainel('admin', 'nao-uuid'), 'https://lombada.appps.com.br/dashboard');
});

caso('o app só abre no navegador endereços da Lombada', () => {
  assert.strictEqual(q.urlExternaPermitida('https://lombada.appps.com.br/dashboard'), true);
  assert.strictEqual(q.urlExternaPermitida('https://lombada.appps.com.br/dashboard/manual.html#quadro'), true);
  assert.strictEqual(q.urlExternaPermitida('https://lombada.appps.com.br.evil.com/'), false);
  assert.strictEqual(q.urlExternaPermitida('http://lombada.appps.com.br/dashboard'), false);
  assert.strictEqual(q.urlExternaPermitida('javascript:alert(1)'), false);
  assert.strictEqual(q.urlExternaPermitida('file:///C:/Windows'), false);
  assert.strictEqual(q.urlExternaPermitida(''), false);
});

console.log(`\n${passou} casos ok`);
