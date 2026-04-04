-- 02_seed.sql
-- Seed minimo para roles base

insert into public.roles (code, name)
values
  ('super_admin', 'Super Admin'),
  ('admin', 'Admin'),
  ('cashier', 'Cajero')
on conflict (code) do nothing;
