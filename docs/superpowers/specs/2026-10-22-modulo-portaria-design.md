# Módulo Portaria — desenho

Data: 22/10/2026 · Autor: conversa com o CEO (Glauber) · Para **todos os condomínios** · Piloto: Praia Bella

## 1. Por que existe

**A dor é de todos os clientes** (CEO, 22/10). O Praia Bella foi o caso que
trouxe o assunto e será o piloto. Cadastro × placas distintas em 30 dias
(medido 22/10/2026):

| Condomínio | Veículos cadastrados | Placas distintas (30 d) |
|---|---|---|
| Praia do Castelo | 531 | 2.485 |
| Praia Bella | 0 | 2.321 |
| Paraíso do Mar | 10 | 614 |
| Enseada do Castelo | 0 | 505 |

Tudo no módulo é **por condomínio** (unidades, porteiros, aparelhos, PC,
importação) e liga/desliga por cliente; nada é específico do Praia Bella.

O Praia Bella tem portaria grande, fluxo alto e poucos porteiros. Não tem sala
de monitoramento nem operador para cadastrar placas, e a portaria não acessa o
painel da Lombada. Resultado medido em 22/10/2026: **0 veículos cadastrados**
contra 2.321 placas distintas e 8.004 passagens nos últimos 30 dias. Sem
cadastro, os alertas e o painel não dizem de quem é o carro.

A portaria já trabalha com uma tela única no PC (câmeras + controle de acesso)
e com celular e tablet para se mover. Não cabe "mais uma tela".

**Sucesso:** a portaria cadastra os veículos no dia a dia, sem operador
dedicado, e o número de passagens identificadas (com nome e unidade) sobe.
Cada passagem diz quem é, de que unidade e de que tipo.

**Anti-objetivos (falha mesmo que funcione):**
- Porteiro tendo que perguntar "já cadastrou?" ou confiar na memória do turno
  anterior — quem responde isso é o sistema.
- Importação automática gravando dado errado do Condfy sem ninguém ver.
- Janela do PC atrapalhando a tela de câmeras/controle de acesso.
- Mesma placa ligada a duas pessoas ao mesmo tempo.

## 2. Fatos do lugar que mudam o desenho

- **A lombada fica na via interna, depois da portaria** (em todos os
  condomínios). Quando o carro passa na lombada, o porteiro já não fala com o
  motorista. O momento de cadastrar visitante/prestador é **na entrada**, antes
  da lombada.
- A lista de moradores por unidade está no **Condfy** (API interna conhecida:
  pessoas com tipo, unidades/blocos, credenciais inclusive
  `vehicleRecognition`). Ver memória `reference_condfy_api`.
- Visitantes alugam carro: a mesma placa é de Fulano (A) hoje e de Beltrano (D)
  amanhã.

## 3. As cinco partes, nesta ordem (decidido pelo CEO)

1. Base: tipo de pessoa, histórico de vínculo da placa, acesso da portaria.
2. Cadastro rápido no tablet/celular.
3. Quadro no PC (janela por cima).
4. Importação do Condfy (opcional, com revisão).
5. Manual do módulo.

Cada parte é entregue e usada antes da seguinte, primeiro no Praia Bella e
depois liberada para os demais. Cada uma sobe versão e
novidades conforme a regra do repositório (CLAUDE.md).

## 4. Parte 1 — Base

### 4.1 Tipo de pessoa (decidido)

Quatro tipos: **Morador, Proprietário, Visitante, Prestador**. Vale também para
o cadastro de veículos que já existe hoje (painel e admin), independente do
resto do módulo — o CEO disse que essa classificação é importante hoje.

Cada tipo tem **ícone + cor + nome escrito** (nunca só cor ou só ícone), igual
em todo lugar (quadro do PC, tablet, painel, PDF de alerta se couber):

| Tipo | Ícone | Cor |
|---|---|---|
| Morador | casa | verde |
| Proprietário | chave | azul |
| Visitante | pessoa com crachá | amarelo |
| Prestador | ferramenta | laranja |
| Sem cadastro | interrogação | cinza |

Os tons exatos seguem o contraste do painel (claro e escuro); o laranja do
prestador não pode ser confundido com a escala de velocidade (que hoje é só
verde/vermelho — ver `site/js/severidade-velocidade.js`).

### 4.2 Vínculo da placa com histórico (decidido)

- Uma placa tem **no máximo um vínculo vigente** por condomínio.
- Cadastrar de novo uma placa que já tem vínculo **encerra o anterior** (que
  vai para o histórico, nunca é apagado) e o novo vale **daquele momento em
  diante**.
- Cada passagem mostra **quem estava vinculado na hora da passagem**: a de
  ontem continua "Fulano · A"; a de hoje, "Beltrano · D".
- Vínculo de visitante/prestador **não expira sozinho**: fica até alguém trocar
  ou apagar (decidido).
- Cada vínculo guarda **origem e autor**: "Portaria · João · 20/10 22:15",
  "Painel · síndico", "Condfy · importação de 22/10".
- Apagar um vínculo vigente: a placa volta a "Sem cadastro" dali em diante; as
  passagens antigas mantêm quem estava na época.
- **LGPD (decisão minha, alinhada a `docs/LGPD.md`):** "nunca apagado" quer
  dizer que trocar de vínculo não apaga o anterior. O vínculo encerrado segue a
  retenção das passagens: sai **6 meses depois de encerrado**, no mesmo cron.
  Pedido de eliminação do titular (`api/admin/direitos.js`) apaga os vínculos
  daquela pessoa/placa.

Hoje `veiculos` tem `placa, nome_morador, unidade, marca, cor, ativo` e o
painel liga passagem→morador pela placa atual (`findVeiculo`). O builder decide
o modelo de dados (ex.: tabela de vínculos com início/fim) e a migração dos
cadastros atuais (531 no Praia do Castelo, 10 no Paraíso do Mar; o Praia Bella
tem 0). **Decisão minha:** os atuais viram vínculos vigentes com tipo
**Morador**; o síndico corrige no painel quando for outro tipo. Não há estado
"não classificado".
Comparação de placa segue as duas grafias (antiga e Mercosul), como em
`site/js/placa.js`.

### 4.3 Unidades

Lista de unidades por condomínio, cadastrada previamente. O cadastro rápido só
deixa escolher unidade da lista.

**Decisão minha:** ao ligar o módulo num condomínio, a Protector preenche a
lista de unidades pelo admin, colando a lista de unidades (uma por linha, com bloco). Puxar do
Condfy vem com a Parte 4. Os cadastros atuais com unidade em texto livre migram
como estão e aparecem como "unidade antiga" até alguém escolher a unidade da
lista — não há casamento automático de textos.

### 4.4 Acesso da portaria

- **Decisão minha (o CEO pode mudar):** um acesso por aparelho/portaria; ao
  começar o turno, o porteiro toca no próprio nome numa lista (sem senha). O
  cadastro sai "por João". Login individual pode vir depois sem refazer nada.
- A lista de porteiros é mantida pelo admin do condomínio ou pela Protector.
- O perfil da portaria **vê passagens e cadastra/troca vínculos**. Não mexe em
  configuração, destinatários de e-mail, limites, câmeras ou usuários.
  **Decisão minha:** role novo `portaria`. O role `operador` está em uso hoje
  (Praia do Castelo e Enseada) e entra em várias telas do admin; não mexer nele.
  RLS por `cliente_id`, como o resto.
- LGPD: porteiros passam a ver nome e unidade — escopo estrito ao próprio
  condomínio, ações registradas.

## 5. Parte 2 — Cadastro rápido (tablet e celular)

Só no tablet e no celular (decidido). O PC só olha.

### 5.1 Na entrada (caminho principal)

1. Porteiro fotografa a placa; o sistema lê os caracteres (OCR) e mostra para
   ele corrigir se precisar.
2. Se a placa já tem vínculo, mostra na hora: ícone do tipo, nome, unidade e
   "cadastrado em 20/10 às 22:15 por João". Ele mantém ou troca.
3. Escolhe a unidade (lista pronta).
4. O sistema sugere nomes para aquela unidade; ele toca num ou digita outro.
   **Decisão minha:** na Parte 2 a sugestão vem dos nomes já vinculados àquela
   unidade na própria Lombada (atuais e do histórico). Sugestões do Condfy
   entram junto com a Parte 4, que já precisa da integração (conta, licença do
   Praia Bella e o caminho de rede até o Condfy — o firewall dele barra IPs não
   residenciais; ver memória `reference_condfy_api`). Assim a Parte 2 não
   depende de infraestrutura nova.
5. Marca o tipo (os quatro ícones).
6. Salva. A próxima passagem daquele carro já aparece identificada.

Para Visitante/Prestador já cadastrado, a confirmação "continua com a unidade
A?" acontece **aqui, na entrada**, no tablet.

### 5.2 Depois (o que escapou)

Lista **"Passaram sem cadastro"**: passagens recentes sem vínculo, com foto e
horário, para o porteiro resolver quando der (consultando controle de acesso,
interfone ou Condfy). Tocar numa abre o mesmo cadastro com a placa já
preenchida. Placa marcada como leitura duvidosa (`suspeita`, base de veículos)
não deve poluir a lista — o builder decide como.

### 5.3 Leitura da placa (decidido, testado em 22/10/2026)

- **Gratuita e no próprio celular** (CEO: "quero uma solução free"): leitor
  `fast-plate-ocr`, modelo `cct-s-v2-global` (MIT, ~5 MB, ONNX), rodando no
  navegador com `onnxruntime-web` (WASM). A imagem não sai do aparelho: sem
  custo por leitura e sem novo suboperador na LGPD.
- **Câmera ao vivo com máscara** (pedido do CEO): tudo escurecido menos uma
  moldura no formato da placa; lê só o que está na moldura, várias vezes por
  segundo; captura sozinho com 3 leituras iguais seguidas, vibra e mostra para
  conferir/corrigir. Botões "Digitar" e "Lanterna" (Android).
- **Sem detector de placa**: a moldura faz o enquadramento. Evita a dúvida de
  licença do detector YOLOv9 (GPL no original) e economiza 7 MB.
- Correção por posição (3 letras, número, letra-ou-número, 2 números).
- Rede de segurança: se a lombada ler a mesma placa com 1 caractere diferente
  logo depois do cadastro, o sistema avisa e corrige.
- **Medido** em 160 fotos reais das 4 lombadas (placa recortada como foto de
  perto): 88% de leitura exata, 95% com no máximo 1 caractere; descontando os
  erros da própria câmera da lombada, ~91%. Enquadramento justo é essencial
  (folga grande na moldura: 55%). ~60 ms por leitura em JS no Mac.
- **Protótipo** (`tmp/prototipo-ocr`, https://prototipo-ocr.vercel.app, projeto
  Vercel separado `prototipo-ocr`) aprovado pelo CEO no celular ("deu certo").
  É descartável; o módulo real reaproveita a abordagem, não o código.

### 5.4 Ao builder

Formato (página instalável no celular é o
caminho natural, o painel já é web e responsivo), lista de passagens recentes,
uso de marca/modelo/cor da APIPLACAS para ajudar a conferir.

## 6. Parte 3 — Quadro no PC

Só no PC da portaria (Windows), só para olhar (decidido).

- **Janela pequena, sempre visível, por cima** da tela de câmeras/controle.
- **Pode ser arrastada** e tem botão **Fixar** na posição (decidido).
- **Ao vivo:** a passagem mais recente — foto, placa, câmera, velocidade, e
  ícone do tipo + nome + unidade, ou "Sem cadastro".
- Visitante/Prestador mostram também "cadastrado em DD/MM às HH:MM por Fulano".
- **Setas** para voltar/avançar nas passagens; voltar para a última retoma o
  ao vivo.
- **Clique** abre o painel completo de hoje no navegador.
- **Câmeras (decisão minha):** o quadro mostra todas as câmeras do
  condomínio (o Praia Bella tem 2), com o nome da câmera em cada passagem; cada PC pode escolher mostrar
  só uma câmera.
- Acima do limite: vermelho, como no painel (minha sugestão).

**Ambiente do PC (CEO, 22/10):** a tela única roda **iVMS, Bravas e Condfy**;
eles têm tela cheia, mas nem sempre usam. A Protector tem **acesso de
administrador** nos PCs de todos os clientes. O quadro precisa ficar por cima
dessas três; o builder deve testar com o iVMS em tela cheia — se a tela cheia
esconder o quadro, isso é aceitável (vira aviso no manual), mas sem tela cheia
o quadro tem que aparecer sempre.

**Decisão minha:** um programa leve para Windows, instalado uma vez, que abre
com o computador e fica sempre por cima — página de navegador some atrás das
outras janelas e precisa ser reaberta a cada reinício. O builder escolhe a
tecnologia; deve ser pequeno, atualizar sozinho e não pesar no PC das câmeras.

## 7. Parte 4 — Importação do Condfy

Opcional (o CEO não confia na qualidade do dado): **nunca grava direto**.
Só para os condomínios que usam Condfy; quem não usa fica com o cadastro pela
portaria e pelo painel.

- Escolha do alcance: **uma unidade, várias, ou o condomínio inteiro**.
- **Prévia antes de gravar**, em três grupos: novos, iguais (já existem),
  **conflitos** (placa já vinculada a outro nome/unidade).
- Conflito: decide caso a caso; **padrão é nunca sobrescrever** cadastro feito
  à mão.
- Origem gravada ("Condfy · importação de DD/MM"), permitindo conferir e
  **desfazer uma importação inteira**.
- Quem pode importar: admin (Protector/síndico), não o porteiro — minha
  sugestão.

## 8. Parte 5 — Manual

Manual do módulo da portaria no padrão dos manuais atuais
(`dashboard/manual.html`): para o porteiro (cadastro na entrada, lista "sem
cadastro", leitura do quadro e dos ícones, confirmação de visitante) e para
quem instala o quadro no PC.

## 9. Fora do escopo

- Expiração automática de visitante/prestador.
- Escala de turnos.
- Abrir cancela ou qualquer comando no controle de acesso.
- Leitura de placa na entrada por câmera (LPR da portaria).

## 10. Em aberto

- Na entrada dos condomínios (a começar pelo Praia Bella), todo visitante/prestador para e fala com o
  porteiro, ou parte entra direto (TAG, controle, placa)? Se parte entra
  direto, a lista "Passaram sem cadastro" pesa mais.
- Conta e caminho de rede do Condfy para a Parte 4.

## 11. Projeto 2.1 — porteiro com login e unidades em massa (decidido em 22–23/10/2026)

### 11.1 Porteiro é usuário (CEO)
- Cada porteiro tem **login próprio**, criado na aba Usuários/Portaria do admin com o perfil **Portaria** (role `portaria`, já existente).
- **Usuário simples, sem e-mail** (CEO): ex. `jose.praiadocastelo`. Por baixo, o login usa o e-mail técnico `<usuario>@porteiro.invalid` (domínio reservado que nunca recebe nada). As telas de entrada (painel, portaria) aceitam o usuário sem "@". **Decisão minha:** usuário em minúsculas, `a–z 0–9 .`, 3 a 40 caracteres, único no sistema; sugestão automática `primeironome.condominio`.
- Sem e-mail não há "esqueci minha senha": a senha é definida e trocada no admin.
- O cadastro na portaria sai **no nome do login**; a escolha de nome no turno e a lista de porteiros deixam de existir. A correção dos 15 minutos já é por login.
- **Quem cria (CEO, 23/10):** a Protector, no admin, **e o síndico, no painel do condomínio**. Regra de segurança (decisão minha): o síndico (`admin_cliente`) só cria, edita, troca a senha e desativa usuários com perfil **Portaria** do **próprio condomínio**; nunca outros perfis nem outros condomínios. O acesso único "da portaria" criado na Parte 1 continua funcionando (cadastros saem no nome dele).
- A tabela `porteiros` fica sem uso (não é apagada nesta etapa).

### 11.2 Unidades em massa (CEO, referência: tela "Blocos e unidades" do EasyAlert)
- **Agrupador opcional** com nome livre: Bloco, Torre ou **Quadra**. Unidades podem ficar sem agrupador.
- Em cada agrupador, as unidades entram **em lote** (ex.: `101 102 103` ou `101-104`) e aparecem como etiquetas removíveis; **andar** opcional.
- **Tipo da unidade** (CEO): Apartamento, Casa, Sala, Loja, Lote e **"FIP (Fração Ideal)"** (rótulo exato, sem abreviar). **Decisão minha:** o tipo é escolhido para o lote que está sendo adicionado (padrão Apartamento) e pode ser trocado por unidade.
- **Planilha** (.xlsx): baixar modelo, importar e exportar, colunas Bloco/Torre/Quadra (opcional), Unidade, Andar (opcional), Tipo. A importação carrega o editor para **conferir antes de salvar**.
- Rótulo exibido: `Torre 1 · 101` (sem agrupador: só `101`).
- **Decisão minha:** a Protector (admin) e o síndico (painel do condomínio) podem editar as unidades.
