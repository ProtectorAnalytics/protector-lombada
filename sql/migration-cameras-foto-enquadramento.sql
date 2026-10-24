-- v1.15.2: enquadramento da foto por câmera nas "Últimas passagens".
-- Cada câmera ALPHADIGI enquadra a pista de um jeito; o carro aparece em
-- alturas diferentes da imagem. foto_enquadramento guarda o recorte (zoom e
-- origem em %) da miniatura e do destaque:
--   {"mini": {"zoom": 2.2, "x": 45, "y": 14}, "destaque": {"zoom": 1.6, "x": 42, "y": 18}}
-- Nulo = padrão do painel (site/js/painel-visual.js, RECORTE_PADRAO).
-- O painel lê com a sessão do usuário: a coluna precisa do grant de SELECT
-- (a tabela usa grants por coluna; o token da câmera continua sem grant).
alter table public.cameras add column if not exists foto_enquadramento jsonb;

alter table public.cameras drop constraint if exists cameras_foto_enquadramento_objeto;
alter table public.cameras add constraint cameras_foto_enquadramento_objeto
  check (foto_enquadramento is null or jsonb_typeof(foto_enquadramento) = 'object');

grant select (foto_enquadramento) on public.cameras to authenticated;
