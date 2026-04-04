-- 07_discount_authorization_and_cashier_inventory.sql
-- 1) Inventario solo admin/super_admin
-- 2) Descuento de cajero requiere autorizacion de admin/super_admin por clave

create extension if not exists pgcrypto with schema extensions;

-- Inventario: habilitar escritura para cajero tambien
-- Inventario: solo admin/super_admin pueden escribir

drop policy if exists inventory_stock_write_policy on public.inventory_stock;
create policy inventory_stock_write_policy on public.inventory_stock
for all
using (
  store_id in (select public.current_user_store_ids())
  and (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  )
)
with check (
  store_id in (select public.current_user_store_ids())
  and (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  )
);

drop policy if exists inventory_movements_write_policy on public.inventory_movements;
create policy inventory_movements_write_policy on public.inventory_movements
for insert
with check (
  store_id in (select public.current_user_store_ids())
  and (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  )
);

-- Autorizacion de descuento para cajero

drop function if exists public.authorize_discount_override(uuid, text, text, numeric);

create or replace function public.authorize_discount_override(
  p_store_id uuid,
  p_admin_email text,
  p_admin_password text,
  p_requested_discount numeric
)
returns table (
  out_authorized boolean,
  out_admin_user_id uuid,
  out_admin_name text,
  out_role_code text
)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_email text;
  v_admin_user_id uuid;
  v_admin_name text;
  v_role_code text;
  v_password_ok boolean := false;
begin
  if not (p_store_id in (select public.current_user_store_ids())) then
    raise exception 'No tienes acceso a la tienda indicada.';
  end if;

  if coalesce(p_requested_discount, 0) <= 0 then
    raise exception 'El descuento debe ser mayor a 0.';
  end if;

  v_email := lower(trim(coalesce(p_admin_email, '')));
  if v_email = '' then
    raise exception 'Correo de autorizacion requerido.';
  end if;

  if coalesce(p_admin_password, '') = '' then
    raise exception 'Clave de autorizacion requerida.';
  end if;

  select u.id, p.full_name, r.code
  into v_admin_user_id, v_admin_name, v_role_code
  from auth.users u
  join public.profiles p on p.id = u.id and p.is_active = true
  join public.user_store_roles usr on usr.user_id = u.id and usr.is_active = true
  join public.roles r on r.id = usr.role_id
  where usr.store_id = p_store_id
    and lower(u.email) = v_email
    and r.code in ('super_admin', 'admin')
  limit 1;

  if v_admin_user_id is null then
    raise exception 'No existe un admin/super admin activo con ese correo en la tienda.';
  end if;

  if v_admin_user_id = auth.uid() then
    raise exception 'Debe autorizar otro usuario admin/super admin.';
  end if;

  select (u.encrypted_password = extensions.crypt(p_admin_password, u.encrypted_password))
  into v_password_ok
  from auth.users u
  where u.id = v_admin_user_id;

  if not coalesce(v_password_ok, false) then
    raise exception 'Clave de autorizacion invalida.';
  end if;

  return query
  select true, v_admin_user_id, coalesce(v_admin_name, 'Admin'), v_role_code;
end;
$$;

grant execute on function public.authorize_discount_override(uuid, text, text, numeric) to authenticated;
