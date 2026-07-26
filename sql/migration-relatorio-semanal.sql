-- ============================================
-- MIGRATION: Relatório Semanal por e-mail
-- ============================================
-- Resumo de circulação enviado semanalmente aos gestores de cada condomínio.
--
-- Decisões de desenho:
--
--   1. Agendamento por cliente (dia + hora). O vercel.json tem cron fixo, então
--      o endpoint roda de hora em hora e cada execução envia apenas para os
--      clientes cujo relatorio_dia_semana/relatorio_hora batem com o instante
--      atual em America/Bahia (NÃO em UTC — o cron-prazos-lgpd usa `0 9 * * *`
--      que é 06:00 em Salvador; aqui a comparação é feita no fuso local).
--
--   2. Destinatários reutilizam email_destinatarios com tipo='relatorio'
--      (valor já aceito pelo endpoint). O campo `nome`, hoje gravado e nunca
--      usado, passa a alimentar {{NOME_DESTINATARIO}}.
--
--   3. Confirmação de leitura via LINK TOKENIZADO, não pixel de rastreamento.
--      Pixel é servido por proxy no Gmail (registra o proxy, não a pessoa) e é
--      rastreamento de comportamento sem consentimento — incompatível com a
--      política de privacidade publicada. O clique no link é consentido,
--      funciona em qualquer cliente de e-mail, e mede engajamento real.
--
--   4. O template segue a convenção {{VAR}} já usada em pdf_corpo_texto.
-- ============================================

-- 1) Configuração por cliente ------------------------------------------------

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS relatorio_ativo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS relatorio_dia_semana SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS relatorio_hora SMALLINT NOT NULL DEFAULT 8;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS relatorio_corpo_texto TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS relatorio_anexar_pdf BOOLEAN NOT NULL DEFAULT true;

-- 0 = domingo … 6 = sábado (compatível com EXTRACT(DOW))
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_relatorio_dia_semana_chk;
ALTER TABLE clientes ADD CONSTRAINT clientes_relatorio_dia_semana_chk
  CHECK (relatorio_dia_semana BETWEEN 0 AND 6);

ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_relatorio_hora_chk;
ALTER TABLE clientes ADD CONSTRAINT clientes_relatorio_hora_chk
  CHECK (relatorio_hora BETWEEN 0 AND 23);

COMMENT ON COLUMN clientes.relatorio_dia_semana IS '0=domingo … 6=sábado, avaliado em America/Bahia';
COMMENT ON COLUMN clientes.relatorio_hora IS 'Hora do envio (0-23) em America/Bahia, não UTC';

-- 2) Log de envios + rastreabilidade de leitura -------------------------------

CREATE TABLE IF NOT EXISTS relatorio_envios (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id          UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  destinatario_nome   TEXT,
  destinatario_email  TEXT NOT NULL,
  periodo_inicio      DATE NOT NULL,
  periodo_fim         DATE NOT NULL,
  token               TEXT NOT NULL UNIQUE,
  metricas            JSONB,
  enviado_em          TIMESTAMPTZ,
  visto_em            TIMESTAMPTZ,
  visto_count         INTEGER NOT NULL DEFAULT 0,
  erro                TEXT,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE relatorio_envios IS 'Log de envio do relatório semanal. visto_em registra o clique no link tokenizado (consentido), não abertura por pixel.';
COMMENT ON COLUMN relatorio_envios.enviado_em IS 'NULL = falha no envio; ver coluna erro';

-- Um envio por destinatário por período (idempotência: se o cron rodar duas
-- vezes na mesma hora, o segundo insert falha em vez de duplicar e-mail)
CREATE UNIQUE INDEX IF NOT EXISTS idx_rel_envios_unico
  ON relatorio_envios (cliente_id, destinatario_email, periodo_inicio);

CREATE INDEX IF NOT EXISTS idx_rel_envios_cliente ON relatorio_envios (cliente_id, periodo_inicio DESC);
CREATE INDEX IF NOT EXISTS idx_rel_envios_token   ON relatorio_envios (token);

-- 3) RLS ---------------------------------------------------------------------
-- O cron e o endpoint de visualização usam service_role (bypassa RLS).
-- Estas policies servem ao painel: super_admin vê tudo, cliente vê o próprio.

ALTER TABLE relatorio_envios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rel_envios_select ON relatorio_envios;
CREATE POLICY rel_envios_select ON relatorio_envios
  FOR SELECT USING (public.is_super_admin() OR cliente_id = public.my_cliente_id());

-- ============================================
-- FIM DA MIGRATION
-- ============================================
