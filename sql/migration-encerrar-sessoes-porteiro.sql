-- Encerra todas as sessões de um usuário do Auth (Portaria 2.1, achado M1).
-- Chamada só pelo backend (service_role) em /api/admin/porteiros depois de
-- trocar a senha ou desativar um porteiro: os aparelhos já conectados deixam
-- de renovar o acesso.
--
-- auth.refresh_tokens.session_id → auth.sessions(id) ON DELETE CASCADE
-- (conferido em pg_constraint em 23/10/2026), então apagar a sessão derruba
-- os refresh tokens dela. Tokens antigos sem session_id são apagados à parte
-- (auth.refresh_tokens.user_id é varchar, daí o ::text).
create or replace function public.encerrar_sessoes_usuario(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null then
    raise exception 'p_user obrigatório';
  end if;
  delete from auth.sessions where user_id = p_user;
  delete from auth.refresh_tokens where user_id = p_user::text;
end;
$$;

revoke all on function public.encerrar_sessoes_usuario(uuid) from public, anon, authenticated;
grant execute on function public.encerrar_sessoes_usuario(uuid) to service_role;

comment on function public.encerrar_sessoes_usuario(uuid) is
  'Apaga as sessões e refresh tokens de um usuário do Auth. Só service_role (backend).';
