-- 54_validate_cash_register_close.sql
-- Agrega funciones de validación para cierre de caja
-- Sin modificar datos existentes, solo valida y auditea

-- ============================================================
-- 1. Función para validar consistencia de una venta
-- ============================================================
drop function if exists public.validate_sale_payments(uuid);
create or replace function public.validate_sale_payments(
  p_sale_id uuid
)
returns table (
  out_sale_id uuid,
  out_grand_total numeric,
  out_payment_sum numeric,
  out_is_valid boolean,
  out_difference numeric,
  out_error_message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grand_total numeric;
  v_payment_sum numeric;
  v_is_valid boolean;
  v_difference numeric;
  v_error_message text := '';
begin
  select grand_total
    into v_grand_total
    from public.sales
   where id = p_sale_id;

  if not found then
    return query select p_sale_id, 0::numeric, 0::numeric, false, 0::numeric, 'Venta no encontrada'::text;
    return;
  end if;

  select coalesce(sum(amount), 0)
    into v_payment_sum
    from public.sale_payments
   where sale_id = p_sale_id;

  v_difference := v_payment_sum - v_grand_total;
  v_is_valid := abs(v_difference) <= 0.01;

  if not v_is_valid then
    v_error_message := format(
      'Pagos (%) no coinciden con total (%), diferencia: %',
      v_payment_sum, v_grand_total, v_difference
    );
  end if;

  return query select p_sale_id, v_grand_total, v_payment_sum, v_is_valid, v_difference, v_error_message;
end;
$$;

grant execute on function public.validate_sale_payments(uuid) to authenticated;

-- ============================================================
-- 2. Función para validar consistencia de una factura manual
-- ============================================================
drop function if exists public.validate_manual_invoice_payments(uuid);
create or replace function public.validate_manual_invoice_payments(
  p_invoice_id uuid
)
returns table (
  out_invoice_id uuid,
  out_grand_total numeric,
  out_payment_cash numeric,
  out_payment_other numeric,
  out_is_valid boolean,
  out_error_message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grand_total numeric;
  v_payment_cash numeric := 0;
  v_payment_other numeric := 0;
  v_payment_method text;
  v_payment_reference text;
  v_parts text[];
  v_is_valid boolean;
  v_error_message text := '';
begin
  select grand_total, payment_method, payment_reference
    into v_grand_total, v_payment_method, v_payment_reference
    from public.manual_invoices
   where id = p_invoice_id;

  if not found then
    return query select p_invoice_id, 0::numeric, 0::numeric, 0::numeric, false, 'Factura no encontrada'::text;
    return;
  end if;

  if v_payment_method = 'cash' then
    v_payment_cash := v_grand_total;
    v_payment_other := 0;
  elsif v_payment_method = 'mixed' then
    if v_payment_reference is null or trim(v_payment_reference) = '' then
      v_error_message := 'Pago mixto sin payment_reference';
      return query select p_invoice_id, v_grand_total, 0::numeric, 0::numeric, false, v_error_message;
      return;
    end if;

    v_parts := string_to_array(v_payment_reference, ':');
    if array_length(v_parts, 1) >= 4 then
      if v_parts[1] = 'cash' then
        v_payment_cash := v_payment_cash + coalesce(v_parts[2]::numeric, 0);
      else
        v_payment_other := v_payment_other + coalesce(v_parts[2]::numeric, 0);
      end if;

      if v_parts[3] = 'cash' then
        v_payment_cash := v_payment_cash + coalesce(v_parts[4]::numeric, 0);
      else
        v_payment_other := v_payment_other + coalesce(v_parts[4]::numeric, 0);
      end if;
    else
      v_error_message := format('payment_reference con formato inválido: %', v_payment_reference);
      return query select p_invoice_id, v_grand_total, 0::numeric, 0::numeric, false, v_error_message;
      return;
    end if;
  else
    v_payment_other := v_grand_total;
  end if;

  v_is_valid := abs((v_payment_cash + v_payment_other) - v_grand_total) <= 0.01;

  if not v_is_valid then
    v_error_message := format(
      'Desglose de pagos (cash: %, other: %) no coincide con total (%)',
      v_payment_cash, v_payment_other, v_grand_total
    );
  end if;

  return query select p_invoice_id, v_grand_total, v_payment_cash, v_payment_other, v_is_valid, v_error_message;
end;
$$;

grant execute on function public.validate_manual_invoice_payments(uuid) to authenticated;

-- ============================================================
-- 3. Función para detectar gastos duplicados
-- ============================================================
drop function if exists public.detect_duplicate_expenses(uuid, date, date);
create or replace function public.detect_duplicate_expenses(
  p_store_id uuid,
  p_from_date date,
  p_to_date date
)
returns table (
  out_expense_id uuid,
  out_amount numeric,
  out_expense_date date,
  out_created_by uuid,
  out_duplicate_count integer,
  out_warning text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with expense_groups as (
    select
      id,
      amount,
      expense_date,
      created_by,
      row_number() over (
        partition by amount, expense_date, created_by
        order by created_at
      ) as rn,
      count(*) over (
        partition by amount, expense_date, created_by
      ) as duplicate_count
    from public.manual_invoice_expenses
    where store_id = p_store_id
      and expense_date >= p_from_date
      and expense_date <= p_to_date
      and is_active = true
  )
  select
    eg.id,
    eg.amount,
    eg.expense_date,
    eg.created_by,
    eg.duplicate_count,
    case
      when eg.duplicate_count > 1 then
        format('ALERTA: % gastos de $% en %', eg.duplicate_count, eg.amount, eg.expense_date)
      else
        ''
    end as warning
  from expense_groups eg
  where eg.duplicate_count > 1
  order by eg.expense_date desc, eg.amount desc;
end;
$$;

grant execute on function public.detect_duplicate_expenses(uuid, date, date) to authenticated;

-- ============================================================
-- 4. Función para generar resumen de validación de día
-- ============================================================
drop function if exists public.validate_cash_register_summary(uuid, date);
create or replace function public.validate_cash_register_summary(
  p_store_id uuid,
  p_session_date date
)
returns table (
  out_summary_date date,
  out_total_sales integer,
  out_invalid_sales integer,
  out_total_invoices integer,
  out_invalid_invoices integer,
  out_duplicate_expenses integer,
  out_overall_valid boolean,
  out_validation_report jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invalid_sales integer := 0;
  v_total_sales integer := 0;
  v_invalid_invoices integer := 0;
  v_total_invoices integer := 0;
  v_duplicate_expenses integer := 0;
  v_overall_valid boolean := true;
  v_report jsonb;
begin
  -- Contar ventas inválidas
  select count(*)
    into v_total_sales
    from public.sales
    where store_id = p_store_id
      and status = 'confirmed'
      and date(sold_at at time zone 'America/Bogota') = p_session_date;

  select count(*)
    into v_invalid_sales
    from public.validate_sale_payments(id)
    where not out_is_valid;

  -- Contar facturas inválidas
  select count(*)
    into v_total_invoices
    from public.manual_invoices
    where store_id = p_store_id
      and source = 'provisional'
      and is_active = true
      and date(created_at at time zone 'America/Bogota') = p_session_date;

  select count(*)
    into v_invalid_invoices
    from public.validate_manual_invoice_payments(id)
    where not out_is_valid;

  -- Detectar gastos duplicados
  select count(*)
    into v_duplicate_expenses
    from public.detect_duplicate_expenses(p_store_id, p_session_date, p_session_date);

  v_overall_valid := (v_invalid_sales = 0 AND v_invalid_invoices = 0 AND v_duplicate_expenses = 0);

  v_report := jsonb_build_object(
    'session_date', p_session_date,
    'sales', jsonb_build_object('total', v_total_sales, 'invalid', v_invalid_sales),
    'invoices', jsonb_build_object('total', v_total_invoices, 'invalid', v_invalid_invoices),
    'expenses', jsonb_build_object('duplicates', v_duplicate_expenses),
    'overall_valid', v_overall_valid,
    'validated_at', now()
  );

  return query select
    p_session_date,
    v_total_sales,
    v_invalid_sales,
    v_total_invoices,
    v_invalid_invoices,
    v_duplicate_expenses,
    v_overall_valid,
    v_report;
end;
$$;

grant execute on function public.validate_cash_register_summary(uuid, date) to authenticated;

-- ============================================================
-- 5. Tabla para auditoría de validaciones de cierre
-- ============================================================
create table if not exists public.cash_register_validations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  session_id uuid references public.cash_register_sessions(id) on delete set null,
  session_date date not null,
  validation_report jsonb not null,
  validated_by uuid not null references public.profiles(id) on delete restrict,
  validated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_cash_register_validations_session
  on public.cash_register_validations (store_id, session_date desc);

alter table public.cash_register_validations enable row level security;

drop policy if exists cash_register_validations_read_policy on public.cash_register_validations;
create policy cash_register_validations_read_policy on public.cash_register_validations
  for select
  using (store_id in (select public.current_user_store_ids()));

drop policy if exists cash_register_validations_insert_policy on public.cash_register_validations;
create policy cash_register_validations_insert_policy on public.cash_register_validations
  for insert
  with check (
    store_id in (select public.current_user_store_ids())
    and (
      public.current_user_has_role('super_admin')
      or public.current_user_has_role('admin')
      or public.current_user_has_role('cashier')
    )
  );

-- ============================================================
-- 6. Función auxiliar para registrar validación
-- ============================================================
drop function if exists public.record_cash_register_validation(uuid, uuid, date, jsonb);
create or replace function public.record_cash_register_validation(
  p_store_id uuid,
  p_session_id uuid,
  p_session_date date,
  p_validation_report jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_validation_id uuid;
  v_current_user_id uuid;
begin
  v_current_user_id := auth.uid();

  if v_current_user_id is null then
    raise exception 'Usuario no autenticado';
  end if;

  insert into public.cash_register_validations (
    store_id,
    session_id,
    session_date,
    validation_report,
    validated_by
  )
  values (
    p_store_id,
    p_session_id,
    p_session_date,
    p_validation_report,
    v_current_user_id
  )
  returning id into v_validation_id;

  return v_validation_id;
end;
$$;

grant execute on function public.record_cash_register_validation(uuid, uuid, date, jsonb) to authenticated;
