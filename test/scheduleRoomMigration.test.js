import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL(
  "../supabase/migrations/20260917090000_fix_trainer_schedule_rooms.sql",
  import.meta.url,
);

test("schedule booking ownership supports both trainer_id formats and masks foreign data", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /rb\.trainer_id::text\s*=\s*auth\.uid\(\)::text/);
  assert.match(sql, /t\.id::text\s*=\s*rb\.trainer_id::text/);
  assert.match(sql, /t\.auth_user_id\s*=\s*auth\.uid\(\)/);
  assert.match(sql, /t\.is_active is true/);
  assert.match(sql, /t\.archived_at is null/);
  assert.match(sql, /t\.access_disabled_at is null/);
  assert.match(sql, /case when v\.is_admin or v\.is_owner then v\.price else null end/);
  assert.match(sql, /case when v\.is_admin or v\.is_owner then v\.note else null end/);
  assert.match(sql, /case when v\.is_admin or v\.is_owner then v\.description else null end/);
});
