-- ============================================
-- MIGRATION: Corpo de texto custom no PDF de notificação
-- Execute no Supabase SQL Editor (já aplicado via MCP em 2026-05-07)
-- ============================================
-- Cliente que tiver pdf_corpo_texto preenchido recebe o bloco renderizado
-- logo depois do cabeçalho do PDF, com substituição de placeholders.
-- Clientes com NULL/vazio não veem nada — comportamento atual preservado.
--
-- Placeholders suportados:
--   {{DATA_OCORRENCIA}}      → data da captura formatada
--   {{HORA_OCORRENCIA}}      → hora da captura formatada
--   {{ID_RADAR}}             → nome da câmera (ex.: LOMBADA-PM-01)
--   {{PLACA_VEICULO}}        → placa lida
--   {{VELOCIDADE_REGISTRADA}} → velocidade em km/h
-- ============================================

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS pdf_corpo_texto TEXT;

-- ============================================
-- FIM DA MIGRATION
-- ============================================
