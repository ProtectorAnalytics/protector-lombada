# Checklist de campo — Reapontamento das câmeras ALPHADIGI

> **Contexto:** com o cancelamento do contrato com a plataforma IN IOT da ALPHADIGI em **24/05/2026**, as câmeras que apontavam para `191.252.201.142:3000` (servidor da IN IOT, recomendado pelo manual oficial) deixaram de chegar ao Protector. É preciso reconfigurar cada câmera para enviar capturas e heartbeats **direto** para `lombada.appps.com.br:443`.
>
> Esta operação é **presencial ou via VPN** dentro da rede do cliente, pois sem o IN IOT não há mais via remota de configuração das câmeras.
>
> A configuração abaixo foi validada em produção (CEC-LOMB01 / Enseada do Castelo).

---

## Equipamento necessário

- Notebook com QLPR Config instalado (ou navegador para a interface web da câmera)
- Acesso à rede interna do cliente (cabeada ou Wi-Fi)
- Cabo de rede reserva, caso seja necessário conectar direto via switch
- Acesso administrativo ao roteador do cliente, se o firewall bloquear saída HTTPS

---

## Procedimento padrão (vale para todas as câmeras)

Para cada câmera, executar na ordem:

1. **Conectar na mesma sub-rede** da câmera. Confirmar com `ping <IP da câmera>`.
2. **Abrir QLPR Config**, fazer descoberta da câmera ou conectar pelo IP.
   - Senha padrão TCAM3130N: `admin` / `admin`
   - Senha padrão TCAM3130SN (LITE): `admin` / `admin123`
3. **Anotar valores atuais** (para rollback se necessário):
   - Conf. Comm → Comunicação → Servidor Pri., Porta, Link SSL, Pastas
4. **Aplicar nova configuração** (tabelas abaixo).
5. **Salvar e reiniciar** a câmera.
6. **Validar** chegada de heartbeat e captura no Protector (passo final de cada bloco).

### Valores a aplicar — Conf. HTTP Push

| Campo | Valor |
|---|---|
| Habilitar | ✓ marcado |
| Servidor Pri. | `lombada.appps.com.br` |
| Servidor Seg. | (vazio) |
| Porta | `443` |
| Timeout | `10` |
| Nr.da Placa | ✓ marcado — pasta: `/placa` |
| Img.Veículo | ✓ marcado |
| Img.Placa | ✓ marcado |
| GPIO | desmarcado |
| Dados Serial | desmarcado |
| Char Code | `UTF-8` |

### Valores a aplicar — Heartbeat / SSL / Autenticação

| Campo | Valor |
|---|---|
| Heartbeat | ✓ marcado — pasta: `/placa` (mesma do Nr.da Placa) |
| Intervalo | `10` segundos |
| Protocolo | `Desativar` |
| Conexão curta | desmarcado |
| **Link SSL** | ✓ marcado (obrigatório) |
| **Porta SSL** | `443` |
| Autenticação | `Anônimo` |
| QoS (0–5) | `2` |
| Resultados e fotos | `Carregar junto` |
| Empresa / CNPJ | (vazios) |

### Valores a aplicar — Retransmissão (modo autônomo)

| Campo | Valor |
|---|---|
| Habilitar | ✓ marcado |
| Foto | ✓ marcado |
| Imag. Placa | ✓ marcado |
| Modo autônomo | ✓ marcado |
| Intervalo (s) | `2` |
| Tempo total (s) | `100` |

### Valores a aplicar — Rede local

| Campo | Valor |
|---|---|
| DNS primário | `8.8.8.8` |
| DNS secundário | `1.1.1.1` |
| IP / Máscara / Gateway | Manter como já está (não alterar) |

### Conf. Comm → Geren. remota

Recomendação: **desabilitar** (após o cancelamento do IN IOT, esse canal só gera tráfego inútil e LED "Offline" enganoso no rodapé do QLPR).

| Campo | Valor |
|---|---|
| Habilitar | desmarcado |

### Antes de sair

- [ ] Liberação de firewall do cliente: saída TCP `443` para qualquer destino externo (ou pelo menos para `lombada.appps.com.br`)
- [ ] Validar resolução DNS na própria câmera: se houver opção de diagnóstico, testar `nslookup lombada.appps.com.br`
- [ ] Salvar configuração e reiniciar câmera
- [ ] Aguardar 2 minutos e confirmar no Protector (ver bloco específico de cada câmera abaixo)

---

## Câmeras a reapontar

### Cliente 1 — CONDOMÍNIO PRAIA DO CASTELO

- **Localidade:** Mata de São João/BA
- **Endereço/Via:** COND. PRAIA DO CASTELO — R01
- **Contato no condomínio:** (preencher em campo)
- **Sub-rede interna:** `172.20.0.0/24`

#### 1.1 — CPC-LOMB01-CLUBEMATA

| Atributo | Valor |
|---|---|
| Identificação no Protector | `CPC-LOMB01-CLUBEMATA` (exibição: `CLUBE MATA`) |
| Serial físico | `QFHVK21424180082` |
| IP interno cadastrado | `172.20.0.150` |
| Última captura recebida | 06/05/2026 19:50 UTC |
| Status atual | OFFLINE — sem comunicação há ~19 dias |

- [ ] Conectado na câmera
- [ ] Configuração antiga anotada
- [ ] Nova configuração aplicada
- [ ] Câmera reiniciada
- [ ] Confirmar em `https://lombada.appps.com.br/admin/diagnostico.html?camera_id=302af029-5e58-4bcf-8af8-4968642a4d84` que apareceu heartbeat verde

**Validado em:** ____/____/2026 ____:____ por ___________________

---

#### 1.2 — CPC-LOMB02-VILA

| Atributo | Valor |
|---|---|
| Identificação no Protector | `CPC-LOMB02-VILA` (exibição: `VILA -> PORTARIA`) |
| Serial físico | `QFHVK21424180060` |
| IP interno cadastrado | `172.20.0.221` |
| Última captura recebida | 22/05/2026 19:04 UTC |
| Status atual | OFFLINE — sem comunicação há ~3 dias |

- [ ] Conectado na câmera
- [ ] Configuração antiga anotada
- [ ] Nova configuração aplicada
- [ ] Câmera reiniciada
- [ ] Confirmar em `https://lombada.appps.com.br/admin/diagnostico.html?camera_id=8400d5d0-70b3-41ee-bb53-fa6d73b6723a` que apareceu heartbeat verde

**Validado em:** ____/____/2026 ____:____ por ___________________

---

#### 1.3 — CPC-LOMB3-DIR_CLUBE_PRAIA

| Atributo | Valor |
|---|---|
| Identificação no Protector | `CPC-LOMB3-DIR_CLUBE_PRAIA` (exibição: `PORTARIA -> CLUBE PRAIA`) |
| Serial físico | `QFHVK21424420065` |
| IP interno cadastrado | `172.20.0.248` |
| Última captura recebida | 12/05/2026 18:21 UTC |
| Status atual | OFFLINE — sem comunicação há ~13 dias |

- [ ] Conectado na câmera
- [ ] Configuração antiga anotada
- [ ] Nova configuração aplicada
- [ ] Câmera reiniciada
- [ ] Confirmar em `https://lombada.appps.com.br/admin/diagnostico.html?camera_id=56196cdb-e984-49de-9b73-dc5fbe52b7fd` que apareceu heartbeat verde

**Validado em:** ____/____/2026 ____:____ por ___________________

---

#### 1.4 — CPC-LOMB4-DIR_PORTARIA

| Atributo | Valor |
|---|---|
| Identificação no Protector | `CPC-LOMB4-DIR_PORTARIA` (exibição: `CLUBE -> PORTARIA`) |
| Serial físico | `QFHVK21424180205` |
| IP interno cadastrado | (não registrado — descobrir em campo) |
| Última captura recebida | **nunca conectou** (cadastrada em 24/05/2026) |
| Status atual | OFFLINE — nunca enviou nada para o Protector |

> **Observação:** esta câmera nunca chegou a se comunicar com o Protector. Verificar primeiro se está fisicamente ligada, alimentação 110/220V e cabo de rede no switch do condomínio. Depois aplicar a configuração padrão.

- [ ] Câmera localizada fisicamente
- [ ] Alimentação OK (LED da câmera aceso)
- [ ] Cabo de rede conectado e link up no switch
- [ ] IP obtido (anotar): `_______________`
- [ ] Conectado na câmera via QLPR Config
- [ ] Nova configuração aplicada
- [ ] Câmera reiniciada
- [ ] Confirmar em `https://lombada.appps.com.br/admin/diagnostico.html?camera_id=b86585b1-45af-4161-97f9-85046ebbe97a` que apareceu heartbeat verde

**Validado em:** ____/____/2026 ____:____ por ___________________

---

### Cliente 2 — PARAISO DO MAR

- **Localidade:** Camaçari/BA — Guarajuba
- **Endereço/Via:** GUARAJUBA
- **Contato no condomínio:** (preencher em campo)
- **Sub-rede interna:** `192.168.1.0/24`

#### 2.1 — LOMBADA-PM-01 (SAÍDA)

| Atributo | Valor |
|---|---|
| Identificação no Protector | `LOMBADA-PM-01` (exibição: `SAÍDA`) |
| Serial físico | `QFHVK21424420013` |
| IP interno cadastrado | `192.168.1.67` |
| Última captura recebida | 22/05/2026 19:14 UTC |
| Status atual | OFFLINE — sem comunicação há ~3 dias |

- [ ] Conectado na câmera
- [ ] Configuração antiga anotada
- [ ] Nova configuração aplicada
- [ ] Câmera reiniciada
- [ ] Confirmar em `https://lombada.appps.com.br/admin/diagnostico.html?camera_id=6a66c756-f689-42c4-ac92-f86c2e1768d5` que apareceu heartbeat verde

**Validado em:** ____/____/2026 ____:____ por ___________________

---

#### 2.2 — LOMBADA-PM-02 (ENTRADA)

| Atributo | Valor |
|---|---|
| Identificação no Protector | `LOMBADA-PM-02` (exibição: `ENTRADA`) |
| Serial físico | `QFHVK21424420021` |
| IP interno cadastrado | `192.168.1.68` |
| Última captura recebida | 22/05/2026 19:16 UTC |
| Status atual | OFFLINE — sem comunicação há ~3 dias |

- [ ] Conectado na câmera
- [ ] Configuração antiga anotada
- [ ] Nova configuração aplicada
- [ ] Câmera reiniciada
- [ ] Confirmar em `https://lombada.appps.com.br/admin/diagnostico.html?camera_id=fef37df6-5958-499d-83de-1c8c17024878` que apareceu heartbeat verde

**Validado em:** ____/____/2026 ____:____ por ___________________

---

### Referência — Cliente 3 ENSEADA DO CASTELO (não precisa de ação)

A câmera CEC-LOMB01 (`QFX2152506180113`, IP público `170.81.102.102`) já está apontando direto para `lombada.appps.com.br:443` e segue capturando normalmente. Serve de referência da configuração esperada.

---

## Validação cruzada após reapontamento

Após reconfigurar TODAS as 6 câmeras, rodar no SQL Editor do Supabase a consulta abaixo. O retorno esperado é uma linha por câmera com `ultima_conexao` recente (< 5 min):

```sql
SELECT c.nome,
       cli.nome AS cliente,
       MAX(cl.ts) AS ultima_conexao,
       COUNT(*) FILTER (WHERE cl.resultado = 'sucesso') AS sucessos,
       COUNT(*) FILTER (WHERE cl.resultado = 'erro') AS erros
FROM cameras c
LEFT JOIN clientes cli ON cli.id = c.cliente_id
LEFT JOIN conexao_log cl ON cl.camera_id = c.id AND cl.ts > now() - interval '1 hour'
WHERE c.ativa = true
GROUP BY c.nome, cli.nome
ORDER BY ultima_conexao DESC NULLS LAST;
```

Toda câmera reconfigurada e online deve aparecer com `ultima_conexao` na última hora e zero erros (ou apenas erros transitórios `payload_invalido` na primeira conexão).

---

## Rollback

Se uma câmera específica não voltar a se comunicar após a reconfiguração:

1. Restaurar os valores antigos anotados no passo 3 do procedimento padrão.
2. Tirar foto da tela do QLPR Config (configuração atual + tela de status) e enviar para `dpo@appps.com.br` com o assunto `Câmera <nome> não voltou após reapontamento`.
3. Verificar firewall do cliente — testar do próprio notebook na mesma sub-rede: `curl -I https://lombada.appps.com.br/placa`. Se o curl não responder 200/405, o problema é firewall ou DNS local.

---

_Documento gerado em 25/05/2026. Dados das câmeras espelhados do Supabase no momento da geração._
