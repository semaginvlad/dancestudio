import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { buildCanonicalRevenueEntries } from '../src/revenue.js';
import { manualExpenseTotalForRange, withoutManualDuplicates } from '../src/manualFinancialOperations.js';

const coreSql = await readFile(new URL('../supabase/migrations/20261104090000_financial_core_and_booking_tariffs.sql', import.meta.url), 'utf8');
const migrationSql = await readFile(new URL('../supabase/migrations/20261110120000_admin_manual_financial_operations.sql', import.meta.url), 'utf8');

async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select case when current_setting('app.test_authenticated',true)='on' then '00000000-0000-0000-0000-000000000001'::uuid else null end $$;
    create function public.crm_is_admin_session() returns boolean language sql stable as $$ select auth.uid() is not null and current_setting('app.test_admin',true)='on' $$;
    create function public.crm_is_active_trainer_session() returns boolean language sql stable as $$ select auth.uid() is not null $$;
    create table attendance(id uuid primary key); create table room_bookings(
      id uuid primary key default gen_random_uuid(), date date, start_time text, end_time text,
      trainer_id text, trainer_name text, title text, type text, room_name text,
      event_type text, booking_type text, people_count integer, price integer,
      payment_method text, note text, color text, recurrence text default 'none',
      recurrence_until date, description text, status text default 'active', created_at timestamptz default now()
    );
    create table trainers(id uuid primary key, auth_user_id uuid, is_active boolean default true, archived_at timestamptz, access_disabled_at timestamptz); create table studio_rooms(id uuid primary key default gen_random_uuid(), name text, is_active boolean default true, booking_open boolean default true, sort_order integer default 0, created_at timestamptz default now());
    create table studio_room_booking_trainer_exceptions(room_id uuid references studio_rooms(id), trainer_id uuid references trainers(id));
    create function crm_fetch_studio_rooms(boolean default false) returns table(id uuid) language sql as $$ select null::uuid where false $$;
    insert into studio_rooms(name,sort_order) values ('Зал 1',1);
  `);
  await db.exec(coreSql);
  await db.exec('alter table financial_operations add column room_booking_series_id uuid');
  await db.exec(migrationSql);
  await db.exec("set app.test_authenticated='on'; set app.test_admin='on'");
  return db;
}

const createManual = (db, direction, category, amount, status = 'posted') => db.query(
  `select (crm_admin_create_manual_financial_operation($1,$2,$3,'2026-11-10','cash',$4,'test')).*`,
  [direction, category, amount, status],
);

test('posted manual room rental counts exactly once in rental and total income', async () => {
  const db = await database();
  try {
    const operation = (await createManual(db, 'income', 'room_rental', 700)).rows[0];
    const rows = buildCanonicalRevenueEntries([], [{ ...operation, categoryCode: operation.category_code, amountUah: Number(operation.amount_uah), operationDate: String(operation.operation_date), direction: operation.direction, status: operation.status }]);
    assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), 700);
    assert.equal(rows.filter((row) => row.categoryCode === 'room_rental').reduce((sum, row) => sum + row.amount, 0), 700);
  } finally { await db.close(); }
});

test('pending manual income is excluded from dashboard totals', async () => {
  const db = await database();
  try {
    const operation = (await createManual(db, 'income', 'manual_income', 500, 'pending')).rows[0];
    assert.deepEqual(buildCanonicalRevenueEntries([], [{ ...operation, categoryCode: operation.category_code, amountUah: 500, operationDate: '2026-11-10' }]), []);
  } finally { await db.close(); }
});

test('posted expense is separate and reduces net result', async () => {
  const db = await database();
  try {
    const operation = (await createManual(db, 'expense', 'manual_expense', 300)).rows[0];
    const expense = { ...operation, amountUah: Number(operation.amount_uah), operationDate: '2026-11-10' };
    assert.equal(manualExpenseTotalForRange([expense], '2026-11-01', '2026-11-30'), 300);
    assert.equal(1000 - manualExpenseTotalForRange([expense], '2026-11-01', '2026-11-30'), 700);
  } finally { await db.close(); }
});

test('trainer cannot create or read manual operations', async () => {
  const db = await database();
  try {
    await db.exec("set app.test_admin='off'; set role authenticated");
    await assert.rejects(createManual(db, 'income', 'manual_income', 100), /Only an administrator/);
    await assert.rejects(db.query('select * from crm_admin_fetch_manual_financial_operations()'), /Only an administrator/);
  } finally { await db.close(); }
});

test('automatic PR 457 rental is not duplicated by manual journal aggregation', () => {
  const automatic = [{ id: 'auto', categoryCode: 'room_rental', direction: 'income', status: 'posted', amountUah: 400, operationDate: '2026-11-10', roomBookingId: 'booking' }];
  const manual = [{ id: 'manual', categoryCode: 'room_rental', direction: 'income', status: 'posted', amountUah: 600, operationDate: '2026-11-10' }];
  const staleAutomaticFeed = [...automatic, manual[0]];
  const entries = buildCanonicalRevenueEntries([], [...withoutManualDuplicates(staleAutomaticFeed, manual), ...manual]);
  assert.equal(entries.length, 2);
  assert.equal(entries.reduce((sum, row) => sum + row.amount, 0), 1000);
});
