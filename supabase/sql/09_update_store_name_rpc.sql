-- 09_update_store_name_rpc.sql
-- Permite al super_admin renombrar el almacen de su contexto actual

drop function if exists public.update_store_name(uuid, text);

create or replace function public.update_store_name(
  p_store_id uuid,
  p_store_name text
)
returns table (out_store_id uuid, out_store_name text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_name text;
begin
  v_name := trim(coalesce(p_store_name, ''));

  if v_name = '' then
    raise exception 'Nombre de almacen requerido.';
  end if;

  if length(v_name) < 3 then
    raise exception 'El nombre del almacen debe tener al menos 3 caracteres.';
  end if;

  if not public.current_user_has_role('super_admin') then
    raise exception 'Solo super_admin puede cambiar el nombre del almacen.';
  end if;

  if not (p_store_id in (select public.current_user_store_ids())) then
    raise exception 'No tienes acceso al almacen indicado.';
  end if;

  update public.stores
  set name = v_name
  where id = p_store_id;

  if not found then
    raise exception 'Almacen no encontrado.';
  end if;

  insert into public.audit_logs (
    store_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    payload_after
  )
  values (
    p_store_id,
    auth.uid(),
    'store_name_updated',
    'stores',
    p_store_id,
    jsonb_build_object('name', v_name)
  );

  return query
  select p_store_id, v_name;
end;
$$;

grant execute on function public.update_store_name(uuid, text) to authenticated;
