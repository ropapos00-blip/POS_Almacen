-- Migration 35: add suggested_price to product_variants
-- "Precio sugerido" is displayed alongside the minimum sale price in inventory management.

alter table public.product_variants
  add column if not exists suggested_price numeric(12,2);
