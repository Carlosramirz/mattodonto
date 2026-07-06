-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ==========================================
-- 1. Users Table
-- ==========================================
-- We link this to Supabase's auth.users table.
create type user_role as enum ('admin', 'dentist');

create table public.users (
  id uuid references auth.users(id) on delete cascade primary key,
  role user_role not null default 'dentist',
  full_name text,
  created_at timestamptz default now()
);

-- ==========================================
-- 2. Availability Table
-- ==========================================
create table public.availability (
  id uuid primary key default uuid_generate_v4(),
  dentist_id uuid references public.users(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  buffer_minutes integer default 15,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Indexes for fast querying by date
create index idx_availability_date on public.availability(date);
create index idx_availability_dentist_date on public.availability(dentist_id, date);

-- ==========================================
-- 3. Appointments Table
-- ==========================================
create type appointment_status as enum ('pending', 'confirmed', 'cancelled');

create table public.appointments (
  id uuid primary key default uuid_generate_v4(),
  patient_name text not null,
  patient_phone text not null,
  patient_email text not null,
  reason text,
  status appointment_status default 'pending',
  created_at timestamptz default now()
);

-- ==========================================
-- 4. Appointment Blocks
-- ==========================================
create table public.appointment_blocks (
  id uuid primary key default uuid_generate_v4(),
  appointment_id uuid references public.appointments(id) on delete cascade not null,
  availability_id uuid references public.availability(id) on delete restrict not null,
  -- Ensures that an availability block can only be assigned to ONE appointment (1 silla)
  unique (availability_id)
);

create index idx_appointment_blocks_appointment on public.appointment_blocks(appointment_id);


-- ==========================================
-- Row Level Security (RLS)
-- ==========================================
alter table public.users enable row level security;
alter table public.availability enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_blocks enable row level security;

-- USERS: Authenticated users can view user profiles
create policy "Authenticated users can view users"
  on public.users for select
  to authenticated
  using (true);

-- AVAILABILITY:
-- Anyone (including public/anon) can view active availability blocks to book
create policy "Public can view active availability"
  on public.availability for select
  using (is_active = true);

-- Only authenticated users (odontólogo/admin) can manage availability
create policy "Authenticated can insert availability"
  on public.availability for insert to authenticated with check (true);
create policy "Authenticated can update availability"
  on public.availability for update to authenticated using (true);
create policy "Authenticated can delete availability"
  on public.availability for delete to authenticated using (true);

-- APPOINTMENTS:
-- Public can INSERT their own appointments, but cannot SELECT them (so patient data is not visible)
create policy "Public can create appointments"
  on public.appointments for insert
  to anon, authenticated
  with check (true);

-- Only authenticated users can view, update or delete appointments
create policy "Authenticated can view appointments"
  on public.appointments for select
  to authenticated
  using (true);
create policy "Authenticated can update appointments"
  on public.appointments for update
  to authenticated
  using (true);

-- APPOINTMENT BLOCKS:
-- Public can INSERT to link their appointment to an availability block
create policy "Public can create appointment blocks"
  on public.appointment_blocks for insert
  to anon, authenticated
  with check (true);

-- Public can SELECT appointment blocks to verify if a block is taken
create policy "Public can view appointment blocks"
  on public.appointment_blocks for select
  using (true);

-- Only authenticated can manage appointment blocks fully
create policy "Authenticated can update appointment blocks"
  on public.appointment_blocks for update
  to authenticated
  using (true);
create policy "Authenticated can delete appointment blocks"
  on public.appointment_blocks for delete
  to authenticated
  using (true);
