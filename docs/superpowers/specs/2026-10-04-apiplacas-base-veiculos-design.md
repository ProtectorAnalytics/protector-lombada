# Base única de veículos com APIPLACAS — design

- **Data:** 04/10/2026
- **Status:** aprovado em conversa (partes 1 a 5); aguardando revisão desta especificação
- **Escopo:** Protector Lombada (`api/`, `lib/`, `dashboard/`, `admin/`, `sql/`, `docs/`)

## 1. Objetivo

Enriquecer cada passagem com os dados do veículo (marca, modelo, cor, ano, cidade/UF,
tipo, situação) consultados na APIPLACAS, pagando **no máximo uma consulta por veículo
na vida do sistema**, com uma base única compartilhada por todos os condomínios.

Os dados servem para:

1. mostrar modelo, cor e ano no painel do síndico;
2. incluir modelo e cor na notificação orientativa em PDF;
3. conferir a leitura da câmera (aviso "cor não confere" — em duas etapas, ver §6.4);
4. preencher marca e cor no cadastro de moradores.

### Critérios de sucesso

- Nenhuma placa é consultada duas vezes, nem em rajada simultânea, nem nas duas
  grafias (antiga e Mercosul).
- A câmera nunca espera pela APIPLACAS (resposta à câmera inalterada).
- O gasto mensal nunca passa do teto configurado.
- Um condomínio não consegue descobrir quais veículos circulam em outro.
- Contratos de `/api/placa` e `/api/heartbeat` inalterados.

## 2. Decisões tomadas

| Tema | Decisão |
|---|---|
| Quais placas consultar | Toda placa nova, já na **1ª passagem**, a partir da data de ativação |
| Histórico | **Não** consultar placas lidas antes da ativação |
| Validação inicial | Consultar as placas do dia da ativação, de todos os clientes |
| Validador gratuito | Formato + "quase gêmea" de placa frequente do mesmo condomínio |
| Onde consultar | Em segundo plano na captura (`waitUntil`), antes da notificação, com repescagem periódica |
| Cadastro pelo painel | Dentro do detalhe da passagem (opção A da maquete) |
| Teto | R$ 150/mês, aviso em 80%, editável no admin |
| Avisos | E-mail para lista editável no admin; inicial: glauber@appps.com.br, suporte@appps.com.br |
| Pacote | 1.000 consultas pré-pagas; aviso de saldo baixo (< 200) e zerado |
| Dados guardados | Sem chassi, sem tipo de proprietário, sem FIPE, sem resposta bruta |

## 3. A APIPLACAS (medido em 04/10/2026)

- `GET https://wdapi2.com.br/consulta/{placa}/{token}` — o **token vai no caminho da URL**.
- `GET https://wdapi2.com.br/saldo/{token}` → `{ "qtdConsultas": N }` — não consome saldo.
- Tempo por consulta: média 0,5 s, máx. 0,74 s (5 amostras); `/saldo` 0,2–0,9 s.
- Resposta 200 traz `MARCA`, `MODELO`, `VERSAO`, `cor`, `ano`, `anoModelo`, `municipio`,
  `uf`, `situacao`, `placa`, `placa_alternativa` e `extra.tipo_veiculo` (quando houver).
- Cor vem sem padrão de caixa ("Dourada", "PRATA", "Branca").
- Erros documentados: 400 URL, 401 placa inválida, 402 token inválido, 406 sem
  resultados, 429 limite. **Medido:** placa de formato inválido voltou **406** com a
  mensagem "Placa Invalida…", não 401 — o tratamento usa código **e** mensagem.
- Placa de formato inválido não consumiu saldo.

## 4. Banco de dados

Migration nova `sql/migration-apiplacas-base-veiculos.sql` (só cria; nada destrutivo).

### 4.1 `veiculos_base` — base única

| Coluna | Tipo | Observação |
|---|---|---|
| `placa` | text PK | sempre no formato **Mercosul** (`AAA9A99`) |
| `placa_antiga` | text unique null | formato antigo (`AAA9999`) quando existir |
| `status` | text | `pendente`, `consultado`, `sem_resultado`, `suspeita`, `erro` |
| `suspeita_de` | text null | placa frequente da qual esta é "quase gêmea" |
| `suspeita_cliente_id` | uuid null | condomínio onde a suspeita foi detectada |
| `marca`, `modelo`, `versao`, `cor` | text null | como vieram da API (aparados) |
| `cor_normalizada` | text null | minúsculas, sem acento, gênero neutro (`prata`, `dourado`, `branco`) |
| `ano_fabricacao`, `ano_modelo` | smallint null | |
| `municipio`, `uf`, `tipo_veiculo`, `situacao` | text null | |
| `consultado_em` | timestamptz null | |
| `tentativas` | smallint default 0 | |
| `proxima_tentativa_em` | timestamptz null | backoff da repescagem |
| `ultimo_erro` | text null | código/mensagem curta; **nunca URL** |
| `visto_por_ultimo_em` | timestamptz | atualizado a cada passagem (base da retenção) |
| `criado_em` | timestamptz default now() | |

Índices: `status, proxima_tentativa_em` (fila); `visto_por_ultimo_em` (retenção).

### 4.2 `apiplacas_config` — linha única

`id` (fixo = 1, check), `ativo` (bool, **default false**), `preco_consulta` (numeric,
0.03), `teto_mensal` (numeric, 150), `aviso_percentual` (smallint, 80),
`saldo_minimo` (int, 200), `saldo_atual` (int null) e `saldo_em` (timestamptz null) —
último valor lido em `/saldo`, `emails_aviso` (text[]), `avisos_enviados` (jsonb — chave
`<tipo>:<AAAA-MM>` para não repetir aviso), `atualizado_em`, `atualizado_por`.

### 4.3 `apiplacas_consultas` — extrato

`id`, `placa`, `resultado` (`ok`, `sem_resultado`, `placa_invalida`, `token_invalido`,
`limite`, `timeout`, `erro`), `http_status`, `duracao_ms`, `custo` (numeric — 0 quando
o resultado não consome saldo), `origem` (`captura`, `repescagem`, `reconsulta`,
`validacao`), `criado_em`.

Gasto do mês = `sum(custo)` do mês corrente (fuso America/Sao_Paulo).

### 4.4 Segurança das tabelas

- RLS ligado nas três; **sem** política de escrita para `anon`/`authenticated` — só o
  servidor (service role, em `api/`) escreve.
- `veiculos_base`: SELECT para `authenticated` **somente** de placas que tenham ao
  menos uma linha em `capturas` (ou `veiculos`) do `cliente_id` do usuário. Super_admin
  lê tudo.
- `apiplacas_config` e `apiplacas_consultas`: SELECT só para super_admin.
- O isolamento também é garantido na aplicação (endpoints filtram por cliente), não só
  na RLS.

## 5. Componentes

| Unidade | Arquivo | Responsabilidade |
|---|---|---|
| Placa | `site/js/placa.js` (UMD) | normalizar, converter antiga↔Mercosul, distância de 1 caractere |
| Cliente da API | `lib/apiplacas.js` | chamar `/consulta` e `/saldo` com timeout; mapear resposta → campos; classificar erro; nunca expor URL/token |
| Validador | `lib/validador-placa.js` | decidir `ok` / `suspeita` (consulta placas frequentes do cliente) |
| Orquestrador | `lib/veiculos-base.js` | reservar, checar travas, consultar, gravar, registrar extrato |
| Avisos | `lib/apiplacas-avisos.js` | calcular e enviar avisos de teto/saldo/token, 1x por período |
| Captura | `api/captura.js` | chamar o orquestrador dentro do `waitUntil`, antes da notificação |
| Repescagem | `api/cron-apiplacas.js` | a cada 5 min: fila + avisos; registrada em `vercel.json` |
| Admin API | `api/admin/apiplacas.js` | config, painel do mês, extrato, reconsulta, validação (super_admin) |
| Painel API | `api/admin/veiculos-base.js` | leitura escopada por cliente; ações da suspeita |
| PDF | `lib/pdf-generator.js` | linha "Veículo: …" quando houver dado |

## 6. Fluxos

### 6.1 Na captura (dentro do `waitUntil`, antes da notificação)

1. Normaliza a placa para Mercosul; se o formato for inválido, encerra (sem custo).
2. Busca em `veiculos_base` por `placa` ou `placa_antiga`. Se existir, em qualquer
   status: atualiza `visto_por_ultimo_em` e encerra (`pendente`/`erro` ficam com a
   repescagem).
3. **Validador:** se a placa difere em exatamente 1 caractere de uma placa com 3+
   passagens no mesmo cliente nos últimos 30 dias, grava `suspeita` (com `suspeita_de`)
   e encerra.
4. **Reserva:** `INSERT … ON CONFLICT DO NOTHING` com `status = 'pendente'`. Se não
   inseriu, outra chegada já reservou — encerra.
5. **Travas:** `ativo`, gasto do mês < teto, `saldo_atual` > 0 (ou ainda não lido). Se alguma
   falhar, deixa `pendente` e encerra.
6. Chama a API com timeout de **3 s**; grava resultado em `veiculos_base` e uma linha
   em `apiplacas_consultas`.
7. A notificação usa o resultado se houver; se não, segue como hoje.

Falha em qualquer passo é registrada em `debug_log` e **nunca** impede a notificação.

### 6.2 Repescagem (`api/cron-apiplacas.js`, a cada 5 min)

- Seleciona até 50 placas `pendente`/`erro` com `proxima_tentativa_em <= now()`.
- Aplica as mesmas travas antes de cada chamada; para ao bater o teto.
- Backoff por `tentativas`: 5 min, 30 min, 2 h, 24 h (teto 24 h).
- 402 (token): pausa (`ativo = false`) e avisa. 429 (saldo/limite): mantém na fila,
  marca saldo zerado e avisa.
- Atualiza o saldo via `/saldo` (sem custo) a cada execução e dispara avisos.
- Retenção: apaga de `veiculos_base` o que tem `visto_por_ultimo_em` > 6 meses.
- Protegido pelo mesmo segredo de cron dos outros `api/cron-*.js`.

### 6.3 Suspeita no painel

- "É a mesma placa" → atualiza a `placa` daquela passagem em `capturas` para
  `suspeita_de` (registro em `audit_log`); a linha `suspeita` permanece para que a
  mesma leitura errada não seja consultada no futuro.
- "É outro carro" → muda para `pendente` e consulta (respeitando travas).
- Disponível para admin do condomínio e operador.

### 6.4 Conferência de cor (item 3) — duas etapas

- **Etapa 1 (este trabalho):** guarda `cor_normalizada` da API; a câmera manda
  `cor_veiculo` como código numérico (52% vazio nos últimos 30 dias). **Aviso desligado.**
- **Etapa 2 (trabalho futuro):** mapear código da câmera → cor, pelo manual da
  ALPHADIGI ou por calibração com os dados, aprovar o mapeamento e só então ligar o
  aviso "Cor não confere".

## 7. Interface

### 7.1 Painel do síndico (`dashboard/index.html`)

- Lista e cards recentes: selo "Marca Modelo · Cor · Ano"; "consultando…" quando
  `pendente`; "verificar leitura" em âmbar quando `suspeita`.
- Detalhe da passagem: quadro "Veículo" com todos os campos + "Fonte: APIPLACAS ·
  consultado em …".
- Veículo não cadastrado no condomínio: formulário inline (morador, unidade, marca e
  cor pré-preenchidas e editáveis) + "Salvar", que usa o `POST /api/admin/veiculos`
  existente.
- Suspeita: botões "É a mesma placa (XXX)" e "É outro carro".
- **Correção de segurança:** escapar `nome_morador`, `unidade`, `marca`, `cor` no
  detalhe (hoje interpolados sem escape — XSS armazenado).

### 7.2 Tela de Veículos

Ao digitar uma placa existente na base, marca e cor se preenchem. Placa ausente **não**
dispara consulta.

### 7.3 Admin — "Consulta de placas" (super_admin)

- Quadro do mês: consultas, gasto × teto (barra), saldo do pacote, fila, suspeitas.
- Configuração: ligar/desligar, preço, teto, % de aviso, saldo mínimo, lista de
  e-mails (adicionar/remover, validados).
- Extrato paginado (50 por página).
- "Consultar de novo" (pago) por placa; "Validar placas de hoje" (consulta as placas
  distintas do dia, todos os clientes, origem `validacao`).
- Toda alteração gravada em `audit_log`.

## 8. PDF e e-mails

- PDF: linha "Veículo: Marca Modelo · Cor · Ano" abaixo da placa, só com dado da API.
- E-mails (SMTP existente), sem placas no corpo:

| Aviso | Gatilho | Frequência |
|---|---|---|
| 80% do teto | gasto ≥ `aviso_percentual` | 1x/mês |
| Teto atingido | gasto ≥ teto | 1x/mês, com tamanho da fila |
| Saldo baixo | saldo < `saldo_minimo` | 1x até o saldo subir |
| Saldo zerado | 429 ou saldo = 0 | 1x até o saldo subir |
| Token inválido | 402 | 1x; consultas pausadas |

## 9. LGPD

- APIPLACAS (AETHERIA, CNPJ 67.877.417/0001-08) passa a ser **suboperadora**:
  atualizar `docs/POLITICA_PRIVACIDADE.md`, `site/privacidade.html`,
  `docs/RIPD_TEMPLATE.md`, `docs/CONTRATO_DPA.md` e `docs/LGPD.md`. Redação final
  revisada pelo controlador/DPO.
- Retenção de `veiculos_base`: 6 meses sem passagem → apagado.
- Eliminação aprovada em "Direitos LGPD" apaga a placa de `veiculos_base`.
- Minimização: só os campos da §4.1.
- Token só em variável de ambiente do servidor (`APIPLACAS_TOKEN`); nunca em log,
  erro, `debug_log` ou resposta HTTP.

## 10. Testes

Unitários (Node, padrão `test/*.test.js`, API simulada — sem custo):

- `placa`: normalização, conversão antiga↔Mercosul, distância.
- `apiplacas`: mapeamento da resposta 200; 406 sem resultado × 406 placa inválida;
  402; 429; timeout de 3 s; nenhuma string de erro contém o token.
- `validador-placa`: quase gêmea de placa frequente → suspeita; placa rara → ok.
- `veiculos-base`: **10 chegadas simultâneas da mesma placa → 1 chamada**; antiga e
  Mercosul → 1 linha; travas (desligado, teto, saldo 0) → 0 chamadas.
- `apiplacas-avisos`: cada aviso 1x por período.
- Detalhe da passagem: `nome_morador` com `<script>` é exibido como texto.

Integração: RLS — usuário do cliente A não lê veículo visto só no cliente B.

`npm test` inclui os novos arquivos; os existentes continuam passando.

## 11. Publicação

1. Migration aplicada (registrada no PR).
2. `APIPLACAS_TOKEN` adicionado nas variáveis de produção do Vercel pelo dono.
3. Deploy com `ativo = false`.
4. Com OK do dono: ligar e rodar "Validar placas de hoje"; conferir painel e extrato.
5. Resumo após 1 semana (consultas, gasto, suspeitas, erros) e decisão do mapeamento
   de cor.

## 12. Fora do escopo

- Consultar o histórico anterior à ativação.
- Aviso "cor não confere" ligado (etapa 2 da §6.4).
- Dados FIPE e de proprietário.
- Reconsulta automática periódica.
