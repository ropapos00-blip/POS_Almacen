-- Migration 29: Revoke EXECUTE on all SECURITY DEFINER functions from the anon role.
-- These functions require an authenticated session to be meaningful.
-- Leaving them callable by unauthenticated users exposes the API surface unnecessarily.
-- The authenticated role retains EXECUTE because the functions contain their own
-- internal authorization checks (store ownership, role checks, etc.).

REVOKE EXECUTE ON FUNCTION public.add_layaway_payment(uuid, numeric, text, text, uuid)               FROM anon;
REVOKE EXECUTE ON FUNCTION public.authorize_discount_override(uuid, text, text, numeric)              FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_layaway(uuid)                                                FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_layaway(uuid, text, text, text, uuid, jsonb)                 FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_pos_user(text, text, text, uuid, text)                       FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_pos_user(text, text, text, uuid, text, text)                 FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_wholesale_invoice_transaction(uuid, uuid, text, text, numeric, boolean, date, text, text, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_user_has_role(text)                                         FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_user_store_ids()                                            FROM anon;
REVOKE EXECUTE ON FUNCTION public.deactivate_pos_user(uuid)                                           FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_store_discount_pin_config(uuid)                                 FROM anon;
REVOKE EXECUTE ON FUNCTION public.next_wholesale_invoice_number(uuid)                                 FROM anon;
REVOKE EXECUTE ON FUNCTION public.reactivate_pos_user(uuid)                                           FROM anon;
REVOKE EXECUTE ON FUNCTION public.reset_wholesale_invoice_numbers(uuid)                               FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_store_discount_pin(uuid, text, boolean)                         FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_pos_user_role(uuid, text)                                    FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_store_hidden_nav_routes(uuid, text[])                        FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_store_name(uuid, text)                                       FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_store_receipt_profile(uuid, text, text, text, text, text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_wholesale_invoice_transaction(uuid, uuid, text, text, text, numeric, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_store_discount_pin(uuid, text)                             FROM anon;
REVOKE EXECUTE ON FUNCTION public.void_wholesale_invoice_transaction(uuid, uuid)                      FROM anon;
