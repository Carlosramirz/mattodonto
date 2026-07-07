-- ============================================================================
-- ADVERTENCIA DE SEGURIDAD Y PRIVACIDAD
-- La tabla medical_alerts_catalog contiene información del catálogo
-- de factores de riesgo odontológico comunes.
-- ============================================================================

-- 1. Crear tabla medical_alerts_catalog
create table if not exists public.medical_alerts_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer default 0 not null,
  created_at timestamptz default now() not null
);

-- 2. Insertar catálogo inicial de riesgos frecuentes en odontología
insert into public.medical_alerts_catalog (name, sort_order) values
  ('Diabetes', 1),
  ('Hipertensión', 2),
  ('Alergia a Penicilina', 3),
  ('Alergia a Látex', 4),
  ('Alergia a AINEs', 5),
  ('Tratamiento Anticoagulante', 6),
  ('Embarazo', 7),
  ('Asma', 8),
  ('Epilepsia', 9),
  ('Marcapasos', 10),
  ('VIH+', 11),
  ('Hepatitis B', 12),
  ('Hepatitis C', 13),
  ('Tratamiento con Bifosfonatos', 14),
  ('Quimioterapia/Radioterapia', 15),
  ('Hemofilia/Trastorno de coagulación', 16),
  ('Enfermedad Cardíaca', 17),
  ('Insuficiencia Renal', 18),
  ('Hipotiroidismo', 19),
  ('Tabaquismo', 20)
on conflict (name) do update set sort_order = excluded.sort_order;

-- 3. Habilitar RLS
alter table public.medical_alerts_catalog enable row level security;

-- 4. Crear políticas RLS: lectura para autenticados admin/dentist
drop policy if exists "Personal puede ver catalogo de alertas" on public.medical_alerts_catalog;
create policy "Personal puede ver catalogo de alertas"
  on public.medical_alerts_catalog for select
  using (
    exists (
      select 1 from public.users
      where users.id = auth.uid()
        and (users.role = 'admin' or users.role = 'dentist')
    )
  );

-- Comentario descriptivo
comment on table public.medical_alerts_catalog is 'Catálogo de alertas médicas y factores de riesgo odontológico comunes.';
