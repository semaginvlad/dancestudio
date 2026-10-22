import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../supabase/migrations/20261022120000_restrict_trainer_attendance_financial_type.sql",
  import.meta.url,
);
const checksUrl = new URL(
  "../supabase/tests/trainer_attendance_auto_only_checks.sql",
  import.meta.url,
);
const attendanceUrl = new URL("../src/components/AttendanceTab.jsx", import.meta.url);
const dbUrl = new URL("../src/db.js", import.meta.url);

test("trainer UI exposes Auto only and keeps administrative financial modes", async () => {
  const source = await readFile(attendanceUrl, "utf8");

  assert.match(source, /isAdmin \? \([\s\S]*?<option value="auto">Авто<\/option>[\s\S]*?<option value="debt">Борг<\/option>[\s\S]*?data-trainer-attendance-mode="auto"/);
  assert.match(source, /const effectiveEntryMode = isAdmin \? entryMode : "auto"/);
  assert.match(source, /\{isAdmin && <div className="attendance-add-panel"/);
  assert.match(source, /disabled=\{!isAdmin \|\| isCancelledDate\(dateStr\) \|\| saving\}/);
});

test("attendance quantity changes preserve the existing financial classification", async () => {
  const attendance = await readFile(attendanceUrl, "utf8");
  const db = await readFile(dbUrl, "utf8");

  assert.match(attendance, /const optimisticRecord = \{ \.\.\.rec, quantity: 2 \}/);
  assert.match(attendance, /db\.updateAttendanceQuantity\(rec\.id, 2\)/);
  assert.doesNotMatch(attendance, /await db\.deleteAttendance\(rec\.id\);[\s\S]{0,300}await db\.insertAttendance\(payload\)/);
  assert.match(db, /export async function updateAttendanceQuantity\(id, quantity\)/);
  assert.match(db, /\.update\(\{ quantity: safeQuantity \}\)/);
});

test("database boundary rejects trainer-selected financial types and preserves admin control", async () => {
  const sql = (await readFile(migrationUrl, "utf8")).toLowerCase();

  assert.match(sql, /create or replace function public\.rls_is_auto_attendance_entry/);
  assert.match(sql, /lower\(coalesce\(s\.plan_type, ''\)\) in \('4pack', '8pack', '12pack'\)/);
  assert.match(sql, /lower\(coalesce\(p_entry_type, ''\)\) = 'subscription'/);
  assert.match(sql, /lower\(coalesce\(p_entry_type, ''\)\) = 'debt'/);
  assert.match(sql, /public\.rls_is_auto_attendance_entry\(student_id, group_id, date, sub_id, entry_type\)/);
  assert.match(sql, /new\.entry_type is distinct from old\.entry_type/);
  assert.match(sql, /new\.sub_id is distinct from old\.sub_id/);
  assert.match(sql, /new\.date is distinct from old\.date/);
  assert.match(sql, /if public\.rls_is_admin\(\) then\s+return new/);
  assert.doesNotMatch(sql, /drop policy if exists attendance_admin_all/, "migration must retain the independent admin policy");
});

test("post-migration checks cover policy, trigger, and administrator access", async () => {
  const checks = (await readFile(checksUrl, "utf8")).toLowerCase();
  assert.match(checks, /rls_is_auto_attendance_entry\(student_id, group_id, date, sub_id, entry_type\)/);
  assert.match(checks, /attendance_guard_trainer_financial_fields/);
  assert.match(checks, /attendance_admin_all/);
});
