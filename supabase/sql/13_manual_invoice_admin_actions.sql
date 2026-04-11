-- 13_manual_invoice_admin_actions.sql
-- Acciones administrativas para facturacion manual provisional:
-- editar encabezado y anular en cero sin impacto de inventario.

drop function if exists public.update_manual_invoice_header(uuid, uuid, text, text, text, text);

create or replace function public.update_manual_invoice_header(
  p_invoice_id uuid,
  p_actor_user_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_payment_method text,
  p_payment_reference text default null
)
returns table (invoice_id uuid, invoice_number text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_invoice public.manual_invoices%rowtype;
  v_payment_reference text;
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
    raise exception 'Solo admin o super admin pueden editar facturas manuales.';
  end if;

  if p_payment_method not in ('cash', 'card', 'transfer', 'mixed') then
    raise exception 'Metodo de pago invalido.';
  end if;

  if p_payment_method in ('card', 'transfer') then
    v_payment_reference := nullif(trim(coalesce(p_payment_reference, '')), '');
  else
    v_payment_reference := null;
  end if;

  update public.manual_invoices
  set
    customer_name = nullif(trim(coalesce(p_customer_name, '')), ''),
    customer_phone = nullif(trim(coalesce(p_customer_phone, '')), ''),
    payment_method = p_payment_method,
    payment_reference = v_payment_reference
  where id = p_invoice_id
    and is_active = true;

  insert into public.audit_logs (
    store_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    payload_after
  )
  values (
    v_invoice.store_id,
    p_actor_user_id,
    'manual_invoice_updated',
    'manual_invoices',
    p_invoice_id,
    jsonb_build_object(
      'customer_name', nullif(trim(coalesce(p_customer_name, '')), ''),
      'customer_phone', nullif(trim(coalesce(p_customer_phone, '')), ''),
      'payment_method', p_payment_method,
      'payment_reference', v_payment_reference
    )
  );

  return query
  select v_invoice.id, v_invoice.invoice_number;
end;
$$;

grant execute on function public.update_manual_invoice_header(uuid, uuid, text, text, text, text) to authenticated;

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

  delete from public.manual_invoice_items
  where manual_invoice_id = p_invoice_id;

  update public.manual_invoices
  set
    subtotal = 0,
    discount_total = 0,
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
      'grand_total', v_invoice.grand_total
    ),
    jsonb_build_object(
      'subtotal', 0,
      'discount_total', 0,
      'grand_total', 0,
      'is_active', false,
      'reason', v_reason
    )
  );

  return query
  select v_invoice.id, v_invoice.invoice_number;
end;
$$;

grant execute on function public.void_manual_invoice_transaction(uuid, uuid, text) to authenticated;