import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL("../supabase/migrations/20261104090000_financial_core_and_booking_tariffs.sql", import.meta.url);
const sql = await readFile(migrationUrl, "utf8");

async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select case when current_setting('app.test_authenticated', true) = 'on'
        then '00000000-0000-0000-0000-000000000001'::uuid else null end
    $$;
    create function public.rls_is_admin() returns boolean language sql stable as $$
      select current_setting('app.test_admin', true) = 'on'
    $$;
    create function public.crm_is_admin_session() returns boolean language sql stable as $$
      select auth.uid() is not null and public.rls_is_admin()
    $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create table public.attendance(id uuid primary key);
    create table public.room_bookings(id uuid primary key);
    create table public.trainers(id uuid primary key);
  `);
  await db.exec(sql);
  return db;
}

test("financial core seeds exact categories, payment methods and 250 UAH rental tariff", async () => {
  const db = await database();
  try {
    assert.deepEqual((await db.query("select code from financial_categories order by sort_order")).rows.map((row) => row.code), [
      "subscription", "trial", "single", "room_rental", "individual_training", "manual_income", "manual_expense",
    ]);
    assert.deepEqual((await db.query("select code,name from financial_payment_methods order by sort_order")).rows, [
      { code: "cash", name: "Готівка" }, { code: "card", name: "Картка" },
    ]);
    assert.equal((await db.query("select price_uah from room_booking_tariffs where code='individual_1_2'")).rows[0].price_uah, 250);
  } finally { await db.close(); }
});

test("active source links cannot create duplicate financial operations but voided history is retained", async () => {
  const db = await database();
  try {
    await db.exec(`set app.test_authenticated='on'; set app.test_admin='on';
      insert into attendance values ('10000000-0000-0000-0000-000000000001');
      insert into financial_operations(category_code,direction,amount_uah,attendance_id)
      values ('trial','income',250,'10000000-0000-0000-0000-000000000001');`);
    await assert.rejects(db.exec(`insert into financial_operations(category_code,direction,amount_uah,attendance_id)
      values ('trial','income',250,'10000000-0000-0000-0000-000000000001')`), /unique|duplicate/i);
    await db.exec("update financial_operations set status='voided'");
    await db.exec(`insert into financial_operations(category_code,direction,amount_uah,attendance_id)
      values ('trial','income',250,'10000000-0000-0000-0000-000000000001')`);
    assert.equal((await db.query("select count(*)::int count from financial_operations")).rows[0].count, 2);
  } finally { await db.close(); }
});

test("used dictionaries are archived instead of deleted", async () => {
  const db = await database();
  try {
    await db.exec(`set app.test_authenticated='on'; set app.test_admin='on';
      insert into financial_operations(category_code,direction,amount_uah,payment_method_code)
      values ('manual_income','income',10,'cash');`);
    await assert.rejects(db.exec("delete from financial_categories where code='manual_income'"), /deactivated/i);
    await assert.rejects(db.exec("delete from financial_payment_methods where code='cash'"), /deactivated/i);
    await db.exec("update financial_categories set is_active=false where code='manual_income'; update financial_payment_methods set is_active=false where code='cash'");
    assert.deepEqual((await db.query("select is_active from financial_categories where code='manual_income'")).rows, [{ is_active: false }]);
  } finally { await db.close(); }
});

test("trainer cannot read financial data or prices, while canonical admin can manage settings", async () => {
  const db = await database();
  try {
    await db.exec("set app.test_authenticated='on'; set app.test_admin='off'; set role authenticated");
    assert.deepEqual((await db.query("select * from financial_categories")).rows, []);
    await assert.rejects(db.exec("insert into financial_operations(category_code,direction,amount_uah) values ('manual_income','income',10)"), /row-level security/i);
    const trainerTariffs = (await db.query("select code,price_uah from crm_fetch_room_booking_tariffs() order by sort_order")).rows;
    assert.ok(trainerTariffs.length > 0);
    assert.ok(trainerTariffs.every((row) => row.price_uah === null));

    await db.exec("reset role; set app.test_admin='on'; set role authenticated");
    assert.equal((await db.query("select price_uah from crm_fetch_room_booking_tariffs() where code='individual_1_2'")).rows[0].price_uah, 250);
    await db.exec("reset role; insert into trainers values ('20000000-0000-0000-0000-000000000001'); set role authenticated");
    await db.exec("insert into trainer_financial_settings(trainer_id) values ('20000000-0000-0000-0000-000000000001')");
    assert.deepEqual((await db.query("select individual_income_enabled,trainer_share_uah::text trainer_share_uah from trainer_financial_settings")).rows, [
      { individual_income_enabled: false, trainer_share_uah: "0.00" },
    ]);
  } finally { await db.close(); }
});

test("migration never trusts user_metadata and creates no booking financial automation", () => {
  assert.doesNotMatch(sql, /user_metadata/i);
  assert.doesNotMatch(sql, /create trigger[^;]*(attendance|room_bookings)/i);
  assert.match(sql, /crm_is_admin_session\(\)/i);
});
