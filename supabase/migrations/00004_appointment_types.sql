-- Migración 00004: Tipos de cita con duración predefinida y soporte para doble bloque

-- 1. Crear tabla de tipos de cita
create table public.appointment_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  duration_minutes integer not null,
  requires_double_slot boolean not null default false,
  created_at timestamptz default now()
);

-- 2. Insertar los tipos de cita base
insert into public.appointment_types (name, duration_minutes, requires_double_slot) values
  ('Tratamiento', 30, false),
  ('Diagnóstico/Control', 15, false),
  ('Otro', 30, true);

-- 3. Agregar columna a la tabla de citas
alter table public.appointments
add column appointment_type_id uuid references public.appointment_types(id) on delete set null;

-- 4. Habilitar Seguridad a Nivel de Fila (RLS) en la nueva tabla
alter table public.appointment_types enable row level security;

-- 5. Crear política para que cualquiera pueda leer los tipos de cita
create policy "Cualquiera puede leer los tipos de cita"
  on public.appointment_types for select
  using (true);

-- 6. Eliminar el RPC anterior
drop function if exists public.book_appointment(uuid, text, text, text, text);

-- 7. Crear el nuevo RPC con soporte para tipo de cita y doble bloque transaccional
create or replace function public.book_appointment(
  p_availability_id uuid,
  p_patient_name text,
  p_patient_phone text,
  p_patient_email text,
  p_reason text,
  p_appointment_type_id uuid
) returns uuid
language plpgsql security definer
as $$
declare
  v_appointment_id uuid;
  v_dentist_id uuid;
  v_date date;
  v_end_time time;
  v_buffer integer;
  v_is_active boolean;
  v_requires_double boolean;
  v_second_availability_id uuid;
begin
  -- Obtener detalles del primer bloque de disponibilidad
  select dentist_id, date, end_time, buffer_minutes, is_active 
  into v_dentist_id, v_date, v_end_time, v_buffer, v_is_active 
  from public.availability 
  where id = p_availability_id;

  if v_dentist_id is null then
    raise exception 'El bloque de disponibilidad inicial no existe.';
  end if;

  if not v_is_active then
    raise exception 'El bloque de disponibilidad inicial no está activo.';
  end if;

  -- Verificar si el bloque ya está reservado
  if exists (
    select 1 from public.appointment_blocks where availability_id = p_availability_id
  ) then
    raise exception 'El primer bloque horario ya se encuentra reservado.';
  end if;

  -- Obtener configuración del tipo de cita
  select requires_double_slot into v_requires_double
  from public.appointment_types
  where id = p_appointment_type_id;

  if v_requires_double is null then
    raise exception 'El tipo de cita especificado no existe.';
  end if;

  -- Si requiere doble bloque, buscar y validar el siguiente bloque consecutivo
  if v_requires_double then
    select id into v_second_availability_id
    from public.availability
    where dentist_id = v_dentist_id
      and date = v_date
      and is_active = true
      and start_time = (v_end_time + (v_buffer || 0) * interval '1 minute')::time;

    if v_second_availability_id is null then
      raise exception 'Este tipo de consulta requiere 2 bloques horarios consecutivos y el siguiente bloque no está disponible o no existe.';
    end if;

    -- Verificar que el segundo bloque no esté reservado
    if exists (
      select 1 from public.appointment_blocks where availability_id = v_second_availability_id
    ) then
      raise exception 'El segundo bloque horario consecutivo ya está reservado.';
    end if;
  end if;

  -- Crear la cita
  insert into public.appointments (patient_name, patient_phone, patient_email, reason, appointment_type_id, status)
  values (p_patient_name, p_patient_phone, p_patient_email, p_reason, p_appointment_type_id, 'pending')
  returning id into v_appointment_id;

  -- Vincular la cita con el primer bloque de disponibilidad
  insert into public.appointment_blocks (appointment_id, availability_id)
  values (v_appointment_id, p_availability_id);

  -- Vincular con el segundo bloque si requiere doble cupo
  if v_requires_double then
    insert into public.appointment_blocks (appointment_id, availability_id)
    values (v_appointment_id, v_second_availability_id);
  end if;

  return v_appointment_id;
exception
  when unique_violation then
    raise exception 'Uno de los bloques de disponibilidad elegidos ya se encuentra reservado por otra transacción.';
end;
$$;
