alter table public.groups
  add column if not exists public_level text null,
  add column if not exists public_join_status text not null default 'open',
  add column if not exists show_on_public_site boolean not null default false,
  add column if not exists age_category text null;

comment on column public.groups.public_level is 'Public website group level: base or mix; null when not shown publicly.';
comment on column public.groups.public_join_status is 'Public website join status: open, experience_only, or closed.';
comment on column public.groups.show_on_public_site is 'Controls whether the group can be exposed by future public schedule APIs.';
comment on column public.groups.age_category is 'Public website age category: teens_under_16 or adults_16_plus; null when not shown publicly.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'groups_public_level_check'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_public_level_check
      check (public_level is null or public_level in ('base', 'mix'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'groups_public_join_status_check'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_public_join_status_check
      check (public_join_status in ('open', 'experience_only', 'closed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'groups_age_category_check'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_age_category_check
      check (age_category is null or age_category in ('teens_under_16', 'adults_16_plus'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'groups_public_required_fields_check'
      and conrelid = 'public.groups'::regclass
  ) then
    alter table public.groups
      add constraint groups_public_required_fields_check
      check (
        show_on_public_site = false
        or (public_level is not null and age_category is not null)
      );
  end if;
end $$;
