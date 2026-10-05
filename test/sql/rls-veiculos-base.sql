-- Teste de isolamento da veiculos_base. Roda inteiro dentro de uma transação
-- e termina em ROLLBACK: não deixa nada no banco.
-- Uso: executar via MCP do Supabase (execute_sql). Resultado esperado: uma
-- linha com ve_a = 1, ve_b = 0, ve_so_cadastro = 0, config = 0, extrato = 0,
-- placa_extrato_nula = YES e todas as colunas pode_* = false. Falha com
-- exceção 'FALHOU: ...' se o painel conseguir ler suspeita_de (grant por coluna).
begin;

-- Dois clientes e dois usuários fictícios
insert into clientes (id, nome, local_via, cidade_uf, limite_velocidade) values
  ('00000000-0000-0000-0000-00000000aaaa', 'Teste RLS A', 'Via Teste A', 'Cidade Teste/XX', 30),
  ('00000000-0000-0000-0000-00000000bbbb', 'Teste RLS B', 'Via Teste B', 'Cidade Teste/XX', 30);
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'rls-a@teste.invalid');
insert into usuarios (auth_id, email, nome, role, cliente_id, ativo) values
  ('00000000-0000-0000-0000-0000000000a1', 'rls-a@teste.invalid', 'RLS A', 'admin_cliente',
   '00000000-0000-0000-0000-00000000aaaa', true);

-- capturas exige camera_id (FK para cameras)
insert into cameras (id, cliente_id, nome, token) values
  ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-00000000aaaa', 'Camera RLS A', 'token-rls-teste-a'),
  ('00000000-0000-0000-0000-00000000ca02', '00000000-0000-0000-0000-00000000bbbb', 'Camera RLS B', 'token-rls-teste-b');

-- ZZZ9Z91 passou só no A; ZZZ9Z92 passou só no B
insert into capturas (camera_id, cliente_id, placa, velocidade, timestamp) values
  ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-00000000aaaa', 'ZZZ9Z91', 20, now()),
  ('00000000-0000-0000-0000-00000000ca02', '00000000-0000-0000-0000-00000000bbbb', 'ZZZ9Z92', 20, now());
-- ZZZ9Z93 só está CADASTRADA em veiculos do A, nunca capturada no A (F8):
-- cadastro não é prova de "visto", então o A não pode ler a linha da base.
insert into veiculos (cliente_id, placa) values ('00000000-0000-0000-0000-00000000aaaa', 'ZZZ9Z93');
insert into veiculos_base (placa, status) values ('ZZZ9Z91', 'consultado'), ('ZZZ9Z92', 'consultado'), ('ZZZ9Z93', 'consultado');
insert into apiplacas_consultas (placa, resultado, custo, origem) values ('ZZZ9Z91', 'ok', 0.03, 'captura');

-- Agir como o usuário do cliente A
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

-- Colunas de suspeita/controle não são legíveis pelo painel (42501); as de
-- exibição continuam funcionando.
do $$
begin
  begin
    perform suspeita_de from veiculos_base;
    raise exception 'FALHOU: authenticated leu suspeita_de';
  exception when insufficient_privilege then null;
  end;
  begin
    perform suspeita_cliente_id from veiculos_base;
    raise exception 'FALHOU: authenticated leu suspeita_cliente_id';
  exception when insufficient_privilege then null;
  end;
  perform placa, status, marca from veiculos_base;
end $$;

select
  (select count(*) from veiculos_base where placa = 'ZZZ9Z91') as ve_a,
  (select count(*) from veiculos_base where placa = 'ZZZ9Z92') as ve_b,
  (select count(*) from veiculos_base where placa = 'ZZZ9Z93') as ve_so_cadastro,
  (select count(*) from apiplacas_config) as config,
  (select count(*) from apiplacas_consultas) as extrato,
  (select is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'apiplacas_consultas' and column_name = 'placa') as placa_extrato_nula,
  has_table_privilege('authenticated', 'public.apiplacas_consultas', 'INSERT,UPDATE,DELETE,TRUNCATE') as pode_escrever_extrato_auth,
  has_table_privilege('anon', 'public.apiplacas_consultas', 'INSERT,UPDATE,DELETE,TRUNCATE') as pode_escrever_extrato_anon,
  has_table_privilege('authenticated', 'public.apiplacas_config', 'INSERT,UPDATE,DELETE,TRUNCATE') as pode_escrever_config_auth,
  has_table_privilege('anon', 'public.apiplacas_config', 'INSERT,UPDATE,DELETE,TRUNCATE') as pode_escrever_config_anon;

rollback;
