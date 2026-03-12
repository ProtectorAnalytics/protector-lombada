# Manual da Lombada Educativa Inteligente
## Protector Traffic Control
### Versao 2.0 | Marco 2026

---

## O que e este sistema?

A Lombada Educativa e um sistema que usa cameras ALPHADIGI para detectar veiculos, ler placas e medir velocidade. Quando um veiculo passa acima do limite, o sistema gera um PDF com a foto e envia por email para os responsaveis do condominio.

**Resumo em 4 passos:**
1. A camera le a placa e mede a velocidade
2. Envia os dados para a internet (nosso servidor)
3. O servidor salva tudo e verifica se passou do limite
4. Se passou, gera um PDF e manda por email

---

## Como a camera se conecta ao sistema?

A camera envia os dados para o endereco `protector-lombada.vercel.app` na pasta `/placa`.

**A camera se identifica automaticamente pelo numero de serie.** Nao precisa de token na URL. O numero de serie ja vem dentro dos dados que a camera envia (campo `serialno`). O sistema recebe, procura no banco de dados qual camera tem aquele serial, e pronto.

**Exemplo:** A camera com serial `QFX2152506180113` envia dados → o sistema procura "qual camera tem esse serial?" → encontra "CEC-LOMB01 do Enseada do Castelo" → salva a captura.

---

## PARTE 1: Cadastrar um Novo Cliente

### O que voce precisa antes de comecar

- Acesso ao painel admin: `https://protector-lombada.vercel.app/admin`
- Login de super_admin (email e senha)

### Passo a passo

1. Abra o painel admin no navegador
2. Faca login com seu email e senha de super_admin
3. Na parte de **Clientes**, clique em **"Novo Cliente"**
4. Preencha:
   - **Nome**: nome do condominio (ex: "Enseada do Castelo")
   - **Local/Via**: a rua onde a lombada fica (ex: "Rua Principal")
   - **Cidade/UF**: cidade e estado (ex: "Guarapari/ES")
   - **Limite de Velocidade**: velocidade maxima permitida em km/h (ex: 30)
   - **CNPJ**: CNPJ do condominio
   - **Telefone**: telefone do responsavel
   - **Contato**: nome do responsavel
5. Clique em **"Salvar"**

Pronto! O cliente foi criado.

---

## PARTE 2: Cadastrar uma Camera

### Passo a passo

1. No painel admin, va em **Cameras**
2. Clique em **"Nova Camera"**
3. Selecione o **cliente** (condominio) que essa camera pertence
4. Digite o **nome** da camera (ex: "CEC-LOMB01")
5. Digite o **numero de serie** da camera (ex: "QFX2152506180113")
   - Para encontrar o serial: acesse a camera pelo navegador → Manutencao → Informacao do Dispositivo → campo "Nr serie"
6. Clique em **"Criar"**

**IMPORTANTE:** O numero de serie deve ser EXATAMENTE igual ao que aparece na camera. Se errar uma letra ou numero, a camera nao vai ser reconhecida.

### Se a camera ja existia mas estava desativada

Isso acontece quando voce tenta cadastrar e aparece erro de "serial ja existe". Nesse caso, a camera foi desativada antes e precisa ser reativada. Peca ao administrador do banco de dados para reativar.

---

## PARTE 3: Configurar a Camera Fisica (ALPHADIGI)

Esta e a parte mais importante. Voce vai configurar a camera para enviar os dados para o nosso servidor.

### Como acessar a configuracao

1. Conecte seu computador na mesma rede da camera
2. Abra o navegador e digite o IP da camera (ex: `http://192.168.1.100`)
3. Faca login (usuario e senha da camera)
4. Clique em **Configuracao** (canto superior direito)
5. No menu lateral, clique em **Comunicacao** → **Comunicacao**

### Tela "Configuracoes de HTTP" — Campo por campo

Voce vai ver uma tela com varias secoes. Configure EXATAMENTE assim:

#### Secao: Conf. HTTP Push (lado esquerdo)

| # | Campo | O que colocar | Explicacao |
|---|-------|---------------|------------|
| 1 | **Habilitar** | ✅ Marcado | Liga o envio de dados |
| 2 | **Servidor Pri.** | `protector-lombada.vercel.app` | Endereco do nosso servidor. **CUIDADO:** confira que esta escrito PROTECTOR e nao "rotector" (o campo e pequeno e pode cortar o texto) |
| 3 | **Servidor Seg.** | (vazio) | Nao tem servidor secundario |
| 4 | **Porta** | `443` | Porta do HTTPS |
| 5 | **Timeout** | `10` | Tempo maximo de espera em segundos |
| 6 | **Nr.da Placa** | ✅ Marcado | Envia o numero da placa lida |
| 7 | **Pasta** | `/placa` | Caminho onde o servidor recebe os dados |
| 8 | **Img.Veiculo** | ✅ Marcado | Envia a foto do veiculo inteiro |
| 9 | **Img. Placa** | ✅ Marcado | Envia a foto da placa |
| 10 | **GPIO** | ☐ Desmarcado | Nao usamos |
| 11 | **Pasta (GPIO)** | (qualquer valor, nao importa) | Nao usamos |
| 12 | **Dados Serial** | ☐ Desmarcado | Nao usamos |
| 13 | **Pasta (Serial)** | (vazio) | Nao usamos |
| 14 | **Char Code** | `UTF-8` | Padrao de caracteres |

#### Secao: Heartbeat (centro da tela)

| # | Campo | O que colocar | Explicacao |
|---|-------|---------------|------------|
| 15 | **Habilitar** | ✅ Marcado | Liga o "sinal de vida" da camera |
| 16 | **Pasta** | `/placa` | Envia o heartbeat para o mesmo lugar que as capturas |
| 17 | **Intervalo** | `10` | Envia sinal a cada 10 segundos |
| 18 | **Protocolo** | `Desativar` | Usa o mesmo protocolo do HTTP Push |

#### Secao: Conexao e Seguranca (centro da tela)

| # | Campo | O que colocar | Explicacao |
|---|-------|---------------|------------|
| 19 | **Apenas lista branca** | ☐ Desmarcado | Nao usamos |
| 20 | **Conexao curta** | ☐ Desmarcado | Nao usamos |
| 21 | **Link SSL** | ✅ Marcado | OBRIGATORIO — usa conexao segura (HTTPS) |
| 22 | **Porta SSL** | `443` | Porta do HTTPS |
| 23 | **Autenticacao** | `Anonimo` | Nao precisa de usuario/senha |
| 24 | **QoS (0-5)** | `2` | Qualidade de servico media |
| 25 | **Resultados e fotos** | `Carregar junto` | Envia foto junto com os dados |
| 26 | **Empresa** | (vazio) | Nao obrigatorio |
| 27 | **CNPJ** | (vazio) | Nao obrigatorio |

#### Secao: Retransmissao (canto superior direito)

| # | Campo | O que colocar | Explicacao |
|---|-------|---------------|------------|
| 28 | **Habilitar** | ✅ Marcado | Se falhar o envio, tenta de novo |
| 29 | **Foto** | ✅ Marcado | Reenvia a foto tambem |
| 30 | **Imag. Placa** | ✅ Marcado | Reenvia a imagem da placa |
| 31 | **Modo autonomo** | ✅ Marcado | A camera reenvia sozinha |
| 32 | **Intervalo(S)** | `2` | Espera 2 segundos entre tentativas |
| 33 | **Tempo total(S)** | `100` | Tenta reenviar por ate 100 segundos |

#### Secao: Conf. Http (canto inferior direito)

| # | Campo | O que colocar | Explicacao |
|---|-------|---------------|------------|
| 34 | **Pasta** | (vazio) | Nao usamos |

### Depois de configurar

1. Clique em **OK** para salvar
2. **Reinicie a camera** (Manutencao → Gestao do sistema → Reiniciar)
3. Aguarde 1-2 minutos para a camera voltar
4. Verifique no dashboard se a camera aparece como **Online** (bolinha verde)

---

## PARTE 4: Verificar se a Camera esta Funcionando

### No dashboard

1. Acesse `https://protector-lombada.vercel.app/admin`
2. Na lista de cameras, a camera deve mostrar:
   - **Status**: Online (verde) — significa que esta enviando dados
   - **Ultimo sinal**: horario recente (menos de 5 minutos atras)

### A camera aparece Offline?

Verifique na ordem:

1. **A camera tem internet?** Ela precisa acessar a internet pela porta 443 (HTTPS)
2. **O endereco esta certo?** Confira que o Servidor Pri. esta `protector-lombada.vercel.app` (com P no inicio!)
3. **O serial esta cadastrado?** Compare o serial da camera (Manutencao → Informacao do Dispositivo) com o que esta no painel admin
4. **Link SSL esta habilitado?** Precisa estar marcado
5. **Porta SSL e 443?** Confira
6. **Reiniciou a camera depois de configurar?** Sempre reinicie depois de mudar as configuracoes

---

## PARTE 5: Cadastrar Usuarios

### Tipos de usuario

| Tipo | O que pode fazer |
|------|-----------------|
| **super_admin** | Tudo — todos os clientes, cameras e usuarios |
| **admin_cliente** | Gerencia 1 condominio — cameras, veiculos, emails |
| **operador** | Apenas ve o dashboard do condominio |

### Como criar

1. No painel admin, va em **Usuarios**
2. Clique em **"Novo Usuario"**
3. Preencha: email, senha, nome, selecione o cliente e o tipo
4. Clique em **"Criar"**

---

## PARTE 6: Cadastrar Emails de Alerta

Para que o condominio receba avisos quando alguem passa acima do limite.

1. No painel admin, va em **Emails**
2. Clique em **"Adicionar"**
3. Preencha:
   - **Nome**: quem vai receber (ex: "Portaria Central")
   - **Email**: email do destinatario
   - **Tipo**: escolha `alerta` (recebe avisos de velocidade)
4. Clique em **"Salvar"**

**Tipos de email:**
- `alerta` — so recebe avisos quando alguem ultrapassa o limite
- `relatorio` — recebe relatorios periodicos
- `todos` — recebe tudo

---

## PARTE 7: Como Funciona a Deteccao

Quando um veiculo passa pela camera:

1. A camera le a placa e mede a velocidade com radar
2. Tira uma foto do veiculo
3. Envia tudo para `protector-lombada.vercel.app/placa`
4. O servidor identifica a camera pelo numero de serie
5. Salva a placa, velocidade e foto no banco de dados
6. Verifica: **velocidade > limite do condominio?**
   - **NAO** → salva e pronto
   - **SIM** → gera um PDF com a foto e dados, e envia por email para os destinatarios cadastrados

### O que tem no PDF

- Logo do condominio
- Placa do veiculo
- Velocidade registrada e o limite permitido
- Data e hora
- Foto do veiculo
- Nome do morador (se a placa estiver cadastrada)
- Historico das ultimas 30 passagens daquele veiculo

---

## PARTE 8: Cadastrar Veiculos dos Moradores

Isso e opcional, mas ajuda a identificar quem e o dono do veiculo.

1. No dashboard do condominio, va em **Veiculos**
2. Clique em **"Adicionar"**
3. Preencha: placa, nome do morador, unidade, marca, cor
4. Clique em **"Salvar"**

Quando esse veiculo for detectado, o nome do morador vai aparecer no PDF.

---

## PARTE 9: Personalizacao do PDF

Cada condominio pode ter seu proprio visual no PDF.

No painel admin, edite o cliente e preencha:
- **Titulo do PDF**: ex: "CONDOMINIO ENSEADA DO CASTELO"
- **Subtitulo**: ex: "Lombada Educativa - Controle de Velocidade"
- **Rodape**: ex: "Este documento e meramente educativo e nao tem valor de multa."
- **Logo URL**: link para a imagem do logo do condominio

---

## PARTE 10: Resolucao de Problemas

### "A camera esta Online mas nao aparece nenhuma captura"

- A camera precisa ler uma placa para gerar captura
- Passe um veiculo na frente da camera e veja se aparece

### "A camera esta Offline"

Veja a lista de verificacao na PARTE 4.

### "O email de alerta nao chega"

1. Tem destinatario cadastrado? (PARTE 6)
2. O veiculo passou acima do limite? Se a velocidade for menor que o limite, nao envia email
3. Verifique se o email nao caiu na caixa de spam

### "Erro ao cadastrar camera: serial ja existe"

A camera ja foi cadastrada antes e esta desativada. Peca para reativar no banco de dados.

### "A camera envia mas o sistema nao reconhece"

O serial cadastrado no painel nao bate com o serial real da camera. Confira:
1. Na camera: Manutencao → Informacao do Dispositivo → Nr serie
2. No painel: veja o serial cadastrado
3. Compare letra por letra — tem que ser IDENTICO

---

## CHECKLIST: Novo Condominio do Zero

Use esta lista para nao esquecer nada:

- [ ] 1. Criar o cliente no painel admin (PARTE 1)
- [ ] 2. Cadastrar a camera com o serial correto (PARTE 2)
- [ ] 3. Configurar a camera fisica campo por campo (PARTE 3)
- [ ] 4. Reiniciar a camera
- [ ] 5. Verificar se aparece Online no dashboard (PARTE 4)
- [ ] 6. Criar usuario admin para o condominio (PARTE 5)
- [ ] 7. Cadastrar emails de alerta (PARTE 6)
- [ ] 8. Cadastrar veiculos dos moradores (PARTE 8, opcional)
- [ ] 9. Personalizar o PDF com logo e textos (PARTE 9)
- [ ] 10. Testar: passar um veiculo acima do limite e verificar se chega o email

---

## Dados Tecnicos (para quem precisa)

### Endereco do servidor
- **URL**: `https://protector-lombada.vercel.app`
- **Endpoint de capturas**: `/placa` (roteado para `/api/captura.js`)
- **Endpoint de heartbeat**: `/api/heartbeat`
- **Painel admin**: `/admin`
- **Dashboard**: `/` (raiz)

### Como a camera e identificada
1. O sistema tenta identificar pelo **token** na URL (metodo antigo)
2. Se nao tiver token, identifica pelo **serial number** que vem no corpo do JSON (`AlarmInfoPlate.serialno`)
3. Se nao encontrar por nenhum dos dois, registra erro no log

### Banco de dados
- **Plataforma**: Supabase (PostgreSQL)
- **Tabelas principais**: `clientes`, `cameras`, `capturas`, `veiculos`, `usuarios`, `email_destinatarios`
- **Armazenamento de fotos**: Supabase Storage (bucket `capturas-fotos`)

### Limites
- Maximo 120 requisicoes por minuto por camera
- Capturas sao apagadas automaticamente apos 15 dias
- Camera e considerada Offline se nao enviar dados em 5 minutos

### Variaveis de ambiente (Vercel)

| Variavel | Para que serve |
|----------|---------------|
| `SUPABASE_URL` | Endereco do banco de dados |
| `SUPABASE_SERVICE_KEY` | Chave de acesso admin ao banco |
| `SUPABASE_ANON_KEY` | Chave publica (usada no frontend) |
| `CRON_SECRET` | Senha para o job de limpeza automatica |
| `SMTP_HOST` | Servidor de email |
| `SMTP_PORT` | Porta do email (465) |
| `SMTP_SECURE` | Usar SSL (true) |
| `SMTP_USER` | Email que envia os alertas |
| `SMTP_PASS` | Senha do email |

---

**Protector Traffic Control** — Lombada Educativa Inteligente — v2.0 | Marco 2026
