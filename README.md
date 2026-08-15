# Protector Traffic Control

> Plataforma web para gerenciamento de **Lombadas Educativas Inteligentes** com câmeras ALPHADIGI — detecção de placas, medição de velocidade por radar e notificação automática para condomínios e vias privadas.

**Versão 2.0** · Proprietário: [Protector Sistemas](https://protectorsistemas.com.br)

---

## O que é

Sistema SaaS que integra câmeras ALPHADIGI instaladas em lombadas educativas, captura placas e velocidade dos veículos que passam, e gera notificações em PDF por e-mail quando o limite configurado é ultrapassado. O documento é **meramente educativo** — não tem valor de multa oficial.

**Casos de uso:**
- Condomínios residenciais com lombada interna
- Vias privadas (hotéis, resorts, empresas, universidades)
- Controle de velocidade orientativo em áreas de pedestres

---

## Arquitetura em 1 parágrafo

A câmera ALPHADIGI instalada no local envia (via HTTP Push) os dados de cada passagem para um endpoint único na Vercel (`/placa`). O backend identifica a câmera pelo serial embutido no payload, valida, salva a foto no Supabase Storage e os metadados no PostgreSQL. Se a velocidade excede o limite do cliente, gera um PDF personalizado via PDFKit e dispara e-mail (Nodemailer/SMTP) para os destinatários cadastrados. Dashboard web em tempo real e painel admin multi-tenant complementam o fluxo.

Fluxo completo em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

---

## Stack

| Camada | Tecnologia |
|---|---|
| **Runtime** | Node.js serverless (Vercel Functions) |
| **Banco de dados** | Supabase (PostgreSQL + RLS) |
| **Storage** | Supabase Storage (bucket privado) |
| **Frontend** | HTML + JS (SPA) — `dashboard/` e `admin/` |
| **PDF** | PDFKit |
| **E-mail** | Nodemailer (SMTP cPanel / Gmail) |
| **Imagens** | Sharp (redimensionamento/otimização) |
| **Hardware** | Câmeras ALPHADIGI (radar + OCR de placa) |
| **Deploy** | Vercel + Cron de limpeza diária |

---

## Documentação

| Documento | Para quem | Conteúdo |
|---|---|---|
| [`docs/MANUAL_USUARIO.md`](docs/MANUAL_USUARIO.md) | Síndico / operador | Como usar dashboard, cadastrar veículos, gerenciar alertas |
| [`docs/MANUAL_TECNICO.md`](docs/MANUAL_TECNICO.md) | Técnico de campo | Configuração completa da câmera ALPHADIGI (campo a campo) |
| [`docs/IMPLANTACAO.md`](docs/IMPLANTACAO.md) | DevOps / admin | Deploy do zero: Supabase → Vercel → primeiro cliente |
| [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) | TI / auditoria | Fluxo de dados, diagrama e decisões técnicas |
| [`docs/LGPD.md`](docs/LGPD.md) | Jurídico / DPO | Papéis, bases legais, retenção, medidas de segurança |

---

## Quick start

```bash
# 1. Clonar e instalar
git clone https://github.com/ProtectorAnalytics/protector-lombada.git
cd protector-lombada
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# (preencher SUPABASE_*, SMTP_* e CRON_SECRET)

# 3. Rodar localmente
npm run dev   # usa vercel dev
```

Deploy em produção: seguir [`docs/IMPLANTACAO.md`](docs/IMPLANTACAO.md).

---

## Endpoints principais

| Rota | Método | Função |
|---|---|---|
| `/placa` | POST | Recebe capturas das câmeras ALPHADIGI |
| `/api/heartbeat` | POST | Sinal de vida das câmeras (a cada 10 s) |
| `/api/config` | GET | Config pública do Supabase para frontend |
| `/api/cron-limpeza` | GET | Limpeza de capturas > 15 dias (cron diário 06:00) |
| `/api/admin/*` | CRUD | Clientes, câmeras, usuários, veículos, e-mails, dashboard |
| `/admin` | UI | Painel multi-tenant (super_admin) |
| `/dashboard` | UI | Dashboard do cliente (admin_cliente / operador) |

---

## Limites operacionais

- **Rate limit**: 120 req/min por câmera
- **Retenção de capturas**: 15 dias (apagadas por cron diário)
- **Offline threshold**: câmera marcada como offline após 5 min sem heartbeat
- **Tamanho máx. de foto**: otimizado via Sharp antes do upload

---

## Segurança

- Conexão HTTPS obrigatória
- Autenticação JWT (Supabase Auth)
- Row Level Security (RLS) habilitado em todas as tabelas
- Bucket de fotos **privado** (acesso via signed URL)
- Rate limit por câmera
- Log de auditoria (`audit_log`) para operações sensíveis
- Três perfis de acesso: `super_admin`, `admin_cliente`, `operador`

Tratamento de dados pessoais detalhado em [`docs/LGPD.md`](docs/LGPD.md).

---

## Estrutura do repositório

```
protector-lombada/
├── api/              # Vercel Functions (serverless)
│   ├── admin/        # Endpoints do painel admin (CRUD)
│   ├── captura.js    # Recebe dados das câmeras
│   ├── heartbeat.js  # Health check das câmeras
│   └── cron-limpeza.js
├── lib/              # Lógica compartilhada (Supabase, PDF, e-mail, auth)
├── site/             # Landing page
├── dashboard/        # SPA do cliente
├── admin/            # SPA do admin
├── sql/              # Schema + migrations do Supabase
├── scripts/          # Utilitários (create-super-admin, etc.)
├── docs/             # Documentação
├── .env.example
├── vercel.json
└── package.json
```

---

## Contribuindo

Contribuições internas seguem o guia em [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

## Licença

Software proprietário. Todos os direitos reservados à Protector Sistemas. Ver [`LICENSE`](LICENSE).

---

**Protector Traffic Control** — Lombada Educativa Inteligente
