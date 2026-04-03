# Guia de Implantacao — Protector Lombada Educativa
### v2.0 | Abril 2026

---

## Visao Geral

Este guia cobre a implantacao completa do sistema, desde a criacao do banco de dados ate o primeiro cliente funcionando. Siga na ordem.

**Requisitos:**
- Conta no [Supabase](https://supabase.com) (banco de dados + storage)
- Conta na [Vercel](https://vercel.com) (deploy + serverless)
- Repositorio GitHub com o codigo do projeto
- Servidor de email SMTP (cPanel ou Gmail)

---

## 1. Criar Projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie uma conta
2. Clique em **New Project**
3. Escolha nome, senha do banco e regiao (**South America - Sao Paulo** recomendado)
4. Aguarde a criacao do projeto
5. Anote as credenciais em **Settings > API**:

| Credencial | Variavel de ambiente | Onde usar |
|---|---|---|
| Project URL | `SUPABASE_URL` | Backend + Frontend |
| anon public key | `SUPABASE_ANON_KEY` | Frontend (dashboard/admin) |
| service_role key | `SUPABASE_SERVICE_KEY` | Backend (nunca expor!) |

---

## 2. Executar Schema SQL

1. No Supabase, va em **SQL Editor**
2. Execute os scripts na seguinte ordem:

| # | Arquivo | O que faz |
|---|---------|-----------|
| 1 | `sql/schema.sql` | Cria tabelas, indices, RLS e bucket de fotos |
| 2 | `sql/migration-admin.sql` | Tabela de usuarios admin |
| 3 | `sql/migration-pdf-config.sql` | Campos de personalizacao do PDF |
| 4 | `sql/migration-status.sql` | Campos de status das cameras |
| 5 | `sql/migration-storage-rls.sql` | Politicas de acesso ao Storage |

3. Verifique no **Table Editor** que as tabelas foram criadas: `clientes`, `cameras`, `capturas`, `veiculos`, `usuarios`, `email_destinatarios`, `audit_log`, `debug_log`

---

## 3. Verificar Storage

1. Va em **Storage** no painel do Supabase
2. O bucket `capturas-fotos` ja deve ter sido criado pelo `schema.sql`
3. Se nao aparecer, crie manualmente:
   - Nome: `capturas-fotos`
   - Public: **Nao**

---

## 4. Configurar Email SMTP

O sistema envia alertas por email. Suporta SMTP generico (cPanel) ou Gmail.

### Opcao A: SMTP cPanel (recomendado)

Crie uma conta de email no cPanel do dominio (ex: `alerta@seudominio.com.br`) e anote:

| Variavel | Valor |
|---|---|
| `SMTP_HOST` | `mail.seudominio.com.br` |
| `SMTP_PORT` | `465` |
| `SMTP_SECURE` | `true` |
| `SMTP_USER` | `alerta@seudominio.com.br` |
| `SMTP_PASS` | senha da conta |

### Opcao B: Gmail

1. Ative **Verificacao em 2 etapas** em [myaccount.google.com/security](https://myaccount.google.com/security)
2. Crie uma **Senha de app** (pesquise "App Passwords")
3. Anote:

| Variavel | Valor |
|---|---|
| `SMTP_USER` | `seu-email@gmail.com` |
| `SMTP_PASS` | senha de 16 caracteres gerada |

(Deixe `SMTP_HOST` vazio — o sistema detecta Gmail automaticamente)

---

## 5. Deploy na Vercel

### Via GitHub (recomendado)

1. Faca push do repositorio no GitHub
2. Acesse [vercel.com](https://vercel.com) e faca login com GitHub
3. Clique em **Add New > Project** e importe o repositorio
4. Configure as **Environment Variables**:

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
SUPABASE_ANON_KEY=eyJ...
SMTP_HOST=mail.seudominio.com.br
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=alerta@seudominio.com.br
SMTP_PASS=sua_senha
CRON_SECRET=gere-um-uuid-aleatorio
```

5. Clique em **Deploy**

### Via Vercel CLI

```bash
npm i -g vercel
cd protector-lombada
vercel login
vercel --prod
```

Configure as variaveis de ambiente no dashboard da Vercel apos o deploy.

### Cron de limpeza

O `vercel.json` ja configura o cron automatico (diario as 6h) para apagar capturas com mais de 15 dias. Para funcionar:
- Plano **Pro** da Vercel: funciona automaticamente
- Plano **Hobby**: use um servico externo (cron-job.org) para chamar `GET /api/cron-limpeza` com header `Authorization: Bearer SEU_CRON_SECRET`

---

## 6. Criar Super Admin

O primeiro usuario precisa ser criado via script:

```bash
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_KEY=eyJ... \
SUPER_ADMIN_EMAIL=admin@protector.com.br \
SUPER_ADMIN_SENHA=SuaSenhaSegura123 \
SUPER_ADMIN_NOME="Administrador Protector" \
node scripts/create-super-admin.js
```

Apos isso, acesse o painel admin em `https://seu-dominio.vercel.app/admin` e faca login.

**Todo o restante da operacao e feito pelo painel admin.** Nao e necessario SQL manual.

---

## 7. Adicionar Novo Cliente (Condominio)

No painel admin:

1. Va em **Clientes** > **+ Novo Cliente**
2. Preencha: nome, local/via, cidade/UF, limite de velocidade, CNPJ, telefone, contato
3. Salve

---

## 8. Cadastrar Camera

A camera ALPHADIGI se identifica automaticamente pelo numero de serie. Nao precisa de token na URL.

1. No painel admin, entre no cliente desejado
2. Na tab **Cameras** > **+ Nova Camera**
3. Preencha o **serial da camera** (esta na etiqueta fisica do equipamento, ou em Manutencao > Informacao do Dispositivo > Nr serie)
4. Opcionalmente preencha o nome de exibicao
5. Salve

**URL unica para todas as cameras:**
```
https://seu-dominio.vercel.app/placa
```

Todas as cameras de todos os clientes apontam para essa mesma URL. O sistema identifica cada camera pelo serial que vem no payload.

---

## 9. Configurar Camera Fisica

Veja o **MANUAL_TECNICO.md** (PARTE 3) para o passo a passo completo com todos os campos.

Resumo rapido:
- **Servidor**: `seu-dominio.vercel.app`
- **Porta**: `443`
- **Pasta**: `/placa`
- **Link SSL**: habilitado
- **Heartbeat**: habilitado, pasta `/placa`, intervalo `10`
- **Retransmissao**: habilitada, intervalo `2s`, tempo total `100s`

Apos configurar, reinicie a camera e aguarde 1-2 minutos.

---

## 10. Cadastrar Emails de Alerta

1. No painel admin, entre no cliente
2. Na tab **E-mails** > **+ Novo Destinatario**
3. Preencha nome, email e tipo:
   - `alerta` — recebe avisos de velocidade
   - `relatorio` — recebe relatorios periodicos
   - `todos` — recebe tudo

---

## 11. Personalizar PDF (opcional)

1. No painel admin, entre no cliente
2. Na tab **PDF**, configure:
   - Titulo (ex: "NOTIFICACAO ORIENTATIVA")
   - Subtitulo (ex: "Transitar em velocidade superior a maxima permitida")
   - Rodape (ex: "Administracao do Condominio - Gestao 2026")
   - URL da logo

---

## 12. Verificar Funcionamento

1. No painel admin, a camera deve aparecer como **Online** (bolinha verde)
2. Passe um veiculo na frente da camera
3. A captura deve aparecer no dashboard em ate 30 segundos
4. Se a velocidade for maior que o limite, o email de alerta deve chegar

---

## Checklist: Novo Condominio

- [ ] Criar cliente no painel admin
- [ ] Cadastrar camera com serial correto
- [ ] Configurar camera fisica (servidor, porta, SSL, pasta /placa)
- [ ] Reiniciar camera
- [ ] Verificar status Online no admin
- [ ] Cadastrar emails de alerta
- [ ] Criar usuario admin_cliente para o condominio
- [ ] Cadastrar veiculos dos moradores (opcional)
- [ ] Personalizar PDF (opcional)
- [ ] Testar: passar veiculo acima do limite e verificar email

---

## Estrutura de Arquivos

```
protector-lombada/
├── api/
│   ├── captura.js            ← Recebe dados da camera (POST)
│   ├── heartbeat.js          ← Health check das cameras
│   ├── cron-limpeza.js       ← Limpeza diaria (cron)
│   ├── config.js             ← Config publica do Supabase
│   └── admin/
│       ├── clientes.js       ← CRUD clientes
│       ├── cameras.js        ← CRUD cameras
│       ├── usuarios.js       ← CRUD usuarios
│       ├── veiculos.js       ← CRUD veiculos
│       ├── emails.js         ← CRUD destinatarios
│       └── dashboard.js      ← Stats do admin
├── lib/
│   ├── supabase.js           ← Cliente Supabase + helpers
│   ├── pdf-generator.js      ← Geracao do PDF (PDFKit)
│   ├── email-sender.js       ← Envio de email (Nodemailer)
│   ├── auth-middleware.js     ← Autenticacao JWT + auditoria
│   ├── rate-limiter.js       ← Rate limit por camera
│   └── validators.js         ← Validacao de inputs
├── admin/
│   └── index.html            ← Painel admin (SPA)
├── dashboard/
│   └── index.html            ← Dashboard monitoramento (SPA)
├── sql/                      ← Schema + migrations
├── scripts/
│   └── create-super-admin.js ← Criar primeiro admin
├── docs/
│   ├── IMPLANTACAO.md        ← Este arquivo
│   ├── MANUAL_TECNICO.md     ← Manual do tecnico de campo
│   └── MANUAL_USUARIO.md     ← Manual do usuario final
├── .env.example
├── package.json
└── vercel.json
```

---

## Troubleshooting

### Camera aparece Offline
1. Tem internet? Porta 443 (HTTPS) liberada?
2. Endereco do servidor esta correto? (sem erros de digitacao)
3. Serial cadastrado no admin bate com o serial real da camera?
4. Link SSL esta habilitado na camera?
5. Reiniciou a camera apos configurar?

### Email de alerta nao chega
1. Tem destinatario cadastrado na tab E-mails do cliente?
2. O veiculo passou acima do limite? (abaixo do limite nao envia)
3. Credenciais SMTP estao corretas nas variaveis de ambiente da Vercel?
4. Verifique caixa de spam
5. Veja logs em **Vercel > Functions > Logs** para erros de envio

### Dashboard nao carrega dados
1. Variaveis `SUPABASE_URL` e `SUPABASE_ANON_KEY` estao configuradas na Vercel?
2. O endpoint `/api/config` esta retornando as credenciais?
3. Confira as RLS policies no Supabase

### Capturas nao aparecem mas camera esta Online
1. A camera precisa ler uma placa para gerar captura — passe um veiculo
2. Verifique logs da Vercel para erros no processamento
3. Confira se o bucket `capturas-fotos` existe no Supabase Storage

---

## URLs do Sistema

| Recurso | Endereco |
|---|---|
| Dashboard | `https://seu-dominio.vercel.app/` |
| Painel Admin | `https://seu-dominio.vercel.app/admin` |
| Endpoint capturas | `https://seu-dominio.vercel.app/placa` |
| Endpoint heartbeat | `https://seu-dominio.vercel.app/api/heartbeat` |

---

**Protector Traffic Control** — Lombada Educativa — v2.0 | Abril 2026
