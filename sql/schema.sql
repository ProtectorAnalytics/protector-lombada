-- ============================================
-- PROTECTOR LOMBADA EDUCATIVA - Schema SQL
-- Execute no Supabase SQL Editor
-- ============================================

-- 1. TABELA: clientes
CREATE TABLE clientes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  local_via TEXT NOT NULL,
  cidade_uf TEXT NOT NULL,
  cep TEXT,
  endereco TEXT,
  limite_velocidade INT NOT NULL DEFAULT 30,
  emails_notificacao TEXT[] DEFAULT '{}',
  logo_url TEXT,
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_clientes_user_id ON clientes(user_id);

-- 2. TABELA: cameras
CREATE TABLE cameras (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  ativa BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cameras_token ON cameras(token);
CREATE INDEX idx_cameras_cliente_id ON cameras(cliente_id);

-- 3. TABELA: veiculos
CREATE TABLE veiculos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  placa TEXT NOT NULL,
  nome_morador TEXT,
  unidade TEXT,
  marca TEXT,
  cor TEXT,
  ativo BOOLEAN DEFAULT true,
  criado_em TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_veiculos_placa ON veiculos(placa);
CREATE INDEX idx_veiculos_cliente_id ON veiculos(cliente_id);

-- 4. TABELA: capturas
CREATE TABLE capturas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  camera_id UUID NOT NULL REFERENCES cameras(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  placa TEXT NOT NULL,
  velocidade INT NOT NULL,
  pixels INT,
  tipo_veiculo TEXT,
  cor_veiculo TEXT,
  foto_path TEXT,
  timestamp TIMESTAMPTZ NOT NULL,
  notificado BOOLEAN DEFAULT false,
  notificado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_capturas_timestamp ON capturas(timestamp DESC);
CREATE INDEX idx_capturas_placa ON capturas(placa);
CREATE INDEX idx_capturas_cliente_id ON capturas(cliente_id);
CREATE INDEX idx_capturas_camera_id ON capturas(camera_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cameras ENABLE ROW LEVEL SECURITY;
ALTER TABLE veiculos ENABLE ROW LEVEL SECURITY;
ALTER TABLE capturas ENABLE ROW LEVEL SECURITY;

-- Clientes: usuário só vê seu próprio registro
CREATE POLICY "clientes_select_own" ON clientes
  FOR SELECT USING (auth.uid() = user_id);

-- Cameras: usuário só vê cameras do seu cliente
CREATE POLICY "cameras_select_own" ON cameras
  FOR SELECT USING (
    cliente_id IN (SELECT id FROM clientes WHERE user_id = auth.uid())
  );

-- Veículos: usuário só vê veículos do seu cliente
CREATE POLICY "veiculos_select_own" ON veiculos
  FOR SELECT USING (
    cliente_id IN (SELECT id FROM clientes WHERE user_id = auth.uid())
  );

-- Capturas: usuário só vê capturas do seu cliente
CREATE POLICY "capturas_select_own" ON capturas
  FOR SELECT USING (
    cliente_id IN (SELECT id FROM clientes WHERE user_id = auth.uid())
  );

-- ============================================
-- STORAGE BUCKET
-- ============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('capturas-fotos', 'capturas-fotos', false)
ON CONFLICT (id) DO NOTHING;

-- Policy: leitura autenticada (usuário logado pode ver fotos do seu cliente)
CREATE POLICY "fotos_select_auth" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'capturas-fotos'
    AND auth.role() = 'authenticated'
  );

-- Policy: service role pode inserir e deletar (usado pela API)
CREATE POLICY "fotos_insert_service" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'capturas-fotos'
  );

CREATE POLICY "fotos_delete_service" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'capturas-fotos'
  );

-- ============================================
-- DADOS DE EXEMPLO (SEED)
-- Para testar, descomente e execute separadamente
-- ============================================

/*
-- Criar usuário de teste no Supabase Auth primeiro via Dashboard
-- Depois insira o user_id retornado aqui:

INSERT INTO clientes (id, user_id, nome, local_via, cidade_uf, cep, endereco, limite_velocidade, emails_notificacao)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'SEU_AUTH_USER_ID_AQUI',
  'Condomínio Parque das Flores',
  'Rua Principal - Via Interna',
  'São Paulo/SP',
  '01234-567',
  'Rua das Flores, 100',
  30,
  ARRAY['admin@condominio.com', 'portaria@condominio.com']
);

INSERT INTO cameras (id, cliente_id, nome, token)
VALUES (
  'cam-11111111-2222-3333-4444-555555555555',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'Câmera Entrada Principal',
  'TOKEN_TESTE_123456'
);

INSERT INTO veiculos (cliente_id, placa, nome_morador, unidade, marca, cor)
VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'RPK5F09', 'João Silva', 'Bloco A - Apt 101', 'Toyota Corolla', 'Prata'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'ABC1D23', 'Maria Santos', 'Bloco B - Apt 205', 'Honda Civic', 'Preto');
*/
