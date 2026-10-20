import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const name = "20261015090000_studio_room_booking_availability.sql";
const adminOverrideName = "20261019090000_admin_closed_room_booking_override.sql";
const trainerExceptionsName = "20261019091000_closed_room_trainer_exceptions.sql";
const sql = readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
const adminOverrideSql = readFileSync(new URL(`../supabase/migrations/${adminOverrideName}`, import.meta.url), "utf8");
const trainerExceptionsSql = readFileSync(new URL(`../supabase/migrations/${trainerExceptionsName}`, import.meta.url), "utf8");
const priorSql = readFileSync(new URL("../supabase/migrations/20260917090000_fix_trainer_schedule_rooms.sql", import.meta.url), "utf8");

test("room-booking availability migrations remain isolated and ordered", () => {
  const migrations = readdirSync(new URL("../supabase/migrations", import.meta.url)).filter((file) => file.endsWith(".sql")).sort();
  assert.equal(migrations.at(-1), trainerExceptionsName);
  assert.ok(migrations.indexOf(adminOverrideName) > migrations.indexOf(name));
  assert.ok(migrations.indexOf(trainerExceptionsName) > migrations.indexOf(adminOverrideName));
  assert.match(sql, /add column if not exists booking_open boolean not null default true/i);
  assert.match(sql, /drop function if exists public\.crm_fetch_active_studio_rooms\(\);[\s\S]*create or replace function public\.crm_fetch_active_studio_rooms\(\)/i);
  assert.doesNotMatch(sql, /update\s+public\.room_bookings/i);
});

test("follow-up trigger allows canonical admins but retains the closed-room rejection", () => {
  assert.match(adminOverrideSql, /if public\.crm_is_admin_session\(\) then return new; end if;/i);
  assert.match(adminOverrideSql, /room\.booking_open is false/i);
  assert.match(adminOverrideSql, /Цей зал тимчасово недоступний для бронювання\. Оберіть інший зал\./);
  assert.doesNotMatch(adminOverrideSql, /user_metadata|app_metadata|email\s*=/i);
});

test("trainer exceptions are multi-value, admin-managed, and restricted to owned bookings", () => {
  assert.match(trainerExceptionsSql, /primary key \(room_id, trainer_id\)/i);
  assert.match(trainerExceptionsSql, /crm_admin_set_studio_room_booking_trainers[\s\S]*crm_is_admin_session\(\)/i);
  assert.match(trainerExceptionsSql, /t\.auth_user_id=auth\.uid\(\)/i);
  assert.match(trainerExceptionsSql, /new\.trainer_id::text in \(auth\.uid\(\)::text, t\.id::text\)/i);
  assert.match(trainerExceptionsSql, /t\.is_active is true[\s\S]*t\.archived_at is null[\s\S]*t\.access_disabled_at is null/i);
});

test("archived trainer deletion removes disposable room exceptions", async () => {
  const deleteRpc = trainerExceptionsSql.match(/create or replace function public\.delete_archived_trainer\(p_trainer_id text\)[\s\S]*?\$function\$;/i)?.[0];
  assert.ok(deleteRpc, "room exception migration must update the trainer deletion RPC");
  assert.match(deleteRpc, /delete from public\.studio_room_booking_trainer_exceptions[\s\S]*for v_dependency in/i);

  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create function public.rls_is_admin() returns boolean language sql stable as $$ select true $$;
      create table public.trainers(id uuid primary key, archived_at timestamptz);
      create table public.studio_rooms(id uuid primary key);
      create table public.studio_room_booking_trainer_exceptions(
        room_id uuid references public.studio_rooms(id) on delete cascade,
        trainer_id uuid references public.trainers(id) on delete cascade,
        primary key(room_id, trainer_id)
      );
      insert into public.trainers values ('00000000-0000-0000-0000-000000000001', now());
      insert into public.studio_rooms values ('00000000-0000-0000-0000-000000000002');
      insert into public.studio_room_booking_trainer_exceptions values (
        '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001'
      );
    `);
    await db.exec(deleteRpc);
    assert.deepEqual(
      (await db.query("select * from public.delete_archived_trainer('00000000-0000-0000-0000-000000000001')")).rows,
      [{ deleted_id: "00000000-0000-0000-0000-000000000001" }],
    );
    assert.equal((await db.query("select count(*)::int as count from public.trainers")).rows[0].count, 0);
    assert.equal((await db.query("select count(*)::int as count from public.studio_room_booking_trainer_exceptions")).rows[0].count, 0);
  } finally {
    await db.close();
  }
});

test("migration upgrades the already-existing zero-argument room RPC return shape", async () => {
  const oldRpc = priorSql.match(/create or replace function public\.crm_fetch_active_studio_rooms\(\)[\s\S]*?\$function\$;/i)?.[0];
  assert.ok(oldRpc, "previous migration must define the old room RPC");

  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create function public.crm_is_admin_session() returns boolean language sql stable as $$ select true $$;
      create function public.crm_is_active_trainer_session() returns boolean language sql stable as $$ select true $$;
      create function public.crm_canonical_room_name(text) returns text language sql immutable as $$ select lower(btrim($1)) $$;
      create function public.crm_schedule_booking_update_only_shrinks(date,date,date,date,text) returns boolean language sql immutable as $$ select false $$;
      create function public.crm_occurrence_removal_signature(date,text,text,text,text,date,text,text) returns text language sql immutable as $$ select ''::text $$;
      create table public.studio_rooms(
        id uuid primary key default gen_random_uuid(), name text not null, is_active boolean default true,
        sort_order integer default 0, created_at timestamptz default now()
      );
      create table public.room_bookings(
        id uuid primary key default gen_random_uuid(), date date, start_time text, end_time text,
        trainer_id text, room_name text, recurrence text, recurrence_until date, status text
      );
      insert into public.studio_rooms(name) values ('Основна зала');
    `);
    await db.exec(oldRpc);
    assert.doesNotMatch(
      (await db.query("select pg_get_function_result('public.crm_fetch_active_studio_rooms()'::regprocedure) as result")).rows[0].result,
      /booking_open/i,
    );

    await db.exec(sql);
    const upgradedShape = (await db.query("select pg_get_function_result('public.crm_fetch_active_studio_rooms()'::regprocedure) as result")).rows[0].result;
    assert.match(upgradedShape, /booking_open boolean/i);
    assert.deepEqual(
      (await db.query("select name, booking_open from public.crm_fetch_active_studio_rooms()")).rows,
      [{ name: "Основна зала", booking_open: true }],
    );
  } finally {
    await db.close();
  }
});

test("closed rooms are readable but server-rejected for booking writes", () => {
  assert.match(sql, /crm_fetch_active_studio_rooms[\s\S]*booking_open/i);
  assert.match(sql, /before insert or update on public\.room_bookings/i);
  assert.match(sql, /room\.booking_open is false/i);
  assert.match(sql, /Цей зал тимчасово недоступний для бронювання\. Оберіть інший зал\./);
  assert.doesNotMatch(sql, /crm\.booking_block_override[\s\S]*then return new/i);
});

test("migration preserves cancellation, occurrence removal, and room rename flows", () => {
  assert.match(sql, /coalesce\(new\.status, 'active'\) = 'cancelled'/i);
  assert.match(sql, /crm_schedule_booking_update_only_shrinks/i);
  assert.match(sql, /crm\.occurrence_removal_continuation/i);
  assert.match(sql, /crm\.room_rename_old_name/i);
});

test("room state remains admin-managed by the canonical RLS policy", () => {
  assert.match(priorSql, /create policy studio_rooms_admin_mutations[\s\S]*using \(public\.crm_is_admin_session\(\)\)[\s\S]*with check \(public\.crm_is_admin_session\(\)\)/i);
});

test("schedule UI hides closed rooms from booking choices and marks them in the graph", () => {
  const schedule = readFileSync(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
  assert.match(schedule, /availableBookingRooms[\s\S]*isStudioRoomBookingOpen/);
  assert.match(schedule, /ROOM_BOOKING_CLOSED_MESSAGE/);
  assert.match(schedule, /Тимчасово недоступний/);
  assert.match(schedule, /Бронювання закриті/);
  assert.match(schedule, /Бронювання відкриті/);
  assert.match(schedule, /refreshStudioRoomBookingAvailability\([\s\S]*fetchStudioRooms\(\{ includeInactive: isAdmin, strict: true \}\)/);
  assert.match(schedule, /resolveStudioRoomBookingSelection\(studioRooms, selectedRoom, \{ isAdmin, trainerIds: currentTrainerScopeIds, trainerAccessKnown: trainerRoomAccessKnown \}\)/);
  assert.match(schedule, /availableBookingRooms[\s\S]*isStudioRoomBookingOpenForActor/);
  assert.match(schedule, /return updateBookingEventWithGuard\(event, \{ status: "cancelled" \}\)/);
});
