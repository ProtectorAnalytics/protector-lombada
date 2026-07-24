-- =============================================================================
-- Hardening de funções SECURITY DEFINER expostas via PostgREST RPC
-- =============================================================================
--
-- Contexto (advisors do Supabase):
--
--   1. anon_security_definer_function_executable / authenticated_...
--      As funções abaixo eram executáveis por `anon` e `authenticated` via
--      /rest/v1/rpc/<funcao>. As três de limpeza (cleanup_*) fazem DELETE e,
--      sendo SECURITY DEFINER, rodam com privilégios do owner — ou seja, um
--      visitante ANÔNIMO da internet podia disparar exclusão em massa de
--      capturas/fotos chamando o endpoint RPC. is_super_admin/my_cliente_id
--      são helpers internos de RLS e também não devem ser chamados via API.
--      → REVOKE EXECUTE de anon e authenticated.
--        As funções continuam funcionando: cleanup_* são chamadas pelo
--        pg_cron (roda como superuser/owner) e pelos endpoints Vercel que
--        usam a service_role; is_super_admin/my_cliente_id são invocadas de
--        dentro das próprias policies de RLS, não pela role do cliente.
--
--   2. function_search_path_mutable
--      Funções sem search_path fixo são vulneráveis a hijack de resolução de
--      nomes. Fixamos em `pg_catalog, public` (não-mutável): mantém os builtins
--      protegidos e preserva referências a tabelas de `public` sem qualificação.
--
-- Referências:
--   https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
--   https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
--   https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
-- =============================================================================

-- 1) Revogar EXECUTE do acesso público -----------------------------------------
REVOKE EXECUTE ON FUNCTION public.cleanup_old_capturas()            FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_capturas_historico()  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_debug_log()               FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_super_admin()                  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.my_cliente_id()                   FROM anon, authenticated;

-- 2) Fixar search_path ---------------------------------------------------------
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
