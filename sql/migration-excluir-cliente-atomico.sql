-- Exclusão permanente de cliente numa única transação (v1.11.1).
-- Antes, /api/admin/clientes apagava veículos, contatos, câmeras e usuários em
-- chamadas separadas: uma falha no meio deixava o cliente pela metade. Agora o
-- backend (service_role) chama esta função e tudo é apagado ou nada é.
--
-- FKs que apontam para public.clientes (conferido em pg_constraint em 23/10/2026):
--   cameras, capturas, email_destinatarios, porteiros, relatorio_envios,
--   unidades, veiculos ........................ ON DELETE CASCADE
--   usuarios.cliente_id ....................... ON DELETE SET NULL
--   veiculos_base.suspeita_cliente_id ......... ON DELETE SET NULL
-- Dependências indiretas:
--   capturas.camera_id → cameras ON DELETE CASCADE
--   cameras.last_capture_id → capturas (NO ACTION): zerado antes de apagar as
--     capturas, para não travar se alguma câmera apontar para captura do cliente.
--   veiculos.unidade_id → unidades ON DELETE SET NULL (veículos saem antes).
--   audit_log.usuario_id e solicitacoes_titular.respondida_por → usuarios
--     ON DELETE SET NULL (histórico de auditoria preservado).
-- usuarios precisa ser apagado explicitamente: com SET NULL, um so_email sem
-- cliente viola o check da Portaria 2.2. Contas do Auth (auth.users) não são
-- tocadas aqui, como já acontecia na rota.
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
  v_destinatarios int;
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

  delete from public.email_destinatarios where cliente_id = p_cliente;
  get diagnostics v_destinatarios = row_count;

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
    'email_destinatarios', v_destinatarios,
    'relatorio_envios', v_envios,
    'usuarios', v_usuarios
  );
end;
$$;

revoke all on function public.excluir_cliente_permanente(uuid) from public, anon, authenticated;
grant execute on function public.excluir_cliente_permanente(uuid) to service_role;

comment on function public.excluir_cliente_permanente(uuid) is
  'Apaga o cliente e tudo que pertence a ele numa transação. Só service_role (backend).';
