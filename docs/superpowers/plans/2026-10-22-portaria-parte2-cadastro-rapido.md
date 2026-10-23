# Módulo Portaria · Parte 2 (Cadastro rápido no tablet/celular) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma página `/portaria`, instalável no celular/tablet, onde o porteiro escolhe o próprio nome, lê a placa pela câmera (moldura + leitor no aparelho), vê se já tem cadastro, cadastra unidade/nome/tipo em poucos toques, confirma visitante/prestador e resolve a lista "Passaram sem cadastro".

**Architecture:** Página estática nova (`portaria/index.html`) no mesmo padrão do painel (supabase-js no navegador para leitura com RLS, escrita só via `/api/admin/veiculos`). Regras puras em libs UMD testáveis em Node (`site/js/leitor-placa.js`, `site/js/sugestao-nomes.js`, `site/js/sem-cadastro.js`); câmera e modelo ONNX numa camada fina de navegador (`portaria/camera-placa.js`). Modelo `cct-s-v2-global` servido como arquivo estático.

**Tech Stack:** HTML/JS vanilla, `onnxruntime-web@1.30.0` (jsDelivr, WASM, 1 thread), Supabase (RLS da Parte 1), Vercel. Testes `node test/*.test.js`.

**Spec:** `docs/superpowers/specs/2026-10-22-modulo-portaria-design.md` (§5 é esta parte; §4 já entregue na v1.8.0).

## Global Constraints

- Só tablet e celular; o PC não ganha cadastro (spec §5).
- Leitura **no aparelho**: a imagem nunca é enviada a servidor algum (LGPD, spec §5.3). Nada de foto da câmera é gravado.
- Modelo: `fast-plate-ocr` `cct-s-v2-global` (MIT), entrada `uint8 [1,64,128,3]` RGB, saída `plate` `[1,10,37]` (probabilidades), alfabeto `0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_` (`_` = vazio). Fonte: `https://github.com/ankandrew/fast-plate-ocr/releases/download/arg-plates/cct_s_v2_global.onnx` (5 262 230 bytes). Licença MIT registrada em `site/modelos/NOTICE.txt`.
- Moldura no formato da placa, proporção **3,1 : 1**, área fora escurecida; lê só a moldura; **3 leituras iguais seguidas** capturam, vibra e mostra para conferir/corrigir. Botões **Digitar** e **Lanterna** (quando o aparelho tiver). Confiança mínima por caractere **0,55**. Intervalo entre leituras **180 ms**.
- Correção por posição: posições 1–3 letras (0→O, 1→I, 2→Z, 4→A, 5→S, 6→G, 7→T, 8→B); posições 4, 6, 7 números (O/Q/D→0, I/L→1, Z→2, A→4, S→5, G→6, T→7, B→8); posição 5 livre. Placa válida: `^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$`.
- Nomes sugeridos vêm dos vínculos (vigentes e histórico) **da mesma unidade** na Lombada; Condfy fica para a Parte 4.
- Porteiro escolhe o próprio nome ao começar o turno (lista do admin), lembrado **no aparelho**; todo cadastro sai "por <porteiro>" (`porteiro_id` no POST, já exigido pela API para o role `portaria`).
- Tipos, ícones e cores **iguais** aos do painel/admin (tokens `--tipo-*`, símbolos SVG da v1.8.0); ícone + nome escrito sempre juntos.
- Escrita só pela API existente; leitura pelo cliente supabase com a RLS/grants da v1.8.0 (colunas permitidas de `clientes`/`cameras`).
- Todo texto dinâmico com `esc()`/`textContent`.
- Regra do repo: versão **1.9.0** + novidades + rodapés + manuais; `npm test` verde.
- Nada muda em `/api/placa` e `/api/heartbeat`.

## Review Focus

1. **Leitura errada aceita sem ver** (3 leituras iguais e erradas): o porteiro sempre vê a placa grande e editável antes de salvar; salvar exige um toque. Teste em Task 6 (fluxo não salva sem confirmação).
2. **Placa já cadastrada para outra pessoa** (carro alugado): o cadastro mostra quem está ligado e o porteiro escolhe manter ou trocar; trocar cria o novo vínculo (histórico preservado pela Parte 1). Teste em Task 6.
3. **Sem rede no meio do cadastro**: erro claro "não salvou, tente de novo", nada some do formulário. Teste em Task 6.
4. **Câmera negada ou inexistente** (permissão recusada, desktop): cai direto no "Digitar". Teste em Task 5.
5. **Lista "sem cadastro" com leitura duvidosa da lombada** (placa `suspeita` ou "SEM PLACA"): fica fora da lista. Teste em Task 3.

---

### Task 1: Leitor de placa (regras puras)

**Files:**
- Create: `site/js/leitor-placa.js`, `test/leitor-placa.test.js`
- Modify: `package.json` (script `test`)

**Interfaces — Produces (UMD, `window.leitorPlacaLib`):**
- `ALFABETO` (string acima), `CONF_MIN = 0.55`, `LEITURAS_IGUAIS = 3`.
- `decodificar(probs: Float32Array|number[], slots = 10) -> { texto: string, confianca: number }` — argmax por posição, para no primeiro `_`; `confianca` = menor probabilidade escolhida.
- `corrigirPorPosicao(texto: string) -> string` — tabela dos Global Constraints, só quando `texto.length === 7`.
- `placaValida(texto) -> boolean`.
- `criarEstabilizador(n = LEITURAS_IGUAIS) -> { registrar({texto, confianca}) -> string|null, zerar() }` — devolve a placa quando as últimas `n` leituras válidas (corrigidas, `confianca >= CONF_MIN`) são iguais; leitura inválida zera a sequência.

- [ ] **Step 1: Testes**: `decodificar` de um tensor montado à mão (`JRK0869` + `_`s) → `{texto:'JRK0869'}` e confiança = menor prob; `corrigirPorPosicao('JRK0B69') → 'JRK0869'` e `'0RK0869' → 'ORK0869'`; `placaValida('ABC1D23')`, `('ABC1234')` true, `('AB1234')` false; estabilizador: 2 iguais → null, 3ª igual → placa; inválida no meio zera; confiança 0,5 não conta.
- [ ] **Step 2: Rodar e ver falhar** (`node test/leitor-placa.test.js` → módulo inexistente).
- [ ] **Step 3: Implementar** no formato UMD de `site/js/vinculo-placa.js`.
- [ ] **Step 4: Rodar e ver passar** + `npm test`.
- [ ] **Step 5: Commit** — `feat(portaria): regras do leitor de placa (decodificar, corrigir, estabilizar)`.

---

### Task 2: Sugestão de nomes pela unidade

**Files:** Create `site/js/sugestao-nomes.js`, `test/sugestao-nomes.test.js`; Modify `package.json`.

**Interfaces — Produces (`window.sugestaoNomesLib`):**
- `sugerirNomes(vinculos: Array<{nome_morador, unidade_id, unidade, criado_em, encerrado_em}>, { unidadeId, unidadeNome }, limite = 8) -> string[]` — vínculos da mesma unidade (`unidade_id` igual; sem `unidade_id`, compara `unidade` sem diferenciar maiúsculas/espaços com `unidadeNome`); nomes sem repetir (comparação sem maiúsculas/acentos), mais recentes primeiro (`criado_em` desc), vigentes antes de encerrados no empate; ignora nome vazio.

- [ ] **Step 1: Testes**: unidade A com 3 vínculos (um encerrado, um repetido com caixa diferente) → 2 nomes na ordem certa; vínculo de outra unidade não entra; legado sem `unidade_id` com texto "Bloco 2 · 302 " casa com unidade "bloco 2 · 302"; `limite` respeitado.
- [ ] **Step 2–4:** vermelho, implementar, verde + `npm test`.
- [ ] **Step 5: Commit** — `feat(portaria): sugestão de nomes pela unidade`.

---

### Task 3: Lista "Passaram sem cadastro" (regra pura)

**Files:** Create `site/js/sem-cadastro.js`, `test/sem-cadastro.test.js`; Modify `package.json`.

**Interfaces:**
- Consumes: `indexarVinculos`, `vinculoNaHora` (`site/js/vinculo-placa.js`), `paraMercosul`/`ehPlaca` (`site/js/placa.js`).
- Produces (`window.semCadastroLib`): `listarSemCadastro(capturas: Array<{id, placa, timestamp, camera_id, foto_path}>, indiceVinculos, { suspeitas: Set<mercosul> }, limite = 50) -> Array<{placa, ultima: captura, passagens: number}>` — só placas válidas, sem vínculo **na hora** da passagem mais recente, fora das `suspeitas`; agrupa por placa (chave Mercosul), mais recente primeiro.

- [ ] **Step 1: Testes**: placa com vínculo vigente some; placa sem vínculo aparece com `passagens` contadas nas duas grafias; "SEM PLACA"/inválida some; placa em `suspeitas` some; ordenação por `ultima.timestamp` desc; `limite`.
- [ ] **Step 2–4:** vermelho, implementar, verde + `npm test`.
- [ ] **Step 5: Commit** — `feat(portaria): regra da lista passaram sem cadastro`.

---

### Task 4: API — correção logo após o cadastro e restrição do histórico

**Files:** Modify `api/admin/veiculos.js`; Modify `test/api-admin-veiculos.test.js`.

**Interfaces — Produces (HTTP):**
- `POST /api/admin/veiculos` aceita `substitui_id` opcional (uuid). Para o role `portaria`: só permitido se o vínculo `substitui_id` é do mesmo cliente, vigente, `origem = 'portaria'`, `cadastrado_por_usuario` = usuário atual e `criado_em` há **no máximo 15 minutos**; então o vínculo é encerrado (`encerrado_em = now()`) antes de chamar `vincular_placa` para a placa nova (rede de segurança da spec §5.3: corrigir 1 caractere lido errado). Fora dessas condições → 400. Para os demais roles, `substitui_id` → 400 (eles têm PUT/DELETE).
- `GET` com `historico=1` para `portaria`: devolve vigentes e encerrados **só** com as colunas `id, placa, nome_morador, unidade, unidade_id, tipo_pessoa, vigente_desde, encerrado_em, criado_em, cadastrado_por` (sem marca/cor/origem) — usado para sugerir nomes; demais roles sem mudança.

- [ ] **Step 1: Testes**: portaria com `substitui_id` próprio de 5 min → encerra e cria; de 20 min → 400; de outro usuário → 400; de outro cliente → 400 (sem escrita); admin_cliente com `substitui_id` → 400; GET portaria `historico=1` sem `marca`.
- [ ] **Step 2–4:** vermelho, implementar, verde + `npm test`.
- [ ] **Step 5: Commit** — `feat(portaria): correção do cadastro recém-feito pela portaria`.

---

### Task 5: Câmera com moldura e modelo no aparelho

**Files:**
- Create: `site/modelos/leitor-placa.onnx` (baixar da URL dos Global Constraints e conferir 5 262 230 bytes), `site/modelos/NOTICE.txt`
- Create: `portaria/camera-placa.js`
- Create: `test/camera-placa.test.js` (só a geometria pura, ver abaixo)

**Interfaces:**
- Consumes: `leitorPlacaLib` (Task 1).
- Produces (`window.cameraPlaca`): `regiaoMoldura(rectMoldura, videoW, videoH, telaW, telaH) -> {x,y,w,h}` (pura, exportada também para Node; vídeo em `object-fit: cover`); `abrirLeitor({ container, aoLer(placa), aoFalhar(motivo) }) -> { fechar(), lanterna(on) | null }` — `getUserMedia({ video: { facingMode: { ideal: 'environment' } } })`, moldura 3,1:1 com área de fora escurecida por camada com recorte (não por box-shadow), leitura a cada 180 ms com `ort` (`wasmPaths` no jsDelivr 1.30.0, `numThreads = 1`), sessão carregada uma vez e reaproveitada, vibração ao capturar; câmera negada/inexistente → `aoFalhar('sem_camera')`.
- `ort.min.js` de `https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/ort.min.js`.

- [ ] **Step 1: Teste** de `regiaoMoldura` (vídeo 1920×1080 em tela 412×915 com moldura 354×114 centralizada a 42% → região em pixels do vídeo esperada, calculada à mão no teste) e do caminho `aoFalhar('sem_camera')` com `navigator.mediaDevices` ausente (stub).
- [ ] **Step 2–4:** vermelho, implementar, verde + `npm test`.
- [ ] **Step 5: Commit** — `feat(portaria): câmera com moldura e leitor de placa no aparelho`.

---

### Task 6: Página da portaria

**Files:**
- Create: `portaria/index.html`, `portaria/manifest.webmanifest`, `portaria/icone-192.png`, `portaria/icone-512.png` (gerados a partir do logo existente do painel)
- Modify: `vercel.json` (rotas `/portaria` → `/portaria/index.html` e `/portaria/(.*)` → `/portaria/$1`, no padrão de `/dashboard`)
- Create: `test/portaria-pagina.test.js`

**Interfaces:**
- Consumes: Tasks 1–5; `GET /api/config`; supabase auth (mesmo login do painel); `GET /api/admin/porteiros`, `GET /api/admin/unidades`, `GET /api/admin/veiculos?historico=1`, `POST /api/admin/veiculos` (com `porteiro_id`, `substitui_id`); leitura direta `capturas` (últimas 24 h, `id, placa, timestamp, camera_id, foto_path`), `veiculos_base` (status `suspeita`) com RLS; miniaturas como no painel.
- Perfis: `portaria` e `admin_cliente` (admin_cliente não precisa escolher porteiro e grava com `profile.nome`); outros perfis veem "Este acesso não é da portaria" com link para o painel.

Telas (uma página, navegação por abas no rodapé):
1. **Quem está no turno** (primeiro acesso no aparelho e botão "Trocar porteiro"): lista dos porteiros ativos; escolha guardada em `localStorage` (`lombada-portaria-porteiro`, com try/catch).
2. **Cadastrar**: botão grande "Ler placa" (abre Task 5) + "Digitar"; placa grande editável (só A–Z/0–9, 7 caracteres, maiúsculas); ao confirmar a placa, mostra o vínculo vigente (ícone, tipo, nome, unidade, `rotuloCadastro`) e, se Visitante/Prestador, a pergunta "Continua com <unidade>?" (Sim = nada a fazer; Não = segue para trocar); unidade (lista; busca por texto quando > 20); nomes sugeridos (Task 2) em botões + campo livre; 4 tipos em botões com ícone; marca/modelo/cor da base de veículos, quando houver, só para conferir; **Salvar** (um toque, com estado "Salvando…"). Sucesso: "Cadastrado: <placa> · <nome> · <unidade>" e volta ao início.
3. **Rede de segurança**: por 3 minutos após salvar, a página consulta as passagens novas; se a lombada ler uma placa que `difereEmUm` da cadastrada e a cadastrada não passou, mostra "A lombada leu <X>. Corrigir o cadastro para <X>?" → POST com `substitui_id`.
4. **Sem cadastro**: lista da Task 3 (foto, placa, horário, câmera, nº de passagens); tocar abre o Cadastrar com a placa preenchida. Atualiza a cada 60 s com a aba visível.

- [ ] **Step 1: Teste** `test/portaria-pagina.test.js` (padrão `test/portaria-telas.test.js` da v1.8.0, rodando funções da página num VM do Node com stubs): Salvar só envia após o toque e com tipo escolhido; envia `porteiro_id` do aparelho; erro de rede mantém o formulário e mostra mensagem; vínculo vigente de visitante mostra a pergunta; nome com `D'Ávila & <b>` aparece escapado; perfil `operador` vê o aviso.
- [ ] **Step 2–4:** vermelho, implementar, verde + `npm test`; conferir `node --check` dos scripts embutidos.
- [ ] **Step 5: Commit** — `feat(portaria): página da portaria com cadastro rápido e lista sem cadastro`.

---

### Task 7: Pendências da Parte 1, versão 1.9.0 e manual

**Files:** Modify `dashboard/index.html` (botões "É a mesma placa"/"É outro carro" escondidos para `portaria`; link "Abrir a portaria" para o perfil portaria), `site/js/novidades-atual.js`, `package.json`, rodapés, `dashboard/manual.html`, `admin/manual-usuario.html`, `dashboard/novidades.html`; Create `portaria/manual.html` (como usar no turno: escolher o nome, ler a placa, conferir, tipo, visitante, sem cadastro, instalar na tela inicial); `test/portaria-telas.test.js` (caso dos botões escondidos).

- [ ] **Step 1: Teste** do caso dos botões escondidos para `portaria`.
- [ ] **Step 2–4:** vermelho, implementar, verde; `npm test` (inclui `test/versao-novidades.test.js`) → 0.
- [ ] **Step 5: Commit** — `feat(portaria): versão 1.9.0, manual da portaria e ajustes do painel`.

---

### Task 8: Revisão de segurança, publicação e piloto

- [ ] **Step 1:** agente `security-reviewer` sobre o diff da branch (8 brechas do baseline), com foco em: `substitui_id` (IDOR/tempo), página `/portaria` (XSS, perfis), nenhuma imagem saindo do aparelho, modelo servido sem dado sensível.
- [ ] **Step 2:** PR; merge com "pode publicar" (sem migration nesta parte).
- [ ] **Step 3 (operacional, com o Glauber):** no admin do Praia Bella, colar as unidades, cadastrar os porteiros e criar o acesso da portaria; abrir `/portaria` num celular real e cadastrar 1 carro; conferir no painel a passagem seguinte identificada.
