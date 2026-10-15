import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const name = "20261015090000_studio_room_booking_availability.sql";
const sql = readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");

test("room-booking availability is an isolated latest migration", () => {
  assert.equal(readdirSync(new URL("../supabase/migrations", import.meta.url)).filter((file) => file.endsWith(".sql")).sort().at(-1), name);
  assert.match(sql, /add column if not exists booking_open boolean not null default true/i);
  assert.doesNotMatch(sql, /update\s+public\.room_bookings/i);
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
  const priorMigration = readFileSync(new URL("../supabase/migrations/20260917090000_fix_trainer_schedule_rooms.sql", import.meta.url), "utf8");
  assert.match(priorMigration, /create policy studio_rooms_admin_mutations[\s\S]*using \(public\.crm_is_admin_session\(\)\)[\s\S]*with check \(public\.crm_is_admin_session\(\)\)/i);
});

test("schedule UI hides closed rooms from booking choices and marks them in the graph", () => {
  const schedule = readFileSync(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
  assert.match(schedule, /availableBookingRooms[\s\S]*isStudioRoomBookingOpen/);
  assert.match(schedule, /ROOM_BOOKING_CLOSED_MESSAGE/);
  assert.match(schedule, /Тимчасово недоступний/);
  assert.match(schedule, /Бронювання закриті/);
  assert.match(schedule, /Бронювання відкриті/);
});
