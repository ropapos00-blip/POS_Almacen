-- 28_fix_function_search_path.sql
-- Corrige warnings de Supabase Security Advisor sobre role mutable search_path.
-- No cambia logica funcional: solo fija search_path en funciones existentes.

-- create_sale_transaction(uuid, uuid, numeric, text, jsonb, jsonb)
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_sale_transaction'
      and pg_get_function_identity_arguments(p.oid) = 'p_store_id uuid, p_sold_by uuid, p_discount_total numeric, p_customer_name text, p_items jsonb, p_payments jsonb'
  ) then
    alter function public.create_sale_transaction(uuid, uuid, numeric, text, jsonb, jsonb)
      set search_path = public;
  end if;
end;
$$;

-- void_sale_transaction(uuid, uuid, text)
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'void_sale_transaction'
      and pg_get_function_identity_arguments(p.oid) = 'p_sale_id uuid, p_actor_user_id uuid, p_reason text'
  ) then
    alter function public.void_sale_transaction(uuid, uuid, text)
      set search_path = public;
  end if;
end;
$$;

-- sync_wholesale_invoice_status() trigger function
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'sync_wholesale_invoice_status'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    alter function public.sync_wholesale_invoice_status()
      set search_path = public;
  end if;
end;
$$;
