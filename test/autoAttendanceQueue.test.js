import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const student = '10000000-0000-0000-0000-000000000001';
const old = '20000000-0000-0000-0000-000000000001';
const next = '20000000-0000-0000-0000-000000000002';
const user = '30000000-0000-0000-0000-000000000001';
async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create function auth.uid() returns uuid language sql as $$ select '${user}'::uuid $$;
    create table trainers(id uuid, auth_user_id uuid, is_active boolean, archived_at timestamptz, access_disabled_at timestamptz);
    create table trainer_groups(trainer_id uuid, group_id text); create table student_groups(student_id uuid, group_id text);
    create function crm_is_admin_session() returns boolean language sql as $$ select false $$;
    create table subscriptions(id uuid primary key, student_id uuid, group_id text, paid_at date, previous_subscription_id uuid, activation_date date, start_date date, end_date date, total_trainings integer, used_trainings integer);
    create table attendance(id uuid primary key default gen_random_uuid(), student_id uuid, group_id text, date date, sub_id uuid, entry_type text, quantity integer, guest_name text, guest_type text, price_snapshot_uah numeric);
    create table financial_operations(attendance_id uuid);
    insert into trainers values ('${user}', '${user}', true, null, null);
    insert into trainer_groups values ('${user}', 'a'); insert into student_groups values ('${student}', 'a');`);
  const rls = await readFile(new URL('../supabase/migrations/20260916090000_fix_attendance_trainer_group_rls.sql', import.meta.url), 'utf8');
  await db.exec(rls.slice(rls.indexOf('create or replace function public.rls_owns_group'), rls.indexOf('revoke execute')));
  await db.exec(await readFile(new URL('../supabase/migrations/20261113090000_subscription_queue_resolver.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261113100000_auto_attendance_queue.sql', import.meta.url), 'utf8'));
  return db;
}
const create = (db, date, group = 'a') => db.query('select * from crm_create_auto_attendance($1,$2,$3)', [student, group, date]);
async function seed(db, used = 0) {
  await db.query(`insert into subscriptions values ($1,$3,'a',null,null,'2026-10-01','2026-10-01','2026-12-31',8,$4), ($2,$3,'a','2026-11-01',$1,null,'2026-10-01','2026-12-31',8,0)`, [old,next,student,used]);
}

test('Auto resolves oldest, activates successor on exhaustion or day 15, and deletion synchronizes usage', async t => {
  const db = await setup(); t.after(() => db.close());
  await seed(db);
  const first = (await create(db, '2026-11-02')).rows[0]; assert.equal(first.sub_id, old);
  assert.equal((await db.query('select used_trainings from subscriptions where id=$1',[old])).rows[0].used_trainings, 1);
  await db.query('select crm_delete_auto_attendance($1)', [first.id]);
  assert.equal((await db.query('select used_trainings from subscriptions where id=$1',[old])).rows[0].used_trainings, 0);
  await db.query('update subscriptions set used_trainings=8 where id=$1',[old]);
  assert.equal((await create(db, '2026-11-05')).rows[0].sub_id, next);
  assert.equal((await db.query('select activation_date::text from subscriptions where id=$1',[next])).rows[0].activation_date, '2026-11-05');
  await db.query('update subscriptions set used_trainings=0 where id=$1',[old]);
  assert.equal((await create(db, '2026-11-06')).rows[0].sub_id, next);
});

test('deadline, debt, duplicates, permissions and protected attendance', async t => {
  const db = await setup(); t.after(() => db.close()); await seed(db);
  const results = await Promise.allSettled([create(db,'2026-11-15'), create(db,'2026-11-15')]);
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(results.find(x => x.status === 'fulfilled').value.rows[0].sub_id, next);
  assert.equal((await db.query('select activation_date::text,used_trainings from subscriptions where id=$1',[next])).rows[0].activation_date,'2026-11-15');
  assert.equal((await db.query('select used_trainings from subscriptions where id=$1',[next])).rows[0].used_trainings,1);
  assert.equal((await create(db,'2026-11-16')).rows[0].sub_id, next);
  assert.equal((await db.query('select used_trainings from subscriptions where id=$1',[old])).rows[0].used_trainings,0);
  await assert.rejects(create(db,'2026-11-16','other'), /доступу/);
  await assert.rejects(db.query('select crm_create_auto_attendance($1,$2,$3,$4)',[student,'a','2026-11-16',old]), /does not exist/);
  await assert.rejects(db.query('select crm_create_auto_attendance($1,$2,$3,$4)',[student,'a','2026-11-16','single']), /does not exist/);
  await db.exec('delete from subscriptions');
  assert.equal((await create(db,'2026-11-17')).rows[0].entry_type,'debt');
  for (const [type, guest] of [['trial',null],['single',null],['subscription','Guest']]) {
    const row = (await db.query('insert into attendance(student_id,group_id,date,entry_type,guest_name) values ($1,$2,$3,$4,$5) returning id',[student,'a','2026-11-18',type,guest])).rows[0];
    await assert.rejects(db.query('select crm_delete_auto_attendance($1)',[row.id]), /фінансову/);
  }
});

test('ambiguous queues abort without changes', async t => {
  const db=await setup(); t.after(()=>db.close()); await seed(db);
  await db.query(`insert into subscriptions values (gen_random_uuid(),$1,'a',null,null,'2026-10-01','2026-10-01','2026-12-31',8,0)`,[student]);
  await assert.rejects(create(db,'2026-11-02'), /неоднозначна/);
  assert.equal((await db.query('select count(*)::int n from attendance')).rows[0].n,0);
});

test('client Auto sends only student, group and date and leaves one-off and guests on their paths', async () => {
  const db = await readFile(new URL('../src/db.js', import.meta.url),'utf8');
  const ui = await readFile(new URL('../src/components/AttendanceTab.jsx', import.meta.url),'utf8');
  const fn = db.slice(db.indexOf('export async function createAutoAttendance'), db.indexOf('export async function deleteAutoAttendance'));
  assert.match(fn,/p_student_id: studentId, p_group_id: groupId, p_date: date/);
  assert.doesNotMatch(fn.slice(0, fn.indexOf('if (error)')), /p_sub_id|p_entry_type|price|payment/);
  assert.match(ui,/db\.createAutoAttendance\(\{ studentId: student\.id, groupId: gid, date: dateStr \}\)/);
  assert.match(ui,/db\.createPaidOneOffAttendance\(payload, payment\)/);
  assert.match(ui,/const handleToggleGuestCell/);
});
