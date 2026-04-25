-- 32_fix_void_manual_invoice_restore_inventory.sql
-- Fixes void_manual_invoice_transaction to restore inventory_stock
-- for items that were linked to a product variant (variant_id IS NOT NULL)
-- when the invoice was created via create_manual_invoice_transaction.

drop function if exists public.void_manual_invoice_transaction(uuid, uuid, text);

create or replace function public.void_manual_invoice_transaction(
  p_invoice_id uuid,
  p_actor_user_id uuid,
  p_reason text default null
)
returns table (invoice_id uuid, invoice_number text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_invoice public.manual_invoices%rowtype;
  v_reason  text;
  v_item    record;
begin
  -- ── 1. Load and validate invoice ─────────────────────────────────────────
  select *
  into v_invoice
  from public.manual_invoices
  where id = p_invoice_id
    and is_active = true;

  if not found then
    raise exception 'Factura manual no encontrada o ya anulada.';
  end if;

  if not (v_invoice.store_id in (select public.current_user_store_ids())) then
    raise exception 'Usuario sin acceso a la tienda de esta factura manual.';
  end if;

  if not (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  ) then
    raise exception 'Solo admin o super admin pueden eliminar facturas manuales.';
  end if;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');

  -- ── 2. Restore inventory for linked items ─────────────────────────────────
  for v_item in
    select variant_id, quantity
    from public.manual_invoice_items
    where manual_invoice_id = p_invoice_id
      and variant_id is not null
  loop
    update public.inventory_stock
    set quantity_on_hand = quantity_on_hand + v_item.quantity
    where variant_id = v_item.variant_id
      and store_id   = v_invoice.store_id;
  end loop;

  -- ── 3. Delete items ───────────────────────────────────────────────────────
  delete from public.manual_invoice_items
  where manual_invoice_id = p_invoice_id;

  -- ── 4. Void the invoice ───────────────────────────────────────────────────
  update public.manual_invoices
  set
    subtotal       = 0,
    discount_total = 0,
    grand_total    = 0,
    is_active      = false,
    notes          = coalesce(v_reason, notes, 'Anulada manualmente desde admin')
  where id = p_invoice_id
    and is_active = true;

  -- ── 5. Audit log ──────────────────────────────────────────────────────────
  insert into public.audit_logs (
    store_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    payload_before,
    payload_after
  )
  values (
    v_invoice.store_id,
    p_actor_user_id,
    'manual_invoice_voided',
    'manual_invoices',
    p_invoice_id,
    jsonb_build_object(
      'subtotal',       v_invoice.subtotal,
      'discount_total', v_invoice.discount_total,
      'grand_total',    v_invoice.grand_total
    ),
    jsonb_build_object(
      'subtotal',    0,
      'discount_total', 0,
      'grand_total', 0,
      'is_active',   false,
      'reason',      v_reason
    )
  );

  return query
  select v_invoice.id, v_invoice.invoice_number;
end;
$$;

grant execute on function public.void_manual_invoice_transaction(uuid, uuid, text) to authenticated;
