# Manual Tecnico - Protector Traffic Control
## Lombada Educativa Inteligente
### Versao 1.0.1 | Build 2ea9b40 | Marco 2026

---

## Sumario

1. [Visao Geral da Arquitetura](#1-visao-geral-da-arquitetura)
2. [Stack Tecnologica](#2-stack-tecnologica)
3. [Variaveis de Ambiente](#3-variaveis-de-ambiente)
4. [Banco de Dados (Supabase)](#4-banco-de-dados-supabase)
5. [Cadastrar Novo Cliente](#5-cadastrar-novo-cliente)
6. [Cadastrar Usuarios](#6-cadastrar-usuarios)
7. [Cadastrar Cameras](#7-cadastrar-cameras)
8. [Configurar Camera Fisica (ALPHADIGI)](#8-configurar-camera-fisica-alphadigi)
9. [Configurar Destinatarios de Email](#9-configurar-destinatarios-de-email)
10. [Fluxo de Captura (Pipeline)](#10-fluxo-de-captura-pipeline)
11. [Geracao de PDF e Notificacao](#11-geracao-de-pdf-e-notificacao)
12. [Endpoints da API](#12-endpoints-da-api)
13. [Deploy e Infraestrutura](#13-deploy-e-infraestrutura)
14. [Cron Jobs (Limpeza Automatica)](#14-cron-jobs-limpeza-automatica)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Visao Geral da Arquitetura

```
┌─────────────────────┐     ┌──────────────────────────────┐
│  Camera ALPHADIGI   │────>│  Vercel Serverless (API)     │
│  (LPR - Leitura de  │     │  POST /api/captura           │
│   Placas + Radar)   │     │                              │
└─────────────────────┘     │  ┌────────────────────────┐  │
                            │  │ Validacao do Token      │  │
                            │  │ Rate Limiting (120/min) │  │
                            │  │ Normalizacao de Dados   │  │
                            │  │ Upload de Foto          │  │
                            │  │ Registro da Captura     │  │
                            │  │ Geracao de PDF          │  │
                            │  │ Envio de Email          │  │
                            │  └────────────────────────┘  │
                            └──────────┬───────────────────┘
                                       │
                            ┌──────────▼───────────────────┐
                            │  Supabase                     │
                            │  - PostgreSQL (dados)         │
                            │  - Auth (autenticacao)        │
                            │  - Storage (fotos capturas)   │
                            └──────────┬───────────────────┘
                                       │
                            ┌──────────▼───────────────────┐
                            │  Dashboard Web                │
                            │  /dashboard/ (clientes)       │
                            │  /admin/ (super_admin)        │
                            └───────────────────────────────┘
```

---

## 2. Stack Tecnologica

| Componente         | Tecnologia                              |
|--------------------|-----------------------------------------|
| Backend            | Node.js (Vercel Serverless Functions)   |
| Banco de Dados     | Supabase (PostgreSQL)                   |
| Autenticacao       | Supabase Auth (JWT)                     |
| Armazenamento      | Supabase Storage (bucket `capturas-fotos`) |
| Frontend Dashboard | HTML/CSS/JS (SPA vanilla)               |
| PDF                | PDFKit (server-side)                    |
| Email              | Nodemailer (SMTP ou Gmail)              |
| Deploy             | Vercel                                  |
| Camera             | ALPHADIGI LPR (protocolo HTTP/JSON)     |

---

## 3. Variaveis de Ambiente

Configurar no painel do Vercel em **Settings > Environment Variables**:

### Obrigatorias

| Variavel            | Descricao                                    | Exemplo                              |
|---------------------|----------------------------------------------|--------------------------------------|
| `SUPABASE_URL`      | URL do projeto Supabase                      | `https://abc123.supabase.co`         |
| `SUPABASE_SERVICE_KEY` | Service Role Key (acesso admin)           | `eyJhbGciOiJI...`                    |
| `SUPABASE_ANON_KEY` | Anon Key (acesso publico, usado no frontend) | `eyJhbGciOiJI...`                    |
| `CRON_SECRET`       | Token para autenticar cron jobs              | `uuid-v4-aleatorio`                  |

### Email (SMTP - cPanel/Hosting)

| Variavel     | Descricao          | Exemplo                   |
|--------------|--------------------| --------------------------|
| `SMTP_HOST`  | Servidor SMTP      | `mail.seudominio.com.br`  |
| `SMTP_PORT`  | Porta              | `465`                     |
| `SMTP_SECURE`| SSL/TLS            | `true`                    |
| `SMTP_USER`  | Email do remetente | `alerta@seudominio.com.br`|
| `SMTP_PASS`  | Senha do email     | `suaSenha123`             |

### Email (Alternativa Gmail)

| Variavel             | Descricao                    | Exemplo                 |
|----------------------|------------------------------|-------------------------|
| `GMAIL_USER`         | Conta Gmail                  | `seu@gmail.com`         |
| `GMAIL_APP_PASSWORD` | Senha de App (16 caracteres) | `abcd efgh ijkl mnop`  |

> **Nota:** Para Gmail, gerar senha de app em: Google Account > Seguranca > Senhas de app

---

## 4. Banco de Dados (Supabase)

### Tabelas Principais

#### `clientes`
| Coluna               | Tipo       | Descricao                                |
|----------------------|------------|------------------------------------------|
| `id`                 | UUID (PK)  | Identificador unico                      |
| `user_id`            | UUID (FK)  | Referencia ao auth.users (admin_cliente)  |
| `nome`               | TEXT        | Nome do condominio/empresa               |
| `local_via`          | TEXT        | Rua/via onde a lombada esta instalada    |
| `cidade_uf`          | TEXT        | Cidade/UF                                |
| `cep`                | TEXT        | CEP                                      |
| `endereco`           | TEXT        | Endereco completo                        |
| `limite_velocidade`  | INTEGER     | Limite em km/h (padrao: 30)              |
| `cnpj`               | TEXT        | CNPJ do cliente                          |
| `telefone`           | TEXT        | Telefone de contato                      |
| `contato_nome`       | TEXT        | Nome do contato principal                |
| `pdf_titulo`         | TEXT        | Titulo personalizado no PDF              |
| `pdf_subtitulo`      | TEXT        | Subtitulo no PDF                         |
| `pdf_rodape`         | TEXT        | Rodape no PDF                            |
| `pdf_logo_url`       | TEXT        | URL do logotipo para o PDF               |
| `notif_auto_ativa`   | BOOLEAN     | Notificacoes automaticas ativas          |
| `ativo`              | BOOLEAN     | Se o cliente esta ativo                  |

#### `usuarios`
| Coluna      | Tipo       | Descricao                                     |
|-------------|------------|-----------------------------------------------|
| `id`        | UUID (PK)  | Identificador unico                           |
| `auth_id`   | UUID (FK)  | Referencia ao auth.users                      |
| `cliente_id`| UUID (FK)  | Cliente vinculado                             |
| `nome`      | TEXT        | Nome do usuario                               |
| `email`     | TEXT        | Email                                         |
| `role`      | TEXT        | `super_admin`, `admin_cliente`, ou `operador`  |
| `ativo`     | BOOLEAN     | Se o usuario esta ativo                       |

#### `cameras`
| Coluna           | Tipo       | Descricao                          |
|------------------|------------|------------------------------------|
| `id`             | UUID (PK)  | Identificador unico                |
| `cliente_id`     | UUID (FK)  | Cliente vinculado                  |
| `nome`           | TEXT        | Nome descritivo (ex: "Entrada A")  |
| `token`          | TEXT (UNIQUE)| Token de autenticacao (32 hex)   |
| `serial_number`  | TEXT        | Numero de serie da camera (fallback)|
| `ativa`          | BOOLEAN     | Se a camera esta ativa             |
| `last_seen`      | TIMESTAMP   | Ultima comunicacao                 |
| `last_capture_id`| UUID        | Ultima captura registrada          |

#### `veiculos`
| Coluna         | Tipo       | Descricao                      |
|----------------|------------|--------------------------------|
| `id`           | UUID (PK)  | Identificador unico            |
| `cliente_id`   | UUID (FK)  | Cliente vinculado              |
| `placa`        | TEXT        | Placa do veiculo (uppercase)   |
| `nome_morador` | TEXT        | Nome do proprietario/morador   |
| `unidade`      | TEXT        | Unidade/apartamento            |
| `marca`        | TEXT        | Marca/modelo do veiculo        |
| `cor`          | TEXT        | Cor do veiculo                 |
| `ativo`        | BOOLEAN     | Se o registro esta ativo       |

#### `capturas`
| Coluna         | Tipo       | Descricao                          |
|----------------|------------|------------------------------------|
| `id`           | UUID (PK)  | Identificador unico                |
| `camera_id`    | UUID (FK)  | Camera que realizou a captura      |
| `cliente_id`   | UUID (FK)  | Cliente vinculado                  |
| `placa`        | TEXT        | Placa detectada                    |
| `velocidade`   | INTEGER     | Velocidade registrada (km/h)       |
| `pixels`       | INTEGER     | Nivel de confianca (0-200)         |
| `tipo_veiculo` | TEXT        | Tipo detectado                     |
| `cor_veiculo`  | TEXT        | Cor detectada                      |
| `foto_path`    | TEXT        | Caminho no Storage                 |
| `timestamp`    | TIMESTAMP   | Data/hora da captura               |
| `notificado`   | BOOLEAN     | Se a notificacao foi enviada       |
| `notificado_em`| TIMESTAMP   | Data/hora do envio da notificacao  |

#### `email_destinatarios`
| Coluna       | Tipo       | Descricao                                    |
|--------------|------------|----------------------------------------------|
| `id`         | UUID (PK)  | Identificador unico                          |
| `cliente_id` | UUID (FK)  | Cliente vinculado                            |
| `nome`       | TEXT        | Nome do destinatario                         |
| `email`      | TEXT        | Email                                        |
| `tipo`       | TEXT        | `alerta`, `relatorio`, ou `todos`            |
| `ativo`      | BOOLEAN     | Se esta ativo                                |

---

## 5. Cadastrar Novo Cliente

### Passo a Passo

#### 5.1. Acesse o Painel Admin
1. Abra `https://seudominio.vercel.app/admin`
2. Faca login com credenciais de **super_admin**

#### 5.2. Crie o Cliente
1. Na secao **Clientes**, clique em **"Novo Cliente"**
2. Preencha os campos:
   - **Nome**: Nome do condominio/empresa (ex: "Condominio Jardim das Flores")
   - **Local/Via**: Via onde a lombada esta instalada (ex: "Rua das Palmeiras")
   - **Cidade/UF**: (ex: "Sao Paulo/SP")
   - **Limite de Velocidade**: Velocidade maxima em km/h (padrao: 30)
   - **CNPJ**: CNPJ do cliente
   - **Telefone**: Telefone de contato
   - **Contato**: Nome do responsavel
3. Clique em **"Salvar"**
4. Anote o **ID do cliente** gerado (UUID)

#### 5.3. Via API (alternativa)
```bash
curl -X POST https://seudominio.vercel.app/api/admin/clientes \
  -H "Authorization: Bearer SEU_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Condominio Jardim das Flores",
    "local_via": "Rua das Palmeiras",
    "cidade_uf": "Sao Paulo/SP",
    "limite_velocidade": 30,
    "cnpj": "12345678000199",
    "telefone": "11999887766",
    "contato_nome": "Carlos Silva"
  }'
```

---

## 6. Cadastrar Usuarios

### Roles (Papeis)

| Role            | Permissoes                                             |
|-----------------|--------------------------------------------------------|
| `super_admin`   | Acesso total: todos os clientes, cameras, usuarios     |
| `admin_cliente` | Gerencia 1 cliente: cameras, veiculos, emails, capturas|
| `operador`      | Somente visualizacao do dashboard do cliente           |

### 6.1. Criar Usuario Admin do Cliente

1. No painel admin, secao **Usuarios**
2. Clique em **"Novo Usuario"**
3. Preencha:
   - **Email**: email do usuario
   - **Senha**: minimo 6 caracteres
   - **Nome**: nome completo
   - **Cliente**: selecione o cliente associado
   - **Role**: selecione `admin_cliente`
4. Clique em **"Criar"**

> **Importante:** O primeiro usuario `admin_cliente` de um cliente sera automaticamente vinculado como administrador principal daquele cliente.

### 6.2. Via API
```bash
curl -X POST https://seudominio.vercel.app/api/admin/usuarios \
  -H "Authorization: Bearer SEU_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@condominio.com",
    "senha": "senha123",
    "nome": "Carlos Silva",
    "cliente_id": "UUID_DO_CLIENTE",
    "role": "admin_cliente"
  }'
```

### 6.3. Criar Operadores Adicionais
Repita o processo com role `operador` para usuarios que precisam apenas visualizar o dashboard.

---

## 7. Cadastrar Cameras

### 7.1. Pelo Painel Admin

1. Na secao **Cameras**, clique em **"Nova Camera"**
2. Selecione o **cliente**
3. Informe o **nome** descritivo (ex: "Camera Entrada Principal")
4. Clique em **"Criar"**
5. **COPIE O TOKEN GERADO** - ele sera exibido apenas uma vez

> **IMPORTANTE:** O token e gerado automaticamente (32 caracteres hexadecimais). Guarde-o em local seguro. Este token sera configurado na camera fisica.

### 7.2. Via API
```bash
curl -X POST https://seudominio.vercel.app/api/admin/cameras \
  -H "Authorization: Bearer SEU_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cliente_id": "UUID_DO_CLIENTE",
    "nome": "Camera Entrada Principal"
  }'
```

**Resposta:**
```json
{
  "id": "uuid-da-camera",
  "nome": "Camera Entrada Principal",
  "token": "a1b2c3d4e5f6...32chars",
  "ativa": true
}
```

### 7.3. Formato do Token
- 32 caracteres hexadecimais (gerado via `crypto.randomBytes(16)`)
- Unico por camera
- Imutavel apos criacao
- Usado na URL de envio de capturas

---

## 8. Configurar Camera Fisica (ALPHADIGI)

### 8.1. Acesse a Interface da Camera

1. Conecte-se a camera via navegador (IP local da camera)
2. Acesse **Configuracoes > Rede > Servidor HTTP**

### 8.2. Configure o Endpoint de Envio

| Campo             | Valor                                                      |
|-------------------|------------------------------------------------------------|
| **Protocolo**     | HTTPS                                                      |
| **Metodo**        | POST                                                       |
| **URL de Destino**| `https://seudominio.vercel.app/api/captura?token=SEU_TOKEN`|
| **Content-Type**  | `application/json`                                         |
| **Porta**         | 443                                                        |

### 8.3. Formato do Payload Esperado (AlarmInfoPlate)

A camera ALPHADIGI envia automaticamente neste formato:

```json
{
  "AlarmInfoPlate": {
    "serialno": "NUMERO_SERIE_CAMERA",
    "result": {
      "PlateResult": {
        "license": "ABC1D23",
        "confidence": 194,
        "carColor": "silver",
        "type": "car",
        "speed": 45,
        "radarSpeed": {
          "Speed": {
            "PerHour": 45
          }
        },
        "imageFile": "data:image/jpeg;base64,/9j/4AAQ..."
      }
    }
  }
}
```

### 8.4. Autenticacao da Camera

**Metodo primario:** Token na URL
```
POST /api/captura?token=a1b2c3d4e5f6...
```

**Metodo secundario (fallback):** Numero de serie
- Se o token nao for fornecido, o sistema busca pelo campo `serialno` no payload
- O numero de serie deve estar cadastrado no campo `serial_number` da tabela `cameras`
- Para usar este metodo, edite a camera e adicione o serial:
```bash
curl -X PUT https://seudominio.vercel.app/api/admin/cameras \
  -H "Authorization: Bearer SEU_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "UUID_DA_CAMERA",
    "serial_number": "ALPHADIGI_SN_123"
  }'
```

### 8.5. Verificar Funcionamento

Apos configurar, verifique:

1. **Heartbeat:** A camera envia sinais periodicos
   - No dashboard, o status da camera aparece como **"Online"** (verde)
   - A camera e considerada offline se nao enviar dados em 5 minutos

2. **Teste de captura:** Passe um veiculo na frente da camera
   - Verifique no dashboard se a captura aparece na secao "Ultimas Capturas"
   - Verifique se a foto foi armazenada corretamente

---

## 9. Configurar Destinatarios de Email

### 9.1. Pelo Dashboard do Cliente

1. Faca login no dashboard como `admin_cliente`
2. Na secao **"Emails de Alerta"**, clique em **"Adicionar"**
3. Preencha nome, email e tipo:
   - **alerta**: recebe notificacoes de velocidade acima do limite
   - **relatorio**: recebe relatorios periodicos
   - **todos**: recebe tudo
4. Clique em **"Salvar"**

### 9.2. Via API
```bash
curl -X POST https://seudominio.vercel.app/api/admin/emails \
  -H "Authorization: Bearer SEU_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cliente_id": "UUID_DO_CLIENTE",
    "nome": "Portaria Central",
    "email": "portaria@condominio.com",
    "tipo": "alerta"
  }'
```

---

## 10. Fluxo de Captura (Pipeline)

```
Camera envia POST /api/captura?token=xxx
         │
         ▼
   ┌─ Autenticacao ──┐
   │ Token valido?    │──Nao──> 401 Unauthorized
   │ Camera ativa?    │──Nao──> 403 Forbidden
   │ Cliente ativo?   │──Nao──> 403 Forbidden
   └────────┬─────────┘
            │ Sim
            ▼
   ┌─ Rate Limiting ──┐
   │ < 120 req/min?   │──Nao──> 429 Too Many Requests
   └────────┬──────────┘
            │ Sim
            ▼
   ┌─ Parsing Payload ─────────────┐
   │ Extrair: placa, velocidade,   │
   │ confianca, cor, tipo, foto    │
   │ Normalizar placa (uppercase)  │
   │ Velocidade: radarSpeed > speed│
   └────────┬──────────────────────┘
            │
            ▼
   ┌─ Upload Foto ─────────────────┐
   │ Base64 → Buffer               │
   │ Path: {cliente}/{camera}/     │
   │        {timestamp}_{placa}.jpg│
   │ Bucket: capturas-fotos        │
   └────────┬──────────────────────┘
            │
            ▼
   ┌─ Salvar Captura ──────────────┐
   │ INSERT em capturas            │
   │ UPDATE camera.last_seen       │
   └────────┬──────────────────────┘
            │
            ▼
   ┌─ Verificar Velocidade ────────┐
   │ velocidade > limite_cliente?  │──Nao──> 200 OK (fim)
   └────────┬──────────────────────┘
            │ Sim (infracao)
            ▼
   ┌─ Gerar PDF ──────────────────┐
   │ Dados da captura + veiculo   │
   │ Historico ultimos 30 dias    │
   │ Logotipo do cliente          │
   └────────┬─────────────────────┘
            │
            ▼
   ┌─ Enviar Email ───────────────┐
   │ Para todos destinatarios     │
   │ tipo = 'alerta' ou 'todos'  │
   │ Anexo: PDF da notificacao   │
   └────────┬─────────────────────┘
            │
            ▼
   ┌─ Marcar Notificado ──────────┐
   │ UPDATE captura               │
   │ notificado = true            │
   │ notificado_em = now()        │
   └──────────────────────────────┘
```

---

## 11. Geracao de PDF e Notificacao

### Estrutura do PDF

O PDF gerado automaticamente contem:

1. **Cabecalho**: Logotipo + titulo personalizado do cliente
2. **Dados da Infracao**:
   - Placa do veiculo
   - Velocidade registrada vs limite permitido
   - Data e hora
   - Camera que registrou
3. **Foto da Captura**: Imagem do veiculo no momento
4. **Dados do Proprietario** (se cadastrado):
   - Nome do morador
   - Unidade/apartamento
5. **Historico de Passagens**: Ultimas 30 passagens do veiculo (tabela)
6. **Rodape**: Texto personalizado do cliente

### Personalizacao do PDF

Via painel admin ou API, edite o cliente:
```json
{
  "pdf_titulo": "CONDOMINIO JARDIM DAS FLORES",
  "pdf_subtitulo": "Lombada Educativa - Controle de Velocidade",
  "pdf_rodape": "Este documento e meramente educativo e nao tem valor de multa.",
  "pdf_logo_url": "https://seusite.com/logo.png"
}
```

---

## 12. Endpoints da API

### Autenticacao
Todos os endpoints admin requerem header:
```
Authorization: Bearer <JWT_TOKEN_SUPABASE>
```

### Endpoints Publicos

| Metodo | Endpoint          | Descricao                    |
|--------|-------------------|------------------------------|
| GET    | `/api/config`     | Retorna SUPABASE_URL e ANON_KEY |
| POST   | `/api/captura`    | Recebe capturas das cameras  |
| GET    | `/api/heartbeat`  | Heartbeat das cameras        |

### Endpoints Admin (requer `super_admin`)

| Metodo | Endpoint              | Descricao                      |
|--------|-----------------------|--------------------------------|
| GET    | `/api/admin/clientes` | Listar todos os clientes       |
| POST   | `/api/admin/clientes` | Criar novo cliente             |
| PUT    | `/api/admin/clientes` | Atualizar cliente              |
| DELETE | `/api/admin/clientes` | Desativar cliente (soft delete)|
| GET    | `/api/admin/usuarios` | Listar usuarios                |
| POST   | `/api/admin/usuarios` | Criar usuario                  |
| PUT    | `/api/admin/usuarios` | Atualizar usuario              |
| DELETE | `/api/admin/usuarios` | Desativar usuario              |
| GET    | `/api/admin/cameras`  | Listar cameras                 |
| POST   | `/api/admin/cameras`  | Criar camera (gera token)      |
| PUT    | `/api/admin/cameras`  | Atualizar camera               |
| DELETE | `/api/admin/cameras`  | Desativar camera               |

### Endpoints Admin/Cliente (requer `admin_cliente` ou superior)

| Metodo | Endpoint               | Descricao                      |
|--------|------------------------|--------------------------------|
| GET    | `/api/admin/veiculos`  | Listar veiculos do cliente     |
| POST   | `/api/admin/veiculos`  | Cadastrar veiculo              |
| PUT    | `/api/admin/veiculos`  | Atualizar veiculo              |
| DELETE | `/api/admin/veiculos`  | Desativar veiculo              |
| GET    | `/api/admin/emails`    | Listar destinatarios           |
| POST   | `/api/admin/emails`    | Adicionar destinatario         |
| PUT    | `/api/admin/emails`    | Atualizar destinatario         |
| DELETE | `/api/admin/emails`    | Desativar destinatario         |
| GET    | `/api/admin/dashboard` | Dados do dashboard             |

---

## 13. Deploy e Infraestrutura

### Vercel

O projeto esta configurado para deploy automatico no Vercel.

**Arquivo `vercel.json`:**
- Rotas API: `/api/*` → Serverless Functions
- Dashboard: `/` → `/dashboard/index.html`
- Admin: `/admin` → `/admin/index.html`
- Cron: Execucao diaria as 06:00 UTC

### Passo a Passo do Deploy

1. Conecte o repositorio GitHub ao Vercel
2. Configure as variaveis de ambiente (secao 3)
3. Deploy automatico a cada push na branch `master`

### Dominio Personalizado

1. No Vercel, va em **Settings > Domains**
2. Adicione seu dominio (ex: `lombada.seudominio.com.br`)
3. Configure o DNS (CNAME para `cname.vercel-dns.com`)

---

## 14. Cron Jobs (Limpeza Automatica)

### Configuracao

Definido no `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron-limpeza",
    "schedule": "0 6 * * *"
  }]
}
```

### Funcionamento

- **Horario:** Todos os dias as 06:00 UTC (03:00 Brasilia)
- **Acao:** Remove capturas com mais de 15 dias
- **Inclui:** Deleta registros do banco + fotos do Storage
- **Autenticacao:** `Authorization: Bearer {CRON_SECRET}`

---

## 15. Troubleshooting

### Camera nao aparece como Online

1. Verifique se o token esta correto na URL da camera
2. Verifique se a camera tem acesso a internet (HTTPS porta 443)
3. Verifique nos logs do Vercel se a requisicao esta chegando
4. Teste manualmente:
```bash
curl -X POST "https://seudominio.vercel.app/api/captura?token=TOKEN_DA_CAMERA" \
  -H "Content-Type: application/json" \
  -d '{"AlarmInfoPlate":{"serialno":"TEST","result":{"PlateResult":{"license":"TEST123","speed":20,"confidence":180,"imageFile":"data:image/jpeg;base64,/9j/4AAQ"}}}}'
```

### Emails nao estao sendo enviados

1. Verifique as variaveis SMTP no Vercel
2. Teste a conexao SMTP:
```bash
telnet mail.seudominio.com 465
```
3. Verifique se ha destinatarios cadastrados para o cliente
4. Verifique se a velocidade da captura excede o limite do cliente
5. Verifique nos logs do Vercel por erros de envio

### Fotos nao aparecem no dashboard

1. Verifique se o bucket `capturas-fotos` existe no Supabase
2. Verifique as politicas RLS do Storage
3. Execute a migration `migration-storage-rls.sql` se necessario

### Erro 429 (Too Many Requests)

- A camera esta enviando mais de 120 requisicoes por minuto
- Verifique a configuracao de frequencia de envio na camera
- Ajuste o intervalo minimo entre capturas na interface da camera

### Usuario nao consegue fazer login

1. Verifique se o usuario existe na tabela `usuarios` E no `auth.users`
2. Verifique se o campo `ativo = true`
3. Verifique se o `auth_id` esta correto
4. Resete a senha pelo painel admin (PUT `/api/admin/usuarios`)

---

## Checklist para Novo Cliente

- [ ] Criar cliente no painel admin
- [ ] Criar usuario admin_cliente
- [ ] Criar camera(s) e anotar token(s)
- [ ] Configurar camera fisica com a URL + token
- [ ] Cadastrar destinatarios de email
- [ ] Importar lista de veiculos (Excel)
- [ ] Personalizar PDF (titulo, logo, rodape)
- [ ] Testar captura e envio de email
- [ ] Enviar credenciais de acesso ao cliente

---

**Protector Traffic Control** - v1.0.1 | Build 2ea9b40 | Marco 2026
