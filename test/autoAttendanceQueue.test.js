import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { nextAutoQuantity, setAutoAttendance } from '../src/autoAttendance.js';

const student = '10000000-0000-0000-0000-000000000001';
const old = '20000000-0000-0000-0000-000000000001';
const next = '20000000-0000-0000-0000-000000000002';
const user = '30000000-0000-0000-0000-000000000001';
async function setup({ historical = false } = {}) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create function auth.uid() returns uuid language sql as $$ select '${user}'::uuid $$;
    create table trainers(id uuid, auth_user_id uuid, is_active boolean, archived_at timestamptz, access_disabled_at timestamptz);
    create table trainer_groups(trainer_id uuid, group_id text); create table student_groups(student_id uuid, group_id text);
    create function crm_is_admin_session() returns boolean language sql as $$ select coalesce(current_setting('test.is_admin',true) = 'on',false) $$;
    create table subscriptions(id uuid primary key, student_id uuid, group_id text, paid_at date, previous_subscription_id uuid, activation_date date, start_date date, end_date date, total_trainings integer, used_trainings integer);
    create table attendance(id uuid primary key default gen_random_uuid(), student_id uuid, group_id text, date date, sub_id uuid, entry_type text, quantity integer, guest_name text, guest_type text, price_snapshot_uah numeric);
    create table financial_operations(attendance_id uuid);
    alter table attendance enable row level security;
    grant usage on schema public, auth to authenticated;
    grant select,insert,update,delete on attendance to authenticated;
    create policy attendance_admin_all on attendance for all to authenticated using (crm_is_admin_session()) with check (crm_is_admin_session());
    create policy attendance_legacy_permissive on attendance for all to authenticated using (true) with check (true);
    create policy attendance_trainer_select_own_groups on attendance for select to authenticated using (true);
    create policy attendance_trainer_insert_own_groups on attendance for insert to authenticated with check (true);
    create policy attendance_trainer_update_own_groups on attendance for update to authenticated using (true);
    create policy attendance_trainer_delete_own_groups on attendance for delete to authenticated using (true);
    insert into trainers values ('${user}', '${user}', true, null, null);
    insert into trainer_groups values ('${user}', 'a'); insert into student_groups values ('${student}', 'a'), ('${student}', 'b');`);
  if (historical) await db.query(`insert into attendance(student_id,group_id,date,entry_type,quantity,sub_id) values ($1,'a','2026-10-10','debt',1,null)`,[student]);
  const rls = await readFile(new URL('../supabase/migrations/20260916090000_fix_attendance_trainer_group_rls.sql', import.meta.url), 'utf8');
  await db.exec(rls.slice(rls.indexOf('create or replace function public.rls_owns_group'), rls.indexOf('revoke execute')));
  await db.exec(await readFile(new URL('../supabase/migrations/20261113090000_subscription_queue_resolver.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261113100000_auto_attendance_queue.sql', import.meta.url), 'utf8'));
  return db;
}
const set = (db, quantity, date = '2026-11-02', group = 'a') => db.query('select crm_set_auto_attendance($1,$2,$3,$4)', [student, group, date, quantity]);
async function seed(db, used = 0, total = 8) {
  await db.query(`insert into subscriptions values ($1,$3,'a',null,null,'2026-10-01','2026-10-01','2026-12-31',$5,$4), ($2,$3,'a','2026-11-01',$1,null,'2026-10-01','2026-12-31',8,0)`, [old,next,student,used,total]);
}
const rows = db => db.query('select * from attendance order by queue_auto_order nulls first');
const usage = db => db.query('select id,used_trainings,activation_date from subscriptions order by id');

test('Auto 0→1→2→1→0 is atomic and can cross subscription boundary', async t => {
  const db = await setup(); t.after(() => db.close()); await seed(db, 0, 1);
  await set(db,1); assert.equal((await rows(db)).rows[0].sub_id,old);
  await set(db,2); let a=(await rows(db)).rows; assert.deepEqual(a.map(x=>x.sub_id),[old,next]);
  assert.ok(a.every(x=>x.queue_auto_order !== null));
  assert.deepEqual((await usage(db)).rows.map(x=>x.used_trainings),[1,1]);
  await set(db,1); assert.deepEqual((await usage(db)).rows.map(x=>x.used_trainings),[1,0]);
  await set(db,0); assert.equal((await rows(db)).rows.length,0);
  assert.deepEqual((await usage(db)).rows.map(x=>x.used_trainings),[0,0]);
});

test('day 15 supersedes predecessor, exhausted predecessor activates successor, and missing subscription produces debt', async t => {
  const db=await setup(); t.after(()=>db.close()); await seed(db);
  await set(db,1,'2026-11-14'); assert.equal((await rows(db)).rows[0].sub_id,old);
  await set(db,1,'2026-11-15'); assert.equal((await rows(db)).rows[1].sub_id,next);
  await set(db,1,'2026-11-16'); assert.equal((await rows(db)).rows[2].sub_id,next);
  assert.equal((await db.query('select activation_date::text from subscriptions where id=$1',[next])).rows[0].activation_date,'2026-11-15');
  await db.exec('delete from attendance; delete from subscriptions'); await seed(db,8);
  await set(db,1,'2026-11-05'); assert.equal((await rows(db)).rows[0].sub_id,next);
  await db.exec('delete from attendance; delete from subscriptions');
  await set(db,1); assert.equal((await rows(db)).rows[0].entry_type,'debt');
});

test('trainer can only use scoped redacted RPCs; historical, trial, single and guest rows are preserved', async t => {
  const db=await setup(); t.after(()=>db.close()); await seed(db);
  await db.query(`insert into attendance(student_id,group_id,date,entry_type,quantity,price_snapshot_uah) values ($1,'a','2026-10-01','trial',1,100),($1,'a','2026-10-02','single',1,200),($1,'b','2026-10-03','single',1,300),($1,'a','2026-10-04','subscription',1,null)`,[student]);
  await db.exec(`insert into attendance(group_id,date,entry_type,quantity,guest_name,guest_type) values ('a','2026-10-05','trial',1,'Guest','trial')`);
  const before=(await rows(db)).rows;
  assert.ok(before.every(x=>x.queue_auto_order===null));
  await db.exec('set role authenticated');
  assert.deepEqual((await db.query('select * from attendance')).rows,[]);
  await assert.rejects(db.query(`insert into attendance(student_id,group_id,date,entry_type,sub_id) values ($1,'a','2026-11-01','subscription',$2)`,[student,old]),/row-level security/);
  assert.equal((await db.query(`update attendance set entry_type='debt'`)).affectedRows,0);
  assert.equal((await db.query('delete from attendance')).affectedRows,0);
  const projected=(await db.query('select * from crm_fetch_my_attendance()')).rows;
  assert.deepEqual(projected.map(x=>x.entry_type).sort(),['single','subscription','trial','trial']);
  assert.ok(projected.every(x=>!('sub_id' in x) && !('price_snapshot_uah' in x) && x.group_id==='a'));
  await assert.rejects(set(db,1,'2026-10-04'),/Історичну/);
  await assert.rejects(set(db,1,'2026-11-01','b'),/доступу/);
  await assert.rejects(db.query('select crm_set_auto_attendance($1,$2,$3,$4,$5)',[student,'a','2026-11-01',1,old]),/does not exist/);
  await db.exec('reset role'); assert.deepEqual((await rows(db)).rows,before);
  await db.exec("select set_config('test.is_admin','on',false); set role authenticated");
  assert.equal((await db.query('select * from attendance')).rows.length, before.length);
  assert.equal((await db.query("update attendance set quantity=2 where entry_type='single' and group_id='a'")).affectedRows,1);
  await db.exec('reset role');
});

test('migration leaves a pre-existing historical attendance unchanged and Auto refuses to reinterpret it', async t => {
  const db=await setup({historical:true}); t.after(()=>db.close());
  const before=(await rows(db)).rows;
  assert.equal(before.length,1); assert.equal(before[0].entry_type,'debt');
  assert.equal(before[0].sub_id,null); assert.equal(before[0].queue_auto_order,null);
  await assert.rejects(set(db,2,'2026-10-10'),/Історичну/);
  assert.deepEqual((await rows(db)).rows,before);
});

test('errors during activation, insertion, usage update and deletion roll back all changes', async t => {
  const db=await setup(); t.after(()=>db.close()); await seed(db,8);
  await db.exec(`create function test_fail() returns trigger language plpgsql as $$ begin
    if current_setting('test.fail_step',true) = TG_ARGV[0]
      or (current_setting('test.fail_step',true) = 'usage_after_insert' and TG_TABLE_NAME = 'subscriptions' and exists(select 1 from attendance))
      or (current_setting('test.fail_step',true) = 'insert_second' and TG_OP = 'INSERT' and exists(select 1 from attendance))
      or (current_setting('test.fail_step',true) = 'delete_second' and TG_OP = 'DELETE' and (select count(*) from attendance) = 1)
      then raise exception 'injected failure'; end if;
    return coalesce(new,old); end $$;
    create trigger fail_insert before insert on attendance for each row execute function test_fail('insert');
    create trigger fail_delete before delete on attendance for each row execute function test_fail('delete');
    create trigger fail_usage before update on subscriptions for each row execute function test_fail('usage');`);
  for (const phase of ['insert','usage','usage_after_insert']) {
    const before=await usage(db); await db.query("select set_config('test.fail_step',$1,false)",[phase]);
    await assert.rejects(set(db,1),/injected failure/);
    assert.deepEqual((await usage(db)).rows,before.rows); assert.equal((await rows(db)).rows.length,0);
  }
  await db.exec("select set_config('test.fail_step','insert_second',false)");
  const initialUsage=(await usage(db)).rows; await assert.rejects(set(db,2),/injected failure/);
  assert.deepEqual((await usage(db)).rows,initialUsage); assert.equal((await rows(db)).rows.length,0);
  await db.exec("select set_config('test.fail_step','',false)"); await set(db,2);
  const beforeSecondRows=(await rows(db)).rows, beforeSecondUsage=(await usage(db)).rows;
  await db.exec("select set_config('test.fail_step','delete_second',false)"); await assert.rejects(set(db,0),/injected failure/);
  assert.deepEqual((await rows(db)).rows,beforeSecondRows); assert.deepEqual((await usage(db)).rows,beforeSecondUsage);
  await db.exec("select set_config('test.fail_step','',false)"); await set(db,1);
  const beforeRows=(await rows(db)).rows, beforeUsage=(await usage(db)).rows;
  for (const phase of ['delete','usage']) {
    await db.query("select set_config('test.fail_step',$1,false)",[phase]);
    await assert.rejects(set(db,0),/injected failure/);
    assert.deepEqual((await rows(db)).rows,beforeRows); assert.deepEqual((await usage(db)).rows,beforeUsage);
  }
});

test('ambiguous queue raises a clear error and leaves attendance and usage unchanged', async t => {
  const db=await setup(); t.after(()=>db.close()); await seed(db);
  await db.query(`insert into subscriptions values (gen_random_uuid(),$1,'a',null,null,'2026-10-01','2026-10-01','2026-12-31',8,0)`,[student]);
  const before=(await usage(db)).rows;
  await assert.rejects(set(db,1),/неоднозначна/);
  assert.deepEqual((await usage(db)).rows,before);
  assert.equal((await rows(db)).rows.length,0);
});

test('client Auto submits only cell identity and count, and propagates errors', async () => {
  const calls=[];
  const client={rpc: async (...args) => { calls.push(args); return {error: null}; }};
  assert.equal(nextAutoQuantity([]),1);
  assert.equal(nextAutoQuantity([{quantity:1}]),2);
  assert.equal(nextAutoQuantity([{quantity:1},{quantity:1}]),0);
  await setAutoAttendance(client,{studentId:student,groupId:'a',date:'2026-11-02',quantity:2,subId:old,entryType:'single',price:123});
  assert.deepEqual(calls, [['crm_set_auto_attendance',{p_student_id:student,p_group_id:'a',p_date:'2026-11-02',p_quantity:2}]]);
  const failure=new Error('queue ambiguity');
  await assert.rejects(setAutoAttendance({rpc:async()=>({error:failure})},{studentId:student,groupId:'a',date:'2026-11-02',quantity:1}),failure);
  const ui=await readFile(new URL('../src/components/AttendanceTab.jsx',import.meta.url),'utf8');
  assert.match(ui,/db\.setAutoAttendance\(\{ studentId: student\.id, groupId: gid, date: dateStr, quantity \}\)/);
  assert.match(ui,/!isAdmin && entryMode !== "auto"/);
  assert.match(ui,/all\.every\(\(row\) => row\.queueAuto\)/);
  assert.match(ui,/existing\.some\(\(row\) => row\.queueAuto\)/);
  assert.match(ui,/db\.createPaidOneOffAttendance\(payload, payment\)/); assert.match(ui,/const handleToggleGuestCell/);
});
