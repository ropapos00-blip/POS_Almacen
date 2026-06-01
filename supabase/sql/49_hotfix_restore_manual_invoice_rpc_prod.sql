-- 49_hotfix_restore_manual_invoice_rpc_prod.sql
-- HOTFIX PRODUCCION:
-- Restaura create_manual_invoice_transaction sin DROP previo
-- e incluye:
-- - rapirecarga en metodos permitidos
-- - discount_amount por item

create or replace function public.create_manual_invoice_transaction(
  p_store_id uuid,
  p_created_by uuid,
  p_customer_name text,
  p_customer_phone text,
  p_discount_total numeric,
  p_payment_method text,
  p_payment_reference text,
  p_items jsonb,
  p_notes text default null,
  p_apply_credit numeric default 0
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
  v_amount_due numeric := 0;
  v_credit_to_apply numeric := greatest(0, coalesce(p_apply_credit, 0));
  v_credit_balance numeric := 0;
  v_credit_balance_after numeric := 0;
  v_item jsonb;
  v_description text;
  v_qty integer;
  v_price numeric;
  v_line_total numeric;
  v_item_discount numeric := 0;
  v_mixed_parts text[];
  v_mixed_sum numeric;
  v_variant_id uuid;
  v_stock integer;
  v_phone text;
  v_name text;
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
    'bancolombia', 'daviplata', 'nequi', 'rapirecarga', 'mixed'
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
    v_item_discount := greatest(0, coalesce((v_item->>'discount_amount')::numeric, 0));

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
    if v_item_discount > v_line_total then
      raise exception 'Descuento por item excede su total.';
    end if;
    v_subtotal := v_subtotal + v_line_total;

    v_variant_id := nullif(trim(coalesce(v_item->>'variant_id', '')), '')::uuid;
    if v_variant_id is not null then
      select quantity_on_hand into v_stock
      from public.inventory_stock
      where variant_id = v_variant_id and store_id = p_store_id;

      if not found then
        raise exception 'Producto no encontrado en el inventario de la tienda.';
      end if;

      if v_stock < v_qty then
        raise exception 'Stock insuficiente: disponible %, solicitado %.', v_stock, v_qty;
      end if;
    end if;
  end loop;

  if v_discount_total < 0 then
    raise exception 'Descuento invalido.';
  end if;

  if v_discount_total > v_subtotal then
    raise exception 'Descuento no puede superar subtotal.';
  end if;

  v_grand_total := v_subtotal - v_discount_total;
  v_phone := trim(coalesce(p_customer_phone, ''));
  v_name := nullif(trim(coalesce(p_customer_name, '')), '');

  if v_credit_to_apply > 0 then
    if v_phone = '' then
      raise exception 'No puedes aplicar saldo a favor sin telefono del cliente.';
    end if;

    select coalesce(micc.balance, 0)
    into v_credit_balance
    from public.manual_invoice_customer_credits micc
    where micc.store_id = p_store_id
      and micc.customer_phone = v_phone
    for update;

    if not found then
      v_credit_balance := 0;
    end if;

    if v_credit_to_apply > v_credit_balance then
      raise exception 'El saldo a favor disponible (% ) es menor al saldo a aplicar (%).', v_credit_balance, v_credit_to_apply;
    end if;

    if v_credit_to_apply > v_grand_total then
      raise exception 'El saldo a aplicar no puede superar el total de la factura.';
    end if;
  end if;

  v_amount_due := v_grand_total - v_credit_to_apply;

  if p_payment_method = 'mixed' then
    v_mixed_parts := string_to_array(coalesce(p_payment_reference, ''), ':');
    if array_length(v_mixed_parts, 1) = 4 then
      v_mixed_sum := coalesce(v_mixed_parts[2]::numeric, 0) + coalesce(v_mixed_parts[4]::numeric, 0);
      if abs(v_mixed_sum - v_amount_due) > 1 then
        raise exception 'Los montos del pago mixto (%) no coinciden con el total a pagar (%).', v_mixed_sum, v_amount_due;
      end if;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('manual_invoice:' || p_store_id::text));

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
    store_id, invoice_number, customer_name, customer_phone, notes,
    subtotal, discount_total, credit_applied_total, grand_total,
    payment_method, payment_reference, created_by, source
  )
  values (
    p_store_id,
    v_invoice_number,
    v_name,
    nullif(v_phone, ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    v_subtotal,
    v_discount_total,
    v_credit_to_apply,
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
    v_item_discount := greatest(0, coalesce((v_item->>'discount_amount')::numeric, 0));
    v_line_total := v_qty * v_price;
    v_variant_id := nullif(trim(coalesce(v_item->>'variant_id', '')), '')::uuid;

    insert into public.manual_invoice_items (
      manual_invoice_id,
      description,
      quantity,
      unit_price,
      line_total,
      discount_amount,
      variant_id
    )
    values (
      v_invoice_id,
      v_description,
      v_qty,
      v_price,
      v_line_total,
      v_item_discount,
      v_variant_id
    );

    if v_variant_id is not null then
      update public.inventory_stock
      set quantity_on_hand = quantity_on_hand - v_qty
      where variant_id = v_variant_id and store_id = p_store_id;
    end if;
  end loop;

  if v_credit_to_apply > 0 then
    update public.manual_invoice_customer_credits micc
    set
      balance = micc.balance - v_credit_to_apply,
      customer_name = coalesce(v_name, micc.customer_name),
      updated_at = now()
    where micc.store_id = p_store_id
      and micc.customer_phone = v_phone
    returning balance into v_credit_balance_after;

    insert into public.manual_invoice_credit_movements (
      store_id, customer_phone, customer_name, movement_type, amount,
      balance_after, reference_type, reference_id, notes, created_by
    )
    values (
      p_store_id,
      v_phone,
      v_name,
      'apply',
      -v_credit_to_apply,
      v_credit_balance_after,
      'manual_invoice',
      v_invoice_id,
      'Aplicacion de saldo a favor',
      p_created_by
    );
  end if;

  insert into public.audit_logs (
    store_id, actor_user_id, action, entity_type, entity_id, payload_after
  )
  values (
    p_store_id,
    p_created_by,
    'manual_invoice_created',
    'manual_invoices',
    v_invoice_id,
    jsonb_build_object(
      'invoice_number', v_invoice_number,
      'grand_total', v_grand_total,
      'credit_applied_total', v_credit_to_apply,
      'amount_due', v_amount_due
    )
  );

  return query select v_invoice_id, v_invoice_number;
end;
$$;

grant execute on function public.create_manual_invoice_transaction(uuid, uuid, text, text, numeric, text, text, jsonb, text, numeric) to authenticated;

-- Verificación
select p.oid::regprocedure as signature
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'create_manual_invoice_transaction'
order by 1;

