# Arquitetura — Protector Traffic Control

> Visão técnica do fluxo de dados, componentes e decisões arquiteturais do sistema.

**Versão 2.0** · Abril 2026

---

## Visão geral

O Protector Traffic Control é uma aplicação **serverless multi-tenant** que integra câmeras ALPHADIGI físicas (hardware de terceiros) a uma plataforma web proprietária hospedada na Vercel, com persistência em Supabase.

```
┌──────────────┐    HTTPS POST    ┌──────────────┐    SQL/Storage    ┌──────────────┐
│   Câmera     │ ───────────────> │   Vercel     │ <───────────────> │  Supabase    │
│  ALPHADIGI   │   /placa (JSON   │   Functions  │                   │  PostgreSQL  │
│  (hardware)  │    + multipart)  │  (Node.js)   │                   │  + Storage   │
└──────────────┘                  └──────────────┘                   └──────────────┘
                                         │
                                         │ SMTP
                                         ▼
                                  ┌──────────────┐
                                  │  Nodemailer  │
                                  │  (alerta de  │
                                  │  velocidade) │
                                  └──────────────┘

                                         ▲
                                         │ HTTPS (JWT)
                                         │
                            ┌────────────┴────────────┐
                            │                         │
                    ┌──────────────┐          ┌──────────────┐
                    │  Dashboard   │          │ Painel Admin │
                    │  (cliente)   │          │(super_admin) │
                    └──────────────┘          └──────────────┘
```

---

## Fluxo: Captura de uma passagem

1. **Câmera ALPHADIGI** detecta veículo via sensor/radar
2. OCR extrai a placa; radar calcula velocidade; câmera tira foto
3. Câmera envia **HTTP POST multipart** para `https://<dominio>/placa` contendo:
   - Payload JSON `AlarmInfoPlate` (placa, velocidade, timestamp, `serialno`)
   - Arquivo de imagem do veículo
   - Arquivo de imagem da placa (cropped)
4. **Vercel Function** `api/captura.js` processa:
   - Parse multipart via **Busboy**
   - Rate limit check (120 req/min por câmera)
   - Identifica câmera por `token` (URL) OU por `serialno` (payload)
   - Valida inputs (`lib/validators.js`)
   - Otimiza imagem via **Sharp**
   - Upload da foto para Supabase Storage (bucket `capturas-fotos`)
   - Insert em `capturas` (PostgreSQL)
   - Atualiza `last_seen` da câmera
5. **Decisão de alerta**:
   - Se `velocidade > cliente.limite_velocidade` → gera PDF e envia e-mail
   - Caso contrário, apenas persiste

---

## Fluxo: Geração de alerta

1. `lib/pdf-generator.js` cria PDF com **PDFKit**:
   - Logo + títulos personalizados do cliente
   - Foto do veículo (signed URL do Storage)
   - Placa, velocidade, limite, data/hora
   - Nome do morador + unidade (lookup em `veiculos` pela placa)
   - Histórico de últimas 30 passagens da placa
2. `lib/email-sender.js` busca destinatários do cliente (tipo `alerta` ou `todos`)
3. **Nodemailer** envia e-mail com PDF anexo via SMTP configurado
4. `capturas.notificado` é marcado como `true`

---

## Fluxo: Heartbeat

- Câmera envia POST para `/placa` a cada 10 segundos com payload de heartbeat
- `api/captura.js` (ou endpoint `/api/heartbeat`) atualiza `cameras.last_seen`
- Frontend determina status pela diferença entre `now()` e `last_seen`:
  - **Online** (verde): < 5 min
  - **Alerta** (amarelo): 5-15 min
  - **Offline** (vermelho): > 15 min
  - **Aguardando** (azul): câmera nunca enviou dados

---

## Fluxo: Limpeza automática

- **Cron Vercel** dispara `GET /api/cron-limpeza` diariamente às 06:00 (configurado em `vercel.json`)
- Autentica via `Authorization: Bearer ${CRON_SECRET}`
- Deleta registros de `capturas` com `timestamp < NOW() - 15 days`
- Remove fotos órfãs do bucket `capturas-fotos`
- Limpa `debug_log` (> 6h)

---

## Modelo de dados

```
clientes (1) ──< (N) cameras
    │
    ├──< (N) veiculos
    ├──< (N) email_destinatarios
    └──< (N) capturas >── (1) cameras

usuarios ── cliente_id (N:1)

audit_log (append-only)
debug_log (rotacionado a cada 6h)
```

### Tabelas principais

| Tabela | Propósito |
|---|---|
| `clientes` | Condomínios/empresas; contém limite de velocidade, dados de contato, personalização de PDF |
| `cameras` | Câmeras ALPHADIGI cadastradas (serial é a chave de identificação) |
| `capturas` | Registro de cada passagem (placa, velocidade, foto, timestamp) |
| `veiculos` | Cadastro de placas conhecidas (morador, unidade, marca, cor) |
| `usuarios` | Usuários do sistema (super_admin / admin_cliente / operador) |
| `email_destinatarios` | Quem recebe alertas/relatórios por cliente |
| `audit_log` | Trilha de auditoria de operações sensíveis |
| `debug_log` | Logs de debug (auto-limpeza 6h) |

### Row Level Security (RLS)

Todas as tabelas têm RLS habilitado. Políticas típicas:

- `super_admin`: acesso total
- `admin_cliente`: acesso restrito ao `cliente_id` vinculado
- `operador`: leitura do `cliente_id` vinculado

---

## Identificação multi-tenant da câmera

Única URL pública (`/placa`) atende **todas as câmeras de todos os clientes**. A identificação é feita em duas estratégias (fallback):

1. **Token na URL** (legado): `/placa?token=abc123`
2. **Serial no payload**: `AlarmInfoPlate.serialno` — método atual, recomendado

A câmera ALPHADIGI envia o serial embutido no payload automaticamente. O backend faz lookup em `cameras.serial_number` e vincula a captura ao `cliente_id` correto.

---

## Decisões arquiteturais

### Por que serverless (Vercel Functions)

- **Custo**: pagamos por invocação, não por servidor ocioso
- **Escala automática**: lidam com picos (horário de pico do condomínio) sem intervenção
- **Zero ops**: sem gerenciamento de infraestrutura
- **Cold start mitigado**: Fluid Compute reutiliza instâncias entre requests

### Por que Supabase

- **PostgreSQL gerenciado** com RLS nativo (isolamento multi-tenant automático)
- **Storage integrado** com signed URLs
- **Auth nativo** (JWT)
- **Região Brasil** (São Paulo) — reduz latência e mantém dados em território nacional (LGPD)

### Por que HTTP Push (e não WebSocket/MQTT)

- A câmera ALPHADIGI **já oferece** HTTP Push nativo — zero desenvolvimento no firmware
- Simplicidade operacional: tecnologia TCP/HTTP já dominada
- Compatível com qualquer infraestrutura (inclusive serverless)

### Por que 15 dias de retenção

- **Princípio da necessidade** (LGPD art. 6º, III): mantemos o mínimo necessário
- Janela suficiente para notificar moradores sobre infrações recentes
- Reduz custo de storage
- Configurável por cliente (futuro)

### Por que URL única `/placa`

- Simplifica configuração de câmeras (um endereço para todas)
- Facilita rollout de novas câmeras (só precisa cadastrar serial no admin)
- Reduz risco de erros de digitação em campo

---

## Observabilidade

- **Vercel Logs**: acesso via dashboard Vercel → Functions → Logs
- **debug_log**: erros de captura gravados no banco (rotação 6h)
- **audit_log**: rastreio de operações admin
- **Métricas nativas da Vercel**: latência, invocações, erros

---

## Segurança

- Nenhum segredo no código (uso exclusivo de env vars da Vercel)
- `service_role` key **nunca** exposta ao frontend — usada apenas em funções backend
- Frontend usa `anon` key + RLS para isolamento
- CORS restritivo nos endpoints admin
- Validação de entrada em `lib/validators.js`
- Rate limit em `lib/rate-limiter.js`

---

## Próximos passos (roadmap técnico)

- [ ] Migrar autenticação admin para Supabase Auth (remover JWT custom)
- [ ] Implementar signed URL com TTL curto para fotos no dashboard
- [ ] Cron de relatórios semanais por cliente
- [ ] Webhook para integração com sistemas de portaria
- [ ] Retenção configurável por cliente (7/15/30 dias)
- [ ] Exportação LGPD completa de dados por titular

---

**Protector Traffic Control** — Arquitetura · v2.0 · Abril 2026
