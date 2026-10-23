-- Teste da v1.14.0: primeiras_passagens_por_dia() (sql/migration-v1140-…).
-- Roda inteiro numa transação e termina em ROLLBACK: não deixa nada no banco.
-- Antes da migration aplicada, cole o corpo dela logo depois do BEGIN.
-- Uso: executar via MCP do Supabase (execute_sql). Resultado esperado: uma
-- linha com ok = true. Qualquer divergência falha com exceção 'FALHOU: ...'.
begin;

insert into clientes (id, nome, local_via, cidade_uf, limite_velocidade) values
  ('00000000-0000-0000-0000-00000000c1aa', 'Teste v1140 A', 'Via A', 'Cidade/XX', 30),
  ('00000000-0000-0000-0000-00000000c1bb', 'Teste v1140 B', 'Via B', 'Cidade/XX', 30);
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000001a1', 'v1140-a@teste.invalid');
insert into usuarios (auth_id, email, nome, role, cliente_id, ativo) values
  ('00000000-0000-0000-0000-0000000001a1', 'v1140-a@teste.invalid', 'Síndico A', 'admin_cliente',
   '00000000-0000-0000-0000-00000000c1aa', true);
insert into cameras (id, cliente_id, nome, token) values
  ('00000000-0000-0000-0000-00000000c1c1', '00000000-0000-0000-0000-00000000c1aa', 'Cam A1', 'token-v1140-a1'),
  ('00000000-0000-0000-0000-00000000c1c2', '00000000-0000-0000-0000-00000000c1aa', 'Cam A2', 'token-v1140-a2'),
  ('00000000-0000-0000-0000-00000000c1c3', '00000000-0000-0000-0000-00000000c1bb', 'Cam B', 'token-v1140-b');

-- Cliente A, dia 10/10/2030 em São Paulo (03:00Z a 03:00Z do dia seguinte):
--   TST9A01 passa 3x (2 radares, uma na grafia antiga TST9001): 1 veículo, 3 passagens, primeira 10:00Z
--   tst-9b02 (grafia suja) 1x; SEM PLACA 2x → fora
--   TST9C03 às 02:59Z do dia 11 → ainda é 10/10 em São Paulo
-- Dia 11/10: TST9A01 1x às 03:00Z
-- Cliente B: TST9F06 → nunca aparece para o A
insert into capturas (camera_id, cliente_id, placa, velocidade, timestamp) values
  ('00000000-0000-0000-0000-00000000c1c1', '00000000-0000-0000-0000-00000000c1aa', 'TST9A01', 20, '2030-10-10T12:00:00Z'),
  ('00000000-0000-0000-0000-00000000c1c2', '00000000-0000-0000-0000-00000000c1aa', 'TST9001', 25, '2030-10-10T10:00:00Z'),
  ('00000000-0000-0000-0000-00000000c1c1', '00000000-0000-0000-0000-00000000c1aa', 'TST9A01', 22, '2030-10-10T15:00:00Z'),
  ('00000000-0000-0000-0000-00000000c1c1', '00000000-0000-0000-0000-00000000c1aa', 'tst-9b02', 18, '2030-10-10T11:00:00Z'),
  ('00000000-0000-0000-0000-00000000c1c1', '00000000-0000-0000-0000-00000000c1aa', 'SEM PLACA', 0, '2030-10-10T11:30:00Z'),
  ('00000000-0000-0000-0000-00000000c1c1', '00000000-0000-0000-0000-00000000c1aa', 'SEM PLACA', 0, '2030-10-10T11:31:00Z'),
  ('00000000-0000-0000-0000-00000000c1c1', '00000000-0000-0000-0000-00000000c1aa', 'TST9C03', 30, '2030-10-11T02:59:00Z'),
  ('00000000-0000-0000-0000-00000000c1c1', '00000000-0000-0000-0000-00000000c1aa', 'TST9A01', 30, '2030-10-11T03:00:00Z'),
  ('00000000-0000-0000-0000-00000000c1c3', '00000000-0000-0000-0000-00000000c1bb', 'TST9F06', 30, '2030-10-10T12:00:00Z');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000001a1","role":"authenticated"}', true);

do $$
declare
  r text;
  n int;
begin
  select string_agg(dia || ' ' || placa || ' ' || to_char(primeira at time zone 'UTC', 'HH24:MI') || ' ' || passagens, ',' order by dia, placa)
    into r from primeiras_passagens_por_dia('00000000-0000-0000-0000-00000000c1aa', '2030-10-10T03:00:00Z', '2030-10-12T03:00:00Z');
  if r is distinct from '2030-10-10 TST9A01 10:00 3,2030-10-10 TST9B02 11:00 1,2030-10-10 TST9C03 02:59 1,2030-10-11 TST9A01 03:00 1' then
    raise exception 'FALHOU: primeiras do A = %', r;
  end if;

  select count(*) into n from primeiras_passagens_por_dia('00000000-0000-0000-0000-00000000c1bb', '2030-10-10T03:00:00Z', '2030-10-12T03:00:00Z');
  if n <> 0 then raise exception 'FALHOU: síndico do A viu % linha(s) do B', n; end if;

  select count(*) into n from primeiras_passagens_por_dia('00000000-0000-0000-0000-00000000c1aa', '2030-08-01T03:00:00Z', '2030-10-12T03:00:00Z');
  if n <> 0 then raise exception 'FALHOU: janela acima de 32 dias devolveu %', n; end if;
end $$;

reset role;
set local role anon;
do $$
begin
  begin
    perform primeiras_passagens_por_dia('00000000-0000-0000-0000-00000000c1aa', '2030-10-10T03:00:00Z', '2030-10-12T03:00:00Z');
    raise exception 'FALHOU: anon executou primeiras_passagens_por_dia';
  exception when insufficient_privilege then null;
  end;
end $$;

select true as ok;

rollback;
