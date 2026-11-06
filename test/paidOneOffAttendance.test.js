import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { buildOneOffAttendancePayment, isValidOneOffAttendancePayment } from '../src/oneOffAttendancePayment.js';

const coreSql = await readFile(new URL('../supabase/migrations/20261104090000_financial_core_and_booking_tariffs.sql', import.meta.url), 'utf8');
const migrationSql = await readFile(new URL('../supabase/migrations/20261106100000_paid_one_off_attendance_journal.sql', import.meta.url), 'utf8');
const attendanceSource = await readFile(new URL('../src/components/AttendanceTab.jsx', import.meta.url), 'utf8');
const dbSource = await readFile(new URL('../src/db.js', import.meta.url), 'utf8');

async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select case when current_setting('app.test_authenticated', true)='on'
        then '00000000-0000-0000-0000-000000000001'::uuid else null end
    $$;
    create function public.rls_is_admin() returns boolean language sql stable as $$
      select current_setting('app.test_admin', true)='on'
    $$;
    create function public.crm_is_admin_session() returns boolean language sql stable as $$
      select auth.uid() is not null and public.rls_is_admin()
    $$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create function public.crm_is_active_trainer_session() returns boolean language sql stable as $$ select auth.uid() is not null $$;
    create function public.rls_owns_group(text) returns boolean language sql stable as $$ select $1='group-a' $$;
    create table public.attendance(
      id uuid primary key default gen_random_uuid(), sub_id uuid, student_id uuid, date date not null,
      guest_name text, guest_type text, group_id text, quantity integer default 1,
      entry_type text default 'subscription', price_snapshot_uah integer
    );
    create table public.room_bookings(
      id uuid primary key default gen_random_uuid(), date date, start_time text, end_time text,
      trainer_id text, trainer_name text, title text, type text, room_name text,
      event_type text, booking_type text, people_count integer, price integer,
      payment_method text, note text, color text, recurrence text default 'none',
      recurrence_until date, description text, status text default 'active', created_at timestamptz default now()
    );
    create table public.trainers(id uuid primary key, auth_user_id uuid, is_active boolean default true, archived_at timestamptz, access_disabled_at timestamptz);
    create table public.studio_rooms(id uuid primary key default gen_random_uuid(), name text, is_active boolean default true, booking_open boolean default true, sort_order integer default 0, created_at timestamptz default now());
    create table public.studio_room_booking_trainer_exceptions(room_id uuid, trainer_id uuid);
    create function public.crm_fetch_studio_rooms(boolean default false) returns table(id uuid) language sql as $$ select null::uuid where false $$;
    alter table attendance enable row level security;
    create policy attendance_admin_all on attendance for all to authenticated using (crm_is_admin_session()) with check (crm_is_admin_session());
    create policy attendance_trainer_select_own_groups on attendance for select to authenticated using (rls_owns_group(group_id));
    grant select,insert,update,delete on attendance to authenticated;
    create table service_prices(service_code text primary key, price_uah integer);
    insert into service_prices values ('trial',200),('single',400);
  `);
  await db.exec(coreSql);
  await db.exec(migrationSql);
  await db.exec("set app.test_authenticated='on'; set app.test_admin='on'");
  return db;
}

const createPaid = (db, type, amount, method = 'cash', operationDate = '2026-11-06') => db.query(
  `select result.* from crm_admin_create_paid_one_off_attendance(
    '10000000-0000-0000-0000-000000000001','2026-11-05','group-a',$1,$2,$3,$4,null,1
  ) result`, [type, amount, method, operationDate]
);

test('trial and single create posted cash/card snapshots without one-off subscriptions', async () => {
  const db = await database();
  try {
    const trial = (await createPaid(db, 'trial', 200, 'cash')).rows[0];
    const single = (await createPaid(db, 'single', 475, 'card', '2026-11-07')).rows[0];
    assert.equal(trial.entry_type, 'trial');
    assert.equal(single.entry_type, 'single');
    assert.deepEqual((await db.query(`select category_code,amount_uah::text amount,payment_method_code,operation_date::text,status
      from financial_operations order by amount_uah`)).rows, [
      { category_code: 'trial', amount: '200.00', payment_method_code: 'cash', operation_date: '2026-11-06', status: 'posted' },
      { category_code: 'single', amount: '475.00', payment_method_code: 'card', operation_date: '2026-11-07', status: 'posted' },
    ]);
    assert.doesNotMatch(migrationSql, /insert into public\.subscriptions/i);
    assert.match(dbSource, /createPaidOneOffAttendance[\s\S]*crm_admin_create_paid_one_off_attendance/);
  } finally { await db.close(); }
});

test('amount, method and date are validated and an operation failure rolls attendance back atomically', async () => {
  const db = await database();
  try {
    await assert.rejects(createPaid(db, 'trial', 1, 'transfer'), /cash or card/i);
    await db.exec(`create function fail_finance() returns trigger language plpgsql as $$ begin raise exception 'forced finance failure'; end $$;
      create trigger fail_finance before insert on financial_operations for each row execute function fail_finance()`);
    await assert.rejects(createPaid(db, 'trial', 200), /forced finance failure/i);
    assert.equal((await db.query('select count(*)::int count from attendance')).rows[0].count, 0);
    assert.equal((await db.query('select count(*)::int count from financial_operations')).rows[0].count, 0);
  } finally { await db.close(); }
});

test('one attendance has at most one active operation and delete voids instead of deleting history', async () => {
  const db = await database();
  try {
    const attendance = (await createPaid(db, 'trial', 225)).rows[0];
    await assert.rejects(db.query(`insert into financial_operations(category_code,direction,amount_uah,status,payment_method_code,attendance_id,attendance_source_id)
      values ('trial','income',225,'posted','cash',$1,$1)`, [attendance.id]), /unique|duplicate/i);
    await db.query('select crm_admin_delete_paid_one_off_attendance($1)', [attendance.id]);
    assert.equal((await db.query('select count(*)::int count from attendance where id=$1', [attendance.id])).rows[0].count, 0);
    assert.deepEqual((await db.query('select status,attendance_id,attendance_source_id from financial_operations')).rows, [
      { status: 'voided', attendance_id: null, attendance_source_id: attendance.id },
    ]);
  } finally { await db.close(); }
});

test('trainer cannot create or see paid one-off attendance or financial data', async () => {
  const db = await database();
  try {
    await createPaid(db, 'single', 400);
    await db.exec("set app.test_admin='off'; set role authenticated");
    assert.deepEqual((await db.query('select * from attendance')).rows, []);
    assert.deepEqual((await db.query('select * from financial_operations')).rows, []);
    await assert.rejects(createPaid(db, 'trial', 200), /administrator/i);
    await assert.rejects(db.exec(`insert into attendance(student_id,date,group_id,entry_type) values ('10000000-0000-0000-0000-000000000001','2026-11-05','group-a','trial')`), /administrator|row-level security/i);
  } finally { await db.close(); }
});

test('client defaults from service prices, allows manual values and limits payment choices', () => {
  const prices = [{ serviceCode: 'trial', priceUah: 200 }, { serviceCode: 'single', priceUah: 400 }];
  assert.deepEqual(buildOneOffAttendancePayment({ entryType: 'trial', attendanceDate: '2026-11-05', servicePrices: prices }), {
    amountUah: '200', paymentMethod: 'cash', operationDate: '2026-11-05',
  });
  assert.equal(buildOneOffAttendancePayment({ entryType: 'single', attendanceDate: '2026-11-05', servicePrices: prices }).amountUah, '400');
  assert.equal(isValidOneOffAttendancePayment({ amountUah: '450.50', paymentMethod: 'card', operationDate: '2026-11-08' }), true);
  assert.equal(isValidOneOffAttendancePayment({ amountUah: '200', paymentMethod: 'transfer', operationDate: '2026-11-05' }), false);
  assert.match(attendanceSource, /isAdmin && <option value="single">/);
  assert.match(attendanceSource, /requestOneOffPayment/);
});
