import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { buildOneOffAttendancePayment, isValidOneOffAttendancePayment } from '../src/oneOffAttendancePayment.js';
import { buildCanonicalRevenueEntries } from '../src/revenue.js';

const coreSql = await readFile(new URL('../supabase/migrations/20261104090000_financial_core_and_booking_tariffs.sql', import.meta.url), 'utf8');
const migrationSql = await readFile(new URL('../supabase/migrations/20261106100000_paid_one_off_attendance_journal.sql', import.meta.url), 'utf8');
const attendanceSource = await readFile(new URL('../src/components/AttendanceTab.jsx', import.meta.url), 'utf8');
const dbSource = await readFile(new URL('../src/db.js', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const dashboardSource = await readFile(new URL('../src/components/DashboardTab.jsx', import.meta.url), 'utf8');

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
    create table subscriptions(
      id uuid primary key default gen_random_uuid(), student_id uuid, group_id text,
      plan_type text, start_date date, end_date date, activation_date date,
      total_trainings integer, used_trainings integer, amount numeric, paid boolean,
      notes text, created_at timestamptz default now()
    );
    create function crm_remove_one_off_payment_if_orphan(p_attendance_id uuid)
    returns void language plpgsql security definer set search_path=public as $$
    begin delete from subscriptions where notes='auto_one_off_from_attendance:'||p_attendance_id::text; end $$;
    create function crm_ensure_one_off_payment_for_attendance(p_attendance_id uuid)
    returns setof subscriptions language plpgsql security definer set search_path=public as $$
    declare v attendance%rowtype; v_sub subscriptions%rowtype;
    begin
      select * into v from attendance where id=p_attendance_id;
      insert into subscriptions(student_id,group_id,plan_type,start_date,end_date,activation_date,total_trainings,used_trainings,amount,paid,notes)
      values(v.student_id,v.group_id,v.entry_type,v.date,v.date,v.date,1,1,v.price_snapshot_uah,true,'auto_one_off_from_attendance:'||v.id::text)
      returning * into v_sub; return next v_sub;
    end $$;
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

test('canonical revenue includes posted trial/single exactly once and retains unrelated legacy subscriptions', async () => {
  const attendanceId = '30000000-0000-0000-0000-000000000001';
  const entries = buildCanonicalRevenueEntries([
    { id: 'pack', paid: true, amount: 1200, groupId: 'group-a', studentId: 's1', startDate: '2026-11-01' },
    { id: 'duplicate-legacy', paid: true, amount: 200, groupId: 'group-a', studentId: 's1', startDate: '2026-11-05', notes: `auto_one_off_from_attendance:${attendanceId}` },
    { id: 'old-legacy', paid: true, amount: 400, groupId: 'group-b', studentId: 's2', startDate: '2026-10-05', notes: 'auto_one_off_from_attendance:30000000-0000-0000-0000-000000000002' },
  ], [{ id: 'journal', categoryCode: 'trial', direction: 'income', status: 'posted', amountUah: 250, operationDate: '2026-11-06', attendanceSourceId: attendanceId, groupId: 'group-a', studentId: 's1' }]);
  assert.equal(entries.reduce((sum, row) => sum + row.amount, 0), 1850);
  assert.equal(entries.filter((row) => row.attendanceSourceId === attendanceId).length, 1);
  assert.equal(entries.filter((row) => row.groupId === 'group-a').reduce((sum, row) => sum + row.amount, 0), 1450);
  assert.match(appSource, /buildCanonicalRevenueEntries\(subs, postedOneOffIncome\)/);
  assert.match(appSource, /currMonthRev = revenueEntries/);
  assert.match(dashboardSource, /revenueRows\.filter/);
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

test('delete keeps legacy cleanup atomic while journal history is only voided', async () => {
  const db = await database();
  try {
    await db.exec(`select set_config('crm.atomic_one_off_attendance','on',false);
      insert into attendance(id,student_id,date,group_id,entry_type,price_snapshot_uah)
      values ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','2026-11-01','group-a','trial',200);
      insert into subscriptions(student_id,group_id,plan_type,start_date,end_date,amount,paid,notes)
      values ('10000000-0000-0000-0000-000000000001','group-a','trial','2026-11-01','2026-11-01',200,true,'auto_one_off_from_attendance:40000000-0000-0000-0000-000000000001');`);
    await db.query("select crm_admin_delete_paid_one_off_attendance('40000000-0000-0000-0000-000000000001')");
    assert.equal((await db.query('select count(*)::int count from subscriptions')).rows[0].count, 0);

    const journal = (await createPaid(db, 'single', 400)).rows[0];
    await db.query('select crm_admin_delete_paid_one_off_attendance($1)', [journal.id]);
    assert.equal((await db.query('select status from financial_operations where attendance_source_id=$1', [journal.id])).rows[0].status, 'voided');
  } finally { await db.close(); }
});

test('guest conversion preserves journal snapshots and creates legacy payment only without a journal', async () => {
  const db = await database();
  try {
    const paidGuest = (await db.query(`select result.* from crm_admin_create_paid_one_off_attendance(
      null,'2026-11-05','group-a','trial',275,'card','2026-11-06','Гостя',1) result`)).rows[0];
    await db.query(`select * from crm_admin_relink_guest_one_off_attendance('group-a','10000000-0000-0000-0000-000000000001',$1)`, [[paidGuest.id]]);
    assert.equal((await db.query('select count(*)::int count from subscriptions')).rows[0].count, 0);
    assert.deepEqual((await db.query('select amount_uah::text amount,payment_method_code,status from financial_operations where attendance_source_id=$1', [paidGuest.id])).rows, [
      { amount: '275.00', payment_method_code: 'card', status: 'posted' },
    ]);
    assert.equal((await db.query('select student_id from attendance where id=$1', [paidGuest.id])).rows[0].student_id, '10000000-0000-0000-0000-000000000001');

    await db.exec(`select set_config('crm.atomic_one_off_attendance','on',false);
      insert into attendance(id,date,guest_name,guest_type,group_id,entry_type,price_snapshot_uah)
      values ('40000000-0000-0000-0000-000000000002','2026-11-02','Legacy','single','group-a','single',400);`);
    await db.query(`select * from crm_admin_relink_guest_one_off_attendance('group-a','10000000-0000-0000-0000-000000000001',array['40000000-0000-0000-0000-000000000002']::uuid[])`);
    assert.equal((await db.query('select count(*)::int count from subscriptions')).rows[0].count, 1);
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

test('atomic insert flag rejects NULL and every value other than on', async () => {
  const db = await database();
  try {
    await db.exec("select set_config('crm.atomic_one_off_attendance','',false)");
    await assert.rejects(db.exec(`insert into attendance(student_id,date,group_id,entry_type) values ('10000000-0000-0000-0000-000000000001','2026-11-05','group-a','trial')`), /requires payment confirmation/i);
    await db.exec("select set_config('crm.atomic_one_off_attendance','off',false)");
    await assert.rejects(db.exec(`insert into attendance(student_id,date,group_id,entry_type) values ('10000000-0000-0000-0000-000000000001','2026-11-05','group-a','single')`), /requires payment confirmation/i);
    assert.match(migrationSql, /current_setting\('crm\.atomic_one_off_attendance', true\) is distinct from 'on'/i);
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
