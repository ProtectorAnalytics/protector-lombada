-- Teste de sql/migration-usuarios-avisos-email.sql: opções de e-mail por
-- usuário (recebe_alertas/recebe_relatorio), tipo 'so_email' ("Só recebe
-- e-mail", sem login) e cópia de email_destinatarios para usuarios.
-- Roda inteiro dentro de uma transação e termina em ROLLBACK: não deixa nada
-- no banco. Dados fictícios (domínio exemplo.com), nada real.
-- Uso: executar via MCP do Supabase (execute_sql). Colar a migration inteira
-- nos TRÊS pontos marcados abaixo (mesma transação): a 1ª migra as linhas
-- semeadas; a 2ª prova que rodar de novo não muda contagens; a 3ª, que não
-- desliga opção ligada depois.
-- Resultado esperado: uma linha com resultado = 'ok'. Falha com exceção
-- 'FALHOU: ...' em cada item. Sem a migration, falha (coluna inexistente).
-- As comparações de conjunto valem para TODOS os clientes (inclusive os reais
-- dentro da transação), não só os fictícios.
begin;

-- ── Semente (antes da migration) ───────────────────────────────────────────
insert into clientes (id, nome, local_via, cidade_uf) values
  ('00000000-0000-0000-0000-00000000e0a0', 'Teste Avisos A', 'Via Teste A', 'Cidade Teste/XX'),
  ('00000000-0000-0000-0000-00000000e0b0', 'Teste Avisos B', 'Via Teste B', 'Cidade Teste/XX');
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000e0a1', 'sindico.a@exemplo.com'),
  ('00000000-0000-0000-0000-00000000e0b1', 'op.b@exemplo.com'),
  ('00000000-0000-0000-0000-00000000e0b2', 'antigo.b@exemplo.com'),
  ('00000000-0000-0000-0000-00000000e0c1', 'super.teste@exemplo.com'),
  ('00000000-0000-0000-0000-00000000e0d1', 'sobra@exemplo.com');
insert into usuarios (auth_id, email, nome, role, cliente_id, ativo) values
  ('00000000-0000-0000-0000-00000000e0a1', 'Sindico.A@Exemplo.com', 'Síndico A', 'admin_cliente',
   '00000000-0000-0000-0000-00000000e0a0', true),
  ('00000000-0000-0000-0000-00000000e0b1', 'op.b@exemplo.com', 'Operador B', 'operador',
   '00000000-0000-0000-0000-00000000e0b0', true),
  ('00000000-0000-0000-0000-00000000e0b2', 'antigo.b@exemplo.com', 'Antigo B', 'admin_cliente',
   '00000000-0000-0000-0000-00000000e0b0', false),
  ('00000000-0000-0000-0000-00000000e0c1', 'super.teste@exemplo.com', 'Super Teste', 'super_admin',
   null, true);
insert into email_destinatarios (cliente_id, nome, email, tipo, ativo) values
  -- A: e-mail do síndico com maiúsculas/espaços diferentes → liga opção nele
  ('00000000-0000-0000-0000-00000000e0a0', 'Síndico', '  SINDICO.a@exemplo.com ', 'alerta', true),
  -- A: todos + alerta repetido com maiúscula → um só so_email, as duas opções
  ('00000000-0000-0000-0000-00000000e0a0', 'Todos', 'todos.a@exemplo.com', 'todos', true),
  ('00000000-0000-0000-0000-00000000e0a0', 'Todos 2', 'Todos.A@exemplo.com', 'alerta', true),
  ('00000000-0000-0000-0000-00000000e0a0', 'Relatório', 'rel@exemplo.com', 'relatorio', true),
  -- A: inativo → não recebe, não vira usuário
  ('00000000-0000-0000-0000-00000000e0a0', 'Inativo', 'inativo.a@exemplo.com', 'alerta', false),
  -- A: e-mail de super_admin (cliente nulo) → so_email do A; super não ganha opção
  ('00000000-0000-0000-0000-00000000e0a0', 'Super', 'super.teste@exemplo.com', 'relatorio', true),
  -- A: e-mail de usuário do cliente B → so_email do A; operador B não ganha alerta
  ('00000000-0000-0000-0000-00000000e0a0', 'Op B em A', 'op.b@exemplo.com', 'alerta', true),
  -- B: e-mail do operador B → liga relatório nele
  ('00000000-0000-0000-0000-00000000e0b0', 'Op B', 'op.b@exemplo.com', 'relatorio', true),
  -- B: mesmo e-mail de destinatário do A → so_email separado no B
  ('00000000-0000-0000-0000-00000000e0b0', 'Rel B', 'rel@exemplo.com', 'todos', true),
  -- B: e-mail de admin INATIVO do mesmo cliente → so_email (senão deixaria de receber)
  ('00000000-0000-0000-0000-00000000e0b0', 'Antigo', 'antigo.b@exemplo.com', 'alerta', true);

-- ── 1ª execução ────────────────────────────────────────────────────────────
-- >>> colar aqui sql/migration-usuarios-avisos-email.sql <<<

create temp table _snap on commit drop as
  select count(*) as total,
         count(*) filter (where recebe_alertas) as alertas,
         count(*) filter (where recebe_relatorio) as relatorios,
         count(*) filter (where role = 'so_email') as so_email
  from usuarios;

-- ── 2ª execução (idempotência) ─────────────────────────────────────────────
-- >>> colar aqui sql/migration-usuarios-avisos-email.sql <<<

do $$
declare
  n int;
  u usuarios;
begin
  -- 1) Segunda execução não muda contagens.
  select count(*) into n from _snap s, (
    select count(*) as total,
           count(*) filter (where recebe_alertas) as alertas,
           count(*) filter (where recebe_relatorio) as relatorios,
           count(*) filter (where role = 'so_email') as so_email
    from usuarios) x
  where (s.total, s.alertas, s.relatorios, s.so_email) = (x.total, x.alertas, x.relatorios, x.so_email);
  if n <> 1 then raise exception 'FALHOU: segunda execução mudou as contagens'; end if;

  -- 2) Por cliente, conjunto novo (usuarios) = conjunto antigo (email_destinatarios ativo).
  select count(*) into n from (
    (select cliente_id, lower(trim(email)) e from email_destinatarios
      where ativo is true and tipo in ('alerta', 'todos')
     except
     select cliente_id, lower(trim(email)) from usuarios
      where cliente_id is not null and ativo is true and recebe_alertas
        and lower(trim(email)) not like '%@porteiro.invalid')
    union all
    (select cliente_id, lower(trim(email)) from usuarios
      where cliente_id is not null and ativo is true and recebe_alertas
        and lower(trim(email)) not like '%@porteiro.invalid'
     except
     select cliente_id, lower(trim(email)) from email_destinatarios
      where ativo is true and tipo in ('alerta', 'todos'))) d;
  if n <> 0 then raise exception 'FALHOU: % diferenças no conjunto de alertas', n; end if;

  select count(*) into n from (
    (select cliente_id, lower(trim(email)) e from email_destinatarios
      where ativo is true and tipo in ('relatorio', 'todos')
     except
     select cliente_id, lower(trim(email)) from usuarios
      where cliente_id is not null and ativo is true and recebe_relatorio
        and lower(trim(email)) not like '%@porteiro.invalid')
    union all
    (select cliente_id, lower(trim(email)) from usuarios
      where cliente_id is not null and ativo is true and recebe_relatorio
        and lower(trim(email)) not like '%@porteiro.invalid'
     except
     select cliente_id, lower(trim(email)) from email_destinatarios
      where ativo is true and tipo in ('relatorio', 'todos'))) d;
  if n <> 0 then raise exception 'FALHOU: % diferenças no conjunto de relatório', n; end if;

  -- 3) Casos específicos.
  select * into u from usuarios where auth_id = '00000000-0000-0000-0000-00000000e0a1';
  if not (u.recebe_alertas and not u.recebe_relatorio and u.role = 'admin_cliente') then
    raise exception 'FALHOU: síndico A (alertas=%, relatorio=%, role=%)', u.recebe_alertas, u.recebe_relatorio, u.role;
  end if;
  select count(*) into n from usuarios
   where cliente_id = '00000000-0000-0000-0000-00000000e0a0' and lower(email) like 'sindico.a@%';
  if n <> 1 then raise exception 'FALHOU: síndico A duplicado como so_email (% linhas)', n; end if;

  select count(*) into n from usuarios
   where role = 'so_email' and cliente_id = '00000000-0000-0000-0000-00000000e0a0'
     and email = 'todos.a@exemplo.com' and recebe_alertas and recebe_relatorio and ativo
     and auth_id is null and nome = 'Todos';
  if n <> 1 then raise exception 'FALHOU: todos.a não virou um só so_email com as duas opções'; end if;

  select count(*) into n from usuarios where lower(email) = 'inativo.a@exemplo.com';
  if n <> 0 then raise exception 'FALHOU: destinatário inativo virou usuário'; end if;

  select * into u from usuarios where auth_id = '00000000-0000-0000-0000-00000000e0c1';
  if u.recebe_alertas or u.recebe_relatorio or u.cliente_id is not null then
    raise exception 'FALHOU: super_admin ganhou opção ou cliente';
  end if;
  select count(*) into n from usuarios
   where role = 'so_email' and cliente_id = '00000000-0000-0000-0000-00000000e0a0'
     and email = 'super.teste@exemplo.com' and recebe_relatorio and not recebe_alertas;
  if n <> 1 then raise exception 'FALHOU: e-mail do super_admin não virou so_email do A'; end if;

  select * into u from usuarios where auth_id = '00000000-0000-0000-0000-00000000e0b1';
  if u.recebe_alertas or not u.recebe_relatorio then
    raise exception 'FALHOU: operador B (alertas=%, relatorio=%)', u.recebe_alertas, u.recebe_relatorio;
  end if;
  select count(*) into n from usuarios
   where role = 'so_email' and cliente_id = '00000000-0000-0000-0000-00000000e0a0'
     and email = 'op.b@exemplo.com' and recebe_alertas and not recebe_relatorio;
  if n <> 1 then raise exception 'FALHOU: e-mail do operador B não virou so_email do A'; end if;

  select count(*) into n from usuarios
   where role = 'so_email' and email = 'rel@exemplo.com';
  if n <> 2 then raise exception 'FALHOU: rel@ deveria ser so_email em A e em B (% linhas)', n; end if;

  select * into u from usuarios where auth_id = '00000000-0000-0000-0000-00000000e0b2';
  if u.recebe_alertas or u.recebe_relatorio then raise exception 'FALHOU: admin inativo ganhou opção'; end if;
  select count(*) into n from usuarios
   where role = 'so_email' and cliente_id = '00000000-0000-0000-0000-00000000e0b0'
     and email = 'antigo.b@exemplo.com' and recebe_alertas;
  if n <> 1 then raise exception 'FALHOU: e-mail de admin inativo não virou so_email'; end if;

  -- 4) Segunda execução não desliga opção ligada à mão.
  update usuarios set recebe_relatorio = true where auth_id = '00000000-0000-0000-0000-00000000e0a1';
end $$;

-- ── 3ª execução: opção ligada à mão continua ligada ────────────────────────
-- >>> colar aqui sql/migration-usuarios-avisos-email.sql <<<

do $$
declare
  n int;
begin
  select count(*) into n from usuarios
   where auth_id = '00000000-0000-0000-0000-00000000e0a1' and recebe_alertas and recebe_relatorio;
  if n <> 1 then raise exception 'FALHOU: reexecução desligou opção'; end if;

  -- 5) Padrão false para usuário novo.
  insert into usuarios (auth_id, email, nome, role, cliente_id)
  values ('00000000-0000-0000-0000-00000000e0d1', 'sobra@exemplo.com', 'Novo', 'operador',
          '00000000-0000-0000-0000-00000000e0a0');
  select count(*) into n from usuarios
   where auth_id = '00000000-0000-0000-0000-00000000e0d1' and not recebe_alertas and not recebe_relatorio;
  if n <> 1 then raise exception 'FALHOU: opções não nascem false'; end if;
  delete from usuarios where auth_id = '00000000-0000-0000-0000-00000000e0d1';

  -- 6) Restrições.
  begin
    insert into usuarios (auth_id, email, nome, role, cliente_id)
    values ('00000000-0000-0000-0000-00000000e0d1', 'x1@exemplo.com', 'X1', 'so_email',
            '00000000-0000-0000-0000-00000000e0a0');
    raise exception 'FALHOU: aceitou so_email com auth_id';
  exception when check_violation then null;
  end;
  begin
    insert into usuarios (email, nome, role, cliente_id)
    values ('x2@exemplo.com', 'X2', 'so_email', null);
    raise exception 'FALHOU: aceitou so_email sem cliente';
  exception when check_violation then null;
  end;
  begin
    insert into usuarios (email, nome, role, cliente_id)
    values ('x3@exemplo.com', 'X3', 'operador', '00000000-0000-0000-0000-00000000e0a0');
    raise exception 'FALHOU: aceitou operador sem auth_id';
  exception when check_violation then null;
  end;
  begin
    insert into usuarios (auth_id, email, nome, role, cliente_id)
    values ('00000000-0000-0000-0000-00000000e0d1', 'x4@exemplo.com', 'X4', 'gerente',
            '00000000-0000-0000-0000-00000000e0a0');
    raise exception 'FALHOU: aceitou role inválido';
  exception when check_violation then null;
  end;
  begin
    insert into usuarios (email, nome, role, cliente_id) values
      ('dup@exemplo.com', 'D1', 'so_email', '00000000-0000-0000-0000-00000000e0a0'),
      (' DUP@exemplo.com', 'D2', 'so_email', '00000000-0000-0000-0000-00000000e0a0');
    raise exception 'FALHOU: aceitou dois so_email com o mesmo e-mail no cliente';
  exception when unique_violation then null;
  end;
  -- mesmo e-mail em outro cliente: ok
  insert into usuarios (email, nome, role, cliente_id) values
    ('dup@exemplo.com', 'D1', 'so_email', '00000000-0000-0000-0000-00000000e0a0'),
    ('dup@exemplo.com', 'D3', 'so_email', '00000000-0000-0000-0000-00000000e0b0');
end $$;

-- ── Como síndico do A (navegador): policy atual ────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000e0a1","role":"authenticated"}', true);

do $$
declare
  n int;
begin
  -- só a própria linha; não lê so_email (auth_id nulo) nem usuários de outro
  select count(*) into n from usuarios;
  if n <> 1 then raise exception 'FALHOU: síndico A lê % usuários (esperado 1)', n; end if;
  if public.is_super_admin() then raise exception 'FALHOU: is_super_admin() verdadeiro para síndico'; end if;
  if public.my_role() is distinct from 'admin_cliente' then
    raise exception 'FALHOU: my_role() = %', public.my_role();
  end if;
  if public.my_cliente_id() is distinct from '00000000-0000-0000-0000-00000000e0a0'::uuid then
    raise exception 'FALHOU: my_cliente_id() errado';
  end if;
  begin
    update usuarios set recebe_alertas = true where role = 'so_email';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FALHOU: síndico alterou % usuários direto', n; end if;
  exception when insufficient_privilege then null;
  end;
end $$;

-- sem sessão (auth.uid() nulo): helpers não casam linhas so_email (auth_id nulo)
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  if public.is_super_admin() or public.my_role() is not null or public.my_cliente_id() is not null then
    raise exception 'FALHOU: helper casou linha sem auth_id';
  end if;
end $$;

reset role;

select 'ok' as resultado;

rollback;
