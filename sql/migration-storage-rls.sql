-- ============================================
-- MIGRATION: Corrigir RLS do Storage de fotos
-- Problema: qualquer usuario autenticado via fotos de qualquer cliente
-- Solucao: filtrar acesso pelo cliente_id no path da foto
-- ============================================

-- Remover policy antiga (permissiva demais)
DROP POLICY IF EXISTS "fotos_select_auth" ON storage.objects;

-- Nova policy: usuario so ve fotos do seu proprio cliente
-- O foto_path segue o formato: {cliente_id}/{camera_id}/{timestamp}_{placa}.jpg
-- Entao o primeiro segmento do path (name) eh o cliente_id
CREATE POLICY "fotos_select_own_client" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'capturas-fotos'
    AND (
      -- Super admins (verificados via tabela usuarios) podem ver tudo
      EXISTS (
        SELECT 1 FROM public.usuarios u
        WHERE u.auth_id = auth.uid()
          AND u.ativo = true
          AND u.role = 'super_admin'
      )
      OR
      -- Usuarios normais so veem fotos do seu cliente
      -- O path comeca com o cliente_id do usuario
      (storage.foldername(name))[1] IN (
        SELECT u.cliente_id::text FROM public.usuarios u
        WHERE u.auth_id = auth.uid()
          AND u.ativo = true
      )
    )
  );
