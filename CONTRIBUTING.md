# Contribuindo para o Protector Traffic Control

Guia para desenvolvedores da equipe Protector trabalharem neste repositório.

---

## Padrão de commits

Seguimos **Conventional Commits** em português:

```
<tipo>: <descrição curta em imperativo>

[corpo opcional explicando o porquê]
```

### Tipos aceitos

| Tipo | Uso |
|---|---|
| `feat` | Nova funcionalidade |
| `fix` | Correção de bug |
| `docs` | Mudança apenas em documentação |
| `refactor` | Refatoração sem mudança de comportamento |
| `perf` | Melhoria de performance |
| `test` | Adição ou ajuste de testes |
| `chore` | Tarefas de build, deps, config |
| `security` | Correção de vulnerabilidade |
| `UI` | Mudanças de interface |

### Exemplos

```
feat: adiciona importação de veículos via Excel
fix: corrige timezone nas capturas exibidas no dashboard
security: sanitiza input do serial da câmera contra SQL injection
docs: atualiza manual técnico com passo de reinicialização
```

---

## Fluxo de branches

- **`main`**: produção. Deploy automático na Vercel após merge.
- **`develop`**: integração (opcional, se o time preferir).
- **`feat/*`**: nova funcionalidade (ex: `feat/importacao-excel`).
- **`fix/*`**: correção de bug (ex: `fix/heartbeat-offline`).
- **`docs/*`**: apenas documentação (ex: `docs/github-readme`).
- **`security/*`**: correção de vulnerabilidade.
- **`refactor/*`**: refatoração.

### Fluxo padrão

```bash
git checkout main
git pull
git checkout -b feat/minha-feature

# ... código ...

git add .
git commit -m "feat: descrição"
git push -u origin feat/minha-feature

# abrir PR no GitHub
```

---

## Pull Requests

### Checklist antes de abrir PR

- [ ] Código testado localmente (`npm run dev`)
- [ ] Sem credenciais/tokens commitados
- [ ] Variáveis novas adicionadas ao `.env.example`
- [ ] Migrations SQL em `sql/` se schema mudou
- [ ] Documentação atualizada se comportamento mudou
- [ ] Commits seguem Conventional Commits

### Template de PR

```markdown
## O que muda
<descrição em 1-2 linhas>

## Por quê
<motivação/contexto>

## Como testar
1. ...
2. ...

## Checklist
- [ ] Testado localmente
- [ ] Docs atualizadas
- [ ] Sem breaking changes (ou documentadas)
```

---

## Padrões de código

### JavaScript (Node.js)

- **CommonJS** (`require`/`module.exports`) — compatibilidade com Vercel Functions
- **2 espaços** de indentação
- **async/await** sobre callbacks
- Validar **todos** os inputs de APIs públicas (`lib/validators.js`)
- **Nunca** expor `service_role key` ao frontend
- Tratar erros com `try/catch` e gravar em `debug_log` quando relevante

### SQL

- Nome de tabelas e colunas em **snake_case** e português
- **UUID** como PK em todas as tabelas novas
- **RLS habilitado** por padrão em tabelas novas
- Migrations em `sql/migration-<nome>.sql`, nunca editar `schema.sql` diretamente
- Sempre incluir `criado_em TIMESTAMPTZ DEFAULT now()`

### Frontend (dashboard/admin)

- HTML/JS puro (sem framework)
- **Nunca** armazenar `service_role key` no frontend
- Usar `anon key` do Supabase + RLS
- Atualização automática do dashboard a cada 30s

---

## Segurança

**Antes de commitar**:

- [ ] Sem `.env` no stage (`git status`)
- [ ] Sem tokens/senhas hardcoded
- [ ] Inputs validados e sanitizados
- [ ] Sem exposição de `SUPABASE_SERVICE_KEY` em código client-side

**Vulnerabilidades críticas**: criar branch `security/*` e abrir PR como prioridade.

---

## Testes locais

```bash
# Rodar dev server (Vercel emulado)
npm run dev

# Testar captura com payload mock
npm run test:captura

# Criar super admin (primeira vez)
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... \
SUPER_ADMIN_EMAIL=admin@protector.com.br \
SUPER_ADMIN_SENHA=SuaSenha \
node scripts/create-super-admin.js
```

---

## Deploy

- **Preview**: cada PR gera URL de preview automaticamente na Vercel
- **Produção**: merge em `main` dispara deploy automático

**Variáveis de ambiente**: gerenciadas no dashboard Vercel. Ao adicionar nova variável, documentar no `.env.example` e em `docs/IMPLANTACAO.md`.

---

## Contato

- **Repositório**: github.com/ProtectorAnalytics/protector-lombada
- **Dúvidas técnicas**: equipe Protector Sistemas

---

**Protector Sistemas** — Guia de contribuição · Abril 2026
