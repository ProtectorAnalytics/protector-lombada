-- ============================================================
-- MIGRATION: Blur automático de pessoas nas capturas (LGPD Fase 4)
-- Data: 2026-04-10
--
-- Adiciona flag booleana `blur_automatico` à tabela `clientes` para
-- habilitar/desabilitar o processamento de detecção de pessoas + blur
-- automático nas fotos de captura, antes do upload ao Storage.
--
-- Default: false — cliente precisa ativar explicitamente, evitando
-- impacto em clientes existentes e permitindo cobrança por feature.
-- ============================================================

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS blur_automatico BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN clientes.blur_automatico IS
  'Ativa detecção e blur automático de pessoas/motos/bikes nas fotos de captura. Ver docs/LGPD.md § Fase 4.';
