-- Teste de sql/migration-encerrar-sessoes-porteiro.sql: a função apaga as
-- sessões (e os refresh tokens) de um usuário e só o backend executa.
-- Roda inteiro dentro de uma transação e termina em ROLLBACK: não deixa nada
-- no banco.
-- Uso: executar via MCP do Supabase (execute_sql), colando a migration logo
-- depois do `begin;` (mesma transação). Resultado esperado: uma linha com
-- resultado = 'ok'. Falha com exceção 'FALHOU: ...' em cada item.
begin;

-- Dois usuários fictícios, cada um com uma sessão e um refresh token.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000005a1', 'sessoes-a@teste.invalid'),
  ('00000000-0000-0000-0000-0000000005b1', 'sessoes-b@teste.invalid');
insert into auth.sessions (id, user_id) values
  ('00000000-0000-0000-0000-0000000005a2', '00000000-0000-0000-0000-0000000005a1'),
  ('00000000-0000-0000-0000-0000000005a3', '00000000-0000-0000-0000-0000000005a1'),
  ('00000000-0000-0000-0000-0000000005b2', '00000000-0000-0000-0000-0000000005b1');
insert into auth.refresh_tokens (token, user_id, session_id, revoked) values
  ('teste-sessoes-a', '00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000005a2', false),
  ('teste-sessoes-a-sem-sessao', '00000000-0000-0000-0000-0000000005a1', null, false),
  ('teste-sessoes-b', '00000000-0000-0000-0000-0000000005b1', '00000000-0000-0000-0000-0000000005b2', false);

-- ── Definição e grants ─────────────────────────────────────────────────────
do $$
declare
  f record;
begin
  select p.prosecdef, p.proconfig into f
  from pg_proc p where p.oid = 'public.encerrar_sessoes_usuario(uuid)'::regprocedure;
  if not f.prosecdef then raise exception 'FALHOU: função não é security definer'; end if;
  if f.proconfig is null or not ('search_path=""' = any(f.proconfig)) then
    raise exception 'FALHOU: search_path não fixado em vazio (%)', f.proconfig;
  end if;
  if has_function_privilege('anon', 'public.encerrar_sessoes_usuario(uuid)', 'execute') then
    raise exception 'FALHOU: anon executa a função';
  end if;
  if has_function_privilege('authenticated', 'public.encerrar_sessoes_usuario(uuid)', 'execute') then
    raise exception 'FALHOU: authenticated executa a função';
  end if;
  if not has_function_privilege('service_role', 'public.encerrar_sessoes_usuario(uuid)', 'execute') then
    raise exception 'FALHOU: service_role não executa a função';
  end if;
end $$;

-- ── authenticated (navegador) não consegue chamar ──────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000005b1","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.encerrar_sessoes_usuario('00000000-0000-0000-0000-0000000005a1');
    raise exception 'FALHOU: authenticated executou encerrar_sessoes_usuario';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ── anon também não ────────────────────────────────────────────────────────
set local role anon;
do $$
begin
  begin
    perform public.encerrar_sessoes_usuario('00000000-0000-0000-0000-0000000005a1');
    raise exception 'FALHOU: anon executou encerrar_sessoes_usuario';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ── service_role (backend) encerra só as sessões do usuário pedido ─────────
set local role service_role;
select public.encerrar_sessoes_usuario('00000000-0000-0000-0000-0000000005a1');
reset role;

do $$
declare
  n int;
begin
  select count(*) into n from auth.sessions where user_id = '00000000-0000-0000-0000-0000000005a1';
  if n <> 0 then raise exception 'FALHOU: % sessões do usuário A continuam', n; end if;
  select count(*) into n from auth.refresh_tokens where user_id = '00000000-0000-0000-0000-0000000005a1';
  if n <> 0 then raise exception 'FALHOU: % refresh tokens do usuário A continuam', n; end if;
  select count(*) into n from auth.sessions where user_id = '00000000-0000-0000-0000-0000000005b1';
  if n <> 1 then raise exception 'FALHOU: sessão do usuário B foi afetada (% restantes)', n; end if;
  select count(*) into n from auth.refresh_tokens where user_id = '00000000-0000-0000-0000-0000000005b1';
  if n <> 1 then raise exception 'FALHOU: refresh token do usuário B foi afetado (% restantes)', n; end if;
  begin
    perform public.encerrar_sessoes_usuario(null);
    raise exception 'FALHOU: aceitou p_user nulo';
  exception when raise_exception then
    if sqlerrm like 'FALHOU%' then raise; end if;
  end;
end $$;

select 'ok' as resultado;

rollback;
