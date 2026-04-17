-- 04_pos_sale_rpc.sql
-- Funcion transaccional para confirmar venta desde POS

create or replace function public.create_sale_transaction(
  p_store_id uuid,
  p_sold_by uuid,
  p_discount_total numeric,
  p_customer_name text,
  p_items jsonb,
  p_payments jsonb
)
returns table (sale_id uuid, sale_number text)
language plpgsql
security invoker
as $$
declare
  v_sale_id uuid;
  v_sale_number text;
  v_subtotal numeric := 0;
  v_cost_total numeric := 0;
  v_discount_total numeric := coalesce(p_discount_total, 0);
  v_tax_total numeric := 0;
  v_grand_total numeric := 0;
  v_item jsonb;
  v_variant record;
  v_stock record;
  v_qty integer;
  v_line_total numeric;
  v_pay_total numeric := 0;
  v_payment jsonb;
  v_next_number integer := 1;
begin
  if not (p_store_id in (select public.current_user_store_ids())) then
    raise exception 'Usuario sin acceso a la tienda.';
  end if;

  if not (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
    or public.current_user_has_role('cashier')
  ) then
    raise exception 'Usuario sin permisos para vender.';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta requiere al menos un item.';
  end if;

  if jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'La venta requiere al menos un pago.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::integer;

    if v_qty <= 0 then
      raise exception 'Cantidad invalida en items.';
    end if;

    select pv.id, pv.sku, pv.size, pv.color, pv.sale_price, pv.cost_price, p.name
    into v_variant
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = (v_item->>'variant_id')::uuid
      and pv.store_id = p_store_id;

    if not found then
      raise exception 'Variante no encontrada en tienda.';
    end if;

    select *
    into v_stock
    from public.inventory_stock s
    where s.variant_id = v_variant.id
      and s.store_id = p_store_id
    for update;

    if not found then
      raise exception 'Stock no configurado para variante.';
    end if;

    if v_stock.quantity_on_hand < v_qty then
      raise exception 'Stock insuficiente para SKU %', v_variant.sku;
    end if;

    v_subtotal := v_subtotal + (v_variant.sale_price * v_qty);
    v_cost_total := v_cost_total + (coalesce(v_variant.cost_price, 0) * v_qty);
  end loop;

  if v_discount_total < 0 then
    raise exception 'Descuento invalido.';
  end if;

  if v_discount_total > v_subtotal then
    raise exception 'Descuento no puede superar subtotal.';
  end if;

  if v_discount_total > (v_subtotal - v_cost_total) then
    raise exception 'Descuento excede el maximo permitido por costo de compra.';
  end if;

  v_grand_total := v_subtotal - v_discount_total + v_tax_total;

  if v_grand_total < v_cost_total then
    raise exception 'Venta por debajo del costo no permitida.';
  end if;

  for v_payment in select * from jsonb_array_elements(p_payments)
  loop
    v_pay_total := v_pay_total + coalesce((v_payment->>'amount')::numeric, 0);
  end loop;

  if v_pay_total <> v_grand_total then
    raise exception 'Total de pagos (%) no coincide con total de venta (%)', v_pay_total, v_grand_total;
  end if;

  -- Evita colisiones de consecutivo por tienda en ventas concurrentes.
  perform pg_advisory_xact_lock(hashtext('sales_number:' || p_store_id::text));

  -- Consecutivo limpio: 'No 0001', 'No 0002', ... incremental por tienda
  select s.sale_number into v_sale_number
  from public.sales s
  where s.store_id = p_store_id
    and s.sale_number ~ '^No [0-9]+$'
  order by length(s.sale_number) desc, s.sale_number desc
  limit 1;

  if v_sale_number is not null then
    v_next_number := (regexp_replace(v_sale_number, '[^0-9]', '', 'g'))::integer + 1;
  end if;

  if v_next_number < 10000 then
    v_sale_number := 'No ' || lpad(v_next_number::text, 4, '0');
  else
    v_sale_number := 'No ' || v_next_number::text;
  end if;

  insert into public.sales (
    store_id,
    sale_number,
    customer_name,
    subtotal,
    discount_total,
    tax_total,
    grand_total,
    status,
    sold_by,
    sold_at
  )
  values (
    p_store_id,
    v_sale_number,
    nullif(trim(coalesce(p_customer_name, '')), ''),
    v_subtotal,
    v_discount_total,
    v_tax_total,
    v_grand_total,
    'confirmed',
    p_sold_by,
    now()
  )
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::integer;

    select pv.id, pv.sku, pv.size, pv.color, pv.sale_price, pv.cost_price, p.name
    into v_variant
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where pv.id = (v_item->>'variant_id')::uuid
      and pv.store_id = p_store_id;

    v_line_total := v_variant.sale_price * v_qty;

    insert into public.sale_items (
      sale_id,
      variant_id,
      sku_snapshot,
      name_snapshot,
      size_snapshot,
      color_snapshot,
      unit_price,
      quantity,
      discount_amount,
      line_total
    )
    values (
      v_sale_id,
      v_variant.id,
      v_variant.sku,
      v_variant.name,
      v_variant.size,
      v_variant.color,
      v_variant.sale_price,
      v_qty,
      0,
      v_line_total
    );

    update public.inventory_stock
    set quantity_on_hand = quantity_on_hand - v_qty,
        updated_at = now()
    where store_id = p_store_id
      and variant_id = v_variant.id;

    insert into public.inventory_movements (
      store_id,
      variant_id,
      type,
      quantity,
      reason,
      reference_type,
      reference_id,
      performed_by
    )
    values (
      p_store_id,
      v_variant.id,
      'sale',
      -v_qty,
      'Venta POS',
      'sale',
      v_sale_id,
      p_sold_by
    );
  end loop;

  for v_payment in select * from jsonb_array_elements(p_payments)
  loop
    insert into public.sale_payments (
      sale_id,
      method,
      amount,
      reference,
      paid_at
    )
    values (
      v_sale_id,
      (v_payment->>'method')::text,
      (v_payment->>'amount')::numeric,
      nullif(v_payment->>'reference', ''),
      now()
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
    p_sold_by,
    'sale_confirmed',
    'sales',
    v_sale_id,
    jsonb_build_object('sale_number', v_sale_number, 'grand_total', v_grand_total)
  );

  return query select v_sale_id, v_sale_number;
end;
$$;
