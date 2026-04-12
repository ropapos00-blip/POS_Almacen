-- 15_fix_register_wholesale_payment_ambiguity.sql
-- Corrige ambiguedad de nombres en return query de register_wholesale_payment

create or replace function public.register_wholesale_payment(
  p_invoice_id uuid,
  p_actor_user_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_payment_reference text,
  p_notes text
)
returns table (invoice_id uuid, paid_total numeric, balance_due numeric, status text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_store_id uuid;
  v_current_paid numeric;
  v_grand_total numeric;
  v_status text;
  v_new_paid numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'El abono debe ser mayor a cero.';
  end if;

  if p_payment_method not in ('cash', 'card', 'transfer', 'mixed') then
    raise exception 'Metodo de abono invalido.';
  end if;

  select wi.store_id, wi.paid_total, wi.grand_total, wi.status
  into v_store_id, v_current_paid, v_grand_total, v_status
  from public.wholesale_invoices wi
  where wi.id = p_invoice_id
  for update;

  if v_store_id is null then
    raise exception 'Factura de mayoreo no encontrada.';
  end if;

  if not (v_store_id in (select public.current_user_store_ids())) then
    raise exception 'Usuario sin acceso a la tienda.';
  end if;

  if not (
    public.current_user_has_role('super_admin')
    or public.current_user_has_role('admin')
  ) then
    raise exception 'Solo admin y super_admin pueden registrar abonos.';
  end if;

  if v_status = 'void' then
    raise exception 'No se puede abonar una factura anulada.';
  end if;

  if v_status = 'paid' then
    raise exception 'La factura ya esta totalmente pagada.';
  end if;

  if (v_current_paid + p_amount) > v_grand_total then
    raise exception 'El abono supera el saldo pendiente de la factura.';
  end if;

  v_new_paid := v_current_paid + p_amount;

  insert into public.wholesale_payments (
    store_id,
    wholesale_invoice_id,
    amount,
    payment_method,
    payment_reference,
    notes,
    created_by
  )
  values (
    v_store_id,
    p_invoice_id,
    p_amount,
    p_payment_method,
    nullif(trim(coalesce(p_payment_reference, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    p_actor_user_id
  );

  update public.wholesale_invoices
  set paid_total = v_new_paid
  where id = p_invoice_id;

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
    p_actor_user_id,
    'wholesale_payment_registered',
    'wholesale_invoices',
    p_invoice_id,
    jsonb_build_object(
      'amount', p_amount,
      'payment_method', p_payment_method
    )
  );

  return query
  select wi.id, wi.paid_total, wi.balance_due, wi.status
  from public.wholesale_invoices wi
  where wi.id = p_invoice_id;
end;
$$;

grant execute on function public.register_wholesale_payment(uuid, uuid, numeric, text, text, text) to authenticated;
