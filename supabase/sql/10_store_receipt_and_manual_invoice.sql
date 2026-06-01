-- Actualiza el constraint de payment_method para permitir los nuevos métodos (ejecutar en caliente)
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_name = 'manual_invoices'
      and constraint_type = 'CHECK'
      and constraint_name = 'manual_invoices_payment_method_check'
  ) then
    alter table public.manual_invoices drop constraint manual_invoices_payment_method_check;
  end if;
end$$;

alter table public.manual_invoices
  add constraint manual_invoices_payment_method_check
    check (payment_method in ('cash', 'addi', 'credilondon', 'dataphone', 'bancolombia', 'daviplata', 'nequi', 'rapirecarga'));
-- 10_store_receipt_and_manual_invoice.sql
-- Extiende configuracion de tienda para encabezado de factura/comanda,
-- agrega telefono en perfiles y crea facturacion manual provisional.

alter table public.stores
  add column if not exists login_slogan text,
  add column if not exists login_support_text text,
  add column if not exists receipt_legal_name text,
  add column if not exists receipt_tax_id text,
  add column if not exists receipt_tax_regime text,
  add column if not exists receipt_address text,
  add column if not exists receipt_city text,
  add column if not exists receipt_phone text;

alter table public.profiles
  add column if not exists phone text;

drop function if exists public.update_store_receipt_profile(uuid, text, text, text, text, text, text);
drop function if exists public.update_store_receipt_profile(uuid, text, text, text, text, text, text, text);
drop function if exists public.update_store_receipt_profile(uuid, text, text, text, text, text, text, text, text);

create or replace function public.update_store_receipt_profile(
  p_store_id uuid,
  p_login_slogan text,
  p_login_support_text text,
  p_receipt_legal_name text,
  p_receipt_tax_id text,
  p_receipt_tax_regime text,
  p_receipt_address text,
  p_receipt_city text,
  p_receipt_phone text
)
returns table (
  out_store_id uuid,
  out_login_slogan text,
  out_login_support_text text,
  out_receipt_legal_name text,
  out_receipt_tax_id text,
  out_receipt_tax_regime text,
  out_receipt_address text,
  out_receipt_city text,
  out_receipt_phone text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_login_slogan text := nullif(trim(coalesce(p_login_slogan, '')), '');
  v_login_support_text text := nullif(trim(coalesce(p_login_support_text, '')), '');
  v_legal_name text := nullif(trim(coalesce(p_receipt_legal_name, '')), '');
  v_tax_id text := nullif(trim(coalesce(p_receipt_tax_id, '')), '');
  v_tax_regime text := nullif(trim(coalesce(p_receipt_tax_regime, '')), '');
  v_address text := nullif(trim(coalesce(p_receipt_address, '')), '');
  v_city text := nullif(trim(coalesce(p_receipt_city, '')), '');
  v_phone text := nullif(trim(coalesce(p_receipt_phone, '')), '');
begin
  if not public.current_user_has_role('super_admin') then
    raise exception 'Solo super_admin puede actualizar datos de factura/comanda.';
  end if;

  if not (p_store_id in (select public.current_user_store_ids())) then
    raise exception 'No tienes acceso al almacen indicado.';
  end if;

  update public.stores
    set login_slogan = v_login_slogan,
      login_support_text = v_login_support_text,
      receipt_legal_name = v_legal_name,
      receipt_tax_id = v_tax_id,
      receipt_tax_regime = v_tax_regime,
      receipt_address = v_address,
      receipt_city = v_city,
      receipt_phone = v_phone
  where id = p_store_id;

  if not found then
    raise exception 'Almacen no encontrado.';
  end if;

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
    auth.uid(),
    'store_receipt_profile_updated',
    'stores',
    p_store_id,
    jsonb_build_object(
      'login_slogan', v_login_slogan,
      'login_support_text', v_login_support_text,
      'receipt_legal_name', v_legal_name,
      'receipt_tax_id', v_tax_id,
      'receipt_tax_regime', v_tax_regime,
      'receipt_address', v_address,
      'receipt_city', v_city,
      'receipt_phone', v_phone
    )
  );

  return query
  select
    p_store_id,
    v_login_slogan,
    v_login_support_text,
    v_legal_name,
    v_tax_id,
    v_tax_regime,
    v_address,
    v_city,
    v_phone;
end;
$$;

grant execute on function public.update_store_receipt_profile(uuid, text, text, text, text, text, text, text, text) to authenticated;

drop function if exists public.create_pos_user(text, text, text, uuid, text, text);

create or replace function public.create_pos_user(
  p_email text,
  p_password text,
  p_full_name text,
  p_store_id uuid,
  p_role_code text,
  p_phone text default null
)
returns table (out_user_id uuid, out_email text, out_role_code text)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_role_id uuid;
  v_new_user_id uuid;
  v_email text;
  v_name text;
  v_phone text;
  v_allowed boolean := false;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  v_name := trim(coalesce(p_full_name, ''));
  v_phone := nullif(trim(coalesce(p_phone, '')), '');

  if v_email = '' then
    raise exception 'Email requerido.';
  end if;

  if length(coalesce(p_password, '')) < 6 then
    raise exception 'Password minimo 6 caracteres.';
  end if;

  if v_name = '' then
    raise exception 'Nombre requerido.';
  end if;

  if p_role_code not in ('admin', 'cashier') then
    raise exception 'Rol invalido. Solo admin o cashier.';
  end if;

  if not (p_store_id in (select public.current_user_store_ids())) then
    raise exception 'No tienes acceso a la tienda indicada.';
  end if;

  if public.current_user_has_role('super_admin') then
    v_allowed := true;
  elsif public.current_user_has_role('admin') and p_role_code = 'cashier' then
    v_allowed := true;
  end if;

  if not v_allowed then
    raise exception 'No autorizado para crear este tipo de usuario.';
  end if;

  select id into v_role_id
  from public.roles
  where code = p_role_code;

  if v_role_id is null then
    raise exception 'Rol no encontrado en tabla roles.';
  end if;

  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    raise exception 'Ya existe un usuario con ese email.';
  end if;

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    extensions.gen_random_uuid(),
    'authenticated',
    'authenticated',
    v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('full_name', v_name),
    now(),
    now(),
    '',
    '',
    '',
    ''
  )
  returning id into v_new_user_id;

  insert into public.profiles (id, full_name, email, phone, is_active)
  values (v_new_user_id, v_name, v_email, v_phone, true)
  on conflict (id) do update
    set full_name = excluded.full_name,
        email = excluded.email,
        phone = excluded.phone,
        is_active = true;

  insert into public.user_store_roles (user_id, store_id, role_id, is_active)
  values (v_new_user_id, p_store_id, v_role_id, true)
  on conflict (user_id, store_id, role_id) do update
    set is_active = true;

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
    auth.uid(),
    'user_created',
    'profiles',
    v_new_user_id,
    jsonb_build_object('email', v_email, 'role_code', p_role_code, 'phone', v_phone)
  );

  return query
  select
    v_new_user_id as out_user_id,
    v_email as out_email,
    p_role_code as out_role_code;
end;
$$;

grant execute on function public.create_pos_user(text, text, text, uuid, text, text) to authenticated;

create table if not exists public.manual_invoices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  invoice_number text not null,
  customer_name text,
  customer_phone text,
  notes text,
  subtotal numeric(12,2) not null,
  discount_total numeric(12,2) not null default 0,
  grand_total numeric(12,2) not null,
  payment_method text not null check (payment_method in ('cash', 'addi', 'credilondon', 'dataphone', 'bancolombia', 'daviplata', 'nequi', 'rapirecarga')),
  payment_reference text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  is_active boolean not null default true,
  source text not null default 'provisional' check (source in ('provisional')),
  unique (store_id, invoice_number)
);

alter table public.manual_invoices
  add column if not exists customer_phone text;

create table if not exists public.manual_invoice_items (
  id uuid primary key default gen_random_uuid(),
  manual_invoice_id uuid not null references public.manual_invoices(id) on delete cascade,
  description text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null
);

create index if not exists idx_manual_invoices_store_created on public.manual_invoices (store_id, created_at desc);
create index if not exists idx_manual_invoice_items_invoice on public.manual_invoice_items (manual_invoice_id);

alter table public.manual_invoices enable row level security;
alter table public.manual_invoice_items enable row level security;

drop policy if exists manual_invoices_read_policy on public.manual_invoices;
create policy manual_invoices_read_policy on public.manual_invoices
for select
using (store_id in (select public.current_user_store_ids()));

drop policy if exists manual_invoices_write_policy on public.manual_invoices;
create policy manual_invoices_write_policy on public.manual_invoices
for all
using (
  store_id in (select public.current_user_store_ids())
  and (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
    or public.current_user_has_role('cashier')
  )
)
with check (
  store_id in (select public.current_user_store_ids())
  and (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
    or public.current_user_has_role('cashier')
  )
);

drop policy if exists manual_invoice_items_read_policy on public.manual_invoice_items;
create policy manual_invoice_items_read_policy on public.manual_invoice_items
for select
using (
  exists (
    select 1
    from public.manual_invoices mi
    where mi.id = manual_invoice_items.manual_invoice_id
      and mi.store_id in (select public.current_user_store_ids())
  )
);

drop policy if exists manual_invoice_items_write_policy on public.manual_invoice_items;
create policy manual_invoice_items_write_policy on public.manual_invoice_items
for all
using (
  exists (
    select 1
    from public.manual_invoices mi
    where mi.id = manual_invoice_items.manual_invoice_id
      and mi.store_id in (select public.current_user_store_ids())
      and (
        public.current_user_has_role('super_admin')
        or public.current_user_has_role('admin')
        or public.current_user_has_role('cashier')
      )
  )
)
with check (
  exists (
    select 1
    from public.manual_invoices mi
    where mi.id = manual_invoice_items.manual_invoice_id
      and mi.store_id in (select public.current_user_store_ids())
      and (
        public.current_user_has_role('super_admin')
        or public.current_user_has_role('admin')
        or public.current_user_has_role('cashier')
      )
  )
);

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

  if p_payment_method not in ('cash', 'addi', 'credilondon', 'dataphone', 'bancolombia', 'daviplata', 'nequi', 'rapirecarga') then
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
      -- Extraer el número y sumarle 1
      v_next_number := (regexp_replace(v_invoice_number, '[^0-9]', '', 'g'))::integer + 1;
    else
      v_next_number := 1;
    end if;
    -- Formatear con ceros a la izquierda hasta 4 dígitos, luego solo el número
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
