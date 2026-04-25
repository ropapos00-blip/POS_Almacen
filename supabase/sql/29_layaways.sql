-- 29_layaways.sql
-- Separados (Layaways): clientes apartan productos con abonos a 20 días

-- ──────────────────────────────────────────
-- 1. TABLAS
-- ──────────────────────────────────────────

create table if not exists public.layaways (
  id             uuid          primary key default gen_random_uuid(),
  store_id       uuid          not null references public.stores(id) on delete cascade,
  customer_name  text          not null,
  customer_phone text,
  total_amount   numeric(12,2) not null default 0,
  paid_amount    numeric(12,2) not null default 0,
  status         text          not null default 'active'
                   check (status in ('active','completed','cancelled','expired')),
  due_date       date          not null,
  notes          text,
  created_by     uuid          references auth.users(id),
  created_at     timestamptz   not null default now()
);

create table if not exists public.layaway_items (
  id           uuid          primary key default gen_random_uuid(),
  layaway_id   uuid          not null references public.layaways(id) on delete cascade,
  variant_id   uuid          references public.product_variants(id),
  description  text          not null,
  quantity     integer       not null default 1 check (quantity > 0),
  unit_price   numeric(12,2) not null default 0,
  created_at   timestamptz   not null default now()
);

create table if not exists public.layaway_payments (
  id             uuid          primary key default gen_random_uuid(),
  layaway_id     uuid          not null references public.layaways(id) on delete cascade,
  amount         numeric(12,2) not null check (amount > 0),
  payment_method text          not null default 'cash',
  notes          text,
  created_by     uuid          references auth.users(id),
  created_at     timestamptz   not null default now()
);

-- ──────────────────────────────────────────
-- 2. ÍNDICES
-- ──────────────────────────────────────────

create index if not exists idx_layaways_store_id    on public.layaways (store_id);
create index if not exists idx_layaways_customer     on public.layaways (store_id, customer_name);
create index if not exists idx_layaway_items_parent  on public.layaway_items (layaway_id);
create index if not exists idx_layaway_pmts_parent   on public.layaway_payments (layaway_id);

-- ──────────────────────────────────────────
-- 3. RLS
-- ──────────────────────────────────────────

alter table public.layaways         enable row level security;
alter table public.layaway_items    enable row level security;
alter table public.layaway_payments enable row level security;

-- layaways
drop policy if exists layaways_read_policy   on public.layaways;
create policy layaways_read_policy on public.layaways
  for select using (store_id in (select public.current_user_store_ids()));

drop policy if exists layaways_insert_policy on public.layaways;
create policy layaways_insert_policy on public.layaways
  for insert with check (store_id in (select public.current_user_store_ids()));

drop policy if exists layaways_update_policy on public.layaways;
create policy layaways_update_policy on public.layaways
  for update using (store_id in (select public.current_user_store_ids()));

-- layaway_items
drop policy if exists layaway_items_read_policy   on public.layaway_items;
create policy layaway_items_read_policy on public.layaway_items
  for select using (
    layaway_id in (
      select id from public.layaways
      where store_id in (select public.current_user_store_ids())
    )
  );

drop policy if exists layaway_items_insert_policy on public.layaway_items;
create policy layaway_items_insert_policy on public.layaway_items
  for insert with check (
    layaway_id in (
      select id from public.layaways
      where store_id in (select public.current_user_store_ids())
    )
  );

-- layaway_payments
drop policy if exists layaway_payments_read_policy   on public.layaway_payments;
create policy layaway_payments_read_policy on public.layaway_payments
  for select using (
    layaway_id in (
      select id from public.layaways
      where store_id in (select public.current_user_store_ids())
    )
  );

drop policy if exists layaway_payments_insert_policy on public.layaway_payments;
create policy layaway_payments_insert_policy on public.layaway_payments
  for insert with check (
    layaway_id in (
      select id from public.layaways
      where store_id in (select public.current_user_store_ids())
    )
  );

-- ──────────────────────────────────────────
-- 4. RPC: create_layaway
--    Crea el separado, inserta ítems y descuenta inventario en una transacción.
-- ──────────────────────────────────────────

create or replace function public.create_layaway(
  p_store_id      uuid,
  p_customer_name text,
  p_customer_phone text,
  p_notes         text,
  p_created_by    uuid,
  p_items         jsonb   -- [{variant_id, description, quantity, unit_price}]
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
begin
  -- Validar pertenencia a la tienda
  if p_store_id not in (select public.current_user_store_ids()) then
    raise exception 'No autorizado';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'El separado debe tener al menos un artículo';
  end if;

  -- Calcular total
  select coalesce(sum((item->>'unit_price')::numeric * (item->>'quantity')::int), 0)
    into v_total_amount
    from jsonb_array_elements(p_items) as item;

  if v_total_amount <= 0 then
    raise exception 'El total del separado debe ser mayor a 0';
  end if;

  -- Verificar stock para ítems con variant_id
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if (v_item->>'variant_id') is not null and (v_item->>'variant_id') <> '' then
      v_variant_id := (v_item->>'variant_id')::uuid;
      v_quantity   := (v_item->>'quantity')::int;

      select coalesce(quantity_on_hand, 0)
        into v_stock
        from public.inventory_stock
       where variant_id = v_variant_id
         and store_id   = p_store_id;

      if coalesce(v_stock, 0) < v_quantity then
        raise exception 'Stock insuficiente para: %', (v_item->>'description');
      end if;
    end if;
  end loop;

  -- Crear registro del separado
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

  -- Insertar ítems y descontar inventario
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.layaway_items (
      layaway_id, variant_id, description, quantity, unit_price
    )
    values (
      v_layaway_id,
      nullif((v_item->>'variant_id')::text, '')::uuid,
      v_item->>'description',
      (v_item->>'quantity')::int,
      (v_item->>'unit_price')::numeric
    );

    -- Descontar del inventario si tiene variant_id
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

-- ──────────────────────────────────────────
-- 5. RPC: add_layaway_payment
--    Registra un abono y actualiza paid_amount / status.
-- ──────────────────────────────────────────

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

-- ──────────────────────────────────────────
-- 6. RPC: cancel_layaway
--    Cancela el separado y restaura el inventario.
-- ──────────────────────────────────────────

create or replace function public.cancel_layaway(
  p_layaway_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_layaway record;
  v_item    record;
begin
  select * into v_layaway from public.layaways where id = p_layaway_id;

  if not found then
    raise exception 'Separado no encontrado';
  end if;

  if v_layaway.store_id not in (select public.current_user_store_ids()) then
    raise exception 'No autorizado';
  end if;

  if v_layaway.status = 'cancelled' then
    raise exception 'El separado ya está cancelado';
  end if;

  if v_layaway.status = 'completed' then
    raise exception 'No se puede cancelar un separado completado';
  end if;

  -- Restaurar inventario
  for v_item in
    select * from public.layaway_items
     where layaway_id = p_layaway_id
       and variant_id is not null
  loop
    update public.inventory_stock
       set quantity_on_hand = quantity_on_hand + v_item.quantity
     where variant_id = v_item.variant_id
       and store_id   = v_layaway.store_id;
  end loop;

  update public.layaways
     set status = 'cancelled'
   where id = p_layaway_id;
end;
$$;
