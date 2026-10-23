# Portaria 2.2 — e-mails pelo cadastro de usuários Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quem recebe alerta e relatório passa a ser decidido no cadastro de usuários (com o novo tipo "Só recebe e-mail"), a aba E-mails some sem ninguém deixar de receber, e o porteiro edita os cadastros que ele mesmo fez.

**Architecture:** `usuarios` ganha `recebe_alertas`/`recebe_relatorio` e o role `so_email` (sem login: `auth_id` nulo). Uma migração idempotente copia `email_destinatarios` para os usuários; os envios passam a ler uma única função `destinatariosDoCliente`. Um endpoint novo `api/admin/avisos.js` (super_admin e síndico do próprio condomínio) gerencia contatos e opções; o admin e o painel usam o mesmo módulo de tela `site/js/avisos-email.js`. O PUT de `api/admin/veiculos.js` aceita o porteiro só no vínculo que ele cadastrou.

**Tech Stack:** HTML/JS vanilla, Vercel Functions (`api/**/*.js` → `@vercel/node`), Supabase (Postgres, RLS, Auth), testes `node test/*.test.js` + SQL em `begin … rollback`.

**Spec:** `docs/superpowers/specs/2026-10-22-modulo-portaria-design.md` §12.

## Global Constraints

- Rótulo exato do tipo novo: **"Só recebe e-mail"**; valor no banco: `so_email`. Sem senha, sem acesso ao painel (`auth_id` nulo; nunca cria usuário no Auth).
- Opções por usuário, rótulos exatos: **"Recebe alertas de excesso"** (`recebe_alertas`) e **"Recebe relatório periódico"** (`recebe_relatorio`). Padrão `false` para usuários novos.
- Ninguém deixa de receber: depois da migração, para cada cliente, o conjunto (sem maiúsculas) de e-mails de alerta e de relatório é **idêntico** ao que `email_destinatarios` ativo produzia (alerta = tipo `alerta`|`todos`; relatório = `relatorio`|`todos`).
- Usuário `portaria` (e-mail `@porteiro.invalid`) nunca recebe e não mostra as opções.
- `email_destinatarios` **não é apagada** nesta versão (fica como cópia; apagar depois exige "sim" do CEO). Nenhum código lê ou escreve nela depois da 2.2.
- Gerenciam: `super_admin` (qualquer cliente) e `admin_cliente` (só o próprio cliente). `admin_cliente` cria/edita/desativa só `so_email`; nos demais usuários do condomínio, só liga/desliga as duas opções; nunca toca `super_admin`.
- Porteiro edita **nome, unidade (`unidade`/`unidade_id`) e tipo de pessoa** de vínculo **vigente** com `cadastrado_por_usuario = profile.id` do **próprio cliente**, **sem prazo** (CEO 23/10/2026). Placa, marca e cor não. Auditoria como hoje.
- Versão **1.11.0** (regra do CLAUDE.md). Contratos `/api/placa` e `/api/heartbeat` intocados. Repo público: nada de dado real em teste/commit.
- supabase-js não lança em escrita: conferir `error` em toda chamada.

## Review Focus

1. Destinatário com o mesmo e-mail de um usuário de **outro** cliente ou de um `super_admin` (cliente nulo) → vira `so_email` do cliente do destinatário; o super_admin não ganha opções. (Task 1)
2. Rodar a migração duas vezes (antes do merge, para pegar destinatários criados no meio) → não duplica, não desliga opção. (Task 1)
3. E-mail com maiúsculas/espaços diferentes entre destinatário e usuário → casa (lower/trim); dois usuários do mesmo cliente com o mesmo e-mail → o envio não manda duas vezes. (Tasks 1 e 2)
4. Síndico tentando, por id, ligar opção num usuário de outro condomínio, num super_admin ou num porteiro, ou mudar role → 404/403/400. (Task 3)
5. Porteiro editando vínculo de outro porteiro, encerrado, de outro cliente, ou mandando `placa`/`marca` → recusado. (Task 5)

---

### Task 1: Banco — opções, tipo "Só recebe e-mail" e migração dos destinatários

**Files:**
- Create: `sql/migration-usuarios-avisos-email.sql`, `test/sql/usuarios-avisos-email.sql`

**Interfaces:**
- Produces: `usuarios.recebe_alertas boolean not null default false`, `usuarios.recebe_relatorio boolean not null default false`; role check passa a aceitar `'so_email'`; `auth_id` deixa de ser `not null`; check `usuarios_so_email_sem_login`: `(role = 'so_email') = (auth_id is null)` e `role <> 'so_email' or cliente_id is not null`; índice único parcial `uq_usuarios_so_email_cliente` em `(cliente_id, lower(trim(email))) where role = 'so_email'`. Bloco de dados idempotente (insert … `on conflict (cliente_id, lower(trim(email))) where role = 'so_email' do update` com OR das opções; update dos usuários `admin_cliente`/`operador` do mesmo cliente com OR das opções — nunca desliga).

- [ ] Step 1: teste SQL (estilo `test/sql/unidades-agrupador-tipo.sql`, devolve `resultado = ok`): semeia 2 clientes e destinatários cobrindo `alerta`, `relatorio`, `todos`, inativo, e-mail de usuário do mesmo cliente com maiúscula diferente, e-mail de super_admin, e-mail de usuário de outro cliente; afirma, por cliente, conjunto de alertas e de relatório (consulta nova sobre `usuarios`) = conjunto antigo (consulta sobre `email_destinatarios` ativo); inativo não recebe; segunda execução do bloco de dados não muda contagens; `so_email` com `auth_id` → 23514; dois `so_email` mesmo e-mail/cliente → 23505; `authenticated` não lê `usuarios` de outro (policy atual).
- [ ] Step 2: rodar o teste sozinho → falha (coluna inexistente).
- [ ] Step 3: escrever a migração; rodar migração + teste num único `execute_sql` com `begin; … rollback;` até `resultado = ok`. **Nunca** `apply_migration`.
- [ ] Step 4: conferir com SELECT que produção não mudou.
- [ ] Step 5: commit `feat(avisos): usuários com opções de e-mail e tipo Só recebe e-mail (banco)`.

### Task 2: Envios leem do cadastro de usuários

**Files:**
- Create: `lib/destinatarios.js`, `test/destinatarios.test.js`
- Modify: `lib/email-sender.js` (remove `getDestinatarios` ou faz delegar), `api/captura.js:~492`, `api/cron-relatorio-semanal.js:~57-82`, `api/admin/clientes.js:15,22,187`, `api/admin/dashboard.js:31`, `package.json` (registrar teste)

**Interfaces:**
- Consumes: colunas da Task 1.
- Produces: `destinatariosDoCliente(clienteId: string, tipo: 'alerta'|'relatorio') -> Promise<string[]>` — `usuarios` com `cliente_id`, `ativo`, opção do tipo `true`, e-mail não terminado em `@porteiro.invalid`; trim + lower + sem repetidos; lança se `error`; se vazio, cai no legado `clientes.emails_notificacao` (como hoje). `contarDestinatarios(clienteIds) -> Promise<Map<id, number>>` para as contagens do admin (substitui `email_destinatarios(count)`).

- [ ] Step 1: testes com mock: alerta vs relatório; porteiro excluído; inativo excluído; duplicado com maiúscula sai uma vez; erro do banco lança; vazio usa legado; `captura.js` e o cron chamam a função nova (sem `email_destinatarios` em nenhum arquivo de `api/` e `lib/` — teste por grep).
- [ ] Step 2–4: vermelho, implementar, verde (`npm test`). Na exclusão de cliente (`clientes.js:187`), apagar também os `so_email` desse cliente antes (FK é `set null`, que violaria o check).
- [ ] Step 5: commit `feat(avisos): alertas e relatórios saem do cadastro de usuários`.

### Task 3: API de avisos e regras de tela

**Files:**
- Create: `api/admin/avisos.js`, `site/js/avisos-email.js` (UMD, `window.avisosEmailLib`), `test/api-admin-avisos.test.js`, `test/avisos-email.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces (API): `GET ?cliente_id=` → `[{id, nome, email, role, ativo, recebe_alertas, recebe_relatorio}]` (usuários do cliente exceto `portaria`; inclui inativos com `ativo:false`); `POST {cliente_id, nome, email, recebe_alertas?, recebe_relatorio?}` → cria `so_email` (409 se já existe `so_email` com o e-mail no cliente; se o e-mail é de outro usuário do cliente, 409 com "Este e-mail já é de um usuário; ligue as opções nele"); `PUT ?id= {recebe_alertas?, recebe_relatorio?, nome?, email?, ativo?}` — `nome/email/ativo` só em `so_email`; `DELETE ?id=` desativa `so_email`. Roles: `super_admin`, `admin_cliente` (próprio cliente). Alvo `super_admin`/`portaria` → 403 nas opções. Id de outro cliente → 404. Corpo com `role`, `auth_id` ou `senha` → 400. E-mail validado com `isValidEmail`, nome 1–80. Auditoria em toda escrita.
- Produces (tela): `avisosEmailLib.validarContato({nome, email}) -> {corpo}|{erros}`, `avisosEmailLib.htmlListaAvisos(usuarios, {podeEditarContato}) -> string` (tudo escapado; checkboxes com os rótulos exatos dos Global Constraints; selo "Só recebe e-mail"), `avisosEmailLib.ROTULOS`.

- [ ] Step 1: testes (os 5 casos do Review Focus 4, 409s, validação, XSS em nome/e-mail, inativo).
- [ ] Step 2–4: vermelho, implementar, verde.
- [ ] Step 5: commit `feat(avisos): API e regras de tela dos avisos por e-mail`.

### Task 4: Telas — sai a aba E-mails, entram as opções

**Files:**
- Modify: `admin/index.html` (remove aba/painel `tab-emails` e o código dela; aba Usuários mostra "Recebe alertas de excesso" / "Recebe relatório periódico" por usuário e o tipo "Só recebe e-mail" no novo usuário, via `api/admin/avisos.js`; texto da linha ~924 que cita "aba E-mails"), `dashboard/index.html` (menu da conta, só `admin_cliente`: item **"Avisos por e-mail"** abre painel com a lista, as duas opções e "Novo contato (só recebe e-mail)"), `api/admin/emails.js` (remover; nenhuma tela chama mais), `api/admin/usuarios.js` (linhas `so_email` têm `auth_id` nulo: recusar com 400 troca de senha, de role e criação de `so_email` por aqui — "use Avisos por e-mail"; GET devolve as duas opções)
- Test: `test/avisos-email.test.js` (estender), testes de página existentes

**Interfaces:**
- Consumes: Task 3 (API e `avisosEmailLib`), `confirmarAcao`/diálogo da página já existentes (nada de `confirm()` nativo).

- [ ] Step 1: testes: nenhuma referência a `tab-emails`/`/api/admin/emails` sobra em `admin/`, `dashboard/`, `site/`; painel só mostra o item para `admin_cliente`; trocar opção salva na hora com aviso de erro e volta o checkbox se falhar.
- [ ] Step 2–4: vermelho, implementar, verde; `node --check` dos scripts inline.
- [ ] Step 5: commit `feat(avisos): opções de e-mail no cadastro de usuários e fim da aba E-mails`.

### Task 5: Porteiro edita o próprio cadastro

**Files:**
- Modify: `api/admin/veiculos.js` (`ROLES_EDICAO` + regra do porteiro no PUT; `GET historico` da portaria devolve `meu: boolean` em vez de expor `cadastrado_por_usuario`), `portaria/index.html` (botão "Editar" no cadastro vigente que é `meu`, com o mesmo formulário de nome/unidade/tipo de pessoa preenchido)
- Test: `test/api-admin-veiculos*.test.js` (o existente que cobre PUT), `test/portaria-pagina.test.js`

**Interfaces:**
- Produces: PUT `?id=` para `portaria` aceita só `nome_morador`, `unidade`, `unidade_id`, `tipo_pessoa`; outro campo → 400; vínculo não `meu` → 403 "Só dá para editar cadastros feitos por você"; encerrado → 409 (como hoje).

- [ ] Step 1: testes (Review Focus 5 inteiro + sucesso com auditoria + `meu` no histórico + operador/síndico seguem iguais).
- [ ] Step 2–4: vermelho, implementar, verde.
- [ ] Step 5: commit `feat(portaria): porteiro edita o próprio cadastro`.

### Task 6: Versão 1.11.0, manuais, segurança e publicação

- [ ] Step 1: novidade 1.11.0 (síndico): "Escolha no cadastro de usuários quem recebe os alertas e o relatório", "Novo tipo de contato: Só recebe e-mail, sem acesso ao painel", "O porteiro pode corrigir nome, unidade e tipo dos cadastros que ele fez"; `package.json`, rodapés, manuais (painel, admin, portaria) — admin manual: seção E-mails vira "Avisos por e-mail".
- [ ] Step 2: `npm test` → 0.
- [ ] Step 3: `security-reviewer` na branch (foco: escopo do síndico em `avisos.js`, `auth_id` nulo nunca autentica, porteiro no PUT de veículos, XSS na lista, migração).
- [ ] Step 4: PR; **imediatamente antes do merge** aplicar `sql/migration-usuarios-avisos-email.sql` (idempotente, pega destinatários criados no meio) e conferir por SQL a igualdade de conjuntos por cliente; merge; conferir no ar.
