-- =============================================================================
-- Índices de cobertura para foreign keys sem índice
-- =============================================================================
--
-- Advisor: unindexed_foreign_keys
--   https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys
--
-- Uma FK sem índice de cobertura força sequential scan na tabela filha sempre
-- que a linha referenciada é atualizada ou deletada. No nosso caso isso pesa em
-- dois pontos quentes:
--
--   1. cameras.last_capture_id → capturas.id
--      O cron de limpeza (diário) e o pg_cron de metadados (6 meses) deletam
--      capturas em lote. Cada DELETE precisa checar `cameras` em busca de
--      referências — sem índice, é um scan da tabela por linha deletada.
--
--   2. solicitacoes_titular.respondida_por → usuarios.id
--      Menos crítico (volume baixo), mas o mesmo custo aparece ao desativar
--      ou remover um usuário, e no JOIN que o painel do DPO faz para exibir
--      quem respondeu cada protocolo.
--
-- CONCURRENTLY para não travar escrita nas tabelas em produção.
-- =============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cameras_last_capture_id
  ON public.cameras (last_capture_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sol_titular_respondida_por
  ON public.solicitacoes_titular (respondida_por);
