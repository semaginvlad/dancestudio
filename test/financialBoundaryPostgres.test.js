import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = fs.readFileSync(new URL('../supabase/migrations/20261005090000_harden_financial_attendance_boundary.sql', import.meta.url), 'utf8');
const ids = {
  student: '10000000-0000-0000-0000-000000000001', trainer: '10000000-0000-0000-0000-000000000002',
  trainerUser: '10000000-0000-0000-0000-000000000003', adminUser: '10000000-0000-0000-0000-000000000004',
  validSub: '10000000-0000-0000-0000-000000000005', expiredSub: '10000000-0000-0000-0000-000000000006',
  exhaustedSub: '10000000-0000-0000-0000-000000000007',
};

const bootstrap = `
create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create table groups(id text primary key, archived_at timestamptz);
create table students(id uuid primary key,name text);
create table student_groups(student_id uuid,group_id text,unique(student_id,group_id));
create table trainers(id uuid primary key,name text,auth_user_id uuid,is_active boolean,archived_at timestamptz,access_disabled_at timestamptz);
create table trainer_groups(trainer_id uuid,group_id text,is_primary boolean,unique(trainer_id,group_id));
create table subscriptions(id uuid primary key default gen_random_uuid(),student_id uuid,group_id text,plan_type text,start_date date,end_date date,activation_date date,original_end_date date,total_trainings integer,used_trainings integer,amount integer,base_price integer,discount_pct integer,discount_source text,paid boolean,pay_method text,notification_sent boolean,notes text,created_at timestamptz default now());
create table attendance(id uuid primary key default gen_random_uuid(),sub_id uuid,student_id uuid,date date,guest_name text,guest_type text,group_id text,quantity integer,entry_type text,created_at timestamptz default now());
create table room_bookings(id uuid primary key default gen_random_uuid(),date date,start_time text,end_time text,trainer_id text,trainer_name text,title text,type text,booking_type text,people_count integer,price integer,payment_method text,event_type text,note text,color text,recurrence text,recurrence_until date,description text,status text,created_at timestamptz default now(),room_name text);
create function rls_is_admin() returns boolean language sql stable security definer set search_path=public as $$select auth.uid() is not null and coalesce(auth.jwt()->>'email','')='admin@test.invalid'$$;
create function rls_owns_group(p text) returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from trainers t join trainer_groups tg on tg.trainer_id=t.id where t.auth_user_id=auth.uid() and t.is_active is true and t.archived_at is null and t.access_disabled_at is null and tg.group_id=p)$$;
create function rls_can_record_attendance(p uuid,g text) returns boolean language sql stable security definer set search_path=public as $$select rls_owns_group(g) and exists(select 1 from student_groups where student_id=p and group_id=g)$$;
create function crm_is_admin_session() returns boolean language sql stable security definer set search_path=public as $$select rls_is_admin()$$;
create function crm_is_active_trainer_session() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from trainers where auth_user_id=auth.uid() and is_active and archived_at is null and access_disabled_at is null)$$;
create function crm_ensure_one_off_payment_for_attendance(uuid) returns void language sql as $$select$$;
create function crm_remove_one_off_payment_if_orphan(uuid) returns void language sql as $$select$$;
alter table attendance enable row level security; create policy attendance_admin_all on attendance for all to authenticated using(rls_is_admin()) with check(rls_is_admin());
alter table room_bookings enable row level security;
create policy room_admin on room_bookings for all to authenticated using(rls_is_admin()) with check(rls_is_admin());
create policy room_trainer_select on room_bookings for select to authenticated using(trainer_id=auth.uid()::text);
create policy room_trainer_insert on room_bookings for insert to authenticated with check(trainer_id=auth.uid()::text);
create policy room_trainer_update on room_bookings for update to authenticated using(trainer_id=auth.uid()::text) with check(trainer_id=auth.uid()::text);
create policy room_trainer_delete on room_bookings for delete to authenticated using(trainer_id=auth.uid()::text);
insert into groups values('g1',null); insert into students values('${ids.student}','Test'); insert into student_groups values('${ids.student}','g1');
insert into trainers values('${ids.trainer}','Trainer','${ids.trainerUser}',true,null,null); insert into trainer_groups values('${ids.trainer}','g1',true);
alter table trainers enable row level security; revoke all on trainers from public,anon,authenticated; grant select,update on trainers to authenticated;
create policy trainers_admin_only on trainers for all to authenticated using(rls_is_admin()) with check(rls_is_admin());
insert into subscriptions(id,student_id,group_id,plan_type,start_date,end_date,total_trainings,used_trainings,amount,paid) values
('${ids.validSub}','${ids.student}','g1','4pack',current_date-1,current_date+30,4,0,1000,true),
('${ids.expiredSub}','${ids.student}','g1','4pack',current_date-40,current_date-1,4,0,1000,true),
('${ids.exhaustedSub}','${ids.student}','g1','single',current_date-1,current_date+1,1,1,300,true);
`;

const actor = async (db, role, uid = '', email = '') => {
  await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub','${uid}',false); select set_config('request.jwt.claims','${JSON.stringify({ sub: uid, email }).replaceAll("'", "''")}',false);`);
};

test('financial boundary behaves under real PostgreSQL roles and RLS', async () => {
  const db = new PGlite();
  try {
    await db.exec(bootstrap);
    await db.exec(migration);
    await actor(db,'authenticated',ids.trainerUser,'trainer@test.invalid');
    const hiddenTrainer = await db.query(`select * from trainers`);
    assert.equal(hiddenTrainer.rows.length,0);
    await assert.rejects(() => db.query(`select * from crm_record_attendance('${ids.expiredSub}','${ids.student}',current_date,null,null,'g1',1,'subscription','20000000-0000-0000-0000-000000000001')`), /does not cover/i);
    await assert.rejects(() => db.query(`select * from crm_record_attendance('${ids.exhaustedSub}','${ids.student}',current_date,null,null,'g1',1,'subscription','20000000-0000-0000-0000-000000000002')`), /no remaining/i);
    const first = await db.query(`select * from crm_record_attendance('${ids.validSub}','${ids.student}',current_date,null,null,'g1',1,'subscription','20000000-0000-0000-0000-000000000003')`);
    assert.equal(first.rows.length,1);
    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    const activation = await db.query(`select activation_date from subscriptions where id='${ids.validSub}'`);
    assert.ok(activation.rows[0].activation_date);
    await actor(db,'authenticated',ids.trainerUser,'trainer@test.invalid');
    await assert.rejects(() => db.query(`select * from crm_record_attendance('${ids.validSub}','${ids.student}',current_date,null,null,'g1',2,'subscription','20000000-0000-0000-0000-000000000003')`), /idempotency key conflict/i);
    const competingUsage = await Promise.allSettled([
      db.query(`select * from crm_record_attendance('${ids.validSub}','${ids.student}',current_date+1,null,null,'g1',3,'subscription','20000000-0000-0000-0000-000000000007')`),
      db.query(`select * from crm_record_attendance('${ids.validSub}','${ids.student}',current_date+2,null,null,'g1',3,'subscription','20000000-0000-0000-0000-000000000008')`),
    ]);
    assert.equal(competingUsage.filter((result)=>result.status==='fulfilled').length,1);
    assert.equal(competingUsage.filter((result)=>result.status==='rejected').length,1);
    const trial = await db.query(`select * from crm_record_attendance(null,'${ids.student}',current_date-1,null,null,'g1',1,'trial','20000000-0000-0000-0000-000000000004')`);
    const attendanceId = trial.rows[0].id;
    await assert.rejects(() => db.query(`select * from crm_admin_confirm_attendance_payment('${attendanceId}',150,'cash','20000000-0000-0000-0000-000000000005')`), /administrator required/i);
    await assert.rejects(() => db.query(`insert into room_bookings(date,start_time,end_time,trainer_id,title,price,payment_method,event_type) values(current_date,'10:00','11:00','${ids.trainerUser}','Bad',300,'cash','individual_training')`), /administrator may set booking finance/i);
    const booking = await db.query(`insert into room_bookings(date,start_time,end_time,trainer_id,title,event_type) values(current_date,'10:00','11:00','${ids.trainerUser}','Safe','room_booking') returning id`);
    await assert.rejects(() => db.query(`update room_bookings set price=300 where id='${booking.rows[0].id}'`), /administrator may change booking finance/i);
    await db.query(`update room_bookings set title='Safe updated' where id='${booking.rows[0].id}'`);
    await db.query(`delete from room_bookings where id='${booking.rows[0].id}'`);
    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    const protectedBooking = await db.query(`insert into room_bookings(date,start_time,end_time,trainer_id,title,price,payment_method,event_type) values(current_date,'12:00','13:00','${ids.trainerUser}','Paid',500,'cash','individual_training') returning id`);
    await db.query(`update trainers set is_active=false where id='${ids.trainer}'`);
    await actor(db,'authenticated',ids.trainerUser,'trainer@test.invalid');
    await assert.rejects(() => db.query(`insert into room_bookings(date,start_time,end_time,trainer_id,title,event_type) values(current_date,'14:00','15:00','${ids.trainerUser}','Inactive','room_booking')`), /not allowed/i);
    await assert.rejects(() => db.query(`delete from room_bookings where id='${protectedBooking.rows[0].id}'`), /not allowed|administrator may delete/i);
    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    await db.query(`update trainers set is_active=true where id='${ids.trainer}'`);
    const [payment, concurrentPayment] = await Promise.all([
      db.query(`select * from crm_admin_confirm_attendance_payment('${attendanceId}',150,'cash','20000000-0000-0000-0000-000000000005')`),
      db.query(`select * from crm_admin_confirm_attendance_payment('${attendanceId}',150,'cash','20000000-0000-0000-0000-000000000006')`),
    ]);
    assert.equal(payment.rows.length,1);
    assert.equal(concurrentPayment.rows[0].id,payment.rows[0].id);
    await assert.rejects(() => db.query(`select * from crm_admin_confirm_attendance_payment('${attendanceId}',300,'card','20000000-0000-0000-0000-000000000005')`), /idempotency conflict/i);
    const linked = await db.query(`select entry_type,sub_id from attendance where id='${attendanceId}'`);
    assert.equal(linked.rows[0].entry_type,'subscription'); assert.equal(linked.rows[0].sub_id,payment.rows[0].id);
    await db.query(`select crm_delete_attendance('${attendanceId}')`);
    const preserved = await db.query(`select count(*)::int as count from subscriptions where id='${payment.rows[0].id}'`);
    assert.equal(preserved.rows[0].count,1);
  } finally { await db.close(); }
});
