import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { buildIndividualIncomeConfirmation, isValidIndividualIncomeConfirmation, mapPendingIndividualIncome } from '../src/individualIncome.js';
import { buildCanonicalRevenueEntries, upsertPostedFinancialTransaction } from '../src/revenue.js';

const coreSql = await readFile(new URL('../supabase/migrations/20261104090000_financial_core_and_booking_tariffs.sql', import.meta.url), 'utf8');
const matrixSql = await readFile(new URL('../supabase/migrations/20261105120000_individual_training_rate_matrix.sql', import.meta.url), 'utf8');
const incomeSql = await readFile(new URL('../supabase/migrations/20261105150000_individual_training_income_confirmation.sql', import.meta.url), 'utf8');
const rentalSql = await readFile(new URL('../supabase/migrations/20261109120000_room_rental_pending_income.sql', import.meta.url), 'utf8');
const dbSource = await readFile(new URL('../src/db.js', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const dashboardSource = await readFile(new URL('../src/components/DashboardTab.jsx', import.meta.url), 'utf8');

async function database({ beforeIncome, beforeRental } = {}) {
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
    create function public.crm_schedule_booking_occurs_on(date,date,text) returns boolean language sql immutable as $$
      select $2 >= $1 and case lower(coalesce($3,'none')) when 'daily' then true when 'weekly' then (($2-$1)%7)=0 when 'monthly' then extract(day from $2)=extract(day from $1) else $2=$1 end
    $$;
    create function public.crm_schedule_booking_step_date(date,text,integer) returns date language sql immutable as $$
      select case lower(coalesce($2,'none')) when 'daily' then $1+$3 when 'monthly' then ($1+($3||' month')::interval)::date else $1+(7*$3) end
    $$;
    create function public.crm_schedule_booking_update_only_shrinks(date,date,date,date,text) returns boolean language sql immutable as $$
      select $3 >= $1 and ($2 is null or ($4 is not null and $4 <= $2)) and ($3 > $1 or $4 is distinct from $2)
    $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create table public.attendance(id uuid primary key);
    create table public.room_bookings(
      id uuid primary key default gen_random_uuid(), date date, start_time text, end_time text,
      trainer_id text, trainer_name text, title text, type text, room_name text,
      event_type text, booking_type text, people_count integer, price integer,
      payment_method text, note text, color text, recurrence text default 'none',
      recurrence_until date, description text, status text default 'active', created_at timestamptz default now()
    );
    create table public.trainers(id uuid primary key, auth_user_id uuid, is_active boolean default true, archived_at timestamptz, access_disabled_at timestamptz);
    create table public.studio_rooms(id uuid primary key default gen_random_uuid(), name text, is_active boolean default true, booking_open boolean default true, sort_order integer default 0, created_at timestamptz default now());
    create table public.studio_room_booking_trainer_exceptions(room_id uuid references public.studio_rooms(id), trainer_id uuid references public.trainers(id));
    create function public.crm_fetch_studio_rooms(boolean default false) returns table(id uuid) language sql as $$ select null::uuid where false $$;
    insert into studio_rooms(name,sort_order) values ('Зал 1',10),('Зал 2',20),('Зал 3',30);
  `);
  await db.exec(coreSql);
  await db.exec(matrixSql);
  await db.exec(`
    set app.test_authenticated='on'; set app.test_admin='off';
    insert into trainers(id,auth_user_id) values ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');
    insert into trainer_financial_settings(trainer_id,individual_income_enabled,trainer_share_uah)
      values ('20000000-0000-0000-0000-000000000001',true,0);
  `);
  if (beforeIncome) await beforeIncome(db);
  await db.exec(incomeSql);
  if (beforeRental) await beforeRental(db);
  await db.exec(rentalSql);
  return db;
}

const insertIndividual = (db, extra = '') => db.query(`
  insert into room_bookings(date,start_time,end_time,room_name,event_type,booking_type,people_count,title,trainer_id,trainer_name,status${extra ? ',recurrence,recurrence_until' : ''})
  values ('2026-11-10','10:00','11:00','Зал 2','individual_training','individual_1_2',2,'Персональне','20000000-0000-0000-0000-000000000001','Костя','active'${extra}) returning *
`);

test('new individual booking creates one pending room rental for any trainer while reserve creates none', async () => {
  const db = await database();
  try {
    await insertIndividual(db);
    assert.deepEqual((await db.query(`select category_code,status,amount_uah::text amount,trainer_share_uah::text share,occurrence_date::text,event_title_snapshot,people_count_snapshot from financial_operations`)).rows, [{
      category_code: 'room_rental', status: 'pending', amount: '250.00', share: '0.00', occurrence_date: '2026-11-10', event_title_snapshot: 'Персональне', people_count_snapshot: 2,
    }]);
    await db.exec(`insert into trainers(id,auth_user_id) values ('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002');
      insert into trainer_financial_settings(trainer_id,individual_income_enabled) values ('20000000-0000-0000-0000-000000000002',false);
      insert into room_bookings(date,start_time,end_time,room_name,event_type,booking_type,people_count,title,trainer_id,status)
      values ('2026-11-12','12:00','13:00','Зал 2','individual_training','individual_1_2',1,'Будь-який тренер','20000000-0000-0000-0000-000000000002','active')`);
    assert.equal((await db.query("select count(*)::int count from financial_operations where category_code='room_rental'")).rows[0].count, 2);
    await db.exec(`insert into room_bookings(date,start_time,end_time,room_name,event_type,title,trainer_id,status) values ('2026-11-11','10:00','11:00','Зал 2','room_booking','Резерв','20000000-0000-0000-0000-000000000001','active')`);
    assert.equal((await db.query('select count(*)::int count from financial_operations')).rows[0].count, 2);
  } finally { await db.close(); }
});

test('room-rental migration does not backfill an existing booking', async () => {
  let historicalId;
  const db = await database({ beforeRental: async (databaseClient) => {
    await databaseClient.exec('alter table room_bookings disable trigger room_bookings_sync_individual_income');
    historicalId = (await databaseClient.query(`insert into room_bookings(date,start_time,end_time,room_name,event_type,booking_type,title,trainer_id,status)
      values ('2026-11-01','10:00','11:00','Зал 2','individual_training','individual_1_2','До PR','20000000-0000-0000-0000-000000000001','active') returning id`)).rows[0].id;
    await databaseClient.exec('alter table room_bookings enable trigger room_bookings_sync_individual_income');
  }});
  try {
    assert.equal((await db.query('select room_rental_finance_enabled from room_bookings where id=$1', [historicalId])).rows[0].room_rental_finance_enabled, false);
    await db.exec("set app.test_admin='on'");
    await db.query('select * from crm_fetch_pending_individual_income()');
    assert.equal((await db.query('select count(*)::int count from financial_operations where room_booking_id=$1', [historicalId])).rows[0].count, 0);
  } finally { await db.close(); }
});

test('room-rental migration leaves legacy finance untouched without weakening new-booking guard', async () => {
  let historicalId;
  const db = await database({ beforeIncome: async (databaseClient) => {
    await databaseClient.exec(`
      create or replace function public.crm_enforce_studio_room_booking_open()
      returns trigger language plpgsql security definer set search_path=public as $$
      begin
        if coalesce(new.status,'active')='cancelled' then return new; end if;
        if exists(select 1 from studio_rooms room where room.is_active and not room.booking_open
          and crm_canonical_room_name(room.name)=crm_canonical_room_name(new.room_name)) then
          raise exception 'Цей зал тимчасово недоступний для бронювання. Оберіть інший зал.' using errcode='P0001';
        end if;
        return new;
      end $$;
      create trigger trg_enforce_studio_room_booking_open before insert or update on room_bookings
        for each row execute function crm_enforce_studio_room_booking_open();
    `);
    historicalId = (await databaseClient.query(`insert into room_bookings(date,start_time,end_time,room_name,event_type,booking_type,title,trainer_id,status)
      values ('2026-11-05','10:00','11:00','Зал 2','individual_training','individual_1_2','Historical','20000000-0000-0000-0000-000000000001','active') returning id`)).rows[0].id;
    await databaseClient.exec("update studio_rooms set booking_open=false where name='Зал 2'");
  }});
  try {
    assert.deepEqual((await db.query('select status,amount_uah::text amount from financial_operations where room_booking_id=$1', [historicalId])).rows, [
      { status: 'pending', amount: '250.00' },
    ]);
    await assert.rejects(db.exec(`insert into room_bookings(date,start_time,end_time,room_name,event_type,booking_type,title,trainer_id,status)
      values ('2026-11-06','12:00','13:00','Зал 2','individual_training','individual_1_2','Blocked','20000000-0000-0000-0000-000000000001','active')`), /тимчасово недоступний/i);
    await assert.rejects(db.query("update room_bookings set start_time='10:30' where id=$1", [historicalId]), /тимчасово недоступний/i);
    await db.query("update room_bookings set status='cancelled' where id=$1", [historicalId]);
    assert.deepEqual((await db.query('select category_code,status from financial_operations where room_booking_id=$1', [historicalId])).rows, [
      { category_code: 'individual_training', status: 'voided' },
    ]);
  } finally { await db.close(); }
});

test('trainer is redacted and cannot read, create or confirm finance operations', async () => {
  const db = await database();
  try {
    const booking = (await db.query(`select crm_trainer_create_room_booking('{"date":"2026-11-12","startTime":"10:00","endTime":"11:00","roomName":"Зал 2","eventType":"individual_training","bookingType":"individual_1_2","peopleCount":"1","title":"Own"}'::jsonb) value`)).rows[0].value;
    assert.equal(Object.hasOwn(booking, 'price'), false);
    assert.equal(Object.hasOwn(booking, 'payment_method'), false);
    await db.exec('set role authenticated');
    assert.deepEqual((await db.query('select * from financial_operations')).rows, []);
    await assert.rejects(db.query('select * from crm_fetch_pending_individual_income()'), /administrator/i);
    await assert.rejects(db.query(`select crm_admin_confirm_individual_income((select id from financial_operations limit 1),250,'cash','2026-11-12')`), /administrator|row-level security/i);
  } finally { await db.close(); }
});

test('admin posts cash/card, can correct amount, and posted snapshots never change', async () => {
  const db = await database();
  try {
    const first = (await insertIndividual(db)).rows[0];
    const firstOperation = (await db.query('select id from financial_operations where room_booking_id=$1', [first.id])).rows[0];
    await db.exec("set app.test_admin='on'");
    await db.query("select crm_admin_confirm_individual_income($1,300,'cash','2026-11-05')", [firstOperation.id]);
    await db.query("update room_bookings set title='Змінено',room_name='Зал 1',people_count=10,start_time='12:00' where id=$1", [first.id]);
    assert.deepEqual((await db.query('select status,amount_uah::text amount,payment_method_code,operation_date::text,event_title_snapshot,room_name_snapshot,event_start_time_snapshot from financial_operations where id=$1', [firstOperation.id])).rows, [{
      status: 'posted', amount: '300.00', payment_method_code: 'cash', operation_date: '2026-11-05', event_title_snapshot: 'Персональне', room_name_snapshot: 'Зал 2', event_start_time_snapshot: '10:00',
    }]);
    const second = (await db.query(`insert into room_bookings(date,start_time,end_time,room_name,event_type,booking_type,people_count,title,trainer_id,trainer_name,status) values ('2026-11-13','10:00','11:00','Зал 2','individual_training','individual_1_2',1,'Card','20000000-0000-0000-0000-000000000001','Костя','active') returning id`)).rows[0];
    await db.query("select crm_admin_confirm_individual_income((select id from financial_operations where room_booking_id=$1),250,'card','2026-11-06')", [second.id]);
    assert.equal((await db.query("select payment_method_code from financial_operations where room_booking_id=$1", [second.id])).rows[0].payment_method_code, 'card');
  } finally { await db.close(); }
});

test('cancellation voids pending but never posted, and duplicate reconciliation is idempotent', async () => {
  const db = await database();
  try {
    const pending = (await insertIndividual(db)).rows[0];
    await db.query("update room_bookings set status='cancelled' where id=$1", [pending.id]);
    assert.equal((await db.query('select status from financial_operations where room_booking_id=$1', [pending.id])).rows[0].status, 'voided');
    const posted = (await db.query(`insert into room_bookings(date,start_time,end_time,room_name,event_type,booking_type,title,trainer_id,status) values ('2026-11-14','10:00','11:00','Зал 2','individual_training','individual_1_2','Posted','20000000-0000-0000-0000-000000000001','active') returning id`)).rows[0];
    await db.exec("set app.test_admin='on'");
    await db.query("select crm_admin_confirm_individual_income((select id from financial_operations where room_booking_id=$1),250,'cash','2026-11-05')", [posted.id]);
    await db.query("update room_bookings set status='cancelled' where id=$1", [posted.id]);
    assert.equal((await db.query('select status from financial_operations where room_booking_id=$1', [posted.id])).rows[0].status, 'posted');
    await db.query('select crm_reconcile_individual_training_income($1)', [posted.id]);
    assert.equal((await db.query(`select count(*)::int count from financial_operations where occurrence_date='2026-11-14'`)).rows[0].count, 1);
  } finally { await db.close(); }
});

test('recurring occurrences get separate operations and partial removal affects only one', async () => {
  const db = await database();
  try {
    const series = (await insertIndividual(db, ",'weekly','2026-11-24'")).rows[0];
    assert.deepEqual((await db.query('select occurrence_date::text,status from financial_operations order by occurrence_date')).rows, [
      { occurrence_date: '2026-11-10', status: 'pending' }, { occurrence_date: '2026-11-17', status: 'pending' }, { occurrence_date: '2026-11-24', status: 'pending' },
    ]);
    await db.query("select crm_remove_room_booking_occurrence($1,'2026-11-17')", [series.id]);
    assert.deepEqual((await db.query("select occurrence_date::text,status from financial_operations where status in ('pending','posted') order by occurrence_date")).rows, [
      { occurrence_date: '2026-11-10', status: 'pending' }, { occurrence_date: '2026-11-24', status: 'pending' },
    ]);
    assert.equal((await db.query("select count(*)::int count from financial_operations where occurrence_date='2026-11-17' and status='voided'")).rows[0].count, 1);
  } finally { await db.close(); }
});

test('finite weekly series stops at its inclusive end and never emits the next occurrence', async () => {
  const db = await database();
  try {
    await insertIndividual(db, ",'weekly','2026-11-20'");
    assert.deepEqual((await db.query('select occurrence_date::text from financial_operations order by occurrence_date')).rows, [
      { occurrence_date: '2026-11-10' }, { occurrence_date: '2026-11-17' },
    ]);
    assert.equal((await db.query("select count(*)::int count from financial_operations where occurrence_date > '2026-11-20'")).rows[0].count, 0);
  } finally { await db.close(); }
});

test('open daily series keeps a rolling 30-day horizon, extends safely, and never duplicates an active occurrence', async () => {
  const db = await database();
  try {
    const booking = (await db.query(`insert into room_bookings(date,start_time,end_time,room_name,event_type,booking_type,people_count,title,trainer_id,trainer_name,status,recurrence,recurrence_until)
      values (current_date,'10:00','11:00','Зал 2','individual_training','individual_1_2',1,'Open','20000000-0000-0000-0000-000000000001','Костя','active','daily',null) returning id`)).rows[0];
    assert.deepEqual((await db.query(`select count(*)::int count,min(occurrence_date-current_date)::int min_day,max(occurrence_date-current_date)::int max_day
      from financial_operations where status in ('pending','posted')`)).rows[0], { count: 30, min_day: 0, max_day: 29 });

    await db.query('select crm_reconcile_individual_training_income($1,current_date)', [booking.id]);
    await db.query('select crm_reconcile_individual_training_income($1,current_date)', [booking.id]);
    assert.equal((await db.query("select count(*)::int count from financial_operations where status in ('pending','posted')")).rows[0].count, 30);

    await db.query('select crm_reconcile_individual_training_income($1,current_date+15)', [booking.id]);
    await db.query('select crm_reconcile_individual_training_income($1,current_date+15)', [booking.id]);
    assert.deepEqual((await db.query(`select count(*)::int count,max(occurrence_date-current_date)::int max_day
      from financial_operations where status in ('pending','posted')`)).rows[0], { count: 45, max_day: 44 });
    assert.equal((await db.query(`select count(*)::int count from (
      select room_booking_series_id,occurrence_date from financial_operations where status in ('pending','posted')
      group by room_booking_series_id,occurrence_date having count(*)>1
    ) duplicates`)).rows[0].count, 0);
  } finally { await db.close(); }
});

test('admin pending-list load reconciles an open series back to its 30-day horizon', async () => {
  const db = await database();
  try {
    await db.exec(`insert into room_bookings(date,start_time,end_time,room_name,event_type,booking_type,title,trainer_id,status,recurrence)
      values (current_date,'10:00','11:00','Зал 2','individual_training','individual_1_2','Open fetch','20000000-0000-0000-0000-000000000001','active','daily');
      update financial_operations set status='voided' where occurrence_date=current_date+29; set app.test_admin='on';`);
    await db.query('select * from crm_fetch_pending_individual_income()');
    assert.equal((await db.query("select count(*)::int count from financial_operations where status in ('pending','posted')")).rows[0].count, 30);
    assert.equal((await db.query("select count(*)::int count from financial_operations where occurrence_date=current_date+29 and status='pending'")).rows[0].count, 1);
  } finally { await db.close(); }
});

test('delete cancels financially linked bookings, voids pending, preserves posted, and still physically deletes reserve', async () => {
  const db = await database();
  try {
    const pending = (await insertIndividual(db)).rows[0];
    await db.exec("set app.test_admin='on'");
    const pendingDelete = (await db.query('select crm_admin_delete_room_booking($1) result', [pending.id])).rows[0].result;
    assert.equal(pendingDelete.cancelled, true);
    assert.equal((await db.query('select status from room_bookings where id=$1', [pending.id])).rows[0].status, 'cancelled');
    assert.equal((await db.query('select status from financial_operations where room_booking_id=$1', [pending.id])).rows[0].status, 'voided');

    await db.exec("set app.test_admin='off'");
    const posted = (await db.query(`insert into room_bookings(date,start_time,end_time,room_name,event_type,booking_type,title,trainer_id,status)
      values ('2026-11-15','10:00','11:00','Зал 2','individual_training','individual_1_2','Posted delete','20000000-0000-0000-0000-000000000001','active') returning id`)).rows[0];
    await db.exec("set app.test_admin='on'");
    await db.query("select crm_admin_confirm_individual_income((select id from financial_operations where room_booking_id=$1),250,'card','2026-11-05')", [posted.id]);
    await db.query('select crm_admin_delete_room_booking($1)', [posted.id]);
    assert.equal((await db.query('select status from room_bookings where id=$1', [posted.id])).rows[0].status, 'cancelled');
    assert.equal((await db.query('select status from financial_operations where room_booking_id=$1', [posted.id])).rows[0].status, 'posted');

    const reserve = (await db.query(`insert into room_bookings(date,start_time,end_time,room_name,event_type,title,trainer_id,status)
      values ('2026-11-16','10:00','11:00','Зал 2','room_booking','Reserve delete','20000000-0000-0000-0000-000000000001','active') returning id`)).rows[0];
    const reserveDelete = (await db.query('select crm_admin_delete_room_booking($1) result', [reserve.id])).rows[0].result;
    assert.equal(reserveDelete.deleted, true);
    assert.equal((await db.query('select count(*)::int count from room_bookings where id=$1', [reserve.id])).rows[0].count, 0);

    await db.exec("set app.test_admin='off'");
    const trainerOwned = (await db.query(`insert into room_bookings(date,start_time,end_time,room_name,event_type,booking_type,title,trainer_id,status)
      values ('2026-11-18','10:00','11:00','Зал 2','individual_training','individual_1_2','Trainer delete','20000000-0000-0000-0000-000000000001','active') returning id`)).rows[0];
    const trainerDelete = (await db.query("select crm_trainer_mutate_room_booking($1,'delete') result", [trainerOwned.id])).rows[0].result;
    assert.equal(trainerDelete.cancelled, true);
    assert.equal(Object.hasOwn(trainerDelete, 'price'), false);
    assert.equal((await db.query('select status from room_bookings where id=$1', [trainerOwned.id])).rows[0].status, 'cancelled');
  } finally { await db.close(); }
});

test('partial recurring cancellation preserves a posted target and leaves other occurrences pending', async () => {
  const db = await database();
  try {
    const series = (await insertIndividual(db, ",'weekly','2026-11-24'")).rows[0];
    await db.exec("set app.test_admin='on'");
    await db.query("select crm_admin_confirm_individual_income((select id from financial_operations where occurrence_date='2026-11-17'),250,'cash','2026-11-05')");
    await db.query("select crm_remove_room_booking_occurrence($1,'2026-11-17')", [series.id]);
    assert.deepEqual((await db.query("select occurrence_date::text,status from financial_operations where status in ('pending','posted') order by occurrence_date")).rows, [
      { occurrence_date: '2026-11-10', status: 'pending' }, { occurrence_date: '2026-11-17', status: 'posted' }, { occurrence_date: '2026-11-24', status: 'pending' },
    ]);
  } finally { await db.close(); }
});

test('client confirmation defaults to today and validates only cash/card with editable amount', () => {
  assert.deepEqual(buildIndividualIncomeConfirmation({ amountUah: 250 }, '2026-11-05'), { amountUah: '250', paymentMethod: 'cash', operationDate: '2026-11-05' });
  assert.equal(isValidIndividualIncomeConfirmation({ amountUah: '300.50', paymentMethod: 'card', operationDate: '2026-11-06' }), true);
  assert.equal(isValidIndividualIncomeConfirmation({ amountUah: '250', paymentMethod: 'transfer', operationDate: '2026-11-06' }), false);
  assert.match(dbSource, /delete safePayload\.price;[\s\S]*delete safePayload\.paymentMethod/);
  assert.match(dbSource, /crm_admin_delete_room_booking/);
  assert.match(appSource, /if \(result\?\.cancelled\)[\s\S]*status: "cancelled"/);
  assert.match(appSource, /<PendingIndividualIncome/);
});

test('dashboard includes posted room rental once in its card and gross revenue', () => {
  const entries = buildCanonicalRevenueEntries([
    { id: 'subscription', paid: true, amount: 1000, startDate: '2026-11-01' },
  ], [
    { id: 'rental', categoryCode: 'room_rental', direction: 'income', status: 'posted', amountUah: 250, operationDate: '2026-11-02' },
  ]);
  assert.equal(entries.reduce((sum, row) => sum + row.amount, 0), 1250);
  assert.equal(entries.filter((row) => row.categoryCode === 'room_rental').length, 1);
  assert.match(dashboardSource, /data-dashboard-room-rental/);
  assert.match(dashboardSource, /roomRentalRevenue/);
});

test('successful confirmation immediately updates posted canonical revenue without reload', () => {
  const posted = {
    id: 'rental-confirmed', categoryCode: 'room_rental', direction: 'income',
    status: 'posted', amountUah: 325, operationDate: '2026-11-09', paymentMethod: 'card',
  };
  const localPosted = upsertPostedFinancialTransaction([], posted);
  const entries = buildCanonicalRevenueEntries([], localPosted);
  assert.equal(localPosted.length, 1);
  assert.equal(entries.reduce((sum, row) => sum + row.amount, 0), 325);
  assert.equal(upsertPostedFinancialTransaction(localPosted, posted).length, 1, 'same operation is never duplicated');
  assert.match(appSource, /const postedOperation = await db\.confirmIndividualIncome\(row\.id, payload\);[\s\S]*setPostedOneOffIncome/);
  assert.match(dbSource, /return mapPostedIncome\(row \|\| \{\}\)/);
});

test('admin reversals preserve rental history and bookings, exclude voids from totals, and reject trainers', async () => {
  const db = await database();
  try {
    const manualSql = await readFile(new URL('../supabase/migrations/20261110120000_admin_manual_financial_operations.sql', import.meta.url), 'utf8');
    const reversalSql = await readFile(new URL('../supabase/migrations/20261110130000_financial_operation_reversal.sql', import.meta.url), 'utf8');
    await db.exec(manualSql);
    await db.exec(reversalSql);
    const a = (await insertIndividual(db)).rows[0];
    const b = (await insertIndividual(db)).rows[0];
    await db.exec("set app.test_admin='on'");
    const pending = (await db.query('select * from financial_operations where room_booking_id=$1', [a.id])).rows[0];
    const posted = (await db.query('select * from financial_operations where room_booking_id=$1', [b.id])).rows[0];
    await db.query("select crm_admin_confirm_individual_income($1,345,'card','2026-11-09')", [posted.id]);
    await db.query("select crm_admin_change_financial_operation_status($1,'void')", [pending.id]);
    await db.query("select crm_admin_change_financial_operation_status($1,'unconfirm')", [posted.id]);
    await db.query('select * from crm_fetch_pending_individual_income()');
    const rows = (await db.query('select * from financial_operations where id in ($1,$2) order by status', [pending.id, posted.id])).rows;
    const restored = rows.find(row => row.id === posted.id);
    assert.equal(restored.status, 'pending');
    assert.equal(Number(restored.amount_uah), 345);
    assert.equal(new Date(restored.operation_date).toISOString().slice(0, 10), '2026-11-09');
    assert.equal(rows.find(row => row.id === pending.id).status, 'voided');
    assert.equal((await db.query('select count(*)::int n from financial_operations where room_booking_id=$1', [a.id])).rows[0].n, 1);
    assert.equal((await db.query('select count(*)::int n from room_bookings where id in ($1,$2)', [a.id,b.id])).rows[0].n, 2);
    assert.equal((await db.query("select count(*)::int n from financial_operations where status='posted' and id in ($1,$2)", [pending.id,posted.id])).rows[0].n, 0);
    assert.deepEqual((await db.query('select id from crm_fetch_pending_individual_income() where id in ($1,$2)', [pending.id,posted.id])).rows.map(row => row.id), [posted.id]);
    const pendingRow = (await db.query('select * from crm_fetch_pending_individual_income() where id=$1', [posted.id])).rows[0];
    const localPending = mapPendingIndividualIncome({ ...pendingRow, operation_date: new Date(pendingRow.operation_date).toISOString().slice(0, 10) });
    const draft = buildIndividualIncomeConfirmation(localPending, '2026-11-20');
    assert.deepEqual(draft, { amountUah: '345', paymentMethod: 'card', operationDate: '2026-11-09' });
    const reconfirmed = (await db.query('select * from crm_admin_confirm_individual_income($1,$2,$3,$4)',
      [posted.id, Number(draft.amountUah), draft.paymentMethod, draft.operationDate])).rows[0];
    assert.equal(reconfirmed.status, 'posted');
    assert.equal(reconfirmed.payment_method_code, 'card');
    assert.equal(new Date(reconfirmed.operation_date).toISOString().slice(0, 10), '2026-11-09');
    assert.deepEqual(buildIndividualIncomeConfirmation(mapPendingIndividualIncome({ amount_uah: 250, operation_date: '2026-11-01' }), '2026-11-20'),
      { amountUah: '250', paymentMethod: 'cash', operationDate: '2026-11-20' });
    const manual = [];
    for (const [direction, category] of [['income','manual_income'], ['expense','manual_expense'], ['income','room_rental']]) {
      const row = (await db.query("select * from crm_admin_create_manual_financial_operation($1,$2,200,current_date,'cash','posted',null)", [direction,category])).rows[0];
      manual.push((await db.query("select * from crm_admin_change_financial_operation_status($1,'void')", [row.id])).rows[0]);
    }
    const mapped = manual.map(row => ({ ...row, categoryCode: row.category_code, amountUah: Number(row.amount_uah), operationDate: '2026-11-10' }));
    assert.deepEqual(buildCanonicalRevenueEntries([], mapped), []);
    const { manualExpenseTotalForRange } = await import('../src/manualFinancialOperations.js');
    assert.equal(manualExpenseTotalForRange(mapped, '2026-11-01', '2026-11-30'), 0);
    assert.equal((await db.query("select count(*)::int n from crm_admin_fetch_manual_financial_operations() where status='voided'")).rows[0].n, 3);
    await db.exec("set app.test_admin='off'; set role authenticated");
    await assert.rejects(db.query("select crm_admin_change_financial_operation_status($1,'void')", [posted.id]), /Only an administrator/);
    await assert.rejects(db.query("select crm_admin_change_financial_operation_status($1,'unconfirm')", [posted.id]), /Only an administrator/);
    await assert.rejects(db.query('select * from crm_admin_fetch_posted_room_rentals()'), /Only an administrator/);
  } finally { await db.close(); }
});
