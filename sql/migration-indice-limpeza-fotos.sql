-- Índice parcial para a limpeza de fotos (api/cron-limpeza.js).
--
-- A busca "foto_path is not null and timestamp < corte" varria a tabela
-- inteira (420 mil linhas, 159 MB) e, com cache frio às 06:00 UTC, estourava
-- o statement_timeout do PostgREST: as fotos de 05–07/10/2026 passaram dos
-- 15 dias da política LGPD. Só as passagens com foto (~15 dias) entram aqui.
create index if not exists idx_capturas_foto_timestamp
  on public.capturas ("timestamp")
  where foto_path is not null;
