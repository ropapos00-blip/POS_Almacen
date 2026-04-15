-- 18_wholesale_costeo_header.sql
-- Encabezado de costeo por referencia de confeccion.

alter table public.wholesale_references
  add column if not exists costeo_header jsonb not null default '{}'::jsonb;
