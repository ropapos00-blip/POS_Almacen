-- ============================================================
-- Migration 34: Clave de descuento por tienda
-- Permite a admin/super_admin configurar un PIN numérico que
-- el cajero debe ingresar para aplicar descuentos.
-- ============================================================

-- Columnas en stores
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS discount_pin_hash    TEXT,
  ADD COLUMN IF NOT EXISTS discount_pin_enabled BOOLEAN NOT NULL DEFAULT false;

-- ----------------------------------------------------------
-- get_store_discount_pin_config
-- Devuelve si el PIN está activo y si hay uno configurado.
-- Accesible a cualquier miembro autenticado de la tienda.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION get_store_discount_pin_config(p_store_id UUID)
RETURNS TABLE (out_enabled BOOLEAN, out_has_pin BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_store_roles
    WHERE store_id = p_store_id
      AND user_id   = auth.uid()
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'No autorizado.';
  END IF;

  RETURN QUERY
  SELECT s.discount_pin_enabled, (s.discount_pin_hash IS NOT NULL)
  FROM   stores s
  WHERE  s.id = p_store_id;
END;
$$;

-- ----------------------------------------------------------
-- set_store_discount_pin
-- Guarda/cambia el PIN y activa o desactiva el sistema.
-- Solo admin y super_admin.
-- Si p_pin es vacío ('') no cambia el hash existente.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION set_store_discount_pin(
  p_store_id UUID,
  p_pin      TEXT,
  p_enabled  BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT r.code INTO v_role
  FROM   user_store_roles usr
  JOIN   roles r ON r.id = usr.role_id
  WHERE  usr.store_id  = p_store_id
    AND  usr.user_id   = auth.uid()
    AND  usr.is_active = true;

  IF v_role NOT IN ('super_admin', 'admin') THEN
    RAISE EXCEPTION 'Solo admin o super_admin puede configurar la clave de descuento.';
  END IF;

  UPDATE stores
  SET
    discount_pin_hash    = CASE
                             WHEN p_pin IS NOT NULL AND length(p_pin) > 0
                             THEN extensions.crypt(p_pin, extensions.gen_salt('bf'))
                             ELSE discount_pin_hash
                           END,
    discount_pin_enabled = p_enabled
  WHERE id = p_store_id;
END;
$$;

-- ----------------------------------------------------------
-- validate_store_discount_pin
-- Valida el PIN ingresado. Devuelve TRUE si es correcto.
-- Accesible a cualquier miembro autenticado de la tienda.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_store_discount_pin(
  p_store_id UUID,
  p_pin      TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash    TEXT;
  v_enabled BOOLEAN;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_store_roles
    WHERE store_id = p_store_id
      AND user_id   = auth.uid()
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'No autorizado.';
  END IF;

  SELECT s.discount_pin_hash, s.discount_pin_enabled
  INTO   v_hash, v_enabled
  FROM   stores s
  WHERE  s.id = p_store_id;

  IF NOT v_enabled OR v_hash IS NULL THEN
    RETURN false;
  END IF;

  RETURN v_hash = extensions.crypt(p_pin, v_hash);
END;
$$;
