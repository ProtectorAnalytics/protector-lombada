// Serve as credenciais públicas do Supabase para o dashboard
// Apenas a ANON KEY (pública por design) e a URL são expostas.
// turnstileSiteKey: site key PÚBLICA do Cloudflare Turnstile (anti-robô no
// login). Vazia = captcha desligado (site/js/captcha.js não carrega nada).
// A secret key do Turnstile fica só no Supabase Auth, nunca aqui.
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    turnstileSiteKey: (process.env.TURNSTILE_SITE_KEY || '').trim() || null,
  });
};
