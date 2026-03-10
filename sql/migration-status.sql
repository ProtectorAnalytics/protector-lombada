-- Migration: Monitoramento de Status de Câmeras
-- Adiciona campos para rastrear última atividade e status online/offline

ALTER TABLE cameras ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS last_capture_id UUID REFERENCES capturas(id);
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS total_capturas_hoje INTEGER DEFAULT 0;

-- Índice para consultas de status
CREATE INDEX IF NOT EXISTS idx_cameras_last_seen ON cameras(last_seen);
