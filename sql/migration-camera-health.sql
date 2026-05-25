-- Manutenção de câmeras: capturar passivamente dados do heartbeat ALPHADIGI
-- e do header HTTP da request, sem precisar mexer na câmera.
--
-- Lição aprendida em 25/05/2026: 5 das 7 câmeras ficaram silenciadas porque
-- estavam apontadas para protector-lombada.vercel.app (raw .vercel.app exige
-- SNI; ALPHADIGI não envia). Solução foi reapontar todas pra lombada.appps.com.br.
-- Pra detectar regressão futura, salvamos o Host header de cada request.

ALTER TABLE public.cameras
  ADD COLUMN IF NOT EXISTS endpoint_configurado text,
  ADD COLUMN IF NOT EXISTS host_camera_reportado text,
  ADD COLUMN IF NOT EXISTS uptime_start_ts text,
  ADD COLUMN IF NOT EXISTS ultimo_outage_reportado text,
  ADD COLUMN IF NOT EXISTS heartbeat_countid integer,
  ADD COLUMN IF NOT EXISTS firmware_versao text;

COMMENT ON COLUMN public.cameras.endpoint_configurado IS
  'Hostname (req.headers.host) que a câmera está usando para enviar dados. Útil para flagar câmeras configuradas em endpoint legado (.vercel.app exige SNI que ALPHADIGI não envia).';
COMMENT ON COLUMN public.cameras.host_camera_reportado IS
  'IP/host que a própria câmera reporta no payload heartbeat (campo host). Pode diferir do IP de rede visto pelo NAT.';
COMMENT ON COLUMN public.cameras.uptime_start_ts IS
  'startTs do payload heartbeat (formato raw da câmera, ex: "2026-05-25 17:32:33"). Salvo como text por TZ ambíguo do firmware.';
COMMENT ON COLUMN public.cameras.ultimo_outage_reportado IS
  'outageTs do payload heartbeat (formato raw da câmera). Último momento em que a câmera detectou perda de conexão. Text por TZ ambíguo.';
COMMENT ON COLUMN public.cameras.heartbeat_countid IS
  'countid do payload heartbeat — contador incremental. Gap > 1 indica heartbeat perdido.';
COMMENT ON COLUMN public.cameras.firmware_versao IS
  'Versão do software/firmware da câmera (manual ou via futuro endpoint da câmera).';
