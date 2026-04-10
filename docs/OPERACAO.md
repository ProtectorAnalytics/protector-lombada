# Manual de Operação — Protector Traffic Control

> Procedimentos operacionais, segurança e manutenção do sistema.
> Documento complementar à LGPD.md e POLITICA_PRIVACIDADE.md.

**Versão 1.0** · Abril 2026

---

## 1. Procedimentos de Segurança

### 1.1 Rotação de chaves e credenciais

A Protector Sistemas adota o princípio de **rotação periódica** de credenciais administrativas para reduzir a superfície de ataque em caso de vazamento.

#### Periodicidade recomendada

| Credencial | Rotação | Responsável |
|---|---|---|
| `SUPABASE_SERVICE_KEY` | **Trimestral** | DPO/Super admin |
| `SUPABASE_ANON_KEY` | Anual | DPO/Super admin |
| `CRON_SECRET` | Trimestral | DPO/Super admin |
| `SMTP_PASS` (provedor de e-mail) | Semestral | DPO/Super admin |
| Senhas de super_admin | Semestral | Cada usuário |
| Tokens de câmera ALPHADIGI | Quando houver incidente ou troca de equipamento | Técnico responsável |

#### Procedimento de rotação da Service Key do Supabase

1. Acessar o Supabase Dashboard → Settings → API
2. Clicar em **Generate new service_role secret**
3. Copiar a nova chave
4. No Vercel Dashboard → Project → Settings → Environment Variables:
   - Editar `SUPABASE_SERVICE_KEY` com a nova chave
   - Salvar em **Production**, **Preview** e **Development**
5. Fazer **Redeploy** da última build para aplicar a nova variável
6. Confirmar que as APIs continuam funcionando (`/api/heartbeat`, `/api/admin/dashboard`)
7. No Supabase Dashboard → Settings → API → revogar a chave antiga
8. Registrar a rotação em `audit_log` ou neste arquivo (seção 5 — histórico)

#### Procedimento de rotação do CRON_SECRET

1. Gerar um UUID v4 aleatório: `openssl rand -hex 32` ou `uuidgen`
2. Atualizar `CRON_SECRET` no Vercel Dashboard (mesmo fluxo acima)
3. Redeploy
4. Os crons nativos da Vercel usam `x-vercel-cron-signature` automaticamente, não sofrem impacto
5. Clientes externos que chamam os crons via Bearer precisam receber a nova chave

---

### 1.2 Autenticação de dois fatores (2FA / MFA)

O Supabase Auth suporta MFA nativamente a partir do plano Pro. A Protector Sistemas recomenda e habilita o MFA obrigatório para todas as contas `super_admin`.

#### Como habilitar MFA no Supabase (plano Pro)

1. Supabase Dashboard → Authentication → Providers → Enable **Multi-Factor Authentication**
2. Escolher o fator: **TOTP** (Time-based One-Time Password) ou **SMS**
3. Cada `super_admin` deve, no próximo login:
   - Escanear o QR code com Google Authenticator, Authy, 1Password ou similar
   - Confirmar o código de 6 dígitos
4. A partir desse momento, todo login de super_admin exige o código TOTP

#### Plano Free — alternativas

Se o projeto está no plano Free do Supabase, o MFA nativo não está disponível. Alternativas:

- **Senhas fortes obrigatórias** (mínimo 16 caracteres, mistura de letras/números/símbolos)
- **Restrição de IP** no Supabase Dashboard (limitar acesso admin a IPs conhecidos)
- **Migração ao plano Pro** quando o volume de clientes justificar (recomendado)

---

### 1.3 Monitoramento e detecção de anomalias

#### Indicadores a observar diariamente

| Indicador | Fonte | Sinal de alerta |
|---|---|---|
| Erros de autenticação repetidos | Supabase Dashboard → Logs → Auth | > 10 falhas em 5 minutos do mesmo IP |
| Operações admin em massa | Tabela `audit_log` | > 50 operações de um usuário em 1 hora |
| Captura com velocidade anômala | Tabela `capturas` | > 300 km/h (provável erro do radar ou hardware adulterado) |
| Pico de requisições `/api/captura` | Vercel Logs | > 500 req/min global (possível flood) |
| `debug_log` com muitas entradas | Tabela `debug_log` | Quantidade cresce rapidamente (erros ativos) |
| Fotos órfãs no Storage | Supabase Dashboard → Storage | Volume cresce sem capturas novas |

#### Procedimento em caso de anomalia

1. **Identificar** o indicador afetado
2. **Isolar** o agente (IP, usuário, câmera) via `audit_log` ou logs
3. **Bloquear** temporariamente:
   - Usuário: desativar em `usuarios` via painel admin
   - Câmera: desativar em `cameras` via painel admin
   - IP: adicionar ao bloqueio no Vercel ou Supabase
4. **Investigar** a causa raiz
5. **Documentar** o incidente em `audit_log` com ação `investigacao`
6. **Se houver vazamento de dados pessoais**, seguir o procedimento da seção 1.4

---

### 1.4 Resposta a Incidentes de Segurança (LGPD Art. 48)

Um **incidente de segurança** é qualquer evento que possa acarretar risco ou dano relevante aos titulares de dados pessoais. Exemplos:

- Vazamento de fotos ou metadados
- Acesso não autorizado ao banco ou Storage
- Perda de dados por falha técnica
- Exploração de vulnerabilidade conhecida
- Comprometimento de credencial administrativa

#### Fluxo de resposta — primeiras 24 horas

**Hora 0 — Detecção**
- Registrar a detecção (quem, quando, como)
- Preservar evidências (logs, screenshots, dumps)

**Hora 0-1 — Contenção**
- Interromper a origem do incidente (revogar credencial, bloquear IP, desativar endpoint)
- Aplicar medidas mitigadoras imediatas

**Hora 1-6 — Avaliação**
- Identificar quais dados pessoais foram afetados
- Identificar quantos titulares foram afetados
- Avaliar risco ou dano relevante

**Hora 6-24 — Comunicação**
- Comunicar **todos os clientes contratantes (Controladores)** impactados, conforme DPA Cláusula 9
- Fornecer:
  - Descrição da natureza do incidente
  - Tipos e volumes de dados afetados
  - Titulares envolvidos
  - Medidas técnicas de segurança utilizadas
  - Riscos potenciais
  - Medidas adotadas ou recomendadas
- Cabe ao **Controlador** a comunicação formal à ANPD

**Hora 24-48 — Documentação**
- Registrar o incidente na tabela `audit_log` com ação `incidente_seguranca`
- Criar post-mortem com linha do tempo, causa raiz e ações corretivas
- Arquivar o post-mortem em `docs/incidentes/AAAA-MM-DD-descricao.md`

---

## 2. Operação do Cron de Limpeza

### 2.1 Crons ativos

| Cron | Schedule (UTC) | Função |
|---|---|---|
| `/api/cron-limpeza` (Vercel Cron) | 06:00 diário | Apaga fotos > 15 dias (capturas + capturas_historico) |
| `/api/cron-prazos-lgpd` (Vercel Cron) | 09:00 diário | Alerta DPO sobre solicitações LGPD vencidas ou próximas do prazo |
| `cleanup-debug-log` (pg_cron) | a cada 6h | Apaga debug_log > 24 horas |
| `cleanup-old-capturas` (pg_cron) | 04:00 diário | Apaga metadados > 6 meses |
| `cleanup-old-capturas-historico` (pg_cron) | 04:05 diário | Apaga metadados do histórico > 6 meses |

### 2.2 Execução manual

```bash
# Limpeza de fotos
curl -H "Authorization: Bearer $CRON_SECRET" https://protector-lombada.vercel.app/api/cron-limpeza

# Alerta de prazos LGPD
curl -H "Authorization: Bearer $CRON_SECRET" https://protector-lombada.vercel.app/api/cron-prazos-lgpd
```

### 2.3 Diagnóstico de crons

- **Vercel Dashboard → Deployments → (última prod) → Functions → Logs** — ver execuções recentes
- **Supabase Dashboard → Database → Cron Jobs** — ver histórico do pg_cron

---

## 3. Operação do DPO

### 3.1 Fluxo diário

1. **Abrir o painel admin** → menu **Direitos LGPD**
2. **Verificar o badge vermelho** no menu — indica solicitações recebidas ou vencidas
3. **Filtrar por "Vencidas"** primeiro, depois "Recebidas"
4. **Abrir cada solicitação** e verificar:
   - Dados do solicitante
   - Vínculo com empreendimento (se informado)
   - Tipo e descrição
5. **Decidir o encaminhamento:**
   - Se é cliente direto da Protector → responder diretamente
   - Se é morador de um empreendimento → encaminhar ao Controlador (status `encaminhada_controlador`)
   - Se é solicitação inválida ou fora do escopo → rejeitar com explicação
6. **Escrever a resposta** e marcar `enviar e-mail automaticamente`
7. **Atualizar o status** para `atendida`

### 3.2 Prazo legal

**15 dias corridos** contados a partir do recebimento (Art. 19 LGPD). O sistema calcula automaticamente o `prazo_limite` na criação e o cron `/api/cron-prazos-lgpd` envia alerta diário ao DPO quando:

- Há solicitações vencidas
- Há solicitações com prazo em até 3 dias

### 3.3 Tipos de resposta padrão

#### a) Cliente direto (condomínio contratante)

> Prezado(a) [Nome],
>
> Em atendimento à sua solicitação registrada no protocolo [PROTOCOLO], informamos que [DESCREVER AÇÃO TOMADA].
>
> Os dados solicitados são:
> [DADOS]
>
> Caso necessite de informações adicionais, responda a este e-mail mencionando o protocolo acima.
>
> Atenciosamente,
> Glauber Varjão do Nascimento
> Encarregado pelo Tratamento de Dados (DPO)
> Protector Sistemas

#### b) Morador encaminhado ao Controlador

> Prezado(a) [Nome],
>
> Recebemos sua solicitação no protocolo [PROTOCOLO].
>
> Esclarecemos que a Protector Sistemas atua como **Operadora** (processadora de dados) para os dados capturados pelo sistema Protector Traffic Control. O **Controlador** desses dados é o empreendimento onde você reside ou que você visita.
>
> Por essa razão, sua solicitação deve ser dirigida primeiro à administração do empreendimento [NOME, SE INFORMADO].
>
> Já encaminhamos seu pedido ao Controlador com cópia do protocolo acima. Se não obtiver resposta em 15 dias, retorne o contato.
>
> Atenciosamente,
> Glauber Varjão do Nascimento
> Encarregado pelo Tratamento de Dados (DPO)
> Protector Sistemas

#### c) Rejeição (solicitação inválida)

> Prezado(a) [Nome],
>
> Em atendimento à sua solicitação registrada no protocolo [PROTOCOLO], esclarecemos que [RAZÃO DA REJEIÇÃO].
>
> Se acredita que esta negativa é improcedente, você pode recorrer à Autoridade Nacional de Proteção de Dados (ANPD) pelo portal **gov.br/anpd**.
>
> Atenciosamente,
> Glauber Varjão do Nascimento
> Encarregado pelo Tratamento de Dados (DPO)
> Protector Sistemas

---

## 4. Backup e Recuperação

### 4.1 Backups automáticos

O Supabase faz backup automático do banco **diariamente** no plano Pro. No plano Free, backups ficam limitados a 7 dias retroativos.

### 4.2 Backup manual

Para situações críticas (antes de migrations, por exemplo):

```bash
# Exportar schema e dados via Supabase CLI
supabase db dump -f backup-$(date +%Y%m%d).sql

# OU via pg_dump direto (requer DATABASE_URL)
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql
```

### 4.3 Recuperação de dados

- **Via Supabase Dashboard → Database → Backups** (plano Pro)
- **Via restore de dump SQL:**
  ```bash
  psql $DATABASE_URL < backup-AAAAMMDD.sql
  ```

---

## 5. Histórico de Rotações e Incidentes

| Data | Evento | Responsável | Observações |
|---|---|---|---|
| 2026-04-10 | Fase 1 LGPD aplicada | Glauber Varjão | RLS debug_log, storage policies, remoção de funções SQL quebradas |
| 2026-04-10 | Fase 2 LGPD aplicada | Glauber Varjão | Tabela solicitacoes_titular criada, endpoint público publicado |
| 2026-04-10 | Fase 3 LGPD aplicada | Glauber Varjão | Painel admin de direitos + cron de prazos |

Novas entradas devem ser adicionadas cronologicamente ao final da tabela, incluindo:
- Rotação de credenciais
- Incidentes de segurança
- Mudanças de escopo do tratamento
- Auditorias externas (quando houver)

---

**Protector — Sistemas de Segurança**
CNPJ 21.747.444/0001-65
Contato operacional: glauber@pluginti.com.br
Contato DPO: dpo@appps.com.br
