# Módulo Portaria — desenho

Data: 22/10/2026 · Autor: conversa com o CEO (Glauber) · Piloto: Condomínio Praia Bella

## 1. Por que existe

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

Cada parte é entregue e usada antes da seguinte. Cada uma sobe versão e
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

**Decisão minha:** no primeiro dia a Protector preenche a lista do Praia Bella
pelo admin, colando a lista de unidades (uma por linha, com bloco). Puxar do
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

### 5.3 Ao builder

OCR (no aparelho ou no servidor), formato (página instalável no celular é o
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
- **Câmeras (decisão minha):** o Praia Bella tem 2 câmeras. O quadro mostra
  todas, com o nome da câmera em cada passagem; cada PC pode escolher mostrar
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

- Na entrada do Praia Bella, todo visitante/prestador para e fala com o
  porteiro, ou parte entra direto (TAG, controle, placa)? Se parte entra
  direto, a lista "Passaram sem cadastro" pesa mais.
- Conta e caminho de rede do Condfy para a Parte 4.
