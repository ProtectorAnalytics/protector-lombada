# Manual da Lombada Educativa Inteligente
## Protector Traffic Control
### Versão 2.0 | Março 2026

---

## O que é este sistema?

A Lombada Educativa é um sistema que usa câmeras ALPHADIGI para detectar veículos, ler placas e medir velocidade. Quando um veículo passa acima do limite, o sistema gera um PDF com a foto e envia por email para os responsáveis do condomínio.

**Resumo em 4 passos:**
1. A câmera lê a placa e mede a velocidade
2. Envia os dados para a internet (nosso servidor)
3. O servidor salva tudo e verifica se passou do limite
4. Se passou, gera um PDF e manda por email

---

## Como a câmera se conecta ao sistema?

A câmera envia os dados para o endereço `lombada.appps.com.br` na pasta `/placa`.

**A câmera se identifica automaticamente pelo número de série.** Não precisa de token na URL. O número de série já vem dentro dos dados que a câmera envia (campo `serialno`). O sistema recebe, procura no banco de dados qual câmera tem aquele serial, e pronto.

**Exemplo:** A câmera com serial `QFX2152506180113` envia dados → o sistema procura "qual câmera tem esse serial?" → encontra "CEC-LOMB01 do Enseada do Castelo" → salva a captura.

---

## PARTE 1: Cadastrar um Novo Cliente

### O que você precisa antes de começar

- Acesso ao painel admin: `https://lombada.appps.com.br/admin`
- Login de super_admin (email e senha)

### Passo a passo

1. Abra o painel admin no navegador
2. Faça login com seu email e senha de super_admin
3. Na parte de **Clientes**, clique em **"Novo Cliente"**
4. Preencha:
   - **Nome**: nome do condomínio (ex: "Enseada do Castelo")
   - **Local/Via**: a rua onde a lombada fica (ex: "Rua Principal")
   - **Cidade/UF**: cidade e estado (ex: "Guarapari/ES")
   - **Limite de Velocidade**: velocidade máxima permitida em km/h (ex: 30)
   - **CNPJ**: CNPJ do condomínio
   - **Telefone**: telefone do responsável
   - **Contato**: nome do responsável
5. Clique em **"Salvar"**

Pronto! O cliente foi criado.

---

## PARTE 2: Cadastrar uma Câmera

### Passo a passo

1. No painel admin, vá em **Câmeras**
2. Clique em **"Nova Câmera"**
3. Selecione o **cliente** (condomínio) que essa câmera pertence
4. Digite o **nome** da câmera (ex: "CEC-LOMB01")
5. Digite o **número de série** da câmera (ex: "QFX2152506180113")
   - Para encontrar o serial: acesse a câmera pelo navegador → Manutenção → Informação do Dispositivo → campo "Nr série"
6. Clique em **"Criar"**

**IMPORTANTE:** O número de série deve ser EXATAMENTE igual ao que aparece na câmera. Se errar uma letra ou número, a câmera não vai ser reconhecida.

### Se a câmera já existia mas estava desativada

Isso acontece quando você tenta cadastrar e aparece erro de "serial já existe". Nesse caso, a câmera foi desativada antes e precisa ser reativada. Peça ao administrador do banco de dados para reativar.

---

## PARTE 3: Configurar a Câmera Física (ALPHADIGI)

Esta é a parte mais importante. Você vai configurar a câmera para enviar os dados para o nosso servidor.

### Como acessar a configuração

1. Conecte seu computador na mesma rede da câmera
2. Abra o navegador e digite o IP da câmera (ex: `http://192.168.1.100`)
3. Faça login (usuário e senha da câmera)
4. Clique em **Configuração** (canto superior direito)
5. No menu lateral, clique em **Comunicação** → **Comunicação**

### Tela "Configurações de HTTP" — Campo por campo

Você vai ver uma tela com várias seções. Configure EXATAMENTE assim:

#### Seção: Conf. HTTP Push (lado esquerdo)

| # | Campo | O que colocar | Explicação |
|---|-------|---------------|------------|
| 1 | **Habilitar** | ✅ Marcado | Liga o envio de dados |
| 2 | **Servidor Pri.** | `lombada.appps.com.br` | Endereço do nosso servidor. Use SEMPRE o domínio próprio, nunca `protector-lombada.vercel.app`: o endereço `.vercel.app` é gerado pela plataforma e mudaria se o projeto fosse renomeado ou transferido, o que pararia o envio da câmera. O painel de saúde da câmera avisa quando encontra uma configurada com o endereço antigo |
| 3 | **Servidor Seg.** | (vazio) | Não tem servidor secundário |
| 4 | **Porta** | `443` | Porta do HTTPS |
| 5 | **Timeout** | `10` | Tempo máximo de espera em segundos |
| 6 | **Nr.da Placa** | ✅ Marcado | Envia o número da placa lida |
| 7 | **Pasta** | `/placa` | Caminho onde o servidor recebe os dados |
| 8 | **Img.Veículo** | ✅ Marcado | Envia a foto do veículo inteiro |
| 9 | **Img. Placa** | ✅ Marcado | Envia a foto da placa |
| 10 | **GPIO** | ☐ Desmarcado | Não usamos |
| 11 | **Pasta (GPIO)** | (qualquer valor, não importa) | Não usamos |
| 12 | **Dados Serial** | ☐ Desmarcado | Não usamos |
| 13 | **Pasta (Serial)** | (vazio) | Não usamos |
| 14 | **Char Code** | `UTF-8` | Padrão de caracteres |

#### Seção: Heartbeat (centro da tela)

| # | Campo | O que colocar | Explicação |
|---|-------|---------------|------------|
| 15 | **Habilitar** | ✅ Marcado | Liga o "sinal de vida" da câmera |
| 16 | **Pasta** | `/placa` | Envia o heartbeat para o mesmo lugar que as capturas |
| 17 | **Intervalo** | `10` | Envia sinal a cada 10 segundos |
| 18 | **Protocolo** | `Desativar` | Usa o mesmo protocolo do HTTP Push |

#### Seção: Conexão e Segurança (centro da tela)

| # | Campo | O que colocar | Explicação |
|---|-------|---------------|------------|
| 19 | **Apenas lista branca** | ☐ Desmarcado | Não usamos |
| 20 | **Conexão curta** | ☐ Desmarcado | Não usamos |
| 21 | **Link SSL** | ✅ Marcado | OBRIGATÓRIO — usa conexão segura (HTTPS) |
| 22 | **Porta SSL** | `443` | Porta do HTTPS |
| 23 | **Autenticação** | `Anonimo` | Não precisa de usuário/senha |
| 24 | **QoS (0-5)** | `2` | Qualidade de serviço média |
| 25 | **Resultados e fotos** | `Carregar junto` | Envia foto junto com os dados |
| 26 | **Empresa** | (vazio) | Não obrigatório |
| 27 | **CNPJ** | (vazio) | Não obrigatório |

#### Seção: Retransmissão (canto superior direito)

| # | Campo | O que colocar | Explicação |
|---|-------|---------------|------------|
| 28 | **Habilitar** | ✅ Marcado | Se falhar o envio, tenta de novo |
| 29 | **Foto** | ✅ Marcado | Reenvia a foto também |
| 30 | **Imag. Placa** | ✅ Marcado | Reenvia a imagem da placa |
| 31 | **Modo autônomo** | ✅ Marcado | A câmera reenvia sozinha |
| 32 | **Intervalo(S)** | `2` | Espera 2 segundos entre tentativas |
| 33 | **Tempo total(S)** | `100` | Tenta reenviar por até 100 segundos |

#### Seção: Conf. Http (canto inferior direito)

| # | Campo | O que colocar | Explicação |
|---|-------|---------------|------------|
| 34 | **Pasta** | (vazio) | Não usamos |

### Depois de configurar

1. Clique em **OK** para salvar
2. **Reinicie a câmera** (Manutenção → Gestão do sistema → Reiniciar)
3. Aguarde 1-2 minutos para a câmera voltar
4. Verifique no dashboard se a câmera aparece como **Online** (bolinha verde)

---

## PARTE 4: Verificar se a Câmera está Funcionando

### No dashboard

1. Acesse `https://lombada.appps.com.br/admin`
2. Na lista de câmeras, a câmera deve mostrar:
   - **Status**: Online (verde) — significa que está enviando dados
   - **Último sinal**: horário recente (menos de 5 minutos atrás)

### A câmera aparece Offline?

Verifique na ordem:

1. **A câmera tem internet?** Ela precisa acessar a internet pela porta 443 (HTTPS)
2. **O endereço está certo?** Confira que o Servidor Pri. está `lombada.appps.com.br`
3. **O serial está cadastrado?** Compare o serial da câmera (Manutenção → Informação do Dispositivo) com o que está no painel admin
4. **Link SSL está habilitado?** Precisa estar marcado
5. **Porta SSL é 443?** Confira
6. **Reiniciou a câmera depois de configurar?** Sempre reinicie depois de mudar as configurações

---

## PARTE 5: Cadastrar Usuários

### Tipos de usuário

| Tipo | O que pode fazer |
|------|-----------------|
| **super_admin** | Tudo — todos os clientes, câmeras e usuários |
| **admin_cliente** | Gerencia 1 condomínio — câmeras, veículos, emails |
| **operador** | Apenas vê o dashboard do condomínio |

### Como criar

1. No painel admin, vá em **Usuários**
2. Clique em **"Novo Usuário"**
3. Preencha: email, senha, nome, selecione o cliente e o tipo
4. Clique em **"Criar"**

---

## PARTE 6: Cadastrar Emails de Alerta

Para que o condomínio receba avisos quando alguém passa acima do limite.

1. No painel admin, vá em **Emails**
2. Clique em **"Adicionar"**
3. Preencha:
   - **Nome**: quem vai receber (ex: "Portaria Central")
   - **Email**: email do destinatário
   - **Tipo**: escolha `alerta` (recebe avisos de velocidade)
4. Clique em **"Salvar"**

**Tipos de email:**
- `alerta` — só recebe avisos quando alguém ultrapassa o limite
- `relatorio` — recebe relatórios periódicos
- `todos` — recebe tudo

---

## PARTE 7: Como Funciona a Detecção

Quando um veículo passa pela câmera:

1. A câmera lê a placa e mede a velocidade com radar
2. Tira uma foto do veículo
3. Envia tudo para `lombada.appps.com.br/placa`
4. O servidor identifica a câmera pelo número de série
5. Salva a placa, velocidade e foto no banco de dados
6. Verifica: **velocidade > limite do condomínio?**
   - **NÃO** → salva e pronto
   - **SIM** → gera um PDF com a foto e dados, e envia por email para os destinatários cadastrados

### O que tem no PDF

- Logo do condomínio
- Placa do veículo
- Velocidade registrada e o limite permitido
- Data e hora
- Foto do veículo
- Nome do morador (se a placa estiver cadastrada)
- Histórico das últimas 30 passagens daquele veículo

---

## PARTE 8: Cadastrar Veículos dos Moradores

Isso é opcional, mas ajuda a identificar quem é o dono do veículo.

1. No dashboard do condomínio, vá em **Veículos**
2. Clique em **"Adicionar"**
3. Preencha: placa, nome do morador, unidade, marca, cor
4. Clique em **"Salvar"**

Quando esse veículo for detectado, o nome do morador vai aparecer no PDF.

---

## PARTE 9: Personalização do PDF

Cada condomínio pode ter seu próprio visual no PDF.

No painel admin, edite o cliente e preencha:
- **Título do PDF**: ex: "CONDOMÍNIO ENSEADA DO CASTELO"
- **Subtítulo**: ex: "Lombada Educativa - Controle de Velocidade"
- **Rodapé**: ex: "Este documento é meramente educativo e não tem valor de multa."
- **Logo URL**: link para a imagem do logo do condomínio

---

## PARTE 10: Resolução de Problemas

### "A câmera está Online mas não aparece nenhuma captura"

- A câmera precisa ler uma placa para gerar captura
- Passe um veículo na frente da câmera e veja se aparece

### "A câmera está Offline"

Veja a lista de verificação na PARTE 4.

### "O email de alerta não chega"

1. Tem destinatário cadastrado? (PARTE 6)
2. O veículo passou acima do limite? Se a velocidade for menor que o limite, não envia email
3. Verifique se o email não caiu na caixa de spam

### "Erro ao cadastrar câmera: serial já existe"

A câmera já foi cadastrada antes e está desativada. Peça para reativar no banco de dados.

### "A câmera envia mas o sistema não reconhece"

O serial cadastrado no painel não bate com o serial real da câmera. Confira:
1. Na câmera: Manutenção → Informação do Dispositivo → Nr série
2. No painel: veja o serial cadastrado
3. Compare letra por letra — tem que ser IDÊNTICO

---

## PARTE 11: Usando o Painel Admin

- **Navegação**: o endereço guarda a tela aberta (`/admin#clientes`, `/admin#cliente/<id>`). **Voltar** do navegador e **F5** funcionam.
- **Salvar e enviar**: o botão trava enquanto a requisição roda; um segundo clique é ignorado (sem cadastro ou envio duplicado).
- **Erros**: aparecem no próprio campo (placa antiga ou Mercosul, e-mail, senha com 6+ caracteres). Lista que não carrega mostra **"Não foi possível carregar"** com **"Tentar de novo"**.
- **Relatório semanal**: **"Enviar relatório agora"** envia de verdade para todos os destinatários e pede confirmação.
- **Senha**: o link de recuperação abre, na própria tela de login, um formulário com nova senha e confirmação.
- **Celular**: as janelas de cadastro abrem como painel que sobe de baixo e fecham arrastando pela alça. A confirmação de exclusão só fecha pelos botões ou pelo Esc.
- **Saúde das câmeras** (`/admin/camera-saude.html`): atualiza a cada 30 s, uma requisição por vez; se falhar, mantém os dados e mostra **"Falha ao atualizar · tentar"**.

---

## CHECKLIST: Novo Condomínio do Zero

Use esta lista para não esquecer nada:

- [ ] 1. Criar o cliente no painel admin (PARTE 1)
- [ ] 2. Cadastrar a câmera com o serial correto (PARTE 2)
- [ ] 3. Configurar a câmera física campo por campo (PARTE 3)
- [ ] 4. Reiniciar a câmera
- [ ] 5. Verificar se aparece Online no dashboard (PARTE 4)
- [ ] 6. Criar usuário admin para o condomínio (PARTE 5)
- [ ] 7. Cadastrar emails de alerta (PARTE 6)
- [ ] 8. Cadastrar veículos dos moradores (PARTE 8, opcional)
- [ ] 9. Personalizar o PDF com logo e textos (PARTE 9)
- [ ] 10. Testar: passar um veículo acima do limite e verificar se chega o email

---

## Dados Técnicos (para quem precisa)

### Endereço do servidor
- **URL**: `https://lombada.appps.com.br` (o `protector-lombada.vercel.app` ainda responde, mas não deve ser usado em configuração de câmera)
- **Endpoint de capturas**: `/placa` (roteado para `/api/captura.js`)
- **Endpoint de heartbeat**: `/api/heartbeat`
- **Painel admin**: `/admin`
- **Dashboard do cliente**: `/dashboard`
- **Site e pedido de proposta**: `/` (raiz) — o formulário envia para `POST /api/lead`

### Como a câmera é identificada
1. O sistema tenta identificar pelo **token** na URL (método antigo)
2. Se não tiver token, identifica pelo **serial number** que vem no corpo do JSON (`AlarmInfoPlate.serialno`)
3. Se não encontrar por nenhum dos dois, registra erro no log

### Banco de dados
- **Plataforma**: Supabase (PostgreSQL)
- **Tabelas principais**: `clientes`, `cameras`, `capturas`, `veiculos`, `usuarios`, `email_destinatarios`
- **Armazenamento de fotos**: Supabase Storage (bucket `capturas-fotos`)

### Limites
- Máximo 120 requisições por minuto por câmera
- Capturas são apagadas automaticamente após 15 dias
- Status da câmera pelo último dado recebido: **Online** até 30 min, **Alerta** de 30 min a 6 h, **Offline** acima de 6 h, **Aguardando** se nunca transmitiu (regra única em `site/js/camera-status.js`)
- Pedido de proposta do site: no máximo 5 envios por hora por IP

### Variáveis de ambiente (Vercel)

| Variável | Para que serve |
|----------|---------------|
| `SUPABASE_URL` | Endereço do banco de dados |
| `SUPABASE_SERVICE_KEY` | Chave de acesso admin ao banco |
| `SUPABASE_ANON_KEY` | Chave pública (usada no frontend) |
| `CRON_SECRET` | Senha para o job de limpeza automática |
| `SMTP_HOST` | Servidor de email |
| `SMTP_PORT` | Porta do email (465) |
| `SMTP_SECURE` | Usar SSL (true) |
| `SMTP_USER` | Email que envia os alertas, o relatório semanal, o formulário LGPD e os pedidos de proposta do site |
| `SMTP_PASS` | Senha do email |

---

**Protector Traffic Control** — Lombada Educativa Inteligente — v2.0 | Março 2026
