-- ============================================================================
-- Base única de veículos (APIPLACAS)
-- Spec: docs/superpowers/specs/2026-10-04-apiplacas-base-veiculos-design.md
--
-- Só cria objetos; nada destrutivo. Escrita exclusiva do servidor (service
-- role). Leitura do painel limitada às placas que passaram no próprio cliente.
-- ============================================================================

create table if not exists public.veiculos_base (
  placa                 text primary key check (placa ~ '^[A-Z]{3}[0-9][A-Z][0-9]{2}$'),
  placa_antiga          text unique check (placa_antiga is null or placa_antiga ~ '^[A-Z]{3}[0-9]{4}$'),
  status                text not null check (status in ('pendente','consultado','sem_resultado','suspeita','erro')),
  suspeita_de           text,
  suspeita_cliente_id   uuid references public.clientes(id) on delete set null,
  marca                 text,
  modelo                text,
  versao                text,
  cor                   text,
  cor_normalizada       text,
  ano_fabricacao        smallint,
  ano_modelo            smallint,
  municipio             text,
  uf                    text,
  tipo_veiculo          text,
  situacao              text,
  consultado_em         timestamptz,
  tentativas            smallint not null default 0,
  proxima_tentativa_em  timestamptz,
  ultimo_erro           text,
  visto_por_ultimo_em   timestamptz not null default now(),
  criado_em             timestamptz not null default now()
);

create index if not exists idx_veiculos_base_fila
  on public.veiculos_base (proxima_tentativa_em)
  where status in ('pendente','erro');
create index if not exists idx_veiculos_base_visto
  on public.veiculos_base (visto_por_ultimo_em);

create table if not exists public.apiplacas_config (
  id                 smallint primary key default 1 check (id = 1),
  ativo              boolean not null default false,
  preco_consulta     numeric(10,4) not null default 0.03 check (preco_consulta >= 0),
  teto_mensal        numeric(10,2) not null default 150 check (teto_mensal >= 0),
  aviso_percentual   smallint not null default 80 check (aviso_percentual between 1 and 100),
  saldo_minimo       integer not null default 200 check (saldo_minimo >= 0),
  saldo_atual        integer,
  saldo_em           timestamptz,
  emails_aviso       text[] not null default array['glauber@appps.com.br','suporte@appps.com.br'],
  avisos_enviados    jsonb not null default '{}'::jsonb,
  atualizado_em      timestamptz not null default now(),
  atualizado_por     uuid
);
insert into public.apiplacas_config (id) values (1) on conflict (id) do nothing;

create table if not exists public.apiplacas_consultas (
  id           bigint generated always as identity primary key,
  placa        text not null,
  resultado    text not null check (resultado in ('ok','sem_resultado','placa_invalida','token_invalido','limite','timeout','erro')),
  http_status  smallint,
  duracao_ms   integer,
  custo        numeric(10,4) not null default 0,
  origem       text not null check (origem in ('captura','repescagem','reconsulta','validacao')),
  criado_em    timestamptz not null default now()
);
create index if not exists idx_apiplacas_consultas_criado
  on public.apiplacas_consultas (criado_em desc);

-- Gasto do mês corrente no fuso de Brasília
create or replace function public.apiplacas_gasto_mes()
returns numeric
language sql stable security definer
set search_path = pg_catalog, public
as $$
  select coalesce(sum(custo), 0)
  from public.apiplacas_consultas
  where criado_em >= (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');
$$;
revoke all on function public.apiplacas_gasto_mes() from public, anon, authenticated;
grant execute on function public.apiplacas_gasto_mes() to service_role;

-- RLS
alter table public.veiculos_base       enable row level security;
alter table public.apiplacas_config    enable row level security;
alter table public.apiplacas_consultas enable row level security;

-- Painel: só placas que passaram (ou estão cadastradas) no próprio cliente
create policy "veiculos_base_select_escopo" on public.veiculos_base
  for select to authenticated
  using (
    public.is_super_admin()
    or exists (
      select 1 from public.capturas c
      where c.cliente_id = public.my_cliente_id()
        and c.placa in (veiculos_base.placa, veiculos_base.placa_antiga)
    )
    or exists (
      select 1 from public.veiculos v
      where v.cliente_id = public.my_cliente_id()
        and v.placa in (veiculos_base.placa, veiculos_base.placa_antiga)
    )
  );

create policy "apiplacas_config_select_admin" on public.apiplacas_config
  for select to authenticated using (public.is_super_admin());

create policy "apiplacas_consultas_select_admin" on public.apiplacas_consultas
  for select to authenticated using (public.is_super_admin());
-- Sem políticas de INSERT/UPDATE/DELETE: só o service role escreve.
