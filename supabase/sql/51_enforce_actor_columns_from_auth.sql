-- 51_enforce_actor_columns_from_auth.sql
-- Seguridad (hallazgo de react-doctor: "Client writes Supabase authorization field"):
-- El cliente insertaba movimientos de inventario / referencias de confeccion
-- enviando el id del usuario "actor" (performed_by / created_by) como valor
-- arbitrario desde el navegador. Nada impedia que un cliente modificado
-- insertara ese registro atribuyendolo a OTRO usuario (suplantacion de autoria),
-- ya que las policies de RLS solo validaban store_id + rol, no el actor.
--
-- Esta migracion agrega el requisito "performed_by/created_by = auth.uid()"
-- SOLO en las policies de INSERT de escritura directa desde el cliente.
-- No se toca ninguna funcion RPC (create_sale_transaction, wholesale credit
-- automation, etc.): esas son SECURITY DEFINER y ya insertan sus propios
-- movimientos server-side; esta migracion no cambia su comportamiento.
--
-- Tampoco afecta UPDATE/DELETE existentes (p. ej. desactivar una referencia
-- de confeccion creada por otro admin) porque esas operaciones se separan en
-- su propia policy sin el chequeo de actor.

-- inventory_movements: la policy ya era "for insert" -> solo se agrega el chequeo de actor.
drop policy if exists inventory_movements_write_policy on public.inventory_movements;
create policy inventory_movements_write_policy on public.inventory_movements
for insert
with check (
  store_id in (select public.current_user_store_ids())
  and (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  )
  and performed_by = auth.uid()
);

-- wholesale_references: se separa "for all" en insert (con chequeo de actor)
-- y update/delete (sin chequeo de actor, igual que antes).
drop policy if exists wholesale_references_write_policy on public.wholesale_references;

create policy wholesale_references_insert_policy on public.wholesale_references
for insert
with check (
  store_id in (select public.current_user_store_ids())
  and (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  )
  and created_by = auth.uid()
);

create policy wholesale_references_update_delete_policy on public.wholesale_references
for update
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

drop policy if exists wholesale_references_delete_policy on public.wholesale_references;
create policy wholesale_references_delete_policy on public.wholesale_references
for delete
using (
  store_id in (select public.current_user_store_ids())
  and (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  )
);

-- wholesale_reference_movements: mismo patron que wholesale_references.
drop policy if exists wholesale_reference_movements_write_policy on public.wholesale_reference_movements;

create policy wholesale_reference_movements_insert_policy on public.wholesale_reference_movements
for insert
with check (
  store_id in (select public.current_user_store_ids())
  and (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  )
  and performed_by = auth.uid()
);

create policy wholesale_reference_movements_update_policy on public.wholesale_reference_movements
for update
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

drop policy if exists wholesale_reference_movements_delete_policy on public.wholesale_reference_movements;
create policy wholesale_reference_movements_delete_policy on public.wholesale_reference_movements
for delete
using (
  store_id in (select public.current_user_store_ids())
  and (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  )
);
