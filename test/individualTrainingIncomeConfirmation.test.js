import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { buildIndividualIncomeConfirmation, isValidIndividualIncomeConfirmation } from '../src/individualIncome.js';

const coreSql = await readFile(new URL('../supabase/migrations/20261104090000_financial_core_and_booking_tariffs.sql', import.meta.url), 'utf8');
const matrixSql = await readFile(new URL('../supabase/migrations/20261105120000_individual_training_rate_matrix.sql', import.meta.url), 'utf8');
const incomeSql = await readFile(new URL('../supabase/migrations/20261105150000_individual_training_income_confirmation.sql', import.meta.url), 'utf8');
const dbSource = await readFile(new URL('../src/db.js', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');

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
    create function public.crm_schedule_booking_occurs_on(date,date,text) returns boolean language sql immutable as $$
      select $2 >= $1 and case lower(coalesce($3,'none')) when 'daily' then true when 'weekly' then (($2-$1)%7)=0 when 'monthly' then extract(day from $2)=extract(day from $1) else $2=$1 end
    $$;
    create function public.crm_schedule_booking_step_date(date,text,integer) returns date language sql immutable as $$
      select case lower(coalesce($2,'none')) when 'daily' then $1+$3 when 'monthly' then ($1+($3||' month')::interval)::date else $1+(7*$3) end
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
  await db.exec(incomeSql);
  await db.exec(`
    set app.test_authenticated='on'; set app.test_admin='off';
    insert into trainers(id,auth_user_id) values ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');
    insert into trainer_financial_settings(trainer_id,individual_income_enabled,trainer_share_uah)
      values ('20000000-0000-0000-0000-000000000001',true,0);
  `);
  return db;
}

const insertIndividual = (db, extra = '') => db.query(`
  insert into room_bookings(date,start_time,end_time,room_name,event_type,booking_type,people_count,title,trainer_id,trainer_name,status${extra ? ',recurrence,recurrence_until' : ''})
  values ('2026-11-10','10:00','11:00','Зал 2','individual_training','individual_1_2',2,'Персональне','20000000-0000-0000-0000-000000000001','Костя','active'${extra}) returning *
`);

test('enabled individual training creates one pending snapshot while reserve creates none', async () => {
  const db = await database();
  try {
    await insertIndividual(db);
    assert.deepEqual((await db.query(`select status,amount_uah::text amount,trainer_share_uah::text share,occurrence_date::text,event_title_snapshot,people_count_snapshot from financial_operations`)).rows, [{
      status: 'pending', amount: '250.00', share: '0.00', occurrence_date: '2026-11-10', event_title_snapshot: 'Персональне', people_count_snapshot: 2,
    }]);
    await db.exec(`insert into room_bookings(date,start_time,end_time,room_name,event_type,title,trainer_id,status) values ('2026-11-11','10:00','11:00','Зал 2','room_booking','Резерв','20000000-0000-0000-0000-000000000001','active')`);
    assert.equal((await db.query('select count(*)::int count from financial_operations')).rows[0].count, 1);
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
