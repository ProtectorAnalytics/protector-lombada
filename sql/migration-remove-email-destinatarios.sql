-- Apaga a tabela antiga email_destinatarios (autorizado pelo CEO em 23/10/2026).
-- Desde a 1.11.0 os destinatários vivem em usuarios (recebe_alertas /
-- recebe_relatorio / so_email) e nenhum envio lê esta tabela. A única
-- dependência no banco era excluir_cliente_permanente, recriada aqui sem ela.

create or replace function public.excluir_cliente_permanente(p_cliente uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_veiculos int;
  v_capturas int;
  v_cameras int;
  v_unidades int;
  v_porteiros int;
  v_envios int;
  v_usuarios int;
  v_clientes int;
begin
  if p_cliente is null then
    raise exception 'p_cliente obrigatório';
  end if;

  delete from public.veiculos where cliente_id = p_cliente;
  get diagnostics v_veiculos = row_count;

  update public.cameras set last_capture_id = null
   where last_capture_id in (
     select c.id from public.capturas c
      where c.cliente_id = p_cliente
         or c.camera_id in (select k.id from public.cameras k where k.cliente_id = p_cliente)
   );

  delete from public.capturas
   where cliente_id = p_cliente
      or camera_id in (select k.id from public.cameras k where k.cliente_id = p_cliente);
  get diagnostics v_capturas = row_count;

  delete from public.cameras where cliente_id = p_cliente;
  get diagnostics v_cameras = row_count;

  delete from public.unidades where cliente_id = p_cliente;
  get diagnostics v_unidades = row_count;

  delete from public.porteiros where cliente_id = p_cliente;
  get diagnostics v_porteiros = row_count;

  delete from public.relatorio_envios where cliente_id = p_cliente;
  get diagnostics v_envios = row_count;

  delete from public.usuarios where cliente_id = p_cliente;
  get diagnostics v_usuarios = row_count;

  delete from public.clientes where id = p_cliente;
  get diagnostics v_clientes = row_count;

  return json_build_object(
    'clientes', v_clientes,
    'veiculos', v_veiculos,
    'capturas', v_capturas,
    'cameras', v_cameras,
    'unidades', v_unidades,
    'porteiros', v_porteiros,
    'relatorio_envios', v_envios,
    'usuarios', v_usuarios
  );
end;
$$;

revoke all on function public.excluir_cliente_permanente(uuid) from public, anon, authenticated;
grant execute on function public.excluir_cliente_permanente(uuid) to service_role;

comment on function public.excluir_cliente_permanente(uuid) is
  'Apaga o cliente e tudo que pertence a ele numa transação. Só service_role (backend).';

drop table if exists public.email_destinatarios;
