-- Teste da base do Módulo Portaria (sql/migration-portaria-base.sql): vínculos
-- de placa com histórico, unidades, porteiros, perfil portaria e retenção.
-- Roda inteiro dentro de uma transação e termina em ROLLBACK: não deixa nada
-- no banco.
-- Uso: executar via MCP do Supabase (execute_sql). Sem branch, colar a
-- migration logo depois do `begin;` (mesma transação). Resultado esperado:
-- uma linha com resultado = 'ok'. Falha com exceção 'FALHOU: ...' em cada item.
begin;

-- ── Migração dos dados (vale quando a migration roda nesta mesma transação,
--    antes de qualquer insert do teste) ───────────────────────────────────────
do $$
declare
  n int;
begin
  select count(*) into n from veiculos where origem is distinct from 'migracao';
  if n <> 0 then raise exception 'FALHOU: % veiculos migrados sem origem migracao', n; end if;
  select count(*) into n from veiculos
   where encerrado_em is not null and vigente_desde is distinct from encerrado_em;
  if n <> 0 then
    raise exception 'FALHOU: % encerrados na migração sem vigente_desde = encerrado_em (janela vazia)', n;
  end if;
  select count(*) into n from veiculos where encerrado_em is null and vigente_desde is not null;
  if n <> 0 then raise exception 'FALHOU: % vigentes migrados com vigente_desde', n; end if;
  select count(*) into n from veiculos where ativo is distinct from (encerrado_em is null);
  if n <> 0 then raise exception 'FALHOU: % veiculos com ativo fora de sincronia', n; end if;
  select count(*) into n from (
    select 1 from veiculos where encerrado_em is null
     group by cliente_id, placa_mercosul(placa) having count(*) > 1) d;
  if n <> 0 then raise exception 'FALHOU: % chaves com mais de um vigente após a migração', n; end if;
end $$;

-- Dois clientes e três usuários fictícios: admin e portaria do A, admin do B
insert into clientes (id, nome, local_via, cidade_uf, limite_velocidade) values
  ('00000000-0000-0000-0000-00000000aaaa', 'Teste Portaria A', 'Via Teste A', 'Cidade Teste/XX', 30),
  ('00000000-0000-0000-0000-00000000bbbb', 'Teste Portaria B', 'Via Teste B', 'Cidade Teste/XX', 30);
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'portaria-admin-a@teste.invalid'),
  ('00000000-0000-0000-0000-0000000000a2', 'portaria-porteiro-a@teste.invalid'),
  ('00000000-0000-0000-0000-0000000000b1', 'portaria-admin-b@teste.invalid');
insert into usuarios (auth_id, email, nome, role, cliente_id, ativo) values
  ('00000000-0000-0000-0000-0000000000a1', 'portaria-admin-a@teste.invalid', 'Admin A', 'admin_cliente',
   '00000000-0000-0000-0000-00000000aaaa', true),
  ('00000000-0000-0000-0000-0000000000a2', 'portaria-porteiro-a@teste.invalid', 'Portaria A', 'portaria',
   '00000000-0000-0000-0000-00000000aaaa', true),
  ('00000000-0000-0000-0000-0000000000b1', 'portaria-admin-b@teste.invalid', 'Admin B', 'admin_cliente',
   '00000000-0000-0000-0000-00000000bbbb', true);

insert into cameras (id, cliente_id, nome, token) values
  ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-00000000aaaa', 'Camera Portaria A', 'token-portaria-teste-a');
insert into capturas (camera_id, cliente_id, placa, velocidade, timestamp) values
  ('00000000-0000-0000-0000-00000000ca01', '00000000-0000-0000-0000-00000000aaaa', 'ZZZ1A11', 20, now());
insert into unidades (id, cliente_id, nome) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000aaaa', 'Casa 10'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-00000000bbbb', 'Casa 10');
insert into porteiros (cliente_id, nome) values ('00000000-0000-0000-0000-00000000aaaa', 'Porteiro Teste');
insert into email_destinatarios (cliente_id, nome, email) values
  ('00000000-0000-0000-0000-00000000aaaa', 'Síndico A', 'sindico-a@teste.invalid');
insert into relatorio_envios (cliente_id, destinatario_email, periodo_inicio, periodo_fim, token) values
  ('00000000-0000-0000-0000-00000000aaaa', 'sindico-a@teste.invalid', current_date - 7, current_date, 'token-rel-portaria-teste');

-- ── vincular_placa (executado como dono, papel do backend) ─────────────────
do $$
declare
  v1 veiculos;
  v2 veiculos;
  v3 veiculos;
  n int;
begin
  -- 1) Placa nova: 1 linha, sem vigente_desde, ativa. Grafia com separador.
  v1 := public.vincular_placa('00000000-0000-0000-0000-00000000aaaa', 'zzz-1a11', 'morador', 'Fulano',
         'Casa 10', '00000000-0000-0000-0000-0000000000d1', 'Fiat', 'Prata', 'portaria', 'Porteiro Teste', null);
  select count(*) into n from veiculos where cliente_id = '00000000-0000-0000-0000-00000000aaaa';
  if n <> 1 then raise exception 'FALHOU: placa nova gerou % linhas', n; end if;
  if v1.vigente_desde is not null then raise exception 'FALHOU: placa nova com vigente_desde'; end if;
  if v1.ativo is distinct from true then raise exception 'FALHOU: placa nova não ativa'; end if;
  if v1.placa <> 'ZZZ1A11' then raise exception 'FALHOU: placa gravada como %', v1.placa; end if;

  -- 2) Outra pessoa na mesma placa: encerra a 1ª e abre a 2ª.
  v2 := public.vincular_placa('00000000-0000-0000-0000-00000000aaaa', 'ZZZ1A11', 'visitante', 'Beltrano',
         'Casa 10', '00000000-0000-0000-0000-0000000000d1', null, null, 'portaria', 'Porteiro Teste', null);
  select * into v1 from veiculos where id = v1.id;
  if v1.encerrado_em is null then raise exception 'FALHOU: 1º vínculo não foi encerrado'; end if;
  if v1.ativo is distinct from false then raise exception 'FALHOU: 1º vínculo encerrado continua ativo'; end if;
  if v2.id = v1.id then raise exception 'FALHOU: 2º vínculo reaproveitou a linha do 1º'; end if;
  if v2.vigente_desde is distinct from v1.encerrado_em then
    raise exception 'FALHOU: vigente_desde do 2º (%) difere do encerrado_em do 1º (%)', v2.vigente_desde, v1.encerrado_em;
  end if;
  select count(*) into n from veiculos
   where cliente_id = '00000000-0000-0000-0000-00000000aaaa' and encerrado_em is null;
  if n <> 1 then raise exception 'FALHOU: % vínculos vigentes após troca', n; end if;

  -- 3) Mesmo vínculo de novo: nenhuma linha nova, marca/cor atualizadas.
  v3 := public.vincular_placa('00000000-0000-0000-0000-00000000aaaa', 'ZZZ1011', 'visitante', '  Beltrano ',
         'Casa 10', '00000000-0000-0000-0000-0000000000d1', 'VW', 'Preto', 'portaria', 'Porteiro Teste', null);
  select count(*) into n from veiculos where cliente_id = '00000000-0000-0000-0000-00000000aaaa';
  if n <> 2 then raise exception 'FALHOU: vínculo idêntico criou linha nova (% linhas)', n; end if;
  if v3.id <> v2.id then raise exception 'FALHOU: vínculo idêntico devolveu outra linha'; end if;
  if v3.marca is distinct from 'VW' or v3.cor is distinct from 'Preto' then
    raise exception 'FALHOU: marca/cor não atualizadas (% / %)', v3.marca, v3.cor;
  end if;

  -- 4) Insert direto de vigente na outra grafia (antiga) → unicidade.
  begin
    insert into veiculos (cliente_id, placa, nome_morador)
    values ('00000000-0000-0000-0000-00000000aaaa', 'ZZZ1011', 'Duplicado');
    raise exception 'FALHOU: aceitou dois vínculos vigentes da mesma placa em grafias diferentes';
  exception when unique_violation then null;
  end;

  -- 4b) Estado "concorrente" simulado: outro processo já gravou um vigente
  --     direto (fora da função). Duas chamadas seguidas com pessoas
  --     diferentes passam pelo ramo "difere": nada se perde, 1 vigente no fim.
  --     Concorrência real não roda numa transação só; a trava por chave é
  --     conferida abaixo via pg_get_functiondef.
  insert into veiculos (cliente_id, placa, nome_morador, unidade)
  values ('00000000-0000-0000-0000-00000000aaaa', 'ZZZ6F66', 'Concorrente', 'Casa 10');
  v1 := public.vincular_placa('00000000-0000-0000-0000-00000000aaaa', 'ZZZ6566', 'morador', 'Porteiro A grava',
         'Casa 10', null, null, null, 'portaria', 'Porteiro A', null);
  v2 := public.vincular_placa('00000000-0000-0000-0000-00000000aaaa', 'ZZZ6F66', 'prestador', 'Porteiro B grava',
         'Casa 10', null, null, null, 'portaria', 'Porteiro B', null);
  if v1.nome_morador is distinct from 'Porteiro A grava' or v1.vigente_desde is null then
    raise exception 'FALHOU: 1ª chamada após estado concorrente não abriu vínculo novo';
  end if;
  if v2.nome_morador is distinct from 'Porteiro B grava' or v2.id = v1.id then
    raise exception 'FALHOU: 2ª chamada após estado concorrente perdeu o cadastro';
  end if;
  select count(*) into n from veiculos
   where cliente_id = '00000000-0000-0000-0000-00000000aaaa' and placa_mercosul(placa) = 'ZZZ6F66';
  if n <> 3 then raise exception 'FALHOU: histórico da placa concorrente com % linhas (esperado 3)', n; end if;
  select count(*) into n from veiculos
   where cliente_id = '00000000-0000-0000-0000-00000000aaaa' and placa_mercosul(placa) = 'ZZZ6F66'
     and encerrado_em is null;
  if n <> 1 then raise exception 'FALHOU: % vigentes na placa concorrente', n; end if;
  if (select vigente_desde from veiculos where id = v2.id) is distinct from
     (select encerrado_em from veiculos where id = v1.id) then
    raise exception 'FALHOU: vigência da placa concorrente não encadeia';
  end if;
  if pg_get_functiondef('public.vincular_placa(uuid, text, text, text, text, uuid, text, text, text, text, uuid)'::regprocedure)
       not ilike '%pg_advisory_xact_lock%' then
    raise exception 'FALHOU: vincular_placa sem trava por chave (pg_advisory_xact_lock)';
  end if;

  -- 4c) Recadastro de placa com histórico: o novo vínculo vale a partir do
  --     cadastro (now()), não do encerramento do anterior. O intervalo entre
  --     T1 (A encerrado) e T2 (B cadastrado) não casa com ninguém. Dentro de
  --     uma transação now() é constante; por isso T1 é fixado no passado.
  v1 := public.vincular_placa('00000000-0000-0000-0000-00000000aaaa', 'ZZZ7G77', 'morador', 'Morador A',
         'Casa 10', null, null, null, 'painel', null, null);
  if v1.vigente_desde is not null then
    raise exception 'FALHOU: placa que nunca teve vínculo deve ficar com vigente_desde null';
  end if;
  update veiculos set encerrado_em = now() - interval '2 days' where id = v1.id;
  v2 := public.vincular_placa('00000000-0000-0000-0000-00000000aaaa', 'ZZZ7677', 'morador', 'Morador B',
         'Casa 10', null, null, null, 'painel', null, null);
  if v2.vigente_desde is distinct from now() then
    raise exception 'FALHOU: recadastro com histórico com vigente_desde % (esperado now())', v2.vigente_desde;
  end if;
  if not (v2.vigente_desde > (select encerrado_em from veiculos where id = v1.id)) then
    raise exception 'FALHOU: vigente_desde de B não é posterior ao encerramento de A';
  end if;
  -- passagem entre T1 e T2 (há 1 dia): ninguém
  if (select string_agg(nome_morador, ',') from veiculos
       where cliente_id = '00000000-0000-0000-0000-00000000aaaa' and placa_mercosul(placa) = 'ZZZ7G77'
         and (vigente_desde is null or vigente_desde <= now() - interval '1 day')
         and (encerrado_em is null or encerrado_em > now() - interval '1 day')) is not null then
    raise exception 'FALHOU: passagem entre o encerramento e o recadastro deveria ser Sem cadastro';
  end if;
  -- passagem antes de T1 (há 3 dias): só A
  if (select string_agg(nome_morador, ',') from veiculos
       where cliente_id = '00000000-0000-0000-0000-00000000aaaa' and placa_mercosul(placa) = 'ZZZ7G77'
         and (vigente_desde is null or vigente_desde <= now() - interval '3 days')
         and (encerrado_em is null or encerrado_em > now() - interval '3 days')) is distinct from 'Morador A' then
    raise exception 'FALHOU: passagem anterior ao encerramento não é só de A';
  end if;
  -- passagem depois de T2 (daqui a 1 hora): só B
  if (select string_agg(nome_morador, ',') from veiculos
       where cliente_id = '00000000-0000-0000-0000-00000000aaaa' and placa_mercosul(placa) = 'ZZZ7G77'
         and (vigente_desde is null or vigente_desde <= now() + interval '1 hour')
         and (encerrado_em is null or encerrado_em > now() + interval '1 hour')) is distinct from 'Morador B' then
    raise exception 'FALHOU: passagem posterior ao recadastro não é só de B';
  end if;
  delete from veiculos where placa_mercosul(placa) = 'ZZZ7G77'
     and cliente_id = '00000000-0000-0000-0000-00000000aaaa';

  -- 5) unidade_id de outro cliente é recusada.
  begin
    perform public.vincular_placa('00000000-0000-0000-0000-00000000aaaa', 'ZZZ2B22', 'morador', 'Cicrano',
            'Casa 10', '00000000-0000-0000-0000-0000000000d2', null, null, 'portaria', null, null);
    raise exception 'FALHOU: aceitou unidade_id de outro cliente';
  exception when others then
    if sqlerrm like 'FALHOU:%' then raise; end if;
  end;
end $$;

-- ── Retenção: cleanup_vinculos_encerrados ──────────────────────────────────
insert into veiculos (id, cliente_id, placa, criado_em, encerrado_em) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000bbbb', 'ZZZ3C33', now() - interval '2 years', now() - interval '7 months'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-00000000bbbb', 'ZZZ3C33', now() - interval '2 years', now() - interval '1 month'),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-00000000bbbb', 'ZZZ3C33', now() - interval '2 years', null);

do $$
declare
  n int;
begin
  n := public.cleanup_vinculos_encerrados();
  if n < 1 then raise exception 'FALHOU: cleanup devolveu %', n; end if;
  if exists (select 1 from veiculos where id = '00000000-0000-0000-0000-0000000000e1') then
    raise exception 'FALHOU: cleanup manteve vínculo encerrado há 7 meses';
  end if;
  if not exists (select 1 from veiculos where id = '00000000-0000-0000-0000-0000000000e2') then
    raise exception 'FALHOU: cleanup apagou vínculo encerrado há 1 mês';
  end if;
  if not exists (select 1 from veiculos where id = '00000000-0000-0000-0000-0000000000e3') then
    raise exception 'FALHOU: cleanup apagou vínculo vigente antigo';
  end if;
  if has_function_privilege('authenticated', 'public.cleanup_vinculos_encerrados()', 'execute') then
    raise exception 'FALHOU: authenticated pode executar cleanup_vinculos_encerrados';
  end if;
end $$;

-- ── Como usuário portaria do cliente A ─────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);

do $$
declare
  n int;
begin
  if public.my_role() is distinct from 'portaria' then
    raise exception 'FALHOU: my_role() devolveu %', public.my_role();
  end if;
  select count(*) into n from capturas;
  if n < 1 then raise exception 'FALHOU: portaria não lê capturas'; end if;
  select count(*) into n from cameras;
  if n < 1 then raise exception 'FALHOU: portaria não lê cameras'; end if;
  select count(*) into n from unidades;
  if n <> 1 then raise exception 'FALHOU: portaria lê % unidades (esperado 1, só do A)', n; end if;
  select count(*) into n from porteiros;
  if n <> 1 then raise exception 'FALHOU: portaria lê % porteiros', n; end if;
  select count(*) into n from veiculos;
  if n <> 5 then raise exception 'FALHOU: portaria lê % veiculos (esperado 5)', n; end if;

  select count(*) into n from email_destinatarios;
  if n <> 0 then raise exception 'FALHOU: portaria lê email_destinatarios (% linhas)', n; end if;
  select count(*) into n from relatorio_envios;
  if n <> 0 then raise exception 'FALHOU: portaria lê relatorio_envios (% linhas)', n; end if;

  update clientes set limite_velocidade = 99 where id = '00000000-0000-0000-0000-00000000aaaa';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALHOU: portaria alterou clientes (% linhas)', n; end if;

  begin
    insert into veiculos (cliente_id, placa) values ('00000000-0000-0000-0000-00000000aaaa', 'ZZZ4D44');
    raise exception 'FALHOU: portaria inseriu em veiculos';
  exception when insufficient_privilege then null;
  end;

  begin
    delete from veiculos;
    raise exception 'FALHOU: portaria tem privilégio de apagar veiculos';
  exception when insufficient_privilege then null;
  end;

  begin
    update veiculos set marca = 'X';
    raise exception 'FALHOU: portaria tem privilégio de alterar veiculos';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into unidades (cliente_id, nome) values ('00000000-0000-0000-0000-00000000aaaa', 'Casa 99');
    raise exception 'FALHOU: portaria inseriu em unidades';
  exception when insufficient_privilege then null;
  end;

  -- authenticated não executa vincular_placa (só service_role)
  begin
    perform public.vincular_placa('00000000-0000-0000-0000-00000000aaaa', 'ZZZ5E55', 'morador', 'X',
            null, null, null, null, 'portaria', null, null);
    raise exception 'FALHOU: authenticated executou vincular_placa';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ── Colunas sensíveis e selects do painel (perfil: portaria) ───────────────
-- As strings de select abaixo são cópia exata das usadas por dashboard/index.html
-- (COLUNAS_CLIENTE_PAINEL e os selects de cameras/veiculos). Mudou lá, muda aqui.
do $$
declare
  n int;
  col text;
begin
  foreach col in array array['notif_emails', 'emails_notificacao', 'telefone', 'contato_nome', 'cnpj',
                              'user_id', 'cep', 'endereco'] loop
    begin
      execute format('select count(%I) from clientes', col);
      raise exception 'FALHOU: portaria lê clientes.%', col;
    exception when insufficient_privilege then null;
    end;
  end loop;
  foreach col in array array['token', 'ip_address', 'mac_address'] loop
    begin
      execute format('select count(%I) from cameras', col);
      raise exception 'FALHOU: portaria lê cameras.%', col;
    exception when insufficient_privilege then null;
    end;
  end loop;

  -- loadProfile / abrirComoAdmin / loadClienteLegado
  select count(*) into n from (
    select id, nome, local_via, cidade_uf, limite_velocidade, ativo, pdf_titulo, pdf_subtitulo, pdf_rodape, pdf_logo_url, pdf_corpo_texto
      from clientes where id = '00000000-0000-0000-0000-00000000aaaa' and ativo = true) x;
  if n <> 1 then raise exception 'FALHOU: portaria não lê o próprio cliente pelas colunas do painel (% linhas)', n; end if;
  select count(*) into n from (
    select id, nome, local_via, cidade_uf, limite_velocidade, ativo, pdf_titulo, pdf_subtitulo, pdf_rodape, pdf_logo_url, pdf_corpo_texto
      from clientes where ativo = true) x;
  if n <> 1 then raise exception 'FALHOU: portaria lê % clientes ativos no caminho legado (esperado 1)', n; end if;
  -- preencherSeletorClientes
  perform id, nome from clientes where ativo = true order by nome;
  -- carregar câmeras / status das câmeras
  select count(*) into n from (
    select id, nome, nome_exibicao, serial_number, modelo, firmware
      from cameras where cliente_id = '00000000-0000-0000-0000-00000000aaaa' and ativa = true) x;
  if n <> 1 then raise exception 'FALHOU: portaria não lê câmeras (% linhas)', n; end if;
  select count(*) into n from (
    select id, nome, nome_exibicao, last_seen, ativa
      from cameras where cliente_id = '00000000-0000-0000-0000-00000000aaaa' and ativa = true) x;
  if n <> 1 then raise exception 'FALHOU: portaria não lê status das câmeras (% linhas)', n; end if;
  -- vínculos de placa
  perform id, placa, nome_morador, unidade, unidade_id, tipo_pessoa, marca, cor, vigente_desde, encerrado_em,
          criado_em, origem, cadastrado_por
     from veiculos where cliente_id = '00000000-0000-0000-0000-00000000aaaa' order by placa, id;

  -- escrita direta em veiculos: só pela API (vincular_placa)
  begin
    insert into veiculos (cliente_id, placa) values ('00000000-0000-0000-0000-00000000aaaa', 'ZZZ8H88');
    raise exception 'FALHOU: portaria inseriu em veiculos';
  exception when insufficient_privilege then null;
  end;
  begin
    update veiculos set vigente_desde = now() where cliente_id = '00000000-0000-0000-0000-00000000aaaa';
    raise exception 'FALHOU: portaria alterou veiculos';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from veiculos where cliente_id = '00000000-0000-0000-0000-00000000aaaa';
    raise exception 'FALHOU: portaria apagou veiculos';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ── Regressão: admin_cliente do A continua lendo email_destinatarios ───────
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

do $$
declare
  n int;
begin
  select count(*) into n from email_destinatarios;
  if n <> 1 then raise exception 'FALHOU: admin_cliente lê % email_destinatarios (esperado 1)', n; end if;
  select count(*) into n from relatorio_envios;
  if n <> 1 then raise exception 'FALHOU: admin_cliente lê % relatorio_envios (esperado 1)', n; end if;
  select count(*) into n from unidades;
  if n <> 1 then raise exception 'FALHOU: admin_cliente lê % unidades (esperado 1)', n; end if;
  if public.my_role() is distinct from 'admin_cliente' then
    raise exception 'FALHOU: my_role() do admin devolveu %', public.my_role();
  end if;
end $$;

-- ── Colunas sensíveis e selects do painel (perfil: admin_cliente) ───────────────
-- As strings de select abaixo são cópia exata das usadas por dashboard/index.html
-- (COLUNAS_CLIENTE_PAINEL e os selects de cameras/veiculos). Mudou lá, muda aqui.
do $$
declare
  n int;
  col text;
begin
  foreach col in array array['notif_emails', 'emails_notificacao', 'telefone', 'contato_nome', 'cnpj',
                              'user_id', 'cep', 'endereco'] loop
    begin
      execute format('select count(%I) from clientes', col);
      raise exception 'FALHOU: admin_cliente lê clientes.%', col;
    exception when insufficient_privilege then null;
    end;
  end loop;
  foreach col in array array['token', 'ip_address', 'mac_address'] loop
    begin
      execute format('select count(%I) from cameras', col);
      raise exception 'FALHOU: admin_cliente lê cameras.%', col;
    exception when insufficient_privilege then null;
    end;
  end loop;

  -- loadProfile / abrirComoAdmin / loadClienteLegado
  select count(*) into n from (
    select id, nome, local_via, cidade_uf, limite_velocidade, ativo, pdf_titulo, pdf_subtitulo, pdf_rodape, pdf_logo_url, pdf_corpo_texto
      from clientes where id = '00000000-0000-0000-0000-00000000aaaa' and ativo = true) x;
  if n <> 1 then raise exception 'FALHOU: admin_cliente não lê o próprio cliente pelas colunas do painel (% linhas)', n; end if;
  select count(*) into n from (
    select id, nome, local_via, cidade_uf, limite_velocidade, ativo, pdf_titulo, pdf_subtitulo, pdf_rodape, pdf_logo_url, pdf_corpo_texto
      from clientes where ativo = true) x;
  if n <> 1 then raise exception 'FALHOU: admin_cliente lê % clientes ativos no caminho legado (esperado 1)', n; end if;
  -- preencherSeletorClientes
  perform id, nome from clientes where ativo = true order by nome;
  -- carregar câmeras / status das câmeras
  select count(*) into n from (
    select id, nome, nome_exibicao, serial_number, modelo, firmware
      from cameras where cliente_id = '00000000-0000-0000-0000-00000000aaaa' and ativa = true) x;
  if n <> 1 then raise exception 'FALHOU: admin_cliente não lê câmeras (% linhas)', n; end if;
  select count(*) into n from (
    select id, nome, nome_exibicao, last_seen, ativa
      from cameras where cliente_id = '00000000-0000-0000-0000-00000000aaaa' and ativa = true) x;
  if n <> 1 then raise exception 'FALHOU: admin_cliente não lê status das câmeras (% linhas)', n; end if;
  -- vínculos de placa
  perform id, placa, nome_morador, unidade, unidade_id, tipo_pessoa, marca, cor, vigente_desde, encerrado_em,
          criado_em, origem, cadastrado_por
     from veiculos where cliente_id = '00000000-0000-0000-0000-00000000aaaa' order by placa, id;

  -- escrita direta em veiculos: só pela API (vincular_placa)
  begin
    insert into veiculos (cliente_id, placa) values ('00000000-0000-0000-0000-00000000aaaa', 'ZZZ8H88');
    raise exception 'FALHOU: admin_cliente inseriu em veiculos';
  exception when insufficient_privilege then null;
  end;
  begin
    update veiculos set vigente_desde = now() where cliente_id = '00000000-0000-0000-0000-00000000aaaa';
    raise exception 'FALHOU: admin_cliente alterou veiculos';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from veiculos where cliente_id = '00000000-0000-0000-0000-00000000aaaa';
    raise exception 'FALHOU: admin_cliente apagou veiculos';
  exception when insufficient_privilege then null;
  end;
end $$;

select 'ok' as resultado;

rollback;
