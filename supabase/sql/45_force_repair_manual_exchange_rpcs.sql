-- 45_force_repair_manual_exchange_rpcs.sql
-- Reparacion forzada del flujo de cambios manuales.
-- Ejecuta este archivo COMPLETO en Supabase SQL Editor.

-- 1) Limpiar firmas antiguas del RPC de facturacion manual
DROP FUNCTION IF EXISTS public.create_manual_invoice_transaction(uuid, uuid, text, numeric, text, text, jsonb);
DROP FUNCTION IF EXISTS public.create_manual_invoice_transaction(uuid, uuid, text, numeric, text, text, jsonb, text);
DROP FUNCTION IF EXISTS public.create_manual_invoice_transaction(uuid, uuid, text, text, numeric, text, text, jsonb, text);
DROP FUNCTION IF EXISTS public.create_manual_invoice_transaction(uuid, uuid, text, text, numeric, text, text, jsonb, text, numeric);

-- 2) Recrear create_manual_invoice_transaction (version con p_apply_credit)
CREATE OR REPLACE FUNCTION public.create_manual_invoice_transaction(
  p_store_id uuid,
  p_created_by uuid,
  p_customer_name text,
  p_customer_phone text,
  p_discount_total numeric,
  p_payment_method text,
  p_payment_reference text,
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_apply_credit numeric DEFAULT 0
)
RETURNS TABLE (invoice_id uuid, invoice_number text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
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
  v_mixed_parts text[];
  v_mixed_sum numeric;
  v_variant_id uuid;
  v_stock integer;
  v_phone text;
  v_name text;
BEGIN
  IF NOT (p_store_id IN (SELECT public.current_user_store_ids())) THEN
    RAISE EXCEPTION 'Usuario sin acceso a la tienda.';
  END IF;

  IF NOT (
    public.current_user_has_role('super_admin')
    OR public.current_user_has_role('admin')
    OR public.current_user_has_role('cashier')
  ) THEN
    RAISE EXCEPTION 'Usuario sin permisos para facturacion manual.';
  END IF;

  IF p_payment_method NOT IN (
    'cash', 'addi', 'credilondon', 'dataphone',
    'bancolombia', 'daviplata', 'nequi', 'rapirecarga', 'mixed'
  ) THEN
    RAISE EXCEPTION 'Metodo de pago invalido.';
  END IF;

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La factura manual requiere al menos un item.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_description := trim(coalesce(v_item->>'description', ''));
    v_qty := coalesce((v_item->>'quantity')::integer, 0);
    v_price := coalesce((v_item->>'unit_price')::numeric, 0);

    IF v_description = '' THEN
      RAISE EXCEPTION 'Descripcion de item requerida.';
    END IF;

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Cantidad invalida en items.';
    END IF;

    IF v_price < 0 THEN
      RAISE EXCEPTION 'Precio invalido en items.';
    END IF;

    v_variant_id := nullif(trim(coalesce(v_item->>'variant_id', '')), '')::uuid;
    IF v_variant_id IS NOT NULL THEN
      SELECT quantity_on_hand INTO v_stock
      FROM public.inventory_stock
      WHERE variant_id = v_variant_id AND store_id = p_store_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Producto no encontrado en el inventario de la tienda.';
      END IF;

      IF v_stock < v_qty THEN
        RAISE EXCEPTION 'Stock insuficiente: disponible %, solicitado %.', v_stock, v_qty;
      END IF;
    END IF;

    v_line_total := v_qty * v_price;
    v_subtotal := v_subtotal + v_line_total;
  END LOOP;

  IF v_discount_total < 0 THEN
    RAISE EXCEPTION 'Descuento invalido.';
  END IF;

  IF v_discount_total > v_subtotal THEN
    RAISE EXCEPTION 'Descuento no puede superar subtotal.';
  END IF;

  v_grand_total := v_subtotal - v_discount_total;
  v_phone := trim(coalesce(p_customer_phone, ''));
  v_name := nullif(trim(coalesce(p_customer_name, '')), '');

  IF v_credit_to_apply > 0 THEN
    IF v_phone = '' THEN
      RAISE EXCEPTION 'No puedes aplicar saldo a favor sin telefono del cliente.';
    END IF;

    SELECT coalesce(micc.balance, 0)
    INTO v_credit_balance
    FROM public.manual_invoice_customer_credits micc
    WHERE micc.store_id = p_store_id
      AND micc.customer_phone = v_phone
    FOR UPDATE;

    IF NOT FOUND THEN
      v_credit_balance := 0;
    END IF;

    IF v_credit_to_apply > v_credit_balance THEN
      RAISE EXCEPTION 'El saldo a favor disponible (% ) es menor al saldo a aplicar (%).', v_credit_balance, v_credit_to_apply;
    END IF;

    IF v_credit_to_apply > v_grand_total THEN
      RAISE EXCEPTION 'El saldo a aplicar no puede superar el total de la factura.';
    END IF;
  END IF;

  v_amount_due := v_grand_total - v_credit_to_apply;

  IF p_payment_method = 'mixed' THEN
    v_mixed_parts := string_to_array(coalesce(p_payment_reference, ''), ':');
    IF array_length(v_mixed_parts, 1) = 4 THEN
      v_mixed_sum := coalesce(v_mixed_parts[2]::numeric, 0) + coalesce(v_mixed_parts[4]::numeric, 0);
      IF abs(v_mixed_sum - v_amount_due) > 1 THEN
        RAISE EXCEPTION 'Los montos del pago mixto (%) no coinciden con el total a pagar (%).', v_mixed_sum, v_amount_due;
      END IF;
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('manual_invoice:' || p_store_id::text));

  SELECT mi.invoice_number INTO v_invoice_number
  FROM public.manual_invoices mi
  WHERE mi.store_id = p_store_id
    AND mi.invoice_number ~ '^No Venta [0-9]+$'
  ORDER BY length(mi.invoice_number) DESC, mi.invoice_number DESC
  LIMIT 1;

  DECLARE
    v_next_number integer;
  BEGIN
    IF v_invoice_number IS NOT NULL THEN
      v_next_number := (regexp_replace(v_invoice_number, '[^0-9]', '', 'g'))::integer + 1;
    ELSE
      v_next_number := 1;
    END IF;
    IF v_next_number < 10000 THEN
      v_invoice_number := 'No Venta ' || lpad(v_next_number::text, 4, '0');
    ELSE
      v_invoice_number := 'No Venta ' || v_next_number::text;
    END IF;
  END;

  INSERT INTO public.manual_invoices (
    store_id,
    invoice_number,
    customer_name,
    customer_phone,
    notes,
    subtotal,
    discount_total,
    credit_applied_total,
    grand_total,
    payment_method,
    payment_reference,
    created_by,
    source
  )
  VALUES (
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
  RETURNING id INTO v_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_description := trim(coalesce(v_item->>'description', ''));
    v_qty := coalesce((v_item->>'quantity')::integer, 0);
    v_price := coalesce((v_item->>'unit_price')::numeric, 0);
    v_line_total := v_qty * v_price;
    v_variant_id := nullif(trim(coalesce(v_item->>'variant_id', '')), '')::uuid;

    INSERT INTO public.manual_invoice_items (
      manual_invoice_id,
      description,
      quantity,
      unit_price,
      line_total,
      variant_id
    )
    VALUES (
      v_invoice_id,
      v_description,
      v_qty,
      v_price,
      v_line_total,
      v_variant_id
    );

    IF v_variant_id IS NOT NULL THEN
      UPDATE public.inventory_stock
      SET quantity_on_hand = quantity_on_hand - v_qty
      WHERE variant_id = v_variant_id AND store_id = p_store_id;
    END IF;
  END LOOP;

  IF v_credit_to_apply > 0 THEN
    UPDATE public.manual_invoice_customer_credits micc
    SET
      balance = micc.balance - v_credit_to_apply,
      customer_name = coalesce(v_name, micc.customer_name),
      updated_at = now()
    WHERE micc.store_id = p_store_id
      AND micc.customer_phone = v_phone
    RETURNING balance INTO v_credit_balance_after;

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
  END IF;

  INSERT INTO public.audit_logs (
    store_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    payload_after
  )
  VALUES (
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

  RETURN QUERY SELECT v_invoice_id, v_invoice_number;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_manual_invoice_transaction(uuid, uuid, text, text, numeric, text, text, jsonb, text, numeric) TO authenticated;

-- 3) Limpiar firmas antiguas del RPC de cambios
DROP FUNCTION IF EXISTS public.create_manual_invoice_exchange_transaction(uuid, uuid, jsonb, jsonb, text, numeric, text, text, text, text, numeric);
DROP FUNCTION IF EXISTS public.create_manual_invoice_exchange_transaction(uuid, uuid, jsonb, jsonb, text, numeric, text, text, text, text);

-- 4) Recrear create_manual_invoice_exchange_transaction (version corregida)
CREATE OR REPLACE FUNCTION public.create_manual_invoice_exchange_transaction(
  p_source_invoice_id uuid,
  p_actor_user_id uuid,
  p_return_items jsonb,
  p_new_items jsonb,
  p_reason text DEFAULT NULL,
  p_discount_total numeric DEFAULT 0,
  p_payment_method text DEFAULT 'cash',
  p_payment_reference text DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_customer_phone text DEFAULT NULL,
  p_apply_return_credit numeric DEFAULT NULL
)
RETURNS TABLE (
  exchange_id uuid,
  return_id uuid,
  return_number text,
  new_invoice_id uuid,
  new_invoice_number text,
  credit_generated numeric,
  credit_applied numeric,
  additional_payment numeric,
  remaining_credit numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_source_invoice public.manual_invoices%rowtype;
  v_store_id uuid;
  v_customer_name text;
  v_customer_phone text;
  v_reason text;

  v_return_id uuid;
  v_return_number text;
  v_credit_generated numeric := 0;

  v_new_subtotal numeric := 0;
  v_new_discount numeric := greatest(0, coalesce(p_discount_total, 0));
  v_new_grand_total numeric := 0;
  v_apply_credit_requested numeric;
  v_apply_credit numeric := 0;

  v_new_invoice_id uuid;
  v_new_invoice_number text;
  v_additional_payment numeric := 0;
  v_exchange_id uuid;

  v_item jsonb;
  v_description text;
  v_qty integer;
  v_price numeric;
  v_phone_balance numeric := 0;
BEGIN
  SELECT *
  INTO v_source_invoice
  FROM public.manual_invoices
  WHERE id = p_source_invoice_id
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura origen no encontrada o anulada.';
  END IF;

  v_store_id := v_source_invoice.store_id;

  IF NOT (v_store_id IN (SELECT public.current_user_store_ids())) THEN
    RAISE EXCEPTION 'Usuario sin acceso a la tienda de la factura.';
  END IF;

  IF NOT (
    public.current_user_has_role('super_admin')
    OR public.current_user_has_role('admin')
    OR public.current_user_has_role('cashier')
  ) THEN
    RAISE EXCEPTION 'Usuario sin permisos para cambios de factura manual.';
  END IF;

  IF jsonb_typeof(p_new_items) <> 'array' OR jsonb_array_length(p_new_items) = 0 THEN
    RAISE EXCEPTION 'El cambio requiere al menos un nuevo articulo.';
  END IF;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  v_customer_name := nullif(trim(coalesce(p_customer_name, v_source_invoice.customer_name, '')), '');
  v_customer_phone := nullif(trim(coalesce(p_customer_phone, v_source_invoice.customer_phone, '')), '');

  IF v_customer_phone IS NULL THEN
    RAISE EXCEPTION 'El cambio requiere cliente con telefono para manejar saldo a favor.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_new_items)
  LOOP
    v_description := trim(coalesce(v_item->>'description', ''));
    v_qty := coalesce((v_item->>'quantity')::integer, 0);
    v_price := coalesce((v_item->>'unit_price')::numeric, 0);

    IF v_description = '' THEN
      RAISE EXCEPTION 'Descripcion requerida en articulo de cambio.';
    END IF;

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Cantidad invalida en articulo de cambio.';
    END IF;

    IF v_price < 0 THEN
      RAISE EXCEPTION 'Precio invalido en articulo de cambio.';
    END IF;

    v_new_subtotal := v_new_subtotal + (v_qty * v_price);
  END LOOP;

  IF v_new_discount > v_new_subtotal THEN
    RAISE EXCEPTION 'El descuento no puede superar el subtotal del cambio.';
  END IF;

  v_new_grand_total := v_new_subtotal - v_new_discount;

  SELECT r.return_id, r.return_number, r.credit_amount
  INTO v_return_id, v_return_number, v_credit_generated
  FROM public.create_manual_invoice_return_transaction(
    p_source_invoice_id,
    p_actor_user_id,
    p_return_items,
    v_reason
  ) r
  LIMIT 1;

  IF v_return_id IS NULL THEN
    RAISE EXCEPTION 'No se pudo registrar la devolucion del cambio.';
  END IF;

  v_apply_credit_requested := coalesce(p_apply_return_credit, v_credit_generated);
  v_apply_credit := least(greatest(0, v_apply_credit_requested), v_credit_generated, v_new_grand_total);

  SELECT c.invoice_id, c.invoice_number
  INTO v_new_invoice_id, v_new_invoice_number
  FROM public.create_manual_invoice_transaction(
    p_store_id => v_store_id,
    p_created_by => p_actor_user_id,
    p_customer_name => v_customer_name,
    p_customer_phone => v_customer_phone,
    p_discount_total => v_new_discount,
    p_payment_method => p_payment_method,
    p_payment_reference => p_payment_reference,
    p_items => p_new_items,
    p_notes => nullif(trim(concat('Cambio de ', v_source_invoice.invoice_number, case when v_reason is not null then ' - ' || v_reason else '' end)), ''),
    p_apply_credit => v_apply_credit
  ) c
  LIMIT 1;

  IF v_new_invoice_id IS NULL THEN
    RAISE EXCEPTION 'No se pudo crear la nueva factura del cambio.';
  END IF;

  SELECT greatest(0, grand_total - credit_applied_total)
  INTO v_additional_payment
  FROM public.manual_invoices
  WHERE id = v_new_invoice_id;

  SELECT coalesce(micc.balance, 0)
  INTO v_phone_balance
  FROM public.manual_invoice_customer_credits micc
  WHERE micc.store_id = v_store_id
    AND micc.customer_phone = v_customer_phone;

  INSERT INTO public.manual_invoice_exchanges (
    store_id,
    source_invoice_id,
    return_id,
    new_invoice_id,
    reason,
    created_by
  )
  VALUES (
    v_store_id,
    p_source_invoice_id,
    v_return_id,
    v_new_invoice_id,
    v_reason,
    p_actor_user_id
  )
  RETURNING id INTO v_exchange_id;

  INSERT INTO public.audit_logs (
    store_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    payload_after
  )
  VALUES (
    v_store_id,
    p_actor_user_id,
    'manual_invoice_exchange_created',
    'manual_invoice_exchanges',
    v_exchange_id,
    jsonb_build_object(
      'source_invoice_id', p_source_invoice_id,
      'source_invoice_number', v_source_invoice.invoice_number,
      'return_id', v_return_id,
      'return_number', v_return_number,
      'new_invoice_id', v_new_invoice_id,
      'new_invoice_number', v_new_invoice_number,
      'credit_generated', v_credit_generated,
      'credit_applied', v_apply_credit,
      'additional_payment', v_additional_payment,
      'remaining_credit', v_phone_balance
    )
  );

  RETURN QUERY
  SELECT
    v_exchange_id,
    v_return_id,
    v_return_number,
    v_new_invoice_id,
    v_new_invoice_number,
    v_credit_generated,
    v_apply_credit,
    v_additional_payment,
    v_phone_balance;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_manual_invoice_exchange_transaction(uuid, uuid, jsonb, jsonb, text, numeric, text, text, text, text, numeric) TO authenticated;

-- 5) Verificacion rapida
SELECT p.oid::regprocedure AS signature
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'create_manual_invoice_transaction',
    'create_manual_invoice_exchange_transaction'
  )
ORDER BY 1;
