-- 29_fix_manual_invoice_concurrent_number.sql
-- Protege la generacion del consecutivo de factura manual con
-- pg_advisory_xact_lock para evitar colisiones concurrentes que
-- producen "duplicate key value violates unique constraint
-- manual_invoices_store_id_invoice_number_key".

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

  if p_payment_method not in ('cash', 'addi', 'credilondon', 'dataphone', 'bancolombia', 'daviplata', 'nequi') then
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

  -- Bloqueo exclusivo por tienda para evitar colisiones concurrentes
  -- en la generacion del consecutivo (mismo patron que create_sale_transaction).
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
