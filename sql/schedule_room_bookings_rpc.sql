-- Documentation/draft only. Do not apply from this PR.
-- The production Supabase project already has this RPC applied manually:
-- public.crm_fetch_schedule_room_bookings()
--
-- Purpose:
-- - Return the wider room-bookings schedule for trainer/non-admin users.
-- - Admin email semagin.vlad@gmail.com can see all fields for all bookings.
-- - Booking owner/trainer can see full fields for their own bookings.
-- - Sensitive fields for other trainers' bookings are masked server-side.
-- - The frontend should call this RPC for non-admin schedule reads instead of
--   falling back to room_bookings.select('*').

create or replace function public.crm_fetch_schedule_room_bookings()
returns table (
  id uuid,
  date date,
  start_time text,
  end_time text,
  trainer_id text,
  trainer_name text,
  title text,
  type text,
  booking_type text,
  people_count integer,
  price integer,
  payment_method text,
  event_type text,
  note text,
  color text,
  recurrence text,
  recurrence_until date,
  description text,
  status text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with current_actor as (
    select
      auth.uid()::text as user_id,
      coalesce(auth.jwt() ->> 'email', '') as email
  )
  select
    rb.id,
    rb.date,
    rb.start_time,
    rb.end_time,
    rb.trainer_id::text as trainer_id,
    rb.trainer_name,
    rb.title,
    rb.type,
    rb.booking_type,
    case when current_actor.email = 'semagin.vlad@gmail.com' or rb.trainer_id::text = current_actor.user_id then rb.people_count else null end as people_count,
    case when current_actor.email = 'semagin.vlad@gmail.com' or rb.trainer_id::text = current_actor.user_id then rb.price else null end as price,
    case when current_actor.email = 'semagin.vlad@gmail.com' or rb.trainer_id::text = current_actor.user_id then rb.payment_method else null end as payment_method,
    rb.event_type,
    case when current_actor.email = 'semagin.vlad@gmail.com' or rb.trainer_id::text = current_actor.user_id then rb.note else null end as note,
    rb.color,
    rb.recurrence,
    rb.recurrence_until,
    case when current_actor.email = 'semagin.vlad@gmail.com' or rb.trainer_id::text = current_actor.user_id then rb.description else null end as description,
    rb.status,
    rb.created_at
  from public.room_bookings rb
  cross join current_actor
  order by rb.date asc, rb.start_time asc;
$$;

revoke execute on function public.crm_fetch_schedule_room_bookings() from public, anon;
grant execute on function public.crm_fetch_schedule_room_bookings() to authenticated;
