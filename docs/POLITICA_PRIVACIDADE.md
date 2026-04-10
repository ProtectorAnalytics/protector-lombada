# Política de Privacidade — Protector Sistemas

**Versão 1.0** · Vigente a partir de abril de 2026

---

## 1. Quem somos

Esta é a Política de Privacidade da **Glauber Varjão do Nascimento** (nome fantasia **Protector — Sistemas de Segurança**), inscrita no CNPJ sob nº **21.747.444/0001-65**, com sede na **Av. Luís Viana Filho, 1821 — Shopping Amazônia, Loja 13 — Saboeiro — Salvador/BA — CEP 41.180-000**, telefone **(71) 9271-3295**, doravante denominada **"Protector Sistemas"** ou **"nós"**.

A Protector Sistemas desenvolve e opera o **Protector Traffic Control**, uma plataforma de Lombada Educativa Inteligente para condomínios, vias privadas e empreendimentos que contratam o serviço.

---

## 2. A quem esta política se aplica

Esta política se aplica a:

1. **Visitantes do site institucional** da Protector Sistemas
2. **Clientes contratantes** do sistema Protector Traffic Control (condomínios, empresas, vias privadas)
3. **Titulares de dados** (moradores, proprietários, visitantes) cujas informações eventualmente passem pelos nossos sistemas em razão da contratação feita por um cliente

### Nosso papel na LGPD

- **Para visitantes do site e clientes diretos**, a Protector Sistemas atua como **Controladora**: coleta e trata dados para fins de comunicação comercial, suporte e execução do contrato.
- **Para os dados capturados pelas câmeras instaladas nos empreendimentos contratantes** (placas, fotos de veículos, velocidades), a Protector Sistemas atua exclusivamente como **Operadora**. O **Controlador** desses dados é sempre o cliente contratante (condomínio, empresa, via privada), que define a finalidade, a base legal e o uso dos dados conforme sua convenção, regulamento ou política interna.

Se você é morador, proprietário ou visitante de um empreendimento onde há câmeras Protector instaladas, e deseja exercer seus direitos sobre os dados capturados, a solicitação deve ser feita **primeiro ao empreendimento contratante** (síndico, administração, setor responsável). Caso não obtenha resposta adequada, você pode acionar o Encarregado (DPO) da Protector Sistemas pelo canal indicado na seção 9.

---

## 3. Quais dados tratamos como Controladora

### 3.1 Visitantes do site

Quando você visita nosso site institucional, podemos coletar:

- Endereço IP e informações técnicas do navegador (para estatísticas agregadas)
- Dados de contato informados voluntariamente em formulários (nome, e-mail, telefone, mensagem)
- Cookies estritamente necessários para o funcionamento do site

### 3.2 Clientes contratantes

Quando uma empresa ou condomínio contrata o Protector Traffic Control, coletamos:

- Razão social, CNPJ, endereço
- Nome, cargo, e-mail e telefone do responsável pelo contrato
- Dados de faturamento

Estes dados são utilizados para execução do contrato, faturamento, suporte técnico e comunicações administrativas.

---

## 4. Dados tratados como Operadora (dados capturados pelo sistema)

Quando um cliente contratante opera câmeras do Protector Traffic Control, o sistema trata, **em nome do Controlador (cliente)**, os seguintes dados:

- **Placa do veículo** (reconhecida por OCR da câmera)
- **Foto do veículo** no momento da passagem
- **Velocidade** medida pelo radar
- **Data, hora e câmera** onde a passagem ocorreu

E, quando o cliente contratante opta por cadastrar moradores, também:

- **Nome e unidade** (apartamento, lote) do morador/proprietário
- **Marca e cor** do veículo
- **E-mail** dos destinatários de alertas configurados pelo cliente

**O sistema não realiza reconhecimento facial**, não coleta CPF, RG, endereço residencial, dados financeiros ou dados sensíveis na acepção do art. 5º, II da LGPD.

### Finalidade

A finalidade desses dados é **definida exclusivamente pelo cliente contratante** (Controlador), conforme sua convenção condominial, regulamento interno ou política corporativa. A Protector Sistemas, como Operadora, executa o tratamento de acordo com as instruções recebidas.

### Retenção

- **Foto da passagem:** 15 dias corridos, após os quais é eliminada automaticamente do armazenamento
- **Metadados da passagem** (placa, velocidade, data/hora): 6 meses corridos, após os quais são eliminados automaticamente
- **Cadastros de veículo e destinatários:** enquanto o contrato com o cliente contratante estiver ativo

Prazos são executados por rotinas automatizadas no banco de dados.

---

## 5. Base legal

A Protector Sistemas trata dados pessoais com fundamento nas seguintes bases legais da LGPD:

- **Execução de contrato** (art. 7º, V) — para prestação dos serviços ao cliente contratante e manutenção do relacionamento comercial
- **Cumprimento de obrigação legal** (art. 7º, II) — quando há norma aplicável
- **Legítimo interesse** (art. 7º, IX) — para melhoria do serviço, segurança do sistema e prevenção de fraudes, sempre respeitando os direitos e liberdades fundamentais do titular

Para os dados tratados **como Operadora** (capturados pelas câmeras instaladas nos empreendimentos contratantes), a base legal é **definida pelo Controlador** (cliente) e documentada em seu próprio Relatório de Impacto à Proteção de Dados Pessoais (RIPD).

---

## 6. Com quem compartilhamos dados

Os dados tratados pela Protector Sistemas são compartilhados apenas com os **subprocessadores técnicos** estritamente necessários à operação do serviço:

| Subprocessador | Função | Localização |
|---|---|---|
| **Supabase** (Supabase Inc.) | Banco de dados e armazenamento de arquivos | Região `sa-east-1` (São Paulo, Brasil) |
| **Vercel** (Vercel Inc.) | Hospedagem da aplicação (serverless) | Multi-região, com compute podendo ocorrer fora do Brasil |
| **Provedor SMTP** | Envio de e-mails transacionais | Conforme provedor contratado |

A Protector Sistemas **não vende, não cede e não comercializa** dados pessoais a terceiros. Compartilhamentos adicionais ocorrem apenas quando houver obrigação legal ou ordem judicial.

---

## 7. Como protegemos os dados

A Protector Sistemas adota medidas técnicas e administrativas de segurança, incluindo:

- Conexão criptografada (HTTPS/TLS) em todos os acessos
- Criptografia dos dados em repouso no banco de dados e no armazenamento de arquivos
- Controle de acesso baseado em funções (`super_admin`, `admin_cliente`, `operador`)
- Row Level Security (RLS) no banco de dados, garantindo isolamento entre clientes contratantes
- Bucket de fotos privado, com acesso apenas por URL assinada de curta duração
- Rate limiting em endpoints públicos
- Log de auditoria das operações administrativas
- Revisão periódica de usuários ativos e credenciais

Dados pessoais são armazenados no Supabase, região **sa-east-1 (São Paulo, Brasil)**, mantendo os dados em território nacional.

---

## 8. Seus direitos (art. 18 LGPD)

Você, titular de dados pessoais, tem o direito de solicitar, a qualquer momento:

1. **Confirmação** da existência de tratamento
2. **Acesso** aos dados
3. **Correção** de dados incompletos, inexatos ou desatualizados
4. **Anonimização, bloqueio ou eliminação** de dados desnecessários, excessivos ou tratados em desconformidade com a LGPD
5. **Portabilidade** dos dados a outro fornecedor
6. **Eliminação** dos dados tratados com seu consentimento
7. **Informação** sobre entidades com as quais houve uso compartilhado
8. **Informação** sobre a possibilidade de não consentir e as consequências da negativa
9. **Revogação** do consentimento, quando aplicável

### Como exercer seus direitos

Disponibilizamos o **formulário público** `/direitos-titular` no site da Protector Sistemas, que registra a solicitação com protocolo, notifica automaticamente o DPO e envia confirmação por e-mail ao solicitante.

- **Se você é visitante do site ou cliente contratante direto:** preencha o formulário em `/direitos-titular` ou envie sua solicitação para **dpo@appps.com.br**. Responderemos no prazo legal de 15 dias corridos.
- **Se você é morador, proprietário ou visitante de um empreendimento que utiliza o Protector Traffic Control:** a Protector Sistemas atua como Operadora para esses dados. A solicitação deve ser feita primeiro ao **empreendimento contratante** (síndico, administração, setor responsável). Caso a solicitação não seja atendida, use o formulário `/direitos-titular` ou nos contate em **dpo@appps.com.br** — atuaremos como intermediários junto ao Controlador.

---

## 9. Encarregado pelo Tratamento de Dados (DPO)

| Campo | Valor |
|---|---|
| Nome | Glauber Varjão do Nascimento |
| Função | Encarregado pelo Tratamento de Dados Pessoais |
| E-mail | **dpo@appps.com.br** |

O Encarregado é o canal oficial de comunicação entre a Protector Sistemas, os titulares de dados e a Autoridade Nacional de Proteção de Dados (ANPD).

---

## 10. Alterações nesta Política

Esta Política de Privacidade pode ser atualizada periodicamente para refletir mudanças em nossos serviços ou na legislação aplicável. A versão vigente será sempre publicada nesta página, com a data da última atualização indicada no topo. Alterações relevantes serão comunicadas aos clientes contratantes ativos.

---

## 11. Legislação aplicável e foro

Esta Política de Privacidade é regida pelas leis da República Federativa do Brasil, em especial pela **Lei nº 13.709/2018 (LGPD)**. Fica eleito o foro da Comarca de **Salvador/BA** para dirimir quaisquer controvérsias, com renúncia a qualquer outro, por mais privilegiado que seja.

---

**Protector — Sistemas de Segurança**
CNPJ 21.747.444/0001-65
Av. Luís Viana Filho, 1821 — Shopping Amazônia, Loja 13 — Saboeiro — Salvador/BA — CEP 41.180-000
Contato DPO: **dpo@appps.com.br**

*Versão 1.0 — Abril 2026*
