-- Safe Schedule room bookings read model for trainer/non-admin users.
-- DO NOT APPLY AUTOMATICALLY. Review and run manually in Supabase before enabling
-- trainer/non-admin Schedule reads through public.crm_fetch_schedule_room_bookings().

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
  note text,
  created_at timestamptz,
  booking_type text,
  people_count integer,
  price integer,
  payment_method text,
  event_type text,
  color text,
  recurrence text,
  recurrence_until date,
  description text,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id,
    b.date,
    b.start_time,
    b.end_time,
    b.trainer_id,
    b.trainer_name,
    b.title,
    b.type,
    case when b.is_admin or b.is_owner then b.note else null end as note,
    b.created_at,
    b.booking_type,
    case when b.is_admin or b.is_owner then b.people_count else null end as people_count,
    case when b.is_admin or b.is_owner then b.price else null end as price,
    case when b.is_admin or b.is_owner then b.payment_method else null end as payment_method,
    b.event_type,
    b.color,
    b.recurrence,
    b.recurrence_until,
    case when b.is_admin or b.is_owner then b.description else null end as description,
    b.status
  from (
    select
      rb.*,
      coalesce(auth.jwt() ->> 'email', '') = 'semagin.vlad@gmail.com' as is_admin,
      rb.trainer_id::text = auth.uid()::text as is_owner
    from public.room_bookings rb
  ) as b
  order by b.date asc, b.start_time asc;
$$;

revoke execute on function public.crm_fetch_schedule_room_bookings() from public, anon;
grant execute on function public.crm_fetch_schedule_room_bookings() to authenticated;
