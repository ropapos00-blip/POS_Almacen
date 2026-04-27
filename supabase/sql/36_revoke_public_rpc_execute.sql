-- Migration 36: Revoke EXECUTE from PUBLIC on all SECURITY DEFINER RPC functions
-- and re-grant explicitly only to the roles that need them.
--
-- WHY: Migration 29 already did REVOKE FROM anon, but that is insufficient because
-- PostgreSQL grants EXECUTE to PUBLIC by default when a function is created.
-- The anon role inherits EXECUTE through PUBLIC, so revoking from anon directly
-- has no practical effect while the PUBLIC grant remains.
--
-- FIX: REVOKE FROM PUBLIC, then GRANT only to `authenticated` (for app functions)
-- or to both `anon` + `authenticated` for RLS helper functions that must run
-- during table access checks by unauthenticated sessions.
--
-- RESULT after applying this migration:
--   - anon can no longer call sensitive RPCs via the REST API
--   - authenticated (logged-in) users can still call all necessary RPCs
--   - current_user_store_ids / current_user_has_role keep anon EXECUTE so
--     RLS policies continue to work for unauthenticated table queries
--   - The `authenticated_security_definer_function_executable` warnings WILL
--     remain because authenticated users intentionally can call these functions.
--   - auth_leaked_password_protection must be enabled in the Supabase dashboard
--     (Authentication > Providers > Email > "Leaked password protection").

-- ============================================================
-- 1. RLS helper functions
--    anon needs EXECUTE so RLS policies work during unauth queries.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.current_user_store_ids()     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_user_has_role(text)  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_user_store_ids()     TO anon;
GRANT EXECUTE ON FUNCTION public.current_user_store_ids()     TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_role(text)  TO anon;
GRANT EXECUTE ON FUNCTION public.current_user_has_role(text)  TO authenticated;


-- ============================================================
-- 2. Sensitive RPC functions — authenticated only
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.add_layaway_payment(uuid, numeric, text, text, uuid)
  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.add_layaway_payment(uuid, numeric, text, text, uuid)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.authorize_discount_override(uuid, text, text, numeric)
  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.authorize_discount_override(uuid, text, text, numeric)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.cancel_layaway(uuid)
  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cancel_layaway(uuid)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_layaway(uuid, text, text, text, uuid, jsonb)
  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_layaway(uuid, text, text, text, uuid, jsonb)
  TO authenticated;

-- Two overloads of create_pos_user
REVOKE EXECUTE ON FUNCTION public.create_pos_user(text, text, text, uuid, text)
  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_pos_user(text, text, text, uuid, text)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_pos_user(text, text, text, uuid, text, text)
  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_pos_user(text, text, text, uuid, text, text)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_wholesale_invoice_transaction(uuid, uuid, text, text, numeric, boolean, date, text, text, text, jsonb)
  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_wholesale_invoice_transaction(uuid, uuid, text, text, numeric, boolean, date, text, text, text, jsonb)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.deactivate_pos_user(uuid)
  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.deactivate_pos_user(uuid)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_store_discount_pin_config(uuid)
  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_store_discount_pin_config(uuid)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.next_wholesale_invoice_number(uuid)
  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.next_wholesale_invoice_number(uuid)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reactivate_pos_user(uuid)
  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reactivate_pos_user(uuid)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reset_wholesale_invoice_numbers(uuid)
  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.reset_wholesale_invoice_numbers(uuid)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_store_discount_pin(uuid, text, boolean)
  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_store_discount_pin(uuid, text, boolean)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_pos_user_role(uuid, text)
  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_pos_user_role(uuid, text)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_store_hidden_nav_routes(uuid, text[])
  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_store_hidden_nav_routes(uuid, text[])
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_store_name(uuid, text)
  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_store_name(uuid, text)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_store_receipt_profile(uuid, text, text, text, text, text, text, text, text)
  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_store_receipt_profile(uuid, text, text, text, text, text, text, text, text)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_wholesale_invoice_transaction(uuid, uuid, text, text, text, numeric, jsonb)
  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_wholesale_invoice_transaction(uuid, uuid, text, text, text, numeric, jsonb)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.validate_store_discount_pin(uuid, text)
  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.validate_store_discount_pin(uuid, text)
  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.void_wholesale_invoice_transaction(uuid, uuid)
  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.void_wholesale_invoice_transaction(uuid, uuid)
  TO authenticated;
