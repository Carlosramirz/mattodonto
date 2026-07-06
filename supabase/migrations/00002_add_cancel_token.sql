-- Add cancel_token to appointments table
alter table public.appointments 
add column cancel_token uuid default gen_random_uuid() not null;

-- Index for fast lookups during cancellation
create index idx_appointments_cancel_token on public.appointments(cancel_token);
