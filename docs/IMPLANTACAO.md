# Guia de Implantação — Protector Lombada Educativa

## 1. Criar Projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie uma conta
2. Clique em **New Project**
3. Escolha nome, senha do banco e região (preferencialmente São Paulo)
4. Aguarde a criação do projeto
5. Anote as credenciais em **Settings > API**:
   - **Project URL** → `SUPABASE_URL`
   - **anon public key** → `SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_KEY` (manter em segredo!)

## 2. Executar Schema SQL

1. No Supabase, vá em **SQL Editor**
2. Cole todo o conteúdo do arquivo `sql/schema.sql`
3. Clique em **Run**
4. Verifique que as 4 tabelas foram criadas em **Table Editor**

## 3. Configurar Storage

1. Vá em **Storage** no painel do Supabase
2. O bucket `capturas-fotos` já deve ter sido criado pelo SQL
3. Se não aparecer, crie manualmente:
   - Nome: `capturas-fotos`
   - Public: **Não** (as fotos serão acessadas via signed URL)

## 4. Criar Usuário de Autenticação

1. Vá em **Authentication > Users**
2. Clique em **Add User > Create New User**
3. Preencha e-mail e senha do administrador do condomínio
4. Copie o **User UID** gerado

## 5. Cadastrar Cliente

No **SQL Editor**, execute:

```sql
INSERT INTO clientes (user_id, nome, local_via, cidade_uf, cep, endereco, limite_velocidade, emails_notificacao)
VALUES (
  'COLE_O_USER_UID_AQUI',
  'Condomínio Parque das Flores',
  'Rua Principal - Via Interna',
  'São Paulo/SP',
  '01234-567',
  'Rua das Flores, 100',
  30,
  ARRAY['admin@condominio.com', 'portaria@condominio.com']
);
```

## 6. Cadastrar Câmera

```sql
INSERT INTO cameras (cliente_id, nome, token)
VALUES (
  (SELECT id FROM clientes WHERE nome = 'Condomínio Parque das Flores'),
  'Câmera Entrada Principal',
  'TOKEN_UNICO_SEGURO_AQUI'
);
```

> **Dica**: Gere um token seguro com: `openssl rand -hex 32`

## 7. Cadastrar Veículos (opcional)

```sql
INSERT INTO veiculos (cliente_id, placa, nome_morador, unidade, marca, cor)
VALUES
  ((SELECT id FROM clientes LIMIT 1), 'RPK5F09', 'João Silva', 'Bloco A - 101', 'Toyota Corolla', 'Prata'),
  ((SELECT id FROM clientes LIMIT 1), 'ABC1D23', 'Maria Santos', 'Bloco B - 205', 'Honda Civic', 'Preto');
```

## 8. Configurar Gmail App Password

1. Acesse [myaccount.google.com/security](https://myaccount.google.com/security)
2. Ative **Verificação em 2 etapas** (obrigatório)
3. Vá em **Senhas de app** (ou pesquise "App Passwords")
4. Crie uma senha para "Outro" → nome "Protector Lombada"
5. Copie a senha de 16 caracteres gerada → `GMAIL_APP_PASSWORD`

## 9. Deploy na Vercel

### Via GitHub (recomendado)

1. Crie um repositório no GitHub e faça push do projeto
2. Acesse [vercel.com](https://vercel.com) e faça login com GitHub
3. Clique em **Add New > Project**
4. Importe o repositório
5. Configure as **Environment Variables**:
   ```
   SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_SERVICE_KEY=eyJ...
   SUPABASE_ANON_KEY=eyJ...
   GMAIL_USER=seu-email@gmail.com
   GMAIL_APP_PASSWORD=abcd efgh ijkl mnop
   CRON_SECRET=seu-uuid-secreto
   ```
6. Clique em **Deploy**

### Via Vercel CLI

```bash
npm i -g vercel
cd protector-lombada
vercel login
vercel --prod
# Configure as variáveis de ambiente no dashboard da Vercel
```

## 10. Configurar Domínio do Dashboard

No `dashboard/index.html`, substitua as variáveis de configuração:

```javascript
const SUPABASE_URL = 'https://seu-projeto.supabase.co';
const SUPABASE_ANON_KEY = 'eyJ...sua_anon_key_aqui';
```

> **Importante**: Use a **anon key** (pública) no dashboard, nunca a service_role key.

## 11. Configurar a Câmera ALPHADIGI

Na interface da câmera ALPHADIGI Traffic Cam:

1. Acesse o menu **HTTP Push** ou **Platform Settings**
2. Configure:
   - **URL**: `https://seu-projeto.vercel.app/api/captura?token=TOKEN_DA_CAMERA`
   - **Method**: POST
   - **Format**: JSON (ou deixe padrão)
3. Salve e teste

## 12. Testar com cURL

### Teste básico (JSON):

```bash
curl -X POST "https://seu-projeto.vercel.app/api/captura?token=TOKEN_UNICO_SEGURO_AQUI" \
  -H "Content-Type: application/json" \
  -d '{
    "plate": "RPK5F09",
    "speed": "45",
    "time": "2025-03-21 14:57:02",
    "pixels": "194",
    "vehicleType": "car",
    "vehicleColor": "silver",
    "imageBase64": "/9j/4AAQSkZJRg=="
  }'
```

### Resposta esperada:
```json
{"ok": true, "id": "uuid-da-captura"}
```

### Teste do cron de limpeza:

```bash
curl -H "Authorization: Bearer seu-uuid-secreto" \
  "https://seu-projeto.vercel.app/api/cron-limpeza"
```

## 13. Adicionar Novo Cliente

Para cada novo condomínio:

1. Criar usuário no Supabase Auth
2. Inserir registro na tabela `clientes` com o `user_id`
3. Inserir câmera(s) com token(s) único(s)
4. Cadastrar veículos (opcional, para identificação no PDF)
5. Configurar a câmera com a URL + token

## Estrutura de Arquivos

```
protector-lombada/
├── api/
│   ├── captura.js          ← Recebe dados da câmera (POST)
│   └── cron-limpeza.js     ← Limpeza diária (GET, cron)
├── lib/
│   ├── supabase.js         ← Cliente Supabase + helpers
│   ├── pdf-generator.js    ← Geração do PDF (pdfkit)
│   └── email-sender.js     ← Envio de e-mail (nodemailer)
├── dashboard/
│   └── index.html          ← Dashboard SPA
├── sql/
│   └── schema.sql          ← Schema do banco
├── docs/
│   └── IMPLANTACAO.md      ← Este arquivo
├── .env.example
├── package.json
└── vercel.json
```

## Troubleshooting

### Câmera não envia dados
- Verifique se a URL está correta (incluindo o token)
- Teste a conectividade da câmera com a internet
- Verifique os logs em **Vercel > Functions > Logs**

### E-mail não chega
- Verifique se o App Password do Gmail está correto
- Verifique se a verificação em 2 etapas está ativa
- Confira se os e-mails estão cadastrados em `emails_notificacao`

### Dashboard não carrega dados
- Verifique se SUPABASE_URL e SUPABASE_ANON_KEY estão corretos no HTML
- Verifique se o user_id do Auth está vinculado ao cliente
- Confira as RLS policies no Supabase

### Cron não executa
- O cron da Vercel só funciona em projetos Pro ou com Hobby plan
- Para Hobby: use um serviço externo (cron-job.org) para chamar a URL
- Lembre de enviar o header `Authorization: Bearer CRON_SECRET`
