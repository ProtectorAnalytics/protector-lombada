-- Correção de desempenho das policies da base de veículos (APIPLACAS):
-- my_cliente_id() e is_super_admin() embrulhadas em (select ...) para virarem
-- initplan (avaliadas uma vez por consulta, não por linha). Só recria policies.

drop policy if exists "veiculos_base_select_escopo" on public.veiculos_base;
create policy "veiculos_base_select_escopo" on public.veiculos_base
  for select to authenticated
  using (
    (select public.is_super_admin())
    or exists (
      select 1 from public.capturas c
      where c.cliente_id = (select public.my_cliente_id())
        and c.placa in (veiculos_base.placa, veiculos_base.placa_antiga)
    )
    or exists (
      select 1 from public.veiculos v
      where v.cliente_id = (select public.my_cliente_id())
        and v.placa in (veiculos_base.placa, veiculos_base.placa_antiga)
    )
  );

drop policy if exists "apiplacas_config_select_admin" on public.apiplacas_config;
create policy "apiplacas_config_select_admin" on public.apiplacas_config
  for select to authenticated using ((select public.is_super_admin()));

drop policy if exists "apiplacas_consultas_select_admin" on public.apiplacas_consultas;
create policy "apiplacas_consultas_select_admin" on public.apiplacas_consultas
  for select to authenticated using ((select public.is_super_admin()));
