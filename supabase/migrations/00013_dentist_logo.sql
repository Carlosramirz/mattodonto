-- Migración 00013: Agregar logo_url a users
-- ============================================================================

-- 1. Agregar columna logo_url a public.users
alter table public.users
add column if not exists logo_url text;

-- 2. Actualizar el registro del Dr. Matías Collao con la ruta de su logo
update public.users
set logo_url = '/logo-collao.png'
where role = 'dentist' 
  and full_name ilike '%Matías Collao%';
