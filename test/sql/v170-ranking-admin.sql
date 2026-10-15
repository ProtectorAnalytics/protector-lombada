-- Teste da v1.7.0: maiores_velocidades(), veiculos_base_do_cliente() e
-- audit_log sem INSERT público. Roda inteiro numa transação e termina em
-- ROLLBACK: não deixa nada no banco.
-- Uso: executar via MCP do Supabase (execute_sql). Resultado esperado: uma
-- linha com ok = true. Qualquer divergência falha com exceção 'FALHOU: ...'.
begin;

insert into clientes (id, nome, local_via, cidade_uf, limite_velocidade) values
  ('00000000-0000-0000-0000-00000000aaaa', 'Teste v170 A', 'Via A', 'Cidade/XX', 30),
  ('00000000-0000-0000-0000-00000000bbbb', 'Teste v170 B', 'Via B', 'Cidade/XX', 30);
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'v170-a@teste.invalid'),
  ('00000000-0000-0000-0000-0000000000ad', 'v170-adm@teste.invalid');
insert into usuarios (auth_id, email, nome, role, cliente_id, ativo) values
  ('00000000-0000-0000-0000-0000000000a1', 'v170-a@teste.invalid', 'Síndico A', 'admin_cliente',
   '00000000-0000-0000-0000-00000000aaaa', true),
  ('00000000-0000-0000-0000-0000000000ad', 'v170-adm@teste.invalid', 'Equipe', 'super_admin', null, true);
insert into cameras (id, cliente_id, nome, token) values
  ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-00000000aaaa', 'Cam A', 'token-v170-a'),
  ('00000000-0000-0000-0000-00000000ca02', '00000000-0000-0000-0000-00000000bbbb', 'Cam B', 'token-v170-b');

-- Cliente A:
--   ZZZ9A01 passou 3x (40, 55, 30): vale a maior, 55
--   ZZZ9001 é a grafia antiga de ZZZ9A01: mesmo carro, a 50 → não ganha linha própria
--   ZZZ9B02 a 45; ZZZ9C03 a 90 com velocidade_invalida → fora
--   SEM PLACA a 99 → fora; ZZZ9D04 a 80 mas suspeita na base → fora
--   ZZZ9E05 a 70 há 200 dias → fora da janela de 180
-- Cliente B: ZZZ9F06 a 99 → nunca aparece para o A
insert into capturas (camera_id, cliente_id, placa, velocidade, velocidade_invalida, timestamp) values
  ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-00000000aaaa', 'ZZZ9A01', 40, false, now() - interval '1 day'),
  ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-00000000aaaa', 'ZZZ9A01', 55, false, now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-00000000aaaa', 'ZZZ9A01', 30, false, now() - interval '3 days'),
  ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-00000000aaaa', 'ZZZ9001', 50, false, now() - interval '4 days'),
  ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-00000000aaaa', 'ZZZ9B02', 45, false, now() - interval '1 day'),
  ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-00000000aaaa', 'ZZZ9C03', 90, true,  now() - interval '1 day'),
  ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-00000000aaaa', 'SEM PLACA', 99, false, now() - interval '1 day'),
  ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-00000000aaaa', 'ZZZ9D04', 80, false, now() - interval '1 day'),
  ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-00000000aaaa', 'ZZZ9E05', 70, false, now() - interval '200 days'),
  ('00000000-0000-0000-0000-00000000ca02', '00000000-0000-0000-0000-00000000bbbb', 'ZZZ9F06', 99, false, now() - interval '1 day');
insert into veiculos_base (placa, placa_antiga, status) values
  ('ZZZ9A01', 'ZZZ9001', 'consultado'),
  ('ZZZ9B02', 'ZZZ9102', 'consultado'),
  ('ZZZ9D04', 'ZZZ9304', 'suspeita'),
  ('ZZZ9F06', 'ZZZ9506', 'consultado');

-- ---------- Como o síndico do A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

do $$
declare
  r text;
  n int;
begin
  select string_agg(placa || ':' || velocidade, ',' order by velocidade desc) into r
    from maiores_velocidades('00000000-0000-0000-0000-00000000aaaa', now() - interval '180 days', 10);
  if r is distinct from 'ZZZ9A01:55,ZZZ9B02:45' then
    raise exception 'FALHOU: ranking do A = %', r;
  end if;

  select count(*) into n from maiores_velocidades('00000000-0000-0000-0000-00000000bbbb', now() - interval '180 days', 10);
  if n <> 0 then raise exception 'FALHOU: síndico do A viu % linha(s) do ranking do B', n; end if;

  select count(*) into n from maiores_velocidades('00000000-0000-0000-0000-00000000aaaa', now() - interval '180 days', 1);
  if n <> 1 then raise exception 'FALHOU: limite 1 devolveu %', n; end if;

  select string_agg(placa, ',' order by placa) into r
    from veiculos_base_do_cliente('00000000-0000-0000-0000-00000000aaaa');
  if r is distinct from 'ZZZ9A01,ZZZ9B02,ZZZ9D04' then
    raise exception 'FALHOU: base do A = %', r;
  end if;

  select count(*) into n from veiculos_base_do_cliente('00000000-0000-0000-0000-00000000bbbb');
  if n <> 0 then raise exception 'FALHOU: síndico do A viu % veículo(s) da base do B', n; end if;

  -- audit_log: ninguém de fora do servidor grava trilha
  begin
    insert into audit_log (acao, tabela) values ('forjado', 'teste');
    raise exception 'FALHOU: authenticated inseriu em audit_log';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- Como a equipe Protector (super_admin, sem cliente próprio)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ad","role":"authenticated"}', true);

do $$
declare
  r text;
begin
  select string_agg(placa || ':' || velocidade, ',' order by velocidade desc) into r
    from maiores_velocidades('00000000-0000-0000-0000-00000000bbbb', now() - interval '180 days', 10);
  if r is distinct from 'ZZZ9F06:99' then raise exception 'FALHOU: admin no B = %', r; end if;

  select string_agg(placa, ',' order by placa) into r
    from veiculos_base_do_cliente('00000000-0000-0000-0000-00000000bbbb');
  if r is distinct from 'ZZZ9F06' then raise exception 'FALHOU: base do B para o admin = %', r; end if;
end $$;

-- ---------- Anônimo não executa as funções
reset role;
set local role anon;
do $$
begin
  begin
    perform maiores_velocidades('00000000-0000-0000-0000-00000000aaaa', now() - interval '180 days', 10);
    raise exception 'FALHOU: anon executou maiores_velocidades';
  exception when insufficient_privilege then null;
  end;
end $$;

select true as ok;

rollback;
