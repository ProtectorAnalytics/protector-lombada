-- Migration: vehicle_id para deduplicar retransmissões da câmera
--
-- Motivação: a câmera ALPHADIGI TCAM3130N opera com timeout de 10s e
-- retransmissão automática (intervalo 2s, tempo total 100s). Quando o endpoint
-- demora mais que o timeout, ela reenvia O MESMO evento — mesma foto, byte a
-- byte. Medido em produção antes da remoção do blur: 91,2% das capturas da
-- CEC-LOMB01 eram reenvio, com 8 cópias por rajada (100s / 12s) e até 120
-- cópias do mesmo veículo. Isso gerou 18 GB de fotos duplicadas no Storage.
--
-- O payload AlarmInfoPlate traz `result.PlateResult.vehicleId`, identificador
-- único do evento de captura na câmera. Todas as retransmissões carregam o
-- mesmo valor, o que permite dedupe EXATO — sem heurística de janela de tempo
-- comparando placa e horário.
--
-- Por que não um índice UNIQUE em (camera_id, vehicle_id): o vehicleId é um
-- contador interno da câmera e reinicia no boot dela (mesmo comportamento do
-- heartbeat countid). Uma trava rígida rejeitaria captura legítima depois de um
-- reinício. O dedupe em api/captura.js usa este índice para consultar apenas
-- uma janela curta (minutos), bem acima dos 100s de retransmissão e bem abaixo
-- do intervalo em que o contador poderia dar a volta.

ALTER TABLE public.capturas
  ADD COLUMN IF NOT EXISTS vehicle_id bigint;

COMMENT ON COLUMN public.capturas.vehicle_id IS
  'Identificador do evento de captura na câmera (AlarmInfoPlate.result.PlateResult.vehicleId). Usado para descartar retransmissões do mesmo evento. Nulo em capturas anteriores a esta migration e em payloads sem o campo.';

-- Índice para o lookup do dedupe: (camera_id, vehicle_id) restrito a uma janela
-- recente de timestamp. Parcial em vehicle_id NOT NULL para não indexar o
-- histórico anterior à migration.
CREATE INDEX IF NOT EXISTS idx_capturas_dedupe_vehicle
  ON public.capturas (camera_id, vehicle_id, "timestamp" DESC)
  WHERE vehicle_id IS NOT NULL;
