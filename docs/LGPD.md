# LGPD — Tratamento de Dados Pessoais

> Este documento descreve o tratamento de dados pessoais realizado pelo **Protector Traffic Control** (sistema de Lombada Educativa Inteligente) em conformidade com a **Lei Geral de Proteção de Dados — Lei nº 13.709/2018 (LGPD)**.

**Versão 2.0** · Abril 2026

---

## 1. Identificação dos Agentes de Tratamento

### Operadora (Protector Sistemas)

| Campo | Valor |
|---|---|
| Razão social | Glauber Varjão do Nascimento |
| Nome fantasia | Protector — Sistemas de Segurança |
| CNPJ | 21.747.444/0001-65 |
| Natureza jurídica | 213-5 Empresário (Individual) |
| Endereço | Av. Luís Viana Filho, 1821 — Shopping Amazônia, Loja 13 — Saboeiro — Salvador/BA — CEP 41.180-000 |
| Telefone | (71) 9271-3295 |
| E-mail comercial | glauber@pluginti.com.br |

### Encarregado (DPO)

| Campo | Valor |
|---|---|
| Nome | Glauber Varjão do Nascimento |
| E-mail | dpo@appps.com.br |
| Função | Encarregado pelo Tratamento de Dados Pessoais |

A nomeação do Encarregado é comunicada publicamente por meio deste documento e da Política de Privacidade publicada em `/privacidade` no site institucional.

### Controlador

O **Controlador** é sempre o cliente contratante (condomínio, empresa, hotel, via privada etc.). Cada cliente define, em seu próprio Relatório de Impacto à Proteção de Dados (RIPD), a finalidade, a base legal e a política de uso dos dados. A Protector Sistemas atua **exclusivamente como Operadora**, executando o tratamento conforme instruções documentadas do Controlador.

---

## 2. Papéis das Partes

| Papel LGPD | Parte | Responsabilidades |
|---|---|---|
| **Controlador** | Cliente (condomínio, empresa, via privada) | Define finalidade, base legal e meios do tratamento; atende os titulares; fornece sinalização e comunicação aos moradores/visitantes; preenche o RIPD |
| **Operador** | Protector Sistemas | Trata dados apenas conforme instruções documentadas do Controlador; implementa medidas técnicas e administrativas de segurança; comunica incidentes |
| **Encarregado (DPO)** | Glauber Varjão do Nascimento (dpo@appps.com.br) | Canal de comunicação entre a Operadora, os titulares que a procurarem e a ANPD |

---

## 3. Filosofia do Tratamento

**A Protector Sistemas fornece a ferramenta. O Controlador define o uso.**

O sistema Protector Traffic Control é uma plataforma de captura e notificação de passagens de veículos. A **finalidade específica** do tratamento (educativa, orientativa, embasamento para sanção interna prevista em convenção, evidência em processo judicial ou qualquer outro uso lícito) é **definida exclusivamente pelo Controlador**, conforme sua convenção condominial, regulamento interno ou política corporativa.

A Protector Sistemas:

- **Não determina** a finalidade do tratamento em nome do Controlador
- **Não garante** ao titular que os dados não serão usados para determinado fim
- **Não se responsabiliza** pelo enquadramento jurídico que o Controlador dá ao tratamento
- **Responsabiliza-se** por executar o tratamento com segurança, disponibilidade e conformidade técnica, conforme instruções do Controlador
- **Responde solidariamente** apenas se agir fora das instruções documentadas do Controlador (art. 42 LGPD)

O texto padrão dos documentos gerados pelo sistema (PDF de notificação) traz "NOTIFICAÇÃO ORIENTATIVA" apenas como valor inicial. Cada Controlador pode customizar título, subtítulo e rodapé conforme sua realidade.

---

## 4. Dados Pessoais Tratados

| Dado | Categoria LGPD | Origem | Função no sistema |
|---|---|---|---|
| Placa do veículo | Dado pessoal (identificador indireto) | Câmera ALPHADIGI (OCR) | Identificação do veículo na captura |
| Foto do veículo | Dado pessoal (pode conter rosto/condutor) | Câmera ALPHADIGI | Evidência visual da passagem |
| Velocidade registrada | Dado comportamental | Radar da câmera | Comparação com limite configurado |
| Data/hora e local da passagem | Dado de localização | Câmera + servidor | Contextualização da ocorrência |
| Nome do morador/proprietário | Dado pessoal direto | Cadastro manual pelo Controlador | Personalização da notificação |
| Unidade/apartamento | Dado pessoal | Cadastro manual pelo Controlador | Identificação do responsável |
| E-mail do destinatário de alerta | Dado pessoal | Cadastro manual pelo Controlador | Envio automatizado da notificação |
| Marca/cor do veículo | Dado associado | Cadastro manual pelo Controlador | Identificação auxiliar |

**Dados NÃO coletados pelo sistema:** CPF, RG, endereço residencial detalhado, dados financeiros, dados sensíveis (art. 5º, II LGPD), dados biométricos, reconhecimento facial.

### 4.1 Proteção de imagem por blur automático (opcional)

A Operadora disponibiliza, como feature opcional contratada por cliente, um sistema de **blur automático de pessoas** nas fotos de captura. Quando ativado pelo `super_admin` no painel administrativo da Operadora (campo `blur_automatico` da tabela `clientes`):

- Toda foto que entra pelo endpoint `/api/captura` passa por detecção de objetos (modelo COCO-SSD, TensorFlow.js)
- Pessoas, motocicletas e bicicletas detectadas com confiança ≥ 15% têm a região coberta por blur forte (sigma 30)
- A placa do veículo-alvo, o corpo do veículo e a faixa superior de informações são **preservados**
- O processamento falha de forma graceful: se der erro, a foto é salva sem alteração (nunca bloqueia a captura)

**Quando recomendar a ativação:**
- Câmeras instaladas em locais onde o enquadramento captura calçadas, praças ou áreas de circulação de pedestres
- Clientes que tratam dados em áreas com alto fluxo de terceiros
- Requisitos contratuais específicos de proteção de imagem

**Limitações conhecidas:**
- Pessoas muito pequenas/distantes (< 20px) podem não ser detectadas
- Pessoas dentro de veículos (vidro fechado, distância, reflexo) não são detectadas
- Latência adicional: ~500-1500ms por captura
- Não substitui enquadramento adequado da câmera — é uma camada adicional de proteção

---

## 5. Base Legal (art. 7º LGPD)

A definição da base legal é **atribuição do Controlador**, conforme sua convenção, regulamento ou contrato com os titulares. A Operadora recomenda ao Controlador avaliar as seguintes hipóteses:

- **Art. 7º V — Execução de contrato** — quando a convenção condominial vigente estabelece o controle de velocidade interno como cláusula aceita pelos proprietários/locatários
- **Art. 7º IX — Legítimo interesse** — quando o Controlador pondera seu interesse em segurança viária e proteção de pedestres contra os direitos e liberdades fundamentais do titular
- **Art. 7º II — Obrigação legal ou regulatória** — quando houver norma específica aplicável ao empreendimento

A escolha e justificativa da base legal devem ser documentadas pelo Controlador em seu RIPD (`docs/RIPD_TEMPLATE.md`).

---

## 6. Retenção e Eliminação

A Operadora aplica a seguinte política técnica de retenção, **executada automaticamente por rotinas agendadas**:

| Tipo de dado | Prazo de retenção | Mecanismo técnico |
|---|---|---|
| **Foto da passagem** (arquivo no Storage) | **15 dias** | Vercel Cron `api/cron-limpeza` — diário às 06:00 UTC (aplica a `capturas` e `capturas_historico`) |
| **Metadados da captura** (placa, velocidade, data/hora, local) | **6 meses** | pg_cron `cleanup_old_capturas` — diário às 04:00 UTC |
| **Cadastro de veículo** | Enquanto o contrato estiver ativo | Exclusão pelo Controlador via painel admin |
| **Cadastro de destinatário de e-mail** | Enquanto o contrato estiver ativo | Exclusão pelo Controlador via painel admin |
| **Log de auditoria** (`audit_log`) | Enquanto o contrato estiver ativo | Revisão periódica pelo DPO |
| **Log de depuração técnica** (`debug_log`) | **24 horas** | pg_cron `cleanup_debug_log` — a cada 6 horas |
| **Histórico arquivado** (`capturas_historico`) — metadados | **6 meses** | pg_cron `cleanup_old_capturas_historico` — diário às 04:05 UTC |

**Nota técnica:** A limpeza de fotos usa Vercel Cron (não pg_cron) porque o Supabase aplica uma trigger de proteção (`storage.protect_objects_delete`) que bloqueia exclusão direta de objetos do Storage via SQL. O endpoint `api/cron-limpeza` usa a Storage API do SDK `@supabase/supabase-js`, que contorna a trigger de forma segura.

### Justificativa dos prazos

- **Foto 15 dias:** janela operacional suficiente para auditoria da passagem pelo Controlador e para questionamentos pelo titular. Após esse prazo, a foto deixa de ser necessária e é eliminada do Storage.
- **Metadados 6 meses:** permite ao Controlador gerar relatórios periódicos (mensais, trimestrais, semestrais) sobre padrão de tráfego interno, tendências de reincidência e eficácia de ações educativas, sem manter o conteúdo visual. Essa janela está alinhada com a prática de retenção de logs de acesso em sistemas de segurança patrimonial.
- **debug_log 24 horas:** log técnico de erros de integração com a câmera, mantido apenas o tempo necessário para diagnóstico operacional.

### Tabela `capturas_historico`

O sistema mantém a tabela `capturas_historico` como **arquivo de preservação** de situações específicas (incidentes relevantes, disputas, necessidade de comprovação histórica) mediante decisão do Controlador. A mesma política de retenção descrita acima se aplica a essa tabela: fotos após 15 dias são apagadas; metadados seguem o prazo de 6 meses.

---

## 7. Medidas de Segurança (art. 46 LGPD)

### Técnicas

- **Criptografia em trânsito:** HTTPS/TLS 1.2+ obrigatório em todos os endpoints (Vercel)
- **Criptografia em repouso:** Supabase PostgreSQL e Supabase Storage cifrados com AES-256
- **Localização dos dados:** Supabase região `sa-east-1` (São Paulo) — dados permanecem em território nacional
- **Autenticação:** JWT via Supabase Auth
- **Controle de acesso granular:** Row Level Security (RLS) habilitado em todas as tabelas do schema `public`, com isolamento estrito por `cliente_id`
- **Storage privado:** bucket `capturas-fotos` com `public: false`; acesso por `signed URL` de curta duração
- **Rate limiting:** 120 requisições/minuto por câmera (prevenção de abuso)
- **Três níveis de permissão:** `super_admin` (Operadora), `admin_cliente` (Controlador), `operador` (equipe do Controlador)
- **Log de auditoria:** tabela `audit_log` registra operações administrativas sensíveis (criação, alteração e exclusão de registros)
- **Validação de entrada:** camada `lib/validators.js` valida todos os payloads recebidos das câmeras

### Organizacionais

- Acesso administrativo restrito à equipe técnica da Protector Sistemas
- Credenciais de serviço (service keys) armazenadas como variáveis de ambiente no Vercel e **nunca** versionadas em código
- Rotação periódica de credenciais administrativas
- Revisão trimestral de usuários ativos pelo DPO
- Procedimento de resposta a incidentes documentado

---

## 8. Direitos do Titular (art. 18 LGPD)

Os titulares (moradores, proprietários, visitantes com veículos registrados) têm os seguintes direitos garantidos pela LGPD:

| Direito | Como exercer |
|---|---|
| Confirmação da existência de tratamento | Contatar o Controlador (síndico, administração) ou o Encarregado da Operadora |
| Acesso aos dados | Solicitação ao Controlador, que é o responsável primário |
| Correção de dados incompletos ou inexatos | Via administração do Controlador |
| Anonimização, bloqueio ou eliminação | Solicitação ao Controlador |
| Portabilidade dos dados | Exportação disponível no painel do Controlador (CSV/Excel) |
| Eliminação dos dados tratados | Exclusão pelo Controlador via painel administrativo |
| Informação sobre compartilhamento | A Operadora não compartilha dados com terceiros além dos subprocessadores listados na seção 9 |
| Revogação do consentimento | Quando aplicável, diretamente com o Controlador |

### Canal oficial do Encarregado (DPO) da Operadora

| Canal | Endereço |
|---|---|
| Formulário público | `/direitos-titular` — gera protocolo, notifica o DPO e envia confirmação por e-mail |
| E-mail direto | dpo@appps.com.br |

O Encarregado atende, no prazo legal de **15 dias corridos** (Art. 19 LGPD), as solicitações de titulares que recorrerem diretamente à Operadora. Nesses casos, a solicitação é encaminhada ao Controlador responsável pelo tratamento daquele titular e o Encarregado atua como intermediário.

### Tabela de solicitações

Todas as solicitações recebidas pelo formulário são registradas na tabela `solicitacoes_titular` com:

- Protocolo único
- Dados do solicitante e vínculo informado
- Tipo de solicitação (conforme art. 18)
- Status do atendimento (`recebida` → `em_analise` → `atendida`, etc.)
- Prazo legal calculado automaticamente (15 dias a partir do recebimento)
- IP e user-agent de origem (para auditoria)
- Resposta do DPO registrada ao término

---

## 9. Subprocessadores (Suboperadores)

Para a prestação do serviço, a Protector Sistemas utiliza os seguintes subprocessadores:

| Subprocessador | Finalidade | Localização dos dados |
|---|---|---|
| **Supabase** (Supabase Inc.) | Banco de dados PostgreSQL + Storage de fotos | Região `sa-east-1` (São Paulo, Brasil) |
| **Vercel** (Vercel Inc.) | Hospedagem serverless (Functions + Edge) | Multi-região; camada de compute pode rodar fora do Brasil |
| **Provedor SMTP** (definido por contrato) | Envio de e-mails de notificação | Conforme provedor escolhido |

Todos os subprocessadores possuem certificações de segurança reconhecidas (SOC 2, ISO 27001 ou equivalentes) e termos de processamento de dados aderentes à LGPD e ao GDPR.

---

## 10. Transferência Internacional de Dados

Os dados de clientes brasileiros são armazenados na região **sa-east-1 (São Paulo)** do Supabase. Eventuais operações de compute pela Vercel podem ocorrer em outras regiões conforme a arquitetura do provedor, sem transferência persistente para fora do Brasil. Quando houver transferência internacional, a Operadora observa as garantias previstas no art. 33 da LGPD.

---

## 11. Notificação de Incidentes de Segurança

Em caso de incidente de segurança que possa acarretar risco ou dano relevante aos titulares (art. 48 LGPD), a Protector Sistemas comunicará o **Controlador** em até **24 horas** após a descoberta, fornecendo:

- Descrição da natureza do incidente
- Tipos e volumes de dados afetados
- Identificação dos titulares envolvidos (quando possível)
- Medidas técnicas e administrativas de segurança utilizadas
- Riscos potenciais
- Medidas adotadas ou recomendadas para reverter ou mitigar os efeitos

Cabe ao **Controlador** a comunicação formal à ANPD e aos titulares, por ser o responsável primário perante a autoridade.

---

## 12. Obrigações Contratuais

Ao contratar o Protector Traffic Control, o cliente (**Controlador**) declara:

- [ ] Possuir convenção condominial, regulamento interno ou instrumento equivalente que autoriza o controle de velocidade e captura de imagens de veículos
- [ ] Ter instalado sinalização visível na entrada da área monitorada, informando aos moradores e visitantes sobre a existência do sistema
- [ ] Ter estabelecido sua própria política de privacidade, atendendo aos seus titulares
- [ ] Ter designado responsável interno pelo tratamento dos dados perante a Operadora
- [ ] Comunicar formalmente à Operadora as solicitações de titulares recebidas diretamente
- [ ] Preencher o Relatório de Impacto à Proteção de Dados (RIPD) conforme template fornecido pela Operadora (`docs/RIPD_TEMPLATE.md`)
- [ ] Definir, sob sua exclusiva responsabilidade, a finalidade de uso dos dados coletados

A Protector Sistemas (**Operadora**) compromete-se a:

- [ ] Tratar os dados apenas conforme instruções documentadas do Controlador
- [ ] Implementar e manter as medidas técnicas e administrativas de segurança descritas na seção 7
- [ ] Notificar incidentes de segurança no prazo de 24 horas
- [ ] Manter registro das operações de tratamento (logs de auditoria)
- [ ] Eliminar ou devolver os dados ao final do contrato, conforme instrução do Controlador
- [ ] Manter publicamente disponível o canal do Encarregado (DPO)

Essas obrigações são formalizadas no Contrato de Processamento de Dados (DPA — `docs/CONTRATO_DPA.md`), que integra o contrato principal de prestação de serviços.

---

## 13. Referências Legais

- **Lei nº 13.709/2018** — Lei Geral de Proteção de Dados Pessoais (LGPD)
- **Lei nº 13.853/2019** — Cria a ANPD e altera a LGPD
- **Lei nº 10.406/2002** — Código Civil (art. 1.336, convenção condominial)
- **Resolução CD/ANPD nº 2/2022** — Regulamento de aplicação da LGPD
- **Guia Orientativo ANPD** — Tratamento de Dados Pessoais por Condomínios (2023)

---

## 14. Histórico de Revisões

| Versão | Data | Alterações |
|---|---|---|
| 1.0 | Abril 2026 | Versão inicial — finalidade restrita ao uso educativo |
| **2.0** | **Abril 2026** | Identificação completa da Operadora e do DPO; filosofia neutra (finalidade definida pelo Controlador); retenção real alinhada ao banco (foto 15d, metadados 6m); inclusão da tabela `capturas_historico` como arquivo; referência ao RIPD e DPA como documentos complementares |

---

**Protector Sistemas** — Documento LGPD · v2.0 · Abril 2026
