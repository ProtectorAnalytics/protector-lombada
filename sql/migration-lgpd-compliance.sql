-- ============================================================
-- MIGRATION: LGPD COMPLIANCE
-- Data: 2026-04-10
-- Objetivo: Alinhar o banco à Política de Privacidade v1.0 e ao
-- documento docs/LGPD.md v2.0
--
-- Conteúdo:
--   1. Corrigir RLS permissiva de debug_log (SELECT só super_admin)
--   2. Fechar INSERT/DELETE do storage.objects (só service_role)
--   3. Adicionar políticas de escrita em capturas_historico
--   4. Criar função cleanup_historico_photos (15d foto)
--   5. Criar função cleanup_old_capturas_historico (6m metadados)
--   6. Agendar no pg_cron as funções acima
--
-- Execute no Supabase SQL Editor ou via Supabase CLI:
--   psql $DATABASE_URL -f sql/migration-lgpd-compliance.sql
-- ============================================================

-- ============================================================
-- 1. CORRIGIR RLS DE debug_log
-- ============================================================
-- Antes: qualquer usuário autenticado podia ler debug_log.
-- Depois: apenas super_admin. INSERT permanece liberado (usado pelo backend).

DROP POLICY IF EXISTS "debug_log_select" ON public.debug_log;

CREATE POLICY "debug_log_select_admin"
  ON public.debug_log
  FOR SELECT
  USING (public.is_super_admin());

-- INSERT policy inalterada (qualquer call autenticada com service_role insere).
-- Em produção, apenas a função serverless api/captura.js insere erros aqui.

-- ============================================================
-- 2. FECHAR RLS DE storage.objects
-- ============================================================
-- Antes: qualquer usuário autenticado podia inserir/deletar no bucket.
-- Depois: apenas service_role.

DROP POLICY IF EXISTS "fotos_insert_service" ON storage.objects;
DROP POLICY IF EXISTS "fotos_delete_service" ON storage.objects;

CREATE POLICY "fotos_insert_service_role"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'capturas-fotos'
    AND (SELECT auth.role()) = 'service_role'
  );

CREATE POLICY "fotos_delete_service_role"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'capturas-fotos'
    AND (SELECT auth.role()) = 'service_role'
  );

-- SELECT (fotos_select_own_client) já está correto e não precisa ser alterado.

-- ============================================================
-- 3. POLÍTICAS DE ESCRITA EM capturas_historico
-- ============================================================
-- Antes: a tabela tinha só política de SELECT (não documentada no repo).
-- Depois: adiciona policies explícitas. Só super_admin pode escrever.

-- Garantir RLS habilitado
ALTER TABLE public.capturas_historico ENABLE ROW LEVEL SECURITY;

-- Dropar a policy antiga e recriar usando my_cliente_id() para consistência
DROP POLICY IF EXISTS "hist_select" ON public.capturas_historico;

CREATE POLICY "capturas_historico_select"
  ON public.capturas_historico
  FOR SELECT
  USING (
    public.is_super_admin()
    OR cliente_id = public.my_cliente_id()
  );

CREATE POLICY "capturas_historico_insert"
  ON public.capturas_historico
  FOR INSERT
  WITH CHECK (public.is_super_admin());

CREATE POLICY "capturas_historico_update"
  ON public.capturas_historico
  FOR UPDATE
  USING (public.is_super_admin());

CREATE POLICY "capturas_historico_delete"
  ON public.capturas_historico
  FOR DELETE
  USING (public.is_super_admin());

-- ============================================================
-- 4. LIMPEZA DE FOTOS — FORA DO pg_cron
-- ============================================================
-- IMPORTANTE: A limpeza de fotos (tanto de `capturas` quanto de `capturas_historico`)
-- é feita por Vercel Cron no endpoint api/cron-limpeza.js, NÃO por pg_cron.
--
-- Motivo: o Supabase aplica a trigger `storage.protect_objects_delete`, que
-- bloqueia DELETE direto em `storage.objects` via SQL. Funções SQL que tentam
-- apagar arquivos do bucket falham silenciosamente.
--
-- Solução: o endpoint Vercel usa o SDK `@supabase/supabase-js`
-- (método `storage.remove()`), que chama a Storage API e contorna a trigger.
--
-- As funções SQL `cleanup_old_photos` e `cleanup_historico_photos`, se
-- existirem no banco, devem ser removidas (ficam quebradas).

DROP FUNCTION IF EXISTS public.cleanup_old_photos();
DROP FUNCTION IF EXISTS public.cleanup_historico_photos();

-- ============================================================
-- 5. FUNÇÃO: cleanup_old_capturas_historico
-- ============================================================
-- Apaga linhas de capturas_historico > 6 meses
-- Alinhada com a política de metadados (art. 6º III LGPD - necessidade)

CREATE OR REPLACE FUNCTION public.cleanup_old_capturas_historico()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.capturas_historico
  WHERE "timestamp" < now() - interval '6 months';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$function$;

-- ============================================================
-- 6. AGENDAR FUNÇÃO DE METADADOS NO pg_cron
-- ============================================================
-- Remover jobs quebrados se existirem (fotos não podem ser deletadas via SQL)
SELECT cron.unschedule('cleanup-old-photos')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-old-photos');

SELECT cron.unschedule('cleanup-historico-photos')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-historico-photos');

-- Agendar limpeza de metadados do histórico > 6 meses (idempotente)
SELECT cron.unschedule('cleanup-old-capturas-historico')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-old-capturas-historico');

SELECT cron.schedule(
  'cleanup-old-capturas-historico',
  '5 4 * * *',  -- 04:05 UTC (5 min após cleanup_old_capturas)
  $$ SELECT public.cleanup_old_capturas_historico() $$
);

-- ============================================================
-- 7. VALIDAÇÃO FINAL
-- ============================================================
-- Queries para conferir que tudo foi aplicado corretamente

-- 7.1 Policies atuais no schema public e storage
-- SELECT schemaname, tablename, policyname, cmd
-- FROM pg_policies
-- WHERE schemaname IN ('public', 'storage')
-- ORDER BY schemaname, tablename, cmd;

-- 7.2 Jobs agendados no pg_cron
-- SELECT jobname, schedule, command, active FROM cron.job ORDER BY jobname;

-- 7.3 Contagem atual das tabelas
-- SELECT
--   (SELECT count(*) FROM capturas) as capturas,
--   (SELECT count(*) FROM capturas_historico) as capturas_historico,
--   (SELECT count(*) FROM debug_log) as debug_log;

-- ============================================================
-- FIM DA MIGRATION
-- ============================================================
