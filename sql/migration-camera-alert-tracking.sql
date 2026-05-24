-- =============================================================================
--  migration-camera-alert-tracking.sql
-- -----------------------------------------------------------------------------
--  Adiciona coluna pra rastrear quando o cron-monitor-cameras avisou que uma
--  câmera está offline, evitando spam quando ela continua offline por horas.
--
--  Aplicar uma vez no Supabase SQL Editor.
-- =============================================================================

ALTER TABLE cameras
  ADD COLUMN IF NOT EXISTS last_offline_alert_at timestamptz;

COMMENT ON COLUMN cameras.last_offline_alert_at IS
  'Timestamp do último alerta enviado pelo cron-monitor-cameras. Usado para throttle: re-alertar a cada 6h enquanto offline.';
