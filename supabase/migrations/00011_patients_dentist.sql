-- Migración 00011: Agregar dentist_id a patients y aplicar RLS
-- ============================================================================

-- 1. Agregar columna dentist_id a patients (nullable)
alter table public.patients
add column if not exists dentist_id uuid references public.users(id) on delete set null;

-- 2. Crear índice para optimizar búsquedas por dentist_id
create index if not exists idx_patients_dentist_id on public.patients(dentist_id);

-- 3. Asignar pacientes existentes al primer dentista si existe alguno
do $$
declare
  v_first_dentist_id uuid;
begin
  select id into v_first_dentist_id
  from public.users
  where role = 'dentist'
  limit 1;

  if v_first_dentist_id is not null then
    update public.patients
    set dentist_id = v_first_dentist_id
    where dentist_id is null;
  end if;
end;
$$;

-- 4. Modificar política de RLS para pacientes
drop policy if exists "Personal puede gestionar pacientes" on public.patients;

-- Los odontólogos solo pueden ver/editar sus propios pacientes.
-- Los administradores (admin) no tienen permitido ver detalles clínicos (eso se controla a nivel de backend),
-- pero la política RLS debe permitirles gestionar la tabla (para hacer updates o reasignaciones).
-- Los asistentes (assistant) NO tienen acceso a esta tabla en absoluto.
create policy "Personal puede gestionar pacientes"
  on public.patients for all
  using (
    exists (
      select 1 from public.users
      where users.id = auth.uid()
        and (
          users.role = 'admin'
          or (users.role = 'dentist' and patients.dentist_id = auth.uid())
        )
    )
  );
