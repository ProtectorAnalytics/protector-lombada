-- ============================================================================
-- APIPLACAS — extrato sem placa eterna (LGPD) + escopo do painel só por captura
-- Spec: docs/superpowers/specs/2026-10-04-apiplacas-base-veiculos-design.md
--
-- Nada destrutivo de dados: só nullability, grants e a recriação de uma policy.
-- ============================================================================

-- 1. O extrato fica para cobrança (data, resultado, custo), mas a placa sai
--    depois de 6 meses (cron) ou quando a eliminação é atendida (direitos).
alter table public.apiplacas_consultas alter column placa drop not null;

-- 2. Só o service role escreve na config e no extrato (RLS já negava; agora o
--    grant também nega).
revoke insert, update, delete, truncate on public.apiplacas_config, public.apiplacas_consultas
  from anon, authenticated;

-- 3. Cadastro em veiculos não é prova de "visto": o painel só enxerga placas
--    capturadas no próprio cliente. Mantém (select …) para virar initplan.
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
  );
