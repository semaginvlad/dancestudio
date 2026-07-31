begin;

create table if not exists public.training_lesson_plans (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references public.groups(id) on delete cascade,
  trainer_id uuid not null,
  lesson_date date not null,
  schedule_slot_index integer not null default 0,
  plan_type text not null default 'other',
  goal text,
  planned_content text,
  planned_difficulty text,
  planned_outcome text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_lesson_plans_plan_type_check check (
    plan_type in (
      'choreography',
      'technique',
      'routine',
      'practice',
      'review',
      'filming',
      'performance_prep',
      'other'
    )
  ),
  constraint training_lesson_plans_planned_difficulty_check check (
    planned_difficulty is null
    or planned_difficulty in ('easy', 'medium', 'hard')
  ),
  constraint training_lesson_plans_unique_lesson unique (
    group_id,
    trainer_id,
    lesson_date,
    schedule_slot_index
  )
);

create index if not exists training_lesson_plans_group_date_idx
  on public.training_lesson_plans (group_id, lesson_date);

create index if not exists training_lesson_plans_trainer_date_idx
  on public.training_lesson_plans (trainer_id, lesson_date);

create index if not exists training_lesson_plans_lesson_date_idx
  on public.training_lesson_plans (lesson_date);

create table if not exists public.training_lesson_reports (
  id uuid primary key default gen_random_uuid(),
  group_id text not null references public.groups(id) on delete cascade,
  trainer_id uuid not null,
  lesson_date date not null,
  schedule_slot_index integer not null default 0,
  mood_score integer,
  difficulty_actual text,
  pace_actual text,
  plan_progress text,
  completed_content text,
  missed_content text,
  student_feedback text,
  trainer_notes text,
  next_adjustment text,
  risk_flags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_lesson_reports_mood_score_check check (
    mood_score is null
    or mood_score between 1 and 5
  ),
  constraint training_lesson_reports_difficulty_actual_check check (
    difficulty_actual is null
    or difficulty_actual in ('too_easy', 'ok', 'too_hard')
  ),
  constraint training_lesson_reports_pace_actual_check check (
    pace_actual is null
    or pace_actual in ('slow', 'ok', 'fast')
  ),
  constraint training_lesson_reports_plan_progress_check check (
    plan_progress is null
    or plan_progress in ('ahead', 'on_track', 'behind')
  ),
  constraint training_lesson_reports_risk_flags_check check (
    risk_flags <@ array[
      'low_energy',
      'too_hard',
      'too_easy',
      'conflict',
      'low_attendance',
      'behind_plan',
      'ready_for_filming',
      'needs_revision'
    ]::text[]
  ),
  constraint training_lesson_reports_unique_lesson unique (
    group_id,
    trainer_id,
    lesson_date,
    schedule_slot_index
  )
);

create index if not exists training_lesson_reports_group_date_idx
  on public.training_lesson_reports (group_id, lesson_date);

create index if not exists training_lesson_reports_trainer_date_idx
  on public.training_lesson_reports (trainer_id, lesson_date);

create index if not exists training_lesson_reports_lesson_date_idx
  on public.training_lesson_reports (lesson_date);

create index if not exists training_lesson_reports_risk_flags_gin_idx
  on public.training_lesson_reports using gin (risk_flags);

create or replace function public.set_training_lesson_evidence_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_training_lesson_plans_updated_at
  on public.training_lesson_plans;

create trigger set_training_lesson_plans_updated_at
before update on public.training_lesson_plans
for each row
execute function public.set_training_lesson_evidence_updated_at();

drop trigger if exists set_training_lesson_reports_updated_at
  on public.training_lesson_reports;

create trigger set_training_lesson_reports_updated_at
before update on public.training_lesson_reports
for each row
execute function public.set_training_lesson_evidence_updated_at();

alter table public.training_lesson_plans enable row level security;
alter table public.training_lesson_reports enable row level security;

drop policy if exists training_lesson_plans_admin_all
  on public.training_lesson_plans;
drop policy if exists training_lesson_plans_trainer_select_own_groups
  on public.training_lesson_plans;
drop policy if exists training_lesson_plans_trainer_insert_own_groups
  on public.training_lesson_plans;
drop policy if exists training_lesson_plans_trainer_update_own_groups
  on public.training_lesson_plans;
drop policy if exists training_lesson_plans_trainer_delete_own_groups
  on public.training_lesson_plans;

create policy training_lesson_plans_admin_all
on public.training_lesson_plans
for all
to authenticated
using (public.rls_is_admin())
with check (public.rls_is_admin());

create policy training_lesson_plans_trainer_select_own_groups
on public.training_lesson_plans
for select
to authenticated
using (
  group_id is not null
  and public.rls_owns_group(group_id)
);

create policy training_lesson_plans_trainer_insert_own_groups
on public.training_lesson_plans
for insert
to authenticated
with check (
  group_id is not null
  and public.rls_owns_group(group_id)
  and trainer_id::text = auth.uid()::text
);

create policy training_lesson_plans_trainer_update_own_groups
on public.training_lesson_plans
for update
to authenticated
using (
  group_id is not null
  and public.rls_owns_group(group_id)
)
with check (
  group_id is not null
  and public.rls_owns_group(group_id)
  and trainer_id::text = auth.uid()::text
);

create policy training_lesson_plans_trainer_delete_own_groups
on public.training_lesson_plans
for delete
to authenticated
using (
  group_id is not null
  and public.rls_owns_group(group_id)
);

drop policy if exists training_lesson_reports_admin_all
  on public.training_lesson_reports;
drop policy if exists training_lesson_reports_trainer_select_own_groups
  on public.training_lesson_reports;
drop policy if exists training_lesson_reports_trainer_insert_own_groups
  on public.training_lesson_reports;
drop policy if exists training_lesson_reports_trainer_update_own_groups
  on public.training_lesson_reports;
drop policy if exists training_lesson_reports_trainer_delete_own_groups
  on public.training_lesson_reports;

create policy training_lesson_reports_admin_all
on public.training_lesson_reports
for all
to authenticated
using (public.rls_is_admin())
with check (public.rls_is_admin());

create policy training_lesson_reports_trainer_select_own_groups
on public.training_lesson_reports
for select
to authenticated
using (
  group_id is not null
  and public.rls_owns_group(group_id)
);

create policy training_lesson_reports_trainer_insert_own_groups
on public.training_lesson_reports
for insert
to authenticated
with check (
  group_id is not null
  and public.rls_owns_group(group_id)
  and trainer_id::text = auth.uid()::text
);

create policy training_lesson_reports_trainer_update_own_groups
on public.training_lesson_reports
for update
to authenticated
using (
  group_id is not null
  and public.rls_owns_group(group_id)
)
with check (
  group_id is not null
  and public.rls_owns_group(group_id)
  and trainer_id::text = auth.uid()::text
);

create policy training_lesson_reports_trainer_delete_own_groups
on public.training_lesson_reports
for delete
to authenticated
using (
  group_id is not null
  and public.rls_owns_group(group_id)
);

commit;
