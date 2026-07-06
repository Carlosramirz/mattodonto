-- Add cancellation_reason to appointments table
alter table public.appointments 
add column cancellation_reason text;
