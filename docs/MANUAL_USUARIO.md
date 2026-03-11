# Manual do Usuario - Protector Traffic Control
## Lombada Educativa Inteligente
### Versao 1.0.0 | Marco 2026

---

## Bem-vindo ao Protector Traffic Control

O **Protector Traffic Control** e o sistema de monitoramento de velocidade para condominios e vias privadas. Atraves do dashboard web, voce pode acompanhar em tempo real os veiculos que passam pela lombada educativa, receber alertas de excesso de velocidade e gerenciar os veiculos cadastrados do seu condominio.

---

## Sumario

1. [Acesso ao Sistema](#1-acesso-ao-sistema)
2. [Tela Inicial (Dashboard)](#2-tela-inicial-dashboard)
3. [Indicadores de Velocidade](#3-indicadores-de-velocidade)
4. [Ultimas Capturas](#4-ultimas-capturas)
5. [Status das Cameras](#5-status-das-cameras)
6. [Gerenciar Veiculos](#6-gerenciar-veiculos)
7. [Importar Veiculos por Excel](#7-importar-veiculos-por-excel)
8. [Exportar Veiculos para Excel](#8-exportar-veiculos-para-excel)
9. [Emails de Alerta](#9-emails-de-alerta)
10. [Notificacoes Automaticas](#10-notificacoes-automaticas)
11. [Recuperar Senha](#11-recuperar-senha)
12. [Perguntas Frequentes (FAQ)](#12-perguntas-frequentes-faq)

---

## 1. Acesso ao Sistema

### Como acessar

1. Abra o navegador (Chrome, Firefox, Edge ou Safari)
2. Acesse o endereco fornecido pela Protector Sistemas (ex: `https://lombada.seudominio.com.br`)
3. Voce vera a tela de login

### Fazer Login

1. Digite seu **email** cadastrado
2. Digite sua **senha**
3. Clique em **"ENTRAR"**

> Se nao possui acesso, solicite suas credenciais ao administrador do sistema.

---

## 2. Tela Inicial (Dashboard)

Apos o login, voce vera o painel principal com as seguintes informacoes:

### Barra Superior
- **Logo e nome do sistema** (Protector Traffic Control)
- **Nome do seu condominio/empresa**
- **Seu email** de login
- **Botao "Veiculos"** - acesso rapido ao cadastro de veiculos
- **Botao "Sair"** - encerrar sessao

### Area de Estatisticas (cards)
Quatro cards com dados atualizados automaticamente:

| Card               | Descricao                                    |
|--------------------|----------------------------------------------|
| **Capturas Hoje**  | Total de veiculos registrados no dia         |
| **Velocidade Media**| Velocidade media de todos os veiculos do dia|
| **Acima do Limite**| Quantidade de veiculos acima da velocidade permitida |
| **Cameras Online** | Quantidade de cameras funcionando            |

---

## 3. Indicadores de Velocidade

### Grafico de Velocidade
Na lateral direita do dashboard, um grafico mostra a distribuicao de velocidades das ultimas capturas:

- **Verde (0-20 km/h):** Velocidade adequada
- **Amarelo (21-30 km/h):** Atencao
- **Vermelho (acima de 30 km/h):** Acima do limite

### Velocidade Maxima e Media
- A velocidade maxima registrada no dia e destacada
- A media geral e exibida nos cards de estatistica

---

## 4. Ultimas Capturas

A secao principal do dashboard mostra as **10 ultimas capturas** em formato de cards:

### Informacoes de cada captura:
- **Foto do veiculo** capturada pela camera
- **Placa** do veiculo (em destaque)
- **Velocidade** registrada (com indicador de cor)
- **Data e hora** da captura
- **Camera** que registrou
- **Nome do morador** (se o veiculo estiver cadastrado)
- **Unidade** (se cadastrado)

### Cores da velocidade:
- **Verde:** Abaixo do limite - veiculo trafegando normalmente
- **Laranja:** Proximo do limite - atencao
- **Vermelho:** Acima do limite - excesso de velocidade

### Atualizacao automatica
As capturas sao atualizadas automaticamente a cada **30 segundos**. O ponto verde pulsante no canto superior direito indica que o sistema esta atualizando.

---

## 5. Status das Cameras

Na secao de cameras voce pode verificar:

- **Camera Online (verde):** A camera esta funcionando normalmente e enviando dados
- **Camera Offline (vermelho):** A camera nao enviou dados nos ultimos 5 minutos

> Se uma camera aparece como offline, verifique a conexao de internet no local. Se o problema persistir, entre em contato com o suporte tecnico.

---

## 6. Gerenciar Veiculos

O cadastro de veiculos permite que o sistema identifique os moradores e inclua o nome/unidade nas notificacoes de velocidade.

### Abrir o modulo de veiculos
Clique no botao **"Veiculos (X)"** na barra superior (onde X e o total cadastrado).

### Aba "Lista"
Mostra todos os veiculos cadastrados com:
- **Placa**
- **Nome do morador**
- **Unidade**
- **Marca/modelo**
- **Cor**

**Funcionalidades:**
- **Filtrar:** Digite no campo de busca para filtrar por placa, morador, unidade ou marca
- **Paginacao:** Navega entre as paginas (10 veiculos por pagina)
- **Excluir:** Clique em "Excluir" para remover um veiculo

### Aba "Cadastrar"
Para adicionar um veiculo individual:

1. Clique na aba **"Cadastrar"**
2. Preencha:
   - **Placa** (obrigatorio) - formato ABC1D23 ou ABC1234
   - **Nome do Morador** - nome completo do proprietario
   - **Unidade** - ex: "Bloco A - Apt 101"
   - **Marca/Modelo** - ex: "Honda Civic"
   - **Cor** - ex: "Prata"
3. Clique em **"Cadastrar Veiculo"**

---

## 7. Importar Veiculos por Excel

Para cadastrar muitos veiculos de uma vez, use a importacao por planilha Excel.

### Passo a passo:

1. Clique no botao **"Veiculos"** na barra superior
2. Clique na aba **"Importar / Exportar"**
3. Clique em **"Baixar Modelo"** para obter o modelo de planilha
4. Abra o arquivo modelo no Excel ou Google Sheets
5. Preencha os dados seguindo as colunas:

| PLACA    | MORADOR        | UNIDADE           | MARCA          | COR    |
|----------|----------------|-------------------|----------------|--------|
| ABC1D23  | Joao Silva     | Bloco A - 101     | Honda Civic    | Prata  |
| XYZ9876  | Maria Santos   | Bloco B - 202     | Toyota Corolla | Branco |

6. Salve o arquivo como **.xlsx**
7. Volte ao sistema e clique em **"Selecionar Arquivo"**
8. Escolha o arquivo preenchido
9. O sistema mostrara um **preview**:
   - Quantas linhas foram lidas
   - Quantos veiculos novos serao importados
   - Quantos ja estao cadastrados (serao ignorados)
10. Clique em **"Importar X veiculos"** para confirmar

> **Dica:** Veiculos com placa ja cadastrada serao automaticamente ignorados, evitando duplicatas.

---

## 8. Exportar Veiculos para Excel

Para baixar a lista completa de veiculos em formato Excel:

1. Clique no botao **"Veiculos"** na barra superior
2. Clique na aba **"Importar / Exportar"**
3. Clique em **"Exportar Excel"**
4. O arquivo `.xlsx` sera baixado automaticamente

O arquivo exportado contem todas as colunas: PLACA, MORADOR, UNIDADE, MARCA e COR.

---

## 9. Emails de Alerta

### O que sao
Quando um veiculo e detectado acima do limite de velocidade, o sistema envia automaticamente um email de alerta para os destinatarios cadastrados.

### Gerenciar destinatarios

Na secao **"Emails de Alerta"** do dashboard:

1. **Adicionar:** Clique em "Adicionar", preencha nome, email e tipo
2. **Tipos de notificacao:**
   - **Alerta:** Recebe avisos de excesso de velocidade
   - **Relatorio:** Recebe relatorios periodicos
   - **Todos:** Recebe tudo
3. **Remover:** Clique no botao de remover ao lado do destinatario

### Conteudo do email de alerta
Cada email de alerta inclui um **PDF anexo** com:
- Foto do veiculo
- Placa e velocidade registrada
- Data e hora
- Nome do morador e unidade (se cadastrado)
- Historico de passagens dos ultimos 30 dias

---

## 10. Notificacoes Automaticas

O sistema funciona de forma totalmente automatica:

1. A camera detecta o veiculo e le a placa
2. O sistema registra a passagem com foto e velocidade
3. Se a velocidade for **acima do limite configurado**:
   - Gera um PDF com os dados da infracao
   - Envia email para todos os destinatarios de alerta
4. O dashboard e atualizado em tempo real

> **Importante:** O documento PDF e meramente educativo e NAO tem valor de multa oficial. Seu objetivo e conscientizar os moradores sobre o respeito ao limite de velocidade.

---

## 11. Recuperar Senha

Se voce esqueceu sua senha:

1. Na tela de login, clique em **"Esqueci minha senha"**
2. Digite seu **email cadastrado**
3. Clique em **"ENVIAR LINK DE RECUPERACAO"**
4. Verifique seu email (inclusive a caixa de spam)
5. Clique no link recebido
6. Defina sua **nova senha** (minimo 6 caracteres)
7. Faca login com a nova senha

> O link de recuperacao expira apos 24 horas. Se expirar, solicite um novo.

---

## 12. Perguntas Frequentes (FAQ)

### As capturas ficam armazenadas por quanto tempo?
As capturas (fotos e registros) ficam armazenadas por **15 dias**. Apos esse periodo, sao removidas automaticamente pelo sistema.

### A velocidade mostrada e precisa?
A velocidade e medida pelo **radar integrado** a camera ALPHADIGI. A precisao depende da calibracao do equipamento e das condicoes de instalacao.

### Posso cadastrar veiculos de visitantes?
Sim. Voce pode cadastrar qualquer placa no sistema. Recomendamos preencher o campo "Nome do Morador" com "Visitante" e a unidade com o morador responsavel.

### O sistema funciona 24 horas?
Sim. O sistema opera 24 horas por dia, 7 dias por semana. As cameras capturam veiculos durante o dia e a noite (com iluminacao infravermelha).

### Por que uma camera aparece como "Offline"?
Possíveis causas:
- Queda de energia no local da camera
- Queda de internet no local
- Problema na camera (raro)

Aguarde alguns minutos e verifique novamente. Se persistir, contate o suporte.

### Posso acessar o sistema pelo celular?
Sim. O dashboard e responsivo e funciona em qualquer dispositivo com navegador: computador, tablet ou celular.

### Quantos emails de alerta posso cadastrar?
Nao ha limite. Voce pode cadastrar quantos destinatarios desejar.

### Como alterar o limite de velocidade?
O limite de velocidade e configurado pelo administrador do sistema. Entre em contato com a Protector Sistemas para solicitar alteracoes.

### Os dados sao seguros?
Sim. O sistema utiliza:
- **Conexao HTTPS** (criptografia em transito)
- **Autenticacao JWT** (tokens seguros)
- **Banco de dados isolado** por cliente (cada condominio so ve seus proprios dados)
- **Politicas de acesso (RLS)** no banco de dados

---

## Suporte

Em caso de duvidas ou problemas:

- **Protector Sistemas**
- Entre em contato com seu representante comercial
- Informe o nome do condominio e descreva o problema

---

**Protector Traffic Control** - v1.0.0 | Marco 2026
*Sistema de Lombada Educativa Inteligente*
