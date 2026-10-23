-- Módulo Portaria 2.2 — e-mails pelo cadastro de usuários.
--
-- 1. usuarios.recebe_alertas ("Recebe alertas de excesso") e
--    usuarios.recebe_relatorio ("Recebe relatório periódico"): padrão false.
-- 2. Tipo novo 'so_email' ("Só recebe e-mail"): contato sem login, sem senha,
--    sem acesso ao painel. Por isso auth_id deixa de ser obrigatório, mas só
--    o so_email fica sem auth_id (e todo so_email pertence a um cliente).
-- 3. Um so_email por e-mail (sem maiúsculas/espaços) em cada cliente.
-- 4. Copia email_destinatarios ativo para usuarios, por cliente:
--    - e-mail de admin_cliente/operador ATIVO do mesmo cliente → liga as
--      opções nele (OR, nunca desliga);
--    - senão (sem usuário, usuário de outro cliente, super_admin, usuário
--      inativo) → so_email do cliente do destinatário (OR na reexecução).
--    alerta = tipo alerta|todos; relatório = tipo relatorio|todos.
--    Idempotente: pode rodar de novo antes do merge para pegar destinatários
--    criados no meio, sem duplicar nem desligar opção.
--
-- email_destinatarios NÃO é apagada (fica como cópia; apagar exige "sim" do
-- CEO). RLS não muda: authenticated só lê a própria linha (auth_id =
-- auth.uid()), então linhas so_email (auth_id nulo) nunca casam nem com os
-- helpers is_super_admin()/my_role()/my_cliente_id() (null = x é null).
--
-- Aplicar via MCP do Supabase (apply_migration, nome usuarios_avisos_email)
-- só depois da revisão. Teste: test/sql/usuarios-avisos-email.sql.

alter table public.usuarios
  add column if not exists recebe_alertas boolean not null default false,
  add column if not exists recebe_relatorio boolean not null default false;

alter table public.usuarios drop constraint if exists usuarios_role_check;
alter table public.usuarios add constraint usuarios_role_check
  check (role in ('super_admin', 'admin_cliente', 'operador', 'portaria', 'so_email'));

alter table public.usuarios alter column auth_id drop not null;

alter table public.usuarios drop constraint if exists usuarios_so_email_sem_login;
alter table public.usuarios add constraint usuarios_so_email_sem_login
  check ((role = 'so_email') = (auth_id is null)
         and (role <> 'so_email' or cliente_id is not null));

create unique index if not exists uq_usuarios_so_email_cliente
  on public.usuarios (cliente_id, lower(trim(email)))
  where role = 'so_email';

-- ── Dados: email_destinatarios ativo → usuarios ────────────────────────────
with dest as (
  select d.cliente_id,
         lower(trim(d.email)) as email,
         (array_agg(coalesce(nullif(trim(d.nome), ''), lower(trim(d.email)))
                    order by d.criado_em nulls last, d.nome))[1] as nome,
         bool_or(d.tipo in ('alerta', 'todos')) as alertas,
         bool_or(d.tipo in ('relatorio', 'todos')) as relatorio
  from public.email_destinatarios d
  where d.ativo is true and length(trim(d.email)) > 0
  group by d.cliente_id, lower(trim(d.email))
)
update public.usuarios u
   set recebe_alertas = u.recebe_alertas or dest.alertas,
       recebe_relatorio = u.recebe_relatorio or dest.relatorio
  from dest
 where u.cliente_id = dest.cliente_id
   and lower(trim(u.email)) = dest.email
   and u.role in ('admin_cliente', 'operador')
   and u.ativo is true;

with dest as (
  select d.cliente_id,
         lower(trim(d.email)) as email,
         (array_agg(coalesce(nullif(trim(d.nome), ''), lower(trim(d.email)))
                    order by d.criado_em nulls last, d.nome))[1] as nome,
         bool_or(d.tipo in ('alerta', 'todos')) as alertas,
         bool_or(d.tipo in ('relatorio', 'todos')) as relatorio
  from public.email_destinatarios d
  where d.ativo is true and length(trim(d.email)) > 0
  group by d.cliente_id, lower(trim(d.email))
)
insert into public.usuarios (cliente_id, nome, email, role, ativo, recebe_alertas, recebe_relatorio)
select dest.cliente_id, dest.nome, dest.email, 'so_email', true, dest.alertas, dest.relatorio
  from dest
 where not exists (
   select 1 from public.usuarios u
    where u.cliente_id = dest.cliente_id
      and lower(trim(u.email)) = dest.email
      and u.role in ('admin_cliente', 'operador')
      and u.ativo is true)
on conflict (cliente_id, lower(trim(email))) where role = 'so_email'
do update set recebe_alertas = usuarios.recebe_alertas or excluded.recebe_alertas,
              recebe_relatorio = usuarios.recebe_relatorio or excluded.recebe_relatorio;
