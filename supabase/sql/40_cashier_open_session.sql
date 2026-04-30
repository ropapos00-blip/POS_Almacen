-- 40_cashier_open_session.sql
-- Permite al cajero abrir la sesion del dia usando la base predeterminada
-- (la base de la ultima sesion). Sin este permiso el cajero quedaba bloqueado
-- si el administrador no estaba presente.

-- Actualizar la politica de INSERT para incluir al cajero
drop policy if exists cash_register_sessions_insert_policy on public.cash_register_sessions;

create policy cash_register_sessions_insert_policy on public.cash_register_sessions
for insert
with check (
  store_id in (select public.current_user_store_ids())
  and (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
    or public.current_user_has_role('cashier')
  )
);
