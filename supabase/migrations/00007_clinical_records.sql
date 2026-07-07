-- ============================================================================
-- ADVERTENCIA DE SEGURIDAD Y PRIVACIDAD
-- esta tabla (public.clinical_records) y catálogo (public.diagnosis_catalog)
-- contienen información médica, diagnósticos y de salud altamente sensibles.
-- BAJO NINGUNA CIRCUNSTANCIA se deben exponer, retornar o hacer JOIN con estas tablas
-- en endpoints públicos (/api/public/*). Todo acceso debe estar protegido y restringido
-- a personal autorizado (odontólogos y administradores).
-- ============================================================================

-- 1. Crear tabla diagnosis_catalog
create table if not exists public.diagnosis_catalog (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  name text not null,
  sort_order integer default 0 not null,
  created_at timestamptz default now() not null
);

-- 2. Insertar catálogo inicial de diagnósticos
insert into public.diagnosis_catalog (category, name, sort_order) values
  ('Caries', 'Caries de Esmalte', 10),
  ('Caries', 'Caries Superficial', 11),
  ('Caries', 'Caries Dentinaria', 12),
  ('Caries', 'Caries Dentinaria Profunda', 13),
  ('Periodoncia', 'Gingivitis', 20),
  ('Periodoncia', 'Periodontitis Leve', 21),
  ('Periodoncia', 'Periodontitis Moderada', 22),
  ('Periodoncia', 'Periodontitis Severa', 23),
  ('Endodoncia', 'Pulpitis Reversible', 30),
  ('Endodoncia', 'Pulpitis Irreversible', 31),
  ('Endodoncia', 'Necrosis Pulpar', 32)
on conflict do nothing;

-- 3. Crear tabla clinical_records
create table if not exists public.clinical_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete cascade not null,
  appointment_id uuid references public.appointments(id) on delete set null,
  dentist_id uuid references public.users(id) on delete restrict not null,
  session_date date not null default current_date,
  chief_complaint text,
  anamnesis text,
  exploration text,
  diagnosis text,
  diagnosis_codes jsonb default '[]'::jsonb not null,
  procedure_performed text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 4. Crear índices para optimizar búsquedas por paciente
create index if not exists idx_clinical_records_patient_id on public.clinical_records(patient_id);
create index if not exists idx_clinical_records_session_date on public.clinical_records(session_date);

-- 5. Habilitar RLS en ambas tablas (denegar por defecto al rol anon)
alter table public.diagnosis_catalog enable row level security;
alter table public.clinical_records enable row level security;

-- 6. Crear políticas RLS: solo personal autorizado (admin y dentist) puede acceder
drop policy if exists "Personal puede ver catalogo" on public.diagnosis_catalog;
create policy "Personal puede ver catalogo"
  on public.diagnosis_catalog for select
  using (
    exists (
      select 1 from public.users
      where users.id = auth.uid()
        and (users.role = 'admin' or users.role = 'dentist')
    )
  );

drop policy if exists "Personal puede gestionar registros" on public.clinical_records;
create policy "Personal puede gestionar registros"
  on public.clinical_records for all
  using (
    exists (
      select 1 from public.users
      where users.id = auth.uid()
        and (users.role = 'admin' or users.role = 'dentist')
    )
  );

-- 7. Trigger para actualizar updated_at en clinical_records
drop trigger if exists update_clinical_records_updated_at on public.clinical_records;
create trigger update_clinical_records_updated_at
  before update on public.clinical_records
  for each row
  execute function public.update_updated_at_column();
