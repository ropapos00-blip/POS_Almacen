-- 46_fix_return_rpc_customer_phone_ambiguity.sql
-- Fix puntual para 42702 en create_manual_invoice_return_transaction.
-- Ejecuta este script COMPLETO en Supabase SQL Editor.

DROP FUNCTION IF EXISTS public.create_manual_invoice_return_transaction(uuid, uuid, jsonb, text);

CREATE OR REPLACE FUNCTION public.create_manual_invoice_return_transaction(
  p_invoice_id uuid,
  p_actor_user_id uuid,
  p_return_items jsonb,
  p_reason text DEFAULT null
)
RETURNS TABLE (
  return_id uuid,
  return_number text,
  credit_amount numeric,
  returned_customer_phone text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_invoice public.manual_invoices%rowtype;
  v_return_id uuid;
  v_return_number text;
  v_reason text;
  v_total numeric := 0;
  v_item jsonb;
  v_item_id uuid;
  v_qty integer;
  v_sold_item record;
  v_already_returned integer;
  v_line_total numeric;
  v_phone text;
  v_customer_name text;
  v_next_number integer;
  v_balance_after numeric;
BEGIN
  SELECT *
  INTO v_invoice
  FROM public.manual_invoices
  WHERE id = p_invoice_id
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura manual no encontrada o anulada.';
  END IF;

  IF NOT (v_invoice.store_id IN (SELECT public.current_user_store_ids())) THEN
    RAISE EXCEPTION 'Usuario sin acceso a la tienda de esta factura.';
  END IF;

  IF NOT (
    public.current_user_has_role('super_admin')
    OR public.current_user_has_role('admin')
    OR public.current_user_has_role('cashier')
  ) THEN
    RAISE EXCEPTION 'Usuario sin permisos para devolver facturas manuales.';
  END IF;

  v_phone := trim(coalesce(v_invoice.customer_phone, ''));
  IF v_phone = '' THEN
    RAISE EXCEPTION 'La factura no tiene telefono de cliente. No se puede crear saldo a favor.';
  END IF;

  IF jsonb_typeof(p_return_items) <> 'array' OR jsonb_array_length(p_return_items) = 0 THEN
    RAISE EXCEPTION 'Debes enviar al menos un item a devolver.';
  END IF;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  v_customer_name := nullif(trim(coalesce(v_invoice.customer_name, '')), '');

  PERFORM pg_advisory_xact_lock(hashtext('manual_invoice_return:' || p_invoice_id::text));
  PERFORM pg_advisory_xact_lock(hashtext('manual_invoice_return_number:' || v_invoice.store_id::text));

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_return_items)
  LOOP
    v_item_id := nullif(trim(coalesce(v_item->>'manual_invoice_item_id', '')), '')::uuid;
    v_qty := coalesce((v_item->>'quantity')::integer, 0);

    IF v_item_id IS NULL THEN
      RAISE EXCEPTION 'manual_invoice_item_id es obligatorio para cada item devuelto.';
    END IF;

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Cantidad invalida en devolucion.';
    END IF;

    SELECT mi.id, mi.manual_invoice_id, mi.variant_id, mi.description, mi.quantity, mi.unit_price
    INTO v_sold_item
    FROM public.manual_invoice_items mi
    WHERE mi.id = v_item_id
      AND mi.manual_invoice_id = p_invoice_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item de factura invalido para esta devolucion.';
    END IF;

    SELECT coalesce(sum(miri.quantity), 0)::integer
    INTO v_already_returned
    FROM public.manual_invoice_return_items miri
    JOIN public.manual_invoice_returns mir ON mir.id = miri.manual_invoice_return_id
    WHERE mir.manual_invoice_id = p_invoice_id
      AND miri.manual_invoice_item_id = v_item_id;

    IF v_qty > (v_sold_item.quantity - v_already_returned) THEN
      RAISE EXCEPTION 'La cantidad a devolver supera el pendiente de ese item.';
    END IF;

    v_line_total := v_qty * v_sold_item.unit_price;
    v_total := v_total + v_line_total;
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'La devolucion debe tener un valor mayor a cero.';
  END IF;

  SELECT mir.return_number
  INTO v_return_number
  FROM public.manual_invoice_returns mir
  WHERE mir.store_id = v_invoice.store_id
    AND mir.return_number ~ '^DEV-[0-9]+$'
  ORDER BY length(mir.return_number) DESC, mir.return_number DESC
  LIMIT 1;

  IF v_return_number IS NOT NULL THEN
    v_next_number := (regexp_replace(v_return_number, '[^0-9]', '', 'g'))::integer + 1;
  ELSE
    v_next_number := 1;
  END IF;

  IF v_next_number < 10000 THEN
    v_return_number := 'DEV-' || lpad(v_next_number::text, 4, '0');
  ELSE
    v_return_number := 'DEV-' || v_next_number::text;
  END IF;

  INSERT INTO public.manual_invoice_returns (
    store_id,
    manual_invoice_id,
    return_number,
    customer_name,
    customer_phone,
    reason,
    total_amount,
    created_by
  )
  VALUES (
    v_invoice.store_id,
    p_invoice_id,
    v_return_number,
    v_customer_name,
    v_phone,
    v_reason,
    v_total,
    p_actor_user_id
  )
  RETURNING id INTO v_return_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_return_items)
  LOOP
    v_item_id := nullif(trim(coalesce(v_item->>'manual_invoice_item_id', '')), '')::uuid;
    v_qty := coalesce((v_item->>'quantity')::integer, 0);

    SELECT mi.id, mi.manual_invoice_id, mi.variant_id, mi.description, mi.quantity, mi.unit_price
    INTO v_sold_item
    FROM public.manual_invoice_items mi
    WHERE mi.id = v_item_id
      AND mi.manual_invoice_id = p_invoice_id;

    v_line_total := v_qty * v_sold_item.unit_price;

    INSERT INTO public.manual_invoice_return_items (
      manual_invoice_return_id,
      manual_invoice_item_id,
      variant_id,
      description,
      quantity,
      unit_price,
      line_total
    )
    VALUES (
      v_return_id,
      v_sold_item.id,
      v_sold_item.variant_id,
      v_sold_item.description,
      v_qty,
      v_sold_item.unit_price,
      v_line_total
    );

    IF v_sold_item.variant_id IS NOT NULL THEN
      UPDATE public.inventory_stock
      SET quantity_on_hand = quantity_on_hand + v_qty
      WHERE store_id = v_invoice.store_id
        AND variant_id = v_sold_item.variant_id;

      INSERT INTO public.inventory_movements (
        store_id,
        variant_id,
        type,
        quantity,
        reason,
        reference_type,
        reference_id,
        performed_by
      )
      VALUES (
        v_invoice.store_id,
        v_sold_item.variant_id,
        'return',
        v_qty,
        'manual_invoice_return',
        'manual_invoice_return',
        v_return_id,
        p_actor_user_id
      );
    END IF;
  END LOOP;

  INSERT INTO public.manual_invoice_customer_credits (
    store_id,
    customer_phone,
    customer_name,
    balance,
    updated_at
  )
  VALUES (
    v_invoice.store_id,
    v_phone,
    v_customer_name,
    v_total,
    now()
  )
  ON CONFLICT (store_id, customer_phone)
  DO UPDATE
  SET
    customer_name = coalesce(excluded.customer_name, public.manual_invoice_customer_credits.customer_name),
    balance = public.manual_invoice_customer_credits.balance + excluded.balance,
    updated_at = now()
  RETURNING balance INTO v_balance_after;

  INSERT INTO public.manual_invoice_credit_movements (
    store_id,
    customer_phone,
    customer_name,
    movement_type,
    amount,
    balance_after,
    reference_type,
    reference_id,
    notes,
    created_by
  )
  VALUES (
    v_invoice.store_id,
    v_phone,
    v_customer_name,
    'return',
    v_total,
    v_balance_after,
    'manual_invoice_return',
    v_return_id,
    v_reason,
    p_actor_user_id
  );

  INSERT INTO public.audit_logs (
    store_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    payload_after
  )
  VALUES (
    v_invoice.store_id,
    p_actor_user_id,
    'manual_invoice_return_created',
    'manual_invoice_returns',
    v_return_id,
    jsonb_build_object(
      'invoice_id', p_invoice_id,
      'return_number', v_return_number,
      'credit_amount', v_total,
      'customer_phone', v_phone,
      'reason', v_reason
    )
  );

  RETURN QUERY
  SELECT v_return_id, v_return_number, v_total, v_phone;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_manual_invoice_return_transaction(uuid, uuid, jsonb, text) TO authenticated;

-- Verificacion
SELECT p.oid::regprocedure AS signature
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'create_manual_invoice_return_transaction';
