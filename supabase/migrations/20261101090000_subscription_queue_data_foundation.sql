-- Data-only foundation for subscription queues.
--
-- Legacy subscriptions intentionally keep both columns NULL. In particular,
-- created_at, UUID order and physical row order are not used to infer either
-- payment dates or queue links.

alter table public.subscriptions
  add column if not exists paid_at date,
  add column if not exists previous_subscription_id uuid;

-- PostgreSQL needs a matching unique key for the composite foreign key below.
-- Keeping student_id and group_id in that key makes the same-student,
-- same-group rule a database invariant (including direct API writes).
create unique index if not exists subscriptions_queue_identity_key
  on public.subscriptions (id, student_id, group_id);

alter table public.subscriptions
  drop constraint if exists subscriptions_previous_not_self;

alter table public.subscriptions
  add constraint subscriptions_previous_not_self
  check (
    previous_subscription_id is null
    or (
      previous_subscription_id <> id
      and student_id is not null
      and group_id is not null
    )
  );

alter table public.subscriptions
  drop constraint if exists subscriptions_previous_same_student_group_fk;

alter table public.subscriptions
  add constraint subscriptions_previous_same_student_group_fk
  foreign key (previous_subscription_id, student_id, group_id)
  references public.subscriptions (id, student_id, group_id)
  on update restrict
  on delete restrict;

-- A queue is a chain: one subscription cannot have two direct successors.
create unique index if not exists subscriptions_one_successor_per_previous_key
  on public.subscriptions (previous_subscription_id)
  where previous_subscription_id is not null;

comment on column public.subscriptions.paid_at is
  'Canonical business payment date. NULL means unknown for a legacy/unpaid record; never infer from created_at.';

comment on column public.subscriptions.previous_subscription_id is
  'Explicit previous subscription in the same student+group queue. NULL means no declared predecessor.';
