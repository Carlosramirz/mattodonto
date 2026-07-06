-- RPC para agendar citas previniendo race conditions
create or replace function public.book_appointment(
  p_availability_id uuid,
  p_patient_name text,
  p_patient_phone text,
  p_patient_email text,
  p_reason text
) returns uuid
language plpgsql security definer
as $$
declare
  v_appointment_id uuid;
begin
  -- 1. Crear la cita (por defecto queda en pending)
  insert into public.appointments (patient_name, patient_phone, patient_email, reason, status)
  values (p_patient_name, p_patient_phone, p_patient_email, p_reason, 'pending')
  returning id into v_appointment_id;

  -- 2. Vincular la cita con el bloque de disponibilidad
  -- Si el bloque ya está tomado, esto lanzará un error de unique_violation 
  -- por la restricción UNIQUE(availability_id) y cancelará la transacción completa
  insert into public.appointment_blocks (appointment_id, availability_id)
  values (v_appointment_id, p_availability_id);

  return v_appointment_id;
exception
  when unique_violation then
    raise exception 'El bloque de disponibilidad ya se encuentra reservado.';
end;
$$;
