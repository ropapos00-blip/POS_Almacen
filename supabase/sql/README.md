# Ejecucion ordenada en Supabase

## Orden recomendado
1. `01_tables.sql`
2. `02_seed.sql`
3. `03_rls_policies.sql`
4. `04_pos_sale_rpc.sql`
5. `05_sale_void_rpc.sql`
6. `06_user_management_rpc.sql`
7. `07_discount_authorization_and_cashier_inventory.sql`
8. `08_set_currency_cop.sql`
9. `09_update_store_name_rpc.sql`
10. `10_store_receipt_and_manual_invoice.sql`
11. `11_wholesale_subpos.sql`
12. `12_wholesale_inventory_credit_automation.sql`
13. `13_manual_invoice_admin_actions.sql`
14. `14_wholesale_edit_and_finance.sql`
15. `15_fix_register_wholesale_payment_ambiguity.sql`
16. `16_restore_wholesale_create_invoice_rpc.sql`
17. `17_wholesale_sizes_and_cost_breakdown.sql`
18. `18_wholesale_costeo_header.sql`
19. `19_wholesale_color_support.sql`
20. `20_manual_invoice_expenses.sql`
21. `21_store_hidden_nav_routes.sql`
22. `22_enable_rls_organizations_stores.sql`
23. `23_confeccion_customers.sql`
24. `25_fix_wholesale_reference_distribution.sql`
25. `26_wholesale_invoice_consecutive_format.sql`
26. `27_fix_wholesale_invoice_counter_cf_scope.sql`
27. `28_fix_function_search_path.sql`

## Desde Supabase Dashboard
1. Ir a `SQL Editor`.
2. Crear una query nueva.
3. Pegar y ejecutar `01_tables.sql`.
4. Repetir con `02_seed.sql`.
5. Repetir con `03_rls_policies.sql`.
6. Repetir con `04_pos_sale_rpc.sql`.
7. Repetir con `05_sale_void_rpc.sql`.
8. Repetir con `06_user_management_rpc.sql`.
9. Repetir con `07_discount_authorization_and_cashier_inventory.sql`.
10. Repetir con `08_set_currency_cop.sql`.
11. Repetir con `09_update_store_name_rpc.sql`.
12. Repetir con `10_store_receipt_and_manual_invoice.sql`.
13. Repetir con `11_wholesale_subpos.sql`.
14. Repetir con `12_wholesale_inventory_credit_automation.sql`.
15. Repetir con `13_manual_invoice_admin_actions.sql`.
16. Repetir con `14_wholesale_edit_and_finance.sql`.
17. Repetir con `15_fix_register_wholesale_payment_ambiguity.sql`.
18. Repetir con `16_restore_wholesale_create_invoice_rpc.sql`.
19. Repetir con `17_wholesale_sizes_and_cost_breakdown.sql`.
20. Repetir con `18_wholesale_costeo_header.sql`.
21. Repetir con `19_wholesale_color_support.sql`.
22. Repetir con `20_manual_invoice_expenses.sql`.
23. Repetir con `21_store_hidden_nav_routes.sql`.
24. Repetir con `22_enable_rls_organizations_stores.sql`.
25. Repetir con `23_confeccion_customers.sql`.
26. Repetir con `25_fix_wholesale_reference_distribution.sql`.
27. Repetir con `26_wholesale_invoice_consecutive_format.sql`.
28. Repetir con `27_fix_wholesale_invoice_counter_cf_scope.sql`.
29. Repetir con `28_fix_function_search_path.sql`.

## Si aparece error
- Revisar la linea exacta que marca el editor.
- Ejecutar solo el bloque que falla para depurar rapido.
- Las policies estan en modo idempotente (`drop policy if exists`) para que puedas re-ejecutar sin romper.

## Nota
No uses `service_role` en frontend. Solo `anon key`.

## Crear primer Super Admin (manual desde DB)
1. Crea el usuario en `Authentication > Users` (email/password).
2. Ejecuta este SQL en `SQL Editor`, reemplazando email y codigo de tienda:

```sql
-- Asegura que exista una tienda (ajusta si ya tienes otra)
insert into public.organizations (name)
values ('POS Org')
on conflict do nothing;

insert into public.stores (organization_id, code, name)
select o.id, 'MAIN', 'Tienda Principal'
from public.organizations o
where o.name = 'POS Org'
on conflict (organization_id, code) do nothing;

-- Vincula usuario auth a profile
insert into public.profiles (id, full_name, email, is_active)
select u.id, 'Super Admin', u.email, true
from auth.users u
where lower(u.email) = lower('tu-super-admin@dominio.com')
on conflict (id) do update
set full_name = excluded.full_name,
	email = excluded.email,
	is_active = true;

-- Asigna rol super_admin a la tienda
insert into public.user_store_roles (user_id, store_id, role_id, is_active)
select u.id, s.id, r.id, true
from auth.users u
join public.stores s on s.code = 'MAIN'
join public.roles r on r.code = 'super_admin'
where lower(u.email) = lower('tu-super-admin@dominio.com')
on conflict (user_id, store_id, role_id) do update
set is_active = true;
```

3. Inicia sesion en la app con ese usuario.
4. En menu `Usuarios`, el Super Admin podra crear `admin` y `cajero`.
5. Un usuario `admin` solo podra crear `cajero`.
