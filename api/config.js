// Serve as credenciais públicas do Supabase para o dashboard
// Apenas a ANON KEY (pública por design) e a URL são expostas
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  });
};
