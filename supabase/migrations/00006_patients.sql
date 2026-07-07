-- ============================================================================
-- ADVERTENCIA DE SEGURIDAD Y PRIVACIDAD
-- esta tabla (public.patients) contiene datos médicos, clínicos y personales altamente sensibles.
-- BAJO NINGUNA CIRCUNSTANCIA se debe exponer, retornar o hacer JOIN con esta tabla
-- en endpoints públicos (/api/public/*). Todo acceso debe estar protegido y restringido
-- a personal autorizado (odontólogos y administradores).
-- ============================================================================

-- Crear tipo ENUM para el sexo del paciente
do $$
begin
  if not exists (select 1 from pg_type where typname = 'patient_sex') then
    create type public.patient_sex as enum ('Masculino', 'Femenino', 'Intersex');
  end if;
end;
$$;

-- Crear tipo ENUM para la previsión del paciente
do $$
begin
  if not exists (select 1 from pg_type where typname = 'patient_prevision') then
    create type public.patient_prevision as enum ('FONASA', 'ISAPRE', 'Particular', 'Otro');
  end if;
end;
$$;

-- Crear tabla de pacientes
create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  rut text not null unique,
  phone text,
  email text,
  address text,
  birth_date date,
  sex public.patient_sex not null,
  gender_identity text,
  prevision public.patient_prevision not null,
  prevision_detail text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Agregar clave foránea nullable en appointments
alter table public.appointments
add column if not exists patient_id uuid references public.patients(id) on delete set null;

-- Crear índices para optimizar búsquedas por RUT y Nombre
create index if not exists idx_patients_rut on public.patients(rut);
create index if not exists idx_patients_full_name on public.patients(full_name);

-- Habilitar RLS en patients como capa de defensa (ningún acceso para rol anon)
alter table public.patients enable row level security;

-- Crear política de RLS para pacientes: solo admin y dentist autenticados en public.users pueden gestionar
drop policy if exists "Personal puede gestionar pacientes" on public.patients;
create policy "Personal puede gestionar pacientes"
  on public.patients for all
  using (
    exists (
      select 1 from public.users
      where users.id = auth.uid()
        and (users.role = 'admin' or users.role = 'dentist')
    )
  );

-- Función para actualizar la columna updated_at
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger para actualizar updated_at en patients
drop trigger if exists update_patients_updated_at on public.patients;
create trigger update_patients_updated_at
  before update on public.patients
  for each row
  execute function public.update_updated_at_column();
