import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { individualTrainingRateKey, mergeIndividualTrainingRatesIntoDrafts } from "../src/pricingDrafts.js";

const priorSql = await readFile(new URL("../supabase/migrations/20261104090000_financial_core_and_booking_tariffs.sql", import.meta.url), "utf8");
const matrixSql = await readFile(new URL("../supabase/migrations/20261105120000_individual_training_rate_matrix.sql", import.meta.url), "utf8");
const scheduleSource = await readFile(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
const pricingSource = await readFile(new URL("../src/components/PricingTab.jsx", import.meta.url), "utf8");

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
    create function public.crm_is_active_trainer_session() returns boolean language sql stable as $$ select auth.uid() is not null $$;
    create function public.crm_canonical_room_name(text) returns text language sql immutable as $$ select lower(btrim($1)) $$;
    create function public.crm_occurrence_removal_signature(date,text,text,text,text,date,text,text) returns text language sql immutable as $$
      select concat_ws('|',$1::text,$2,$3,lower(btrim($4)),$5,$6::text,$7,$8)
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
    create table public.studio_room_booking_trainer_exceptions(room_id uuid references public.studio_rooms(id), trainer_id uuid references public.trainers(id));
    create function public.crm_fetch_studio_rooms(boolean default false) returns table(id uuid) language sql as $$ select null::uuid where false $$;
    insert into studio_rooms(name,sort_order) values ('Зал 1',10),('Зал 2',20),('Зал 3',30);
  `);
  await db.exec(priorSql);
  await db.exec(matrixSql);
  return db;
}

test("matrix seeds every room UUID and people range with the requested starting rates", async () => {
  const db = await database();
  try {
    const rows = (await db.query(`
      select room.name, rate.people_range_code, rate.hourly_rate_uah
      from individual_training_room_rates rate join studio_rooms room on room.id=rate.room_id
      order by room.sort_order, rate.people_range_code
    `)).rows;
    const byRoom = Object.groupBy(rows, (row) => row.name);
    assert.deepEqual(Object.fromEntries(Object.entries(byRoom).map(([name, rates]) => [name, Object.fromEntries(rates.map((rate) => [rate.people_range_code, rate.hourly_rate_uah]))])), {
      "Зал 1": { group_10_plus: 800, individual_1_2: 500, small_group_3_9: 650 },
      "Зал 2": { group_10_plus: 500, individual_1_2: 250, small_group_3_9: 350 },
      "Зал 3": { group_10_plus: 500, individual_1_2: 250, small_group_3_9: 350 },
    });
    assert.equal(new Set(rows.map((row) => `${row.name}:${row.people_range_code}`)).size, 9);
  } finally { await db.close(); }
});

test("server snapshots all ranges, rooms and 1h, 1.5h, 2h durations; reserve is free and default is 1–2", async () => {
  const db = await database();
  try {
    const rates = {
      "Зал 1": { individual_1_2: 500, small_group_3_9: 650, group_10_plus: 800 },
      "Зал 2": { individual_1_2: 250, small_group_3_9: 350, group_10_plus: 500 },
      "Зал 3": { individual_1_2: 250, small_group_3_9: 350, group_10_plus: 500 },
    };
    const durations = [{ end: "11:00", hours: 1 }, { end: "11:30", hours: 1.5 }, { end: "12:00", hours: 2 }];
    for (const [room, ranges] of Object.entries(rates)) {
      for (const [range, rate] of Object.entries(ranges)) {
        for (const duration of durations) {
          const row = (await db.query(`insert into room_bookings(start_time,end_time,room_name,event_type,booking_type)
            values ('10:00',$1,$2,'individual_training',$3) returning price`, [duration.end, room, range])).rows[0];
          assert.equal(row.price, Math.round(rate * duration.hours), `${room} ${range} ${duration.hours}h`);
        }
      }
    }
    const defaulted = (await db.query(`insert into room_bookings(start_time,end_time,room_name,event_type)
      values ('10:00','11:00','Зал 1','individual_training') returning booking_type,price`)).rows[0];
    assert.deepEqual(defaulted, { booking_type: "individual_1_2", price: 500 });
    const reserve = (await db.query(`insert into room_bookings(start_time,end_time,room_name,event_type,booking_type,price)
      values ('10:00','12:00','Зал 1','room_booking','group_10_plus',999) returning booking_type,price`)).rows[0];
    assert.deepEqual(reserve, { booking_type: null, price: null });
  } finally { await db.close(); }
});

test("trainer receives no matrix or snapshot price while admin edits rates without repricing history", async () => {
  const db = await database();
  try {
    const roomOneId = (await db.query("select id from studio_rooms where name='Зал 1'")).rows[0].id;
    await db.exec("set app.test_authenticated='on'; set app.test_admin='off'; set role authenticated");
    assert.ok((await db.query("select hourly_rate_uah from crm_fetch_individual_training_rate_matrix()")).rows.every((row) => row.hourly_rate_uah === null));
    await assert.rejects(db.query("select * from individual_training_room_rates"), /permission denied/i);
    await assert.rejects(db.query("select crm_admin_update_individual_training_room_rate($1,'individual_1_2',900)", [roomOneId]), /administrator/i);
    const trainerCreated = (await db.query(`select crm_trainer_create_room_booking(
      '{"date":"2026-11-05","startTime":"09:00","endTime":"10:30","roomName":"Зал 2","eventType":"individual_training","bookingType":"individual_1_2","title":"Trainer event"}'::jsonb
    ) as booking`)).rows[0].booking;
    assert.equal(Object.hasOwn(trainerCreated, "price"), false);
    const trainerCreatedId = trainerCreated.id;

    await db.exec("reset role; set app.test_admin='on'");
    assert.equal((await db.query("select price from room_bookings where id=$1", [trainerCreatedId])).rows[0].price, 375);
    const original = (await db.query(`insert into room_bookings(start_time,end_time,room_name,event_type,booking_type)
      values ('10:00','11:30','Зал 2','individual_training','individual_1_2') returning id,price`)).rows[0];
    assert.equal(original.price, 375);
    await db.query("select crm_admin_update_individual_training_room_rate((select id from studio_rooms where name='Зал 2'),'individual_1_2',400)");
    assert.equal((await db.query("select price from room_bookings where id=$1", [original.id])).rows[0].price, 375);
    assert.equal((await db.query(`insert into room_bookings(start_time,end_time,room_name,event_type,booking_type)
      values ('12:00','13:30','Зал 2','individual_training','individual_1_2') returning price`)).rows[0].price, 600);
  } finally { await db.close(); }
});

test("UI exposes only canonical trainer ranges and one admin matrix, with no trainer price editor", () => {
  assert.match(pricingSource, /Тарифи індивідуальних тренувань/);
  assert.doesNotMatch(pricingSource, /Погодинна вартість залів|Типи резерву \/ ціни/);
  assert.match(pricingSource, /individualTrainingRateKey\(room\.roomId, range\.peopleRangeCode\)/);
  assert.match(scheduleSource, /const activeTariffTypes = useMemo\(\(\) => DEFAULT_TYPES\.slice\(1\), \[\]\)/);
  assert.match(scheduleSource, /const defaultType = "individual_1_2"/);
  assert.doesNotMatch(scheduleSource.slice(scheduleSource.indexOf("const DEFAULT_TYPES"), scheduleSource.indexOf("const toLocalDateKey")), /price\s*:/);
  assert.match(scheduleSource, /aria-label="Розрахована сума"[\s\S]*readOnly/);
  assert.doesNotMatch(scheduleSource, /placeholder="К-ть людей"/);
  assert.doesNotMatch(scheduleSource, /Погодинний тариф \$\{room\.name\}/);
});

test("matrix drafts are keyed per room and range and preserve other unsaved cells", () => {
  const rates = [
    { roomId: "room-a", peopleRangeCode: "individual_1_2", hourlyRateUah: 500 },
    { roomId: "room-b", peopleRangeCode: "individual_1_2", hourlyRateUah: 250 },
  ];
  const roomA = individualTrainingRateKey("room-a", "individual_1_2");
  const roomB = individualTrainingRateKey("room-b", "individual_1_2");
  assert.notEqual(roomA, roomB);
  assert.deepEqual(mergeIndividualTrainingRatesIntoDrafts(
    rates.map((rate) => rate.roomId === "room-a" ? { ...rate, hourlyRateUah: 600 } : rate),
    { [roomA]: "600", [roomB]: "375" },
    new Set([roomB]),
  ), { [roomA]: "600", [roomB]: "375" });
  assert.match(pricingSource, /const isSavingCell = saving === `matrix:\$\{key\}`/);
  assert.match(pricingSource, /disabled=\{isSavingCell\} value=\{matrixDrafts\[key\]/);
});
