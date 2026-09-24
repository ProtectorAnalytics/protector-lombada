# Manual do Usuário - Protector Traffic Control
## Lombada Educativa Inteligente
### Versão 2.0.0 | Build 8b34a0f | Março 2026

---

## Bem-vindo ao Protector Traffic Control

O **Protector Traffic Control** é o sistema de monitoramento de velocidade para condomínios e vias privadas. Através do dashboard web, você pode acompanhar em tempo real os veículos que passam pela lombada educativa, receber alertas de excesso de velocidade e gerenciar os veículos cadastrados do seu condomínio.

---

## Sumário

1. [Acesso ao Sistema](#1-acesso-ao-sistema)
2. [Tela Inicial (Dashboard)](#2-tela-inicial-dashboard)
3. [Indicadores de Velocidade](#3-indicadores-de-velocidade)
4. [Últimas Capturas](#4-últimas-capturas)
5. [Status das Câmeras](#5-status-das-câmeras)
6. [Gerenciar Veículos](#6-gerenciar-veículos)
7. [Importar Veículos por Excel](#7-importar-veículos-por-excel)
8. [Exportar Veículos para Excel](#8-exportar-veículos-para-excel)
9. [Emails de Alerta](#9-emails-de-alerta)
10. [Notificações Automáticas](#10-notificações-automáticas)
11. [Recuperar Senha](#11-recuperar-senha)
12. [Perguntas Frequentes (FAQ)](#12-perguntas-frequentes-faq)

---

## 1. Acesso ao Sistema

### Como acessar

1. Abra o navegador (Chrome, Firefox, Edge ou Safari)
2. Acesse o endereço fornecido pela Protector Sistemas (ex: `https://lombada.seudominio.com.br`)
3. Você verá a tela de login

### Fazer Login

1. Digite seu **email** cadastrado
2. Digite sua **senha**
3. Clique em **"ENTRAR"**

> Se não possui acesso, solicite suas credenciais ao administrador do sistema.

---

## 2. Tela Inicial (Dashboard)

Após o login, você verá o painel principal com as seguintes informações:

### Barra Superior
- **Logo e nome do sistema** (Protector Traffic Control)
- **Nome do seu condomínio/empresa**
- **Seu email** de login
- **Botão "Veículos"** - acesso rápido ao cadastro de veículos
- **Botão "Sair"** - encerrar sessão

### Área de Estatísticas (cards)
Quatro cards com dados atualizados automaticamente:

| Card               | Descrição                                    |
|--------------------|----------------------------------------------|
| **Passagens Hoje** | Total de veículos registrados no dia         |
| **Alertas Hoje**   | Veículos acima do limite de velocidade        |
| **Vel. Máxima Hoje**| Maior velocidade registrada no dia           |
| **Limite Configurado**| Limite de velocidade configurado para o local|

---

## 3. Indicadores de Velocidade

### Gráfico de Velocidade
Na lateral direita do dashboard, um gráfico mostra a distribuição de velocidades das últimas capturas:

- **Verde (0-20 km/h):** Velocidade adequada
- **Amarelo (21-30 km/h):** Atenção
- **Vermelho (acima de 30 km/h):** Acima do limite

### Velocidade Máxima e Média
- A velocidade máxima registrada no dia é destacada
- A média geral é exibida nos cards de estatística

---

## 4. Últimas Capturas

A seção principal do dashboard mostra as **10 últimas capturas** em formato de cards:

### Informações de cada captura:
- **Foto do veículo** capturada pela câmera
- **Placa** do veículo (em destaque)
- **Velocidade** registrada (com indicador de cor)
- **Data e hora** da captura
- **Câmera** que registrou
- **Nome do morador** (se o veículo estiver cadastrado)
- **Unidade** (se cadastrado)

### Cores da velocidade:
- **Verde:** Abaixo do limite - veículo trafegando normalmente
- **Laranja:** Próximo do limite - atenção
- **Vermelho:** Acima do limite - excesso de velocidade

### Atualização automática
As capturas são atualizadas automaticamente a cada **30 segundos**. O ponto verde pulsa enquanto o painel busca dados novos, e ao lado aparece **"Atualizado às HH:MM:SS"** com a hora da última atualização.

- Se a atualização falhar (internet ou servidor fora do ar), o texto muda para **"Falha ao atualizar às…"** em laranja, e as listas mostram **"Não foi possível carregar as capturas"** com o botão **"Tentar de novo"**. "Nenhuma captura" aparece só quando realmente não houve passagem.
- A atualização automática não tira você da página em que está na tabela.
- Com a aba do navegador em segundo plano, o painel pausa as consultas e atualiza assim que você volta.

### Filtros e tabela de capturas
- Preencha os filtros e aperte **Enter** ou clique em **"Filtrar"**.
- **"Só alertas"** aplica na hora, sem precisar clicar em "Filtrar".
- **"Limpar"** remove os filtros e atualiza tabela, gráfico, indicadores e ranking.
- A tabela mostra até as **300 capturas mais recentes** do período. Quando esse limite é atingido, o rodapé avisa "exibindo as 300 mais recentes; refine o período".
- **"Exportar"** oferece Excel (.xlsx) ou PDF. Enquanto o arquivo é montado, o botão mostra **"Gerando…"**.

### Detalhes da captura e foto ampliada
- Clique (ou toque) num card ou numa linha da tabela para abrir os detalhes. Pelo teclado, use **Tab** até a captura e aperte **Enter**.
- No celular, os detalhes abrem como um painel que sobe da parte de baixo da tela. Para fechar, **arraste o painel para baixo** pela alça no topo, ou toque no ✕.
- Clique na foto para ampliá-la. Um clique na foto ampliada aproxima **no ponto clicado**; com a foto aproximada, arraste para ver outras partes. Sem aproximação, puxar a foto para baixo fecha.
- A tecla **Esc** fecha a foto ampliada, o menu Exportar e as janelas abertas, uma de cada vez.

---

## 5. Status das Câmeras

Na seção de câmeras você pode verificar:

- **Online (verde):** A câmera enviou dados nos últimos 30 minutos
- **Alerta (amarelo):** A câmera está sem enviar dados entre 30 minutos e 6 horas. Em condomínio isso costuma ser só falta de movimento: a câmera registra quando passa um veículo
- **Offline (vermelho):** A câmera não enviou dados há mais de 6 horas — vale verificar energia e rede
- **Aguardando (azul):** A câmera foi cadastrada recentemente e ainda não enviou sua primeira captura

> Se uma câmera aparece como offline, verifique a conexão de internet e energia no local. Se o problema persistir, entre em contato com o suporte técnico.

---

## 6. Gerenciar Veículos

O cadastro de veículos permite que o sistema identifique os moradores e inclua o nome/unidade nas notificações de velocidade.

### Abrir o módulo de veículos
Clique no botão **"Veículos (X)"** na barra superior (onde X é o total cadastrado).

### Aba "Lista"
Mostra todos os veículos cadastrados com:
- **Placa**
- **Nome do morador**
- **Unidade**
- **Marca**
- **Cor**

**Funcionalidades:**
- **Filtrar:** Digite no campo de busca para filtrar por placa, morador, unidade ou marca
- **Paginação:** Navega entre as páginas (10 veículos por página)
- **Excluir:** Clique em "Excluir" para remover um veículo. O sistema pede confirmação e avisa que as capturas dessa placa passam a aparecer como "Veículo não cadastrado".

### Aba "Cadastrar"
Para adicionar um veículo individual:

1. Clique na aba **"Cadastrar"**
2. Preencha:
   - **Placa** (obrigatório) - formato ABC1D23 ou ABC1234
   - **Nome do Morador** - nome completo do proprietário
   - **Unidade** - ex: "Bloco A - Apt 101"
   - **Marca** - ex: "Honda Civic"
   - **Cor** - ex: "Prata"
3. Clique em **"Cadastrar Veículo"**. Enquanto salva, o botão mostra "Salvando…"; ao terminar, aparece o aviso **"Veículo ABC1D23 cadastrado."**

> **Vinculação automática:** Ao cadastrar um veículo, todas as capturas existentes daquela placa passam a exibir imediatamente o nome do morador e unidade — sem necessidade de recarregar a página.

---

## 7. Importar Veículos por Excel

Para cadastrar muitos veículos de uma vez, use a importação por planilha Excel.

### Passo a passo:

1. Clique no botão **"Veículos"** na barra superior
2. Clique na aba **"Importar / Exportar"**
3. Clique em **"Baixar Modelo"** para obter o modelo de planilha
4. Abra o arquivo modelo no Excel ou Google Sheets
5. Preencha os dados seguindo as colunas:

| PLACA    | MORADOR        | UNIDADE           | MARCA          | COR    |
|----------|----------------|-------------------|----------------|--------|
| ABC1D23  | João Silva     | Bloco A - 101     | Honda Civic    | Prata  |
| XYZ9876  | Maria Santos   | Bloco B - 202     | Toyota Corolla | Branco |

6. Salve o arquivo como **.xlsx**
7. Volte ao sistema e clique em **"Selecionar Arquivo"**
8. Escolha o arquivo preenchido
9. O sistema mostrará um **preview**:
   - Quantas linhas foram lidas
   - Quantos veículos novos serão importados
   - Quantos já estão cadastrados (serão ignorados)
10. Clique em **"Importar X veículos"** para confirmar

> **Dica:** Veículos com placa já cadastrada serão automaticamente ignorados, evitando duplicatas.

---

## 8. Exportar Veículos para Excel

Para baixar a lista completa de veículos em formato Excel:

1. Clique no botão **"Veículos"** na barra superior
2. Clique na aba **"Importar / Exportar"**
3. Clique em **"Exportar Excel"** (o botão mostra "Gerando…" enquanto prepara o arquivo)
4. O arquivo `.xlsx` será baixado automaticamente

O arquivo exportado contém todas as colunas: PLACA, MORADOR, UNIDADE, MARCA e COR.

---

## 9. Emails de Alerta

### O que são
Quando um veículo é detectado acima do limite de velocidade, o sistema envia automaticamente um email de alerta para os destinatários cadastrados.

### Gerenciar destinatários

Na seção **"Emails de Alerta"** do dashboard:

1. **Adicionar:** Clique em "Adicionar", preencha nome, email e tipo
2. **Tipos de notificação:**
   - **Alerta:** Recebe avisos de excesso de velocidade
   - **Relatório:** Recebe relatórios periódicos
   - **Todos:** Recebe tudo
3. **Remover:** Clique no botão de remover ao lado do destinatário

### Conteúdo do email de alerta
Cada email de alerta inclui um **PDF anexo** com:
- Foto do veículo
- Placa e velocidade registrada
- Data e hora
- Nome do morador e unidade (se cadastrado)
- Histórico de passagens dos últimos 30 dias

---

## 10. Notificações Automáticas

O sistema funciona de forma totalmente automática:

1. A câmera detecta o veículo e lê a placa
2. O sistema registra a passagem com foto e velocidade
3. Se a velocidade for **acima do limite configurado**:
   - Gera um PDF com os dados da infração
   - Envia email para todos os destinatários de alerta
4. O dashboard é atualizado em tempo real

> **Importante:** O documento PDF é meramente educativo e NÃO tem valor de multa oficial. Seu objetivo é conscientizar os moradores sobre o respeito ao limite de velocidade.

---

## 11. Recuperar Senha

Se você esqueceu sua senha:

1. Na tela de login, clique em **"Esqueci minha senha"**
2. Digite seu **email cadastrado**
3. Clique em **"ENVIAR LINK DE RECUPERAÇÃO"**
4. Verifique seu email (inclusive a caixa de spam)
5. Clique no link recebido. O painel abre direto no formulário de nova senha
6. Digite a **nova senha** (mínimo 6 caracteres) e repita no segundo campo. Se as senhas não conferirem, o aviso aparece na hora
7. Clique em **"SALVAR NOVA SENHA"**. Ao ver "Senha alterada. Entre com a nova senha.", faça login com a nova senha

> O link de recuperação expira após 24 horas. Se expirar, solicite um novo.

---

## 12. Perguntas Frequentes (FAQ)

### As capturas ficam armazenadas por quanto tempo?
As capturas (fotos e registros) ficam armazenadas por **15 dias**. Após esse período, são removidas automaticamente pelo sistema.

### A velocidade mostrada é precisa?
A velocidade é medida pelo **radar integrado** à câmera ALPHADIGI. A precisão depende da calibração do equipamento e das condições de instalação.

### Posso cadastrar veículos de visitantes?
Sim. Você pode cadastrar qualquer placa no sistema. Recomendamos preencher o campo "Nome do Morador" com "Visitante" e a unidade com o morador responsável.

### O sistema funciona 24 horas?
Sim. O sistema opera 24 horas por dia, 7 dias por semana. As câmeras capturam veículos durante o dia e a noite (com iluminação infravermelha).

### Por que uma câmera aparece como "Aguardando"?
O status **"Aguardando" (azul)** indica que a câmera foi cadastrada no sistema mas ainda não enviou sua primeira captura. Isso é normal para câmeras recém-configuradas. Assim que a câmera enviar dados, o status muda automaticamente para "Online".

### Por que uma câmera aparece como "Offline"?
Possíveis causas:
- Queda de energia no local da câmera
- Queda de internet no local
- Problema na câmera (raro)

Aguarde alguns minutos e verifique novamente. Se persistir, contate o suporte.

### Posso acessar o sistema pelo celular?
Sim. O dashboard é responsivo e funciona em qualquer dispositivo com navegador: computador, tablet ou celular.

### Quantos emails de alerta posso cadastrar?
Não há limite. Você pode cadastrar quantos destinatários desejar.

### Como alterar o limite de velocidade?
O limite de velocidade é configurado pelo administrador do sistema. Entre em contato com a Protector Sistemas para solicitar alterações.

### Os dados são seguros?
Sim. O sistema utiliza:
- **Conexão HTTPS** (criptografia em trânsito)
- **Autenticação JWT** (tokens seguros)
- **Banco de dados isolado** por cliente (cada condomínio só vê seus próprios dados)
- **Políticas de acesso (RLS)** no banco de dados

---

## Suporte

Em caso de dúvidas ou problemas:

- **Protector Sistemas**
- Entre em contato com seu representante comercial
- Informe o nome do condomínio e descreva o problema

---

**Protector Traffic Control** - v2.0.0 | Build 8b34a0f | Março 2026
*Sistema de Lombada Educativa Inteligente*
