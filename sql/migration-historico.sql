-- ============================================
-- MIGRATION: Política de Retenção em 3 Camadas
-- ============================================
-- capturas            — 15 dias (operacional + foto)
-- capturas_historico  — 180 dias (metadados sem foto, para relatórios)
-- fotos de infrações  — 90 dias no Storage (evidência de contestação)
-- ============================================

CREATE TABLE IF NOT EXISTS capturas_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  captura_id UUID UNIQUE,
  camera_id UUID,
  cliente_id UUID NOT NULL,
  placa TEXT NOT NULL,
  velocidade INT NOT NULL,
  pixels INT,
  tipo_veiculo TEXT,
  cor_veiculo TEXT,
  foto_path TEXT,
  foto_disponivel BOOLEAN DEFAULT false,
  timestamp TIMESTAMPTZ NOT NULL,
  notificado BOOLEAN DEFAULT false,
  notificado_em TIMESTAMPTZ,
  capturado_em TIMESTAMPTZ,
  origem TEXT NOT NULL CHECK (origem IN ('producao', 'backup_restore', 'import_manual')),
  importado_em TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_hist_timestamp ON capturas_historico(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_hist_cliente ON capturas_historico(cliente_id);
CREATE INDEX IF NOT EXISTS idx_hist_placa ON capturas_historico(placa);
CREATE INDEX IF NOT EXISTS idx_hist_camera ON capturas_historico(camera_id);
CREATE INDEX IF NOT EXISTS idx_hist_cliente_timestamp ON capturas_historico(cliente_id, timestamp DESC);
-- Índice composto para purge de fotos de infração (vel > 30 AND foto_disponivel)
CREATE INDEX IF NOT EXISTS idx_hist_foto_purge ON capturas_historico(timestamp)
  WHERE foto_disponivel = true AND foto_path IS NOT NULL;

-- Índice para agilizar o archiving
CREATE INDEX IF NOT EXISTS idx_capturas_timestamp_cliente ON capturas(timestamp, cliente_id);

-- RLS
ALTER TABLE capturas_historico ENABLE ROW LEVEL SECURITY;

-- SELECT: super_admin total, admin_cliente/operador apenas do próprio cliente
DROP POLICY IF EXISTS "hist_select" ON capturas_historico;
CREATE POLICY "hist_select" ON capturas_historico
  FOR SELECT USING (
    is_super_admin()
    OR cliente_id IN (SELECT id FROM clientes WHERE user_id = auth.uid())
  );

-- INSERT/UPDATE/DELETE: apenas service_role (sem policy pra usuário autenticado)
