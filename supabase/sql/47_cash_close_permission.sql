-- 47_cash_close_permission.sql
-- Permite a admin/super_admin habilitar o deshabilitar si el cajero puede cerrar caja.

alter table public.stores
  add column if not exists allow_cashier_close boolean not null default true;

drop function if exists public.update_store_cash_close_permission(uuid, boolean);
create or replace function public.update_store_cash_close_permission(
  p_store_id uuid,
  p_allow_cashier_close boolean
)
returns table (
  out_allow_cashier_close boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allow boolean := coalesce(p_allow_cashier_close, true);
begin
  if p_store_id is null then
    raise exception 'Store requerida.';
  end if;

  if not (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  ) then
    raise exception 'No autorizado.';
  end if;

  if not (p_store_id in (select public.current_user_store_ids())) then
    raise exception 'No tienes acceso a esta tienda.';
  end if;

  update public.stores
  set allow_cashier_close = v_allow
  where id = p_store_id;

  return query
  select s.allow_cashier_close
  from public.stores s
  where s.id = p_store_id;
end;
$$;

grant execute on function public.update_store_cash_close_permission(uuid, boolean) to authenticated;

drop policy if exists cash_register_sessions_update_policy on public.cash_register_sessions;
create policy cash_register_sessions_update_policy on public.cash_register_sessions
for update
using (
  store_id in (select public.current_user_store_ids())
  and (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
    or (
      public.current_user_has_role('cashier')
      and status = 'open'
      and coalesce(
        (select s.allow_cashier_close from public.stores s where s.id = cash_register_sessions.store_id),
        true
      )
    )
  )
)
with check (
  store_id in (select public.current_user_store_ids())
  and (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
    or (
      public.current_user_has_role('cashier')
      and status = 'closed'
      and closed_by = auth.uid()
      and closed_at is not null
      and cash_counted is not null
      and coalesce(
        (select s.allow_cashier_close from public.stores s where s.id = cash_register_sessions.store_id),
        true
      )
    )
  )
);
