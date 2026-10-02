import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const name = "20261002090000_schedule_booking_blocks.sql";
const sql = readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
test("booking-block migration remains the latest timestamp", () => { assert.equal(readdirSync(new URL("../supabase/migrations", import.meta.url)).filter(x=>x.endsWith(".sql")).sort().at(-1), name); });
test("migration preserves access and trigger invariants", () => {
  for (const required of ["enable row level security", "crm_is_admin_session()", "crm_is_active_trainer_session()", "security definer", "set search_path", "before insert or update", "new.start_time::time < b.end_time", "b.start_time < new.end_time::time", "revoke all", "grant execute"]) assert.match(sql.toLowerCase(), new RegExp(required.replace(/[()]/g, "\\$&")));
  assert.doesNotMatch(sql, /service_role|ip_address|token|secret/i);
});
