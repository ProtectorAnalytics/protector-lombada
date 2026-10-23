/**
 * Destinatários de e-mail lidos do cadastro de usuários (Portaria 2.2).
 * Banco mockado; dados fictícios. Uso: node test/destinatarios.test.js
 */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { criarDestinatarios } = require('../lib/destinatarios');

const CLI = 'cli-teste-1';
const OUTRO = 'cli-teste-2';

/** Mock mínimo do query builder do supabase-js, filtrando em memória. */
function mockDb({ usuarios = [], clientes = [], erroUsuarios = null, erroClientes = null } = {}) {
  const chamadas = [];
  function query(tabela) {
    const filtros = [];
    const q = {
      select() { return q; },
      eq(col, val) { filtros.push((r) => r[col] === val); return q; },
      in(col, vals) { filtros.push((r) => vals.includes(r[col])); return q; },
      single() { return exec(true); },
      maybeSingle() { return exec(true); },
      then(ok, ko) { return exec(false).then(ok, ko); },
    };
    function exec(um) {
      chamadas.push(tabela);
      const fonte = tabela === 'usuarios' ? usuarios : clientes;
      const erro = tabela === 'usuarios' ? erroUsuarios : erroClientes;
      if (erro) return Promise.resolve({ data: null, error: erro });
      const linhas = fonte.filter((r) => filtros.every((f) => f(r)));
      return Promise.resolve({ data: um ? (linhas[0] || null) : linhas, error: null });
    }
    return q;
  }
  return { from: query, chamadas };
}

const u = (o) => ({ cliente_id: CLI, ativo: true, recebe_alertas: false, recebe_relatorio: false, nome: 'Fulano', ...o });

let passou = 0;
async function caso(nome, fn) { await fn(); passou++; console.log(`ok - ${nome}`); }

(async () => {
  await caso('alerta lê só quem recebe alertas; relatório só quem recebe relatório', async () => {
    const db = mockDb({ usuarios: [
      u({ email: 'alerta@exemplo.com', recebe_alertas: true }),
      u({ email: 'relatorio@exemplo.com', recebe_relatorio: true }),
      u({ email: 'ambos@exemplo.com', recebe_alertas: true, recebe_relatorio: true }),
      u({ email: 'nenhum@exemplo.com' }),
    ] });
    const d = criarDestinatarios(db);
    assert.deepStrictEqual((await d.destinatariosDoCliente(CLI, 'alerta')).sort(), ['alerta@exemplo.com', 'ambos@exemplo.com']);
    assert.deepStrictEqual((await d.destinatariosDoCliente(CLI, 'relatorio')).sort(), ['ambos@exemplo.com', 'relatorio@exemplo.com']);
  });

  await caso('porteiro (@porteiro.invalid) nunca recebe, mesmo com opção ligada', async () => {
    const db = mockDb({ usuarios: [
      u({ email: 'portaria-1@porteiro.invalid', role: 'portaria', recebe_alertas: true }),
      u({ email: 'sindico@exemplo.com', recebe_alertas: true }),
    ] });
    assert.deepStrictEqual(await criarDestinatarios(db).destinatariosDoCliente(CLI, 'alerta'), ['sindico@exemplo.com']);
  });

  await caso('usuário inativo e usuário de outro cliente não recebem', async () => {
    const db = mockDb({ usuarios: [
      u({ email: 'inativo@exemplo.com', ativo: false, recebe_alertas: true }),
      u({ email: 'outro@exemplo.com', cliente_id: OUTRO, recebe_alertas: true }),
      u({ email: 'ativo@exemplo.com', recebe_alertas: true }),
    ] });
    assert.deepStrictEqual(await criarDestinatarios(db).destinatariosDoCliente(CLI, 'alerta'), ['ativo@exemplo.com']);
  });

  await caso('mesmo e-mail com maiúsculas/espaços sai uma vez só, minúsculo', async () => {
    const db = mockDb({ usuarios: [
      u({ email: 'Sindico@Exemplo.com ', role: 'admin_cliente', recebe_alertas: true }),
      u({ email: 'sindico@exemplo.com', role: 'so_email', recebe_alertas: true }),
    ] });
    assert.deepStrictEqual(await criarDestinatarios(db).destinatariosDoCliente(CLI, 'alerta'), ['sindico@exemplo.com']);
  });

  await caso('erro do banco lança (não cai no legado em silêncio)', async () => {
    const db = mockDb({ erroUsuarios: { message: 'conexão caiu' }, clientes: [{ id: CLI, emails_notificacao: ['legado@exemplo.com'] }] });
    await assert.rejects(() => criarDestinatarios(db).destinatariosDoCliente(CLI, 'alerta'), /conexão caiu/);
  });

  await caso('sem ninguém marcado, usa o legado clientes.emails_notificacao', async () => {
    const db = mockDb({ usuarios: [u({ email: 'nenhum@exemplo.com' })], clientes: [{ id: CLI, emails_notificacao: ['legado@exemplo.com'] }] });
    assert.deepStrictEqual(await criarDestinatarios(db).destinatariosDoCliente(CLI, 'alerta'), ['legado@exemplo.com']);
  });

  await caso('tipo inválido é recusado', async () => {
    await assert.rejects(() => criarDestinatarios(mockDb()).destinatariosDoCliente(CLI, 'todos'), /tipo/);
  });

  await caso('relatório com nome: um por e-mail, sem legado (como hoje)', async () => {
    const db = mockDb({ usuarios: [
      u({ email: 'Ana@Exemplo.com', nome: 'Ana', recebe_relatorio: true }),
      u({ email: 'ana@exemplo.com', nome: 'Ana 2', recebe_relatorio: true }),
    ], clientes: [{ id: CLI, emails_notificacao: ['legado@exemplo.com'] }] });
    const d = criarDestinatarios(db);
    assert.deepStrictEqual(await d.destinatariosComNome(CLI, 'relatorio'), [{ nome: 'Ana', email: 'ana@exemplo.com' }]);
    const vazio = criarDestinatarios(mockDb({ clientes: [{ id: CLI, emails_notificacao: ['legado@exemplo.com'] }] }));
    assert.deepStrictEqual(await vazio.destinatariosComNome(CLI, 'relatorio'), []);
  });

  await caso('contarDestinatarios: e-mails distintos que recebem algo, por cliente', async () => {
    const db = mockDb({ usuarios: [
      u({ email: 'a@exemplo.com', recebe_alertas: true }),
      u({ email: 'A@exemplo.com', recebe_relatorio: true }),
      u({ email: 'b@exemplo.com', recebe_relatorio: true }),
      u({ email: 'c@exemplo.com' }),
      u({ email: 'p@porteiro.invalid', recebe_alertas: true }),
      u({ email: 'x@exemplo.com', ativo: false, recebe_alertas: true }),
      u({ email: 'd@exemplo.com', cliente_id: OUTRO, recebe_alertas: true }),
    ] });
    const m = await criarDestinatarios(db).contarDestinatarios([CLI, OUTRO, 'cli-teste-3']);
    assert.strictEqual(m.get(CLI), 2);
    assert.strictEqual(m.get(OUTRO), 1);
    assert.strictEqual(m.get('cli-teste-3'), 0);
  });

  await caso('contarDestinatarios lança em erro do banco', async () => {
    await assert.rejects(() => criarDestinatarios(mockDb({ erroUsuarios: { message: 'falhou' } })).contarDestinatarios([CLI]), /falhou/);
  });

  const ler = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

  await caso('captura.js e o cron do relatório usam lib/destinatarios', async () => {
    const captura = ler('api/captura.js');
    assert.match(captura, /require\('\.\.\/lib\/destinatarios'\)/);
    assert.match(captura, /destinatariosDoCliente\(cliente\.id, 'alerta'\)/);
    assert.doesNotMatch(captura, /getDestinatarios/);
    const cron = ler('api/cron-relatorio-semanal.js');
    assert.match(cron, /require\('\.\.\/lib\/destinatarios'\)/);
    assert.match(cron, /destinatariosComNome\(cliente\.id, 'relatorio'\)/);
  });

  await caso('exclusão de cliente apaga os so_email antes do cliente', async () => {
    const src = ler('api/admin/clientes.js');
    const iSo = src.indexOf(".eq('role', 'so_email')");
    const iCli = src.indexOf("from('clientes').delete()");
    assert.ok(iSo > 0 && iSo < iCli, 'so_email apagado antes do cliente');
  });

  await caso('nenhum arquivo de api/ e lib/ usa email_destinatarios (exceto api/admin/emails.js, Task 4)', async () => {
    const achados = [];
    const varrer = (dir) => {
      for (const ent of fs.readdirSync(path.join(__dirname, '..', dir), { withFileTypes: true })) {
        const rel = path.join(dir, ent.name);
        if (ent.isDirectory()) { varrer(rel); continue; }
        if (!rel.endsWith('.js') || rel === path.join('api', 'admin', 'emails.js')) continue;
        if (ler(rel).includes('email_destinatarios')) achados.push(rel);
      }
    };
    varrer('api'); varrer('lib');
    assert.deepStrictEqual(achados, []);
  });

  console.log(`\n${passou} casos ok`);
})().catch((e) => { console.error(e); process.exit(1); });
