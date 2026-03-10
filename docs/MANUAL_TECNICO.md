# Manual Tecnico — Protector Lombada Educativa

**Versao:** 1.0.0
**Data:** Março 2026
**Sistema:** Plataforma de Gerenciamento de Lombadas Educativas

---

## 1. VISAO GERAL DA ARQUITETURA

```
┌──────────────────────────────────────────────────────────┐
│                   CAMERAS ALPHADIGI                       │
│              (LPR + Sensor Doppler + LED)                │
│                                                          │
│   Camera 1 ──┐    Camera 2 ──┐    Camera N ──┐          │
└──────────────┼───────────────┼───────────────┼──────────┘
               │ HTTP POST     │ HTTP POST     │ HTTP POST
               ▼               ▼               ▼
┌──────────────────────────────────────────────────────────┐
│                     VERCEL (Serverless)                    │
│                                                          │
│   ┌─────────────────┐   ┌──────────────────┐            │
│   │  /api/captura.js │   │ /api/cron-limpeza│            │
│   │  (POST)          │   │ (GET - Cron)     │            │
│   └────────┬─────────┘   └────────┬─────────┘            │
│            │                      │                      │
│   ┌────────┴──────────────────────┴─────────┐            │
│   │              /lib/                       │            │
│   │  supabase.js | pdf-generator.js          │            │
│   │  email-sender.js                         │            │
│   └──────────────────────────────────────────┘            │
│                                                          │
│   ┌─────────────────┐   ┌──────────────────┐            │
│   │  /api/config.js  │   │ /dashboard/      │            │
│   │  (GET - publico) │   │  index.html      │            │
│   └─────────────────┘   └──────────────────┘            │
└────────────────────────┬─────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────┐
│                      SUPABASE                             │
│                                                          │
│   ┌──────────┐  ┌───────────┐  ┌──────────────┐        │
│   │ PostgreSQL│  │  Storage   │  │  Auth         │        │
│   │ (Banco)  │  │  (Fotos)   │  │  (Login)      │        │
│   │          │  │            │  │               │        │
│   │ clientes │  │ capturas-  │  │ email+senha   │        │
│   │ cameras  │  │ fotos/     │  │ → user_id     │        │
│   │ veiculos │  │            │  │               │        │
│   │ capturas │  │            │  │               │        │
│   └──────────┘  └───────────┘  └──────────────┘        │
│                                                          │
│   RLS: Cada cliente so ve seus proprios dados            │
└──────────────────────────────────────────────────────────┘
```

---

## 2. ESTRUTURA DE ARQUIVOS

```
protector-lombada/
├── api/
│   ├── captura.js          # Endpoint principal - recebe dados da camera
│   ├── config.js           # Serve credenciais publicas do Supabase
│   └── cron-limpeza.js     # Limpeza automatica de dados > 15 dias
├── lib/
│   ├── supabase.js         # Cliente Supabase + funcoes helper
│   ├── pdf-generator.js    # Geracao de PDF de notificacao (pdfkit)
│   └── email-sender.js     # Envio de e-mail SMTP (nodemailer)
├── dashboard/
│   └── index.html          # Dashboard SPA (HTML+CSS+JS inline)
├── sql/
│   └── schema.sql          # Schema completo do banco de dados
├── scripts/
│   ├── setup-supabase.js   # Setup automatico do Supabase
│   └── test-captura.sh     # Script de teste via cURL
├── docs/
│   ├── MANUAL_TECNICO.md   # Este arquivo
│   ├── MANUAL_USUARIO.md   # Manual do usuario final
│   └── IMPLANTACAO.md      # Guia rapido de implantacao
├── .env.example            # Modelo de variaveis de ambiente
├── .gitignore
├── package.json
└── vercel.json             # Configuracao de deploy + cron
```

---

## 3. BANCO DE DADOS

### 3.1 Diagrama de Tabelas

```
┌─────────────┐       ┌────────────┐
│   clientes   │──────<│   cameras   │
│──────────────│  1:N  │────────────│
│ id (PK)      │       │ id (PK)    │
│ user_id (FK) │       │ cliente_id │
│ nome         │       │ nome       │
│ local_via    │       │ token (UQ) │
│ cidade_uf    │       │ ativa      │
│ limite_vel.  │       └────────────┘
│ emails_notif.│              │
│ ativo        │              │ 1:N
└──────┬───────┘              │
       │ 1:N                  │
       │                ┌─────▼──────┐
┌──────▼───────┐       │  capturas   │
│   veiculos   │       │────────────│
│──────────────│       │ id (PK)    │
│ id (PK)      │       │ camera_id  │
│ cliente_id   │       │ cliente_id │
│ placa        │       │ placa      │
│ nome_morador │       │ velocidade │
│ unidade      │       │ foto_path  │
│ ativo        │       │ timestamp  │
└──────────────┘       │ notificado │
                       └────────────┘
```

### 3.2 Tabela: clientes

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | UUID (PK) | Identificador unico |
| user_id | UUID (FK → auth.users) | Vinculo com Supabase Auth |
| nome | TEXT | Nome do condominio |
| local_via | TEXT | Local/via da lombada |
| cidade_uf | TEXT | Cidade e UF |
| cep | TEXT | CEP |
| endereco | TEXT | Endereco completo |
| limite_velocidade | INT | Limite em km/h (default: 30) |
| emails_notificacao | TEXT[] | Array de e-mails para alertas |
| logo_url | TEXT | URL do logo (para PDF) |
| ativo | BOOLEAN | Cliente ativo |
| criado_em | TIMESTAMPTZ | Data de criacao |

### 3.3 Tabela: cameras

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | UUID (PK) | Identificador unico |
| cliente_id | UUID (FK) | Cliente proprietario |
| nome | TEXT | Nome da camera |
| token | TEXT (UNIQUE) | Token de autenticacao da API |
| ativa | BOOLEAN | Camera ativa |
| criado_em | TIMESTAMPTZ | Data de criacao |

### 3.4 Tabela: veiculos

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | UUID (PK) | Identificador unico |
| cliente_id | UUID (FK) | Cliente proprietario |
| placa | TEXT | Placa do veiculo |
| nome_morador | TEXT | Nome do morador |
| unidade | TEXT | Bloco/Apartamento |
| marca | TEXT | Marca/modelo |
| cor | TEXT | Cor do veiculo |
| ativo | BOOLEAN | Veiculo ativo |

### 3.5 Tabela: capturas

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | UUID (PK) | Identificador unico |
| camera_id | UUID (FK) | Camera que capturou |
| cliente_id | UUID (FK) | Cliente |
| placa | TEXT | Placa detectada (LPR) |
| velocidade | INT | Velocidade em km/h |
| pixels | INT | Pixels LPR |
| tipo_veiculo | TEXT | Tipo (car, truck, etc) |
| cor_veiculo | TEXT | Cor detectada |
| foto_path | TEXT | Caminho no Storage |
| timestamp | TIMESTAMPTZ | Data/hora da captura |
| notificado | BOOLEAN | E-mail enviado? |
| notificado_em | TIMESTAMPTZ | Quando foi notificado |

### 3.6 Indices

- `idx_cameras_token` — Busca rapida por token na autenticacao
- `idx_capturas_timestamp` — Ordenacao das capturas (mais recentes primeiro)
- `idx_capturas_placa` — Busca por placa
- `idx_capturas_cliente_id` — Filtro por cliente
- `idx_clientes_user_id` — Vinculo Auth → Cliente

### 3.7 Row Level Security (RLS)

Todas as tabelas possuem RLS ativado. As policies garantem que:

- **clientes**: `SELECT` onde `auth.uid() = user_id`
- **cameras**: `SELECT` onde `cliente_id` pertence ao usuario logado
- **veiculos**: `SELECT` onde `cliente_id` pertence ao usuario logado
- **capturas**: `SELECT` onde `cliente_id` pertence ao usuario logado

A API serverless usa `SUPABASE_SERVICE_KEY` (service role) que **bypassa** o RLS — necessario para as operacoes de escrita vindas das cameras.

---

## 4. API — ENDPOINTS

### 4.1 POST /api/captura

**Funcao:** Recebe dados de captura da camera ALPHADIGI.

**Autenticacao:** Query param `?token=TOKEN_DA_CAMERA`

**Content-Types aceitos:**
- `application/json`
- `multipart/form-data`
- `application/x-www-form-urlencoded`

**Campos esperados:**

| Campo | Alternativas | Tipo | Obrigatorio |
|-------|-------------|------|-------------|
| plate | placa | string | Sim |
| speed | velocidade | string/int | Sim |
| time | timestamp | string (datetime) | Nao (usa now()) |
| pixels | pixels | string/int | Nao |
| vehicleType | tipo_veiculo | string | Nao |
| vehicleColor | cor_veiculo | string | Nao |
| imageBase64 | image, foto | string (base64) | Nao |

**Fluxo interno:**

```
1. Validar token → buscar camera + cliente
2. Parsear body (auto-detecta formato)
3. Normalizar campos (uppercase placa, parseInt speed)
4. Se tem foto: decodificar base64 → upload ao Storage
5. Inserir registro na tabela capturas
6. Se velocidade > limite:
   a. Buscar dados do veiculo (nome_morador, unidade)
   b. Buscar ultimas 30 passagens da mesma placa
   c. Gerar PDF de notificacao
   d. Enviar e-mail com PDF em anexo
   e. Marcar captura como notificada
7. Retornar { ok: true, id: uuid }
```

**Respostas:**

| HTTP | Corpo | Situacao |
|------|-------|----------|
| 200 | `{ ok: true, id: "uuid" }` | Captura salva |
| 400 | `{ error: "Placa nao fornecida" }` | Dados invalidos |
| 401 | `{ error: "Token invalido" }` | Token nao encontrado |
| 403 | `{ error: "Cliente inativo" }` | Cliente desativado |
| 405 | `{ error: "Metodo nao permitido" }` | Nao e POST |
| 500 | `{ error: "Erro interno" }` | Erro no servidor |

### 4.2 GET /api/config

**Funcao:** Retorna credenciais publicas do Supabase para o dashboard.

**Autenticacao:** Nenhuma (dados publicos por design — anon key).

**Resposta:**
```json
{
  "supabaseUrl": "https://xxx.supabase.co",
  "supabaseAnonKey": "eyJ..."
}
```

### 4.3 GET /api/cron-limpeza

**Funcao:** Deleta capturas com mais de 15 dias e suas fotos.

**Autenticacao:** Header `Authorization: Bearer CRON_SECRET`

**Fluxo interno:**
1. Verificar header de autorizacao
2. Buscar capturas com `timestamp < now() - 15 dias` (lote de 100)
3. Deletar fotos do Storage
4. Deletar registros do banco
5. Repetir ate zerar ou atingir 1000 registros
6. Retornar contagem de deletados

**Cron Schedule:** `0 6 * * *` (diariamente as 06:00 UTC = 03:00 BRT)

**Resposta:**
```json
{
  "ok": true,
  "deletados": 47,
  "timestamp": "2026-03-10T06:00:01.234Z"
}
```

---

## 5. GERACAO DE PDF

### 5.1 Layout

O PDF replica o formato da notificacao do IN IOT:

```
┌──────────────────────────────────────┐
│  NOTIFICACAO ORIENTATIVA (vermelho)  │
│  Transitar em velocidade superior... │
│  [NOME DO CONDOMINIO] (negrito)      │
│  [LOCAL_VIA] - [CIDADE_UF]          │
│  Lombada Educativa (laranja)         │
├──────────────────────────────────────┤
│ PLACA VEICULO  │ MORADOR │ UNIDADE  │
│ RPK5F09 (verm) │ Joao    │ Bl.A 101 │
├──────────────────────────────────────┤
│ VELOCIDADE  │ DATA      │ HORA     │
│ 55 km/h     │ 21/03/2025│ 14:57:02 │
│ (vermelho)  │ (negrito) │ (negrito)│
├──────────────────────────────────────┤
│                                      │
│        [FOTO DO VEICULO]             │
│        (largura total)               │
│                                      │
├──────────────────────────────────────┤
│ "Velocidades <= 10km/h registradas   │
│  como 1 neste relatorio."           │
│                                      │
│ [NOME DO CONDOMINIO]                 │
│ Ultimas passagens / Velocidades      │
├──┬──┬──┬──┬──┬──┬──┬──┬──┬──┤
│DT│DT│DT│DT│DT│DT│DT│DT│DT│DT│  Grid
│HR│HR│HR│HR│HR│HR│HR│HR│HR│HR│  10 cols
│VL│VL│VL│VL│VL│VL│VL│VL│VL│VL│  x linhas
├──┴──┴──┴──┴──┴──┴──┴──┴──┴──┤
│ Sistema de monitoramento |    │
│ Protector Sistemas de Seg.   │
└──────────────────────────────────────┘
```

### 5.2 Cores

- Placa e velocidade: **#CC0000** (vermelho)
- Titulo "Lombada Educativa": **#FF6B00** (laranja)
- Headers de tabela: **#666666** (cinza)
- Velocidade no historico acima do limite: **#CC0000**
- Bordas do grid: **#CCCCCC**

### 5.3 Regra especial

Velocidades <= 10 km/h sao registradas como **1** no PDF.

---

## 6. E-MAIL (SMTP)

### 6.1 Configuracao

O sistema suporta dois modos de SMTP:

**Modo cPanel/Hospedagem (recomendado):**
```
SMTP_HOST=mail.seudominio.com.br
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=alerta@seudominio.com.br
SMTP_PASS=senha
```

**Modo Gmail:**
```
GMAIL_USER=email@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
```

Se `SMTP_HOST` esta definido, usa SMTP generico. Senao, usa Gmail.

### 6.2 Formato do E-mail

- **From:** "Protector Lombada" <email_configurado>
- **To:** Lista de emails_notificacao do cliente
- **Subject:** "Alerta de Velocidade - [PLACA] - [CONDOMINIO]"
- **Body:** HTML com tabela de resumo (placa, velocidade, limite, local, data, hora)
- **Anexo:** PDF de notificacao

### 6.3 Limites

- Gmail gratuito: ~500 e-mails/dia
- cPanel: depende da hospedagem (geralmente 500-2000/dia)

---

## 7. DASHBOARD

### 7.1 Tecnologia

SPA (Single Page Application) em HTML+CSS+JS puro, sem framework.
Supabase JS SDK carregado via CDN.

### 7.2 Autenticacao

1. Tela de login com e-mail/senha
2. Supabase Auth valida credenciais
3. Busca cliente via `user_id = auth.uid()`
4. Se nao encontrar cliente vinculado, rejeita login

### 7.3 Componentes

| Componente | Descricao |
|------------|-----------|
| Stats Cards | 4 cards: passagens hoje, alertas hoje, vel. maxima, limite |
| Filtros | Data inicial/final, placa, vel. min/max |
| Tabela | 200 registros, scroll, velocidade color-coded |
| Modal | Foto + todos os dados ao clicar na linha |
| Grafico | Barras: passagens por hora (Canvas API) |
| Ranking | Top 8 placas dos ultimos 15 dias |

### 7.4 Cores da velocidade na tabela

| Cor | Condicao |
|-----|----------|
| Verde (#00c853) | Velocidade <= limite |
| Laranja (#ff9800) | Limite+1 ate limite+20 |
| Vermelho (#ff1744) | > limite+20 |

### 7.5 Polling

Atualizacao automatica a cada **30 segundos** via `setInterval`.

---

## 8. SEGURANCA

### 8.1 Autenticacao

| Acesso | Metodo |
|--------|--------|
| Camera → API | Token unico por camera (query param) |
| Usuario → Dashboard | Supabase Auth (email + senha) |
| Cron → Limpeza | Bearer token (CRON_SECRET) |

### 8.2 Isolamento de dados

- **RLS (Row Level Security)**: Cada cliente so ve seus dados
- **Service Key**: Usada apenas no backend (nunca exposta ao frontend)
- **Anon Key**: Usada no dashboard (segura pois RLS protege os dados)

### 8.3 Storage

- Bucket **privado** (nao publico)
- Fotos acessadas via **signed URLs** (expiracao de 5 minutos)
- Caminho inclui `cliente_id` para organizacao

---

## 9. VARIAVEIS DE AMBIENTE

| Variavel | Descricao | Obrigatoria |
|----------|-----------|-------------|
| SUPABASE_URL | URL do projeto Supabase | Sim |
| SUPABASE_SERVICE_KEY | Service role key (backend) | Sim |
| SUPABASE_ANON_KEY | Anon key (frontend) | Sim |
| SMTP_HOST | Host SMTP (cPanel) | Sim* |
| SMTP_PORT | Porta SMTP (465 ou 587) | Sim* |
| SMTP_SECURE | true para SSL (465) | Sim* |
| SMTP_USER | E-mail remetente | Sim |
| SMTP_PASS | Senha do e-mail | Sim |
| CRON_SECRET | Secret para autenticar o cron | Sim |

*Se usar Gmail, defina apenas GMAIL_USER e GMAIL_APP_PASSWORD.

---

## 10. DEPLOY E INFRAESTRUTURA

### 10.1 Vercel

- **Plano:** Free ou Pro
- **Funcoes:** Node.js serverless (maxDuration: 30s para captura)
- **Static:** Dashboard servido como arquivo estatico
- **Cron:** Configurado no vercel.json (diario as 06:00 UTC)
- **Dominio:** Customizavel via Vercel Dashboard

### 10.2 Supabase

- **Plano:** Free (500MB banco, 1GB storage, 50k auth users)
- **Regiao:** Recomendado: South America (sa-east-1) ou mais proximo
- **Backup:** Automatico (diario, retencao 7 dias no plano Free)

### 10.3 Limites do Free Tier

| Recurso | Limite Vercel Free | Limite Supabase Free |
|---------|-------------------|---------------------|
| Funcoes | 100GB-hrs/mes | N/A |
| Storage | N/A | 1GB |
| Banco | N/A | 500MB |
| Bandwidth | 100GB/mes | 5GB/mes |
| Cron | 1x/dia max | N/A |

---

## 11. MANUTENCAO

### 11.1 Adicionar novo cliente

1. Criar usuario no Supabase Auth
2. Inserir na tabela `clientes` com `user_id`
3. Inserir camera(s) com token(s) unico(s)
4. Configurar e-mails de notificacao
5. Cadastrar veiculos (opcional)
6. Configurar camera ALPHADIGI com URL + token

### 11.2 Adicionar nova camera

```sql
INSERT INTO cameras (cliente_id, nome, token)
VALUES ('uuid-do-cliente', 'Camera Saida', 'token-unico-hex');
```

### 11.3 Alterar limite de velocidade

```sql
UPDATE clientes SET limite_velocidade = 20 WHERE id = 'uuid';
```

### 11.4 Monitoramento

- **Logs Vercel:** Dashboard Vercel → Functions → Logs
- **Banco:** Supabase Dashboard → Table Editor
- **Storage:** Supabase Dashboard → Storage → capturas-fotos
- **E-mails:** Verificar caixa de saida do SMTP configurado

### 11.5 Troubleshooting

| Problema | Solucao |
|----------|---------|
| Camera nao envia dados | Verificar URL + token na camera. Testar com curl |
| E-mail nao chega | Verificar SMTP_HOST, porta, credenciais. Testar envio manual |
| Dashboard nao carrega | Verificar /api/config retorna JSON valido |
| Dados nao aparecem | Verificar RLS policies e vinculo user_id |
| Foto nao aparece no modal | Verificar bucket existe e foto_path esta correto |
| Cron nao executa | Verificar plano Vercel e CRON_SECRET |

---

## 12. FORMATO DE DADOS DA CAMERA ALPHADIGI

### 12.1 Exemplo de payload JSON

```json
{
  "plate": "RPK5F09",
  "speed": "20",
  "time": "2025-03-21 14:57:02",
  "pixels": "194",
  "vehicleType": "car",
  "vehicleColor": "silver",
  "imageBase64": "/9j/4AAQSkZJRg..."
}
```

### 12.2 Mapeamento de campos

A API aceita nomes em ingles (padrao ALPHADIGI) e portugues:

| ALPHADIGI | Alternativa PT | Campo no banco |
|-----------|---------------|----------------|
| plate | placa | placa |
| speed | velocidade | velocidade |
| time | timestamp | timestamp |
| pixels | pixels | pixels |
| vehicleType | tipo_veiculo | tipo_veiculo |
| vehicleColor | cor_veiculo | cor_veiculo |
| imageBase64 | image, foto | foto_path (storage) |

---

*Protector Sistemas de Seguranca Eletronica — Documento Tecnico v1.0.0*
