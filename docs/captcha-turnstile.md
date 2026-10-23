# Verificação anti-robô no login (Cloudflare Turnstile)

O Supabase Auth, com **Enable CAPTCHA protection** ligado, recusa login e
"Esqueci minha senha" que chegam sem token de captcha. O código (v1.10.1)
manda esse token nas três telas de login: `/admin`, `/dashboard` e
`/portaria`.

O código fica **inerte** até existir a env `TURNSTILE_SITE_KEY`: sem ela o
`/api/config` devolve `turnstileSiteKey: null`, nenhum script da Cloudflare é
carregado e o login segue como antes.

## Como funciona

- `api/config.js` expõe `turnstileSiteKey` (site key **pública**). A secret
  key **não** passa pelo Vercel: fica só no Supabase.
- `site/js/captcha.js` (`window.captchaLib`) carrega
  `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`
  apenas quando há site key, desenha o widget em `#captcha-login` (aparência
  `interaction-only`, idioma `pt-br`, inline, sem pop-up) e entrega um token
  por tentativa. O token é de uso único: o widget é resetado depois de cada
  uso e renovado sozinho quando vence.
- Chamadas que levam o token (opção `captchaToken` do supabase-js):
  - `signInWithPassword({ email, password, options: { captchaToken } })`:
    admin, painel e portaria;
  - `resetPasswordForEmail(email, { redirectTo, captchaToken })`: admin e
    painel.
- Não são afetados: `updateUser` (troca de senha com sessão), renovação de
  token, e as rotas do servidor que usam `service_role` (`api/admin/*`).
- Falha do captcha mostra "Não foi possível confirmar que você não é um
  robô. Tente de novo."
- Não há Content-Security-Policy no `vercel.json` nem nas páginas, então nada
  precisa ser liberado. Se um CSP for criado no futuro, ele precisa permitir
  `https://challenges.cloudflare.com` em `script-src` e `frame-src`.

## Ativar (dono da conta)

Siga a ordem. Ligar o Supabase antes de o site ter a site key quebra todos os
logins.

1. **Criar o widget na Cloudflare.** Cloudflare Dashboard → **Turnstile** →
   **Add widget**. Nome: `Lombada login`. Hostname: `lombada.appps.com.br`
   (e, se quiser testar em preview, o domínio `*.vercel.app` do projeto).
   Widget mode: **Managed**. Salve.
2. **Site key no Vercel.** Copie a **Site Key** → Vercel → projeto
   `protector-lombada` → Settings → Environment Variables → nova variável
   `TURNSTILE_SITE_KEY` (ambiente **Production**; Preview também, se o
   hostname de preview foi incluído) → faça **Redeploy** da produção.
   O `/api/config` tem cache de 1 hora no navegador: espere **1 hora** depois
   do redeploy antes do passo 3, para todo aparelho já ter a site key
   (tablets da portaria com a tela aberta: recarregue a página).
   Confira: `https://lombada.appps.com.br/api/config` deve trazer
   `turnstileSiteKey` preenchido.
3. **Secret key no Supabase.** Copie a **Secret Key** → Supabase Dashboard →
   projeto da Lombada → **Authentication** → **Bot and Abuse Protection**
   (no menu de configurações do Auth; o caminho da documentação é
   Settings > Authentication > Bot and Abuse Protection) → ligue
   **Enable CAPTCHA protection** → provedor **Turnstile** (Cloudflare) →
   cole a secret → **Save**.
4. **Testar** numa janela anônima: entrar em `/admin`, `/dashboard` e
   `/portaria`, e pedir "Esqueci minha senha" no painel. Todos devem
   funcionar; se o login mostrar a mensagem anti-robô em todas as tentativas,
   desfaça (abaixo).

A secret key nunca vai para o repositório (público) nem para o Vercel.

## Desligar (rollback)

1. Primeiro o Supabase: Authentication → Bot and Abuse Protection →
   desligue **Enable CAPTCHA protection** → Save. A partir daí o login aceita
   com ou sem token (o token enviado é ignorado).
2. Depois, se quiser tirar o widget do site: remova `TURNSTILE_SITE_KEY` do
   Vercel e faça redeploy.

Nunca na ordem inversa: tirar a env com o Supabase ligado quebra os logins.

## Referências

- Supabase: [Enable CAPTCHA Protection](https://supabase.com/docs/guides/auth/auth-captcha)
- supabase-js: [`resetPasswordForEmail`](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail),
  [`signInWithPassword`](https://supabase.com/docs/reference/javascript/auth-signinwithpassword)
  (opção `captchaToken`)
- Cloudflare: [Widget configurations](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/)
