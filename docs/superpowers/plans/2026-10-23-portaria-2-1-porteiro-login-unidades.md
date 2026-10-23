# Módulo Portaria · 2.1 (porteiro com login e unidades em massa) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Porteiro vira usuário com login próprio (usuário simples, sem e-mail), criado pela Protector no admin e pelo síndico no painel; unidades ganham agrupador (bloco/torre/quadra), andar e tipo, com editor em massa e planilha.

**Architecture:** Login de porteiro = usuário Supabase com e-mail técnico `<usuario>@porteiro.invalid`; regras puras em `site/js/usuario-portaria.js`. O endpoint `/api/admin/porteiros` passa a gerenciar esses usuários (a tabela `porteiros` fica sem uso). Unidades ganham colunas por migration aditiva; regras puras em `site/js/unidade.js`; um editor de unidades único (`site/js/editor-unidades.js`) usado no admin e no painel.

**Tech Stack:** Supabase (Auth admin API, Postgres), Vercel Functions, HTML/JS vanilla, SheetJS 0.18.5 (cdnjs, já usado pelo painel), testes `node test/*.test.js` e SQL com ROLLBACK.

**Spec:** `docs/superpowers/specs/2026-10-22-modulo-portaria-design.md` §11 (esta etapa), §4–5 (já entregues).

## Global Constraints

- Usuário do porteiro: minúsculas `a–z 0–9 .`, 3–40 caracteres, sem ponto no início/fim nem `..`; e-mail técnico `<usuario>@porteiro.invalid`; único no sistema. Telas de login aceitam o usuário sem "@" (vira o e-mail técnico) e e-mail normal com "@".
- Senha do porteiro: mínimo 6 caracteres (mesmo do painel); definida e trocada só no admin/painel; sem recuperação por e-mail.
- Quem gerencia porteiros: `super_admin` (qualquer condomínio) e `admin_cliente` **só do próprio condomínio e só usuários com role `portaria`**. Nenhum outro perfil.
- Cadastro feito por um porteiro sai com `cadastrado_por` = nome do login; `porteiro_id` deixa de ser exigido (aceito e ignorado).
- Tipos de unidade (ids → rótulos): `apartamento` Apartamento, `casa` Casa, `sala` Sala, `loja` Loja, `lote` Lote, `fip` **"FIP (Fração Ideal)"** (rótulo exato). Padrão do lote: `apartamento`.
- Agrupador opcional com nome livre (Bloco/Torre/Quadra). Rótulo exibido: `<agrupador> · <unidade>`; sem agrupador: `<unidade>`.
- Unidade única por (cliente, agrupador sem diferenciar maiúsculas, nome sem diferenciar maiúsculas).
- Planilha: colunas `Bloco/Torre/Quadra`, `Unidade`, `Andar`, `Tipo` (aceita rótulo ou id, sem acento/maiúscula; vazio = Apartamento). Importar carrega o editor para conferir; nada é salvo sem "Salvar".
- Lote: aceita números/nomes separados por espaço, vírgula ou quebra de linha e faixas `101-104` (só números, até 500 por faixa).
- Todo texto dinâmico com `esc()`/`textContent`. Erros de API sem detalhe interno.
- Versão **1.10.0** + novidades + manuais; `npm test` verde.

## Review Focus

1. **Síndico tentando gerenciar usuário que não é porteiro ou de outro condomínio** (via API direta): 403, nada muda. Task 2.
2. **Usuário repetido** (dois "jose.praiadocastelo"): erro claro, nenhum usuário pela metade (auth criado sem linha em `usuarios` ou vice-versa). Task 2.
3. **Login com usuário digitado com maiúscula/espaço** (`José.PraiaDoCastelo `): normaliza e entra. Task 1 e 4.
4. **Planilha com linhas ruins** (tipo desconhecido, unidade vazia, duplicada): mostradas como recusadas na conferência; o resto entra. Task 6/8.
5. **Unidade já usada em vínculos** removida ou renomeada: vínculos continuam mostrando o rótulo (unidade removida aparece "(removida)" como já faz o admin). Task 7/8.

---

### Task 1: Regras do usuário do porteiro (pura)

**Files:** Create `site/js/usuario-portaria.js`, `test/usuario-portaria.test.js`; Modify `package.json`.

**Produces (UMD `window.usuarioPortariaLib`):** `DOMINIO = 'porteiro.invalid'`; `normalizarUsuario(texto) -> string` (trim, minúsculas, remove acentos, espaços viram `.`); `usuarioValido(u) -> boolean`; `emailDoUsuario(u) -> string`; `usuarioDoEmail(email) -> string|null`; `paraLogin(entrada) -> string` (com "@": e-mail como digitado, trim/minúsculas; sem "@": `emailDoUsuario(normalizarUsuario(entrada))`); `sugerirUsuario(nomePessoa, nomeCondominio) -> string` (primeiro nome + primeira palavra significativa do condomínio, ignorando CONDOMINIO/RESIDENCIAL/DO/DA/DE; ex. "José Silva", "CONDOMINIO PRAIA DO CASTELO" → `jose.praia`).

- [ ] Step 1: testes (os exemplos acima; `usuarioValido('ab')` false, `('.jose')` false, `('jo..se')` false, `('jose.castelo')` true; `paraLogin(' José.PraiaDoCastelo ')` → `jose.praiadocastelo@porteiro.invalid`; `paraLogin('Sindico@Cond.com ')` → `sindico@cond.com`).
- [ ] Step 2–4: vermelho, implementar, verde + `npm test`.
- [ ] Step 5: commit `feat(portaria): regras do usuário do porteiro`.

### Task 2: API de porteiros como usuários

**Files:** Rewrite `api/admin/porteiros.js` (deixa de usar `lib/lista-portaria-api.js` para porteiros; unidades continuam); Create `test/api-admin-porteiros-usuarios.test.js`; remove/ajusta os casos de porteiros em `test/api-admin-listas-portaria.test.js`.

**Produces (HTTP, roles `super_admin`, `admin_cliente`):**
- `GET ?cliente_id=` → `[{ id, nome, usuario, ativo, criado_em }]` dos usuários role `portaria` do cliente (usuario derivado do e-mail técnico; e-mail normal aparece como está).
- `POST { cliente_id, nome, usuario, senha }` → valida (Task 1), `auth.admin.createUser({ email: emailDoUsuario(usuario), password, email_confirm: true })` e insere `usuarios` (role `portaria`, cliente_id, nome, email técnico, ativo). Se o insert falhar, apaga o usuário do Auth criado (sem usuário pela metade). Usuário já existente → 409 "Esse usuário já existe".
- `PUT ?id= { nome?, senha?, ativo? }` → só se o alvo for role `portaria` do mesmo cliente; senha via `auth.admin.updateUserById`; `ativo=false` também bloqueia o login (`ban_duration: '876000h'`; reativar remove o ban).
- `DELETE ?id=` → desativa (igual a `ativo=false`).
- Tudo auditado; erros sem detalhe interno (inclusive mensagens do Auth).

- [ ] Step 1: testes (Review Focus 1 e 2; síndico de outro cliente 403; alvo `admin_cliente` 403; operador 403; senha < 6 → 400; rollback do Auth quando o insert falha; GET devolve `usuario` sem domínio).
- [ ] Step 2–4: vermelho, implementar, verde + `npm test`.
- [ ] Step 5: commit `feat(portaria): porteiros com login próprio na API`.

### Task 3: Cadastro sai no nome do login

**Files:** Modify `api/admin/veiculos.js` (POST da portaria: `cadastrado_por = profile.nome`; `porteiro_id` opcional e ignorado), `test/api-admin-veiculos.test.js`.

- [ ] Step 1: testes (portaria sem `porteiro_id` → 201 com `p_cadastrado_por = profile.nome`; com `porteiro_id` qualquer → ignorado).
- [ ] Step 2–4: vermelho, implementar, verde.
- [ ] Step 5: commit `feat(portaria): cadastro da portaria no nome do login`.

### Task 4: Login por usuário e página da portaria sem escolha de turno

**Files:** Modify `dashboard/index.html` (login usa `usuarioPortariaLib.paraLogin`; rótulo "E-mail ou usuário"), `portaria/index.html` (mesmo no login; remove a tela "Quem está no turno", `CHAVE_PORTEIRO`, `porteiro_id`; topo mostra o nome do login + Sair), `portaria/manual.html` (turno → login), `test/portaria-pagina.test.js`, `test/portaria-telas.test.js`.

- [ ] Step 1: testes (login com usuário sem "@" chama `signInWithPassword` com o e-mail técnico; página não pede porteiro; POST sem `porteiro_id`).
- [ ] Step 2–4: vermelho, implementar, verde.
- [ ] Step 5: commit `feat(portaria): login por usuário e fim da escolha de porteiro`.

### Task 5: Banco — unidades com agrupador, andar e tipo

**Files:** Create `sql/migration-unidades-agrupador-tipo.sql`, `test/sql/unidades-agrupador-tipo.sql`.

**Produces:** `unidades` + `bloco text null check (bloco is null or length(trim(bloco)) between 1 and 40)`, `andar text null check (andar is null or length(trim(andar)) between 1 and 10)`, `tipo text not null default 'apartamento' check (tipo in ('apartamento','casa','sala','loja','lote','fip'))`; troca `uq_unidades_cliente_nome` por `uq_unidades_cliente_bloco_nome on (cliente_id, lower(coalesce(bloco,'')), lower(nome))`. Aditiva: código atual continua funcionando.

- [ ] Step 1: teste SQL (begin…rollback, padrão de `test/sql/portaria-base.sql`): mesma unidade em blocos diferentes ok; repetida no mesmo bloco (maiúsculas diferentes) → 23505; tipo inválido → 23514; linhas antigas ficam `tipo='apartamento'`, `bloco null`.
- [ ] Step 2–4: rodar migration + teste numa única chamada `execute_sql` com `begin; … rollback;` até `ok`. **Nunca `apply_migration` aqui.**
- [ ] Step 5: commit `feat(portaria): unidades com agrupador, andar e tipo (banco)`.

### Task 6: Regras de unidade (pura)

**Files:** Create `site/js/unidade.js`, `test/unidade.test.js`; Modify `package.json`.

**Produces (`window.unidadeLib`):** `TIPOS_UNIDADE` (ordem e rótulos dos Global Constraints); `tipoUnidade(id|rotulo) -> {id, rotulo}|null` (sem acento/maiúscula; aceita "fip", "FIP", "Fração Ideal", "FIP (Fração Ideal)"); `rotuloUnidade({bloco, nome}) -> string`; `expandirLote(texto) -> { nomes: string[], recusados: string[] }` (separadores e faixas dos Global Constraints, sem repetição); `linhasDaPlanilha(rows: object[]) -> { unidades: [{bloco, nome, andar, tipo}], recusadas: [{linha, motivo}] }`; `linhasParaPlanilha(unidades) -> object[]` (colunas exatas).

- [ ] Step 1: testes (`expandirLote('101 102, 103-105')` → 5; `'105-101'` aceita invertido; faixa > 500 recusada; `rotuloUnidade({bloco:'Torre 1', nome:'101'})` → `Torre 1 · 101`; planilha com tipo "fração ideal" → `fip`; tipo "galpão" recusado com motivo; unidade vazia recusada; duplicada no mesmo bloco recusada).
- [ ] Step 2–4: vermelho, implementar, verde.
- [ ] Step 5: commit `feat(portaria): regras de unidade (tipos, lote, planilha)`.

### Task 7: API de unidades estruturada

**Files:** Modify `api/admin/unidades.js` / `lib/lista-portaria-api.js` (só a parte de unidades), `test/api-admin-listas-portaria.test.js`.

**Produces:** `GET` devolve `id, bloco, nome, andar, tipo, ordem, rotulo`; `POST { cliente_id, unidades: [{bloco, nome, andar, tipo}] }` (mantém `texto` legado) → `{ criadas, ja_existiam, recusadas }`; `PUT ?id= { bloco?, nome?, andar?, tipo? }` (mesmo cliente; conflito → 409); `DELETE` como hoje. Roles de escrita: `super_admin`, `admin_cliente` (próprio cliente).

- [ ] Step 1: testes (estrutura, compat do `texto`, IDOR, 409 no PUT conflitante, tipo inválido recusado).
- [ ] Step 2–4: vermelho, implementar, verde.
- [ ] Step 5: commit `feat(portaria): API de unidades com agrupador, andar e tipo`.

### Task 8: Editor de unidades e gestão de porteiros (admin e painel)

**Files:** Create `site/js/editor-unidades.js` (estado puro + render; testável no VM), `test/editor-unidades.test.js`; Modify `admin/index.html` (aba Portaria: editor de unidades no lugar da caixa de texto; Porteiros vira lista de logins com "Novo porteiro" — nome, usuário sugerido editável, senha com mostrar —, "Trocar senha", "Desativar/Reativar"), `dashboard/index.html` (para `admin_cliente`: item "Portaria" no menu da conta abre um painel com as mesmas duas seções), `portaria/index.html` (seleção de unidade agrupada por bloco, rótulo `rotuloUnidade`), rótulos de unidade no painel/admin via `rotuloUnidade`.

Editor (referência EasyAlert): "Novo bloco/torre/quadra" (nome livre); um cartão por agrupador + "Sem bloco"; em cada cartão: campo de unidades em lote, andar, tipo do lote (padrão Apartamento), "Adicionar"; etiquetas removíveis com o tipo quando diferente de Apartamento; contadores "N blocos · N unidades"; "Baixar modelo (.xlsx)", "Exportar (.xlsx)", "Importar (.xlsx)" (importar carrega o editor e lista recusadas); "Salvar" envia só o que mudou (novas → POST, removidas → DELETE, alteradas → PUT). Nada é salvo sem "Salvar"; sair com alterações pede confirmação na própria página (sem `confirm()` nativo — usar o `confirmarAcao` existente).

- [ ] Step 1: testes do estado do editor (adicionar lote, remover etiqueta, trocar tipo, importar com recusadas, diff para salvar) e da gestão de porteiros (usuário sugerido, senha curta bloqueada, XSS em nome).
- [ ] Step 2–4: vermelho, implementar, verde; `node --check` dos scripts inline.
- [ ] Step 5: commit `feat(portaria): editor de unidades em massa e gestão de porteiros`.

### Task 9: Versão 1.10.0, manuais, segurança e publicação

- [ ] Step 1: novidade 1.10.0 (síndico: "Cada porteiro agora tem login próprio", "Cadastre unidades em massa por bloco, torre ou quadra, com o tipo da unidade, inclusive FIP (Fração Ideal)", "Planilha de unidades para importar e exportar"); package.json; rodapés; manuais (painel, admin, portaria).
- [ ] Step 2: `npm test` → 0.
- [ ] Step 3: `security-reviewer` na branch (foco: gestão de usuários pelo síndico, e-mail técnico, rollback do Auth, IDOR em unidades/porteiros, XSS no editor, SheetJS).
- [ ] Step 4: PR; aplicar `sql/migration-unidades-agrupador-tipo.sql` (aditiva) e merge com "pode publicar"; conferir no ar.
