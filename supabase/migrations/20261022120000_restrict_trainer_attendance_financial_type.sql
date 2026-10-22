-- Trainers record attendance in automatic mode only. Financial classification
-- remains administrator-owned, while quantity changes preserve legacy states.

begin;

create or replace function public.rls_is_auto_attendance_entry(
  p_student_id uuid,
  p_group_id text,
  p_date date,
  p_sub_id uuid,
  p_entry_type text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with eligible as (
    select s.id
    from public.subscriptions as s
    where s.student_id = p_student_id
      and s.group_id = p_group_id
      and lower(coalesce(s.plan_type, '')) in ('4pack', '8pack', '12pack')
      and coalesce(s.used_trainings, 0) < coalesce(s.total_trainings, 0)
      and coalesce(s.activation_date, s.start_date, '-infinity'::date) <= p_date
      and coalesce(s.end_date, 'infinity'::date) >= p_date
    order by coalesce(s.activation_date, s.start_date, '-infinity'::date), s.id
    limit 1
  )
  select p_student_id is not null
    and p_group_id is not null
    and p_date is not null
    and public.rls_can_record_attendance(p_student_id, p_group_id)
    and (
      (exists (select 1 from eligible)
        and p_sub_id = (select id from eligible)
        and lower(coalesce(p_entry_type, '')) = 'subscription')
      or
      (not exists (select 1 from eligible)
        and p_sub_id is null
        and lower(coalesce(p_entry_type, '')) = 'debt')
    );
$$;

revoke execute on function public.rls_is_auto_attendance_entry(uuid, text, date, uuid, text) from public, anon;
grant execute on function public.rls_is_auto_attendance_entry(uuid, text, date, uuid, text) to authenticated;

create or replace function public.crm_guard_trainer_attendance_financial_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.rls_is_admin() then
    return new;
  end if;

  if new.student_id is distinct from old.student_id
     or new.group_id is distinct from old.group_id
     or new.date is distinct from old.date
     or new.sub_id is distinct from old.sub_id
     or new.entry_type is distinct from old.entry_type
     or new.guest_type is distinct from old.guest_type
     or new.guest_name is distinct from old.guest_name then
    raise exception 'Trainers cannot change attendance financial classification'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function public.crm_guard_trainer_attendance_financial_fields() from public, anon, authenticated;

drop trigger if exists attendance_guard_trainer_financial_fields on public.attendance;
create trigger attendance_guard_trainer_financial_fields
before update on public.attendance
for each row execute function public.crm_guard_trainer_attendance_financial_fields();

drop policy if exists attendance_trainer_insert_own_groups on public.attendance;
create policy attendance_trainer_insert_own_groups
on public.attendance
for insert
to authenticated
with check (
  group_id is not null
  and public.rls_owns_group(group_id)
  and public.rls_is_auto_attendance_entry(student_id, group_id, date, sub_id, entry_type)
);

drop policy if exists attendance_trainer_update_own_groups on public.attendance;
create policy attendance_trainer_update_own_groups
on public.attendance
for update
to authenticated
using (
  group_id is not null
  and public.rls_owns_group(group_id)
  and public.rls_can_record_attendance(student_id, group_id)
)
with check (
  group_id is not null
  and public.rls_owns_group(group_id)
  and public.rls_can_record_attendance(student_id, group_id)
);

drop policy if exists attendance_trainer_delete_own_groups on public.attendance;
create policy attendance_trainer_delete_own_groups
on public.attendance
for delete
to authenticated
using (
  group_id is not null
  and public.rls_owns_group(group_id)
  and public.rls_can_record_attendance(student_id, group_id)
);

commit;
