import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const sub = '10000000-0000-0000-0000-000000000001';
const legacy = '10000000-0000-0000-0000-000000000002';
const user = '30000000-0000-0000-0000-000000000001';
async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select '${user}'::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select '{"email":"semagin.vlad@gmail.com"}'::jsonb $$;
    create function crm_is_admin_session() returns boolean language sql as $$ select true $$;
    create function rls_can_record_attendance(uuid,text) returns boolean language sql as $$ select true $$;
    create function rls_owns_group(text) returns boolean language sql as $$ select true $$;
    create table groups(id text primary key, trainer_id uuid, schedule jsonb);
    insert into groups values('g','${user}','[]');
    create table subscriptions(id uuid primary key, student_id uuid, group_id text, plan_type text, start_date date, end_date date, original_end_date date, total_trainings integer, used_trainings integer, notification_sent boolean, created_at timestamptz default now(), activation_date date);
    create table attendance(id uuid primary key default gen_random_uuid(), student_id uuid, group_id text, date date, sub_id uuid, entry_type text, quantity integer, queue_auto_order bigint, guest_name text, guest_type text, price_snapshot_uah numeric);
    create table financial_operations(attendance_id uuid, attendance_source_id uuid);
    create table cancelled_trainings(id uuid primary key default gen_random_uuid(), group_id text, date date, reason text, created_at timestamptz default now());
    create sequence crm_auto_attendance_order_seq;
    create function crm_record_subscription_queue_activation(uuid,text,date)
      returns table(result text, subscription_id uuid, activation_date date)
      language sql as $$ select 'subscription'::text, '${sub}'::uuid, null::date $$;
    insert into subscriptions(id,student_id,group_id,plan_type,start_date,end_date,original_end_date,total_trainings,used_trainings) values ('${legacy}','${user}','g','4pack','2026-01-01','2026-01-15','2026-02-01',2,2);`);
  await db.exec(await readFile(new URL('../supabase/migrations/20261118090000_subscription_usage_checkpoint.sql', import.meta.url), 'utf8'));
  await db.exec(`insert into subscriptions(id,student_id,group_id,plan_type,start_date,end_date,original_end_date,total_trainings,used_trainings) values ('${sub}','${user}','g','4pack','2026-01-01','2026-02-01','2026-02-01',2,0)`);
  return db;
}
const sync = db => db.query('select crm_sync_subscription_usage($1)', [sub]);
const state = async (db,id=sub) => (await db.query('select used_trainings, end_date::text, original_end_date::text, usage_expiry_checkpoint::text, usage_expiry_state from subscriptions where id=$1',[id])).rows[0];

test('checkpoint states, exhaustion, restore, second exhaustion and repeated sync', async t => {
  const db=await setup(); t.after(()=>db.close());
  assert.equal((await state(db,legacy)).usage_expiry_state,'legacy_unknown');
  assert.equal((await state(db)).usage_expiry_state,'ready');
  await db.query(`insert into attendance(student_id,group_id,date,sub_id,entry_type,quantity) values ($1,'g','2026-01-10',$2,'subscription',2)`,[user,sub]);
  await sync(db);
  assert.deepEqual(await state(db),{used_trainings:2,end_date:'2026-01-10',original_end_date:'2026-02-01',usage_expiry_checkpoint:'2026-02-01',usage_expiry_state:'captured'});
  await sync(db); assert.equal((await state(db)).usage_expiry_checkpoint,'2026-02-01');
  await db.exec('update attendance set quantity=1'); await sync(db);
  assert.deepEqual(await state(db),{used_trainings:1,end_date:'2026-02-01',original_end_date:'2026-02-01',usage_expiry_checkpoint:null,usage_expiry_state:'ready'});
  await db.exec("update subscriptions set end_date='2026-02-10' where id='"+sub+"'; update attendance set quantity=2"); await sync(db);
  assert.equal((await state(db)).usage_expiry_checkpoint,'2026-02-10');
  await db.exec('delete from attendance'); await sync(db);
  assert.equal((await state(db)).end_date,'2026-02-10');
});

test('cancellation extension preserves checkpoint and original date', async t => {
  const db=await setup(); t.after(()=>db.close());
  await db.query(`insert into attendance(student_id,group_id,date,sub_id,entry_type,quantity) values ($1,'g','2026-01-10',$2,'subscription',2)`,[user,sub]);
  await sync(db); await db.query("select * from crm_cancel_training_for_group('g','2026-01-05')");
  assert.equal((await state(db)).usage_expiry_checkpoint,'2026-02-08');
  assert.equal((await state(db)).end_date,'2026-01-10');
  await db.exec('delete from attendance'); await sync(db);
  assert.equal((await state(db)).end_date,'2026-02-08');
  assert.equal((await state(db)).original_end_date,'2026-02-01');
});

test('legacy reconciliation never invents a date', async t => {
  const db=await setup(); t.after(()=>db.close());
  await db.query('select crm_sync_subscription_usage($1)',[legacy]);
  assert.deepEqual(await state(db,legacy),{used_trainings:0,end_date:'2026-01-15',original_end_date:'2026-02-01',usage_expiry_checkpoint:null,usage_expiry_state:'legacy_unknown'});
});


test('Queue-Auto and direct attendance cancellation share usage and expiry reconciliation', async t => {
  const db=await setup(); t.after(()=>db.close());
  await db.query("select crm_set_auto_attendance($1,'g','2026-01-10',2)",[user]);
  assert.deepEqual(await state(db),{used_trainings:2,end_date:'2026-01-10',original_end_date:'2026-02-01',usage_expiry_checkpoint:'2026-02-01',usage_expiry_state:'captured'});
  await db.query("select crm_remove_my_auto_attendance($1,'g','2026-01-10')",[user]);
  assert.equal((await state(db)).end_date,'2026-02-01');
  await db.query(`insert into attendance(student_id,group_id,date,sub_id,entry_type,quantity) values ($1,'g','2026-01-10',$2,'subscription',2)`,[user,sub]);
  assert.equal((await state(db)).usage_expiry_state,'captured');
  await db.query('delete from attendance where sub_id=$1',[sub]);
  assert.equal((await state(db)).usage_expiry_state,'ready');
  assert.equal((await state(db)).used_trainings,0);
});

test('restoring a cancelled lesson while captured removes its extension from the checkpoint', async t => {
  const db=await setup(); t.after(()=>db.close());
  await db.query(`insert into attendance(student_id,group_id,date,sub_id,entry_type,quantity) values ($1,'g','2026-01-10',$2,'subscription',2)`,[user,sub]);
  await db.query("select * from crm_cancel_training_for_group('g','2026-01-05')");
  const id=(await db.query('select id from cancelled_trainings')).rows[0].id;
  await db.query('select * from crm_restore_cancelled_training($1)',[id]);
  assert.equal((await state(db)).usage_expiry_checkpoint,'2026-02-01');
  await db.exec('delete from attendance');
  assert.equal((await state(db)).end_date,'2026-02-01');
});

test('restoring cancellations out of order cannot silently discard a later extension', async t => {
  const db=await setup(); t.after(()=>db.close());
  await db.query(`insert into attendance(student_id,group_id,date,sub_id,entry_type,quantity) values ($1,'g','2026-01-10',$2,'subscription',2)`,[user,sub]);
  await db.query("select * from crm_cancel_training_for_group('g','2026-01-05')");
  await db.query("select * from crm_cancel_training_for_group('g','2026-01-06')");
  const ids=(await db.query('select id from cancelled_trainings order by date')).rows;
  await assert.rejects(db.query('select * from crm_restore_cancelled_training($1)',[ids[0].id]),/пізніші скасування/);
  assert.equal((await state(db)).usage_expiry_checkpoint,'2026-02-15');
  await db.query('select * from crm_restore_cancelled_training($1)',[ids[1].id]);
  await db.query('select * from crm_restore_cancelled_training($1)',[ids[0].id]);
  assert.equal((await state(db)).usage_expiry_checkpoint,'2026-02-01');
});

test('ambiguous legacy removal is rolled back with an admin reconciliation message', async t => {
  const db=await setup(); t.after(()=>db.close());
  await db.query(`insert into attendance(student_id,group_id,date,sub_id,entry_type,quantity) values ($1,'g','2026-01-15',$2,'subscription',2)`,[user,legacy]);
  await assert.rejects(db.query('delete from attendance where sub_id=$1',[legacy]),/вручну перевірити дату завершення/);
  assert.equal((await db.query('select count(*)::int as count from attendance where sub_id=$1',[legacy])).rows[0].count,1);
  assert.equal((await state(db,legacy)).end_date,'2026-01-15');
});
