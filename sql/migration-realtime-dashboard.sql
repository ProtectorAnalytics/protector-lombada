-- ============================================
-- PROTECTOR LOMBADA EDUCATIVA - Realtime dashboard
-- Habilita Supabase Realtime para cameras e capturas.
--
-- Custo: baixo. cameras tem ~7 linhas e UPDATEs apenas a cada
-- ~1 minuto (throttle no app). capturas insere conforme volume
-- normal de tráfego. Realtime respeita RLS por cliente.
--
-- IDEMPOTENTE: usa DO/EXCEPTION para não falhar se já adicionado.
-- ============================================

-- 1. Adicionar tabelas à publication supabase_realtime
DO $$
BEGIN
  -- cameras: status online/offline em tempo real
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'cameras'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.cameras;
  END IF;

  -- capturas: novas capturas aparecem sozinhas no dashboard
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'capturas'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.capturas;
  END IF;
END $$;

-- 2. REPLICA IDENTITY FULL em cameras: o Realtime precisa enviar
--    todos os campos no payload de UPDATE (não só PK + alterados),
--    pra o cliente conseguir reidratar o status sem fazer SELECT.
--    Em capturas mantemos DEFAULT (PK) porque o INSERT já tem todos
--    os campos no payload.
ALTER TABLE public.cameras REPLICA IDENTITY FULL;

-- ============================================
-- ROLLBACK:
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.cameras;
-- ALTER PUBLICATION supabase_realtime DROP TABLE public.capturas;
-- ALTER TABLE public.cameras REPLICA IDENTITY DEFAULT;
-- ============================================
