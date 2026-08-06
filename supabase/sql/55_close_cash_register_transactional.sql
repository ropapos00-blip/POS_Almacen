-- 55_close_cash_register_transactional.sql
-- RPC para cerrar caja con validaciones transaccionales y auditoría
-- Detecta discrepancias y las registra antes de confirmar cierre

-- ============================================================
-- 1. Tabla para registrar discrepancias detectadas
-- ============================================================
create table if not exists public.cash_register_discrepancies (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  session_id uuid not null references public.cash_register_sessions(id) on delete cascade,
  session_date date not null,
  expected_cash numeric(12,2) not null,
  cash_counted numeric(12,2) not null,
  difference numeric(12,2) not null,
  difference_percent numeric(5,2) not null, -- % de diferencia
  discrepancy_type text not null check (discrepancy_type in ('shortage', 'overage')),
  severity text not null check (severity in ('minor', 'warning', 'critical')),
  notes text,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  resolved boolean not null default false,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolution_notes text,
  resolved_at timestamptz
);

create index if not exists idx_cash_register_discrepancies_session
  on public.cash_register_discrepancies (store_id, session_date desc);

create index if not exists idx_cash_register_discrepancies_unresolved
  on public.cash_register_discrepancies (store_id, resolved)
  where resolved = false;

alter table public.cash_register_discrepancies enable row level security;

drop policy if exists cash_register_discrepancies_read_policy on public.cash_register_discrepancies;
create policy cash_register_discrepancies_read_policy on public.cash_register_discrepancies
  for select
  using (store_id in (select public.current_user_store_ids()));

drop policy if exists cash_register_discrepancies_insert_policy on public.cash_register_discrepancies;
create policy cash_register_discrepancies_insert_policy on public.cash_register_discrepancies
  for insert
  with check (
    store_id in (select public.current_user_store_ids())
    and (
      public.current_user_has_role('super_admin')
      or public.current_user_has_role('admin')
      or public.current_user_has_role('cashier')
    )
  );

drop policy if exists cash_register_discrepancies_update_policy on public.cash_register_discrepancies;
create policy cash_register_discrepancies_update_policy on public.cash_register_discrepancies
  for update
  using (store_id in (select public.current_user_store_ids()))
  with check (store_id in (select public.current_user_store_ids()));

-- ============================================================
-- 2. RPC: Calcular efectivo esperado con todos los detalles
-- ============================================================
drop function if exists public.calculate_expected_cash_detailed(uuid, date, uuid);
create or replace function public.calculate_expected_cash_detailed(
  p_store_id uuid,
  p_session_date date,
  p_session_id uuid default null
)
returns table (
  out_session_id uuid,
  out_session_date date,
  out_cash_base numeric,
  out_pos_cash numeric,
  out_pos_card numeric,
  out_pos_transfer numeric,
  out_pos_total numeric,
  out_invoice_cash numeric,
  out_invoice_card numeric,
  out_invoice_addi numeric,
  out_invoice_other numeric,
  out_invoice_total numeric,
  out_layaway_cash numeric,
  out_layaway_other numeric,
  out_layaway_total numeric,
  out_expenses numeric,
  out_expected_cash numeric,
  out_calculation_details jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cash_base numeric := 0;
  v_pos_cash numeric := 0;
  v_pos_card numeric := 0;
  v_pos_transfer numeric := 0;
  v_pos_total numeric := 0;
  v_invoice_cash numeric := 0;
  v_invoice_card numeric := 0;
  v_invoice_addi numeric := 0;
  v_invoice_other numeric := 0;
  v_invoice_total numeric := 0;
  v_layaway_cash numeric := 0;
  v_layaway_other numeric := 0;
  v_layaway_total numeric := 0;
  v_expenses numeric := 0;
  v_expected_cash numeric := 0;
  v_start_iso text;
  v_end_iso text;
  v_session record;
  v_sale record;
  v_invoice record;
  v_payment record;
  v_details jsonb;
begin
  -- Obtener sesión
  if p_session_id is not null then
    select * into v_session
    from public.cash_register_sessions
    where id = p_session_id
      and store_id = p_store_id;
  else
    select * into v_session
    from public.cash_register_sessions
    where store_id = p_store_id
      and session_date = p_session_date
    order by created_at desc
    limit 1;
  end if;

  if not found then
    raise exception 'Sesión no encontrada para la tienda y fecha especificadas';
  end if;

  -- Definir rango temporal (desde apertura hasta cierre o ahora)
  if v_session.closed_at is not null then
    v_start_iso := v_session.created_at::text;
    v_end_iso := v_session.closed_at::text;
  else
    v_start_iso := v_session.created_at::text;
    v_end_iso := now()::text;
  end if;

  v_cash_base := coalesce(v_session.cash_base, 0);

  -- ─────────────────────────────────────────────────────────────
  -- Calcular ventas POS
  -- ─────────────────────────────────────────────────────────────
  for v_sale in
    select
      s.id,
      s.grand_total,
      array_agg(
        jsonb_build_object(
          'method', sp.method,
          'amount', sp.amount
        )
      ) as payments
    from public.sales s
    left join public.sale_payments sp on s.id = sp.sale_id
    where s.store_id = p_store_id
      and s.status = 'confirmed'
      and s.sold_at >= v_start_iso::timestamptz
      and s.sold_at <= v_end_iso::timestamptz
    group by s.id, s.grand_total
  loop
    v_pos_total := v_pos_total + coalesce(v_sale.grand_total, 0);

    for v_payment in
      select jsonb_array_elements(v_sale.payments) as p
    loop
      if v_payment.p->>'method' = 'cash' then
        v_pos_cash := v_pos_cash + coalesce((v_payment.p->>'amount')::numeric, 0);
      elsif v_payment.p->>'method' = 'card' then
        v_pos_card := v_pos_card + coalesce((v_payment.p->>'amount')::numeric, 0);
      elsif v_payment.p->>'method' = 'transfer' then
        v_pos_transfer := v_pos_transfer + coalesce((v_payment.p->>'amount')::numeric, 0);
      end if;
    end loop;
  end loop;

  -- ─────────────────────────────────────────────────────────────
  -- Calcular facturas manuales
  -- ─────────────────────────────────────────────────────────────
  for v_invoice in
    select
      id,
      grand_total,
      payment_method,
      payment_reference
    from public.manual_invoices
    where store_id = p_store_id
      and source = 'provisional'
      and is_active = true
      and created_at >= v_start_iso::timestamptz
      and created_at <= v_end_iso::timestamptz
  loop
    v_invoice_total := v_invoice_total + coalesce(v_invoice.grand_total, 0);

    if v_invoice.payment_method = 'cash' then
      v_invoice_cash := v_invoice_cash + v_invoice.grand_total;
    elsif v_invoice.payment_method = 'mixed' then
      if v_invoice.payment_reference is not null then
        declare
          v_parts text[];
        begin
          v_parts := string_to_array(v_invoice.payment_reference, ':');
          if array_length(v_parts, 1) >= 4 then
            if v_parts[1] = 'cash' then
              v_invoice_cash := v_invoice_cash + coalesce(v_parts[2]::numeric, 0);
            elsif v_parts[1] = 'addi' then
              v_invoice_addi := v_invoice_addi + coalesce(v_parts[2]::numeric, 0);
            elsif v_parts[1] = 'card' then
              v_invoice_card := v_invoice_card + coalesce(v_parts[2]::numeric, 0);
            else
              v_invoice_other := v_invoice_other + coalesce(v_parts[2]::numeric, 0);
            end if;

            if v_parts[3] = 'cash' then
              v_invoice_cash := v_invoice_cash + coalesce(v_parts[4]::numeric, 0);
            elsif v_parts[3] = 'addi' then
              v_invoice_addi := v_invoice_addi + coalesce(v_parts[4]::numeric, 0);
            elsif v_parts[3] = 'card' then
              v_invoice_card := v_invoice_card + coalesce(v_parts[4]::numeric, 0);
            else
              v_invoice_other := v_invoice_other + coalesce(v_parts[4]::numeric, 0);
            end if;
          end if;
        end;
      end if;
    elsif v_invoice.payment_method = 'addi' then
      v_invoice_addi := v_invoice_addi + v_invoice.grand_total;
    elsif v_invoice.payment_method = 'card' then
      v_invoice_card := v_invoice_card + v_invoice.grand_total;
    else
      v_invoice_other := v_invoice_other + v_invoice.grand_total;
    end if;
  end loop;

  -- ─────────────────────────────────────────────────────────────
  -- Calcular separados (layaway payments)
  -- ─────────────────────────────────────────────────────────────
  select
    coalesce(sum(case when lp.payment_method = 'cash' then lp.amount else 0 end), 0),
    coalesce(sum(case when lp.payment_method != 'cash' then lp.amount else 0 end), 0),
    coalesce(sum(lp.amount), 0)
  into v_layaway_cash, v_layaway_other, v_layaway_total
  from public.layaway_payments lp
  join public.layaways l on l.id = lp.layaway_id
  where l.store_id = p_store_id
    and lp.created_at >= v_start_iso::timestamptz
    and lp.created_at <= v_end_iso::timestamptz;

  -- ─────────────────────────────────────────────────────────────
  -- Calcular gastos
  -- ─────────────────────────────────────────────────────────────
  select coalesce(sum(amount), 0)
    into v_expenses
    from public.manual_invoice_expenses
    where store_id = p_store_id
      and is_active = true
      and expense_date between p_session_date and p_session_date;

  -- ─────────────────────────────────────────────────────────────
  -- Calcular efectivo esperado
  -- ─────────────────────────────────────────────────────────────
  v_expected_cash := v_cash_base + v_pos_cash + v_invoice_cash + v_layaway_cash - v_expenses;

  v_details := jsonb_build_object(
    'session_id', v_session.id,
    'session_date', p_session_date,
    'cash_base', v_cash_base,
    'pos', jsonb_build_object(
      'cash', v_pos_cash,
      'card', v_pos_card,
      'transfer', v_pos_transfer,
      'total', v_pos_total
    ),
    'invoices', jsonb_build_object(
      'cash', v_invoice_cash,
      'card', v_invoice_card,
      'addi', v_invoice_addi,
      'other', v_invoice_other,
      'total', v_invoice_total
    ),
    'layaways', jsonb_build_object(
      'cash', v_layaway_cash,
      'other', v_layaway_other,
      'total', v_layaway_total
    ),
    'expenses', v_expenses,
    'expected_cash', v_expected_cash,
    'calculated_at', now()
  );

  return query select
    v_session.id,
    p_session_date,
    v_cash_base,
    v_pos_cash,
    v_pos_card,
    v_pos_transfer,
    v_pos_total,
    v_invoice_cash,
    v_invoice_card,
    v_invoice_addi,
    v_invoice_other,
    v_invoice_total,
    v_layaway_cash,
    v_layaway_other,
    v_layaway_total,
    v_expenses,
    v_expected_cash,
    v_details;
end;
$$;

grant execute on function public.calculate_expected_cash_detailed(uuid, date, uuid) to authenticated;

-- ============================================================
-- 3. RPC: Cerrar caja con validaciones y auditoría
-- ============================================================
drop function if exists public.close_cash_register_transactional(uuid, uuid, numeric, text, date);
create or replace function public.close_cash_register_transactional(
  p_session_id uuid,
  p_closed_by uuid,
  p_cash_counted numeric,
  p_notes_close text,
  p_session_date date
)
returns table (
  out_session_id uuid,
  out_closed boolean,
  out_expected_cash numeric,
  out_difference numeric,
  out_discrepancy_id uuid,
  out_message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_expected_cash numeric;
  v_difference numeric;
  v_difference_percent numeric;
  v_severity text;
  v_discrepancy_id uuid;
  v_closed_successfully boolean := false;
  v_message text := '';
  v_allowed_variance numeric := 1000; -- $1k es el máximo permitido por defecto
  v_calc_details record;
begin
  -- Validar que el usuario es admin o cashier
  if not (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
    or public.current_user_has_role('cashier')
  ) then
    raise exception 'No autorizado para cerrar caja.';
  end if;

  -- Obtener store_id de la sesión
  select store_id into v_store_id
  from public.cash_register_sessions
  where id = p_session_id;

  if not found then
    raise exception 'Sesión no encontrada.';
  end if;

  -- Verificar acceso a la tienda
  if v_store_id not in (select public.current_user_store_ids()) then
    raise exception 'No tienes acceso a esta tienda.';
  end if;

  -- Calcular efectivo esperado
  select * into v_calc_details
  from public.calculate_expected_cash_detailed(v_store_id, p_session_date, p_session_id);

  v_expected_cash := v_calc_details.out_expected_cash;
  v_difference := p_cash_counted - v_expected_cash;
  v_difference_percent := case
    when v_expected_cash != 0 then (v_difference / v_expected_cash) * 100
    else 0
  end;

  -- Determinar severidad de discrepancia
  if abs(v_difference) <= 0.01 then
    v_severity := 'minor';
    v_message := 'Cierre correcto.';
  elsif abs(v_difference) < v_allowed_variance then
    v_severity := 'warning';
    v_message := format(
      'Diferencia de $%s (%s%%) detectada pero dentro de tolerancia.',
      abs(v_difference), round(abs(v_difference_percent), 2)
    );
  else
    v_severity := 'critical';
    v_message := format(
      'ALERTA: Diferencia de $%s (%s%%) EXCEDE tolerancia de $%s',
      abs(v_difference), round(abs(v_difference_percent), 2), v_allowed_variance
    );
  end if;

  -- Si hay discrepancia, registrar
  if abs(v_difference) > 0.01 then
    insert into public.cash_register_discrepancies (
      store_id,
      session_id,
      session_date,
      expected_cash,
      cash_counted,
      difference,
      difference_percent,
      discrepancy_type,
      severity,
      notes,
      recorded_by
    )
    values (
      v_store_id,
      p_session_id,
      p_session_date,
      v_expected_cash,
      p_cash_counted,
      v_difference,
      v_difference_percent,
      case when v_difference > 0 then 'overage' else 'shortage' end,
      v_severity,
      p_notes_close,
      p_closed_by
    )
    returning id into v_discrepancy_id;
  end if;

  -- Cerrar la sesión
  update public.cash_register_sessions
  set
    status = 'closed',
    closed_by = p_closed_by,
    cash_counted = p_cash_counted,
    notes_close = nullif(trim(coalesce(p_notes_close, '')), ''),
    closed_at = now()
  where id = p_session_id;

  v_closed_successfully := true;

  -- Registrar en auditoría
  insert into public.audit_logs (
    store_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    payload_after
  )
  values (
    v_store_id,
    p_closed_by,
    'cash_register_closed',
    'cash_register_sessions',
    p_session_id,
    jsonb_build_object(
      'expected_cash', v_expected_cash,
      'cash_counted', p_cash_counted,
      'difference', v_difference,
      'severity', v_severity,
      'calculation_details', v_calc_details.out_calculation_details
    )
  );

  return query select
    p_session_id,
    v_closed_successfully,
    v_expected_cash,
    v_difference,
    v_discrepancy_id,
    v_message;
end;
$$;

grant execute on function public.close_cash_register_transactional(uuid, uuid, numeric, text, date) to authenticated;
