# Base única de veículos com APIPLACAS — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enriquecer cada passagem com marca/modelo/cor/ano da APIPLACAS, pagando no máximo uma consulta por veículo, com uma base única compartilhada entre os condomínios.

**Architecture:** Três tabelas novas (`veiculos_base`, `apiplacas_config`, `apiplacas_consultas`). Lógica pura e testável em `site/js/placa.js` (UMD) e `lib/*.js` com dependências injetadas (repositório e cliente HTTP), de modo que os testes rodam sem banco e sem gastar consulta. A captura chama o orquestrador no `waitUntil` já existente, antes da notificação; uma rotina Vercel a cada 5 min faz a repescagem e os avisos. Painel e admin leem pelo Supabase (RLS) e escrevem só por `api/`.

**Tech Stack:** Node (Vercel Serverless, CommonJS), `@supabase/supabase-js` v2, `nodemailer` (SMTP existente), HTML/CSS/JS vanilla, testes `node test/*.test.js` com `node:assert`.

**Spec:** `docs/superpowers/specs/2026-10-04-apiplacas-base-veiculos-design.md`

## Global Constraints

- Contratos de `/api/placa` e `/api/heartbeat` inalterados; a resposta à câmera continua saindo antes de qualquer consulta.
- Token só em `process.env.APIPLACAS_TOKEN`; nunca em log, `debug_log`, erro, resposta HTTP ou teste.
- Timeout da APIPLACAS: **3000 ms**.
- Chave da base: placa no formato **Mercosul** (`AAA9A99`).
- Defaults: `ativo = false`, `preco_consulta = 0.03`, `teto_mensal = 150`, `aviso_percentual = 80`, `saldo_minimo = 200`, `emails_aviso = {glauber@appps.com.br, suporte@appps.com.br}`.
- Backoff da repescagem: 5 min, 30 min, 2 h, 24 h (teto 24 h). Lote da repescagem: 50.
- Validador: "quase gêmea" = difere em 1 caractere de placa com **≥ 3** passagens no mesmo cliente nos últimos **30** dias.
- Retenção de `veiculos_base`: 6 meses sem passagem.
- Mês do teto: fuso `America/Sao_Paulo`.
- Não guardar chassi, tipo de proprietário, FIPE nem resposta bruta.
- Toda escrita via supabase-js verifica `error` e lança (supabase-js **não** lança sozinho).
- Repositório público: nada de placa real, nome de condomínio ou e-mail de morador em código, teste ou doc. Exemplos usam placas fictícias (`ABC1D23`, `ABC1234`).
- Commits em PT-BR, Conventional Commits, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Rajada simultânea da mesma placa** — 10 chegadas paralelas devem gerar exatamente 1 chamada paga (teste na Task 5).
2. **Placa antiga x Mercosul** — `ABC1234` e `ABC1C34` são o mesmo veículo, uma linha, uma consulta (Tasks 2 e 5).
3. **Token vazando por mensagem de erro** — `fetch` que lança com a URL na mensagem não pode propagar a URL (Task 3).
4. **Teto atingido no meio da repescagem** — a fila para de chamar a API assim que o gasto alcança o teto (Task 6).
5. **Nome de morador com HTML** — `<img src=x onerror=…>` em `nome_morador` aparece como texto no detalhe e nos cards (Task 11).

---

## Estrutura de arquivos

| Arquivo | Novo? | Responsabilidade |
|---|---|---|
| `sql/migration-apiplacas-base-veiculos.sql` | novo | tabelas, índices, RLS, função de gasto |
| `test/sql/rls-veiculos-base.sql` | novo | teste de isolamento rodado no banco, com ROLLBACK |
| `site/js/placa.js` | novo | normalizar, converter, distância, variantes |
| `site/js/texto-seguro.js` | novo | `esc()` para o painel (UMD) |
| `lib/apiplacas.js` | novo | cliente HTTP, classificação de resposta, mapeamento |
| `lib/veiculos-base-repo.js` | novo | acesso ao Supabase (única peça com I/O de banco) |
| `lib/validador-placa.js` | novo | decide `ok` / `suspeita` |
| `lib/veiculos-base.js` | novo | orquestrador: captura, fila, reconsulta |
| `lib/apiplacas-avisos.js` | novo | quais avisos mandar e quando |
| `lib/apiplacas-config.js` | novo | validação da config vinda do admin |
| `lib/email-sender.js` | altera | `enviarEmailSimples` |
| `lib/pdf-generator.js` | altera | linha "Veículo: …" |
| `api/captura.js` | altera | chama o orquestrador antes da notificação |
| `api/cron-apiplacas.js` | novo | repescagem + saldo + avisos + retenção |
| `api/admin/apiplacas.js` | novo | config, resumo, extrato, reconsulta, validar hoje |
| `api/admin/veiculos-base.js` | novo | busca por placa (cadastro) e ações da suspeita |
| `api/admin/direitos.js` | altera | eliminação apaga da base |
| `vercel.json` | altera | rotas e cron |
| `admin/index.html` | altera | tela "Consulta de placas" |
| `dashboard/index.html` | altera | selos, quadro "Veículo", cadastro inline, suspeita, escape |
| `docs/*` LGPD, `site/privacidade.html` | altera | APIPLACAS como suboperadora |
| `package.json` | altera | novos testes no `npm test` |

---

### Task 1: Migration e teste de isolamento no banco

**Files:**
- Create: `sql/migration-apiplacas-base-veiculos.sql`
- Create: `test/sql/rls-veiculos-base.sql`

**Interfaces:**
- Produces: tabelas `veiculos_base`, `apiplacas_config` (linha `id = 1`), `apiplacas_consultas`; função `public.apiplacas_gasto_mes() returns numeric` (só `service_role`).

- [ ] **Step 1: Escrever o teste de isolamento (vai falhar: tabela não existe)**

`test/sql/rls-veiculos-base.sql`:

```sql
-- Teste de isolamento da veiculos_base. Roda inteiro dentro de uma transação
-- e termina em ROLLBACK: não deixa nada no banco.
-- Uso: executar via MCP do Supabase (execute_sql). Resultado esperado: uma
-- linha com ve_a = 1, ve_b = 0, config = 0, extrato = 0.
begin;

-- Dois clientes e dois usuários fictícios
insert into clientes (id, nome, limite_velocidade) values
  ('00000000-0000-0000-0000-00000000aaaa', 'Teste RLS A', 30),
  ('00000000-0000-0000-0000-00000000bbbb', 'Teste RLS B', 30);
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'rls-a@teste.invalid');
insert into usuarios (auth_id, email, nome, role, cliente_id, ativo) values
  ('00000000-0000-0000-0000-0000000000a1', 'rls-a@teste.invalid', 'RLS A', 'admin_cliente',
   '00000000-0000-0000-0000-00000000aaaa', true);

-- ZZZ9Z91 passou só no A; ZZZ9Z92 passou só no B
insert into capturas (cliente_id, placa, velocidade, timestamp) values
  ('00000000-0000-0000-0000-00000000aaaa', 'ZZZ9Z91', 20, now()),
  ('00000000-0000-0000-0000-00000000bbbb', 'ZZZ9Z92', 20, now());
insert into veiculos_base (placa, status) values ('ZZZ9Z91', 'consultado'), ('ZZZ9Z92', 'consultado');
insert into apiplacas_consultas (placa, resultado, custo, origem) values ('ZZZ9Z91', 'ok', 0.03, 'captura');

-- Agir como o usuário do cliente A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

select
  (select count(*) from veiculos_base where placa = 'ZZZ9Z91') as ve_a,
  (select count(*) from veiculos_base where placa = 'ZZZ9Z92') as ve_b,
  (select count(*) from apiplacas_config) as config,
  (select count(*) from apiplacas_consultas) as extrato;

rollback;
```

> Se `capturas` ou `clientes` exigirem outras colunas `NOT NULL`, acrescente valores fictícios mínimos — confira com `select column_name, is_nullable from information_schema.columns where table_name in ('capturas','clientes','usuarios')`.

- [ ] **Step 2: Rodar e ver falhar**

Executar o conteúdo de `test/sql/rls-veiculos-base.sql` via MCP `execute_sql` (projeto `gzbiggodmpatteznsrdu`).
Expected: erro `relation "veiculos_base" does not exist`.

- [ ] **Step 3: Escrever a migration**

`sql/migration-apiplacas-base-veiculos.sql`:

```sql
-- ============================================================================
-- Base única de veículos (APIPLACAS)
-- Spec: docs/superpowers/specs/2026-10-04-apiplacas-base-veiculos-design.md
--
-- Só cria objetos; nada destrutivo. Escrita exclusiva do servidor (service
-- role). Leitura do painel limitada às placas que passaram no próprio cliente.
-- ============================================================================

create table if not exists public.veiculos_base (
  placa                 text primary key check (placa ~ '^[A-Z]{3}[0-9][A-Z][0-9]{2}$'),
  placa_antiga          text unique check (placa_antiga is null or placa_antiga ~ '^[A-Z]{3}[0-9]{4}$'),
  status                text not null check (status in ('pendente','consultado','sem_resultado','suspeita','erro')),
  suspeita_de           text,
  suspeita_cliente_id   uuid references public.clientes(id) on delete set null,
  marca                 text,
  modelo                text,
  versao                text,
  cor                   text,
  cor_normalizada       text,
  ano_fabricacao        smallint,
  ano_modelo            smallint,
  municipio             text,
  uf                    text,
  tipo_veiculo          text,
  situacao              text,
  consultado_em         timestamptz,
  tentativas            smallint not null default 0,
  proxima_tentativa_em  timestamptz,
  ultimo_erro           text,
  visto_por_ultimo_em   timestamptz not null default now(),
  criado_em             timestamptz not null default now()
);

create index if not exists idx_veiculos_base_fila
  on public.veiculos_base (proxima_tentativa_em)
  where status in ('pendente','erro');
create index if not exists idx_veiculos_base_visto
  on public.veiculos_base (visto_por_ultimo_em);

create table if not exists public.apiplacas_config (
  id                 smallint primary key default 1 check (id = 1),
  ativo              boolean not null default false,
  preco_consulta     numeric(10,4) not null default 0.03 check (preco_consulta >= 0),
  teto_mensal        numeric(10,2) not null default 150 check (teto_mensal >= 0),
  aviso_percentual   smallint not null default 80 check (aviso_percentual between 1 and 100),
  saldo_minimo       integer not null default 200 check (saldo_minimo >= 0),
  saldo_atual        integer,
  saldo_em           timestamptz,
  emails_aviso       text[] not null default array['glauber@appps.com.br','suporte@appps.com.br'],
  avisos_enviados    jsonb not null default '{}'::jsonb,
  atualizado_em      timestamptz not null default now(),
  atualizado_por     uuid
);
insert into public.apiplacas_config (id) values (1) on conflict (id) do nothing;

create table if not exists public.apiplacas_consultas (
  id           bigint generated always as identity primary key,
  placa        text not null,
  resultado    text not null check (resultado in ('ok','sem_resultado','placa_invalida','token_invalido','limite','timeout','erro')),
  http_status  smallint,
  duracao_ms   integer,
  custo        numeric(10,4) not null default 0,
  origem       text not null check (origem in ('captura','repescagem','reconsulta','validacao')),
  criado_em    timestamptz not null default now()
);
create index if not exists idx_apiplacas_consultas_criado
  on public.apiplacas_consultas (criado_em desc);

-- Gasto do mês corrente no fuso de Brasília
create or replace function public.apiplacas_gasto_mes()
returns numeric
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select coalesce(sum(custo), 0)
  from public.apiplacas_consultas
  where criado_em >= (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');
$$;
revoke all on function public.apiplacas_gasto_mes() from public, anon, authenticated;
grant execute on function public.apiplacas_gasto_mes() to service_role;

-- RLS
alter table public.veiculos_base       enable row level security;
alter table public.apiplacas_config    enable row level security;
alter table public.apiplacas_consultas enable row level security;

-- Painel: só placas que passaram (ou estão cadastradas) no próprio cliente
create policy "veiculos_base_select_escopo" on public.veiculos_base
  for select to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.capturas c
      where c.cliente_id = public.my_cliente_id()
        and c.placa in (veiculos_base.placa, veiculos_base.placa_antiga)
    )
    or exists (
      select 1 from public.veiculos v
      where v.cliente_id = public.my_cliente_id()
        and v.placa in (veiculos_base.placa, veiculos_base.placa_antiga)
    )
  );

create policy "apiplacas_config_select_admin" on public.apiplacas_config
  for select to authenticated using (public.is_super_admin());

create policy "apiplacas_consultas_select_admin" on public.apiplacas_consultas
  for select to authenticated using (public.is_super_admin());
-- Sem políticas de INSERT/UPDATE/DELETE: só o service role escreve.
```

- [ ] **Step 4: Aplicar a migration**

MCP `apply_migration` (projeto `gzbiggodmpatteznsrdu`, name `apiplacas_base_veiculos`) com o conteúdo acima.

- [ ] **Step 5: Rodar o teste de isolamento**

Executar `test/sql/rls-veiculos-base.sql` via MCP.
Expected: `ve_a = 1, ve_b = 0, config = 0, extrato = 0`.

- [ ] **Step 6: Conferir o advisor de segurança**

MCP `get_advisors` (type `security`). Expected: nenhum aviso novo citando `veiculos_base`, `apiplacas_*` ou `apiplacas_gasto_mes`.

- [ ] **Step 7: Commit**

```bash
git add sql/migration-apiplacas-base-veiculos.sql test/sql/rls-veiculos-base.sql
git commit -m "feat(banco): tabelas da base única de veículos (APIPLACAS) com RLS"
```

---

### Task 2: `site/js/placa.js` — normalização e variantes

**Files:**
- Create: `site/js/placa.js`
- Test: `test/placa.test.js`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Produces (`require('../site/js/placa')` / `window.placaLib`):
  - `limpar(p: any): string` — maiúsculas, só `[A-Z0-9]`
  - `paraMercosul(p): string|null`
  - `paraAntiga(p): string|null` — `null` se a 5ª letra for K–Z ou formato inválido
  - `difereEmUm(a: string, b: string): boolean`
  - `variantes(p): string[]` — todas as placas válidas a 1 caractere da Mercosul de `p`, nas duas grafias, sem a própria

- [ ] **Step 1: Escrever o teste**

`test/placa.test.js`:

```js
/**
 * Testes de site/js/placa.js.
 * Uso: node test/placa.test.js
 */
const assert = require('node:assert');
const { limpar, paraMercosul, paraAntiga, difereEmUm, variantes } = require('../site/js/placa');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

caso('limpar tira hífen, espaço e minúsculas', () => {
  assert.strictEqual(limpar(' abc-1d23 '), 'ABC1D23');
  assert.strictEqual(limpar(null), '');
});

caso('antiga vira Mercosul pela 5ª posição (0=A … 9=J)', () => {
  assert.strictEqual(paraMercosul('ABC1234'), 'ABC1C34');
  assert.strictEqual(paraMercosul('ABC1034'), 'ABC1A34');
  assert.strictEqual(paraMercosul('ABC1934'), 'ABC1J34');
});

caso('Mercosul continua Mercosul', () => {
  assert.strictEqual(paraMercosul('abc1d23'), 'ABC1D23');
});

caso('formato inválido devolve null', () => {
  assert.strictEqual(paraMercosul('AB12'), null);
  assert.strictEqual(paraMercosul('1234567'), null);
  assert.strictEqual(paraAntiga(''), null);
});

caso('Mercosul A–J tem forma antiga; K–Z não', () => {
  assert.strictEqual(paraAntiga('ABC1C34'), 'ABC1234');
  assert.strictEqual(paraAntiga('ABC1234'), 'ABC1234');
  assert.strictEqual(paraAntiga('ABC1K34'), null);
});

caso('difereEmUm só aceita exatamente 1 diferença no mesmo tamanho', () => {
  assert.strictEqual(difereEmUm('ABC1D23', 'A8C1D23'), true);
  assert.strictEqual(difereEmUm('ABC1D23', 'ABC1D23'), false);
  assert.strictEqual(difereEmUm('ABC1D23', 'XBC1D24'), false);
  assert.strictEqual(difereEmUm('ABC1D23', 'ABC1D2'), false);
});

caso('variantes cobrem troca de letra, de dígito e da 5ª posição, nas duas grafias', () => {
  const v = variantes('ABC1C34');
  assert.ok(v.includes('XBC1C34'));   // letra
  assert.ok(v.includes('ABC2C34'));   // dígito
  assert.ok(v.includes('ABC1D34'));   // 5ª posição (Mercosul)
  assert.ok(v.includes('ABC1334'));   // 5ª posição (antiga de ABC1D34)
  assert.ok(v.includes('XBC1234'));   // antiga de XBC1C34
  assert.ok(!v.includes('ABC1C34'));
  assert.ok(!v.includes('ABC1234'));  // é a mesma placa, não variante
  assert.ok(v.every((p) => /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(p)));
});

caso('variantes de placa inválida é lista vazia', () => {
  assert.deepStrictEqual(variantes('???'), []);
});

console.log(`\n${passou} casos passaram`);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node test/placa.test.js`
Expected: `Cannot find module '../site/js/placa'`

- [ ] **Step 3: Implementar**

`site/js/placa.js`:

```js
/**
 * placa.js — fonte única das regras de placa (antiga x Mercosul).
 *
 * Carregado no browser (window.placaLib) e no Node (require). A base de
 * veículos usa a forma Mercosul como chave: a mesma placa nas duas grafias é
 * o mesmo carro e não pode ser consultada (paga) duas vezes.
 *
 * Conversão oficial: na 5ª posição, dígito 0–9 da antiga ↔ letra A–J da
 * Mercosul. Mercosul com K–Z na 5ª posição não tem forma antiga.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.placaLib = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const LETRAS_5A = 'ABCDEFGHIJ';
  const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const DIGITOS = '0123456789';
  const RE_ANTIGA = /^[A-Z]{3}\d{4}$/;
  const RE_MERCOSUL = /^[A-Z]{3}\d[A-Z]\d{2}$/;

  function limpar(p) {
    return String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function paraMercosul(p) {
    const s = limpar(p);
    if (RE_MERCOSUL.test(s)) return s;
    if (RE_ANTIGA.test(s)) return s.slice(0, 4) + LETRAS_5A[Number(s[4])] + s.slice(5);
    return null;
  }

  function paraAntiga(p) {
    const m = paraMercosul(p);
    if (!m) return null;
    const i = LETRAS_5A.indexOf(m[4]);
    return i < 0 ? null : m.slice(0, 4) + i + m.slice(5);
  }

  function difereEmUm(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    let dif = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) dif++;
    return dif === 1;
  }

  // Posições 1–3 letras, 4/6/7 dígitos, 5ª letra (Mercosul)
  const OPCOES = [ALFABETO, ALFABETO, ALFABETO, DIGITOS, ALFABETO, DIGITOS, DIGITOS];

  function variantes(p) {
    const m = paraMercosul(p);
    if (!m) return [];
    const mesma = new Set([m, paraAntiga(m)]);
    const out = new Set();
    OPCOES.forEach((opcoes, i) => {
      for (const ch of opcoes) {
        if (ch === m[i]) continue;
        const v = m.slice(0, i) + ch + m.slice(i + 1);
        out.add(v);
        const antiga = paraAntiga(v);
        if (antiga) out.add(antiga);
      }
    });
    mesma.forEach((x) => out.delete(x));
    return [...out];
  }

  return { limpar, paraMercosul, paraAntiga, difereEmUm, variantes };
});
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node test/placa.test.js`
Expected: `8 casos passaram`

- [ ] **Step 5: Incluir no `npm test`**

Em `package.json`, acrescentar ` && node test/placa.test.js` ao fim do script `test`.
Run: `npm test` — Expected: todos passam.

- [ ] **Step 6: Commit**

```bash
git add site/js/placa.js test/placa.test.js package.json
git commit -m "feat(placa): normalização antiga/Mercosul e variantes a 1 caractere"
```

---

### Task 3: `lib/apiplacas.js` — cliente da API

**Files:**
- Create: `lib/apiplacas.js`
- Test: `test/apiplacas.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `criarClienteApiplacas({ token: string, fetchImpl?: Function, timeoutMs?: number = 3000 })` → `{ consultar(placa): Promise<ResultadoConsulta>, saldo(): Promise<number|null> }`
  - `ResultadoConsulta = { resultado: 'ok'|'sem_resultado'|'placa_invalida'|'token_invalido'|'limite'|'timeout'|'erro', httpStatus: number|null, duracaoMs: number, consome: boolean, dados: DadosVeiculo|null }`
  - `DadosVeiculo = { marca, modelo, versao, cor, cor_normalizada, ano_fabricacao, ano_modelo, municipio, uf, tipo_veiculo, situacao }` (strings ou `null`; anos `number|null`)
  - `normalizarCor(cor: string): string|null`

- [ ] **Step 1: Escrever o teste**

`test/apiplacas.test.js`:

```js
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

  console.log(`\n${passou} casos passaram`);
})().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node test/apiplacas.test.js` — Expected: `Cannot find module '../lib/apiplacas'`

- [ ] **Step 3: Implementar**

`lib/apiplacas.js`:

```js
/**
 * Cliente da APIPLACAS (wdapi2.com.br).
 *
 * O token vai NO CAMINHO da URL, então nada daqui pode devolver URL ou
 * mensagem de erro do fetch: só o nome do erro e o status HTTP.
 *
 * Medido em 04/10/2026: consulta ~0,5 s (máx 0,74 s); placa de formato
 * inválido volta 406 (não 401, como diz a documentação) e não consome saldo.
 */
const BASE = 'https://wdapi2.com.br';

const COR_NEUTRA = {
  branca: 'branco', preta: 'preto', dourada: 'dourado',
  vermelha: 'vermelho', amarela: 'amarelo', roxa: 'roxo',
};

function normalizarCor(cor) {
  const s = String(cor || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!s) return null;
  return COR_NEUTRA[s] || s;
}

function texto(v) {
  const s = v === undefined || v === null ? '' : String(v).trim();
  return s || null;
}

function ano(v) {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n > 1900 && n < 2100 ? n : null;
}

function mapearDados(c) {
  const extra = c.extra && typeof c.extra === 'object' ? c.extra : {};
  return {
    marca: texto(c.MARCA || c.marca),
    modelo: texto(c.MODELO || c.modelo),
    versao: texto(c.VERSAO),
    cor: texto(c.cor),
    cor_normalizada: normalizarCor(c.cor),
    ano_fabricacao: ano(c.ano || extra.ano_fabricacao),
    ano_modelo: ano(c.anoModelo || extra.ano_modelo),
    municipio: texto(c.municipio),
    uf: texto(c.uf),
    tipo_veiculo: texto(extra.tipo_veiculo),
    situacao: texto(c.situacao),
  };
}

function classificar(http, corpo) {
  const msg = String((corpo && corpo.message) || '');
  if (http === 200 && (corpo.MARCA || corpo.marca)) return 'ok';
  if (http === 401 || (http === 406 && /inv[aá]lida/i.test(msg))) return 'placa_invalida';
  if (http === 406) return 'sem_resultado';
  if (http === 402) return 'token_invalido';
  if (http === 429) return 'limite';
  return 'erro';
}

// "sem_resultado" conta como consumido por precaução: a APIPLACAS não
// documenta se cobra, e o teto precisa errar para o lado seguro.
const CONSOME = new Set(['ok', 'sem_resultado']);

function criarClienteApiplacas({ token, fetchImpl = fetch, timeoutMs = 3000 } = {}) {
  if (!token) throw new Error('APIPLACAS_TOKEN não configurado');

  async function chamar(caminho) {
    const inicio = Date.now();
    try {
      const r = await fetchImpl(`${BASE}/${caminho}/${token}`, { signal: AbortSignal.timeout(timeoutMs) });
      const corpo = await r.json().catch(() => ({}));
      return { http: r.status, corpo: corpo || {}, duracaoMs: Date.now() - inicio, falha: null };
    } catch (e) {
      const nome = e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'timeout' : 'erro';
      return { http: null, corpo: {}, duracaoMs: Date.now() - inicio, falha: nome };
    }
  }

  async function consultar(placa) {
    const r = await chamar(`consulta/${encodeURIComponent(placa)}`);
    const resultado = r.falha || classificar(r.http, r.corpo);
    return {
      resultado,
      httpStatus: r.http,
      duracaoMs: r.duracaoMs,
      consome: CONSOME.has(resultado),
      dados: resultado === 'ok' ? mapearDados(r.corpo) : null,
    };
  }

  async function saldo() {
    const r = await chamar('saldo');
    const n = Number(r.corpo.qtdConsultas);
    return r.http === 200 && Number.isFinite(n) ? n : null;
  }

  return { consultar, saldo };
}

module.exports = { criarClienteApiplacas, normalizarCor };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node test/apiplacas.test.js` — Expected: `10 casos passaram`

- [ ] **Step 5: Incluir no `npm test` e commit**

Acrescentar ` && node test/apiplacas.test.js` ao script `test`.

```bash
git add lib/apiplacas.js test/apiplacas.test.js package.json
git commit -m "feat(apiplacas): cliente com timeout de 3 s, classificação e mapeamento mínimo"
```

---

### Task 4: Validador de placa suspeita

**Files:**
- Create: `lib/validador-placa.js`
- Test: `test/validador-placa.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `variantes`, `paraMercosul` (Task 2).
- Produces: `criarValidador({ contarPassagens })` → `{ avaliar({ placa, clienteId }): Promise<{ suspeita: false } | { suspeita: true, de: string }> }`
  - `contarPassagens(clienteId: string, placas: string[], desdeIso: string): Promise<Record<string, number>>` — contagem por placa (implementada no repo, Task 5).
- Constantes exportadas: `MINIMO_PASSAGENS = 3`, `JANELA_DIAS = 30`.

- [ ] **Step 1: Escrever o teste**

`test/validador-placa.test.js`:

```js
/**
 * Testes de lib/validador-placa.js.
 * Uso: node test/validador-placa.test.js
 */
const assert = require('node:assert');
const { criarValidador } = require('../lib/validador-placa');

let passou = 0;
async function caso(nome, fn) { await fn(); passou++; console.log(`ok - ${nome}`); }

function contador(contagens) {
  const chamadas = [];
  const fn = async (clienteId, placas, desde) => {
    chamadas.push({ clienteId, placas, desde });
    return Object.fromEntries(placas.filter((p) => contagens[p]).map((p) => [p, contagens[p]]));
  };
  fn.chamadas = chamadas;
  return fn;
}

(async () => {
  await caso('quase gêmea de placa frequente vira suspeita apontando a original', async () => {
    const v = criarValidador({ contarPassagens: contador({ ABC1D23: 12 }) });
    assert.deepStrictEqual(await v.avaliar({ placa: 'ABC1D28', clienteId: 'c1' }), { suspeita: true, de: 'ABC1D23' });
  });

  await caso('vizinha com menos de 3 passagens não conta', async () => {
    const v = criarValidador({ contarPassagens: contador({ ABC1D23: 2 }) });
    assert.deepStrictEqual(await v.avaliar({ placa: 'ABC1D28', clienteId: 'c1' }), { suspeita: false });
  });

  await caso('placa sem vizinhas é ok', async () => {
    const v = criarValidador({ contarPassagens: contador({}) });
    assert.deepStrictEqual(await v.avaliar({ placa: 'QWE4R56', clienteId: 'c1' }), { suspeita: false });
  });

  await caso('vizinha gravada no formato antigo é reconhecida e devolvida em Mercosul', async () => {
    const v = criarValidador({ contarPassagens: contador({ ABC1234: 5 }) });
    assert.deepStrictEqual(await v.avaliar({ placa: 'ABC1235', clienteId: 'c1' }), { suspeita: true, de: 'ABC1C34' });
  });

  await caso('com várias vizinhas, escolhe a mais frequente', async () => {
    const v = criarValidador({ contarPassagens: contador({ ABC1D23: 4, ABC1D28: 9 }) });
    assert.deepStrictEqual(await v.avaliar({ placa: 'ABC1D20', clienteId: 'c1' }), { suspeita: true, de: 'ABC1D28' });
  });

  await caso('consulta o cliente certo, numa janela de 30 dias', async () => {
    const c = contador({});
    await criarValidador({ contarPassagens: c, agora: () => new Date('2026-10-04T12:00:00Z') })
      .avaliar({ placa: 'ABC1D23', clienteId: 'cli-x' });
    assert.strictEqual(c.chamadas[0].clienteId, 'cli-x');
    assert.strictEqual(c.chamadas[0].desde, '2026-09-04T12:00:00.000Z');
  });

  await caso('falha na contagem não bloqueia: trata como ok', async () => {
    const v = criarValidador({ contarPassagens: async () => { throw new Error('banco fora'); } });
    assert.deepStrictEqual(await v.avaliar({ placa: 'ABC1D23', clienteId: 'c1' }), { suspeita: false });
  });

  console.log(`\n${passou} casos passaram`);
})().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node test/validador-placa.test.js` — Expected: `Cannot find module`

- [ ] **Step 3: Implementar**

`lib/validador-placa.js`:

```js
/**
 * Validador gratuito antes de pagar uma consulta.
 *
 * Erro de leitura típico: um carro que passa todo dia vira, numa passagem, uma
 * placa com 1 caractere trocado (B→8, O→0). Essa "placa nova" custaria uma
 * consulta e traria o carro de um desconhecido. Medido em 30 dias: ~21% das
 * placas vistas uma só vez são assim.
 *
 * Falha na contagem nunca bloqueia: na dúvida, consulta.
 */
const { variantes, paraMercosul } = require('../site/js/placa');

const MINIMO_PASSAGENS = 3;
const JANELA_DIAS = 30;

function criarValidador({ contarPassagens, agora = () => new Date() }) {
  async function avaliar({ placa, clienteId }) {
    const vizinhas = variantes(placa);
    if (!vizinhas.length) return { suspeita: false };
    const desde = new Date(agora().getTime() - JANELA_DIAS * 86400000).toISOString();
    let contagens;
    try {
      contagens = await contarPassagens(clienteId, vizinhas, desde);
    } catch {
      return { suspeita: false };
    }
    // Soma as duas grafias de cada vizinha antes de comparar com o mínimo
    const porMercosul = {};
    for (const [p, n] of Object.entries(contagens || {})) {
      const m = paraMercosul(p);
      if (m) porMercosul[m] = (porMercosul[m] || 0) + n;
    }
    const [de, n] = Object.entries(porMercosul).sort((a, b) => b[1] - a[1])[0] || [];
    return n >= MINIMO_PASSAGENS ? { suspeita: true, de } : { suspeita: false };
  }
  return { avaliar };
}

module.exports = { criarValidador, MINIMO_PASSAGENS, JANELA_DIAS };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node test/validador-placa.test.js` — Expected: `7 casos passaram`

- [ ] **Step 5: Incluir no `npm test` e commit**

```bash
git add lib/validador-placa.js test/validador-placa.test.js package.json
git commit -m "feat(apiplacas): validador de leitura suspeita (quase gêmea de placa frequente)"
```

---

### Task 5: Repositório + orquestrador da captura (`aoPassar`)

**Files:**
- Create: `lib/veiculos-base-repo.js`
- Create: `lib/veiculos-base.js`
- Create: `test/helpers/repo-memoria.js`
- Test: `test/veiculos-base.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `paraMercosul`, `paraAntiga` (Task 2); cliente da API (Task 3); `criarValidador` (Task 4).
- Produces — repositório (mesma forma no Supabase e na memória):
  - `buscar(placa): Promise<Linha|null>`
  - `tocar(placa): Promise<void>` — `visto_por_ultimo_em = now()`
  - `reservar(linha): Promise<boolean>` — insere se não existir; `true` só para quem inseriu
  - `atualizar(placa, campos): Promise<void>`
  - `registrarConsulta({ placa, resultado, http_status, duracao_ms, custo, origem }): Promise<void>`
  - `lerConfig(): Promise<Config>`
  - `atualizarConfig(campos): Promise<void>`
  - `gastoDoMes(): Promise<number>`
  - `contarPassagens(clienteId, placas, desdeIso): Promise<Record<string, number>>`
  - `fila(limite, agoraIso): Promise<Linha[]>` — `pendente`/`erro` com `proxima_tentativa_em` nula ou vencida
  - `tamanhoFila(): Promise<number>`
  - `apagarVistosAntesDe(iso): Promise<number>`
  - `apagar(placa): Promise<void>`
- Produces — orquestrador `criarVeiculosBase({ repo, api, validador, agora? })`:
  - `aoPassar({ placa, clienteId }): Promise<Linha|null>`
  - `consultarAgora(placa, origem): Promise<{ executou: boolean, motivo?: string, linha?: Linha }>`
  - `BACKOFF_MIN = [5, 30, 120, 1440]`

- [ ] **Step 1: Escrever o repositório em memória (para os testes)**

`test/helpers/repo-memoria.js`:

```js
/**
 * Repositório em memória com a mesma interface de lib/veiculos-base-repo.js.
 * Cada método cede a vez (await) antes de agir, para que chamadas paralelas
 * se intercalem como no banco; reservar() é atômico como o ON CONFLICT.
 */
function criarRepoMemoria({ config = {}, passagens = {} } = {}) {
  const linhas = new Map();
  const consultas = [];
  let cfg = {
    ativo: true, preco_consulta: 0.03, teto_mensal: 150, aviso_percentual: 80,
    saldo_minimo: 200, saldo_atual: null, emails_aviso: ['a@x.com'], avisos_enviados: {},
    ...config,
  };
  const ceder = () => new Promise((r) => setImmediate(r));
  return {
    linhas, consultas,
    async buscar(placa) { await ceder(); return linhas.has(placa) ? { ...linhas.get(placa) } : null; },
    async tocar(placa) { await ceder(); if (linhas.has(placa)) linhas.get(placa).visto_por_ultimo_em = new Date().toISOString(); },
    async reservar(linha) {
      await ceder();
      if (linhas.has(linha.placa)) return false;
      linhas.set(linha.placa, { tentativas: 0, ...linha });
      return true;
    },
    async atualizar(placa, campos) { await ceder(); Object.assign(linhas.get(placa), campos); },
    async registrarConsulta(c) { await ceder(); consultas.push(c); },
    async lerConfig() { await ceder(); return { ...cfg }; },
    async atualizarConfig(campos) { await ceder(); cfg = { ...cfg, ...campos }; },
    async gastoDoMes() { await ceder(); return consultas.reduce((s, c) => s + c.custo, 0); },
    async contarPassagens(clienteId, placas) {
      await ceder();
      const doCliente = passagens[clienteId] || {};
      return Object.fromEntries(placas.filter((p) => doCliente[p]).map((p) => [p, doCliente[p]]));
    },
    async fila(limite, agoraIso) {
      await ceder();
      return [...linhas.values()]
        .filter((l) => ['pendente', 'erro'].includes(l.status) && (!l.proxima_tentativa_em || l.proxima_tentativa_em <= agoraIso))
        .slice(0, limite).map((l) => ({ ...l }));
    },
    async tamanhoFila() { await ceder(); return [...linhas.values()].filter((l) => ['pendente', 'erro'].includes(l.status)).length; },
    async apagarVistosAntesDe(iso) {
      await ceder();
      let n = 0;
      for (const [p, l] of linhas) if (l.visto_por_ultimo_em < iso) { linhas.delete(p); n++; }
      return n;
    },
    async apagar(placa) { await ceder(); linhas.delete(placa); },
  };
}
module.exports = { criarRepoMemoria };
```

- [ ] **Step 2: Escrever o teste do orquestrador**

`test/veiculos-base.test.js`:

```js
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

  console.log(`\n${passou} casos passaram`);
})().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `node test/veiculos-base.test.js` — Expected: `Cannot find module '../lib/veiculos-base'`

- [ ] **Step 4: Implementar o orquestrador**

`lib/veiculos-base.js`:

```js
/**
 * Orquestrador da base única de veículos.
 *
 * Regra de ouro: cada veículo é pago no máximo uma vez. A garantia contra
 * rajada é a reserva (INSERT … ON CONFLICT DO NOTHING na PK Mercosul): só
 * quem reservou chama a API. Nada aqui lança para quem chama — a captura e a
 * notificação nunca podem cair por causa da APIPLACAS.
 */
const { paraMercosul, paraAntiga } = require('../site/js/placa');

const BACKOFF_MIN = [5, 30, 120, 1440];

function criarVeiculosBase({ repo, api, validador, agora = () => new Date() }) {
  const emMin = (min) => new Date(agora().getTime() + min * 60000).toISOString();

  async function travas() {
    const cfg = await repo.lerConfig();
    if (!cfg.ativo) return { ok: false, motivo: 'desligado', cfg };
    if (cfg.saldo_atual !== null && cfg.saldo_atual !== undefined && cfg.saldo_atual <= 0) {
      return { ok: false, motivo: 'sem_saldo', cfg };
    }
    if ((await repo.gastoDoMes()) >= Number(cfg.teto_mensal)) return { ok: false, motivo: 'teto', cfg };
    return { ok: true, cfg };
  }

  async function aplicarResultado(linha, r, cfg, origem) {
    await repo.registrarConsulta({
      placa: linha.placa, resultado: r.resultado, http_status: r.httpStatus,
      duracao_ms: r.duracaoMs, custo: r.consome ? Number(cfg.preco_consulta) : 0, origem,
    });
    const agoraIso = agora().toISOString();
    let campos;
    if (r.resultado === 'ok') {
      campos = { ...r.dados, status: 'consultado', consultado_em: agoraIso, ultimo_erro: null, proxima_tentativa_em: null };
    } else if (r.resultado === 'sem_resultado' || r.resultado === 'placa_invalida') {
      campos = { status: 'sem_resultado', consultado_em: agoraIso, ultimo_erro: r.resultado, proxima_tentativa_em: null };
    } else if (r.resultado === 'token_invalido') {
      await repo.atualizarConfig({ ativo: false });
      campos = { status: 'pendente', ultimo_erro: 'token_invalido' };
    } else if (r.resultado === 'limite') {
      await repo.atualizarConfig({ saldo_atual: 0, saldo_em: agoraIso });
      campos = { status: 'pendente', ultimo_erro: 'limite' };
    } else {
      const t = (linha.tentativas || 0) + 1;
      campos = {
        status: 'erro', tentativas: t, ultimo_erro: r.resultado,
        proxima_tentativa_em: emMin(BACKOFF_MIN[Math.min(t, BACKOFF_MIN.length) - 1]),
      };
    }
    await repo.atualizar(linha.placa, campos);
    return { ...linha, ...campos };
  }

  // Consulta uma placa já existente na base (fila, reconsulta, validação)
  async function consultarAgora(placa, origem) {
    const linha = await repo.buscar(placa);
    if (!linha) return { executou: false, motivo: 'inexistente' };
    const t = await travas();
    if (!t.ok) {
      await repo.atualizar(placa, { ultimo_erro: t.motivo });
      return { executou: false, motivo: t.motivo };
    }
    const r = await api.consultar(placa);
    return { executou: true, linha: await aplicarResultado(linha, r, t.cfg, origem) };
  }

  async function aoPassar({ placa, clienteId }) {
    try {
      const m = paraMercosul(placa);
      if (!m) return null;

      const existente = await repo.buscar(m);
      if (existente) {
        await repo.tocar(m);
        return existente;
      }

      const v = await validador.avaliar({ placa: m, clienteId });
      const base = { placa: m, placa_antiga: paraAntiga(m), visto_por_ultimo_em: agora().toISOString() };

      if (v.suspeita) {
        const linha = { ...base, status: 'suspeita', suspeita_de: v.de, suspeita_cliente_id: clienteId };
        return (await repo.reservar(linha)) ? linha : await repo.buscar(m);
      }

      const linha = { ...base, status: 'pendente', tentativas: 0 };
      if (!(await repo.reservar(linha))) return await repo.buscar(m); // outra chegada reservou

      const t = await travas();
      if (!t.ok) {
        await repo.atualizar(m, { ultimo_erro: t.motivo });
        return { ...linha, ultimo_erro: t.motivo };
      }
      const r = await api.consultar(m);
      return await aplicarResultado(linha, r, t.cfg, 'captura');
    } catch {
      return null;
    }
  }

  return { aoPassar, consultarAgora, travas, aplicarResultado };
}

module.exports = { criarVeiculosBase, BACKOFF_MIN };
```

- [ ] **Step 5: Rodar e ver passar**

Run: `node test/veiculos-base.test.js` — Expected: `14 casos passaram`

- [ ] **Step 6: Implementar o repositório Supabase**

`lib/veiculos-base-repo.js`:

```js
/**
 * Acesso ao banco da base de veículos (service role). Única peça com I/O de
 * banco; o orquestrador e os testes usam a mesma interface.
 *
 * supabase-js NÃO lança em falha: todo retorno passa por ok(), que lança.
 */
const { supabase } = require('./supabase');

function ok({ data, error }) {
  if (error) throw new Error(`veiculos_base: ${error.message}`);
  return data;
}

const LIMITE_CONTAGEM = 5000;

function criarRepoSupabase(db = supabase) {
  return {
    async buscar(placa) {
      return ok(await db.from('veiculos_base').select('*').eq('placa', placa).maybeSingle());
    },
    async tocar(placa) {
      ok(await db.from('veiculos_base').update({ visto_por_ultimo_em: new Date().toISOString() }).eq('placa', placa));
    },
    async reservar(linha) {
      const data = ok(await db.from('veiculos_base')
        .upsert(linha, { onConflict: 'placa', ignoreDuplicates: true })
        .select('placa'));
      return Array.isArray(data) && data.length === 1;
    },
    async atualizar(placa, campos) {
      ok(await db.from('veiculos_base').update(campos).eq('placa', placa));
    },
    async registrarConsulta(c) {
      ok(await db.from('apiplacas_consultas').insert(c));
    },
    async lerConfig() {
      return ok(await db.from('apiplacas_config').select('*').eq('id', 1).single());
    },
    async atualizarConfig(campos) {
      ok(await db.from('apiplacas_config').update({ ...campos, atualizado_em: new Date().toISOString() }).eq('id', 1));
    },
    async gastoDoMes() {
      return Number(ok(await db.rpc('apiplacas_gasto_mes'))) || 0;
    },
    async contarPassagens(clienteId, placas, desdeIso) {
      const data = ok(await db.from('capturas').select('placa')
        .eq('cliente_id', clienteId).in('placa', placas).gte('timestamp', desdeIso)
        .limit(LIMITE_CONTAGEM));
      return data.reduce((acc, { placa }) => ({ ...acc, [placa]: (acc[placa] || 0) + 1 }), {});
    },
    async fila(limite, agoraIso) {
      return ok(await db.from('veiculos_base').select('*')
        .in('status', ['pendente', 'erro'])
        .or(`proxima_tentativa_em.is.null,proxima_tentativa_em.lte.${agoraIso}`)
        .order('criado_em', { ascending: true }).limit(limite));
    },
    async tamanhoFila() {
      const { count, error } = await db.from('veiculos_base')
        .select('placa', { count: 'exact', head: true }).in('status', ['pendente', 'erro']);
      if (error) throw new Error(`veiculos_base: ${error.message}`);
      return count || 0;
    },
    async apagarVistosAntesDe(iso) {
      const data = ok(await db.from('veiculos_base').delete().lt('visto_por_ultimo_em', iso).select('placa'));
      return data.length;
    },
    async apagar(placa) {
      ok(await db.from('veiculos_base').delete().eq('placa', placa));
    },
  };
}

module.exports = { criarRepoSupabase };
```

> `agoraIso` vem de `Date#toISOString()` (sem vírgula nem parêntese), então é seguro dentro do filtro `.or()`.

- [ ] **Step 7: Verificar o `reservar` no banco real (sem gastar consulta)**

Via MCP `execute_sql`, num bloco `begin … rollback`, conferir que o upsert com `ignoreDuplicates` não devolve linha na 2ª vez:

```sql
begin;
insert into veiculos_base (placa, status) values ('ZZZ9Z93','pendente') on conflict (placa) do nothing returning placa;
insert into veiculos_base (placa, status) values ('ZZZ9Z93','pendente') on conflict (placa) do nothing returning placa;
rollback;
```

Expected: 1ª devolve `ZZZ9Z93`; 2ª devolve vazio.

- [ ] **Step 8: Incluir no `npm test` e commit**

Acrescentar ` && node test/veiculos-base.test.js` ao script `test`. Run: `npm test` — todos passam.

```bash
git add lib/veiculos-base.js lib/veiculos-base-repo.js test/helpers/repo-memoria.js test/veiculos-base.test.js package.json
git commit -m "feat(apiplacas): orquestrador com reserva atômica, travas e backoff"
```

---

### Task 6: Repescagem, avisos e cron

**Files:**
- Create: `lib/apiplacas-avisos.js`
- Create: `api/cron-apiplacas.js`
- Modify: `lib/veiculos-base.js` (função `processarFila`)
- Modify: `lib/email-sender.js` (função `enviarEmailSimples`)
- Modify: `vercel.json`
- Test: `test/apiplacas-avisos.test.js`, novos casos em `test/veiculos-base.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: orquestrador e repo (Task 5); `criarClienteApiplacas` (Task 3).
- Produces:
  - `processarFila({ limite = 50 }): Promise<{ consultadas: number, parou: string|null }>` no objeto do orquestrador
  - `avisosPendentes({ cfg, gasto, saldo, mes }): Aviso[]` — `Aviso = { chave: string, assunto: string, texto: string }`
  - `chavesLimpas({ cfg, saldo }): object` — `avisos_enviados` sem as chaves de saldo quando o saldo voltou a subir
  - `enviarEmailSimples({ destinatarios: string[], assunto: string, texto: string }): Promise<void>`

- [ ] **Step 1: Teste dos avisos**

`test/apiplacas-avisos.test.js`:

```js
/**
 * Testes de lib/apiplacas-avisos.js.
 * Uso: node test/apiplacas-avisos.test.js
 */
const assert = require('node:assert');
const { avisosPendentes, chavesLimpas } = require('../lib/apiplacas-avisos');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

const CFG = { ativo: true, teto_mensal: 150, aviso_percentual: 80, saldo_minimo: 200, avisos_enviados: {} };
const chaves = (l) => l.map((a) => a.chave).sort();

caso('nada a avisar abaixo de tudo', () => {
  assert.deepStrictEqual(avisosPendentes({ cfg: CFG, gasto: 10, saldo: 900, mes: '2026-10' }), []);
});

caso('80% do teto avisa uma vez no mês', () => {
  assert.deepStrictEqual(chaves(avisosPendentes({ cfg: CFG, gasto: 120, saldo: 900, mes: '2026-10' })), ['teto80:2026-10']);
  const jaEnviado = { ...CFG, avisos_enviados: { 'teto80:2026-10': '2026-10-10T00:00:00Z' } };
  assert.deepStrictEqual(avisosPendentes({ cfg: jaEnviado, gasto: 130, saldo: 900, mes: '2026-10' }), []);
});

caso('teto atingido avisa também (e o 80% se ainda não foi)', () => {
  assert.deepStrictEqual(chaves(avisosPendentes({ cfg: CFG, gasto: 150, saldo: 900, mes: '2026-10' })), ['teto100:2026-10', 'teto80:2026-10']);
});

caso('mês novo libera os avisos de teto de novo', () => {
  const cfg = { ...CFG, avisos_enviados: { 'teto80:2026-10': 'x', 'teto100:2026-10': 'x' } };
  assert.deepStrictEqual(chaves(avisosPendentes({ cfg, gasto: 150, saldo: 900, mes: '2026-11' })), ['teto100:2026-11', 'teto80:2026-11']);
});

caso('saldo baixo e zerado não dependem do mês', () => {
  assert.deepStrictEqual(chaves(avisosPendentes({ cfg: CFG, gasto: 0, saldo: 150, mes: '2026-10' })), ['saldo_baixo']);
  assert.deepStrictEqual(chaves(avisosPendentes({ cfg: CFG, gasto: 0, saldo: 0, mes: '2026-10' })), ['saldo_baixo', 'saldo_zerado']);
});

caso('saldo desconhecido (null) não gera aviso de saldo', () => {
  assert.deepStrictEqual(avisosPendentes({ cfg: CFG, gasto: 0, saldo: null, mes: '2026-10' }), []);
});

caso('token desligado gera aviso único', () => {
  const cfg = { ...CFG, ativo: false, avisos_enviados: {} };
  const l = avisosPendentes({ cfg, gasto: 0, saldo: 900, mes: '2026-10', tokenInvalido: true });
  assert.deepStrictEqual(chaves(l), ['token_invalido']);
});

caso('recarga: saldo acima do mínimo limpa as chaves de saldo', () => {
  const cfg = { ...CFG, avisos_enviados: { saldo_baixo: 'x', saldo_zerado: 'x', 'teto80:2026-10': 'x' } };
  assert.deepStrictEqual(chavesLimpas({ cfg, saldo: 1000 }), { 'teto80:2026-10': 'x' });
  assert.deepStrictEqual(chavesLimpas({ cfg, saldo: 100 }), cfg.avisos_enviados);
});

caso('nenhum aviso cita placa', () => {
  const l = avisosPendentes({ cfg: CFG, gasto: 150, saldo: 0, mes: '2026-10', tokenInvalido: true, fila: 37 });
  for (const a of l) assert.ok(!/[A-Z]{3}\d[A-Z0-9]\d{2}/.test(a.texto + a.assunto));
});

console.log(`\n${passou} casos passaram`);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node test/apiplacas-avisos.test.js` — Expected: `Cannot find module`

- [ ] **Step 3: Implementar os avisos**

`lib/apiplacas-avisos.js`:

```js
/**
 * Decide quais e-mails de aviso da APIPLACAS mandar. Função pura: quem envia
 * e grava `avisos_enviados` é o cron.
 *
 * Teto: chave por mês (`teto80:AAAA-MM`). Saldo e token: chave única, limpa
 * quando o saldo volta acima do mínimo (recarga). Nenhum texto cita placa.
 */
const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function avisosPendentes({ cfg, gasto, saldo, mes, tokenInvalido = false, fila = 0 }) {
  const enviados = cfg.avisos_enviados || {};
  const teto = Number(cfg.teto_mensal);
  const lista = [];
  const add = (chave, assunto, texto) => { if (!enviados[chave]) lista.push({ chave, assunto, texto }); };

  if (teto > 0 && gasto >= teto * (cfg.aviso_percentual / 100)) {
    add(`teto80:${mes}`, `APIPLACAS: ${cfg.aviso_percentual}% do teto do mês`,
      `As consultas de placa do mês chegaram a ${brl(gasto)} de um teto de ${brl(teto)}.`);
  }
  if (teto > 0 && gasto >= teto) {
    add(`teto100:${mes}`, 'APIPLACAS: teto do mês atingido — consultas pausadas',
      `O gasto chegou a ${brl(gasto)}. As consultas estão pausadas e ${fila} placa(s) aguardam na fila. ` +
      'Para liberar, aumente o teto em Admin → Consulta de placas, ou aguarde a virada do mês.');
  }
  if (saldo !== null && saldo !== undefined) {
    if (saldo < cfg.saldo_minimo) {
      add('saldo_baixo', 'APIPLACAS: saldo do pacote baixo',
        `Restam ${saldo} consultas no pacote (mínimo configurado: ${cfg.saldo_minimo}). Compre mais consultas na APIPLACAS.`);
    }
    if (saldo <= 0) {
      add('saldo_zerado', 'APIPLACAS: saldo zerado — consultas na fila',
        `O pacote acabou. ${fila} placa(s) aguardam na fila e serão consultadas sozinhas após a recarga.`);
    }
  }
  if (tokenInvalido) {
    add('token_invalido', 'APIPLACAS: token inválido — consultas desligadas',
      'A APIPLACAS recusou o token (HTTP 402). As consultas foram desligadas. ' +
      'Confira APIPLACAS_TOKEN no Vercel e religue em Admin → Consulta de placas.');
  }
  return lista;
}

function chavesLimpas({ cfg, saldo }) {
  const enviados = { ...(cfg.avisos_enviados || {}) };
  if (saldo !== null && saldo !== undefined && saldo >= cfg.saldo_minimo) {
    delete enviados.saldo_baixo;
    delete enviados.saldo_zerado;
  }
  if (cfg.ativo) delete enviados.token_invalido;
  return enviados;
}

module.exports = { avisosPendentes, chavesLimpas };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node test/apiplacas-avisos.test.js` — Expected: `9 casos passaram`

- [ ] **Step 5: Teste da fila (acrescentar ao fim de `test/veiculos-base.test.js`, antes do `console.log` final)**

```js
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
```

Run: `node test/veiculos-base.test.js` — Expected: FAIL `vb.processarFila is not a function`.

- [ ] **Step 6: Implementar `processarFila` em `lib/veiculos-base.js`**

Dentro de `criarVeiculosBase`, antes do `return`:

```js
  async function processarFila({ limite = 50 } = {}) {
    const lote = await repo.fila(limite, agora().toISOString());
    let consultadas = 0;
    for (const linha of lote) {
      const r = await consultarAgora(linha.placa, 'repescagem');
      if (!r.executou) return { consultadas, parou: r.motivo };
      consultadas++;
      if (['token_invalido', 'limite'].includes(r.linha.ultimo_erro)) {
        return { consultadas, parou: r.linha.ultimo_erro };
      }
    }
    return { consultadas, parou: null };
  }
```

E trocar o `return` por `return { aoPassar, consultarAgora, processarFila, travas, aplicarResultado };`.

Run: `node test/veiculos-base.test.js` — Expected: `16 casos passaram`

- [ ] **Step 7: `enviarEmailSimples` em `lib/email-sender.js`**

Antes do `module.exports`:

```js
/**
 * E-mail de texto simples para avisos internos (APIPLACAS). Lança em falha.
 */
async function enviarEmailSimples({ destinatarios, assunto, texto }) {
  const lista = (destinatarios || []).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)).slice(0, 10);
  if (!lista.length) return;
  const fromEmail = process.env.SMTP_USER || process.env.GMAIL_USER;
  await transporter.sendMail({
    from: `"Protector Lombada" <${fromEmail}>`,
    to: lista.join(', '),
    subject: String(assunto).slice(0, 200),
    text: String(texto).slice(0, 4000),
  });
}
```

E `module.exports = { enviarAlerta, getDestinatarios, enviarEmailSimples };`

- [ ] **Step 8: Cron `api/cron-apiplacas.js`**

```js
/**
 * CRON DA APIPLACAS — a cada 5 min (vercel.json).
 *
 * 1. Lê o saldo (não consome) e guarda em apiplacas_config.
 * 2. Consulta a fila (pendente/erro vencidos), respeitando teto e saldo.
 * 3. Manda os avisos por e-mail (1x por período) e grava avisos_enviados.
 * 4. Retenção: apaga veículos sem passagem há 6 meses.
 *
 * Auth: header do Vercel Cron ou Bearer CRON_SECRET (igual aos outros crons).
 */
const { criarClienteApiplacas } = require('../lib/apiplacas');
const { criarRepoSupabase } = require('../lib/veiculos-base-repo');
const { criarValidador } = require('../lib/validador-placa');
const { criarVeiculosBase } = require('../lib/veiculos-base');
const { avisosPendentes, chavesLimpas } = require('../lib/apiplacas-avisos');
const { enviarEmailSimples } = require('../lib/email-sender');
const { supabase } = require('../lib/supabase');

const RETENCAO_MESES = 6;

function mesSP(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' })
    .format(d).slice(0, 7);
}

module.exports = async function handler(req, res) {
  const vercelCronHeader = req.headers['x-vercel-cron'];
  if (!vercelCronHeader && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  const repo = criarRepoSupabase();
  const resumo = { saldo: null, fila: null, avisos: [], apagados: 0 };
  try {
    let api = null;
    try { api = criarClienteApiplacas({ token: process.env.APIPLACAS_TOKEN }); } catch { /* sem token: só avisos/retenção */ }

    if (api) {
      resumo.saldo = await api.saldo();
      if (resumo.saldo !== null) await repo.atualizarConfig({ saldo_atual: resumo.saldo, saldo_em: new Date().toISOString() });
      const vb = criarVeiculosBase({ repo, api, validador: criarValidador({ contarPassagens: repo.contarPassagens }) });
      resumo.fila = await vb.processarFila({ limite: 50 });
    }

    const cfg = await repo.lerConfig();
    const gasto = await repo.gastoDoMes();
    const fila = await repo.tamanhoFila();
    const enviados = chavesLimpas({ cfg, saldo: cfg.saldo_atual });
    const tokenInvalido = !cfg.ativo && resumo.fila?.parou === 'token_invalido';
    const avisos = avisosPendentes({ cfg: { ...cfg, avisos_enviados: enviados }, gasto, saldo: cfg.saldo_atual, mes: mesSP(), tokenInvalido, fila });
    for (const a of avisos) {
      await enviarEmailSimples({ destinatarios: cfg.emails_aviso, assunto: a.assunto, texto: a.texto });
      enviados[a.chave] = new Date().toISOString();
      resumo.avisos.push(a.chave);
    }
    await repo.atualizarConfig({ avisos_enviados: enviados });

    const limite = new Date();
    limite.setMonth(limite.getMonth() - RETENCAO_MESES);
    resumo.apagados = await repo.apagarVistosAntesDe(limite.toISOString());

    return res.status(200).json({ ok: true, ...resumo });
  } catch (err) {
    await supabase.from('debug_log').insert({
      content_type: 'cron-apiplacas-error',
      raw_body: String(err.message).slice(0, 500),
    });
    return res.status(500).json({ ok: false });
  }
};
```

> Confira em `api/cron-monitor-cameras.js` (linhas ~65–75) o nome exato do header do Vercel Cron usado no projeto e use o mesmo. Confira as colunas de `debug_log` com `select column_name from information_schema.columns where table_name='debug_log'` e ajuste o insert (o projeto usa `content_type` e `raw_body`).

- [ ] **Step 9: `vercel.json`**

Em `routes`, junto dos outros crons:
```json
    { "src": "/api/cron-apiplacas", "dest": "/api/cron-apiplacas.js" },
```
Em `crons`:
```json
    { "path": "/api/cron-apiplacas", "schedule": "*/5 * * * *" }
```

- [ ] **Step 10: Incluir avisos no `npm test`, rodar tudo e commit**

Run: `npm test` — Expected: todos passam.

```bash
git add lib/apiplacas-avisos.js lib/veiculos-base.js lib/email-sender.js api/cron-apiplacas.js vercel.json test/apiplacas-avisos.test.js test/veiculos-base.test.js package.json
git commit -m "feat(apiplacas): repescagem a cada 5 min, avisos por e-mail e retenção de 6 meses"
```

---

### Task 7: Captura e PDF

**Files:**
- Modify: `api/captura.js` (`processarAposResposta`, entre a etapa 2 e a 3)
- Modify: `lib/pdf-generator.js:39` (assinatura) e após a tabela 1 (~linha 143)
- Test: `test/pdf-veiculo.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `criarVeiculosBase`, `criarRepoSupabase`, `criarClienteApiplacas`, `criarValidador`.
- Produces: `gerarPDF({ …, veiculoBase })` — `veiculoBase` opcional, linha da base; `linhaVeiculo(veiculoBase): string|null` exportada de `lib/pdf-generator.js`.

- [ ] **Step 1: Teste da linha do PDF**

`test/pdf-veiculo.test.js`:

```js
/**
 * Linha "Veículo: …" da notificação. Uso: node test/pdf-veiculo.test.js
 */
const assert = require('node:assert');
const { linhaVeiculo } = require('../lib/pdf-generator');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

caso('monta marca, modelo, versão, cor e ano', () => {
  assert.strictEqual(
    linhaVeiculo({ status: 'consultado', marca: 'JEEP', modelo: 'COMMANDER', versao: 'OVR T270', cor: 'Dourada', ano_modelo: 2022 }),
    'Veículo: JEEP COMMANDER OVR T270 · Dourada · 2022');
});

caso('sem versão nem ano omite as partes', () => {
  assert.strictEqual(linhaVeiculo({ status: 'consultado', marca: 'VW', modelo: 'GOL', cor: 'Branca' }), 'Veículo: VW GOL · Branca');
});

caso('versão que repete o modelo não duplica', () => {
  assert.strictEqual(linhaVeiculo({ status: 'consultado', marca: 'VW', modelo: 'CROSSFOX', versao: 'CROSSFOX', cor: 'Prata', ano_modelo: 2008 }),
    'Veículo: VW CROSSFOX · Prata · 2008');
});

caso('sem dado consultado não há linha', () => {
  assert.strictEqual(linhaVeiculo(null), null);
  assert.strictEqual(linhaVeiculo({ status: 'pendente' }), null);
  assert.strictEqual(linhaVeiculo({ status: 'suspeita', marca: 'X' }), null);
});

console.log(`\n${passou} casos passaram`);
```

Run: `node test/pdf-veiculo.test.js` — Expected: FAIL `linhaVeiculo is not a function`.

- [ ] **Step 2: Implementar no PDF**

Em `lib/pdf-generator.js`, antes de `gerarPDF`:

```js
/** Linha "Veículo: …" com dado da APIPLACAS; null sem dado consultado. */
function linhaVeiculo(vb) {
  if (!vb || vb.status !== 'consultado' || !vb.marca) return null;
  const nome = [vb.marca, vb.modelo, vb.versao && vb.versao !== vb.modelo ? vb.versao : null]
    .filter(Boolean).join(' ');
  return 'Veículo: ' + [nome, vb.cor, vb.ano_modelo].filter(Boolean).join(' · ');
}
```

Na assinatura: `async function gerarPDF({ cliente, captura, veiculo, veiculoBase, fotoBuffer, historico, cameraNome, camera })`.

Logo depois de `doc.y = y1v + 25;` (fim da tabela 1) e **antes** do `drawLine(doc);` seguinte:

```js
      const textoVeiculo = linhaVeiculo(veiculoBase);
      if (textoVeiculo) {
        doc.fontSize(9).font(FONT_REGULAR).fillColor('#333333');
        doc.text(textoVeiculo, 40, doc.y - 6, { width: pageWidth, align: 'center' });
        doc.y += 6;
      }
```

E `module.exports = { gerarPDF, linhaVeiculo };`

Run: `node test/pdf-veiculo.test.js` — Expected: `4 casos passaram`.

- [ ] **Step 3: Chamar o orquestrador na captura**

Em `api/captura.js`, nos `require` do topo:

```js
const { criarClienteApiplacas } = require('../lib/apiplacas');
const { criarRepoSupabase } = require('../lib/veiculos-base-repo');
const { criarValidador } = require('../lib/validador-placa');
const { criarVeiculosBase } = require('../lib/veiculos-base');
```

Depois dos `require`, no escopo do módulo:

```js
// Base de veículos (APIPLACAS). Sem token configurado, a captura segue sem
// consultar — nunca quebra por isso.
let veiculosBase = null;
try {
  const repoVB = criarRepoSupabase();
  veiculosBase = criarVeiculosBase({
    repo: repoVB,
    api: criarClienteApiplacas({ token: process.env.APIPLACAS_TOKEN }),
    validador: criarValidador({ contarPassagens: repoVB.contarPassagens }),
  });
} catch { /* APIPLACAS_TOKEN ausente */ }
```

Em `processarAposResposta`, entre o bloco "2. Telemetria" e "3. Notificação":

```js
  // 2b. Base de veículos (APIPLACAS). Antes da notificação para o PDF já sair
  //     com modelo e cor. aoPassar() nunca lança e tem timeout de 3 s.
  const veiculoBase = veiculosBase ? await veiculosBase.aoPassar({ placa, clienteId: cliente.id }) : null;
```

E no `gerarPDF({ … })` da etapa 3, acrescentar `veiculoBase,`.

- [ ] **Step 4: Verificação de sintaxe e testes**

Run: `node --check api/captura.js && node --check api/cron-apiplacas.js && npm test`
Expected: sem erro; todos os testes passam (incluir `node test/pdf-veiculo.test.js` no script `test`).

- [ ] **Step 5: Commit**

```bash
git add api/captura.js lib/pdf-generator.js test/pdf-veiculo.test.js package.json
git commit -m "feat(captura): consulta a base de veículos antes da notificação e mostra o modelo no PDF"
```

---

### Task 8: API do admin (config, resumo, extrato, reconsulta, validação)

**Files:**
- Create: `lib/apiplacas-config.js`
- Create: `api/admin/apiplacas.js`
- Modify: `vercel.json`
- Test: `test/apiplacas-config.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `validarConfig(body): { config: object, erros: string[] }` — só os campos editáveis
  - `GET /api/admin/apiplacas` → `{ config, gasto, fila, suspeitas, consultasMes }` (super_admin)
  - `GET /api/admin/apiplacas?extrato=1&pagina=N` → `{ itens, total }` (50 por página)
  - `PUT /api/admin/apiplacas` (body = campos editáveis) → `{ config }`
  - `POST /api/admin/apiplacas` `{ acao: 'reconsultar', placa }` → `{ linha }`
  - `POST /api/admin/apiplacas` `{ acao: 'validar_hoje' }` → `{ placas, consultadas, parou }`

- [ ] **Step 1: Teste da validação da config**

`test/apiplacas-config.test.js`:

```js
/**
 * Validação da config editada no admin. Uso: node test/apiplacas-config.test.js
 */
const assert = require('node:assert');
const { validarConfig } = require('../lib/apiplacas-config');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

caso('aceita config válida e normaliza e-mails', () => {
  const r = validarConfig({ ativo: true, preco_consulta: '0,03', teto_mensal: 150, aviso_percentual: 80, saldo_minimo: 200,
    emails_aviso: [' Glauber@Appps.com.br ', 'suporte@appps.com.br', 'suporte@appps.com.br'] });
  assert.deepStrictEqual(r.erros, []);
  assert.strictEqual(r.config.preco_consulta, 0.03);
  assert.deepStrictEqual(r.config.emails_aviso, ['glauber@appps.com.br', 'suporte@appps.com.br']);
});

caso('rejeita e-mail inválido, lista vazia e mais de 10', () => {
  assert.ok(validarConfig({ emails_aviso: ['x@'] }).erros.includes('emails_aviso'));
  assert.ok(validarConfig({ emails_aviso: [] }).erros.includes('emails_aviso'));
  assert.ok(validarConfig({ emails_aviso: Array.from({ length: 11 }, (_, i) => `a${i}@x.com`) }).erros.includes('emails_aviso'));
});

caso('rejeita números fora da faixa', () => {
  const r = validarConfig({ teto_mensal: -1, aviso_percentual: 0, saldo_minimo: -5, preco_consulta: 'abc' });
  assert.deepStrictEqual(r.erros.sort(), ['aviso_percentual', 'preco_consulta', 'saldo_minimo', 'teto_mensal']);
});

caso('ignora campos não editáveis', () => {
  const r = validarConfig({ teto_mensal: 100, saldo_atual: 999999, avisos_enviados: { x: 1 }, id: 7 });
  assert.deepStrictEqual(Object.keys(r.config), ['teto_mensal']);
});

console.log(`\n${passou} casos passaram`);
```

Run: `node test/apiplacas-config.test.js` — Expected: FAIL (módulo inexistente).

- [ ] **Step 2: Implementar**

`lib/apiplacas-config.js`:

```js
/**
 * Valida a config da APIPLACAS editada no admin. Só campos editáveis passam;
 * saldo, avisos enviados e id são do sistema.
 */
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function numero(v) {
  if (typeof v === 'string') v = v.replace(',', '.');
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

const REGRAS = {
  preco_consulta: (v) => { const n = numero(v); return n >= 0 && n <= 10 ? n : undefined; },
  teto_mensal: (v) => { const n = numero(v); return n >= 0 && n <= 100000 ? Math.round(n * 100) / 100 : undefined; },
  aviso_percentual: (v) => { const n = numero(v); return Number.isInteger(n) && n >= 1 && n <= 100 ? n : undefined; },
  saldo_minimo: (v) => { const n = numero(v); return Number.isInteger(n) && n >= 0 ? n : undefined; },
  ativo: (v) => (typeof v === 'boolean' ? v : undefined),
  emails_aviso: (v) => {
    if (!Array.isArray(v)) return undefined;
    const lista = [...new Set(v.map((e) => String(e).trim().toLowerCase()).filter(Boolean))];
    return lista.length >= 1 && lista.length <= 10 && lista.every((e) => RE_EMAIL.test(e)) ? lista : undefined;
  },
};

function validarConfig(body) {
  const src = body || {};
  const config = {};
  const erros = [];
  for (const [campo, regra] of Object.entries(REGRAS)) {
    if (!(campo in src)) continue;
    const v = regra(src[campo]);
    if (v === undefined || Number.isNaN(v)) erros.push(campo);
    else config[campo] = v;
  }
  return { config, erros };
}

module.exports = { validarConfig };
```

Run: `node test/apiplacas-config.test.js` — Expected: `4 casos passaram`.

- [ ] **Step 3: Endpoint `api/admin/apiplacas.js`**

```js
/**
 * Admin da APIPLACAS (super_admin): config, resumo do mês, extrato,
 * reconsulta paga de uma placa e "validar placas de hoje".
 */
const { autenticar, registrarAuditoria, supabase } = require('../../lib/auth-middleware');
const { validarConfig } = require('../../lib/apiplacas-config');
const { criarRepoSupabase } = require('../../lib/veiculos-base-repo');
const { criarClienteApiplacas } = require('../../lib/apiplacas');
const { criarValidador } = require('../../lib/validador-placa');
const { criarVeiculosBase } = require('../../lib/veiculos-base');
const { paraMercosul, paraAntiga } = require('../../site/js/placa');

const POR_PAGINA = 50;

function ok({ data, error, count }) {
  if (error) throw new Error(error.message);
  return count !== undefined && count !== null ? { data, count } : data;
}

function inicioDoDiaSP() {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  return new Date(`${d}T00:00:00-03:00`).toISOString();
}

async function lerCorpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const ch of req) raw += ch;
  return raw ? JSON.parse(raw) : {};
}

module.exports = async function handler(req, res) {
  try {
    const { profile } = await autenticar(req, ['super_admin']);
    const repo = criarRepoSupabase();
    const ip = req.headers['x-forwarded-for'] || null;

    if (req.method === 'GET' && req.query.extrato) {
      const pagina = Math.max(0, parseInt(req.query.pagina, 10) || 0);
      const de = pagina * POR_PAGINA;
      const { data, count } = ok(await supabase.from('apiplacas_consultas')
        .select('placa, resultado, http_status, duracao_ms, custo, origem, criado_em', { count: 'exact' })
        .order('criado_em', { ascending: false }).range(de, de + POR_PAGINA - 1));
      return res.status(200).json({ itens: data, total: count });
    }

    if (req.method === 'GET') {
      const desdeMes = new Date(); desdeMes.setDate(1);
      const [config, gasto, fila, suspeitas, consultasMes] = await Promise.all([
        repo.lerConfig(),
        repo.gastoDoMes(),
        repo.tamanhoFila(),
        supabase.from('veiculos_base').select('placa', { count: 'exact', head: true }).eq('status', 'suspeita').then((r) => r.count || 0),
        supabase.from('apiplacas_consultas').select('id', { count: 'exact', head: true })
          .gte('criado_em', desdeMes.toISOString()).then((r) => r.count || 0),
      ]);
      return res.status(200).json({ config, gasto, fila, suspeitas, consultasMes });
    }

    if (req.method === 'PUT') {
      const { config, erros } = validarConfig(await lerCorpo(req));
      if (erros.length) return res.status(400).json({ error: 'Campos inválidos', campos: erros });
      await repo.atualizarConfig({ ...config, atualizado_por: profile.id });
      await registrarAuditoria({ usuarioId: profile.id, acao: 'apiplacas_config', tabela: 'apiplacas_config', registroId: null, detalhes: config, ip });
      return res.status(200).json({ config: await repo.lerConfig() });
    }

    if (req.method === 'POST') {
      const body = await lerCorpo(req);
      const api = criarClienteApiplacas({ token: process.env.APIPLACAS_TOKEN });
      const vb = criarVeiculosBase({ repo, api, validador: criarValidador({ contarPassagens: repo.contarPassagens }) });

      if (body.acao === 'reconsultar') {
        const m = paraMercosul(body.placa);
        if (!m) return res.status(400).json({ error: 'Placa inválida' });
        if (!(await repo.buscar(m))) {
          await repo.reservar({ placa: m, placa_antiga: paraAntiga(m), status: 'pendente', visto_por_ultimo_em: new Date().toISOString() });
        } else {
          await repo.atualizar(m, { status: 'pendente', tentativas: 0, proxima_tentativa_em: null });
        }
        const r = await vb.consultarAgora(m, 'reconsulta');
        await registrarAuditoria({ usuarioId: profile.id, acao: 'apiplacas_reconsulta', tabela: 'veiculos_base', registroId: null, detalhes: { placa: m, executou: r.executou, motivo: r.motivo || null }, ip });
        return res.status(r.executou ? 200 : 409).json(r);
      }

      if (body.acao === 'validar_hoje') {
        const data = ok(await supabase.from('capturas').select('placa').gte('timestamp', inicioDoDiaSP()).limit(20000));
        const placas = [...new Set(data.map((c) => paraMercosul(c.placa)).filter(Boolean))];
        let consultadas = 0;
        let parou = null;
        for (const m of placas) {
          const existe = await repo.buscar(m);
          if (existe && existe.status !== 'pendente' && existe.status !== 'erro') continue;
          if (!existe) await repo.reservar({ placa: m, placa_antiga: paraAntiga(m), status: 'pendente', visto_por_ultimo_em: new Date().toISOString() });
          const r = await vb.consultarAgora(m, 'validacao');
          if (!r.executou) { parou = r.motivo; break; }
          consultadas++;
        }
        await registrarAuditoria({ usuarioId: profile.id, acao: 'apiplacas_validar_hoje', tabela: 'veiculos_base', registroId: null, detalhes: { placas: placas.length, consultadas, parou }, ip });
        return res.status(200).json({ placas: placas.length, consultadas, parou });
      }

      return res.status(400).json({ error: 'Ação desconhecida' });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ error: err.error });
    return res.status(500).json({ error: 'Erro interno' });
  }
};
```

> `validar_hoje` usa o service role e consulta **todos** os clientes de propósito (decisão do dono). Não sai do endpoint nenhuma placa; só contagens.
> `validar_hoje` não passa pelo validador de suspeita: é uma validação manual da integração, pedida pelo dono.

- [ ] **Step 4: Rota no `vercel.json`**

```json
    { "src": "/api/admin/apiplacas", "dest": "/api/admin/apiplacas.js" },
```

- [ ] **Step 5: Testes, sintaxe e commit**

Run: `node --check api/admin/apiplacas.js && npm test` (com `node test/apiplacas-config.test.js` no script).

```bash
git add lib/apiplacas-config.js api/admin/apiplacas.js vercel.json test/apiplacas-config.test.js package.json
git commit -m "feat(admin): API da consulta de placas (config, extrato, reconsulta, validar hoje)"
```

---

### Task 9: API do painel (busca para cadastro e ações da suspeita)

**Files:**
- Create: `api/admin/veiculos-base.js`
- Modify: `vercel.json`

**Interfaces:**
- Produces:
  - `GET /api/admin/veiculos-base?placa=XXX&cliente_id=…` → `{ marca, cor } | {}` — só se a placa passou ou está cadastrada no cliente (senão `{}`; nunca revela que existe em outro)
  - `POST /api/admin/veiculos-base` `{ acao: 'mesma_placa', captura_id }` → `{ placa }` (troca a placa da captura pela `suspeita_de`)
  - `POST /api/admin/veiculos-base` `{ acao: 'outro_carro', placa }` → `{ linha }` (libera e consulta)
  - Papéis: `super_admin`, `admin_cliente`, `operador`; sempre `verificarAcessoCliente`.

- [ ] **Step 1: Implementar**

`api/admin/veiculos-base.js`:

```js
/**
 * Painel → base de veículos.
 * - GET: marca/cor para preencher o cadastro (só placa vista no próprio cliente)
 * - POST mesma_placa: corrige a leitura da captura para a placa frequente
 * - POST outro_carro: libera a suspeita e consulta (pago, respeita travas)
 */
const { autenticar, verificarAcessoCliente, registrarAuditoria, supabase } = require('../../lib/auth-middleware');
const { criarRepoSupabase } = require('../../lib/veiculos-base-repo');
const { criarClienteApiplacas } = require('../../lib/apiplacas');
const { criarValidador } = require('../../lib/validador-placa');
const { criarVeiculosBase } = require('../../lib/veiculos-base');
const { paraMercosul, paraAntiga } = require('../../site/js/placa');

const PAPEIS = ['super_admin', 'admin_cliente', 'operador'];

async function lerCorpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const ch of req) raw += ch;
  return raw ? JSON.parse(raw) : {};
}

async function placaVistaNoCliente(clienteId, m) {
  const grafias = [m, paraAntiga(m)].filter(Boolean);
  const [c, v] = await Promise.all([
    supabase.from('capturas').select('id', { head: true, count: 'exact' }).eq('cliente_id', clienteId).in('placa', grafias),
    supabase.from('veiculos').select('id', { head: true, count: 'exact' }).eq('cliente_id', clienteId).in('placa', grafias),
  ]);
  if (c.error || v.error) throw new Error('falha ao checar escopo');
  return (c.count || 0) + (v.count || 0) > 0;
}

module.exports = async function handler(req, res) {
  try {
    const { profile } = await autenticar(req, PAPEIS);
    const ip = req.headers['x-forwarded-for'] || null;

    if (req.method === 'GET') {
      const clienteId = req.query.cliente_id || profile.cliente_id;
      if (!clienteId || !verificarAcessoCliente(profile, clienteId)) return res.status(403).json({ error: 'Sem acesso' });
      const m = paraMercosul(req.query.placa);
      if (!m || !(await placaVistaNoCliente(clienteId, m))) return res.status(200).json({});
      const { data, error } = await supabase.from('veiculos_base').select('marca, modelo, cor, status').eq('placa', m).maybeSingle();
      if (error) throw error;
      if (!data || data.status !== 'consultado') return res.status(200).json({});
      return res.status(200).json({ marca: [data.marca, data.modelo].filter(Boolean).join(' '), cor: data.cor });
    }

    if (req.method === 'POST') {
      const body = await lerCorpo(req);

      if (body.acao === 'mesma_placa') {
        const { data: cap, error } = await supabase.from('capturas').select('id, cliente_id, placa').eq('id', body.captura_id).maybeSingle();
        if (error) throw error;
        if (!cap || !verificarAcessoCliente(profile, cap.cliente_id)) return res.status(404).json({ error: 'Captura não encontrada' });
        const { data: vb } = await supabase.from('veiculos_base').select('status, suspeita_de').eq('placa', paraMercosul(cap.placa)).maybeSingle();
        if (!vb || vb.status !== 'suspeita' || !vb.suspeita_de) return res.status(409).json({ error: 'Placa não está em suspeita' });
        const upd = await supabase.from('capturas').update({ placa: vb.suspeita_de }).eq('id', cap.id);
        if (upd.error) throw upd.error;
        await registrarAuditoria({ usuarioId: profile.id, acao: 'corrigir_leitura_placa', tabela: 'capturas', registroId: cap.id, detalhes: { de: cap.placa, para: vb.suspeita_de }, ip });
        return res.status(200).json({ placa: vb.suspeita_de });
      }

      if (body.acao === 'outro_carro') {
        const m = paraMercosul(body.placa);
        const clienteId = body.cliente_id || profile.cliente_id;
        if (!m || !clienteId || !verificarAcessoCliente(profile, clienteId)) return res.status(403).json({ error: 'Sem acesso' });
        if (!(await placaVistaNoCliente(clienteId, m))) return res.status(404).json({ error: 'Placa não encontrada' });
        const repo = criarRepoSupabase();
        const linha = await repo.buscar(m);
        if (!linha || linha.status !== 'suspeita') return res.status(409).json({ error: 'Placa não está em suspeita' });
        await repo.atualizar(m, { status: 'pendente', suspeita_de: null, tentativas: 0, proxima_tentativa_em: null });
        const vb = criarVeiculosBase({
          repo,
          api: criarClienteApiplacas({ token: process.env.APIPLACAS_TOKEN }),
          validador: criarValidador({ contarPassagens: repo.contarPassagens }),
        });
        const r = await vb.consultarAgora(m, 'reconsulta');
        await registrarAuditoria({ usuarioId: profile.id, acao: 'liberar_suspeita_placa', tabela: 'veiculos_base', registroId: null, detalhes: { placa: m, executou: r.executou }, ip });
        return res.status(200).json({ linha: r.linha || { placa: m, status: 'pendente' } });
      }

      return res.status(400).json({ error: 'Ação desconhecida' });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ error: err.error });
    return res.status(500).json({ error: 'Erro interno' });
  }
};
```

- [ ] **Step 2: Rota no `vercel.json`**

```json
    { "src": "/api/admin/veiculos-base", "dest": "/api/admin/veiculos-base.js" },
```

- [ ] **Step 3: Sintaxe, testes e commit**

Run: `node --check api/admin/veiculos-base.js && npm test`

```bash
git add api/admin/veiculos-base.js vercel.json
git commit -m "feat(painel): API da base de veículos com escopo por condomínio e correção de leitura"
```

---

### Task 10: Tela "Consulta de placas" no admin

**Files:**
- Modify: `admin/index.html` (menu, página, JS)

**Interfaces:**
- Consumes: `GET/PUT/POST /api/admin/apiplacas` (Task 8); helpers existentes `api()`, `esc()`, `toast()`, `confirmarAcao()`, `erroNaTabela()`, `fmtDateTime()`.

- [ ] **Step 1: Menu e roteamento**

Depois do botão "Direitos LGPD" no `<nav>`:

```html
        <button type="button" class="nav-item" data-page="apiplacas" onclick="showPage('apiplacas')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="10" rx="2"/><line x1="6" y1="12" x2="18" y2="12"/></svg>
          Consulta de placas
        </button>
```

Em `const PAGINAS = [...]` acrescentar `'apiplacas'`. Em `showPage`, acrescentar `if (page === 'apiplacas') loadApiplacas();`.

- [ ] **Step 2: HTML da página** (depois da página de Direitos)

```html
        <!-- PAGE: Consulta de placas (APIPLACAS) -->
        <div class="page" id="page-apiplacas">
          <div class="page-title" tabindex="-1">Consulta de placas</div>
          <div class="ap-resumo" id="ap-resumo" aria-live="polite">Carregando…</div>

          <form class="ap-config" id="ap-config" onsubmit="salvarApiplacas(event)" novalidate>
            <label class="ap-switch"><input type="checkbox" id="ap-ativo"> Consultas ligadas</label>
            <div class="form-group"><label for="ap-teto">Teto mensal (R$)</label><input id="ap-teto" inputmode="decimal"><div class="field-error" data-for="ap-teto"></div></div>
            <div class="form-group"><label for="ap-aviso">Avisar em (% do teto)</label><input id="ap-aviso" inputmode="numeric"><div class="field-error" data-for="ap-aviso"></div></div>
            <div class="form-group"><label for="ap-saldo-min">Avisar com saldo abaixo de (consultas)</label><input id="ap-saldo-min" inputmode="numeric"><div class="field-error" data-for="ap-saldo-min"></div></div>
            <div class="form-group"><label for="ap-preco">Preço por consulta (R$)</label><input id="ap-preco" inputmode="decimal"><div class="field-error" data-for="ap-preco"></div></div>
            <fieldset class="form-group">
              <legend>E-mails dos avisos</legend>
              <ul id="ap-emails" class="ap-emails"></ul>
              <div class="ap-email-add"><input type="email" id="ap-email-novo" placeholder="novo@empresa.com.br" aria-label="Novo e-mail"><button type="button" class="btn btn-ghost btn-sm" onclick="adicionarEmailAviso()">Adicionar</button></div>
              <div class="field-error" data-for="ap-emails"></div>
            </fieldset>
            <div class="ap-acoes">
              <button type="submit" class="btn btn-primary">Salvar</button>
              <button type="button" class="btn btn-ghost" onclick="validarPlacasHoje()">Validar placas de hoje</button>
            </div>
          </form>

          <div class="ap-reconsulta">
            <label for="ap-placa">Consultar de novo (pago)</label>
            <input id="ap-placa" maxlength="8" placeholder="ABC1D23"><button type="button" class="btn btn-ghost btn-sm" onclick="reconsultarPlaca()">Consultar</button>
          </div>

          <table class="data-table"><thead><tr><th>Data/Hora</th><th>Placa</th><th>Resultado</th><th>Origem</th><th>Tempo</th><th>Custo</th></tr></thead>
            <tbody id="ap-extrato"><tr><td colspan="6" class="table-empty">Carregando…</td></tr></tbody>
          </table>
          <nav class="pager" id="ap-pager" aria-label="Páginas do extrato" hidden></nav>
        </div>
```

CSS (junto do `.pager`):

```css
    .ap-resumo { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 20px; }
    .ap-kpi { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; }
    .ap-kpi .n { font-size: 1.375rem; font-weight: 700; font-variant-numeric: tabular-nums; }
    .ap-kpi .l { font-size: 0.75rem; color: var(--text-secondary); }
    .ap-barra { height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; margin-top: 8px; }
    .ap-barra > div { height: 100%; transform-origin: left; background: var(--accent); }
    .ap-config { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px 16px; margin-bottom: 20px; }
    .ap-config fieldset, .ap-acoes { grid-column: 1 / -1; }
    .ap-emails { list-style: none; display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; padding: 0; }
    .ap-emails li { display: flex; align-items: center; gap: 6px; border: 1px solid var(--border); border-radius: 999px; padding: 2px 4px 2px 10px; font-size: 0.8125rem; }
    .ap-email-add, .ap-reconsulta, .ap-acoes { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .ap-reconsulta { margin-bottom: 16px; }
```

- [ ] **Step 3: JS** (antes da seção "DIREITOS LGPD")

```js
// ============================================
// CONSULTA DE PLACAS (APIPLACAS)
// ============================================
const AP_POR_PAGINA = 50;
let apEmails = [];
const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function loadApiplacas() {
  try {
    const r = await api('/admin/apiplacas');
    const c = r.config;
    const pct = c.teto_mensal > 0 ? Math.min(1, r.gasto / c.teto_mensal) : 0;
    document.getElementById('ap-resumo').innerHTML = `
      <div class="ap-kpi"><div class="n">${brl(r.gasto)}</div><div class="l">gasto no mês · teto ${brl(c.teto_mensal)}</div>
        <div class="ap-barra"><div style="transform:scaleX(${pct.toFixed(3)});${pct >= 1 ? 'background:var(--red)' : ''}"></div></div></div>
      <div class="ap-kpi"><div class="n">${r.consultasMes}</div><div class="l">consultas no mês</div></div>
      <div class="ap-kpi"><div class="n">${c.saldo_atual ?? '—'}</div><div class="l">saldo do pacote${c.saldo_em ? ' · ' + fmtDateTime(c.saldo_em) : ''}</div></div>
      <div class="ap-kpi"><div class="n">${r.fila}</div><div class="l">placas na fila</div></div>
      <div class="ap-kpi"><div class="n">${r.suspeitas}</div><div class="l">barradas pelo validador</div></div>
      <div class="ap-kpi"><div class="n">${c.ativo ? 'Ligadas' : 'Desligadas'}</div><div class="l">consultas</div></div>`;
    document.getElementById('ap-ativo').checked = !!c.ativo;
    document.getElementById('ap-teto').value = String(c.teto_mensal).replace('.', ',');
    document.getElementById('ap-aviso').value = c.aviso_percentual;
    document.getElementById('ap-saldo-min').value = c.saldo_minimo;
    document.getElementById('ap-preco').value = String(c.preco_consulta).replace('.', ',');
    apEmails = [...c.emails_aviso];
    renderEmailsAviso();
    loadExtratoApiplacas(0);
  } catch (err) { console.error(err); erroNoBloco('ap-resumo', 'loadApiplacas()'); }
}

function renderEmailsAviso() {
  document.getElementById('ap-emails').innerHTML = apEmails.map((e, i) => `
    <li>${esc(e)} <button type="button" class="btn btn-ghost btn-sm" aria-label="Remover ${esc(e)}" onclick="removerEmailAviso(${i})">×</button></li>`).join('');
}
function adicionarEmailAviso() {
  const input = document.getElementById('ap-email-novo');
  const e = input.value.trim().toLowerCase();
  limparErrosCampo();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return mostrarErroCampo('ap-emails', 'E-mail inválido');
  if (apEmails.includes(e)) return mostrarErroCampo('ap-emails', 'E-mail já está na lista');
  if (apEmails.length >= 10) return mostrarErroCampo('ap-emails', 'Máximo de 10 e-mails');
  apEmails = [...apEmails, e];
  input.value = '';
  renderEmailsAviso();
}
function removerEmailAviso(i) {
  if (apEmails.length <= 1) return mostrarErroCampo('ap-emails', 'Mantenha ao menos um e-mail');
  apEmails = apEmails.filter((_, j) => j !== i);
  renderEmailsAviso();
}

async function salvarApiplacas(ev) {
  ev.preventDefault();
  limparErrosCampo();
  const body = {
    ativo: document.getElementById('ap-ativo').checked,
    teto_mensal: document.getElementById('ap-teto').value,
    aviso_percentual: Number(document.getElementById('ap-aviso').value),
    saldo_minimo: Number(document.getElementById('ap-saldo-min').value),
    preco_consulta: document.getElementById('ap-preco').value,
    emails_aviso: apEmails,
  };
  const CAMPO = { teto_mensal: 'ap-teto', aviso_percentual: 'ap-aviso', saldo_minimo: 'ap-saldo-min', preco_consulta: 'ap-preco', emails_aviso: 'ap-emails' };
  try {
    await api('/admin/apiplacas', 'PUT', body);
    toast('Configuração salva');
    loadApiplacas();
  } catch (err) {
    (err.campos || []).forEach((c) => mostrarErroCampo(CAMPO[c], 'Valor inválido'));
    focarPrimeiroErro();
    toast(err.message, true);
  }
}

async function validarPlacasHoje() {
  const ok = await confirmarAcao({
    titulo: 'Validar placas de hoje?',
    mensagem: 'Consulta na APIPLACAS as placas distintas lidas hoje em <strong>todos os condomínios</strong> que ainda não estão na base. Cada uma custa uma consulta do pacote.',
    textoOk: 'Consultar', textoCancel: 'Cancelar',
  });
  if (!ok) return;
  try {
    const r = await api('/admin/apiplacas', 'POST', { acao: 'validar_hoje' });
    toast(`${r.consultadas} de ${r.placas} placas consultadas${r.parou ? ' · parou: ' + r.parou : ''}`);
    loadApiplacas();
  } catch (err) { toast(err.message, true); }
}

async function reconsultarPlaca() {
  const placa = document.getElementById('ap-placa').value.trim().toUpperCase();
  const ok = await confirmarAcao({
    titulo: `Consultar ${esc(placa)} de novo?`,
    mensagem: 'A consulta é paga e substitui os dados guardados desta placa.',
    textoOk: 'Consultar', textoCancel: 'Cancelar',
  });
  if (!ok) return;
  try {
    const r = await api('/admin/apiplacas', 'POST', { acao: 'reconsultar', placa });
    toast(`Consulta: ${r.linha?.status || r.motivo}`);
    loadApiplacas();
  } catch (err) { toast(err.message, true); }
}

async function loadExtratoApiplacas(pagina = 0) {
  try {
    const r = await api(`/admin/apiplacas?extrato=1&pagina=${pagina}`);
    const tbody = document.getElementById('ap-extrato');
    tbody.innerHTML = r.itens.length ? r.itens.map((c) => `<tr>
      <td>${fmtDateTime(c.criado_em)}</td><td><strong>${esc(c.placa)}</strong></td><td>${esc(c.resultado)}</td>
      <td>${esc(c.origem)}</td><td>${c.duracao_ms ?? '—'} ms</td><td>${brl(c.custo)}</td></tr>`).join('')
      : '<tr><td colspan="6" class="table-empty">Nenhuma consulta</td></tr>';
    const pager = document.getElementById('ap-pager');
    const paginas = Math.max(1, Math.ceil(r.total / AP_POR_PAGINA));
    pager.hidden = paginas <= 1;
    pager.innerHTML = pager.hidden ? '' : `
      <button type="button" class="btn btn-ghost btn-sm" onclick="loadExtratoApiplacas(${pagina - 1})" ${pagina === 0 ? 'disabled' : ''}>‹ Anterior</button>
      <span class="pager-info" aria-live="polite">Página ${pagina + 1} de ${paginas} · ${r.total.toLocaleString('pt-BR')} consultas</span>
      <button type="button" class="btn btn-ghost btn-sm" onclick="loadExtratoApiplacas(${pagina + 1})" ${pagina >= paginas - 1 ? 'disabled' : ''}>Próxima ›</button>`;
  } catch (err) { console.error(err); erroNaTabela('ap-extrato', 6, `loadExtratoApiplacas(${pagina})`); }
}
```

> Confira se o helper `api()` do admin propaga `campos` do corpo de erro 400 em `err.campos`; se não propagar, ajuste-o para anexar `err.campos = json.campos` (mudança de 1 linha no `api()` existente, linha ~1263).

- [ ] **Step 4: Verificar no navegador local**

Servir `admin/` com um servidor estático local (como na sessão do PR #53: `tmp/serve/` com symlinks `admin.html → ../../admin/index.html` e `js → ../../site/js`). Chamar `showPage('apiplacas')` e preencher o resumo com dados falsos via console (`loadApiplacas` com `api` substituído). Conferir: e-mail inválido mostra erro no campo; remover o último e-mail é bloqueado; barra fica vermelha com gasto ≥ teto; tema claro e escuro; largura 375 px sem rolagem horizontal.

- [ ] **Step 5: Commit**

```bash
git add admin/index.html
git commit -m "feat(admin): tela Consulta de placas com teto, avisos, e-mails e extrato"
```

---

### Task 11: Painel do síndico — selos, quadro "Veículo", cadastro inline, suspeita e escape

**Files:**
- Create: `site/js/texto-seguro.js`
- Test: `test/texto-seguro.test.js`
- Modify: `dashboard/index.html` (`<script>` no fim do `<head>`/corpo, `loadVeiculosCache` ~3030, `loadRecentCards` ~3150, tabela ~3382, `openModal` ~4187)
- Modify: `package.json`

**Interfaces:**
- Consumes: tabela `veiculos_base` via RLS (Task 1); `GET/POST /api/admin/veiculos-base` (Task 9); `POST /api/admin/veiculos` existente; `placaLib` (Task 2).
- Produces: `esc(s)` global (`window.textoSeguro.esc`); `veiculosBaseCache: Record<placaMercosul, Linha>`; `seloVeiculo(placa): string`.

- [ ] **Step 1: Teste do escape**

`test/texto-seguro.test.js`:

```js
/**
 * Escape de HTML do painel. Uso: node test/texto-seguro.test.js
 */
const assert = require('node:assert');
const { esc } = require('../site/js/texto-seguro');

let passou = 0;
function caso(nome, fn) { fn(); passou++; console.log(`ok - ${nome}`); }

caso('neutraliza tags e atributos', () => {
  assert.strictEqual(esc('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
caso('aspas simples também (usadas em onclick)', () => {
  assert.strictEqual(esc("O'Neil"), 'O&#39;Neil');
});
caso('null, undefined e números', () => {
  assert.strictEqual(esc(null), '');
  assert.strictEqual(esc(undefined), '');
  assert.strictEqual(esc(0), '0');
});

console.log(`\n${passou} casos passaram`);
```

Run: `node test/texto-seguro.test.js` — Expected: FAIL.

- [ ] **Step 2: Implementar**

`site/js/texto-seguro.js`:

```js
/**
 * texto-seguro.js — escape de HTML para texto vindo do banco no painel.
 * Nome de morador, unidade, marca e cor são digitados por usuários: sem
 * escape, viram XSS armazenado no navegador de quem abre a passagem.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.textoSeguro = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MAPA = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, (c) => MAPA[c]);
  }
  return { esc };
});
```

Run: `node test/texto-seguro.test.js` — Expected: `3 casos passaram`. Incluir no `npm test`.

- [ ] **Step 3: Carregar os scripts no painel**

Junto de `<script src="/js/grafico-acessivel.js"></script>`:

```html
  <script src="/js/placa.js"></script>
  <script src="/js/texto-seguro.js"></script>
```

E no início do bloco `<script>` principal: `const esc = textoSeguro.esc;`

- [ ] **Step 4: Escapar o que já existe**

Trocar interpolações de dado de usuário por `esc(...)`:
- `loadRecentCards`: `${morador || radarNome || …}` → `${esc(morador || radarNome) || '<span style="color:var(--text-muted)">N/C</span>'}`; `${c.placa}` → `${esc(c.placa)}`.
- Tabela (~3382) e export: todo `veiculo.nome_morador`, `veiculo.unidade`, `veiculo.marca`, `veiculo.cor`, `c.placa` em HTML → `esc(...)`.
- `openModal`: `${captura.placa}`, `${veiculo.nome_morador || '---'}`, `${veiculo.unidade || '---'}`, `${veiculo.marca || '---'} ${veiculo.cor || ''}` → com `esc(...)`.

Verificar: `grep -n "veiculo\.\(nome_morador\|unidade\|marca\|cor\)" dashboard/index.html` — cada ocorrência dentro de template HTML está dentro de `esc(`.

- [ ] **Step 5: Cache da base e selo**

Depois de `loadVeiculosCache`:

```js
    // Base de veículos (APIPLACAS). A RLS só devolve placas que passaram neste
    // condomínio. Chave Mercosul: a passagem pode estar gravada na grafia antiga.
    let veiculosBaseCache = {};
    async function loadVeiculosBase(placas) {
      const chaves = [...new Set(placas.map((p) => placaLib.paraMercosul(p)).filter(Boolean))]
        .filter((m) => !veiculosBaseCache[m] || veiculosBaseCache[m].status === 'pendente');
      if (!chaves.length) return;
      const { data, error } = await sb.from('veiculos_base')
        .select('placa, status, suspeita_de, marca, modelo, versao, cor, ano_modelo, municipio, uf, tipo_veiculo, situacao, consultado_em')
        .in('placa', chaves);
      if (error) return; // painel segue sem o selo
      data.forEach((v) => { veiculosBaseCache[v.placa] = v; });
    }

    function veiculoBaseDe(placa) {
      return veiculosBaseCache[placaLib.paraMercosul(placa)] || null;
    }

    function seloVeiculo(placa) {
      const v = veiculoBaseDe(placa);
      if (!v) return '';
      if (v.status === 'pendente' || v.status === 'erro') return '<span class="vb-selo">consultando…</span>';
      if (v.status === 'suspeita') return '<span class="vb-selo vb-alerta">verificar leitura</span>';
      if (v.status !== 'consultado') return '';
      return `<span class="vb-selo">${esc([v.marca, v.modelo].filter(Boolean).join(' '))}${v.cor ? ' · ' + esc(v.cor) : ''}${v.ano_modelo ? ' · ' + v.ano_modelo : ''}</span>`;
    }
```

CSS (perto de `.recent-card .rc-placa`):

```css
    .vb-selo { display: inline-block; font-size: 0.75rem; color: var(--text-secondary); background: var(--bg-input, rgba(127,127,127,.12)); border: 1px solid var(--border); border-radius: 999px; padding: 1px 8px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; }
    .vb-selo.vb-alerta { color: var(--orange, #f59e0b); border-color: currentColor; }
    .vb-quadro { margin-top: 12px; border: 1px solid var(--border); border-radius: 10px; padding: 12px; }
    .vb-quadro h4 { margin: 0 0 8px; }
    .vb-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .vb-grid span { display: block; font-size: 0.6875rem; color: var(--text-muted); }
    .vb-fonte { font-size: 0.6875rem; color: var(--text-muted); margin-top: 8px; }
    .vb-form { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .vb-form input { flex: 1 1 140px; min-width: 0; }
    @media (max-width: 480px) { .vb-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
```

Em `loadRecentCards` (e no carregamento da tabela), depois de obter a lista de capturas e antes de montar o HTML: `await loadVeiculosBase(capturas.map((c) => c.placa));`. No card, logo abaixo de `<div class="rc-placa">…</div>`: `${seloVeiculo(c.placa)}`. Na tabela, ao lado da placa: `${seloVeiculo(c.placa)}`.

- [ ] **Step 6: Quadro "Veículo", cadastro inline e suspeita no `openModal`**

Em `openModal`, depois de obter `veiculo`: `await loadVeiculosBase([captura.placa]); const vb = veiculoBaseDe(captura.placa);`

Substituir o bloco "Morador section" (`if (veiculo) { … } else { … }`) por:

```js
      if (vb && vb.status === 'consultado') {
        const campo = (r, v) => `<div><span>${r}</span><strong>${esc(v) || '—'}</strong></div>`;
        html += `<div class="vb-quadro"><h4>Veículo</h4><div class="vb-grid">
          ${campo('Marca/modelo', [vb.marca, vb.modelo, vb.versao !== vb.modelo ? vb.versao : ''].filter(Boolean).join(' '))}
          ${campo('Cor', vb.cor)}${campo('Ano', vb.ano_modelo)}
          ${campo('Origem', [vb.municipio, vb.uf].filter(Boolean).join('/'))}${campo('Tipo', vb.tipo_veiculo)}${campo('Situação', vb.situacao)}
        </div><div class="vb-fonte">Fonte: APIPLACAS · consultado em ${new Date(vb.consultado_em).toLocaleDateString('pt-BR')}</div></div>`;
      } else if (vb && vb.status === 'suspeita') {
        html += `<div class="vb-quadro"><h4>Verificar leitura</h4>
          <p>Esta leitura parece ser <strong>${esc(vb.suspeita_de)}</strong>, que passa com frequência aqui. Confira na foto.</p>
          <div class="vb-form">
            <button type="button" class="btn-zoom" onclick="corrigirLeitura('${esc(captura.id)}', this)">É a mesma placa (${esc(vb.suspeita_de)})</button>
            <button type="button" class="btn-zoom" onclick="liberarSuspeita('${esc(captura.placa)}', this)">É outro carro</button>
          </div></div>`;
      } else if (vb && (vb.status === 'pendente' || vb.status === 'erro')) {
        html += `<div class="vb-quadro"><h4>Veículo</h4><div class="vb-fonte">Consultando dados do veículo…</div></div>`;
      }

      if (veiculo) {
        html += `<div class="modal-morador"><h4>Veículo Cadastrado</h4><div class="morador-grid">
          <div><span>Morador</span><strong>${esc(veiculo.nome_morador) || '---'}</strong></div>
          <div><span>Unidade</span><strong>${esc(veiculo.unidade) || '---'}</strong></div>
          <div><span>Veículo</span><strong>${esc(veiculo.marca) || '---'} ${esc(veiculo.cor)}</strong></div>
        </div></div>`;
      } else {
        const marcaPre = vb && vb.status === 'consultado' ? [vb.marca, vb.modelo].filter(Boolean).join(' ') : '';
        const corPre = vb && vb.status === 'consultado' ? vb.cor || '' : '';
        html += `<form class="vb-quadro" onsubmit="cadastrarDaPassagem(event, '${esc(captura.placa)}')" novalidate>
          <h4>Cadastrar como morador</h4>
          <div class="vb-form">
            <input name="nome_morador" placeholder="Nome do morador" aria-label="Nome do morador" maxlength="120" required>
            <input name="unidade" placeholder="Unidade" aria-label="Unidade" maxlength="40">
            <input name="marca" value="${esc(marcaPre)}" aria-label="Marca e modelo" maxlength="60">
            <input name="cor" value="${esc(corPre)}" aria-label="Cor" maxlength="30">
            <button type="submit" class="btn-pdf">Salvar</button>
          </div>
          <div class="field-error" role="alert"></div>
        </form>`;
      }
```

Funções novas (perto de `openModal`):

```js
    async function chamarApiPainel(url, metodo, corpo) {
      const { data: { session } } = await sb.auth.getSession();
      const resp = await fetch(url, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json.error || 'Não foi possível concluir');
      return json;
    }

    async function cadastrarDaPassagem(ev, placa) {
      ev.preventDefault();
      const f = ev.target;
      const erro = f.querySelector('.field-error');
      const nome = f.nome_morador.value.trim();
      if (!nome) { erro.textContent = 'Informe o nome do morador'; f.nome_morador.focus(); return; }
      const botao = f.querySelector('button[type=submit]');
      botao.disabled = true;
      try {
        await chamarApiPainel('/api/admin/veiculos', 'POST', {
          cliente_id: currentCliente.id, placa, nome_morador: nome,
          unidade: f.unidade.value.trim() || null, marca: f.marca.value.trim() || null, cor: f.cor.value.trim() || null,
        });
        await loadVeiculosCache();
        const quadro = document.createElement('div');
        quadro.className = 'modal-morador';
        quadro.innerHTML = `<h4>Veículo Cadastrado</h4><div class="morador-grid">
          <div><span>Morador</span><strong>${esc(nome)}</strong></div>
          <div><span>Unidade</span><strong>${esc(f.unidade.value.trim()) || '---'}</strong></div>
          <div><span>Veículo</span><strong>${esc(f.marca.value.trim()) || '---'} ${esc(f.cor.value.trim())}</strong></div></div>`;
        f.replaceWith(quadro);
      } catch (e) {
        erro.textContent = e.message;
        botao.disabled = false;
      }
    }

    async function corrigirLeitura(capturaId, botao) {
      botao.disabled = true;
      try {
        const r = await chamarApiPainel('/api/admin/veiculos-base', 'POST', { acao: 'mesma_placa', captura_id: capturaId });
        closeModal();
        showToast?.(`Leitura corrigida para ${r.placa}`);
        loadRecentCards();
      } catch (e) { botao.disabled = false; alertaInline(botao, e.message); }
    }

    async function liberarSuspeita(placa, botao) {
      botao.disabled = true;
      try {
        await chamarApiPainel('/api/admin/veiculos-base', 'POST', { acao: 'outro_carro', placa, cliente_id: currentCliente.id });
        delete veiculosBaseCache[placaLib.paraMercosul(placa)];
        closeModal();
        loadRecentCards();
      } catch (e) { botao.disabled = false; alertaInline(botao, e.message); }
    }

    function alertaInline(el, msg) {
      const p = document.createElement('div');
      p.className = 'field-error';
      p.setAttribute('role', 'alert');
      p.textContent = msg;
      el.closest('.vb-quadro').appendChild(p);
    }
```

> Antes de usar `showToast`, confira o nome do helper de aviso do painel (`grep -n "function .*[Tt]oast" dashboard/index.html`) e use o existente; se não houver, remova essa linha.
> Confira o nome real de `closeModal` e `loadRecentCards` (existem nas linhas ~4300 e ~3090).

- [ ] **Step 7: Preencher marca/cor na tela de Veículos**

No formulário de cadastro manual de veículo do painel (o que faz `POST /api/admin/veiculos`, ~linha 3744), ao sair do campo placa (`blur`):

```js
      async function preencherDaBase(inputPlaca, inputMarca, inputCor) {
        const m = placaLib.paraMercosul(inputPlaca.value);
        if (!m || inputMarca.value || inputCor.value) return;
        try {
          const r = await chamarApiPainel(`/api/admin/veiculos-base?placa=${m}&cliente_id=${currentCliente.id}`, 'GET');
          if (r.marca && !inputMarca.value) inputMarca.value = r.marca;
          if (r.cor && !inputCor.value) inputCor.value = r.cor;
        } catch { /* sem preenchimento automático */ }
      }
```

Ligar com `addEventListener('blur', …)` nos ids reais dos campos desse formulário (confira com `grep -n "placa" dashboard/index.html | sed -n '1,40p'` perto da linha 3700).

- [ ] **Step 8: Verificar no navegador local**

Servidor estático local como na Task 10, com `index.html → ../../dashboard/index.html`. No console:
1. `veiculosBaseCache = { ABC1D23: { placa:'ABC1D23', status:'consultado', marca:'VW', modelo:'GOL', cor:'Branca', ano_modelo:2021, consultado_em:new Date().toISOString() } }` e conferir `seloVeiculo('ABC1D23')`.
2. Abrir o modal com uma captura falsa cujo `veiculosCache` tenha `nome_morador: '<img src=x onerror=alert(1)>'` — Expected: o texto aparece literal; nenhum alerta.
3. Suspeita e pendente renderizam o quadro certo.
4. Largura 375 px: formulário quebra em linhas, sem rolagem horizontal; tema claro e escuro.

- [ ] **Step 9: Testes e commit**

Run: `npm test` (com `texto-seguro` incluído) e checagem de sintaxe dos `<script>` do painel:

```bash
python3 - <<'EOF'
import re,subprocess
s=open('dashboard/index.html',encoding='utf-8').read()
for i,b in enumerate(re.findall(r'<script(?![^>]*src)[^>]*>(.*?)</script>',s,re.S)):
    r=subprocess.run(['node','--check','-'],input=b,capture_output=True,text=True)
    print(i,'OK' if r.returncode==0 else r.stderr[:300])
EOF
```

```bash
git add site/js/texto-seguro.js test/texto-seguro.test.js dashboard/index.html package.json
git commit -m "feat(painel): dados do veículo, cadastro direto da passagem, suspeita de leitura e escape de HTML"
```

---

### Task 12: LGPD — documentos e eliminação

**Files:**
- Modify: `api/admin/direitos.js` (PUT, depois do `update` da solicitação)
- Modify: `docs/POLITICA_PRIVACIDADE.md`, `site/privacidade.html`, `docs/RIPD_TEMPLATE.md`, `docs/CONTRATO_DPA.md`, `docs/LGPD.md`

- [ ] **Step 1: Eliminação apaga da base**

Em `api/admin/direitos.js`, no topo: `const { paraMercosul } = require('../../site/js/placa');`

Logo após `if (error) throw error;` do update da solicitação:

```js
      // Eliminação atendida: a placa sai também da base única de veículos
      if (data.tipo === 'eliminacao' && data.status === 'atendida' && data.placa_veiculo) {
        const m = paraMercosul(data.placa_veiculo);
        if (m) {
          const del = await supabase.from('veiculos_base').delete().eq('placa', m);
          if (del.error) throw del.error;
        }
      }
```

Run: `node --check api/admin/direitos.js`

- [ ] **Step 2: Documentos**

Em cada documento, na seção de operadores/suboperadores/compartilhamento, acrescentar (adaptando ao estilo do documento):

> **APIPLACAS** (AETHERIA, CNPJ 67.877.417/0001-08) — suboperadora. Recebe a placa de veículos que passam pelos pontos de medição para devolver dados técnicos do veículo (marca, modelo, versão, cor, ano, município/UF de registro, tipo e situação). Não são recebidos nem armazenados dados do proprietário. Finalidade: identificar o veículo nas notificações orientativas e conferir a leitura automática da placa. Os dados do veículo ficam numa base técnica interna e são apagados após 6 meses sem nova passagem.

Na seção de retenção de `docs/LGPD.md` e da política: acrescentar a linha "Dados técnicos do veículo (base interna): 6 meses após a última passagem".

- [ ] **Step 3: Commit**

```bash
git add api/admin/direitos.js docs/POLITICA_PRIVACIDADE.md site/privacidade.html docs/RIPD_TEMPLATE.md docs/CONTRATO_DPA.md docs/LGPD.md
git commit -m "docs(lgpd): APIPLACAS como suboperadora; eliminação apaga a placa da base"
```

---

### Task 13: Revisão, PR e publicação em etapas

**Files:** nenhum código novo.

- [ ] **Step 1: Revisões**

Rodar os agentes `code-reviewer` e `security-reviewer` sobre `git diff master...HEAD` (foco: token, escopo por cliente, XSS, RLS). Corrigir CRITICAL/HIGH com commit próprio.

- [ ] **Step 2: Testes finais**

Run: `npm test` — todos passam. Re-executar `test/sql/rls-veiculos-base.sql` via MCP — `ve_a = 1, ve_b = 0, config = 0, extrato = 0`.

- [ ] **Step 3: PR**

`git push -u origin feat/apiplacas-base-veiculos` e `gh pr create` com: resumo por parte, migration aplicada (nome e data), plano de teste, aviso de que as consultas sobem **desligadas**, e o rodapé de atribuição.

- [ ] **Step 4: Token no Vercel (dono)**

Entregar ao dono, para ele rodar no prompt (o valor nunca passa pelo agente):

```
! cd ~/Developer/protector-lombada && grep '^APIPLACAS_TOKEN=' .env | cut -d= -f2- | tr -d '\n' | vercel env add APIPLACAS_TOKEN production
```

- [ ] **Step 5: Merge e deploy com consultas desligadas**

Só com o "pode publicar" do dono. Conferir o deploy de produção (`success`) e que `apiplacas_config.ativo = false`.

- [ ] **Step 6: Validação (com OK do dono)**

Ligar as consultas na tela do admin e usar "Validar placas de hoje". Conferir no extrato: nº de consultas ≈ placas distintas do dia, custo ≈ placas × R$ 0,03, nenhum erro de token. Abrir 3 passagens no painel e conferir o quadro "Veículo".

- [ ] **Step 7: Memória e acompanhamento**

Registrar na memória do projeto (`project_lombada_*`) a ativação, a data e o compromisso de resumo em 1 semana (consultas, gasto, suspeitas, erros, decisão do mapeamento de cor da câmera).
