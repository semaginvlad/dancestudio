import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migrationSql = await readFile(
  new URL('../supabase/migrations/20261109090000_trainer_read_one_off_attendance.sql', import.meta.url),
  'utf8',
);
const dbSource = await readFile(new URL('../src/db.js', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
const attendanceSource = await readFile(new URL('../src/components/AttendanceTab.jsx', import.meta.url), 'utf8');

async function database() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select case when current_setting('app.authenticated', true) = 'on'
        then '00000000-0000-0000-0000-000000000001'::uuid else null end
    $$;
    create function public.rls_owns_group(text) returns boolean language sql stable as $$
      select auth.uid() is not null and $1 = 'group-owned'
    $$;
    create table public.attendance(
      id uuid primary key,
      sub_id uuid,
      student_id uuid,
      date date not null,
      guest_name text,
      guest_type text,
      group_id text,
      quantity integer default 1,
      entry_type text,
      price_snapshot_uah numeric(12,2)
    );
    insert into public.attendance values
      ('10000000-0000-0000-0000-000000000001', null, '20000000-0000-0000-0000-000000000001', '2026-11-01', null, null, 'group-owned', 1, 'subscription', null),
      ('10000000-0000-0000-0000-000000000002', null, '20000000-0000-0000-0000-000000000002', '2026-11-02', null, null, 'group-owned', 1, 'debt', null),
      ('10000000-0000-0000-0000-000000000003', null, '20000000-0000-0000-0000-000000000003', '2026-11-03', null, null, 'group-owned', 1, 'trial', 200),
      ('10000000-0000-0000-0000-000000000004', null, '20000000-0000-0000-0000-000000000004', '2026-11-04', null, null, 'group-owned', 1, 'single', 400),
      ('10000000-0000-0000-0000-000000000005', null, '20000000-0000-0000-0000-000000000005', '2026-11-05', null, null, 'group-foreign', 1, 'trial', 250);
  `);
  await db.exec(migrationSql);
  await db.exec(`grant usage on schema public, auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    grant execute on function rls_owns_group(text) to authenticated;
    set app.authenticated = 'on';
    set role authenticated;`);
  return db;
}

test('trainer reads subscription, debt, trial and single only in an assigned group without financial fields', async () => {
  const db = await database();
  try {
    const result = await db.query('select * from crm_fetch_my_attendance() order by date');
    assert.deepEqual(result.rows.map((row) => row.entry_type), ['subscription', 'debt', 'trial', 'single']);
    assert.ok(result.rows.every((row) => row.group_id === 'group-owned'));
    for (const row of result.rows) {
      assert.equal(Object.hasOwn(row, 'price_snapshot_uah'), false);
      assert.equal(Object.hasOwn(row, 'amount_uah'), false);
      assert.equal(Object.hasOwn(row, 'payment_method_code'), false);
      assert.equal(Object.hasOwn(row, 'status'), false);
    }
  } finally {
    await db.close();
  }
});

test('trainer attendance data path uses the safe RPC while admin keeps the existing full read', () => {
  assert.match(dbSource, /includeFinancial[\s\S]*crm_fetch_my_attendance/);
  assert.match(dbSource, /includeFinancial[\s\S]*from\('attendance'\)\.select\('\*'\)/);
  assert.match(appSource, /fetchAttendance\(\{ includeFinancial: isCurrentAdmin \}\)/);
  assert.match(attendanceSource, /fetchAttendance\(\{ includeFinancial: isAdmin \}\)/);
  assert.match(attendanceSource, /\{isAdmin && <option value="single">Разове<\/option>\}/);
  assert.match(attendanceSource, /\{isAdmin && <option value="trial">Пробне<\/option>\}/);
});
