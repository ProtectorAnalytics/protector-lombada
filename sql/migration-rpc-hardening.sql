-- =============================================================================
-- Hardening de funções SECURITY DEFINER expostas via PostgREST RPC
-- =============================================================================
--
-- Contexto (advisors do Supabase):
--
--   1. anon_security_definer_function_executable / authenticated_...
--      As funções cleanup_* fazem DELETE e, sendo SECURITY DEFINER, rodam com
--      privilégios do owner. Estavam executáveis por `anon`/`authenticated` via
--      /rest/v1/rpc/<funcao> — ou seja, um visitante ANÔNIMO da internet podia
--      disparar exclusão em massa de capturas/fotos. Elas são chamadas APENAS
--      pelo pg_cron (roda como owner, mantém EXECUTE); o app nunca as invoca via
--      supabase.rpc() (cron-limpeza.js usa storage.remove direto). Logo é seguro
--      revogar de anon/authenticated/public.
--      → REVOKE EXECUTE.
--
--      ⚠️ is_super_admin() e my_cliente_id() TAMBÉM aparecem no advisor, mas NÃO
--      são revogadas aqui: elas são usadas dentro das policies de RLS de quase
--      todas as tabelas (cameras, capturas, clientes, veiculos, usuarios,
--      email_destinatarios, ...). O Postgres exige EXECUTE do usuário que dispara
--      a query ao avaliar a policy — mesmo em SECURITY DEFINER. Revogar quebraria
--      o dashboard (authenticated) com "permission denied for function". Como só
--      revelam o status do próprio chamador, o warning é aceitável por design.
--
--   2. function_search_path_mutable
--      Fixa search_path em `pg_catalog, public` (não-mutável) nas 5 funções:
--      protege os builtins contra hijack e preserva referências a tabelas de
--      `public` sem qualificação.
--
-- Referências:
--   https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
--   https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
--   https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
-- =============================================================================

-- 1) Revogar EXECUTE das funções de limpeza do acesso público -------------------
--    (owner/pg_cron mantêm EXECUTE; o app não chama via RPC)
REVOKE EXECUTE ON FUNCTION public.cleanup_old_capturas()            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_capturas_historico()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_debug_log()               FROM PUBLIC, anon, authenticated;

-- 2) Fixar search_path (todas as 5 funções SECURITY DEFINER) -------------------
ALTER FUNCTION public.cleanup_old_capturas()           SET search_path = pg_catalog, public;
ALTER FUNCTION public.cleanup_old_capturas_historico() SET search_path = pg_catalog, public;
ALTER FUNCTION public.cleanup_debug_log()              SET search_path = pg_catalog, public;
ALTER FUNCTION public.is_super_admin()                 SET search_path = pg_catalog, public;
ALTER FUNCTION public.my_cliente_id()                  SET search_path = pg_catalog, public;

-- Verificação pós-aplicação (opcional):
--   SELECT proname, proacl, proconfig
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND proname IN ('cleanup_old_capturas','cleanup_old_capturas_historico',
--                     'cleanup_debug_log','is_super_admin','my_cliente_id');
