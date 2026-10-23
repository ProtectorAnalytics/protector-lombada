-- Módulo Portaria — base do banco (spec docs/superpowers/specs/2026-10-22-modulo-portaria-design.md §4).
--
-- 1. placa_mercosul(): chave única da placa nas duas grafias (antiga/Mercosul),
--    igual a paraMercosul de site/js/placa.js.
-- 2. unidades e porteiros por cliente (leitura por RLS; escrita só pela API).
-- 3. veiculos vira histórico de vínculos: tipo de pessoa, vigência, origem,
--    quem cadastrou e unidade. Só um vínculo vigente por (cliente, placa).
--    `ativo` passa a ser derivado de `encerrado_em` (gatilho).
-- 4. Perfil 'portaria' em usuarios + my_role(); a portaria não vê e-mails nem
--    relatórios e não altera o cliente. SELECT de clientes/cameras por coluna
--    (sem e-mails, contato, CNPJ, endereço, token); ninguém do navegador
--    escreve em veiculos.
-- 5. vincular_placa(): única porta de escrita do vínculo (só service_role).
-- 6. cleanup_vinculos_encerrados(): retenção de 6 meses dos vínculos
--    encerrados. O agendamento no pg_cron NÃO está aqui: só com "sim"
--    explícito do dono (a 1ª execução apaga cadastros excluídos de mar/2026):
--      select cron.schedule('cleanup-vinculos-encerrados', '15 4 * * *',
--                           'select public.cleanup_vinculos_encerrados()');
--
-- Aplicar via MCP do Supabase (apply_migration, nome portaria_base) só depois
-- da revisão de segurança. Teste: test/sql/portaria-base.sql.

-- ============================================================
-- 1. placa_mercosul
-- ============================================================
create or replace function public.placa_mercosul(p text)
 returns text
 language sql
 immutable
 strict
 parallel safe
 set search_path to 'pg_catalog', 'public'
as $function$
  select case
    when length(s) = 7 and substr(s, 5, 1) ~ '[0-9]'
      then overlay(s placing translate(substr(s, 5, 1), '0123456789', 'ABCDEFGHIJ') from 5 for 1)
    else s
  end
  from (select upper(regexp_replace(p, '[^A-Za-z0-9]', '', 'g')) as s) x;
$function$;

-- ============================================================
-- 2. unidades e porteiros
-- ============================================================
create table if not exists public.unidades (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 60),
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create unique index if not exists uq_unidades_cliente_nome on public.unidades (cliente_id, lower(nome));

create table if not exists public.porteiros (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 60),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create unique index if not exists uq_porteiros_cliente_nome on public.porteiros (cliente_id, lower(nome));

alter table public.unidades enable row level security;
alter table public.porteiros enable row level security;

-- Escrita só pelo backend (service_role); o painel só lê o próprio cliente.
revoke all on public.unidades, public.porteiros from anon;
revoke insert, update, delete, truncate on public.unidades, public.porteiros from authenticated;

drop policy if exists "unidades_select" on public.unidades;
create policy "unidades_select" on public.unidades
  for select to authenticated
  using ((select public.is_super_admin()) or cliente_id = (select public.my_cliente_id()));

drop policy if exists "porteiros_select" on public.porteiros;
create policy "porteiros_select" on public.porteiros
  for select to authenticated
  using ((select public.is_super_admin()) or cliente_id = (select public.my_cliente_id()));

-- ============================================================
-- 3. veiculos: colunas de vínculo
-- ============================================================
alter table public.veiculos
  add column if not exists tipo_pessoa text not null default 'morador'
    check (tipo_pessoa in ('morador', 'proprietario', 'visitante', 'prestador')),
  add column if not exists vigente_desde timestamptz null,
  add column if not exists encerrado_em timestamptz null,
  add column if not exists origem text not null default 'painel'
    check (origem in ('painel', 'admin', 'portaria', 'condfy', 'planilha', 'migracao')),
  add column if not exists cadastrado_por text null,
  add column if not exists cadastrado_por_usuario uuid null,
  add column if not exists unidade_id uuid null references public.unidades(id) on delete set null;

-- Migração dos dados existentes:
--   a) cadastro excluído (ativo = false) → encerrado na data em que foi criado;
--   b) duplicados ativos da mesma placa (nas duas grafias): o mais recente fica
--      vigente e os outros são encerrados na data de criação do vigente;
--   c) tudo marcado como origem 'migracao', morador. Vigente fica sem
--      vigente_desde (vale desde sempre); encerrado recebe vigente_desde =
--      encerrado_em (janela vazia: nunca casa com passagem, mas continua no
--      histórico e na retenção). Sem isso, um encerrado com vigente_desde null
--      voltaria a "valer desde sempre" e disputaria passagens antigas.
update public.veiculos
   set encerrado_em = criado_em, ativo = false
 where ativo = false and encerrado_em is null;

with ordenados as (
  select id,
         row_number() over w as pos,
         first_value(criado_em) over w as criado_vigente
    from public.veiculos
   where encerrado_em is null
  window w as (partition by cliente_id, public.placa_mercosul(placa)
               order by criado_em desc, id desc)
)
update public.veiculos v
   set encerrado_em = o.criado_vigente, ativo = false
  from ordenados o
 where v.id = o.id and o.pos > 1;

update public.veiculos
   set origem = 'migracao', tipo_pessoa = 'morador',
       vigente_desde = case when encerrado_em is null then null else encerrado_em end,
       ativo = (encerrado_em is null);

-- ativo é derivado: vigente ⇔ não encerrado.
create or replace function public.veiculos_ativo_sync()
 returns trigger
 language plpgsql
 set search_path to 'pg_catalog', 'public'
as $function$
begin
  new.ativo := new.encerrado_em is null;
  return new;
end;
$function$;

drop trigger if exists veiculos_ativo_sync on public.veiculos;
create trigger veiculos_ativo_sync
  before insert or update on public.veiculos
  for each row execute function public.veiculos_ativo_sync();

create unique index if not exists uq_veiculos_vigente
  on public.veiculos (cliente_id, public.placa_mercosul(placa))
  where encerrado_em is null;

-- ============================================================
-- 4. Perfil portaria
-- ============================================================
alter table public.usuarios drop constraint if exists usuarios_role_check;
alter table public.usuarios add constraint usuarios_role_check
  check (role in ('super_admin', 'admin_cliente', 'operador', 'portaria'));

create or replace function public.my_role()
 returns text
 language sql
 stable security definer
 set search_path to 'pg_catalog', 'public'
as $function$
  select role from usuarios
  where auth_id = auth.uid()
  and ativo = true
  limit 1;
$function$;

-- Políticas: mesma lógica de antes + "não é portaria".
alter policy "email_dest_select" on public.email_destinatarios
  using ((is_super_admin() or cliente_id = my_cliente_id())
         and (select public.my_role()) is distinct from 'portaria');
alter policy "email_dest_insert" on public.email_destinatarios
  with check ((is_super_admin() or cliente_id = my_cliente_id())
              and (select public.my_role()) is distinct from 'portaria');
alter policy "email_dest_update" on public.email_destinatarios
  using ((is_super_admin() or cliente_id = my_cliente_id())
         and (select public.my_role()) is distinct from 'portaria');
alter policy "email_dest_delete" on public.email_destinatarios
  using ((is_super_admin() or cliente_id = my_cliente_id())
         and (select public.my_role()) is distinct from 'portaria');

alter policy "rel_envios_select" on public.relatorio_envios
  using ((is_super_admin() or cliente_id = my_cliente_id())
         and (select public.my_role()) is distinct from 'portaria');

alter policy "clientes_update" on public.clientes
  using ((is_super_admin()
          or (id = my_cliente_id()
              and exists (select 1 from usuarios
                           where usuarios.auth_id = (select auth.uid())
                             and usuarios.ativo = true
                             and usuarios.role = any (array['admin_cliente'::text, 'super_admin'::text])
                             and usuarios.cliente_id is not null)))
         and (select public.my_role()) is distinct from 'portaria');

-- Colunas sensíveis do cliente (e-mails, telefone, contato, CNPJ, endereço,
-- dono legado) e o token da câmera não saem pelo navegador: o SELECT passa a
-- ser por coluna. Quem precisa delas usa a API (service_role, checa o perfil).
-- Coluna nova nessas tabelas NÃO fica visível ao painel até entrar aqui.
revoke select on public.clientes from anon, authenticated;
revoke select (emails_notificacao, notif_emails, telefone, contato_nome, cnpj, user_id, cep, endereco)
  on public.clientes from anon, authenticated;
grant select (id, nome, local_via, cidade_uf, limite_velocidade, ativo,
              pdf_titulo, pdf_subtitulo, pdf_rodape, pdf_logo_url, pdf_corpo_texto)
  on public.clientes to authenticated;

revoke select on public.cameras from anon, authenticated;
revoke select (token, ip_address, mac_address) on public.cameras from anon, authenticated;
grant select (id, cliente_id, nome, nome_exibicao, ativa, last_seen,
              serial_number, modelo, firmware)
  on public.cameras to authenticated;

-- Escrita em veiculos só pela API (vincular_placa / service_role): sem o
-- privilégio, ninguém do navegador forja vigente_desde, encerrado_em ou origem.
revoke insert, update, delete, truncate on public.veiculos from anon, authenticated;

alter policy "veiculos_insert" on public.veiculos
  with check ((is_super_admin() or cliente_id = my_cliente_id())
              and (select public.my_role()) is distinct from 'portaria');
alter policy "veiculos_update" on public.veiculos
  using ((is_super_admin() or cliente_id = my_cliente_id())
         and (select public.my_role()) is distinct from 'portaria');
alter policy "veiculos_delete" on public.veiculos
  using ((is_super_admin() or cliente_id = my_cliente_id())
         and (select public.my_role()) is distinct from 'portaria');

-- ============================================================
-- 5. vincular_placa
-- ============================================================
-- Grava o vínculo da placa no cliente. Se já existe vigente com o mesmo tipo,
-- nome, unidade e unidade_id, só atualiza marca/cor (quando informadas). Se
-- difere, encerra o vigente e abre o novo a partir de agora. Sem vigente: se a
-- placa já teve vínculo, o novo começa no último encerrado_em (o histórico de
-- "quem estava na hora" não é reescrito); placa que nunca teve vínculo entra
-- sem vigente_desde (não se sabe desde quando o carro é do morador).
create or replace function public.vincular_placa(
  p_cliente_id uuid,
  p_placa text,
  p_tipo text,
  p_nome text,
  p_unidade text,
  p_unidade_id uuid,
  p_marca text,
  p_cor text,
  p_origem text,
  p_cadastrado_por text,
  p_usuario uuid
)
 returns public.veiculos
 language plpgsql
 security invoker
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_placa text := upper(regexp_replace(coalesce(p_placa, ''), '[^A-Za-z0-9]', '', 'g'));
  v_chave text := public.placa_mercosul(v_placa);
  v_nome text := nullif(trim(p_nome), '');
  v_unidade text := nullif(trim(p_unidade), '');
  v_marca text := nullif(trim(p_marca), '');
  v_cor text := nullif(trim(p_cor), '');
  v_agora timestamptz := now();
  v_atual public.veiculos;
  v_novo public.veiculos;
  v_desde timestamptz;
begin
  if p_cliente_id is null then
    raise exception 'vincular_placa: cliente obrigatório' using errcode = '22023';
  end if;
  if v_placa = '' then
    raise exception 'vincular_placa: placa obrigatória' using errcode = '22023';
  end if;
  if p_unidade_id is not null and not exists (
    select 1 from public.unidades u where u.id = p_unidade_id and u.cliente_id = p_cliente_id
  ) then
    raise exception 'vincular_placa: unidade não pertence ao cliente' using errcode = '22023';
  end if;

  -- Serializa as gravações da mesma placa no mesmo cliente. Sem isto, em READ
  -- COMMITTED, quem espera o FOR UPDATE reavalia a linha já encerrada pelo
  -- outro, não enxerga o vínculo novo (fora do snapshot do comando), conclui
  -- "não existe" e o cadastro dele se perde no unique_violation. Com a trava,
  -- o segundo só lê depois do commit do primeiro e cai no ramo "difere".
  perform pg_advisory_xact_lock(hashtextextended(p_cliente_id::text || ':' || v_chave, 0));

  select * into v_atual
    from public.veiculos
   where cliente_id = p_cliente_id
     and public.placa_mercosul(placa) = v_chave
     and encerrado_em is null
   for update;

  if found then
    if v_atual.tipo_pessoa = p_tipo
       and nullif(trim(v_atual.nome_morador), '') is not distinct from v_nome
       and nullif(trim(v_atual.unidade), '') is not distinct from v_unidade
       and v_atual.unidade_id is not distinct from p_unidade_id then
      update public.veiculos
         set marca = coalesce(v_marca, marca),
             cor = coalesce(v_cor, cor)
       where id = v_atual.id
      returning * into v_novo;
      return v_novo;
    end if;

    update public.veiculos set encerrado_em = v_agora where id = v_atual.id;
    v_desde := v_agora;
  else
    -- Sem vigente: se a placa já teve algum vínculo neste cliente, o novo vale
    -- a partir de agora (o intervalo entre o encerramento e o recadastro fica
    -- "Sem cadastro"). Só placa que nunca teve vínculo fica retroativa (null).
    if exists (
      select 1 from public.veiculos
       where cliente_id = p_cliente_id
         and public.placa_mercosul(placa) = v_chave
    ) then
      v_desde := v_agora;
    else
      v_desde := null;
    end if;
  end if;

  begin
    insert into public.veiculos (
      cliente_id, placa, tipo_pessoa, nome_morador, unidade, unidade_id, marca, cor,
      origem, cadastrado_por, cadastrado_por_usuario, vigente_desde
    ) values (
      p_cliente_id, v_placa, p_tipo, v_nome, v_unidade, p_unidade_id, v_marca, v_cor,
      p_origem, nullif(trim(p_cadastrado_por), ''), p_usuario,
      v_desde
    )
    returning * into v_novo;
  exception when unique_violation then
    -- Rede de segurança (não deveria ocorrer com a trava acima, ex.: insert
    -- direto fora desta função): devolve o vigente gravado pelo outro.
    select * into v_novo
      from public.veiculos
     where cliente_id = p_cliente_id
       and public.placa_mercosul(placa) = v_chave
       and encerrado_em is null;
  end;

  return v_novo;
end;
$function$;

revoke all on function public.vincular_placa(uuid, text, text, text, text, uuid, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.vincular_placa(uuid, text, text, text, text, uuid, text, text, text, text, uuid)
  to service_role;

-- ============================================================
-- 6. Retenção: vínculos encerrados há mais de 6 meses
-- ============================================================
create or replace function public.cleanup_vinculos_encerrados()
 returns integer
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  deleted_count integer;
begin
  delete from public.veiculos
  where encerrado_em < now() - interval '6 months';

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$function$;

revoke all on function public.cleanup_vinculos_encerrados() from public, anon, authenticated;
