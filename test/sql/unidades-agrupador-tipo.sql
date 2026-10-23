-- Teste de sql/migration-unidades-agrupador-tipo.sql: unidades com agrupador
-- (bloco/torre/quadra), andar e tipo; unicidade por (cliente, bloco, nome).
-- Roda inteiro dentro de uma transação e termina em ROLLBACK: não deixa nada
-- no banco.
-- Uso: executar via MCP do Supabase (execute_sql). Sem branch, colar a
-- migration logo depois do `begin;` (mesma transação). Resultado esperado:
-- uma linha com resultado = 'ok'. Falha com exceção 'FALHOU: ...' em cada item.
-- Produção tinha 0 unidades em 23/10/2026; para exercitar "linhas antigas",
-- inserir antes da migration (logo depois do `begin;`) um cliente fictício
-- '00000000-0000-0000-0000-00000000cccc' com unidades só com nome.
begin;

-- ── Linhas que já existiam antes da migration ──────────────────────────────
do $$
declare
  n int;
begin
  select count(*) into n from unidades where tipo is distinct from 'apartamento';
  if n <> 0 then raise exception 'FALHOU: % unidades antigas sem tipo apartamento', n; end if;
  select count(*) into n from unidades where bloco is not null or andar is not null;
  if n <> 0 then raise exception 'FALHOU: % unidades antigas com bloco/andar preenchido', n; end if;
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'uq_unidades_cliente_nome') then
    raise exception 'FALHOU: índice antigo uq_unidades_cliente_nome continua no banco';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'uq_unidades_cliente_bloco_nome') then
    raise exception 'FALHOU: índice uq_unidades_cliente_bloco_nome ausente';
  end if;
end $$;

-- Dois clientes e um usuário fictício (admin do A)
insert into clientes (id, nome, local_via, cidade_uf, limite_velocidade) values
  ('00000000-0000-0000-0000-00000000aaaa', 'Teste Unidades A', 'Via Teste A', 'Cidade Teste/XX', 30),
  ('00000000-0000-0000-0000-00000000bbbb', 'Teste Unidades B', 'Via Teste B', 'Cidade Teste/XX', 30);
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'unidades-admin-a@teste.invalid');
insert into usuarios (auth_id, email, nome, role, cliente_id, ativo) values
  ('00000000-0000-0000-0000-0000000000a1', 'unidades-admin-a@teste.invalid', 'Admin A', 'admin_cliente',
   '00000000-0000-0000-0000-00000000aaaa', true);

-- ── Regras (executado como dono, papel do backend) ─────────────────────────
do $$
declare
  u unidades;
begin
  -- 1) Código atual (só nome): tipo apartamento, bloco e andar nulos.
  insert into unidades (id, cliente_id, nome)
  values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000aaaa', '101')
  returning * into u;
  if u.tipo is distinct from 'apartamento' then raise exception 'FALHOU: tipo padrão %', u.tipo; end if;
  if u.bloco is not null or u.andar is not null then raise exception 'FALHOU: bloco/andar não nulos por padrão'; end if;

  -- 2) Mesma unidade em blocos diferentes (e sem bloco): ok.
  insert into unidades (cliente_id, bloco, nome, andar, tipo) values
    ('00000000-0000-0000-0000-00000000aaaa', 'Bloco A', '101', '1', 'apartamento'),
    ('00000000-0000-0000-0000-00000000aaaa', 'Bloco B', '101', '1', 'apartamento');

  -- 3) Repetida no mesmo bloco, maiúsculas diferentes → 23505.
  begin
    insert into unidades (cliente_id, bloco, nome) values ('00000000-0000-0000-0000-00000000aaaa', 'bloco a', '101');
    raise exception 'FALHOU: aceitou unidade repetida no mesmo bloco (maiúsculas diferentes)';
  exception when unique_violation then null;
  end;
  begin
    insert into unidades (cliente_id, bloco, nome) values ('00000000-0000-0000-0000-00000000aaaa', 'Quadra 1', 'Lote 7'),
                                                          ('00000000-0000-0000-0000-00000000aaaa', 'QUADRA 1', 'lote 7');
    raise exception 'FALHOU: aceitou nome repetido no mesmo bloco (maiúsculas diferentes)';
  exception when unique_violation then null;
  end;

  -- 4) Sem bloco continua único por nome (comportamento antigo).
  begin
    insert into unidades (cliente_id, nome) values ('00000000-0000-0000-0000-00000000aaaa', 'Casa 10'),
                                                   ('00000000-0000-0000-0000-00000000aaaa', 'CASA 10');
    raise exception 'FALHOU: aceitou unidade repetida sem bloco';
  exception when unique_violation then null;
  end;

  -- 5) Mesmo bloco e nome em outro cliente: ok.
  insert into unidades (cliente_id, bloco, nome) values ('00000000-0000-0000-0000-00000000bbbb', 'Bloco A', '101');

  -- 6) Todos os tipos válidos.
  insert into unidades (cliente_id, nome, tipo) values
    ('00000000-0000-0000-0000-00000000bbbb', 'T1', 'apartamento'),
    ('00000000-0000-0000-0000-00000000bbbb', 'T2', 'casa'),
    ('00000000-0000-0000-0000-00000000bbbb', 'T3', 'sala'),
    ('00000000-0000-0000-0000-00000000bbbb', 'T4', 'loja'),
    ('00000000-0000-0000-0000-00000000bbbb', 'T5', 'lote'),
    ('00000000-0000-0000-0000-00000000bbbb', 'T6', 'fip');

  -- 7) Tipo inválido → 23514; tipo nulo → 23502.
  begin
    insert into unidades (cliente_id, nome, tipo) values ('00000000-0000-0000-0000-00000000aaaa', 'X1', 'cobertura');
    raise exception 'FALHOU: aceitou tipo inválido';
  exception when check_violation then null;
  end;
  begin
    insert into unidades (cliente_id, nome, tipo) values ('00000000-0000-0000-0000-00000000aaaa', 'X2', 'Casa');
    raise exception 'FALHOU: aceitou tipo com maiúscula (id é minúsculo)';
  exception when check_violation then null;
  end;
  begin
    insert into unidades (cliente_id, nome, tipo) values ('00000000-0000-0000-0000-00000000aaaa', 'X3', null);
    raise exception 'FALHOU: aceitou tipo nulo';
  exception when not_null_violation then null;
  end;

  -- 8) Bloco/andar vazios ou longos → 23514.
  begin
    insert into unidades (cliente_id, bloco, nome) values ('00000000-0000-0000-0000-00000000aaaa', '   ', 'X4');
    raise exception 'FALHOU: aceitou bloco em branco';
  exception when check_violation then null;
  end;
  begin
    insert into unidades (cliente_id, bloco, nome) values ('00000000-0000-0000-0000-00000000aaaa', repeat('b', 41), 'X5');
    raise exception 'FALHOU: aceitou bloco com 41 caracteres';
  exception when check_violation then null;
  end;
  insert into unidades (cliente_id, bloco, nome) values ('00000000-0000-0000-0000-00000000aaaa', repeat('b', 40), 'X6');
  begin
    insert into unidades (cliente_id, nome, andar) values ('00000000-0000-0000-0000-00000000aaaa', 'X7', '');
    raise exception 'FALHOU: aceitou andar vazio';
  exception when check_violation then null;
  end;
  begin
    insert into unidades (cliente_id, nome, andar) values ('00000000-0000-0000-0000-00000000aaaa', 'X8', repeat('9', 11));
    raise exception 'FALHOU: aceitou andar com 11 caracteres';
  exception when check_violation then null;
  end;
  insert into unidades (cliente_id, nome, andar) values ('00000000-0000-0000-0000-00000000aaaa', 'X9', 'Térreo');
end $$;

-- ── Como admin_cliente do A (navegador) ────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

do $$
declare
  n int;
begin
  -- lê as colunas novas, só do próprio cliente
  select count(*) into n from (select id, cliente_id, bloco, nome, andar, tipo, ordem, ativo from unidades) x;
  if n <> 5 then raise exception 'FALHOU: admin_cliente lê % unidades (esperado 5, só do A)', n; end if;
  select count(*) into n from unidades where bloco = 'Bloco A' and nome = '101' and andar = '1' and tipo = 'apartamento';
  if n <> 1 then raise exception 'FALHOU: admin_cliente não lê bloco/andar/tipo (% linhas)', n; end if;

  begin
    insert into unidades (cliente_id, bloco, nome, tipo) values ('00000000-0000-0000-0000-00000000aaaa', 'Bloco C', '101', 'casa');
    raise exception 'FALHOU: admin_cliente inseriu em unidades';
  exception when insufficient_privilege then null;
  end;
  begin
    update unidades set tipo = 'casa', bloco = 'Bloco Z', andar = '9';
    raise exception 'FALHOU: admin_cliente alterou unidades';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

select 'ok' as resultado;

rollback;
