-- 30_fix_rpc_payment_methods.sql
-- Adds 'mixed' (and all new payment methods) to the RPC validation in
-- create_manual_invoice_transaction and update_manual_invoice_header.
-- Also fixes update_manual_invoice_header to preserve payment_reference
-- for mixed payments (it stores the encoded "method1:amt1:method2:amt2" breakdown).

-- ============================================================
-- 1. Patch create_manual_invoice_transaction
--    (replace the p_payment_method check to include 'mixed')
-- ============================================================
drop function if exists public.create_manual_invoice_transaction(uuid, uuid, text, numeric, text, text, jsonb);
drop function if exists public.create_manual_invoice_transaction(uuid, uuid, text, numeric, text, text, jsonb, text);
drop function if exists public.create_manual_invoice_transaction(uuid, uuid, text, text, numeric, text, text, jsonb, text);

create or replace function public.create_manual_invoice_transaction(
  p_store_id uuid,
  p_created_by uuid,
  p_customer_name text,
  p_customer_phone text,
  p_discount_total numeric,
  p_payment_method text,
  p_payment_reference text,
  p_items jsonb,
  p_notes text default null
)
returns table (invoice_id uuid, invoice_number text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_invoice_number text;
  v_subtotal numeric := 0;
  v_discount_total numeric := coalesce(p_discount_total, 0);
  v_grand_total numeric := 0;
  v_item jsonb;
  v_description text;
  v_qty integer;
  v_price numeric;
  v_line_total numeric;
  v_mixed_parts text[];
  v_mixed_sum numeric;
begin
  if not (p_store_id in (select public.current_user_store_ids())) then
    raise exception 'Usuario sin acceso a la tienda.';
  end if;

  if not (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
    or public.current_user_has_role('cashier')
  ) then
    raise exception 'Usuario sin permisos para facturacion manual.';
  end if;

  if p_payment_method not in (
    'cash', 'addi', 'credilondon', 'dataphone',
    'bancolombia', 'daviplata', 'nequi', 'mixed'
  ) then
    raise exception 'Metodo de pago invalido.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La factura manual requiere al menos un item.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_description := trim(coalesce(v_item->>'description', ''));
    v_qty := coalesce((v_item->>'quantity')::integer, 0);
    v_price := coalesce((v_item->>'unit_price')::numeric, 0);

    if v_description = '' then
      raise exception 'Descripcion de item requerida.';
    end if;

    if v_qty <= 0 then
      raise exception 'Cantidad invalida en items.';
    end if;

    if v_price < 0 then
      raise exception 'Precio invalido en items.';
    end if;

    v_line_total := v_qty * v_price;
    v_subtotal := v_subtotal + v_line_total;
  end loop;

  if v_discount_total < 0 then
    raise exception 'Descuento invalido.';
  end if;

  if v_discount_total > v_subtotal then
    raise exception 'Descuento no puede superar subtotal.';
  end if;

  v_grand_total := v_subtotal - v_discount_total;

  -- Validate mixed payment: sum of both amounts must equal grand total
  if p_payment_method = 'mixed' then
    v_mixed_parts := string_to_array(coalesce(p_payment_reference, ''), ':');
    if array_length(v_mixed_parts, 1) = 4 then
      v_mixed_sum := coalesce(v_mixed_parts[2]::numeric, 0) + coalesce(v_mixed_parts[4]::numeric, 0);
      if abs(v_mixed_sum - v_grand_total) > 1 then
        raise exception 'Los montos del pago mixto (%) no coinciden con el total de la factura (%).', v_mixed_sum, v_grand_total;
      end if;
    end if;
  end if;

  -- Bloqueo exclusivo por tienda para evitar colisiones concurrentes
  perform pg_advisory_xact_lock(hashtext('manual_invoice:' || p_store_id::text));

  -- Buscar el último número correlativo de factura para la tienda
  select mi.invoice_number into v_invoice_number
  from public.manual_invoices mi
  where mi.store_id = p_store_id
    and mi.invoice_number ~ '^No Venta [0-9]+$'
  order by length(mi.invoice_number) desc, mi.invoice_number desc
  limit 1;

  declare
    v_next_number integer;
  begin
    if v_invoice_number is not null then
      v_next_number := (regexp_replace(v_invoice_number, '[^0-9]', '', 'g'))::integer + 1;
    else
      v_next_number := 1;
    end if;
    if v_next_number < 10000 then
      v_invoice_number := 'No Venta ' || lpad(v_next_number::text, 4, '0');
    else
      v_invoice_number := 'No Venta ' || v_next_number::text;
    end if;
  end;

  insert into public.manual_invoices (
    store_id,
    invoice_number,
    customer_name,
    customer_phone,
    notes,
    subtotal,
    discount_total,
    grand_total,
    payment_method,
    payment_reference,
    created_by,
    source
  )
  values (
    p_store_id,
    v_invoice_number,
    nullif(trim(coalesce(p_customer_name, '')), ''),
    nullif(trim(coalesce(p_customer_phone, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    v_subtotal,
    v_discount_total,
    v_grand_total,
    p_payment_method,
    nullif(trim(coalesce(p_payment_reference, '')), ''),
    p_created_by,
    'provisional'
  )
  returning id into v_invoice_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_description := trim(coalesce(v_item->>'description', ''));
    v_qty := coalesce((v_item->>'quantity')::integer, 0);
    v_price := coalesce((v_item->>'unit_price')::numeric, 0);
    v_line_total := v_qty * v_price;

    insert into public.manual_invoice_items (
      manual_invoice_id,
      description,
      quantity,
      unit_price,
      line_total
    )
    values (
      v_invoice_id,
      v_description,
      v_qty,
      v_price,
      v_line_total
    );
  end loop;

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
    p_created_by,
    'manual_invoice_created',
    'manual_invoices',
    v_invoice_id,
    jsonb_build_object('invoice_number', v_invoice_number, 'grand_total', v_grand_total)
  );

  return query select v_invoice_id, v_invoice_number;
end;
$$;

grant execute on function public.create_manual_invoice_transaction(uuid, uuid, text, text, numeric, text, text, jsonb, text) to authenticated;

-- ============================================================
-- 2. Patch update_manual_invoice_header
--    - Allow all payment methods (including new ones + mixed)
--    - Preserve payment_reference for any non-cash method
--      (mixed stores "method1:amt1:method2:amt2" encoded in it)
-- ============================================================
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

  if p_payment_method not in (
    'cash', 'addi', 'credilondon', 'dataphone',
    'bancolombia', 'daviplata', 'nequi', 'mixed'
  ) then
    raise exception 'Metodo de pago invalido.';
  end if;

  -- Preserve payment_reference for any method except cash
  -- (mixed uses it to store the encoded "method1:amt1:method2:amt2" breakdown)
  if p_payment_method = 'cash' then
    v_payment_reference := null;
  else
    v_payment_reference := nullif(trim(coalesce(p_payment_reference, '')), '');
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
