# Documentação do fabricante — ALPHADIGI

Referência técnica para integração e diagnóstico das câmeras **Traffic Cam ALPHADIGI** usadas no sistema Protector Lombada Educativa.

Os PDFs originais ficam em `admin/manuais/` para serem servidos pelo Vercel e acessíveis pelo painel administrativo em **Documentação → Suporte / Câmeras**.

## Manuais

| # | Arquivo | Aplicação |
|---|---|---|
| 01 | [Parametrização IN IOT — TCAM3130N (Rev01)](../../admin/manuais/01-Parametrizacao-IN-IOT-TCAM3130N-Rev01.pdf) | Protocolo de comunicação, endpoints, DNS, retransmissão autônoma |
| 02 | [Boas práticas de instalação (Rev04)](../../admin/manuais/02-Boas-Praticas-Instalacao-Rev04.pdf) | Posicionamento físico, altura, distância, pixel da placa |
| 03 | [Orientações Lombada LITE — TCAM3130SN (Rev01)](../../admin/manuais/03-Orientacoes-Lombada-LITE-TCAM3130SN-Rev01.pdf) | Modelo LITE, esquema elétrico, fiação sensor↔câmera |

## Modelos suportados

| Modelo | Câmera | Senha padrão | Observação |
|---|---|---|---|
| PRO | TCAM3130N | `admin` / `admin` | Painel LED + sensor doppler |
| LITE | TCAM3130SN | `admin` / `admin123` | Mesma família, kit reduzido |

IP padrão de fábrica: `192.168.0.10`. Reset físico via botão por 30s.

## Os dois canais de envio da câmera

A câmera ALPHADIGI tem **dois canais de comunicação independentes**, configurados em telas diferentes do QLPR Config. É importante não confundir:

| Canal | Tela QLPR Config | Destino | Finalidade |
|---|---|---|---|
| **Comunicação** | `Conf. Comm → Comunicação` | **Protector** (`191.252.201.142:3000`) | Envia capturas (`/placa`) e heartbeats (`/heartbeat`) para o nosso sistema |
| **Geren. remota** | `Conf. Comm → Geren. remota` | **IN IOT da ALPHADIGI** (`portal.alphadigi.com.br:5080`) | Plataforma proprietária do fabricante (assinatura paga opcional) — não conversa com servidor próprio |

**Implicação para diagnóstico:** o indicador "Online/Offline" no rodapé do QLPR Config reflete o canal **Geren. remota**, não o canal **Comunicação**. Uma câmera pode aparecer "Online" no painel ALPHADIGI mas estar **offline para o Protector** (ou vice-versa). Sempre confirmar a chegada de heartbeat/capturas no painel do Protector como fonte da verdade.

Os dois canais podem ficar ativos simultaneamente sem conflito. Se o cliente não assina a IN IOT, desabilite "Geren. remota" para evitar tráfego desnecessário.

## Configuração de comunicação (referência)

Estes valores precisam estar na câmera (interface QLPR Config → `Configuração → Conf. Comm → Comunicação`) para que ela envie capturas e heartbeats ao Protector:

| Campo | Valor |
|---|---|
| Habilitar | ✓ |
| Servidor principal | `191.252.201.142` |
| Porta | `3000` |
| Porta SSL | `443` |
| Nr da Placa (endpoint) | `/placa` |
| Heartbeat (endpoint) | `/heartbeat` |
| Img.Veículo | ✓ |
| Img.Placa | ✓ |
| Autenticação | Anônimo |
| QoS | 1 |
| Resultados e fotos | Carregar junto |

**Retransmissão (modo autônomo):**

| Campo | Valor |
|---|---|
| Habilitar | ✓ |
| Foto | ✓ |
| Imag. Placa | ✓ |
| Modo autônomo | ✓ |
| Intervalo (s) | `2` |
| Tempo total (s) | `100` |

Em caso de queda da rede, a câmera tenta reenviar a cada 2s por até 100s (~50 tentativas) — durante esse período capturas com timestamp antigo podem chegar em rajada.

## Rede local

| Campo | Valor recomendado |
|---|---|
| DNS primário | `8.8.8.8` |
| IP/Máscara/Gateway | Definido pelo integrador |
| Liberações de firewall | Saída TCP `191.252.201.142:3000` e `:443` |

> Causa mais comum de "câmera offline": **DNS errado** ou **firewall do cliente bloqueando saída**. Validar com `ping` e `telnet` a partir da mesma sub-rede da câmera.

## Identificação da câmera

- **Número de série** é o identificador universal usado como token quando o cadastro manual de token não está configurado. Visível em `Configuração → Manutenção do equipamento → Informação do Dispositivo`, campo "Nr série".
- **Nome do dispositivo**: até 10 caracteres, em `Configuração → Conf. Avançada → Identidade dispositivo`.
- Resolução de envio recomendada: **1080P** (`Configuração → Conf. Comm → Geren. remota`).

## Posicionamento físico (resumo)

- Captura exclusivamente **frontal**, 1 faixa de rolagem
- Distância: **15 a 20 metros**
- Altura: **1,8 a 3 metros** do solo
- Pixel da placa: **130 a 200 px**
- Faixa de velocidade: **10 a 120 km/h** (sensor doppler ±1 km/h)
- Boa iluminação noturna ajuda na leitura de placas não-refletivas
- Lente varifocal 5–50mm, zoom/foco via QLPR Config

## Suporte do fabricante

- WhatsApp / Tel: **(11) 3805-3213**
- E-mail: `suporte@alphadigi.com.br` · `engenharia@alphadigi.com.br`
- Site: https://www.alphadigi.com.br

## Ferramentas internas que consomem esta documentação

A partir da revisão atual, três peças do Protector usam estes manuais como referência operacional:

| Ferramenta | Onde | Função |
|---|---|---|
| **Painel de diagnóstico** | `/admin/diagnostico.html?camera_id=<uuid>` (botão "Diagnóstico" na lista de câmeras) | Mostra status, últimos 50 eventos do `conexao_log`, IPs origem, timeline 24h e veredicto automático com ações sugeridas baseadas neste manual |
| **Tabela `conexao_log`** | Banco Supabase, retenção 7 dias | Registra TODA requisição em `/placa` e `/heartbeat` com motivo de erro estruturado (`token_invalido`, `serial_nao_cadastrado`, `placa_vazia`, `rate_limit`, etc.), IP origem (conexão TCP) vs IP payload (declarado pela câmera), latência |
| **Cron `cron-monitor-cameras`** | A cada 15 min, alerta WaSender | Detecta offline + "online sem capturas" e classifica causa provável (`rede_caiu`, `sensor_ou_posicionamento`, `ocr_falhando`, etc.) com ações tiradas deste manual |

## Como atualizar esta documentação

Quando o fabricante publicar uma nova revisão:

1. Substitua o PDF em `admin/manuais/` mantendo o padrão de nomenclatura `NN-titulo-RevXX.pdf`
2. Atualize a tabela de manuais acima com a nova revisão
3. Atualize `admin/suporte-cameras.html` se a revisão alterar parâmetros de configuração
4. Faça commit em uma branch dedicada (`docs/fabricante-revXX`)
