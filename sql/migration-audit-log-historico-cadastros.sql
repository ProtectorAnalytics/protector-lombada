-- Histórico de alterações dos cadastros de placa (v1.12.0)
-- GET /api/admin/historico-cadastros lê o audit_log filtrando
--   tabela = 'veiculos' and detalhes->>'cliente_id' = $1
--   order by criado_em desc, id desc
-- Índice parcial só das linhas de veículos, por condomínio e data.
-- Aditivo (não apaga nem altera dados). Reverter: drop index if exists public.idx_audit_veiculos_cliente_criado;

create index if not exists idx_audit_veiculos_cliente_criado
  on public.audit_log ((detalhes->>'cliente_id'), criado_em desc)
  where tabela = 'veiculos';
