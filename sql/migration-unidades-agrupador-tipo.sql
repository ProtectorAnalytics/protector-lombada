-- Módulo Portaria 2.1 — unidades com agrupador, andar e tipo.
--
-- 1. bloco: agrupador opcional de nome livre (Bloco/Torre/Quadra), 1–40.
-- 2. andar: opcional, texto livre curto (1–10), ex.: '1', 'Térreo'.
-- 3. tipo: apartamento | casa | sala | loja | lote | fip; padrão apartamento.
-- 4. Unicidade passa de (cliente, nome) para (cliente, bloco, nome), sem
--    diferenciar maiúsculas; sem bloco equivale a bloco vazio, então quem não
--    usa agrupador mantém a regra antiga.
--
-- Aditiva: linhas existentes ficam tipo 'apartamento', bloco e andar nulos;
-- o código atual (insert só com nome) continua funcionando. RLS e grants não
-- mudam: authenticated tem SELECT na tabela inteira (colunas novas legíveis)
-- e segue sem INSERT/UPDATE/DELETE (escrita só pela API, service_role).
--
-- Aplicar via MCP do Supabase (apply_migration, nome unidades_agrupador_tipo)
-- só depois da revisão. Teste: test/sql/unidades-agrupador-tipo.sql.

alter table public.unidades
  add column if not exists bloco text null
    check (bloco is null or length(trim(bloco)) between 1 and 40),
  add column if not exists andar text null
    check (andar is null or length(trim(andar)) between 1 and 10),
  add column if not exists tipo text not null default 'apartamento'
    check (tipo in ('apartamento', 'casa', 'sala', 'loja', 'lote', 'fip'));

drop index if exists public.uq_unidades_cliente_nome;
create unique index if not exists uq_unidades_cliente_bloco_nome
  on public.unidades (cliente_id, lower(coalesce(bloco, '')), lower(nome));
