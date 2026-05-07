-- ============================================
-- MIGRATION: dados auditáveis de câmera (modelo + firmware)
-- Aplicado via MCP em 2026-05-07
-- ============================================
-- Permite que o rodapé do PDF de notificação carregue informações
-- de hardware da câmera ALPHADIGI (modelo + firmware) pra fins de
-- prova jurídica. ALPHADIGI hoje não expõe esses dados via heartbeat,
-- então preenchimento é manual no admin.
-- ============================================

ALTER TABLE cameras ADD COLUMN IF NOT EXISTS modelo TEXT;
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS firmware TEXT;

-- ============================================
-- FIM DA MIGRATION
-- ============================================
