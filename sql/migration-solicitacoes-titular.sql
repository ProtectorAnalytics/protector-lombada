-- ============================================================
-- MIGRATION: Fluxo de Direitos do Titular (LGPD Fase 2)
-- Data: 2026-04-10
-- Objetivo: Criar canal estruturado para titulares exercerem seus
-- direitos previstos no Art. 18 da LGPD.
--
-- Fluxo:
--   1. Titular preenche formulário público em /direitos-titular
--   2. Endpoint api/direitos-titular.js valida e grava aqui
--   3. E-mail automático é enviado ao DPO (dpo@appps.com.br)
--   4. DPO responde dentro do prazo legal de 15 dias (Art. 19 LGPD)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.solicitacoes_titular (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocolo TEXT NOT NULL UNIQUE,

  -- Identificação do solicitante
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT,
  cpf TEXT,

  -- Vínculo opcional com um empreendimento
  empreendimento TEXT,
  placa_veiculo TEXT,
  unidade TEXT,

  -- Tipo de solicitação (Art. 18 LGPD)
  tipo TEXT NOT NULL CHECK (tipo IN (
    'confirmacao',                -- Confirmação da existência de tratamento
    'acesso',                     -- Acesso aos dados
    'correcao',                   -- Correção de dados incompletos/inexatos
    'anonimizacao',               -- Anonimização, bloqueio ou eliminação
    'portabilidade',              -- Portabilidade a outro fornecedor
    'eliminacao',                 -- Eliminação dos dados
    'informacao_compartilhamento',-- Informação sobre compartilhamento
    'revogacao_consentimento',    -- Revogação do consentimento
    'reclamacao',                 -- Reclamação / oposição
    'outro'
  )),
  descricao TEXT NOT NULL,

  -- Status do atendimento
  status TEXT NOT NULL DEFAULT 'recebida' CHECK (status IN (
    'recebida',
    'em_analise',
    'aguardando_titular',
    'encaminhada_controlador',
    'atendida',
    'rejeitada',
    'cancelada'
  )),

  -- Metadados técnicos da origem
  ip_origem TEXT,
  user_agent TEXT,

  -- Resposta do DPO
  resposta_dpo TEXT,
  respondida_em TIMESTAMPTZ,
  respondida_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,

  -- Prazo legal de resposta (15 dias corridos — Art. 19 LGPD)
  prazo_limite DATE NOT NULL DEFAULT (now() + interval '15 days')::date,

  -- Timestamps
  criada_em TIMESTAMPTZ DEFAULT now(),
  atualizada_em TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_sol_titular_status ON solicitacoes_titular(status);
CREATE INDEX IF NOT EXISTS idx_sol_titular_prazo
  ON solicitacoes_titular(prazo_limite)
  WHERE status NOT IN ('atendida','rejeitada','cancelada');
CREATE INDEX IF NOT EXISTS idx_sol_titular_email ON solicitacoes_titular(email);
CREATE INDEX IF NOT EXISTS idx_sol_titular_protocolo ON solicitacoes_titular(protocolo);

-- RLS
ALTER TABLE solicitacoes_titular ENABLE ROW LEVEL SECURITY;

-- SELECT / UPDATE / DELETE: apenas super_admin (DPO) pode gerenciar
CREATE POLICY "solicitacoes_titular_select" ON solicitacoes_titular
  FOR SELECT USING (is_super_admin());

CREATE POLICY "solicitacoes_titular_update" ON solicitacoes_titular
  FOR UPDATE USING (is_super_admin());

CREATE POLICY "solicitacoes_titular_delete" ON solicitacoes_titular
  FOR DELETE USING (is_super_admin());

-- INSERT: bloqueado via RLS. Apenas o backend (service_role) pode inserir,
-- pelo endpoint público /api/direitos-titular.
CREATE POLICY "solicitacoes_titular_insert" ON solicitacoes_titular
  FOR INSERT WITH CHECK (false);
