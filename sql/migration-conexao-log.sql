-- ============================================
-- PROTECTOR LOMBADA EDUCATIVA - Tabela conexao_log
-- Registra TODA requisição que bate em /placa e /heartbeat,
-- com motivo de sucesso/erro para diagnóstico operacional.
--
-- Diferença para debug_log:
--   - debug_log: erros raros, 24h de retenção, conteúdo livre
--   - conexao_log: TODAS as requisições das câmeras, 7 dias de
--     retenção, estrutura fixa, alimenta o painel de diagnóstico
--
-- Execute no Supabase SQL Editor após:
--   - schema.sql
--   - migration-admin.sql (usa is_super_admin / my_cliente_id)
-- ============================================

-- 1. TABELA
CREATE TABLE IF NOT EXISTS conexao_log (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Classificação
  tipo TEXT NOT NULL CHECK (tipo IN ('placa', 'heartbeat')),
  resultado TEXT NOT NULL CHECK (resultado IN ('sucesso', 'erro')),
  motivo TEXT,  -- null se sucesso; senão um dos códigos abaixo
  http_status SMALLINT NOT NULL,

  -- Identificação (todas nullable: requisição pode chegar sem identificação válida)
  camera_id UUID REFERENCES cameras(id) ON DELETE SET NULL,
  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  serial_recebido TEXT,    -- serial extraído do payload, mesmo se câmera não cadastrada

  -- Origem
  ip_origem TEXT,          -- IP visto pelo servidor (x-forwarded-for ou socket)
  ip_payload TEXT,         -- IP que a câmera declarou no payload (difere por NAT)
  mac_payload TEXT,
  user_agent TEXT,
  content_type TEXT,

  -- Conteúdo (resumido — sem armazenar imagens)
  payload_keys TEXT,       -- chaves top-level do payload, separadas por vírgula
  placa TEXT,
  velocidade INT,

  -- Performance
  latencia_ms INT,

  -- Detalhes adicionais quando relevante (ex: snippet de stack em erro)
  detalhes JSONB
);

COMMENT ON TABLE conexao_log IS 'Log estruturado de toda requisição em /placa e /heartbeat. Retenção: 7 dias.';
COMMENT ON COLUMN conexao_log.motivo IS 'Códigos: token_invalido, serial_nao_cadastrado, sem_identificacao, cliente_inativo, rate_limit, payload_invalido, placa_vazia, metodo_nao_permitido, erro_interno';
COMMENT ON COLUMN conexao_log.ip_origem IS 'IP da conexão TCP (pode ser proxy/NAT)';
COMMENT ON COLUMN conexao_log.ip_payload IS 'IP que a câmera declarou em alarm.ipaddr — útil para identificar NAT';

-- 2. ÍNDICES
CREATE INDEX IF NOT EXISTS idx_conexao_log_ts ON conexao_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_conexao_log_camera_ts ON conexao_log(camera_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_conexao_log_cliente_ts ON conexao_log(cliente_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_conexao_log_erro ON conexao_log(ts DESC) WHERE resultado = 'erro';
CREATE INDEX IF NOT EXISTS idx_conexao_log_serial ON conexao_log(serial_recebido, ts DESC) WHERE serial_recebido IS NOT NULL;

-- 3. RLS
ALTER TABLE conexao_log ENABLE ROW LEVEL SECURITY;

-- super_admin vê tudo; admin_cliente vê apenas do seu cliente
CREATE POLICY "conexao_log_select" ON conexao_log
  FOR SELECT USING (
    is_super_admin()
    OR cliente_id = my_cliente_id()
  );

-- Apenas service_role insere (a API é quem grava — RLS bypassada via service key)
-- Não definimos policy de INSERT — só service_role escreve.

-- 4. LIMPEZA AUTOMÁTICA (7 dias)
-- Função idempotente, segura para chamar via pg_cron
CREATE OR REPLACE FUNCTION public.cleanup_old_conexao_log()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM conexao_log
    WHERE ts < NOW() - INTERVAL '7 days'
    RETURNING 1
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Agendar no pg_cron (executa a cada hora, baixo custo pelos índices)
-- Idempotente: se já existe, remove e recria
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup_conexao_log_hourly') THEN
    PERFORM cron.unschedule('cleanup_conexao_log_hourly');
  END IF;

  PERFORM cron.schedule(
    'cleanup_conexao_log_hourly',
    '17 * * * *',  -- minuto 17 de cada hora (espalha carga)
    $job$ SELECT public.cleanup_old_conexao_log() $job$
  );
EXCEPTION WHEN undefined_table THEN
  -- pg_cron não disponível (ambiente local); silenciar
  RAISE NOTICE 'pg_cron não disponível, pulando agendamento';
END $$;

-- ============================================
-- ROLLBACK (executar manualmente se necessário):
--
-- DO $$ BEGIN
--   IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup_conexao_log_hourly') THEN
--     PERFORM cron.unschedule('cleanup_conexao_log_hourly');
--   END IF;
-- EXCEPTION WHEN undefined_table THEN NULL; END $$;
-- DROP FUNCTION IF EXISTS public.cleanup_old_conexao_log();
-- DROP TABLE IF EXISTS conexao_log;
-- ============================================
