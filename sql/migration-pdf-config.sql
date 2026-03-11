-- ============================================
-- MIGRATION: Configuração PDF + Notificação Automática
-- Execute no Supabase SQL Editor
-- ============================================

-- Campos de configuração do PDF por cliente
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS pdf_titulo TEXT DEFAULT 'NOTIFICAÇÃO ORIENTATIVA';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS pdf_subtitulo TEXT DEFAULT 'Transitar em velocidade superior à máxima permitida';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS pdf_rodape TEXT DEFAULT '';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS pdf_logo_url TEXT;

-- Notificação automática por e-mail
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS notif_auto_ativa BOOLEAN DEFAULT false;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS notif_emails TEXT[] DEFAULT '{}';

-- ============================================
-- FIM DA MIGRATION
-- ============================================
