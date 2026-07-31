-- CRM inbox for future public-site submissions. The public site is deliberately
-- not connected in V1: table access is denied and only admin-checked CRM RPCs
-- are exposed to authenticated users.

begin;

do $preflight$
declare
  v_mismatch text;
begin
  with expected(table_name, column_name, data_type) as (
    values
      ('directions', 'id', 'text'),
      ('groups', 'id', 'text'),
      ('trainers', 'id', 'uuid'),
      ('waitlist', 'id', 'uuid'),
      ('trial_bookings', 'id', 'uuid'),
      ('students', 'id', 'uuid')
  ), actual as (
    select
      e.*,
      pg_catalog.format_type(a.atttypid, a.atttypmod) as actual_type
    from expected e
    left join pg_catalog.pg_namespace n on n.nspname = 'public'
    left join pg_catalog.pg_class c on c.relnamespace = n.oid and c.relname = e.table_name
    left join pg_catalog.pg_attribute a on a.attrelid = c.oid
      and a.attname = e.column_name and a.attnum > 0 and not a.attisdropped
  )
  select pg_catalog.string_agg(
    table_name || '.' || column_name || ' expected ' || data_type || ', got ' || coalesce(actual_type, 'missing'),
    '; ' order by table_name
  )
  into v_mismatch
  from actual
  where actual_type is distinct from data_type;

  if v_mismatch is not null then
    raise exception using
      errcode = '42804',
      message = 'site_inquiries type preflight failed: ' || v_mismatch;
  end if;

  if pg_catalog.to_regprocedure('public.rls_is_admin()') is null then
    raise exception using errcode = '42883', message = 'public.rls_is_admin() is required';
  end if;
end;
$preflight$;

create table public.site_inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'new',
  status_changed_at timestamptz not null default now(),
  name text not null,
  phone text,
  phone_normalized text,
  telegram text,
  telegram_normalized text,
  instagram text,
  instagram_normalized text,
  email text,
  email_normalized text,
  preferred_contact text not null default 'any',
  direction_id text references public.directions(id) on update cascade on delete set null,
  direction_name_snapshot text,
  group_id text references public.groups(id) on update cascade on delete set null,
  group_name_snapshot text,
  trainer_id uuid references public.trainers(id) on update cascade on delete set null,
  trainer_name_snapshot text,
  comment text,
  source text not null default 'public_site',
  source_page text,
  referrer text,
  utm_data jsonb not null default '{}'::jsonb,
  privacy_consent_at timestamptz,
  payload_fingerprint text,
  possible_duplicate_of_id uuid references public.site_inquiries(id) on delete set null,
  submission_count integer not null default 1,
  last_submitted_at timestamptz not null default now(),
  admin_note text,
  processed_by uuid references auth.users(id) on delete set null,
  converted_waitlist_id uuid references public.waitlist(id) on delete restrict,
  converted_trial_booking_id uuid references public.trial_bookings(id) on delete restrict,
  converted_student_id uuid references public.students(id) on delete restrict,
  converted_at timestamptz,

  constraint site_inquiries_status_check check (status in (
    'new', 'in_progress', 'converted_to_reserve', 'converted_to_trial',
    'converted_to_student', 'closed', 'spam'
  )),
  constraint site_inquiries_preferred_contact_check check (
    preferred_contact in ('phone', 'telegram', 'instagram', 'email', 'any')
  ),
  constraint site_inquiries_name_check check (
    length(btrim(name)) between 1 and 160
  ),
  constraint site_inquiries_contact_required_check check (
    nullif(btrim(phone), '') is not null
    or nullif(btrim(telegram), '') is not null
    or nullif(btrim(instagram), '') is not null
    or nullif(btrim(email), '') is not null
  ),
  constraint site_inquiries_lengths_check check (
    length(coalesce(phone, '')) <= 80
    and length(coalesce(phone_normalized, '')) <= 40
    and length(coalesce(telegram, '')) <= 120
    and length(coalesce(telegram_normalized, '')) <= 100
    and length(coalesce(instagram, '')) <= 120
    and length(coalesce(instagram_normalized, '')) <= 100
    and length(coalesce(email, '')) <= 254
    and length(coalesce(email_normalized, '')) <= 254
    and length(coalesce(direction_name_snapshot, '')) <= 160
    and length(coalesce(group_name_snapshot, '')) <= 160
    and length(coalesce(trainer_name_snapshot, '')) <= 160
    and length(coalesce(comment, '')) <= 4000
    and length(source) between 1 and 80
    and length(coalesce(source_page, '')) <= 500
    and length(coalesce(referrer, '')) <= 1000
    and length(coalesce(payload_fingerprint, '')) <= 128
    and length(coalesce(admin_note, '')) <= 4000
  ),
  constraint site_inquiries_utm_object_check check (jsonb_typeof(utm_data) = 'object'),
  constraint site_inquiries_submission_count_check check (submission_count >= 1),
  constraint site_inquiries_single_conversion_check check (
    num_nonnulls(converted_waitlist_id, converted_trial_booking_id, converted_student_id) <= 1
  ),
  constraint site_inquiries_conversion_status_check check (
    (status = 'converted_to_reserve' and converted_waitlist_id is not null
      and converted_trial_booking_id is null and converted_student_id is null)
    or (status = 'converted_to_trial' and converted_trial_booking_id is not null
      and converted_waitlist_id is null and converted_student_id is null)
    or (status = 'converted_to_student' and converted_student_id is not null
      and converted_waitlist_id is null and converted_trial_booking_id is null)
    or (status in ('new', 'in_progress', 'closed', 'spam')
      and converted_waitlist_id is null and converted_trial_booking_id is null and converted_student_id is null)
  ),
  constraint site_inquiries_converted_at_check check (
    (num_nonnulls(converted_waitlist_id, converted_trial_booking_id, converted_student_id) = 1)
      = (converted_at is not null)
  ),
  constraint site_inquiries_duplicate_not_self_check check (possible_duplicate_of_id is distinct from id)
);

create index site_inquiries_status_created_at_idx
  on public.site_inquiries(status, created_at desc);
create index site_inquiries_phone_normalized_idx
  on public.site_inquiries(phone_normalized) where phone_normalized is not null;
create index site_inquiries_email_normalized_idx
  on public.site_inquiries(email_normalized) where email_normalized is not null;
create index site_inquiries_payload_fingerprint_idx
  on public.site_inquiries(payload_fingerprint) where payload_fingerprint is not null;

create function public.set_site_inquiry_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end;
$function$;

create trigger site_inquiries_set_timestamps
before update on public.site_inquiries
for each row execute function public.set_site_inquiry_timestamps();

alter table public.site_inquiries enable row level security;
revoke all on table public.site_inquiries from public, anon, authenticated;

create function public.crm_fetch_site_inquiries(
  p_status text default null,
  p_search text default null
)
returns setof public.site_inquiries
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.rls_is_admin() then
    raise exception 'Лише адміністратор може переглядати запити з сайту.' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in (
    'new', 'in_progress', 'converted_to_reserve', 'converted_to_trial',
    'converted_to_student', 'closed', 'spam'
  ) then
    raise exception 'Невідомий статус запиту.' using errcode = '22023';
  end if;

  return query
  select si.*
  from public.site_inquiries si
  where (p_status is null or si.status = p_status)
    and (
      nullif(btrim(p_search), '') is null
      or concat_ws(' ', si.name, si.phone, si.telegram, si.instagram, si.email,
        si.direction_name_snapshot, si.group_name_snapshot, si.trainer_name_snapshot,
        si.comment, si.admin_note) ilike '%' || btrim(p_search) || '%'
    )
  order by si.created_at desc;
end;
$function$;

create function public.crm_update_site_inquiry(
  p_inquiry_id uuid,
  p_status text default null,
  p_admin_note text default null,
  p_update_status boolean default false,
  p_update_admin_note boolean default false
)
returns public.site_inquiries
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_current public.site_inquiries;
  v_updated public.site_inquiries;
begin
  if not public.rls_is_admin() then
    raise exception 'Лише адміністратор може змінювати запити з сайту.' using errcode = '42501';
  end if;

  select * into v_current from public.site_inquiries where id = p_inquiry_id for update;
  if not found then
    raise exception 'Запит не знайдено.' using errcode = 'P0002';
  end if;
  if v_current.status not in ('new', 'in_progress', 'closed', 'spam') then
    raise exception 'Конвертований запит доступний лише для перегляду.' using errcode = '55000';
  end if;
  if p_update_status and p_status not in ('new', 'in_progress', 'closed', 'spam') then
    raise exception 'Цей статус недоступний у V1.' using errcode = '22023';
  end if;
  if p_update_admin_note and length(coalesce(p_admin_note, '')) > 4000 then
    raise exception 'Нотатка адміністратора задовга.' using errcode = '22001';
  end if;

  update public.site_inquiries
  set status = case when p_update_status then p_status else status end,
      admin_note = case when p_update_admin_note then nullif(btrim(p_admin_note), '') else admin_note end,
      processed_by = auth.uid()
  where id = p_inquiry_id
  returning * into v_updated;

  return v_updated;
end;
$function$;

revoke all on function public.crm_fetch_site_inquiries(text, text) from public, anon;
revoke all on function public.crm_update_site_inquiry(uuid, text, text, boolean, boolean) from public, anon;
grant execute on function public.crm_fetch_site_inquiries(text, text) to authenticated;
grant execute on function public.crm_update_site_inquiry(uuid, text, text, boolean, boolean) to authenticated;

commit;
