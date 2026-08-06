-- 41_add_layaway_archive_fields.sql
-- Agregar campos de archivado lógico (NO borra datos, solo marca para ocultar)
-- SEGURO: Esto es eliminación lógica, no física

-- Agregar columnas de archivado a la tabla layaways
alter table if exists public.layaways
add column if not exists is_archived boolean default false,
add column if not exists archived_at timestamptz,
add column if not exists archived_by uuid references auth.users(id);

-- Crear índice para queries rápidas (ocultar archivados de UI)
create index if not exists idx_layaways_archived on public.layaways (store_id, is_archived)
where is_archived = false;

-- Comentarios para documentación
comment on column public.layaways.is_archived is 'Marcado como archivado (eliminación lógica). Los datos nunca se borran.';
comment on column public.layaways.archived_at is 'Timestamp cuando fue archivado.';
comment on column public.layaways.archived_by is 'Usuario que archivó el separado.';
