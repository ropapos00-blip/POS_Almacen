-- 48_layaways_payment_methods_and_item_discounts.sql
-- Separados: descuento por item + normalizacion de metodos de pago

-- 1) Estructura: guardar descuento real por item
alter table public.layaway_items
  add column if not exists discount_amount numeric(12,2) not null default 0;

-- 2) Recrear create_layaway para soportar discount_amount por item
create or replace function public.create_layaway(
  p_store_id      uuid,
  p_customer_name text,
  p_customer_phone text,
  p_notes         text,
  p_created_by    uuid,
  p_items         jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_layaway_id   uuid;
  v_total_amount numeric := 0;
  v_item         jsonb;
  v_variant_id   uuid;
  v_quantity     int;
  v_stock        int;
  v_unit_price   numeric;
  v_discount     numeric;
  v_line_total   numeric;
begin
  if p_store_id not in (select public.current_user_store_ids()) then
    raise exception 'No autorizado';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El separado debe tener al menos un artículo';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_quantity := coalesce((v_item->>'quantity')::int, 0);
    v_unit_price := coalesce((v_item->>'unit_price')::numeric, 0);
    v_discount := greatest(0, coalesce((v_item->>'discount_amount')::numeric, 0));

    if coalesce(trim(v_item->>'description'), '') = '' then
      raise exception 'Descripción de artículo requerida';
    end if;
    if v_quantity <= 0 then
      raise exception 'Cantidad inválida en separado';
    end if;
    if v_unit_price < 0 then
      raise exception 'Precio inválido en separado';
    end if;

    v_line_total := v_unit_price * v_quantity;
    if v_discount > v_line_total then
      raise exception 'Descuento por item excede su total';
    end if;

    v_total_amount := v_total_amount + (v_line_total - v_discount);

    if (v_item->>'variant_id') is not null and (v_item->>'variant_id') <> '' then
      v_variant_id := (v_item->>'variant_id')::uuid;
      select coalesce(quantity_on_hand, 0)
        into v_stock
        from public.inventory_stock
       where variant_id = v_variant_id
         and store_id = p_store_id;

      if coalesce(v_stock, 0) < v_quantity then
        raise exception 'Stock insuficiente para: %', (v_item->>'description');
      end if;
    end if;
  end loop;

  if v_total_amount <= 0 then
    raise exception 'El total del separado debe ser mayor a 0';
  end if;

  insert into public.layaways (
    store_id, customer_name, customer_phone,
    total_amount, paid_amount, status,
    due_date, notes, created_by
  )
  values (
    p_store_id, p_customer_name, p_customer_phone,
    v_total_amount, 0, 'active',
    current_date + interval '20 days', p_notes, p_created_by
  )
  returning id into v_layaway_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.layaway_items (
      layaway_id, variant_id, description, quantity, unit_price, discount_amount
    )
    values (
      v_layaway_id,
      nullif((v_item->>'variant_id')::text, '')::uuid,
      v_item->>'description',
      (v_item->>'quantity')::int,
      (v_item->>'unit_price')::numeric,
      greatest(0, coalesce((v_item->>'discount_amount')::numeric, 0))
    );

    if (v_item->>'variant_id') is not null and (v_item->>'variant_id') <> '' then
      v_variant_id := (v_item->>'variant_id')::uuid;
      v_quantity   := (v_item->>'quantity')::int;

      update public.inventory_stock
         set quantity_on_hand = quantity_on_hand - v_quantity
       where variant_id = v_variant_id
         and store_id   = p_store_id;
    end if;
  end loop;

  return v_layaway_id;
end;
$$;

-- 3) Validar metodo de pago en abonos y permitir mismos metodos que facturas manuales (sin mixto en abono único)
create or replace function public.add_layaway_payment(
  p_layaway_id     uuid,
  p_amount         numeric,
  p_payment_method text,
  p_notes          text,
  p_created_by     uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_layaway  record;
  v_new_paid numeric;
begin
  select * into v_layaway from public.layaways where id = p_layaway_id;

  if not found then
    raise exception 'Separado no encontrado';
  end if;

  if v_layaway.store_id not in (select public.current_user_store_ids()) then
    raise exception 'No autorizado';
  end if;

  if p_payment_method not in ('cash', 'addi', 'credilondon', 'dataphone', 'bancolombia', 'daviplata', 'nequi', 'rapirecarga') then
    raise exception 'Metodo de pago invalido.';
  end if;

  if v_layaway.status = 'cancelled' then
    raise exception 'Este separado ha sido cancelado';
  end if;

  if v_layaway.status = 'completed' then
    raise exception 'Este separado ya está pagado completamente';
  end if;

  if p_amount <= 0 then
    raise exception 'El abono debe ser mayor a 0';
  end if;

  v_new_paid := v_layaway.paid_amount + p_amount;

  if v_new_paid > v_layaway.total_amount then
    raise exception 'El abono supera el saldo pendiente: %', (v_layaway.total_amount - v_layaway.paid_amount);
  end if;

  insert into public.layaway_payments (
    layaway_id, amount, payment_method, notes, created_by
  )
  values (
    p_layaway_id, p_amount, p_payment_method, p_notes, p_created_by
  );

  update public.layaways
     set paid_amount = v_new_paid,
         status = case when v_new_paid >= total_amount then 'completed' else status end
   where id = p_layaway_id;
end;
$$;

