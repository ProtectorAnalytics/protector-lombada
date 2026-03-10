-- ============================================
-- MIGRATION: Painel Administrativo Multi-Tenant
-- Execute no Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. NOVAS COLUNAS EM CLIENTES
-- ============================================

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cnpj TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS telefone TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS contato_nome TEXT;

-- ============================================
-- 2. TABELA: usuarios (perfis + roles)
-- ============================================

CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES clientes(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin_cliente', 'operador')),
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_auth_id ON usuarios(auth_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_cliente_id ON usuarios(cliente_id);

-- ============================================
-- 3. TABELA: email_destinatarios
-- ============================================

CREATE TABLE IF NOT EXISTS email_destinatarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  tipo TEXT DEFAULT 'alerta' CHECK (tipo IN ('alerta', 'relatorio', 'todos')),
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_dest_cliente ON email_destinatarios(cliente_id);

-- ============================================
-- 4. TABELA: audit_log
-- ============================================

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  acao TEXT NOT NULL,
  tabela TEXT,
  registro_id UUID,
  detalhes JSONB,
  ip TEXT,
  criado_em TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_criado ON audit_log(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_audit_usuario ON audit_log(usuario_id);

-- ============================================
-- 5. RLS NAS NOVAS TABELAS
-- ============================================

ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_destinatarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Helper: checa se o usuário logado é super_admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM usuarios
    WHERE auth_id = auth.uid()
    AND role = 'super_admin'
    AND ativo = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: retorna o cliente_id do usuário logado
CREATE OR REPLACE FUNCTION my_cliente_id()
RETURNS UUID AS $$
  SELECT cliente_id FROM usuarios
  WHERE auth_id = auth.uid()
  AND ativo = true
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- 5.1 Políticas: usuarios
-- ============================================

CREATE POLICY "usuarios_select" ON usuarios
  FOR SELECT USING (
    auth_id = auth.uid()
    OR is_super_admin()
  );

CREATE POLICY "usuarios_insert" ON usuarios
  FOR INSERT WITH CHECK (is_super_admin());

CREATE POLICY "usuarios_update" ON usuarios
  FOR UPDATE USING (is_super_admin());

CREATE POLICY "usuarios_delete" ON usuarios
  FOR DELETE USING (is_super_admin());

-- ============================================
-- 5.2 Políticas: email_destinatarios
-- ============================================

CREATE POLICY "email_dest_select" ON email_destinatarios
  FOR SELECT USING (
    is_super_admin()
    OR cliente_id = my_cliente_id()
  );

CREATE POLICY "email_dest_insert" ON email_destinatarios
  FOR INSERT WITH CHECK (
    is_super_admin()
    OR cliente_id = my_cliente_id()
  );

CREATE POLICY "email_dest_update" ON email_destinatarios
  FOR UPDATE USING (
    is_super_admin()
    OR cliente_id = my_cliente_id()
  );

CREATE POLICY "email_dest_delete" ON email_destinatarios
  FOR DELETE USING (
    is_super_admin()
    OR cliente_id = my_cliente_id()
  );

-- ============================================
-- 5.3 Políticas: audit_log (apenas super_admin lê)
-- ============================================

CREATE POLICY "audit_select" ON audit_log
  FOR SELECT USING (is_super_admin());

CREATE POLICY "audit_insert" ON audit_log
  FOR INSERT WITH CHECK (true);

-- ============================================
-- 5.4 Atualizar políticas existentes
-- Dropar as antigas e recriar com super_admin bypass
-- ============================================

-- CLIENTES
DROP POLICY IF EXISTS "clientes_select_own" ON clientes;

CREATE POLICY "clientes_select" ON clientes
  FOR SELECT USING (
    is_super_admin()
    OR user_id = auth.uid()
  );

CREATE POLICY "clientes_insert" ON clientes
  FOR INSERT WITH CHECK (is_super_admin());

CREATE POLICY "clientes_update" ON clientes
  FOR UPDATE USING (
    is_super_admin()
    OR user_id = auth.uid()
  );

CREATE POLICY "clientes_delete" ON clientes
  FOR DELETE USING (is_super_admin());

-- CAMERAS
DROP POLICY IF EXISTS "cameras_select_own" ON cameras;

CREATE POLICY "cameras_select" ON cameras
  FOR SELECT USING (
    is_super_admin()
    OR cliente_id IN (SELECT id FROM clientes WHERE user_id = auth.uid())
  );

CREATE POLICY "cameras_insert" ON cameras
  FOR INSERT WITH CHECK (is_super_admin());

CREATE POLICY "cameras_update" ON cameras
  FOR UPDATE USING (is_super_admin());

CREATE POLICY "cameras_delete" ON cameras
  FOR DELETE USING (is_super_admin());

-- VEICULOS
DROP POLICY IF EXISTS "veiculos_select_own" ON veiculos;

CREATE POLICY "veiculos_select" ON veiculos
  FOR SELECT USING (
    is_super_admin()
    OR cliente_id IN (SELECT id FROM clientes WHERE user_id = auth.uid())
  );

CREATE POLICY "veiculos_insert" ON veiculos
  FOR INSERT WITH CHECK (
    is_super_admin()
    OR cliente_id IN (SELECT id FROM clientes WHERE user_id = auth.uid())
  );

CREATE POLICY "veiculos_update" ON veiculos
  FOR UPDATE USING (
    is_super_admin()
    OR cliente_id IN (SELECT id FROM clientes WHERE user_id = auth.uid())
  );

CREATE POLICY "veiculos_delete" ON veiculos
  FOR DELETE USING (
    is_super_admin()
    OR cliente_id IN (SELECT id FROM clientes WHERE user_id = auth.uid())
  );

-- CAPTURAS
DROP POLICY IF EXISTS "capturas_select_own" ON capturas;

CREATE POLICY "capturas_select" ON capturas
  FOR SELECT USING (
    is_super_admin()
    OR cliente_id IN (SELECT id FROM clientes WHERE user_id = auth.uid())
  );

-- ============================================
-- 6. MIGRAR DADOS: emails_notificacao → email_destinatarios
-- ============================================

-- Migra os e-mails existentes do campo TEXT[] para a nova tabela
INSERT INTO email_destinatarios (cliente_id, nome, email, tipo)
SELECT
  c.id,
  e.email,  -- usa o email como nome temporário
  e.email,
  'todos'
FROM clientes c,
LATERAL unnest(c.emails_notificacao) AS e(email)
WHERE c.emails_notificacao IS NOT NULL
  AND array_length(c.emails_notificacao, 1) > 0
ON CONFLICT DO NOTHING;

-- ============================================
-- FIM DA MIGRATION
-- ============================================
