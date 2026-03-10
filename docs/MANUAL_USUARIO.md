# Manual do Usuario — Protector Lombada Educativa

**Sistema de Monitoramento de Velocidade para Condominios**

---

## SUMARIO

1. [O que e o Protector Lombada?](#1-o-que-e-o-protector-lombada)
2. [Primeiro Acesso ao Dashboard](#2-primeiro-acesso-ao-dashboard)
3. [Tela de Login](#3-tela-de-login)
4. [Painel Principal](#4-painel-principal)
5. [Cards de Estatisticas](#5-cards-de-estatisticas)
6. [Filtros de Busca](#6-filtros-de-busca)
7. [Tabela de Capturas](#7-tabela-de-capturas)
8. [Detalhes da Captura (Modal)](#8-detalhes-da-captura-modal)
9. [Grafico de Passagens por Hora](#9-grafico-de-passagens-por-hora)
10. [Ranking de Placas](#10-ranking-de-placas)
11. [Notificacoes por E-mail](#11-notificacoes-por-e-mail)
12. [Relatorio PDF](#12-relatorio-pdf)
13. [Perguntas Frequentes](#13-perguntas-frequentes)

---

## 1. O que e o Protector Lombada?

O **Protector Lombada Educativa** e um sistema que monitora a velocidade dos veiculos que passam pelas lombadas educativas do seu condominio.

**O que ele faz:**
- Registra automaticamente cada veiculo que passa pela lombada
- Detecta a placa, velocidade e tira uma foto
- Se o veiculo estiver acima do limite de velocidade, envia um **alerta por e-mail** com um **relatorio em PDF**
- Permite acompanhar tudo em tempo real pelo **painel web (dashboard)**

**Como funciona:**
A camera instalada na lombada detecta o veiculo, mede a velocidade e envia os dados automaticamente para o sistema. Voce nao precisa fazer nada — tudo e automatico.

---

## 2. Primeiro Acesso ao Dashboard

1. Abra o navegador (Chrome, Firefox, Edge ou Safari)
2. Acesse o endereco fornecido pelo seu integrador (ex: `https://protector-lombada.vercel.app`)
3. Voce vera a tela de login

---

## 3. Tela de Login

A tela de login possui dois campos:

- **E-mail:** Seu e-mail cadastrado no sistema
- **Senha:** Sua senha de acesso

Apos preencher, clique no botao **ENTRAR**.

**Problemas no login?**
- Verifique se o e-mail esta correto (com @ e dominio)
- Verifique se a senha esta correta (maiusculas e minusculas importam)
- Se esqueceu a senha, entre em contato com o integrador para reset

---

## 4. Painel Principal

Apos fazer login, voce vera o painel principal dividido em:

```
┌─────────────────────────────────────────────────┐
│  PROTECTOR    Cond. Parque das Flores    [Sair] │
├─────────────────────────────────────────────────┤
│                                                  │
│  [Passagens]  [Alertas]  [Vel.Max]  [Limite]    │
│     125          8         58km/h    30km/h      │
│                                                  │
│  [Filtros: Data | Placa | Velocidade] [Filtrar]  │
│                                                  │
│  ┌──────────────────────────┐  ┌──────────────┐ │
│  │  Tabela de Capturas      │  │ Grafico      │ │
│  │  (clique para detalhes)  │  │ por hora     │ │
│  │                          │  │              │ │
│  │                          │  │ Top 8 placas │ │
│  └──────────────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────┘
```

---

## 5. Cards de Estatisticas

No topo do painel, voce encontra 4 cards com informacoes do dia:

| Card | O que mostra |
|------|-------------|
| **Passagens Hoje** | Total de veiculos que passaram pela lombada hoje |
| **Alertas Hoje** | Quantos estavam acima do limite de velocidade |
| **Vel. Maxima Hoje** | A maior velocidade registrada hoje |
| **Limite Configurado** | O limite de velocidade do seu condominio |

Os dados atualizam **automaticamente a cada 30 segundos**.

---

## 6. Filtros de Busca

Abaixo dos cards, voce pode filtrar as capturas:

| Filtro | Como usar |
|--------|-----------|
| **Data Inicial** | Selecione a data de inicio (por padrao: hoje) |
| **Data Final** | Selecione a data final (por padrao: hoje) |
| **Placa** | Digite parte da placa (ex: "RPK" para buscar todas que contem RPK) |
| **Vel. Min** | Velocidade minima para filtrar |
| **Vel. Max** | Velocidade maxima para filtrar |

**Botoes:**
- **Filtrar** — Aplica os filtros selecionados
- **Limpar** — Volta para os filtros padrao (somente hoje)

**Dica:** Para ver todos os alertas do dia, deixe os filtros padrao e coloque no campo "Vel. Min" o valor do limite (ex: 31).

---

## 7. Tabela de Capturas

A tabela mostra ate **200 registros** com as seguintes colunas:

| Coluna | Descricao |
|--------|-----------|
| **Placa** | Placa do veiculo detectada pela camera |
| **Velocidade** | Velocidade em km/h (colorida conforme o risco) |
| **Data/Hora** | Quando o veiculo passou |
| **Alerta** | Icone de envelope se o e-mail de alerta foi enviado |

### Cores da velocidade:

| Cor | Significado |
|-----|------------|
| **Verde** | Dentro do limite — tudo normal |
| **Laranja** | Levemente acima do limite (ate 20 km/h acima) |
| **Vermelho** | Muito acima do limite (mais de 20 km/h acima) |

**Para ver mais detalhes:** Clique em qualquer linha da tabela para abrir o modal com foto e informacoes completas.

---

## 8. Detalhes da Captura (Modal)

Ao clicar em uma linha da tabela, abre uma janela com:

- **Foto do veiculo** (capturada pela camera)
- **Placa** do veiculo
- **Velocidade** registrada
- **Data e Hora** exatas
- **Tipo de veiculo** (carro, caminhao, etc.)
- **Cor do veiculo** detectada
- **Pixels LPR** (qualidade da leitura da placa)
- **Status de notificacao** (se o alerta foi enviado)

Para fechar: clique no **X** no canto superior direito ou pressione a tecla **Esc**.

---

## 9. Grafico de Passagens por Hora

Na lateral direita, o grafico de barras mostra **quantos veiculos passaram em cada hora do dia**.

- O eixo horizontal mostra as horas (0h a 23h)
- O eixo vertical mostra a quantidade de passagens
- Barras laranjas indicam horarios com passagens

**Utilidade:** Identifique os horarios de maior movimento para otimizar a seguranca.

---

## 10. Ranking de Placas

Abaixo do grafico, voce ve o **Top 8 Placas** — os veiculos que mais passaram nos ultimos 15 dias.

Cada item mostra:
- Posicao no ranking (1 a 8)
- Placa do veiculo
- Quantidade de passagens

**Utilidade:** Identifique veiculos frequentes e potenciais infratores recorrentes.

---

## 11. Notificacoes por E-mail

Quando um veiculo e detectado **acima do limite de velocidade**, o sistema automaticamente:

1. Gera um **relatorio em PDF** (veja secao 12)
2. Envia um **e-mail de alerta** para todos os e-mails cadastrados

O e-mail contem:
- Placa do veiculo
- Velocidade registrada
- Limite do condominio
- Local da lombada
- Data e hora
- **PDF em anexo** com o relatorio completo

**Obs:** Os e-mails sao enviados apenas quando a velocidade **excede** o limite configurado. Passagens dentro do limite nao geram alerta.

---

## 12. Relatorio PDF

O PDF de notificacao contem:

1. **Cabecalho** — "NOTIFICACAO ORIENTATIVA" + nome do condominio
2. **Dados do veiculo** — Placa (em vermelho), nome do morador e unidade (se cadastrados)
3. **Dados da ocorrencia** — Velocidade (em vermelho), data e hora
4. **Foto do veiculo** — Imagem capturada pela camera
5. **Historico** — Ultimas 30 passagens daquela mesma placa (com data, hora e velocidade)
6. **Rodape** — Assinatura do sistema

**Nota:** Velocidades iguais ou inferiores a 10 km/h sao exibidas como "1" no relatorio (padrao do sistema de lombada).

---

## 13. Perguntas Frequentes

### A camera precisa de internet?
**Sim.** A camera ALPHADIGI envia os dados via internet (Wi-Fi ou cabo) para o servidor. Sem internet, os dados nao sao transmitidos.

### Os dados ficam armazenados por quanto tempo?
Os dados sao mantidos por **15 dias**. Apos esse periodo, sao automaticamente removidos pelo sistema de limpeza.

### Posso alterar o limite de velocidade?
Sim, mas essa alteracao e feita pelo integrador no banco de dados. Entre em contato com ele.

### Posso adicionar mais e-mails de notificacao?
Sim. O integrador pode cadastrar quantos e-mails forem necessarios na lista de notificacao do seu condominio.

### A placa aparece errada. O que fazer?
A leitura da placa depende da qualidade da imagem. Placas sujas, danificadas ou com fontes nao-padrao podem ser lidas incorretamente. Isso e uma limitacao da tecnologia LPR.

### Posso ver as capturas pelo celular?
Sim. O dashboard e responsivo e funciona em qualquer navegador de celular ou tablet.

### Os alertas chegam em tempo real?
Sim. O e-mail e enviado segundos apos a camera detectar o veiculo acima do limite.

### Como cadastrar os veiculos dos moradores?
O integrador cadastra os veiculos no sistema. Forneca: placa, nome do morador, bloco/apartamento. Assim, o relatorio mostra o nome do morador na notificacao.

### O que significa "Pixels LPR"?
E a resolucao em pixels da area da placa na imagem. Quanto maior o numero, melhor a qualidade da leitura. Valores acima de 100 sao considerados bons.

### Quantas cameras posso ter?
Nao ha limite. Cada camera recebe um token unico e todas enviam dados para o mesmo sistema.

---

## SUPORTE

Para suporte tecnico, entre em contato com seu integrador:

**Protector Sistemas de Seguranca Eletronica**

---

*Manual do Usuario — Protector Lombada Educativa v1.0.0*
