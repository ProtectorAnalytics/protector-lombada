# CLAUDE.md

Guia rápido para sessões do Claude Code neste repositório.

## Política de release

**Publicar quando estiver pronto** — instrução durável do dono (glauber@appps.com.br).

Sempre que um PR meu atender TODAS estas condições, posso mergear direto em `master` sem perguntar:

- `mergeable_state: clean` (sem conflitos)
- CI do Vercel Preview verde (`conclusion: success`)
- Sem reviews humanos pendentes ou comentários não resolvidos
- Sem migrations destrutivas pendentes de aprovação

Padrão de merge: **squash** (mantém histórico linear; PRs anteriores #13–#22 seguem esse formato).

Merge em `master` dispara deploy de produção automático no Vercel (alias: `lombada.appps.com.br`).

## Stack

- **Frontend:** HTML/CSS/JS vanilla (`admin/`, `dashboard/`, `site/`)
- **Backend:** Vercel Serverless Functions em `api/` (Node)
- **Banco:** Supabase (Postgres + Auth + Storage + Realtime + pg_cron)
- **Deploy:** Vercel (projeto `protector-lombada`, team `team_tpGHKhporzF2esCY3PaTfetG`)
- **WhatsApp:** WaSender API (alertas operacionais)

Sem build step. `npm run dev` usa `vercel dev` local.

## Convenções do repo

- Mensagens de commit em PT-BR, prefixo Conventional Commits (`feat(escopo):`, `fix(escopo):`, `refactor(escopo):`, `docs(escopo):`).
- Migrations SQL ficam em `sql/migration-*.sql` e são aplicadas via MCP do Supabase (`apply_migration`) — registre na descrição do PR.
- Lógica compartilhada front/back em `site/js/` (UMD: `module.exports` no Node, `window.<lib>` no browser). Ex.: `site/js/camera-status.js`.
- Nada de quebrar contrato dos endpoints `/api/placa` e `/api/heartbeat` (câmeras ALPHADIGI em produção dependem disso).
