-- 48_reopen_invoice_after_voided_exchange.sql
-- Reabre una factura original cuando su factura de cambio ya fue anulada,
-- deshaciendo la devolucion asociada para permitir hacer el cambio nuevamente.
--
-- Uso:
-- select * from public.reopen_manual_invoice_after_voided_exchange(
--   p_source_invoice_id => 'UUID_FACTURA_ORIGINAL',
--   p_actor_user_id => 'UUID_USUARIO_ADMIN',
--   p_reason => 'Rehacer cambio tras anulacion'
-- );

DROP FUNCTION IF EXISTS public.reopen_manual_invoice_after_voided_exchange(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.reopen_manual_invoice_after_voided_exchange(
  p_source_invoice_id uuid,
  p_actor_user_id uuid,
  p_reason text default null
)
RETURNS TABLE (
  source_invoice_id uuid,
  source_invoice_number text,
  reversed_exchange_id uuid,
  reversed_return_id uuid
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_source_invoice public.manual_invoices%rowtype;
  v_exchange record;
  v_return public.manual_invoice_returns%rowtype;
  v_new_invoice public.manual_invoices%rowtype;
  v_item record;
  v_phone text;
  v_reason text;
  v_balance numeric := 0;
  v_credit_to_restore numeric := 0;
  v_balance_after numeric := 0;
BEGIN
  SELECT *
  INTO v_source_invoice
  FROM public.manual_invoices
  WHERE id = p_source_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura original no encontrada.';
  END IF;

  IF NOT (v_source_invoice.store_id IN (SELECT public.current_user_store_ids())) THEN
    RAISE EXCEPTION 'Usuario sin acceso a la tienda de la factura.';
  END IF;

  IF NOT (
    public.current_user_has_role('super_admin')
    OR public.current_user_has_role('admin')
  ) THEN
    RAISE EXCEPTION 'Solo admin o super admin pueden reabrir cambios.';
  END IF;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');

  SELECT mie.id, mie.return_id, mie.new_invoice_id
  INTO v_exchange
  FROM public.manual_invoice_exchanges mie
  WHERE mie.source_invoice_id = p_source_invoice_id
  ORDER BY mie.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La factura original no tiene un cambio asociado para reabrir.';
  END IF;

  SELECT *
  INTO v_new_invoice
  FROM public.manual_invoices
  WHERE id = v_exchange.new_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura de cambio no encontrada.';
  END IF;

  IF v_new_invoice.is_active THEN
    RAISE EXCEPTION 'No se puede reabrir: la factura de cambio sigue activa. Primero anula esa factura.';
  END IF;

  SELECT *
  INTO v_return
  FROM public.manual_invoice_returns
  WHERE id = v_exchange.return_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Devolucion asociada al cambio no encontrada.';
  END IF;

  v_phone := nullif(trim(coalesce(v_return.customer_phone, '')), '');
  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'La devolucion no tiene telefono de cliente valido.';
  END IF;

  -- Bloqueos por concurrencia
  PERFORM pg_advisory_xact_lock(hashtext('manual_exchange_reopen:' || p_source_invoice_id::text));

  -- 1) Asegurar que el saldo refleje la anulacion de la factura de cambio.
  -- Si la anulacion no devolvio credito aplicado, lo restauramos aqui para poder cerrar en cero.
  v_credit_to_restore := greatest(0, coalesce(v_new_invoice.credit_applied_total, 0));

  SELECT coalesce(micc.balance, 0)
  INTO v_balance
  FROM public.manual_invoice_customer_credits micc
  WHERE micc.store_id = v_source_invoice.store_id
    AND micc.customer_phone = v_phone
  FOR UPDATE;

  IF NOT FOUND THEN
    v_balance := 0;
  END IF;

  IF v_balance < v_return.total_amount AND v_credit_to_restore > 0 THEN
    INSERT INTO public.manual_invoice_customer_credits (
      store_id,
      customer_phone,
      customer_name,
      balance,
      updated_at
    )
    VALUES (
      v_source_invoice.store_id,
      v_phone,
      nullif(trim(coalesce(v_return.customer_name, '')), ''),
      v_credit_to_restore,
      now()
    )
    ON CONFLICT (store_id, customer_phone)
    DO UPDATE
    SET
      balance = public.manual_invoice_customer_credits.balance + excluded.balance,
      customer_name = coalesce(excluded.customer_name, public.manual_invoice_customer_credits.customer_name),
      updated_at = now()
    RETURNING balance INTO v_balance;

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
      v_source_invoice.store_id,
      v_phone,
      nullif(trim(coalesce(v_return.customer_name, '')), ''),
      'adjustment',
      v_credit_to_restore,
      v_balance,
      'manual_invoice',
      v_new_invoice.id,
      'Restauracion tecnica de credito aplicado por anulacion de factura de cambio',
      p_actor_user_id
    );
  END IF;

  -- 2) Ahora si, revertir el saldo generado por esa devolucion.
  SELECT coalesce(micc.balance, 0)
  INTO v_balance
  FROM public.manual_invoice_customer_credits micc
  WHERE micc.store_id = v_source_invoice.store_id
    AND micc.customer_phone = v_phone
  FOR UPDATE;

  IF v_balance < v_return.total_amount THEN
    RAISE EXCEPTION 'No se puede reabrir el cambio: el saldo de la devolucion ya fue usado en otras operaciones.';
  END IF;

  UPDATE public.manual_invoice_customer_credits micc
  SET
    balance = micc.balance - v_return.total_amount,
    updated_at = now()
  WHERE micc.store_id = v_source_invoice.store_id
    AND micc.customer_phone = v_phone
  RETURNING micc.balance INTO v_balance_after;

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
    v_source_invoice.store_id,
    v_phone,
    nullif(trim(coalesce(v_return.customer_name, '')), ''),
    'adjustment',
    -v_return.total_amount,
    v_balance_after,
    'manual_invoice_return',
    v_return.id,
    coalesce(v_reason, 'Reapertura de cambio tras anulacion de factura de cambio'),
    p_actor_user_id
  );

  -- 3) Revertir el reintegro de inventario de la devolucion (volver al estado previo del cambio).
  FOR v_item IN
    SELECT variant_id, quantity
    FROM public.manual_invoice_return_items
    WHERE manual_invoice_return_id = v_return.id
      AND variant_id IS NOT NULL
  LOOP
    UPDATE public.inventory_stock
    SET quantity_on_hand = quantity_on_hand - v_item.quantity
    WHERE store_id = v_source_invoice.store_id
      AND variant_id = v_item.variant_id;
  END LOOP;

  -- 4) Eliminar relacion de cambio y la devolucion asociada.
  DELETE FROM public.manual_invoice_exchanges
  WHERE id = v_exchange.id;

  DELETE FROM public.manual_invoice_returns
  WHERE id = v_return.id;

  -- 5) Auditoria
  INSERT INTO public.audit_logs (
    store_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    payload_after
  )
  VALUES (
    v_source_invoice.store_id,
    p_actor_user_id,
    'manual_invoice_exchange_reopened',
    'manual_invoice_exchanges',
    v_exchange.id,
    jsonb_build_object(
      'source_invoice_id', v_source_invoice.id,
      'source_invoice_number', v_source_invoice.invoice_number,
      'reversed_exchange_id', v_exchange.id,
      'reversed_return_id', v_return.id,
      'reason', v_reason
    )
  );

  RETURN QUERY
  SELECT
    v_source_invoice.id,
    v_source_invoice.invoice_number,
    v_exchange.id,
    v_return.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reopen_manual_invoice_after_voided_exchange(uuid, uuid, text) TO authenticated;
