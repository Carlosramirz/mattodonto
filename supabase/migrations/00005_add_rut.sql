-- Agregar columna patient_rut a la tabla appointments
alter table public.appointments
add column patient_rut text;

-- Indexar para optimizar las búsquedas por RUT de pacientes
create index idx_appointments_patient_rut on public.appointments(patient_rut);
