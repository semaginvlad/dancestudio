import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../supabase/migrations/20261102090000_admin_service_prices.sql", import.meta.url);

test("migration seeds the five global CRM prices", async () => {
  const sql = (await readFile(migrationUrl, "utf8")).toLowerCase();
  for (const [code, name, price] of [
    ["trial", "пробне заняття", 200],
    ["single", "разове заняття", 400],
    ["4pack", "абонемент на 4 заняття", 1200],
    ["8pack", "абонемент на 8 занять", 1800],
    ["12pack", "абонемент на 12 занять", 2200],
  ]) assert.match(sql, new RegExp(`\\('${code}', '${name}', ${price},`));
  assert.match(sql, /on conflict \(service_code\) do nothing/);
});

test("price catalog access is restricted to admins", async () => {
  const sql = (await readFile(migrationUrl, "utf8")).toLowerCase();
  assert.match(sql, /revoke all on table public\.service_prices from public, anon/);
  assert.match(sql, /create policy service_prices_admin_select[\s\S]*for select to authenticated[\s\S]*auth\.jwt\(\)/);
  assert.match(sql, /create policy service_prices_admin_update[\s\S]*for update to authenticated[\s\S]*with check/);
  assert.doesNotMatch(sql, /grant (insert|delete)[^;]*service_prices/);
});

test("new one-off payments snapshot the current price without rewriting history", async () => {
  const sql = (await readFile(migrationUrl, "utf8")).toLowerCase();
  assert.match(sql, /select sp\.price_uah into v_amount[\s\S]*where sp\.service_code = v_entry_type/);
  assert.match(sql, /insert into public\.subscriptions[\s\S]*v_amount, v_amount/);
  assert.doesNotMatch(sql, /update public\.subscriptions/);
  assert.match(sql, /update public\.attendance[\s\S]*where student_id is null[\s\S]*price_snapshot_uah is null/);
});

test("React has no hardcoded CRM prices and only admin flows receive catalog prices", async () => {
  const constants = await readFile(new URL("../src/shared/constants.js", import.meta.url), "utf8");
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const form = await readFile(new URL("../src/components/Forms.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(constants, /trainings:\s*\d+,\s*price:/);
  assert.match(app, /isCurrentAdmin \? db\.fetchServicePrices : async \(\) => \[\]/);
  assert.match(app, /isAdmin && <Modal open=\{modal==="addSub"\}[\s\S]*servicePrices=\{servicePrices\}/);
  assert.match(app, /<PricingTab prices=\{servicePrices\}/);
  assert.match(form, /resolvePlanTypePrice\(\{ planType, initial, priceByPlan, discountPct \}\)/);
  assert.match(form, /priceByPlan\[planType\]/);
});
