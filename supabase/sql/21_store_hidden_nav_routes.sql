-- 21_store_hidden_nav_routes.sql
-- Permite al super admin ocultar/mostrar rutas del menu por almacen.

alter table public.stores
  add column if not exists hidden_nav_routes text[] not null default '{}';

drop function if exists public.update_store_hidden_nav_routes(uuid, text[]);

create or replace function public.update_store_hidden_nav_routes(
  p_store_id uuid,
  p_hidden_routes text[] default '{}'
)
returns table (
  out_store_id uuid,
  out_hidden_routes text[]
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_hidden_routes text[];
begin
  if not public.current_user_has_role('super_admin') then
    raise exception 'Solo super_admin puede cambiar la visibilidad del menu.';
  end if;

  if not (p_store_id in (select public.current_user_store_ids())) then
    raise exception 'No tienes acceso al almacen indicado.';
  end if;

  select coalesce(array_agg(distinct trim(value)), '{}'::text[])
  into v_hidden_routes
  from unnest(coalesce(p_hidden_routes, '{}'::text[])) as value
  where trim(value) <> '';

  update public.stores
    set hidden_nav_routes = coalesce(v_hidden_routes, '{}'::text[])
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
    'store_hidden_nav_routes_updated',
    'stores',
    p_store_id,
    jsonb_build_object('hidden_nav_routes', coalesce(v_hidden_routes, '{}'::text[]))
  );

  return query
  select
    p_store_id,
    coalesce(v_hidden_routes, '{}'::text[]);
end;
$$;

grant execute on function public.update_store_hidden_nav_routes(uuid, text[]) to authenticated;
