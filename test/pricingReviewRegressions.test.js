import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { calculateGuestTrainerShare, getGuestAttendanceRevenue } from "../src/guestRevenue.js";
import { resolvePlanTypePrice } from "../src/subscriptionPricing.js";
import { mergeCatalogIntoPriceDrafts } from "../src/pricingDrafts.js";

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
  assert.doesNotMatch(sql, /update public\.attendance/);
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

test("guest trial/single creation is admin-only and snapshots current catalog price", async () => {
  const sql = (await readFile(migrationUrl, "utf8")).toLowerCase();
  const insertStart = sql.indexOf("create or replace function public.crm_snapshot_guest_attendance_price");
  const updateStart = sql.indexOf("create or replace function public.crm_protect_attendance_price_snapshot");
  const typeGuardStart = sql.indexOf("create or replace function public.crm_restrict_trainer_attendance_types");
  const ensureStart = sql.indexOf("create or replace function public.crm_ensure_one_off_payment_for_attendance");
  const insertTrigger = sql.slice(insertStart, updateStart);
  const updateTrigger = sql.slice(updateStart, typeGuardStart);
  const typeGuard = sql.slice(typeGuardStart, ensureStart);
  const ensureRpc = sql.slice(ensureStart);

  assert.match(insertTrigger, /if not v_is_admin then[\s\S]*guest, trial and single attendance are administrator-only[\s\S]*errcode = '42501'/);
  assert.match(insertTrigger, /select price_uah into new\.price_snapshot_uah[\s\S]*from public\.service_prices/);
  assert.match(updateTrigger, /new\.price_snapshot_uah is not distinct from old\.price_snapshot_uah[\s\S]*return new/);
  assert.match(updateTrigger, /attendance\.price_snapshot_uah is immutable[\s\S]*errcode = '23514'/);
  assert.match(updateTrigger, /before update of price_snapshot_uah on public\.attendance/);
  assert.match(typeGuard, /if v_is_admin then[\s\S]*return new/);
  assert.match(typeGuard, /before update of student_id, guest_name, guest_type, entry_type on public\.attendance/);
  assert.match(typeGuard, /guest, trial and single attendance are administrator-only[\s\S]*errcode = '42501'/);

  assert.match(ensureRpc, /if v_att\.price_snapshot_uah is not null then[\s\S]*v_amount := v_att\.price_snapshot_uah/);
  assert.match(insertTrigger, /if new\.price_snapshot_uah is null then[\s\S]*raise exception/);
  assert.doesNotMatch(insertTrigger, /coalesce\([^\n]*price_snapshot_uah/);
});

test("pricing scope adds no trainer subscription resolver or usage synchronization", async () => {
  const sql = (await readFile(migrationUrl, "utf8")).toLowerCase();
  assert.doesNotMatch(sql, /crm_record_auto_attendance|used_trainings\s*\)|crm_sync_subscription_usage/);
  const attendanceTab = await readFile(new URL("../src/components/AttendanceTab.jsx", import.meta.url), "utf8");
  const db = await readFile(new URL("../src/db.js", import.meta.url), "utf8");
  assert.doesNotMatch(attendanceTab, /insertAutoAttendance|persistAttendanceRecord/);
  assert.doesNotMatch(db, /insertAutoAttendance|crm_record_auto_attendance/);
});

test("saving one catalog price preserves other dirty drafts", async () => {
  const prices = [
    { serviceCode: "trial", priceUah: 200 },
    { serviceCode: "single", priceUah: 400 },
    { serviceCode: "8pack", priceUah: 1800 },
  ];
  const drafts = { trial: "225", single: "450", "8pack": "1800" };
  const dirtyCodes = new Set(["trial", "single"]);

  assert.deepEqual(mergeCatalogIntoPriceDrafts(
    prices.map((row) => row.serviceCode === "trial" ? { ...row, priceUah: 225 } : row),
    drafts,
    new Set(["single"]),
  ), { trial: "225", single: "450", "8pack": "1800" });
  assert.deepEqual(mergeCatalogIntoPriceDrafts(prices, drafts, dirtyCodes), drafts);
  const pricingTab = await readFile(new URL("../src/components/PricingTab.jsx", import.meta.url), "utf8");
  assert.match(pricingTab, /mergeCatalogIntoPriceDrafts\(prices, current, dirtyCodesRef\.current\)/);
  assert.match(pricingTab, /dirtyCodesRef\.current\.delete\(row\.serviceCode\)/);
  assert.match(pricingTab, /dirtyCodesRef\.current\.add\(row\.serviceCode\)/);
});
