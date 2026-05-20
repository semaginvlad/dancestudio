-- Scoped conversion RPC: confirmed trial booking -> student + student_groups link.
-- Review/apply manually in Supabase.

begin;

create or replace function public.crm_convert_trial_booking_to_student(p_trial_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.trial_bookings%rowtype;
  v_student public.students%rowtype;
  v_student_id uuid;
  v_link public.student_groups%rowtype;
  v_phone text;
  v_tg text;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_trial_booking_id is null then
    raise exception 'trial_booking_id is required' using errcode = '22023';
  end if;

  select * into v_booking
  from public.trial_bookings
  where id = p_trial_booking_id;

  if not found then
    raise exception 'Trial booking not found: %', p_trial_booking_id using errcode = 'P0002';
  end if;

  if coalesce(v_booking.status, '') <> 'confirmed' then
    raise exception 'Trial booking status must be confirmed' using errcode = '22023';
  end if;

  if not (public.rls_is_admin() or public.rls_owns_group(v_booking.group_id)) then
    raise exception 'Not allowed to convert this trial booking' using errcode = '42501';
  end if;

  v_student_id := coalesce(v_booking.converted_student_id, v_booking.student_id);

  if v_student_id is not null then
    select * into v_student from public.students where id = v_student_id;
  end if;

  if v_student.id is null then
    v_phone := nullif(btrim(coalesce(v_booking.phone, '')), '');
    if v_phone is not null then
      select * into v_student from public.students s where btrim(coalesce(s.phone, '')) = v_phone order by s.created_at asc limit 1;
    end if;
  end if;

  if v_student.id is null then
    v_tg := lower(nullif(btrim(coalesce(v_booking.telegram, '')), ''));
    if v_tg is not null then
      select * into v_student from public.students s where lower(btrim(coalesce(s.telegram, ''))) = v_tg order by s.created_at asc limit 1;
    end if;
  end if;

  if v_student.id is null then
    v_name := nullif(btrim(coalesce(v_booking.name, '')), '');
    if v_name is null then
      raise exception 'Student name is required for creation' using errcode = '22023';
    end if;

    insert into public.students(name, first_name, last_name, phone, telegram, notes, message_template)
    values (v_name, '', '', v_phone, nullif(btrim(coalesce(v_booking.telegram, '')), ''), nullif(btrim(coalesce(v_booking.note, '')), ''), null)
    returning * into v_student;
  end if;

  v_student_id := v_student.id;

  select * into v_link
  from public.student_groups
  where student_id = v_student_id and group_id = v_booking.group_id
  limit 1;

  if v_link.id is null then
    begin
      insert into public.student_groups(student_id, group_id)
      values (v_student_id, v_booking.group_id)
      returning * into v_link;
    exception
      when unique_violation then
        select * into v_link
        from public.student_groups
        where student_id = v_student_id and group_id = v_booking.group_id
        limit 1;
    end;
  end if;

  update public.trial_bookings
  set status = 'became_student',
      student_id = v_student_id,
      converted_student_id = v_student_id,
      updated_at = now()
  where id = v_booking.id
  returning * into v_booking;

  return jsonb_build_object(
    'student', to_jsonb(v_student),
    'student_group', jsonb_build_object('id', v_link.id, 'student_id', v_link.student_id, 'group_id', v_link.group_id),
    'trial_booking', to_jsonb(v_booking)
  );
end;
$$;

revoke all on function public.crm_convert_trial_booking_to_student(uuid) from public, anon;
grant execute on function public.crm_convert_trial_booking_to_student(uuid) to authenticated;

commit;
