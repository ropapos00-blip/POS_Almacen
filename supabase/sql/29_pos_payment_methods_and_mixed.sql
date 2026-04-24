-- 29_pos_payment_methods_and_mixed.sql
-- Extend sale_payments.method constraint to include new payment methods (addi, credilondon, etc.)
-- Extend manual_invoices.payment_method constraint to include 'mixed'

-- 1. Extend sale_payments.method
alter table public.sale_payments
  drop constraint if exists sale_payments_method_check;

alter table public.sale_payments
  add constraint sale_payments_method_check
  check (method in (
    'cash', 'card', 'transfer', 'mixed',
    'addi', 'credilondon', 'dataphone', 'bancolombia', 'daviplata', 'nequi'
  ));

-- 2. Extend manual_invoices.payment_method to include 'mixed'
alter table public.manual_invoices
  drop constraint if exists manual_invoices_payment_method_check;

alter table public.manual_invoices
  add constraint manual_invoices_payment_method_check
  check (payment_method in (
    'cash', 'addi', 'credilondon', 'dataphone', 'bancolombia', 'daviplata', 'nequi', 'mixed'
  ));
