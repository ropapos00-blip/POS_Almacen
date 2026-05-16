-- 47_fix_void_manual_invoice_restore_credit.sql
-- Al anular factura manual:
-- 1) restaura inventario de items con variant_id
-- 2) devuelve al saldo a favor el credit_applied_total de esa factura (si aplica)
-- 3) deja trazabilidad en manual_invoice_credit_movements

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
  v_reason text;
  v_item record;
  v_credit_to_restore numeric := 0;
  v_phone text;
  v_customer_name text;
  v_balance_after numeric := 0;
begin
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

  -- 1) Restaurar inventario de items vinculados
  for v_item in
    select variant_id, quantity
    from public.manual_invoice_items
    where manual_invoice_id = p_invoice_id
      and variant_id is not null
  loop
    update public.inventory_stock
    set quantity_on_hand = quantity_on_hand + v_item.quantity
    where variant_id = v_item.variant_id
      and store_id = v_invoice.store_id;
  end loop;

  -- 2) Reintegrar saldo aplicado en esta factura
  v_credit_to_restore := greatest(0, coalesce(v_invoice.credit_applied_total, 0));
  v_phone := nullif(trim(coalesce(v_invoice.customer_phone, '')), '');
  v_customer_name := nullif(trim(coalesce(v_invoice.customer_name, '')), '');

  if v_credit_to_restore > 0 and v_phone is not null then
    insert into public.manual_invoice_customer_credits (
      store_id,
      customer_phone,
      customer_name,
      balance,
      updated_at
    )
    values (
      v_invoice.store_id,
      v_phone,
      v_customer_name,
      v_credit_to_restore,
      now()
    )
    on conflict (store_id, customer_phone)
    do update
    set
      customer_name = coalesce(excluded.customer_name, public.manual_invoice_customer_credits.customer_name),
      balance = public.manual_invoice_customer_credits.balance + excluded.balance,
      updated_at = now()
    returning balance into v_balance_after;

    insert into public.manual_invoice_credit_movements (
      store_id,
      customer_phone,
      customer_name,
      movement_type,
      amount,
      balance_after,
      reference_type,
      reference_id,
      notes,
      created_by
    )
    values (
      v_invoice.store_id,
      v_phone,
      v_customer_name,
      'adjustment',
      v_credit_to_restore,
      v_balance_after,
      'manual_invoice',
      p_invoice_id,
      coalesce(v_reason, 'Reintegro de saldo por anulacion de factura con credito aplicado'),
      p_actor_user_id
    );
  end if;

  -- 3) Eliminar items y anular factura
  delete from public.manual_invoice_items
  where manual_invoice_id = p_invoice_id;

  update public.manual_invoices
  set
    subtotal = 0,
    discount_total = 0,
    credit_applied_total = 0,
    grand_total = 0,
    is_active = false,
    notes = coalesce(v_reason, notes, 'Anulada manualmente desde admin')
  where id = p_invoice_id
    and is_active = true;

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
      'subtotal', v_invoice.subtotal,
      'discount_total', v_invoice.discount_total,
      'credit_applied_total', v_invoice.credit_applied_total,
      'grand_total', v_invoice.grand_total
    ),
    jsonb_build_object(
      'subtotal', 0,
      'discount_total', 0,
      'credit_applied_total', 0,
      'grand_total', 0,
      'is_active', false,
      'credit_restored', v_credit_to_restore,
      'reason', v_reason
    )
  );

  return query
  select v_invoice.id, v_invoice.invoice_number;
end;
$$;

grant execute on function public.void_manual_invoice_transaction(uuid, uuid, text) to authenticated;
