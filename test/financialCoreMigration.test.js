import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { mergeTariffsIntoDrafts } from "../src/pricingDrafts.js";
import { resolveBookingTypeForMutation } from "../src/studioRooms.js";

const migrationUrl = new URL("../supabase/migrations/20261104090000_financial_core_and_booking_tariffs.sql", import.meta.url);
const sql = await readFile(migrationUrl, "utf8");
const dbSource = await readFile(new URL("../src/db.js", import.meta.url), "utf8");
const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const scheduleSource = await readFile(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
const scheduleBookingBlocksSql = await readFile(new URL("../supabase/migrations/20261002090000_schedule_booking_blocks.sql", import.meta.url), "utf8");
const removeOccurrenceFunction = scheduleBookingBlocksSql.match(/create or replace function public\.crm_remove_room_booking_occurrence\(p_id uuid,p_occurrence_date date\)[\s\S]*?end \$\$;/i)?.[0];

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
    create function public.crm_is_active_trainer_session() returns boolean language sql stable as $$ select auth.uid() is not null $$;
    create function public.crm_canonical_room_name(text) returns text language sql immutable as $$ select lower(btrim($1)) $$;
    create function public.crm_occurrence_removal_signature(date,text,text,text,text,date,text,text) returns text language sql immutable as $$
      select concat_ws('|',$1::text,$2,$3,lower(btrim($4)),$5,$6::text,$7,$8)
    $$;
    create function public.crm_schedule_booking_occurs_on(date,date,text) returns boolean language sql immutable as $$ select $2 >= $1 $$;
    create function public.crm_schedule_booking_step_date(date,text,integer) returns date language sql immutable as $$
      select case lower($2) when 'daily' then $1 + $3 when 'monthly' then ($1 + ($3 || ' month')::interval)::date else $1 + (7 * $3) end
    $$;
    create table public.attendance(id uuid primary key);
    create table public.room_bookings(
      id uuid primary key default gen_random_uuid(), date date, start_time text, end_time text,
      trainer_id text, trainer_name text, title text, type text, room_name text,
      event_type text, booking_type text, people_count integer, price integer,
      payment_method text, note text, color text, recurrence text default 'none',
      recurrence_until date, description text, status text default 'active', created_at timestamptz default now()
    );
    create table public.trainers(id uuid primary key, auth_user_id uuid, is_active boolean default true, archived_at timestamptz, access_disabled_at timestamptz);
    create table public.studio_rooms(
      id uuid primary key default gen_random_uuid(), name text, is_active boolean default true,
      booking_open boolean default true, sort_order integer default 0, created_at timestamptz default now()
    );
    create table public.studio_room_booking_trainer_exceptions(
      room_id uuid references public.studio_rooms(id), trainer_id uuid references public.trainers(id)
    );
    create function public.crm_fetch_studio_rooms(boolean default false)
    returns table(id uuid) language sql as $$ select null::uuid where false $$;
    insert into studio_rooms(name,sort_order) values ('Зал 1',10),('Зал 2',20),('Зал 3',30);
  `);
  await db.exec(sql);
  assert.ok(removeOccurrenceFunction, "occurrence removal RPC must be available to regression tests");
  await db.exec(removeOccurrenceFunction);
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
    assert.ok((await db.query("select hourly_rate_uah from crm_fetch_studio_rooms(false)")).rows.every((row) => row.hourly_rate_uah === null));
    await assert.rejects(db.query("select crm_admin_update_studio_room_hourly_rate('99999999-9999-9999-9999-999999999999', 700)"), /administrator/i);

    await db.exec("reset role; set app.test_admin='on'; set role authenticated");
    assert.equal((await db.query("select price_uah from crm_fetch_room_booking_tariffs() where code='individual_1_2'")).rows[0].price_uah, 250);
    assert.equal((await db.query("select hourly_rate_uah from crm_fetch_studio_rooms(false) order by sort_order limit 1")).rows[0].hourly_rate_uah, 500);
    assert.equal((await db.query("select crm_admin_update_studio_room_hourly_rate((select id from crm_fetch_studio_rooms(false) order by sort_order limit 1), 700) as rate")).rows[0].rate, 700);
    await db.exec("reset role; insert into trainers values ('20000000-0000-0000-0000-000000000001'); set role authenticated");
    await db.exec("insert into trainer_financial_settings(trainer_id) values ('20000000-0000-0000-0000-000000000001')");
    assert.deepEqual((await db.query("select individual_income_enabled,trainer_share_uah::text trainer_share_uah from trainer_financial_settings")).rows, [
      { individual_income_enabled: false, trainer_share_uah: "0.00" },
    ]);
  } finally { await db.close(); }
});

test("admin room create, update and reactivate use permitted columns while trainer response hides hourly rate", async () => {
  const roomManagement = dbSource.slice(dbSource.indexOf("export async function createStudioRoom"), dbSource.indexOf("export async function updateStudioRoomHourlyRate"));
  assert.doesNotMatch(roomManagement, /\.select\(['"]\*['"]\)/);
  assert.match(roomManagement, /select\(STUDIO_ROOM_MANAGEMENT_COLUMNS\)/);

  const db = await database();
  try {
    await db.exec(`
      alter table studio_rooms enable row level security;
      create policy studio_rooms_admin_test on studio_rooms for all to authenticated
        using (crm_is_admin_session()) with check (crm_is_admin_session());
      grant select(id,name,is_active,booking_open,sort_order,created_at), insert, update on studio_rooms to authenticated;
      set app.test_authenticated='on'; set app.test_admin='on'; set role authenticated;
    `);
    const created = (await db.query("insert into studio_rooms(name,is_active) values ('Нова зала',true) returning id,name,is_active,booking_open,sort_order,created_at")).rows[0];
    assert.equal(created.name, "Нова зала");
    await db.query("update studio_rooms set name='Оновлена зала',is_active=false where id=$1 returning id,name,is_active,booking_open,sort_order,created_at", [created.id]);
    const reactivated = (await db.query("update studio_rooms set is_active=true where id=$1 returning id,name,is_active,booking_open,sort_order,created_at", [created.id])).rows[0];
    assert.equal(reactivated.is_active, true);

    await db.exec("reset role; set app.test_admin='off'; set role authenticated");
    assert.ok((await db.query("select hourly_rate_uah from crm_fetch_studio_rooms(false)")).rows.every((row) => row.hourly_rate_uah === null));
    await assert.rejects(db.query("select hourly_rate_uah from studio_rooms"), /permission denied/i);
  } finally { await db.close(); }
});

test("migration never trusts user_metadata and creates no booking financial automation", () => {
  assert.doesNotMatch(sql, /user_metadata/i);
  assert.doesNotMatch(sql, /insert into public\.financial_operations/i);
  assert.match(sql, /crm_is_admin_session\(\)/i);
});

test("hourly room rates snapshot 1h, 1.5h and 2h bookings and survive later rate changes", async () => {
  const db = await database();
  try {
    await db.exec("set app.test_authenticated='on'; set app.test_admin='off'");
    const rooms = (await db.query("select id,name,hourly_rate_uah from studio_rooms order by sort_order")).rows;
    assert.deepEqual(rooms.map(({ name, hourly_rate_uah }) => ({ name, hourly_rate_uah })), [
      { name: "Зал 1", hourly_rate_uah: 500 }, { name: "Зал 2", hourly_rate_uah: 250 }, { name: "Зал 3", hourly_rate_uah: 250 },
    ]);
    await db.exec(`
      insert into room_bookings(start_time,end_time,room_name,event_type) values
        ('10:00','11:00','Зал 2','room_booking'),
        ('10:00','11:30','Зал 2','room_booking'),
        ('10:00','12:00','Зал 1','room_booking');
    `);
    assert.deepEqual((await db.query("select price from room_bookings order by price")).rows, [{ price: 250 }, { price: 375 }, { price: 1000 }]);
    await db.exec(`update studio_rooms set hourly_rate_uah=900 where name='Зал 2'`);
    assert.deepEqual((await db.query("select price from room_bookings order by price")).rows, [{ price: 250 }, { price: 375 }, { price: 1000 }]);
  } finally { await db.close(); }
});

test("two hours in room 1 snapshot to 1000 UAH server-side", async () => {
  const db = await database();
  try {
    await db.exec("set app.test_authenticated='on'; set app.test_admin='off'");
    await db.exec("insert into room_bookings(start_time,end_time,room_name,event_type) values ('10:00','12:00','Зал 1','room_booking')");
    assert.equal((await db.query("select price from room_bookings")).rows[0].price, 1000);
  } finally { await db.close(); }
});

test("two hours in room 2 snapshot to 500 UAH server-side", async () => {
  const db = await database();
  try {
    await db.exec("set app.test_authenticated='on'; set app.test_admin='off'");
    await db.exec("insert into room_bookings(start_time,end_time,room_name,event_type) values ('10:00','12:00','Зал 2','room_booking')");
    assert.equal((await db.query("select price from room_bookings")).rows[0].price, 500);
  } finally { await db.close(); }
});

test("trainer edits preserve server price snapshot and inactive tariff is rejected only for new bookings", async () => {
  const db = await database();
  try {
    await db.exec("set app.test_authenticated='on'; set app.test_admin='off'");
    await db.exec("insert into room_bookings(start_time,end_time,room_name,event_type,booking_type) values ('10:00','11:00','Зал 2','individual_training','individual_1_2')");
    await db.exec("update room_bookings set price=null");
    assert.equal((await db.query("select price from room_bookings")).rows[0].price, 250);
    await db.exec("update room_booking_tariffs set is_active=false where code='individual_1_2'");
    assert.equal((await db.query("select name from crm_fetch_room_booking_tariffs() where code='individual_1_2'")).rows[0].name, "Індивідуальне 1–2 особи");
    await assert.rejects(db.exec("insert into room_bookings(start_time,end_time,room_name,event_type,booking_type) values ('12:00','13:00','Зал 2','individual_training','individual_1_2')"), /inactive booking tariff/i);
    await db.exec("update room_bookings set start_time='10:15'");
    assert.equal((await db.query("select price from room_bookings")).rows[0].price, 250);
  } finally { await db.close(); }
});

test("splitting a recurring series preserves inactive tariff and original price snapshots", async () => {
  const db = await database();
  try {
    await db.exec("set app.test_authenticated='on'; set app.test_admin='on'");
    const original = (await db.query(`
      insert into room_bookings(date,start_time,end_time,room_name,event_type,booking_type,price,recurrence,recurrence_until,status)
      values ('2026-01-01','10:00','11:00','Зал 2','individual_training','individual_1_2',null,'weekly','2026-01-29','active')
      returning id,price
    `)).rows[0];
    assert.equal(original.price, 250);
    await db.exec("update room_booking_tariffs set is_active=false where code='individual_1_2'; update studio_rooms set hourly_rate_uah=900 where name='Зал 2'");

    assert.equal((await db.query("select crm_remove_room_booking_occurrence($1,'2026-01-15') as removed", [original.id])).rows[0].removed, true);
    assert.deepEqual((await db.query("select date::text,recurrence_until::text,booking_type,price from room_bookings order by date")).rows, [
      { date: "2026-01-01", recurrence_until: "2026-01-08", booking_type: "individual_1_2", price: 250 },
      { date: "2026-01-22", recurrence_until: "2026-01-29", booking_type: "individual_1_2", price: 250 },
    ]);
    await assert.rejects(db.exec("insert into room_bookings(date,start_time,end_time,room_name,event_type,booking_type) values ('2026-02-01','10:00','11:00','Зал 2','individual_training','individual_1_2')"), /inactive booking tariff/i);
  } finally { await db.close(); }
});

test("event-details cancellation preserves inactive booking type and price snapshot", async () => {
  const tariffs = [
    { id: "individual_1_2", isActive: false },
    { id: "small_group_3_9", isActive: true },
  ];
  assert.equal(resolveBookingTypeForMutation(tariffs, "individual_1_2", { isExisting: true }), "individual_1_2");
  assert.equal(resolveBookingTypeForMutation(tariffs, "individual_1_2"), "small_group_3_9");
  const detailsFlow = scheduleSource.slice(scheduleSource.indexOf("const updateBookingEventWithGuard"), scheduleSource.indexOf("const removeSingleRecurringBookingOccurrence"));
  assert.match(detailsFlow, /normalizeBookingPayload\([\s\S]*\{ isExisting: true \}\)/);

  const db = await database();
  try {
    await db.exec("set app.test_authenticated='on'; set app.test_admin='on'");
    const original = (await db.query(`
      insert into room_bookings(date,start_time,end_time,room_name,event_type,booking_type,status)
      values ('2026-02-01','10:00','11:00','Зал 2','individual_training','individual_1_2','active')
      returning id,price
    `)).rows[0];
    await db.exec("update room_booking_tariffs set is_active=false where code='individual_1_2'");
    await db.query("update room_bookings set status='cancelled',booking_type='individual_1_2',price=$2 where id=$1", [original.id, original.price]);
    assert.deepEqual((await db.query("select status,booking_type,price from room_bookings where id=$1", [original.id])).rows, [
      { status: "cancelled", booking_type: "individual_1_2", price: 250 },
    ]);
  } finally { await db.close(); }
});

test("trainer create, read and update responses hide price while admin sees stored snapshot", async () => {
  assert.match(appSource, /isAdmin \? await db\.insertRoomBooking\(safePayload\) : await db\.insertTrainerRoomBooking\(safePayload\)/);
  assert.match(appSource, /isAdmin \? await db\.updateRoomBooking\(id, safePayload\)/);
  assert.match(appSource, /await db\.updateTrainerRoomBooking\(id, safePayload\)/);
  const trainerUpdateClient = dbSource.slice(dbSource.indexOf("export async function updateTrainerRoomBooking"), dbSource.indexOf("const roomBookingRpcParams"));
  assert.match(trainerUpdateClient, /delete safePayload\.price/);
  assert.match(trainerUpdateClient, /delete safePayload\.paymentMethod/);
  assert.match(appSource, /db\.mutateTrainerRoomBooking\(id, "delete"\)/);
  assert.match(appSource, /db\.mutateTrainerRoomBooking\(id, "cancel"\)/);
  const db = await database();
  try {
    await db.exec(`
      insert into trainers(id,auth_user_id) values ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');
      alter table room_bookings enable row level security;
      create policy room_bookings_admin_test on room_bookings for all to authenticated
        using (crm_is_admin_session()) with check (crm_is_admin_session());
      create policy room_bookings_trainer_insert_test on room_bookings for insert to authenticated
        with check (trainer_id=auth.uid()::text);
      create policy room_bookings_trainer_update_test on room_bookings for update to authenticated
        using (trainer_id=auth.uid()::text) with check (trainer_id=auth.uid()::text);
      grant select,insert,update on room_bookings to authenticated;
      set app.test_authenticated='on'; set app.test_admin='off'; set role authenticated;
    `);
    const created = (await db.query(`select crm_trainer_create_room_booking(
      '{"date":"2026-03-01","startTime":"10:00","endTime":"11:00","roomName":"Зал 2","eventType":"individual_training","bookingType":"individual_1_2","title":"Private"}'::jsonb
    ) as booking`)).rows[0].booking;
    assert.equal(Object.hasOwn(created, "price"), false);
    assert.equal(Object.hasOwn(created, "payment_method"), false);
    await db.exec("reset role; update room_bookings set payment_method='cash' where id='" + created.id + "'; set role authenticated");
    assert.deepEqual((await db.query("select price,payment_method from crm_fetch_schedule_room_bookings() where id=$1", [created.id])).rows, [{ price: null, payment_method: null }]);
    assert.deepEqual((await db.query("select price from room_bookings")).rows, []);

    const updated = (await db.query(`select crm_trainer_update_room_booking($1,
      '{"title":"Updated","price":null,"paymentMethod":"none","eventType":"individual_training","bookingType":"individual_1_2"}'::jsonb
    ) as booking`, [created.id])).rows[0].booking;
    assert.equal(Object.hasOwn(updated, "price"), false);
    assert.equal(Object.hasOwn(updated, "payment_method"), false);

    const cancelled = (await db.query("select crm_trainer_mutate_room_booking($1,'cancel') as booking", [created.id])).rows[0].booking;
    assert.equal(cancelled.status, "cancelled");
    assert.equal(Object.hasOwn(cancelled, "price"), false);
    assert.equal(Object.hasOwn(cancelled, "payment_method"), false);
    await db.exec("reset role; insert into room_bookings(id,date,start_time,end_time,trainer_id,title,event_type,room_name) values ('40000000-0000-0000-0000-000000000001','2026-03-02','10:00','11:00','99999999-9999-9999-9999-999999999999','Other','room_booking','Зал 2'); set role authenticated");
    await assert.rejects(db.query("select crm_trainer_mutate_room_booking('40000000-0000-0000-0000-000000000001','cancel')"), /another trainer/i);

    await db.exec("reset role; set app.test_admin='on'; set role authenticated");
    assert.deepEqual((await db.query("select status,price,payment_method from room_bookings where id=$1", [created.id])).rows, [{ status: "cancelled", price: 250, payment_method: "cash" }]);
    assert.deepEqual((await db.query("select price,payment_method from crm_fetch_schedule_room_bookings() where id=$1", [created.id])).rows, [{ price: 250, payment_method: "cash" }]);
  } finally { await db.close(); }
});

test("saving one tariff preserves dirty drafts in other rows", () => {
  const rows = [
    { code: "individual_1_2", label: "A", price: 250 },
    { code: "small_group_3_9", label: "B", price: 500 },
  ];
  const drafts = {
    individual_1_2: { ...rows[0], price: 300 },
    small_group_3_9: { ...rows[1], price: 550 },
  };
  assert.deepEqual(mergeTariffsIntoDrafts(
    [{ ...rows[0], price: 300 }, rows[1]], drafts, new Set(["small_group_3_9"]),
  ), {
    individual_1_2: { ...rows[0], price: 300 },
    small_group_3_9: { ...rows[1], price: 550 },
  });
});
