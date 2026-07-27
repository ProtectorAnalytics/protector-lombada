-- ============================================
-- MIGRATION: distingue "leitura inválida" de "veículo devagar"
-- ============================================
--
-- Contexto: dois ajustes corretos isoladamente colidiam quando juntos.
--
--   O PR #33 zera a velocidade quando o radar reporta valor acima do teto
--   plausível do cliente (observado em produção: 180 e 351 km/h em rajada na
--   mesma placa, provável reflexo). Isso impede a notificação falsa — está
--   certo. O `velocidade = 0` fazia a captura aparecer como "SEM RADAR" no
--   dashboard, que era a única semântica do zero na época.
--
--   O PR #36 (relatório semanal) passou a ler `velocidade = 0` como
--   "veículo passou abaixo de 10 km/h", que é o piso de coleta do doppler
--   ASV5300 (manual ALPHADIGI, seção 11) — ou seja, condutor em velocidade
--   de segurança, que CONTA COMO CONFORMIDADE.
--
--   Juntos: uma leitura espúria de 351 km/h viraria 0 e seria contabilizada
--   como motorista exemplar no indicador de conformidade do relatório e do
--   PDF enviado ao síndico.
--
-- Solução: o zero continua (preserva o comportamento do dashboard e o que o
-- #33 validou contra payloads reais), mas ganha um discriminador. A coluna
-- abaixo separa as duas origens do zero:
--
--   velocidade_invalida = false → zero legítimo: veículo abaixo de 10 km/h.
--                                 Conta como conformidade, fica fora da média.
--   velocidade_invalida = true  → leitura descartada pelo sanity-cap.
--                                 Sai de TODOS os indicadores.
--
-- A captura em si nunca é descartada — ela também é registro de passagem
-- (rastreabilidade). O que muda é apenas o que entra em cada indicador.
-- A velocidade bruta rejeitada fica registrada no debug_log pelo captura.js.
-- ============================================

-- 1) Teto plausível por cliente (vinha do PR #33, nunca aplicado) -------------

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS velocidade_maxima_plausivel integer NOT NULL DEFAULT 80;

COMMENT ON COLUMN public.clientes.velocidade_maxima_plausivel IS
  'Teto de sanidade do radar: leituras acima deste valor (km/h) sao tratadas como invalidas (SEM RADAR) e nao geram alerta. Default 80 para vias internas de condominio — maximo real legitimo observado na base: 56 km/h.';

-- 2) Discriminador na captura -------------------------------------------------

ALTER TABLE public.capturas
  ADD COLUMN IF NOT EXISTS velocidade_invalida BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.capturas.velocidade_invalida IS
  'true = leitura de radar rejeitada pelo sanity-cap (acima de clientes.velocidade_maxima_plausivel). Distingue do zero legitimo, que significa veiculo abaixo de 10 km/h (piso do doppler) e conta como conformidade.';

-- Índice parcial: as inválidas são raras (228 em 314 mil na base atual), então
-- um índice só sobre elas é pequeno e serve aos filtros do relatório.
CREATE INDEX IF NOT EXISTS idx_capturas_vel_invalida
  ON public.capturas (cliente_id, timestamp DESC)
  WHERE velocidade_invalida;

-- 3) Retroativo ---------------------------------------------------------------
-- As capturas já gravadas com velocidade acima do teto do cliente foram
-- notificadas na época (o sanity-cap não existia) e continuam no histórico.
-- Marcá-las agora tira o número espúrio dos relatórios retroativos sem apagar
-- o registro.

UPDATE public.capturas c
SET velocidade_invalida = true
FROM public.clientes cl
WHERE cl.id = c.cliente_id
  AND c.velocidade > cl.velocidade_maxima_plausivel
  AND NOT c.velocidade_invalida;

-- ============================================
-- FIM DA MIGRATION
-- ============================================
