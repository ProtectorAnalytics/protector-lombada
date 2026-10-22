# Módulo Portaria · Parte 1 (Base) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada placa passa a ter um vínculo vigente por vez (com tipo de pessoa, unidade, origem e autor) e um histórico; o painel mostra quem estava ligado à placa na hora de cada passagem; existe o perfil `portaria`, as listas de unidades e de porteiros, e a retenção LGPD dos vínculos encerrados.

**Architecture:** A tabela `veiculos` vira a tabela de vínculos (colunas novas, sem renomear), com `ativo` mantido por gatilho como "vigente" para não quebrar quem já lê `ativo = true`. Toda gravação passa pelo servidor (`/api/admin/veiculos`, service role) e por uma função SQL atômica `vincular_placa`. A lógica de "quem estava na hora" mora em `site/js/vinculo-placa.js` (UMD, usada pelo painel e pelos testes). Perfil `portaria` = novo valor em `usuarios.role` + função `my_role()` nas políticas que ele não pode usar.

**Tech Stack:** Supabase Postgres (RLS, pg_cron), Vercel Functions Node, HTML/JS vanilla, testes `node test/*.test.js` e SQL em transação com ROLLBACK (`test/sql/`).

**Spec:** `docs/superpowers/specs/2026-10-22-modulo-portaria-design.md` (§4 é esta parte).

## Global Constraints

- Tipos de pessoa, nesta ordem e com estes ids: `morador` (Morador, casa, verde), `proprietario` (Proprietário, chave, azul), `visitante` (Visitante, pessoa com crachá, amarelo), `prestador` (Prestador, ferramenta, laranja). Sem vínculo: "Sem cadastro" (interrogação, cinza). Ícone + cor + nome escrito sempre juntos.
- No máximo **um vínculo vigente** por condomínio e placa, comparando as duas grafias (antiga e Mercosul, `site/js/placa.js`).
- Cadastrar de novo uma placa com vínculo vigente **encerra o anterior** (`encerrado_em = now()`) e o novo vale dali em diante; vínculo nunca é apagado ao trocar.
- **Decisão minha (registrar no PR):** se a placa não tinha vínculo vigente, o novo vínculo vale também para as passagens anteriores (`vigente_desde = null`). Assim, cadastrar um carro que acabou de passar já identifica aquela passagem. Os cadastros migrados também ficam com `vigente_desde = null`, para o painel continuar mostrando o que mostra hoje.
- Vínculo de visitante/prestador não expira sozinho.
- Retenção: vínculo encerrado é apagado **6 meses depois de encerrado** (mesma política das passagens). Eliminação do titular apaga todos os vínculos da placa.
- Cadastros existentes migram como `morador`, `origem = 'migracao'`.
- Perfil `portaria` lê passagens, câmeras, base de veículos, unidades e porteiros do próprio condomínio e grava vínculos **só pela API**. Não lê/grava `email_destinatarios`, não lê `relatorio_envios`, não altera `clientes`, não grava `veiculos` direto.
- O role `operador` não muda.
- Regra do repo (CLAUDE.md): versão **1.8.0**, `site/js/novidades-atual.js`, `package.json`, rodapés, manuais e card em `dashboard/novidades.html`; `npm test` verde; migration em `sql/migration-*.sql` aplicada via MCP e registrada no PR.
- Nada muda em `/api/placa` e `/api/heartbeat`.

## Review Focus

1. **Placa nas duas grafias** (vínculo gravado como `ABC1234`, passagem lida como `ABC1B34`): tem de casar. Teste em Task 2 (`vinculoNaHora` com grafia antiga) e Task 1 (índice único bloqueia a segunda grafia vigente).
2. **Dois cadastros simultâneos da mesma placa** (dois porteiros, ou painel + portaria): só um vigente no fim, sem erro 500 para o segundo. Teste em Task 1 (índice único) e Task 3 (`vincular_placa` repetido devolve o vínculo, sem duplicar).
3. **Recadastro igual** (mesma pessoa, unidade e tipo): não pode criar histórico falso nem mudar `vigente_desde`. Teste em Task 1.
4. **Portaria tentando o que não pode** (ler e-mails, mudar o limite do condomínio, apagar vínculo direto pela REST): bloqueado pela RLS, não só pela tela. Teste em Task 1 (SQL como usuário portaria).
5. **Passagem exatamente no instante da troca** (`ts === encerrado_em`): vale o vínculo novo. Teste em Task 2.

---

### Task 1: Banco — vínculos, unidades, porteiros, perfil portaria, retenção

**Files:**
- Create: `sql/migration-portaria-base.sql`
- Create: `test/sql/portaria-base.sql`

**Interfaces:**
- Produces (SQL):
  - `public.placa_mercosul(text) returns text` — IMMUTABLE; maiúsculas, só alfanumérico; com 7 caracteres troca o 5º dígito pela letra (`0→A … 9→J`), igual a `paraMercosul` de `site/js/placa.js`.
  - `veiculos` + colunas: `tipo_pessoa text not null default 'morador' check (tipo_pessoa in ('morador','proprietario','visitante','prestador'))`, `vigente_desde timestamptz null`, `encerrado_em timestamptz null`, `origem text not null default 'painel' check (origem in ('painel','admin','portaria','condfy','planilha','migracao'))`, `cadastrado_por text null`, `cadastrado_por_usuario uuid null`, `unidade_id uuid null references unidades(id) on delete set null`.
  - Gatilho `veiculos_ativo_sync` (BEFORE INSERT OR UPDATE): `new.ativo := new.encerrado_em is null`.
  - Índice único `uq_veiculos_vigente on veiculos (cliente_id, placa_mercosul(placa)) where encerrado_em is null`.
  - `unidades(id uuid pk default gen_random_uuid(), cliente_id uuid not null references clientes on delete cascade, nome text not null check (length(trim(nome)) between 1 and 60), ordem int not null default 0, ativo boolean not null default true, criado_em timestamptz not null default now())`, único `(cliente_id, lower(nome))`.
  - `porteiros(id, cliente_id, nome, ativo, criado_em)` com as mesmas regras de `unidades` (sem `ordem`).
  - `usuarios.role` aceita `'portaria'`.
  - `public.my_role() returns text` — STABLE SECURITY DEFINER, `search_path` fixo, mesmo padrão de `my_cliente_id()`.
  - `public.vincular_placa(p_cliente_id uuid, p_placa text, p_tipo text, p_nome text, p_unidade text, p_unidade_id uuid, p_marca text, p_cor text, p_origem text, p_cadastrado_por text, p_usuario uuid) returns veiculos` — SECURITY INVOKER; `execute` só para `service_role` (revogar de `public`, `anon`, `authenticated`).
  - `public.cleanup_vinculos_encerrados() returns integer` + job pg_cron `cleanup-vinculos-encerrados` às `15 4 * * *`.

- [ ] **Step 1: Escrever o teste SQL** `test/sql/portaria-base.sql`, no padrão de `test/sql/rls-veiculos-base.sql` (`begin` … `rollback`, dois clientes fictícios, `set local role authenticated` + `request.jwt.claims`). Falha com `raise exception 'FALHOU: …'` em cada item:
  - `vincular_placa` numa placa nova → 1 linha, `vigente_desde is null`, `ativo = true`.
  - Segundo `vincular_placa` com outra pessoa → a 1ª tem `encerrado_em` preenchido e `ativo = false`; a 2ª tem `vigente_desde = encerrado_em` da 1ª; `count(*) where encerrado_em is null` = 1.
  - Terceiro `vincular_placa` idêntico ao segundo (mesmo tipo, nome, unidade, unidade_id) → nenhuma linha nova; marca/cor atualizadas.
  - `insert` direto de vínculo vigente da mesma placa na **outra grafia** → erro de unicidade (23505).
  - Como usuário `portaria` do cliente A: `select` em `capturas`, `cameras`, `unidades`, `porteiros`, `veiculos` funciona; `select` em `email_destinatarios` e `relatorio_envios` devolve 0 linhas; `update clientes set limite_velocidade = 99` afeta 0 linhas; `insert`/`delete` em `veiculos` falha (42501) ou afeta 0 linhas.
  - Como `admin_cliente` do cliente A: `email_destinatarios` continua legível (regressão).
  - Usuário `authenticated` chamando `vincular_placa` → 42501.
  - `cleanup_vinculos_encerrados()` apaga vínculo encerrado há 7 meses e mantém o encerrado há 1 mês e o vigente antigo.
  - Última linha: `select 'ok' as resultado`.

- [ ] **Step 2: Rodar o teste e ver falhar** — via MCP Supabase `execute_sql` com o conteúdo do arquivo. Esperado: erro (função `vincular_placa` inexistente).

- [ ] **Step 3: Escrever `sql/migration-portaria-base.sql`** com tudo do bloco Interfaces, nesta ordem: `placa_mercosul`; `unidades`/`porteiros` + RLS (`select`: `is_super_admin() or cliente_id = my_cliente_id()`; sem políticas de escrita — escrita só pela API); colunas de `veiculos`; migração de dados (abaixo); gatilho; índice único; check do role; `my_role()`; políticas alteradas; `vincular_placa`; `cleanup_vinculos_encerrados` (sem agendar — ver Step 6).
  - Migração de dados: linhas com `ativo = false` → `encerrado_em = criado_em`; entre linhas ativas da mesma `(cliente_id, placa_mercosul(placa))`, a de `criado_em` mais recente fica vigente e as outras recebem `encerrado_em` = `criado_em` da vigente (hoje são 21 placas assim); todas → `origem = 'migracao'`, `tipo_pessoa = 'morador'`, `vigente_desde = null`.
  - Políticas: acrescentar `and my_role() is distinct from 'portaria'` em `email_dest_select/insert/update/delete`, `clientes_update`, `rel_envios_select`, `veiculos_insert/update/delete`.
  - `vincular_placa`: trava o vigente da placa (`select … for update` por `cliente_id` + `placa_mercosul`); se existe e tipo, `trim(nome)`, unidade e `unidade_id` são iguais → só atualiza marca/cor e devolve; se existe e difere → `encerrado_em = now()` e insere o novo com `vigente_desde = now()`; se não existe → insere com `vigente_desde = null`. Grava a placa em maiúsculas sem separadores. Em `unique_violation` (corrida), relê e devolve o vigente.
  - `cleanup_vinculos_encerrados`: `delete from veiculos where encerrado_em < now() - interval '6 months'`, `GET DIAGNOSTICS`, devolve a contagem (padrão de `cleanup_old_capturas`).

- [ ] **Step 4: Aplicar num branch do Supabase ou, se não houver, rodar o teste sobre a migration dentro da mesma transação** (colar a migration no início do arquivo de teste, antes dos inserts, e manter o `rollback`). Esperado: `resultado = ok`.

- [ ] **Step 5: Commit**

```bash
git add sql/migration-portaria-base.sql test/sql/portaria-base.sql
git commit -m "feat(portaria): vínculos de placa com histórico, unidades, porteiros e perfil portaria (banco)"
```

- [ ] **Step 6: Aplicar em produção** via `apply_migration` (nome `portaria_base`) **só depois da revisão de segurança (Task 8)**. O agendamento `cron.schedule('cleanup-vinculos-encerrados', '15 4 * * *', 'select public.cleanup_vinculos_encerrados()')` **só com "sim" explícito do Glauber**: na 1ª execução apaga 2 cadastros já excluídos de março/2026.

---

### Task 2: Regra "quem estava na hora" e tipos (lib compartilhada)

**Files:**
- Create: `site/js/vinculo-placa.js`
- Create: `test/vinculo-placa.test.js`
- Modify: `package.json` (script `test`: acrescentar `node test/vinculo-placa.test.js`)

**Interfaces:**
- Consumes: `paraMercosul` de `site/js/placa.js`.
- Produces (UMD, `window.vinculoPlacaLib` no browser):
  - `TIPOS_PESSOA` — array congelado de `{ id, rotulo, icone, cor }` na ordem dos Global Constraints; `icone` ∈ `'casa' | 'chave' | 'cracha' | 'ferramenta'`; `cor` = nome do token CSS (`'--tipo-morador'` etc.).
  - `SEM_CADASTRO` — `{ id: 'sem', rotulo: 'Sem cadastro', icone: 'interrogacao', cor: '--tipo-sem' }`.
  - `tipoPessoa(id: string) -> objeto de TIPOS_PESSOA | SEM_CADASTRO`.
  - `indexarVinculos(linhas: Array<{placa, vigente_desde, encerrado_em, ...}>) -> Map<mercosul, linha[]>` (cada lista ordenada por `vigente_desde`, `null` primeiro).
  - `vinculoNaHora(indice, placa: string, ts: string|Date) -> linha | null` — vale a linha com `(vigente_desde is null or vigente_desde <= ts) and (encerrado_em is null or encerrado_em > ts)`.
  - `vinculoVigente(indice, placa) -> linha | null`.
  - `rotuloCadastro(linha) -> string` — `"cadastrado em DD/MM às HH:MM por NOME"` em America/Sao_Paulo; sem autor: sem o trecho "por"; sem `vigente_desde`: usa `criado_em`.

- [ ] **Step 1: Testes** (`test/vinculo-placa.test.js`, padrão `caso(nome, fn)` dos outros testes):
  - `vinculoNaHora` devolve Fulano para passagem antes da troca e Beltrano depois (`vigente_desde` de Beltrano = `encerrado_em` de Fulano = `2026-10-23T12:40:00Z`).
  - Passagem exatamente em `2026-10-23T12:40:00Z` → Beltrano.
  - Vínculo com `vigente_desde = null` vale para passagem de 2026-05-01.
  - Vínculo gravado `ABC1234` casa com passagem `ABC1C34` e vice-versa.
  - Placa sem vínculo → `null`; `tipoPessoa('xyz')` → `SEM_CADASTRO`.
  - `rotuloCadastro({vigente_desde:'2026-10-21T01:15:00Z', cadastrado_por:'João'})` → `'cadastrado em 20/10 às 22:15 por João'`.
  - `TIPOS_PESSOA.map(t => t.id)` → `['morador','proprietario','visitante','prestador']`.

- [ ] **Step 2: Rodar e ver falhar** — `node test/vinculo-placa.test.js` → `Cannot find module`.
- [ ] **Step 3: Implementar** `site/js/vinculo-placa.js` no formato UMD de `site/js/severidade-velocidade.js`.
- [ ] **Step 4: Rodar e ver passar** — `node test/vinculo-placa.test.js` → `N casos passaram`.
- [ ] **Step 5: Commit** — `feat(portaria): regra de vínculo na hora da passagem e tipos de pessoa`.

---

### Task 3: API de vínculos (`/api/admin/veiculos`) e alerta por e-mail

**Files:**
- Modify: `api/admin/veiculos.js`
- Modify: `lib/supabase.js:176-186` (`findVeiculo`)
- Create: `test/api-admin-veiculos.test.js` (stub de `lib/auth-middleware` no padrão de `test/api-admin-direitos-eliminacao.test.js`)
- Modify: `package.json` (script `test`)

**Interfaces:**
- Consumes: `vincular_placa` (Task 1), `TIPOS_PESSOA` (Task 2).
- Produces (HTTP):
  - `GET /api/admin/veiculos?cliente_id=…[&historico=1]` — roles `super_admin, admin_cliente, operador, portaria`. Padrão: só vigentes (`encerrado_em is null`); `historico=1`: todos (vigentes + encerrados), colunas `id, placa, nome_morador, unidade, unidade_id, tipo_pessoa, marca, cor, vigente_desde, encerrado_em, criado_em, origem, cadastrado_por`.
  - `POST` body `{ cliente_id, placa, tipo_pessoa, nome_morador?, unidade?, unidade_id?, marca?, cor?, origem?, porteiro_id? }` → `supabase.rpc('vincular_placa', …)`; 201 com o vínculo. `tipo_pessoa` obrigatório e validado; `origem`: `portaria` quando o role é `portaria` (ignora o enviado), senão `'planilha'` se enviado assim, senão `'painel'`/`'admin'` (super_admin = admin). `cadastrado_por`: para `portaria`, o `nome` do porteiro `porteiro_id` (tem de ser ativo e do mesmo cliente, senão 400); para os demais, `profile.nome`. `unidade_id`, se enviado, tem de ser do mesmo cliente (senão 400).
  - `PUT ?id=…` — campos aceitos: `tipo_pessoa, nome_morador, unidade, unidade_id, marca, cor`; `placa` no corpo → 400 (troca de placa quebraria o histórico). Só em vínculo vigente.
  - `DELETE ?id=…` — encerra (`encerrado_em = now()`); `permanent=true` só `super_admin`.
  - Auditoria em todas as escritas, como hoje.
- `findVeiculo(clienteId, placa)` passa a filtrar `encerrado_em is null` e casar as duas grafias (`.in('placa', [m, paraAntiga(m)])`).

- [ ] **Step 1: Testes** `test/api-admin-veiculos.test.js`:
  - POST sem `tipo_pessoa` → 400; com `tipo_pessoa: 'parente'` → 400.
  - POST como `portaria` com `origem: 'condfy'` → RPC recebe `p_origem: 'portaria'` e `p_cadastrado_por` = nome do porteiro.
  - POST como `portaria` com `porteiro_id` de outro cliente → 400.
  - POST com `unidade_id` de outro cliente → 400.
  - PUT com `placa` no corpo → 400.
  - DELETE comum → update com `encerrado_em` (string ISO), sem `delete()`; DELETE `permanent=true` como `admin_cliente` → 403.
  - Portaria em cliente diferente do seu → 403 (via `verificarAcessoCliente`).
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** em `api/admin/veiculos.js` (mantendo `autenticar`, `verificarAcessoCliente`, `registrarAuditoria`); ajustar `findVeiculo`.
- [ ] **Step 4: Rodar e ver passar** — `node test/api-admin-veiculos.test.js`; depois `npm test`.
- [ ] **Step 5: Commit** — `feat(portaria): API de vínculos com tipo, unidade, origem e histórico`.

---

### Task 4: Listas de unidades e de porteiros

**Files:**
- Create: `lib/lista-simples.js`
- Create: `api/admin/unidades.js`
- Create: `api/admin/porteiros.js`
- Modify: `vercel.json` (rotas `/api/admin/unidades` e `/api/admin/porteiros`, no padrão das outras de `/api/admin`)
- Create: `test/lista-simples.test.js`, `test/api-admin-listas-portaria.test.js`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Produces:
  - `parseLinhas(texto: string, { max = 500, maxLen = 60 } = {}) -> { itens: string[], ignoradas: string[] }` — uma por linha; `trim`; espaços repetidos viram um; linhas vazias somem; duplicadas (sem diferenciar maiúsculas) contam uma vez; linha acima de `maxLen` vai para `ignoradas`; mais de `max` itens → lança `Error('Máximo de 500 linhas')`.
  - `GET /api/admin/unidades?cliente_id=` (todos os roles do cliente, inclusive `portaria`) → ativas, ordem por `ordem, nome`.
  - `POST /api/admin/unidades` `{ cliente_id, texto }` (só `super_admin`, `admin_cliente`) → insere as novas (ignora as que já existem, sem diferenciar maiúsculas), `ordem` na ordem colada; resposta `{ criadas, ja_existiam, ignoradas }`.
  - `DELETE /api/admin/unidades?id=` → `ativo = false`.
  - `porteiros`: mesmos três métodos e regras.

- [ ] **Step 1: Testes** de `parseLinhas` ("Bloco 2 · 302\n\n bloco 2 · 302 \nCasa 7" → `['Bloco 2 · 302','Casa 7']`; 61 caracteres → `ignoradas`; 501 linhas → lança) e da API (portaria faz POST → 403; GET de outro cliente → 403; POST devolve contagens).
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e ver passar** + `npm test`.
- [ ] **Step 5: Commit** — `feat(portaria): listas de unidades e porteiros por condomínio`.

---

### Task 5: Admin — unidades, porteiros, usuário portaria e vínculo com tipo

**Files:**
- Modify: `admin/index.html` (detalhe do cliente: aba nova "Portaria"; aba "Veículos")
- Modify: `api/admin/usuarios.js:48` (aceitar `'portaria'`)
- Modify: `test/admin-apiplacas-ui.test.js` só se o teste existente quebrar por mudança de estrutura (não alterar asserções sem motivo)

**Interfaces:**
- Consumes: Task 3 e Task 4 (HTTP); `TIPOS_PESSOA` (Task 2) via `<script src="/js/vinculo-placa.js">`.

- [ ] **Step 1: Teste** em `test/api-admin-usuarios-portaria.test.js`: POST de usuário com `role: 'portaria'` e `cliente_id` → aceito; `role: 'portaria'` sem `cliente_id` → 400.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar**:
  - Aba **Portaria** no cliente: caixa "Cole as unidades (uma por linha)" + botão "Adicionar unidades" → mostra "N criadas · N já existiam · N ignoradas"; lista com remover. Mesmo bloco para porteiros. Botão "Criar acesso da portaria" abre o formulário de usuário já com `role = portaria`.
  - Aba **Veículos**: coluna Tipo (ícone + nome); formulário com seletor de tipo (4 opções, obrigatório) e unidade (lista se houver unidades; senão texto livre); "unidade antiga" em cinza quando `unidade_id` vazio e `unidade` preenchida; "Excluir" vira "Encerrar vínculo".
- [ ] **Step 4: Rodar** `npm test` e conferir no navegador (`npm run dev`, login super_admin de teste): colar 3 unidades, criar 1 porteiro, criar vínculo visitante.
- [ ] **Step 5: Commit** — `feat(portaria): admin com unidades, porteiros, acesso da portaria e tipo no veículo`.

---

### Task 6: Painel — tipo e "quem estava na hora" em toda passagem

**Files:**
- Modify: `dashboard/index.html` (`loadVeiculosCache` ~3919, `celulaMorador` ~4080, cards ~4368, modal de detalhe, filtro "Não cadastrados")
- Modify: `test/filtro-veiculo.test.js` ou testes de painel existentes só se quebrarem

**Interfaces:**
- Consumes: `GET /api/admin/veiculos?historico=1` (Task 3) **ou** leitura direta `sb.from('veiculos')` com as colunas novas (a RLS já filtra por cliente); `indexarVinculos`, `vinculoNaHora`, `vinculoVigente`, `tipoPessoa`, `rotuloCadastro` (Task 2).

- [ ] **Step 1: Teste** em `test/vinculo-placa.test.js` (acrescentar): `indexarVinculos` com 2 000 linhas responde `vinculoNaHora` em < 1 ms por chamada (o painel chama por linha da lista).
- [ ] **Step 2: Rodar e ver falhar/passar conforme o caso.**
- [ ] **Step 3: Implementar**:
  - `loadVeiculosCache` carrega vigentes e encerrados (paginado como hoje) com as colunas novas e monta `indiceVinculos = indexarVinculos(data)`; `placasCadastradas` passa a ser só as vigentes.
  - `celulaMorador(placa, capturaTs)`: ícone + nome do tipo + nome + unidade de `vinculoNaHora`; sem vínculo: ícone interrogação + "Sem cadastro" (cinza). Visitante e prestador mostram `rotuloCadastro` como segunda linha. Atualizar as chamadas (tabela, cards, detalhe, exportações) para passar o horário da passagem.
  - Ícones: um `<svg>` com `<symbol>`s (casa, chave, crachá, ferramenta, interrogação) no topo do `<body>`, tokens `--tipo-*` nos dois temas, com contraste AA no fundo do painel; o laranja do prestador não pode ser o vermelho de alerta.
  - Excel exportado ganha a coluna TIPO; importação aceita coluna TIPO opcional (valores `Morador/Proprietário/Visitante/Prestador`, sem acento também; vazio = `morador`) e envia `origem: 'planilha'`.
  - Formulário de veículo do painel: seletor de tipo obrigatório e unidade (lista, se houver), igual ao admin.
- [ ] **Step 4: Rodar** `npm test`; conferir no navegador com um cliente de teste: placa com troca de vínculo mostra nomes diferentes antes/depois; placa antiga casa com passagem Mercosul.
- [ ] **Step 5: Commit** — `feat(portaria): painel mostra tipo e quem estava ligado à placa em cada passagem`.

---

### Task 7: LGPD — eliminação apaga vínculos; documentação

**Files:**
- Modify: `api/admin/direitos.js:~255` (bloco "Eliminação atendida")
- Modify: `test/api-admin-direitos-eliminacao.test.js`
- Modify: `docs/LGPD.md` (seção de retenção) e `site/privacidade.html` (mesma informação, se citar retenção por tipo de dado)

- [ ] **Step 1: Teste**: eliminação atendida com `placa_veiculo = 'ABC1234'` chama `delete` em `veiculos` com `.in('placa', ['ABC1C34','ABC1234'])`; erro nesse delete → 500 sem vazar a mensagem interna (mesmo padrão do teste atual).
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** no mesmo bloco, antes da base de veículos; documentar "vínculo de placa encerrado: 6 meses após o encerramento" em `docs/LGPD.md`.
- [ ] **Step 4: Rodar e ver passar** + `npm test`.
- [ ] **Step 5: Commit** — `feat(portaria): eliminação do titular apaga os vínculos da placa`.

---

### Task 8: Versão 1.8.0, manual, revisão de segurança e publicação

**Files:**
- Modify: `site/js/novidades-atual.js`, `package.json`, `dashboard/index.html` (rodapés), `dashboard/manual.html`, `admin/manual-usuario.html`, `dashboard/novidades.html`

- [ ] **Step 1: Novidade 1.8.0** (linguagem de síndico): "Cada veículo agora tem um tipo — Morador, Proprietário, Visitante ou Prestador — com ícone próprio"; "Quando um carro troca de dono (carro alugado, por exemplo), cada passagem mostra quem era o responsável naquele dia"; "Lista de unidades do condomínio para escolher no cadastro".
- [ ] **Step 2: Manual** (painel e admin): seção "Tipos de pessoa" com os 5 ícones; "Quando o carro troca de responsável"; "Encerrar um cadastro"; no admin, "Portaria: unidades, porteiros e acesso".
- [ ] **Step 3: Rodar** `npm test` → saída 0 (inclui `test/versao-novidades.test.js`).
- [ ] **Step 4: Revisão de segurança** — agente `security-reviewer` sobre o diff da branch, cobrindo as 8 brechas de `~/.claude/rules/ecc/common/ai-app-security.md`, com foco em: RLS da portaria (Task 1), `vincular_placa` executável só pelo service role, validação de `porteiro_id`/`unidade_id` de outro cliente (IDOR), XSS nos nomes de porteiro/unidade/morador no admin e no painel (sempre `esc()`/`textContent`). CRITICAL/HIGH corrigidos antes de seguir.
- [ ] **Step 5: Aplicar a migration em produção** (Task 1 Step 6) e rodar `test/sql/portaria-base.sql` de novo em produção (termina em ROLLBACK). Esperado: `ok`.
- [ ] **Step 6: Commit, PR e publicação** — PR com o resumo, a decisão de retroatividade (Global Constraints), a migration aplicada e o pedido do "sim" para o agendamento da retenção; merge segundo a política do CLAUDE.md após CI verde e "pode publicar".
