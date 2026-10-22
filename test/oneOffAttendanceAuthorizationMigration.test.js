import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../supabase/migrations/20261022090000_fix_one_off_attendance_trainer_authorization.sql",
  import.meta.url,
);
const checksUrl = new URL(
  "../supabase/tests/one_off_attendance_authorization_checks.sql",
  import.meta.url,
);

const functionBody = (sql, name, nextMarker) => {
  const start = sql.indexOf(`create or replace function public.${name}`);
  assert.notEqual(start, -1, `${name} must be replaced by the migration`);
  const end = nextMarker ? sql.indexOf(nextMarker, start) : sql.length;
  assert.notEqual(end, -1, `${name} must have a complete migration definition`);
  return sql.slice(start, end);
};

test("assigned trainers can create and remove Attendance one-off payments", async () => {
  const sql = (await readFile(migrationUrl, "utf8")).toLowerCase();
  const ensure = functionBody(
    sql,
    "crm_ensure_one_off_payment_for_attendance",
    "create or replace function public.crm_remove_one_off_payment_if_orphan",
  );
  const remove = functionBody(sql, "crm_remove_one_off_payment_if_orphan");

  for (const body of [ensure, remove]) {
    assert.match(body, /v_has_group_access\s*:=\s*public\.rls_owns_group\(v_att\.group_id\)/);
    assert.doesNotMatch(body, /g\.trainer_id\s*::text\s*=\s*auth\.uid\(\)::text/);
  }
  assert.match(ensure, /not allowed to manage one-off payment/);
  assert.match(remove, /not allowed to remove one-off payment/);
});

test("subscription and debt Attendance return before one-off authorization", async () => {
  const sql = (await readFile(migrationUrl, "utf8")).toLowerCase();
  const ensure = functionBody(
    sql,
    "crm_ensure_one_off_payment_for_attendance",
    "create or replace function public.crm_remove_one_off_payment_if_orphan",
  );
  const remove = functionBody(sql, "crm_remove_one_off_payment_if_orphan");

  for (const body of [ensure, remove]) {
    const typeGuard = body.indexOf("v_entry_type is null or v_entry_type not in ('trial', 'single')");
    const authorization = body.indexOf("v_has_group_access := public.rls_owns_group");
    assert.ok(typeGuard > 0, "one-off type guard must be present");
    assert.ok(authorization > typeGuard, "one-off authorization must follow the type guard");
  }
});

test("post-migration SQL checks preserve both authorization regressions", async () => {
  const checks = (await readFile(checksUrl, "utf8")).toLowerCase();
  assert.match(checks, /rls_owns_group\(v_att\.group_id\)/);
  assert.match(checks, /v_entry_type is null or v_entry_type not in \(''trial'', ''single''\)/);
  assert.match(checks, /strpos\(ensure_def/);
  assert.match(checks, /strpos\(remove_def/);
});

test("assigned trainer can ensure and remove one-off while non-one-off rows bypass authorization", async () => {
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create role anon;
    create role authenticated;

    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
    $$;

    create table public.trainers (
      id uuid primary key,
      auth_user_id uuid,
      is_active boolean,
      archived_at timestamptz,
      access_disabled_at timestamptz
    );
    create table public.trainer_groups (trainer_id uuid, group_id text);
    create table public.group_ownership_checks (group_id text);
    create table public.attendance (
      id uuid primary key,
      sub_id uuid,
      student_id uuid,
      date date,
      guest_name text,
      guest_type text,
      group_id text,
      quantity integer,
      entry_type text
    );
    create table public.subscriptions (
      id uuid primary key default gen_random_uuid(),
      student_id uuid,
      group_id text,
      plan_type text,
      start_date date,
      end_date date,
      total_trainings integer,
      used_trainings integer,
      amount integer,
      paid boolean,
      pay_method text,
      notification_sent boolean,
      created_at timestamptz default now(),
      activation_date date,
      original_end_date date,
      base_price integer,
      discount_pct integer,
      discount_source text,
      notes text
    );

    create function public.rls_owns_group(p_group_id text)
    returns boolean language plpgsql security definer set search_path = public as $$
    begin
      insert into public.group_ownership_checks values (p_group_id);
      return exists (
        select 1
        from public.trainers t
        join public.trainer_groups tg on tg.trainer_id = t.id
        where t.auth_user_id = auth.uid()
          and t.is_active is true
          and t.archived_at is null
          and t.access_disabled_at is null
          and tg.group_id = p_group_id
      );
    end
    $$;
  `);
  await db.exec(await readFile(migrationUrl, "utf8"));

  const trainerAuthId = "10000000-0000-0000-0000-000000000001";
  const trainerId = "20000000-0000-0000-0000-000000000001";
  const studentId = "30000000-0000-0000-0000-000000000001";
  const oneOffAttendanceId = "40000000-0000-0000-0000-000000000001";
  const subscriptionAttendanceId = "40000000-0000-0000-0000-000000000002";
  const debtAttendanceId = "40000000-0000-0000-0000-000000000003";
  const nullLegacyAttendanceId = "40000000-0000-0000-0000-000000000004";
  const emptyLegacyAttendanceId = "40000000-0000-0000-0000-000000000005";

  await db.exec(`
    select set_config('request.jwt.claim.sub', '${trainerAuthId}', false);
    select set_config('request.jwt.claims', '{"email":"trainer@example.com"}', false);
    insert into public.trainers (id, auth_user_id, is_active)
      values ('${trainerId}', '${trainerAuthId}', true);
    insert into public.trainer_groups (trainer_id, group_id)
      values ('${trainerId}', 'assigned-group');
    insert into public.attendance (id, student_id, date, group_id, quantity, entry_type, guest_type)
      values
        ('${oneOffAttendanceId}', '${studentId}', '2026-10-22', 'assigned-group', 1, 'single', null),
        ('${subscriptionAttendanceId}', '${studentId}', '2026-10-22', 'foreign-group', 1, 'subscription', null),
        ('${debtAttendanceId}', '${studentId}', '2026-10-22', 'foreign-group', 1, 'debt', null),
        ('${nullLegacyAttendanceId}', '${studentId}', '2026-10-22', 'foreign-group', 1, null, null),
        ('${emptyLegacyAttendanceId}', '${studentId}', '2026-10-22', 'foreign-group', 1, '', '');
  `);

  const ensured = await db.query(
    "select * from public.crm_ensure_one_off_payment_for_attendance($1::uuid)",
    [oneOffAttendanceId],
  );
  assert.equal(ensured.rows.length, 1);
  assert.equal(ensured.rows[0].plan_type, "single");

  for (const attendanceId of [subscriptionAttendanceId, debtAttendanceId]) {
    const result = await db.query(
      "select * from public.crm_ensure_one_off_payment_for_attendance($1::uuid)",
      [attendanceId],
    );
    assert.equal(result.rows.length, 0);
    await db.query(
      "select public.crm_remove_one_off_payment_if_orphan($1::uuid)",
      [attendanceId],
    );
  }

  const ownershipChecksBeforeLegacy = (await db.query(
    "select count(*)::integer as count from public.group_ownership_checks",
  )).rows[0].count;
  for (const attendanceId of [nullLegacyAttendanceId, emptyLegacyAttendanceId]) {
    const result = await db.query(
      "select * from public.crm_ensure_one_off_payment_for_attendance($1::uuid)",
      [attendanceId],
    );
    assert.equal(result.rows.length, 0);
    await db.query(
      "select public.crm_remove_one_off_payment_if_orphan($1::uuid)",
      [attendanceId],
    );
  }
  const ownershipChecksAfterLegacy = (await db.query(
    "select count(*)::integer as count from public.group_ownership_checks",
  )).rows[0].count;
  assert.equal(
    ownershipChecksAfterLegacy,
    ownershipChecksBeforeLegacy,
    "legacy NULL/empty attendance must return without calling rls_owns_group",
  );

  await db.query(
    "select public.crm_remove_one_off_payment_if_orphan($1::uuid)",
    [oneOffAttendanceId],
  );
  const remaining = await db.query(
    "select count(*)::integer as count from public.subscriptions where notes = $1",
    [`auto_one_off_from_attendance:${oneOffAttendanceId}`],
  );
  assert.equal(remaining.rows[0].count, 0);

  await db.close();
});
