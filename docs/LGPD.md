# LGPD — Tratamento de Dados Pessoais

> Este documento descreve o tratamento de dados pessoais realizado pelo **Protector Traffic Control** (sistema de Lombada Educativa Inteligente) em conformidade com a **Lei Geral de Proteção de Dados — Lei 13.709/2018 (LGPD)**.

**Versão 1.0** · Abril 2026

---

## 1. Papéis das partes

| Papel LGPD | Parte | Responsabilidades |
|---|---|---|
| **Controlador** | Cliente (condomínio, empresa, via privada) | Define finalidade e meios do tratamento; responde aos titulares (moradores/visitantes); fornece base legal |
| **Operador** | Protector Sistemas | Trata dados em nome do controlador, conforme instruções contratuais; implementa medidas de segurança |
| **Encarregado (DPO)** | Indicado pela Protector | Canal de comunicação com titulares e ANPD |

---

## 2. Dados pessoais tratados

| Dado | Categoria LGPD | Origem | Finalidade |
|---|---|---|---|
| **Placa do veículo** | Dado pessoal (identificador indireto) | Câmera ALPHADIGI (OCR) | Identificar o veículo que excedeu o limite |
| **Foto do veículo** | Dado pessoal (pode conter rosto/condutor) | Câmera ALPHADIGI | Evidência visual da passagem |
| **Velocidade registrada** | Dado comportamental | Radar da câmera | Avaliar conformidade com limite |
| **Data/hora e local da passagem** | Dado de localização | Câmera + servidor | Contextualizar a ocorrência |
| **Nome do morador** | Dado pessoal direto | Cadastro manual (síndico) | Personalizar notificação |
| **Unidade/apartamento** | Dado pessoal | Cadastro manual | Identificar o responsável pelo veículo |
| **E-mail do destinatário de alerta** | Dado pessoal | Cadastro manual | Envio da notificação |
| **Marca/cor do veículo** | Dado associado | Cadastro manual | Identificação auxiliar |

**Dados NÃO coletados:** CPF, RG, endereço residencial detalhado, dados financeiros, dados sensíveis (art. 5º, II LGPD).

---

## 3. Base legal (art. 7º LGPD)

O tratamento se apoia em:

1. **Execução de contrato** (art. 7º, V) — entre condomínio e morador/proprietário, quando há convenção condominial que prevê controle de velocidade interno.
2. **Legítimo interesse** (art. 7º, IX) — do condomínio em garantir a segurança viária e de pedestres em área privada, ponderando com direitos e liberdades do titular.

A **base legal final é definida pelo Controlador** (cliente) em seu RIPD (Relatório de Impacto) e convenção condominial.

---

## 4. Finalidade

**Exclusivamente educativa e orientativa.** O sistema:

- **NÃO emite multas oficiais** — o PDF gerado não tem valor de auto de infração
- **NÃO compartilha dados com órgãos de trânsito** (DETRAN, SENATRAN, polícia)
- **NÃO realiza reconhecimento facial** — apenas OCR de placa e foto do veículo
- **NÃO comercializa ou cede** dados a terceiros

A finalidade declarada no PDF e no cabeçalho da notificação é **"documento meramente educativo, sem valor de multa"**.

---

## 5. Retenção e eliminação

| Dado | Prazo de retenção | Mecanismo |
|---|---|---|
| Captura (foto + metadados) | **15 dias** | Cron diário automatizado (`/api/cron-limpeza`) |
| Cadastro de veículo | Enquanto o contrato estiver ativo | Exclusão pelo controlador via painel |
| E-mail de destinatário | Enquanto o contrato estiver ativo | Exclusão pelo controlador via painel |
| Log de auditoria | Conforme política interna | Revisão periódica |

Após o prazo, os dados são **eliminados automaticamente** do banco e do storage (art. 15 LGPD).

---

## 6. Medidas de segurança (art. 46 LGPD)

### Técnicas

- **Criptografia em trânsito**: HTTPS/TLS 1.2+ obrigatório em todos os endpoints
- **Criptografia em repouso**: Supabase PostgreSQL e Storage cifrados (AES-256)
- **Autenticação**: JWT via Supabase Auth
- **Controle de acesso**: Row Level Security (RLS) habilitado em todas as tabelas — isolamento por cliente
- **Storage privado**: bucket `capturas-fotos` não público; acesso apenas por signed URL de curta duração
- **Rate limiting**: 120 req/min por câmera (prevenção de abuso)
- **Três níveis de permissão**: `super_admin`, `admin_cliente`, `operador`
- **Log de auditoria**: tabela `audit_log` registra operações sensíveis

### Organizacionais

- Acesso administrativo restrito à equipe técnica Protector
- Credenciais (service keys) armazenadas em variáveis de ambiente da Vercel, nunca no código
- Revisão periódica de usuários ativos
- Treinamento LGPD da equipe

---

## 7. Direitos do titular (art. 18 LGPD)

Titulares (moradores/proprietários de veículos registrados) podem exercer:

| Direito | Como exercer |
|---|---|
| Confirmação da existência de tratamento | Contatar o síndico ou DPO Protector |
| Acesso aos dados | Solicitar via controlador (condomínio) |
| Correção de dados incompletos/incorretos | Via síndico / admin do cliente |
| Anonimização, bloqueio ou eliminação | Solicitação ao controlador |
| Portabilidade | Exportação em Excel disponível no dashboard |
| Eliminação dos dados tratados | Exclusão via painel admin do cliente |
| Informação sobre compartilhamento | Protector não compartilha com terceiros |
| Revogação do consentimento | Quando aplicável, via controlador |

**Canal oficial do DPO Protector:** [a ser definido no contrato]

---

## 8. Subcontratados (suboperadores)

Para prestar o serviço, a Protector utiliza os seguintes suboperadores:

| Suboperador | Finalidade | Localização dos dados |
|---|---|---|
| **Supabase** (Supabase Inc.) | Banco de dados e storage | Região Sul-América (São Paulo) |
| **Vercel** (Vercel Inc.) | Hospedagem serverless | Multi-região |
| **Provedor SMTP** (cPanel ou Gmail) | Envio de e-mails | Conforme escolha do cliente |

Todos os suboperadores possuem certificações de segurança (SOC 2, ISO 27001 ou equivalentes) e termos de processamento de dados (DPA) aderentes à LGPD/GDPR.

---

## 9. Transferência internacional de dados

Supabase e Vercel podem realizar processamento em infraestrutura multi-região. A Protector prioriza a região **South America (São Paulo)** para o Supabase, mantendo dados em território nacional. Transferências eventuais seguem as garantias previstas no art. 33 da LGPD.

---

## 10. Notificação de incidentes

Em caso de incidente de segurança que possa acarretar risco ou dano relevante aos titulares (art. 48 LGPD), a Protector comunicará o **Controlador** em até **24 horas** após a descoberta, fornecendo:

- Descrição da natureza do incidente
- Dados afetados
- Titulares envolvidos
- Medidas técnicas de segurança utilizadas
- Riscos potenciais
- Medidas adotadas/recomendadas para reverter ou mitigar

Cabe ao Controlador a comunicação à ANPD e aos titulares.

---

## 11. Obrigações contratuais

Ao contratar o Protector Traffic Control, o cliente (Controlador) declara:

- [ ] Ter convenção condominial/regulamento interno que autoriza o controle de velocidade
- [ ] Ter informado aos moradores sobre a existência do sistema (sinalização visível)
- [ ] Ter estabelecido sua própria política de privacidade LGPD
- [ ] Designar um responsável interno pelo tratamento dos dados
- [ ] Comunicar formalmente à Protector solicitações de titulares recebidas diretamente

A Protector (Operadora) compromete-se a:

- [ ] Tratar dados apenas conforme instrução do controlador
- [ ] Implementar medidas técnicas e administrativas de segurança
- [ ] Notificar incidentes em até 24h
- [ ] Manter registro de operações de tratamento
- [ ] Eliminar dados após encerramento do contrato

---

## 12. Referências legais

- **Lei 13.709/2018** — Lei Geral de Proteção de Dados Pessoais (LGPD)
- **Lei 10.406/2002** — Código Civil (art. 1.336, convenção condominial)
- **Resolução CD/ANPD nº 2/2022** — Regulamento de aplicação da LGPD
- **Guia Orientativo ANPD** — Tratamento de Dados Pessoais por Condomínios (2023)

---

**Protector Sistemas** — Documento LGPD · v1.0 · Abril 2026
