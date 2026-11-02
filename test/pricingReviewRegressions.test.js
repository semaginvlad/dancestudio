import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getGuestAttendanceRevenue } from "../src/guestRevenue.js";
import { resolvePlanTypePrice } from "../src/subscriptionPricing.js";

const migrationUrl = new URL("../supabase/migrations/20261102090000_admin_service_prices.sql", import.meta.url);

test("service price RLS trusts email or app_metadata but never user_metadata", async () => {
  const sql = (await readFile(migrationUrl, "utf8")).toLowerCase();
  const selectPolicy = sql.slice(sql.indexOf("create policy service_prices_admin_select"), sql.indexOf("drop policy if exists service_prices_admin_update"));
  const updatePolicy = sql.slice(sql.indexOf("create policy service_prices_admin_update"), sql.indexOf("-- guest attendance"));

  for (const policy of [selectPolicy, updatePolicy]) {
    assert.match(policy, /auth\.jwt\(\) ->> 'email'/);
    assert.match(policy, /auth\.jwt\(\) -> 'app_metadata' ->> 'role'/);
    assert.doesNotMatch(policy, /user_metadata/);
  }
  assert.equal((updatePolicy.match(/auth\.jwt\(\) -> 'app_metadata' ->> 'role'/g) || []).length, 2, "UPDATE USING and WITH CHECK use the same trusted role source");
});

test("guest revenue prefers immutable snapshots and preserves legacy trial/single income", async () => {
  assert.deepEqual(getGuestAttendanceRevenue({ entryType: "trial", priceSnapshotUah: 225 }), {
    amount: 225, revenueSource: "attendance.price_snapshot_uah", warning: null,
  });
  assert.equal(getGuestAttendanceRevenue({ guestType: "trial" }).amount, 150);
  assert.equal(getGuestAttendanceRevenue({ guestType: "single" }).amount, 300);

  const sql = (await readFile(migrationUrl, "utf8")).toLowerCase();
  assert.match(sql, /add column if not exists price_snapshot_uah/);
  assert.match(sql, /when 'trial' then 150[\s\S]*when 'single' then 300/);
  assert.match(sql, /before insert on public\.attendance/);
  assert.match(sql, /select price_uah into new\.price_snapshot_uah[\s\S]*from public\.service_prices/);
});

test("returning to an existing subscription plan restores its original financial snapshot", () => {
  const initial = { id: "sub-1", planType: "8pack", basePrice: 1500, amount: 1350 };
  const prices = { "4pack": 1200, "8pack": 1800, "12pack": 2200 };

  assert.deepEqual(resolvePlanTypePrice({ planType: "12pack", initial, priceByPlan: prices, discountPct: 10 }), {
    basePrice: 2200, amount: 1980, source: "current_catalog",
  });
  assert.deepEqual(resolvePlanTypePrice({ planType: "8pack", initial, priceByPlan: prices, discountPct: 10 }), {
    basePrice: 1500, amount: 1350, source: "initial_snapshot",
  });
});
