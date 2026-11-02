import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { calculateGuestTrainerShare, getGuestAttendanceRevenue } from "../src/guestRevenue.js";
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

test("a present zero-price snapshot stays zero and never falls back or pays trainer share", () => {
  const row = { guestType: "single", priceSnapshotUah: 0 };
  assert.deepEqual(getGuestAttendanceRevenue(row), {
    amount: 0, revenueSource: "attendance.price_snapshot_uah", warning: null,
  });
  assert.equal(calculateGuestTrainerShare(row, 50), 0);
});

test("relinked historical attendance keeps its snapshot while legacy attendance uses current catalog", async () => {
  const sql = (await readFile(migrationUrl, "utf8")).toLowerCase();
  const snapshotBranch = sql.indexOf("if v_att.price_snapshot_uah is not null then");
  const snapshotAssignment = sql.indexOf("v_amount := v_att.price_snapshot_uah", snapshotBranch);
  const catalogFallback = sql.indexOf("select sp.price_uah into v_amount", snapshotBranch);
  assert.ok(snapshotBranch > 0 && snapshotAssignment > snapshotBranch, "snapshot is used when present");
  assert.ok(catalogFallback > snapshotAssignment, "catalog lookup is only the NULL-snapshot fallback");
  assert.match(sql.slice(snapshotBranch, catalogFallback), /else\s*$/m);

  const resolvePaymentAmount = (snapshot, currentCatalogPrice) => snapshot ?? currentCatalogPrice;
  assert.equal(resolvePaymentAmount(150, 200), 150, "historical snapshot wins after catalog changes to 200");
  assert.equal(resolvePaymentAmount(null, 200), 200, "legacy NULL snapshot uses current catalog price");
  assert.equal(getGuestAttendanceRevenue({ guestType: "trial", priceSnapshotUah: 150 }).amount, 150);
  assert.equal(getGuestAttendanceRevenue({ guestType: "trial" }).amount, 150);
});

test("returning to an existing subscription plan restores its original financial snapshot", () => {
  const initial = { id: "sub-1", planType: "8pack", basePrice: 1500, amount: 1350, discountPct: 10 };
  const prices = { "4pack": 1200, "8pack": 1800, "12pack": 2200 };

  assert.deepEqual(resolvePlanTypePrice({ planType: "12pack", initial, priceByPlan: prices, discountPct: 10 }), {
    basePrice: 2200, amount: 1980, source: "current_catalog",
  });
  assert.deepEqual(resolvePlanTypePrice({ planType: "8pack", initial, priceByPlan: prices, discountPct: 10 }), {
    basePrice: 1500, amount: 1350, source: "initial_snapshot",
  });
});

test("editing can change plan only with a loaded valid catalog price, including a real zero price", async () => {
  const initial = { id: "sub-1", planType: "8pack", basePrice: 1500, amount: 1500, discountPct: 0 };
  assert.deepEqual(resolvePlanTypePrice({ planType: "12pack", initial, priceByPlan: {}, discountPct: 0 }), {
    basePrice: null, amount: null, source: "missing_catalog",
  });
  assert.deepEqual(resolvePlanTypePrice({ planType: "12pack", initial, priceByPlan: { "12pack": 0 }, discountPct: 0 }), {
    basePrice: 0, amount: 0, source: "current_catalog",
  });
  const form = await readFile(new URL("../src/components/Forms.jsx", import.meta.url), "utf8");
  assert.match(form, /const canSubmitWithPrice = isOriginalPlanType \|\| hasCatalogPrice/);
  assert.match(form, /if \(resolved\.source === "missing_catalog"\) return/);
});

test("returning to the original plan applies an explicitly changed discount to historical base price", () => {
  const initial = { id: "sub-1", planType: "8pack", basePrice: 1500, amount: 1350, discountPct: 10 };
  assert.deepEqual(resolvePlanTypePrice({ planType: "8pack", initial, priceByPlan: {}, discountPct: 20 }), {
    basePrice: 1500, amount: 1200, source: "initial_base_current_discount",
  });
});
