begin;

-- Trainers need the attendance fact and its semantic type in their assigned
-- groups, but the attendance table also contains an immutable financial price
-- snapshot. Keep the base-table RLS policy restrictive and expose a deliberately
-- narrow, read-only projection instead.
create or replace function public.crm_fetch_my_attendance()
returns table(
  id uuid,
  sub_id uuid,
  student_id uuid,
  date date,
  guest_name text,
  guest_type text,
  group_id text,
  quantity integer,
  entry_type text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    attendance.id,
    attendance.sub_id,
    attendance.student_id,
    attendance.date,
    attendance.guest_name,
    attendance.guest_type,
    attendance.group_id,
    attendance.quantity,
    attendance.entry_type
  from public.attendance as attendance
  where auth.uid() is not null
    and attendance.group_id is not null
    and public.rls_owns_group(attendance.group_id);
$$;

revoke all on function public.crm_fetch_my_attendance() from public, anon;
grant execute on function public.crm_fetch_my_attendance() to authenticated;

commit;
