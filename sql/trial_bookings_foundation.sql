-- SQL-only foundation for future CRM trial lesson bookings.
-- Reserve/waitlist and trial bookings are intentionally separate domains:
-- - waitlist/reserve: potential contact waiting for a place, may not have a lesson date;
-- - trial booking: contact booked for a concrete group and trial_date.

create table if not exists public.trial_bookings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  student_id uuid null references public.students(id) on delete set null,
  name text not null,
  phone text null,
  telegram text null,
  instagram text null,
  contact text null,

  direction_id text null,
  group_id text not null,
  trial_date date not null,

  status text not null default 'new',
  note text null,
  source text null,

  converted_student_id uuid null references public.students(id) on delete set null,

  constraint trial_bookings_status_check check (
    status in (
      'new',
      'contacted',
      'confirmed',
      'came',
      'no_show',
      'became_student',
      'declined',
      'cancelled'
    )
  )
);

create index if not exists trial_bookings_trial_date_group_id_idx
  on public.trial_bookings (trial_date, group_id);

create index if not exists trial_bookings_status_trial_date_idx
  on public.trial_bookings (status, trial_date);

create index if not exists trial_bookings_student_id_idx
  on public.trial_bookings (student_id);

create index if not exists trial_bookings_converted_student_id_idx
  on public.trial_bookings (converted_student_id);
