import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { buildRoomBookingInsertRow, buildRoomBookingRpcParams, buildRoomBookingUpdateRow, classificationTypeForEventType, mapRoomBookingRow } from '../src/roomBookingPayload.js';
import { normalizeTrainerBookingPayload } from '../src/trainerBookingPayload.js';

const migration = fs.readFileSync(new URL('../supabase/migrations/20261005090000_harden_financial_attendance_boundary.sql', import.meta.url), 'utf8');
const ids = {
  student: '10000000-0000-0000-0000-000000000001', trainer: '10000000-0000-0000-0000-000000000002',
  trainerUser: '10000000-0000-0000-0000-000000000003', adminUser: '10000000-0000-0000-0000-000000000004',
  validSub: '10000000-0000-0000-0000-000000000005', expiredSub: '10000000-0000-0000-0000-000000000006',
  exhaustedSub: '10000000-0000-0000-0000-000000000007',
  otherTrainer: '10000000-0000-0000-0000-000000000008', otherTrainerUser: '10000000-0000-0000-0000-000000000009',
  limitedSub: '10000000-0000-0000-0000-000000000010',
  syncSub: '10000000-0000-0000-0000-000000000011',
  noSubStudent: '10000000-0000-0000-0000-000000000012',
  presenceSubStudent: '10000000-0000-0000-0000-000000000013', presenceSub: '10000000-0000-0000-0000-000000000014',
  storedUsageStudent: '10000000-0000-0000-0000-000000000015', storedExhaustedSub: '10000000-0000-0000-0000-000000000016',
  storedFallbackSub: '10000000-0000-0000-0000-000000000017', storedOnlyStudent: '10000000-0000-0000-0000-000000000018',
  storedOnlySub: '10000000-0000-0000-0000-000000000019',
  lastCreditStudent: '10000000-0000-0000-0000-000000000020', lastCreditSub: '10000000-0000-0000-0000-000000000021',
};

const bootstrap = `
create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create table groups(id text primary key, archived_at timestamptz);
create table students(id uuid primary key,name text);
grant select on students to authenticated;
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
create function crm_create_student_for_group(p_group_id text,p_name text,p_first_name text,p_last_name text,p_phone text,p_telegram text,p_notes text,p_message_template text)
returns setof students language plpgsql security definer as $$declare v students; begin insert into students(id,name) values(gen_random_uuid(),p_name) returning * into v; insert into student_groups values(v.id,p_group_id); return next v; end$$;
alter table attendance enable row level security; create policy attendance_admin_all on attendance for all to authenticated using(rls_is_admin()) with check(rls_is_admin());
create policy "Allow all on attendance" on attendance for all to authenticated using(true) with check(true);
create policy attendance_trainer_insert_own_groups on attendance for insert to authenticated with check(true);
create policy attendance_trainer_update_own_groups on attendance for update to authenticated using(true) with check(true);
create policy attendance_trainer_delete_own_groups on attendance for delete to authenticated using(true);
alter table subscriptions enable row level security;
create policy subscriptions_trainer_select_own_group on subscriptions for select to authenticated using(true);
create policy subscriptions_trainer_insert_own_group on subscriptions for insert to authenticated with check(true);
create policy subscriptions_trainer_update_own_group on subscriptions for update to authenticated using(true) with check(true);
create policy subscriptions_trainer_delete_own_group on subscriptions for delete to authenticated using(true);
alter table room_bookings enable row level security;
create policy "Allow all on room_bookings" on room_bookings for all to authenticated using(true) with check(true);
insert into groups values('g1',null),('g2',null); insert into students values('${ids.student}','Test'),('${ids.noSubStudent}','No Sub'),('${ids.presenceSubStudent}','Presence Sub'),('${ids.storedUsageStudent}','Stored usage with fallback'),('${ids.storedOnlyStudent}','Stored usage only'),('${ids.lastCreditStudent}','Last credit'); insert into student_groups values('${ids.student}','g1'),('${ids.student}','g2'),('${ids.noSubStudent}','g1'),('${ids.presenceSubStudent}','g1'),('${ids.storedUsageStudent}','g1'),('${ids.storedOnlyStudent}','g1'),('${ids.lastCreditStudent}','g1');
insert into trainers values('${ids.trainer}','Trainer','${ids.trainerUser}',true,null,null),('${ids.otherTrainer}','Other','${ids.otherTrainerUser}',true,null,null); insert into trainer_groups values('${ids.trainer}','g1',true);
alter table trainers enable row level security; revoke all on trainers from public,anon,authenticated; grant select,update on trainers to authenticated;
create policy trainers_admin_only on trainers for all to authenticated using(rls_is_admin()) with check(rls_is_admin());
insert into subscriptions(id,student_id,group_id,plan_type,start_date,end_date,total_trainings,used_trainings,amount,paid) values
('${ids.validSub}','${ids.student}','g1','4pack',current_date-1,current_date+30,4,0,1000,true),
('${ids.expiredSub}','${ids.student}','g1','4pack',current_date-40,current_date-1,4,0,1000,true),
('${ids.exhaustedSub}','${ids.student}','g1','single',current_date-1,current_date+1,1,1,300,true),
('${ids.limitedSub}','${ids.student}','g1','single',current_date-1,current_date+1,1,0,300,true),
('${ids.syncSub}','${ids.student}','g1','4pack',current_date-10,current_date+30,2,0,600,true),
('${ids.presenceSub}','${ids.presenceSubStudent}','g1','4pack',current_date-1,current_date+30,4,0,600,true),
('${ids.storedExhaustedSub}','${ids.storedUsageStudent}','g1','single',current_date-2,current_date+30,1,1,300,true),
('${ids.storedFallbackSub}','${ids.storedUsageStudent}','g1','4pack',current_date-1,current_date+30,4,0,600,true),
('${ids.storedOnlySub}','${ids.storedOnlyStudent}','g1','single',current_date-1,current_date+30,1,1,300,true),
('${ids.lastCreditSub}','${ids.lastCreditStudent}','g1','single',current_date-1,current_date+30,1,0,300,true);
`;

const actor = async (db, role, uid = '', email = '') => {
  await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub','${uid}',false); select set_config('request.jwt.claims','${JSON.stringify({ sub: uid, email }).replaceAll("'", "''")}',false);`);
};

const insertBuiltBooking = (db, row) => db.query(
  `insert into room_bookings(date,start_time,end_time,trainer_id,title,type,booking_type,event_type,color,status,room_name)
   values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id,date,start_time,end_time,trainer_id,title,type,booking_type,event_type,color,status,room_name`,
  [row.date,row.start_time,row.end_time,row.trainer_id,row.title,row.type,row.booking_type,row.event_type,row.color,row.status,row.room_name],
);

const updateBuiltBooking = (db, id, row) => {
  const entries = Object.entries(row);
  return db.query(`update room_bookings set ${entries.map(([key],index)=>`${key}=$${index+1}`).join(',')} where id=$${entries.length+1} returning id,date,start_time,end_time,trainer_id,title,type,booking_type,event_type,color,status,room_name`, [...entries.map(([,value])=>value),id]);
};

test('financial boundary behaves under real PostgreSQL roles and RLS', async () => {
  const db = new PGlite();
  try {
    await db.exec(bootstrap);
    await db.exec(migration);
    const revokedLegacyHelpers = await db.query(`select
      has_function_privilege('authenticated','public.crm_ensure_one_off_payment_for_attendance(uuid)','execute') as authenticated_ensure,
      has_function_privilege('anon','public.crm_ensure_one_off_payment_for_attendance(uuid)','execute') as anon_ensure,
      has_function_privilege('authenticated','public.crm_remove_one_off_payment_if_orphan(uuid)','execute') as authenticated_remove,
      has_function_privilege('anon','public.crm_remove_one_off_payment_if_orphan(uuid)','execute') as anon_remove`);
    assert.deepEqual(revokedLegacyHelpers.rows[0],{
      authenticated_ensure:false,anon_ensure:false,authenticated_remove:false,anon_remove:false,
    });
    const publicLegacyExecute = await db.query(`select count(*)::int as count
      from information_schema.routine_privileges
      where routine_schema='public'
        and routine_name in ('crm_ensure_one_off_payment_for_attendance','crm_remove_one_off_payment_if_orphan')
        and grantee='PUBLIC' and privilege_type='EXECUTE'`);
    assert.equal(publicLegacyExecute.rows[0].count,0);
    await actor(db,'authenticated',ids.trainerUser,'trainer@test.invalid');
    const hiddenTrainer = await db.query(`select * from trainers`);
    assert.equal(hiddenTrainer.rows.length,0);
    const finalPolicies = await db.query(`select tablename,policyname from pg_policies where schemaname='public' and tablename in ('attendance','subscriptions') order by tablename,policyname`);
    assert.deepEqual(finalPolicies.rows,[
      {tablename:'attendance',policyname:'attendance_admin_all'},
      {tablename:'attendance',policyname:'attendance_trainer_select_own_groups'},
      {tablename:'subscriptions',policyname:'subscriptions_admin_all'},
    ]);
    const roomPolicies = await db.query(`select policyname,cmd from pg_policies where schemaname='public' and tablename='room_bookings' order by policyname`);
    assert.deepEqual(roomPolicies.rows,[
      {policyname:'room_bookings_admin_all',cmd:'ALL'},
      {policyname:'room_bookings_trainer_delete_own',cmd:'DELETE'},
      {policyname:'room_bookings_trainer_insert_own',cmd:'INSERT'},
      {policyname:'room_bookings_trainer_select_own',cmd:'SELECT'},
      {policyname:'room_bookings_trainer_update_own',cmd:'UPDATE'},
    ]);
    const hiddenFinance = await db.query(`select * from subscriptions`);
    assert.equal(hiddenFinance.rows.length,0);
    await assert.rejects(()=>db.query(`insert into subscriptions(student_id,group_id,plan_type,start_date,end_date,total_trainings,used_trainings,amount,paid) values('${ids.student}','g1','single',current_date,current_date,1,0,300,true)`),/row-level security/i);
    const operationalSubs = await db.query(`select * from crm_fetch_my_attendance_subscriptions()`);
    assert.ok(operationalSubs.rows.length>=1);
    assert.equal(Object.hasOwn(operationalSubs.rows[0],'amount'),false);
    await assert.rejects(()=>db.query(`select * from crm_record_attendance(null,'${ids.noSubStudent}',current_date,null,null,'g1',1,'trial','80000000-0000-0000-0000-000000000001')`),/neutral presence/i);
    const neutralUnpaid = await db.query(`select * from crm_record_trainer_presence('${ids.noSubStudent}',current_date,'g1',1,'80000000-0000-0000-0000-000000000002')`);
    const neutralSameKeyRetry = await db.query(`select * from crm_record_trainer_presence('${ids.noSubStudent}',current_date,'g1',1,'80000000-0000-0000-0000-000000000002')`);
    const neutralRetry = await db.query(`select * from crm_record_trainer_presence('${ids.noSubStudent}',current_date,'g1',1,'80000000-0000-0000-0000-000000000003')`);
    assert.equal(neutralUnpaid.rows[0].entry_type,'unpaid');
    assert.equal(neutralSameKeyRetry.rows[0].id,neutralUnpaid.rows[0].id);
    assert.equal(neutralRetry.rows[0].id,neutralUnpaid.rows[0].id);
    await assert.rejects(
      ()=>db.query(`select * from crm_record_trainer_presence('${ids.noSubStudent}',current_date,'g1',2,'80000000-0000-0000-0000-000000000002')`),
      /idempotency key conflict/i,
    );
    const unpaidQuantityKey = '82000000-0000-0000-0000-000000000001';
    for (let attempt=0; attempt<2; attempt+=1) {
      await assert.rejects(
        ()=>db.query(`select * from crm_replace_attendance_quantity('${neutralUnpaid.rows[0].id}',1,2,'${unpaidQuantityKey}')`),
        /require subscription attendance/i,
      );
    }
    const trainerUnpaidUnchanged = await db.query(`select quantity,sub_id,entry_type from attendance where id='${neutralUnpaid.rows[0].id}'`);
    assert.deepEqual(trainerUnpaidUnchanged.rows[0],{quantity:1,sub_id:null,entry_type:'unpaid'});
    const neutralSubscribed = await db.query(`select * from crm_record_trainer_presence('${ids.presenceSubStudent}',current_date,'g1',1,'80000000-0000-0000-0000-000000000004')`);
    assert.equal(neutralSubscribed.rows[0].entry_type,'subscription'); assert.equal(neutralSubscribed.rows[0].sub_id,ids.presenceSub);
    const neutralSubscribedRetry = await db.query(`select * from crm_record_trainer_presence('${ids.presenceSubStudent}',current_date,'g1',1,'80000000-0000-0000-0000-000000000004')`);
    const neutralSubscribedNewKeyRetry = await db.query(`select * from crm_record_trainer_presence('${ids.presenceSubStudent}',current_date,'g1',1,'80000000-0000-0000-0000-000000000010')`);
    assert.equal(neutralSubscribedRetry.rows[0].id,neutralSubscribed.rows[0].id);
    assert.equal(neutralSubscribedNewKeyRetry.rows[0].id,neutralSubscribed.rows[0].id);
    const lastCreditKey = '80000000-0000-0000-0000-000000000008';
    const lastCredit = await db.query(`select * from crm_record_trainer_presence('${ids.lastCreditStudent}',current_date,'g1',1,'${lastCreditKey}')`);
    const lastCreditLostResponseRetry = await db.query(`select * from crm_record_trainer_presence('${ids.lastCreditStudent}',current_date,'g1',1,'${lastCreditKey}')`);
    const lastCreditNewKeyRetry = await db.query(`select * from crm_record_trainer_presence('${ids.lastCreditStudent}',current_date,'g1',1,'80000000-0000-0000-0000-000000000009')`);
    assert.equal(lastCredit.rows[0].entry_type,'subscription');
    assert.equal(lastCredit.rows[0].sub_id,ids.lastCreditSub);
    assert.equal(lastCreditLostResponseRetry.rows[0].id,lastCredit.rows[0].id);
    assert.equal(lastCreditNewKeyRetry.rows[0].id,lastCredit.rows[0].id);
    await db.exec('reset role');
    const lastCreditState = await db.query(`select
      (select count(*)::int from attendance where student_id='${ids.lastCreditStudent}' and group_id='g1' and date=current_date) as attendance_count,
      (select count(*)::int from attendance where student_id='${ids.lastCreditStudent}' and group_id='g1' and date=current_date and entry_type='unpaid') as unpaid_count,
      (select used_trainings from subscriptions where id='${ids.lastCreditSub}')::int as used_trainings`);
    assert.deepEqual(lastCreditState.rows[0],{attendance_count:1,unpaid_count:0,used_trainings:1});
    await actor(db,'authenticated',ids.trainerUser,'trainer@test.invalid');
    await assert.rejects(
      ()=>db.query(`select * from crm_record_trainer_presence('${ids.lastCreditStudent}',current_date,'g1',2,'${lastCreditKey}')`),
      /idempotency key conflict/i,
    );
    await assert.rejects(
      ()=>db.query(`select * from crm_record_trainer_presence('${ids.lastCreditStudent}',current_date,'g1',2,'80000000-0000-0000-0000-000000000011')`),
      /payload conflicts with existing attendance/i,
    );
    const neutralSubscribedOtherDate = await db.query(`select * from crm_record_trainer_presence('${ids.presenceSubStudent}',current_date+1,'g1',1,'80000000-0000-0000-0000-000000000005')`);
    assert.equal(neutralSubscribedOtherDate.rows[0].entry_type,'subscription'); assert.equal(neutralSubscribedOtherDate.rows[0].sub_id,ids.presenceSub);
    const storedFallback = await db.query(`select * from crm_record_trainer_presence('${ids.storedUsageStudent}',current_date,'g1',1,'80000000-0000-0000-0000-000000000006')`);
    assert.equal(storedFallback.rows[0].entry_type,'subscription'); assert.equal(storedFallback.rows[0].sub_id,ids.storedFallbackSub);
    const storedOnlyUnpaid = await db.query(`select * from crm_record_trainer_presence('${ids.storedOnlyStudent}',current_date,'g1',1,'80000000-0000-0000-0000-000000000007')`);
    assert.equal(storedOnlyUnpaid.rows[0].entry_type,'unpaid'); assert.equal(storedOnlyUnpaid.rows[0].sub_id,null);
    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    await assert.rejects(
      ()=>db.query(`select * from crm_replace_attendance_quantity('${neutralUnpaid.rows[0].id}',1,2,'82000000-0000-0000-0000-000000000002')`),
      /require subscription attendance/i,
    );
    await db.exec('reset role');
    const rejectedQuantityKeys = await db.query(`select count(*)::int as count from attendance_quantity_mutations where idempotency_key in ('${unpaidQuantityKey}','82000000-0000-0000-0000-000000000002')`);
    assert.equal(rejectedQuantityKeys.rows[0].count,0);
    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    const conversionSub = await db.query(`insert into subscriptions(student_id,group_id,plan_type,start_date,end_date,total_trainings,used_trainings,amount,paid) values('${ids.noSubStudent}','g1','4pack',current_date-1,current_date+10,2,0,600,false) returning id`);
    await actor(db,'authenticated',ids.trainerUser,'trainer@test.invalid');
    await assert.rejects(()=>db.query(`select * from crm_admin_convert_unpaid_attendance_to_subscription('${conversionSub.rows[0].id}','81000000-0000-0000-0000-000000000001')`),/administrator required/i);
    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    const convertedUnpaid = await db.query(`select * from crm_admin_convert_unpaid_attendance_to_subscription('${conversionSub.rows[0].id}','81000000-0000-0000-0000-000000000001')`);
    const convertedUnpaidRetry = await db.query(`select * from crm_admin_convert_unpaid_attendance_to_subscription('${conversionSub.rows[0].id}','81000000-0000-0000-0000-000000000001')`);
    assert.equal(convertedUnpaid.rows[0].id,neutralUnpaid.rows[0].id); assert.equal(convertedUnpaidRetry.rows[0].id,neutralUnpaid.rows[0].id);
    const convertedUsage = await db.query(`select used_trainings from subscriptions where id='${conversionSub.rows[0].id}'`);
    assert.equal(convertedUsage.rows[0].used_trainings,1);

    const historicalDebt = await db.query(`select * from crm_record_attendance(null,'${ids.student}',current_date-6,null,null,'g1',1,'debt','81000000-0000-0000-0000-000000000002')`);
    const historicalSub = await db.query(`insert into subscriptions(student_id,group_id,plan_type,start_date,end_date,total_trainings,used_trainings,amount,paid) values('${ids.student}','g1','4pack',current_date-7,current_date-5,2,0,600,false) returning id`);
    await assert.rejects(()=>db.query(`select * from crm_admin_convert_unpaid_attendance_to_subscription('${historicalSub.rows[0].id}','81000000-0000-0000-0000-000000000001')`),/idempotency key conflict/i);
    const convertedDebt = await db.query(`select * from crm_admin_convert_unpaid_attendance_to_subscription('${historicalSub.rows[0].id}','81000000-0000-0000-0000-000000000003')`);
    assert.equal(convertedDebt.rows[0].id,historicalDebt.rows[0].id);

    const protectedTrial = await db.query(`select * from crm_record_attendance(null,'${ids.student}',current_date-9,null,null,'g1',1,'trial','81000000-0000-0000-0000-000000000004')`);
    const outsideDebt = await db.query(`select * from crm_record_attendance(null,'${ids.student}',current_date-20,null,null,'g1',1,'debt','81000000-0000-0000-0000-000000000009')`);
    const otherStudentDebt = await db.query(`select * from crm_record_attendance(null,'${ids.noSubStudent}',current_date-9,null,null,'g1',1,'debt','81000000-0000-0000-0000-000000000010')`);
    const otherGroupDebt = await db.query(`select * from crm_record_attendance(null,'${ids.student}',current_date-9,null,null,'g2',1,'debt','81000000-0000-0000-0000-000000000011')`);
    const narrowSub = await db.query(`insert into subscriptions(student_id,group_id,plan_type,start_date,end_date,total_trainings,used_trainings,amount,paid) values('${ids.student}','g1','single',current_date-10,current_date-8,1,0,300,false) returning id`);
    await db.query(`select * from crm_admin_convert_unpaid_attendance_to_subscription('${narrowSub.rows[0].id}','81000000-0000-0000-0000-000000000005')`);
    const untouchedTrial = await db.query(`select sub_id,entry_type from attendance where id='${protectedTrial.rows[0].id}'`);
    assert.deepEqual(untouchedTrial.rows[0],{sub_id:null,entry_type:'trial'});
    const untouchedForeign = await db.query(`select count(*)::int as count from attendance where id in ('${outsideDebt.rows[0].id}','${otherStudentDebt.rows[0].id}','${otherGroupDebt.rows[0].id}','${neutralSubscribed.rows[0].id}') and (sub_id is null or id='${neutralSubscribed.rows[0].id}')`);
    assert.equal(untouchedForeign.rows[0].count,4);

    const overOne = await db.query(`select * from crm_record_attendance(null,'${ids.student}',current_date-12,null,null,'g1',1,'unpaid','81000000-0000-0000-0000-000000000006')`);
    const overTwo = await db.query(`select * from crm_record_attendance(null,'${ids.student}',current_date-11,null,null,'g1',1,'debt','81000000-0000-0000-0000-000000000007')`);
    const overSub = await db.query(`insert into subscriptions(student_id,group_id,plan_type,start_date,end_date,total_trainings,used_trainings,amount,paid) values('${ids.student}','g1','single',current_date-13,current_date-10,1,0,300,false) returning id`);
    await assert.rejects(()=>db.query(`select * from crm_admin_convert_unpaid_attendance_to_subscription('${overSub.rows[0].id}','81000000-0000-0000-0000-000000000008')`),/no capacity/i);
    const unchangedOver = await db.query(`select count(*)::int as count from attendance where id in ('${overOne.rows[0].id}','${overTwo.rows[0].id}') and sub_id is null`);
    assert.equal(unchangedOver.rows[0].count,2);

    const racedAttendance = await db.query(`select * from crm_record_attendance(null,'${ids.storedOnlyStudent}',current_date-3,null,null,'g1',1,'unpaid','81000000-0000-0000-0000-000000000012')`);
    const racedSub = await db.query(`insert into subscriptions(student_id,group_id,plan_type,start_date,end_date,total_trainings,used_trainings,amount,paid) values('${ids.storedOnlyStudent}','g1','single',current_date-4,current_date-2,1,0,300,false) returning id`);
    await assert.rejects(
      ()=>db.query(`select * from crm_replace_attendance_quantity('${racedAttendance.rows[0].id}',1,2,'81000000-0000-0000-0000-000000000013')`),
      /require subscription attendance/i,
    );
    const racedConversion = await db.query(`select * from crm_admin_convert_unpaid_attendance_to_subscription('${racedSub.rows[0].id}','81000000-0000-0000-0000-000000000014')`);
    assert.equal(racedConversion.rows[0].id,racedAttendance.rows[0].id);
    const racedUnchanged = await db.query(`select quantity,sub_id,entry_type from attendance where id='${racedAttendance.rows[0].id}'`);
    assert.deepEqual(racedUnchanged.rows[0],{quantity:1,sub_id:racedSub.rows[0].id,entry_type:'subscription'});
    const noOverflow = await db.query(`select count(*)::int as count from subscriptions where used_trainings>total_trainings`);
    assert.equal(noOverflow.rows[0].count,0);

    const trainerDeleteGuest = await db.query(`insert into attendance(date,guest_name,guest_type,group_id,quantity,entry_type) values(current_date-5,'Trainer cannot delete','trial','g1',1,'trial') returning id`);
    const outsideScopeAttendance = await db.query(`select * from crm_record_attendance(null,'${ids.student}',current_date-5,null,null,'g2',1,'unpaid','83000000-0000-0000-0000-000000000001')`);
    const adminDeleteAttendance = await db.query(`select * from crm_record_attendance(null,'${ids.student}',current_date-4,null,null,'g1',1,'unpaid','83000000-0000-0000-0000-000000000002')`);
    await actor(db,'authenticated',ids.trainerUser,'trainer@test.invalid');
    await db.query(`select crm_delete_attendance('${neutralSubscribed.rows[0].id}')`);
    const deletedSubscriptionAttendance = await db.query(`select count(*)::int as count from attendance where id='${neutralSubscribed.rows[0].id}'`);
    assert.equal(deletedSubscriptionAttendance.rows[0].count,0);
    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    const usageAfterTrainerDelete = await db.query(`select used_trainings from subscriptions where id='${ids.presenceSub}'`);
    assert.equal(usageAfterTrainerDelete.rows[0].used_trainings,1);
    await actor(db,'authenticated',ids.trainerUser,'trainer@test.invalid');
    await assert.rejects(()=>db.query(`select crm_delete_attendance('${trainerDeleteGuest.rows[0].id}')`),/authorized student attendance/i);
    await assert.rejects(()=>db.query(`select crm_delete_attendance('${outsideScopeAttendance.rows[0].id}')`),/authorized student attendance/i);
    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    await db.query(`update trainers set is_active=false where id='${ids.trainer}'`);
    await actor(db,'authenticated',ids.trainerUser,'trainer@test.invalid');
    await assert.rejects(()=>db.query(`select crm_delete_attendance('${neutralSubscribedOtherDate.rows[0].id}')`),/authorized student attendance/i);
    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    await db.query(`update trainers set is_active=true where id='${ids.trainer}'`);
    await db.query(`select crm_delete_attendance('${trainerDeleteGuest.rows[0].id}')`);
    await db.query(`select crm_delete_attendance('${outsideScopeAttendance.rows[0].id}')`);
    await db.query(`select crm_delete_attendance('${adminDeleteAttendance.rows[0].id}')`);
    await db.query(`select crm_delete_attendance('${neutralSubscribedOtherDate.rows[0].id}')`);
    const usageAfterLastDelete = await db.query(`select used_trainings from subscriptions where id='${ids.presenceSub}'`);
    assert.equal(usageAfterLastDelete.rows[0].used_trainings,0);
    const adminGuest = await db.query(`insert into attendance(date,guest_name,guest_type,group_id,quantity,entry_type) values(current_date-8,'Admin guest','trial','g1',1,'trial') returning id`);
    const adminRelink = await db.query(`select * from crm_relink_guest_attendance('g1','${ids.student}',array['${adminGuest.rows[0].id}'::uuid])`);
    assert.equal(adminRelink.rows[0].student_id,ids.student);
    const outsideGuest = await db.query(`insert into attendance(date,guest_name,guest_type,group_id,quantity,entry_type) values(current_date-7,'Outside','trial','g2',1,'trial') returning id`);
    await actor(db,'authenticated',ids.trainerUser,'trainer@test.invalid');
    await assert.rejects(() => db.query(`select * from crm_relink_guest_attendance('g2','${ids.student}',array['${outsideGuest.rows[0].id}'::uuid])`), /administrator required/i);
    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    const conversionGuest = await db.query(`select * from crm_record_attendance(null,null,current_date-6,'Retry guest','trial','g1',1,'trial','50000000-0000-0000-0000-000000000001')`);
    await actor(db,'authenticated',ids.trainerUser,'trainer@test.invalid');
    const conversionKey = '50000000-0000-0000-0000-000000000002';
    await assert.rejects(
      ()=>db.query(`select * from crm_convert_guest_to_student('g1',array['${conversionGuest.rows[0].id}'::uuid],'Retry Student',null,null,null,null,null,null,'${conversionKey}')`),
      /administrator required/i,
    );
    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    const converted = await db.query(`select * from crm_convert_guest_to_student('g1',array['${conversionGuest.rows[0].id}'::uuid],'Retry Student',null,null,null,null,null,null,'${conversionKey}')`);
    const convertedRetry = await db.query(`select * from crm_convert_guest_to_student('g1',array['${conversionGuest.rows[0].id}'::uuid],'Retry Student',null,null,null,null,null,null,'${conversionKey}')`);
    assert.equal(convertedRetry.rows[0].id,converted.rows[0].id);
    const convertedCount = await db.query(`select count(*)::int as count from students where name='Retry Student'`);
    assert.equal(convertedCount.rows[0].count,1);
    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    await assert.rejects(() => db.query(`select * from crm_record_attendance('${ids.expiredSub}','${ids.student}',current_date,null,null,'g1',1,'subscription','20000000-0000-0000-0000-000000000001')`), /does not cover/i);
    await assert.rejects(() => db.query(`select * from crm_record_attendance('${ids.exhaustedSub}','${ids.student}',current_date,null,null,'g1',1,'subscription','20000000-0000-0000-0000-000000000002')`), /no remaining/i);
    const limited = await db.query(`select * from crm_record_attendance('${ids.limitedSub}','${ids.student}',current_date,null,null,'g1',1,'subscription','20000000-0000-0000-0000-000000000009')`);
    const limitedRetry = await db.query(`select * from crm_record_attendance('${ids.limitedSub}','${ids.student}',current_date,null,null,'g1',1,'subscription','20000000-0000-0000-0000-000000000010')`);
    assert.equal(limitedRetry.rows[0].id,limited.rows[0].id);
    await assert.rejects(()=>db.query(`select * from crm_record_attendance('${ids.limitedSub}','${ids.student}',current_date,null,null,'g1',2,'subscription','20000000-0000-0000-0000-000000000011')`),/conflict/i);
    await assert.rejects(()=>db.query(`select * from crm_record_attendance('${ids.limitedSub}','${ids.student}',current_date+1,null,null,'g1',1,'subscription','20000000-0000-0000-0000-000000000012')`),/no remaining/i);
    await actor(db,'authenticated',ids.trainerUser,'trainer@test.invalid');
    const directAttendanceUpdate = await db.query(`update attendance set quantity=9 where id='${limited.rows[0].id}' returning id`);
    const directAttendanceDelete = await db.query(`delete from attendance where id='${limited.rows[0].id}' returning id`);
    assert.equal(directAttendanceUpdate.rows.length,0); assert.equal(directAttendanceDelete.rows.length,0);
    await assert.rejects(()=>db.query(`insert into attendance(student_id,date,group_id,quantity,entry_type) values('${ids.student}',current_date,'g1',1,'debt')`),/row-level security/i);
    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    await assert.rejects(() => db.query(`select * from crm_replace_attendance_quantity('${limited.rows[0].id}',1,2,'30000000-0000-0000-0000-000000000001')`), /no remaining/i);
    const unpaid = await db.query(`select * from crm_record_attendance(null,'${ids.student}',current_date-9,null,null,'g1',1,'unpaid','70000000-0000-0000-0000-000000000001')`);
    const unpaidRetry = await db.query(`select * from crm_record_attendance(null,'${ids.student}',current_date-9,null,null,'g1',1,'unpaid','70000000-0000-0000-0000-000000000002')`);
    assert.equal(unpaid.rows[0].entry_type,'unpaid'); assert.equal(unpaidRetry.rows[0].id,unpaid.rows[0].id);
    const implicitDebt = await db.query(`select * from crm_record_attendance(null,'${ids.student}',current_date-10,null,null,'g1',1,null,'70000000-0000-0000-0000-000000000003')`);
    assert.equal(implicitDebt.rows[0].entry_type,'debt');
    const syncAttendance = await db.query(`select * from crm_record_attendance('${ids.syncSub}','${ids.student}',current_date-2,null,null,'g1',1,'subscription','70000000-0000-0000-0000-000000000004')`);
    await db.query(`select * from crm_replace_attendance_quantity('${syncAttendance.rows[0].id}',1,2,'70000000-0000-0000-0000-000000000005')`);
    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    const fullyUsed = await db.query(`select used_trainings,activation_date,end_date from subscriptions where id='${ids.syncSub}'`);
    assert.equal(fullyUsed.rows[0].used_trainings,2);
    assert.equal(fullyUsed.rows[0].activation_date.toISOString().slice(0,10),new Date(Date.now()-2*86400000).toISOString().slice(0,10));
    assert.equal(fullyUsed.rows[0].end_date.toISOString().slice(0,10),new Date(Date.now()-2*86400000).toISOString().slice(0,10));
    await actor(db,'authenticated',ids.trainerUser,'trainer@test.invalid');
    await db.query(`select * from crm_replace_attendance_quantity('${syncAttendance.rows[0].id}',2,1,'70000000-0000-0000-0000-000000000006')`);
    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    const reducedUsage = await db.query(`select used_trainings,activation_date,end_date from subscriptions where id='${ids.syncSub}'`);
    assert.equal(reducedUsage.rows[0].used_trainings,1);
    assert.equal(reducedUsage.rows[0].activation_date.toISOString(),fullyUsed.rows[0].activation_date.toISOString());
    assert.equal(reducedUsage.rows[0].end_date.toISOString().slice(0,10),new Date(Date.now()+30*86400000).toISOString().slice(0,10));
    await db.query(`select * from crm_replace_attendance_quantity('${syncAttendance.rows[0].id}',1,2,'70000000-0000-0000-0000-000000000007')`);
    const fullyUsedAgain = await db.query(`select used_trainings,activation_date,end_date,original_end_date from subscriptions where id='${ids.syncSub}'`);
    assert.equal(fullyUsedAgain.rows[0].used_trainings,2);
    assert.equal(fullyUsedAgain.rows[0].end_date.toISOString(),fullyUsed.rows[0].end_date.toISOString());
    assert.equal(fullyUsedAgain.rows[0].original_end_date.toISOString(),reducedUsage.rows[0].end_date.toISOString());
    await db.query(`select crm_delete_attendance('${syncAttendance.rows[0].id}')`);
    const deletedPackUsage = await db.query(`select used_trainings,activation_date,end_date from subscriptions where id='${ids.syncSub}'`);
    assert.equal(deletedPackUsage.rows[0].used_trainings,0);
    assert.equal(deletedPackUsage.rows[0].activation_date,null);
    assert.equal(deletedPackUsage.rows[0].end_date.toISOString(),reducedUsage.rows[0].end_date.toISOString());
    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    const first = await db.query(`select * from crm_record_attendance('${ids.validSub}','${ids.student}',current_date,null,null,'g1',1,'subscription','20000000-0000-0000-0000-000000000003')`);
    assert.equal(first.rows.length,1);
    const attendanceIdForQuantity = first.rows[0].id;
    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    const unchanged = await db.query(`select a.quantity,s.used_trainings from attendance a join subscriptions s on s.id=a.sub_id where a.id='${limited.rows[0].id}'`);
    assert.equal(unchanged.rows[0].quantity,1); assert.equal(unchanged.rows[0].used_trainings,1);
    const activation = await db.query(`select activation_date from subscriptions where id='${ids.validSub}'`);
    assert.ok(activation.rows[0].activation_date);
    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    await assert.rejects(() => db.query(`select * from crm_record_attendance('${ids.validSub}','${ids.student}',current_date,null,null,'g1',2,'subscription','20000000-0000-0000-0000-000000000003')`), /idempotency key conflict/i);
    const changed = await db.query(`select * from crm_replace_attendance_quantity('${attendanceIdForQuantity}',1,2,'30000000-0000-0000-0000-000000000002')`);
    assert.equal(changed.rows[0].quantity,2);
    const competingUsage = await Promise.allSettled([
      db.query(`select * from crm_replace_attendance_quantity('${attendanceIdForQuantity}',2,3,'30000000-0000-0000-0000-000000000003')`),
      db.query(`select * from crm_replace_attendance_quantity('${attendanceIdForQuantity}',2,4,'30000000-0000-0000-0000-000000000004')`),
    ]);
    assert.equal(competingUsage.filter((result)=>result.status==='fulfilled').length,1);
    assert.equal(competingUsage.filter((result)=>result.status==='rejected').length,1);
    const multiUnit = await db.query(`select * from crm_record_attendance(null,'${ids.student}',current_date-5,null,null,'g1',2,'debt','60000000-0000-0000-0000-000000000001')`);
    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    const multiInspection = await db.query(`select * from crm_admin_inspect_attendance_payment('${multiUnit.rows[0].id}')`);
    assert.equal(multiInspection.rows[0].status,'unsupported_quantity');
    for (const key of ['60000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000003']) {
      await assert.rejects(()=>db.query(`select * from crm_admin_confirm_attendance_payment('${multiUnit.rows[0].id}',600,'cash','${key}')`),/exactly one training/i);
    }
    const unchangedMulti = await db.query(`select quantity,sub_id from attendance where id='${multiUnit.rows[0].id}'`);
    assert.deepEqual(unchangedMulti.rows[0],{quantity:2,sub_id:null});
    const noMultiPayment = await db.query(`select count(*)::int as count from subscriptions where source_attendance_id='${multiUnit.rows[0].id}'`);
    assert.equal(noMultiPayment.rows[0].count,0);
    const validCounters = await db.query(`select count(*)::int as count from subscriptions where used_trainings>total_trainings`);
    assert.equal(validCounters.rows[0].count,0);
    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    const trial = await db.query(`select * from crm_record_attendance(null,'${ids.student}',current_date-1,null,null,'g1',1,'trial','20000000-0000-0000-0000-000000000004')`);
    const attendanceId = trial.rows[0].id;
    await actor(db,'authenticated',ids.trainerUser,'trainer@test.invalid');
    await assert.rejects(() => db.query(`select * from crm_admin_confirm_attendance_payment('${attendanceId}',150,'cash','20000000-0000-0000-0000-000000000005')`), /administrator required/i);
    await assert.rejects(() => db.query(`select price,payment_method from room_bookings`), /permission denied/i);
    await assert.rejects(() => db.query(`insert into room_bookings(date,start_time,end_time,trainer_id,title,type,booking_type,price,payment_method,event_type) values(current_date,'10:00','11:00','${ids.trainerUser}','Bad','individual','individual',300,'cash','individual_training')`), /administrator may set booking finance/i);
    const allowedIndividual = await db.query(`insert into room_bookings(date,start_time,end_time,trainer_id,title,type,booking_type,event_type) values(current_date,'06:00','07:00','${ids.trainerUser}','Allowed individual','individual','individual_1_2','individual_training') returning id`);
    assert.equal(allowedIndividual.rows.length,1);
    for (const statement of [
      `insert into room_bookings(date,start_time,end_time,trainer_id,title,type,booking_type,event_type) values(current_date,'06:00','07:00','${ids.trainerUser}','Cleaning','cleaning','cleaning','cleaning')`,
      `insert into room_bookings(date,start_time,end_time,trainer_id,title,type,event_type) values(current_date,'06:00','07:00','${ids.trainerUser}','Custom','custom','custom_admin_event')`,
      `insert into room_bookings(date,start_time,end_time,trainer_id,title,type,event_type) values(current_date,'06:00','07:00','${ids.trainerUser}','Mismatch','individual','room_booking')`,
      `insert into room_bookings(date,start_time,end_time,trainer_id,title,type,booking_type,event_type) values(current_date,'06:00','07:00','${ids.trainerUser}','Arbitrary tariff','individual','arbitrary','individual_training')`,
    ]) await assert.rejects(()=>db.query(statement),/unsupported trainer booking classification/i);
    const trainerCreatePayload = normalizeTrainerBookingPayload({
      payload:{date:new Date().toISOString().slice(0,10),startTime:'08:00',endTime:'09:00',trainerId:ids.trainerUser,title:'UI create',eventType:'room_booking',color:'#111111',roomName:'Main'},
      currentUserId:ids.trainerUser,ownerIds:[ids.trainerUser,ids.trainer],
    });
    const uiCreated = await insertBuiltBooking(db,buildRoomBookingInsertRow(trainerCreatePayload));
    const uiExisting = mapRoomBookingRow(uiCreated.rows[0]);
    const uiEditPayload = normalizeTrainerBookingPayload({payload:{title:'UI edited',color:'#222222',startTime:'08:15',endTime:'09:15'},existing:uiExisting,currentUserId:ids.trainerUser,ownerIds:[ids.trainerUser,ids.trainer]});
    const uiEdited = await updateBuiltBooking(db,uiCreated.rows[0].id,buildRoomBookingUpdateRow(uiEditPayload));
    assert.deepEqual([uiEdited.rows[0].type,uiEdited.rows[0].booking_type,uiEdited.rows[0].event_type,uiEdited.rows[0].trainer_id],['room_booking',null,'room_booking',ids.trainerUser]);
    const booking = await db.query(`insert into room_bookings(date,start_time,end_time,trainer_id,title,type,event_type) values(current_date,'10:00','11:00','${ids.trainerUser}','Safe','room_booking','room_booking') returning id`);
    await assert.rejects(() => db.query(`update room_bookings set price=300 where id='${booking.rows[0].id}'`), /administrator may change booking finance/i);
    await db.query(`update room_bookings set title='Safe updated' where id='${booking.rows[0].id}'`);
    await db.query(`delete from room_bookings where id='${booking.rows[0].id}'`);
    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    const adminCleaning = await db.query(`insert into room_bookings(date,start_time,end_time,trainer_id,title,type,booking_type,event_type) values(current_date,'05:00','06:00','${ids.trainerUser}','Admin cleaning','cleaning','cleaning','cleaning') returning id`);
    assert.equal(adminCleaning.rows.length,1);
    const legacyProfile = await db.query(`insert into room_bookings(date,start_time,end_time,trainer_id,title,type,booking_type,event_type,color) values(current_date,'07:00','08:00','${ids.trainer}','Legacy profile','individual','individual','room_booking','#333333') returning id,date,start_time,end_time,trainer_id,title,type,booking_type,event_type,color,status,room_name`);
    await actor(db,'authenticated',ids.trainerUser,'trainer@test.invalid');
    const legacyExisting = mapRoomBookingRow(legacyProfile.rows[0]);
    const legacyEditPayload = normalizeTrainerBookingPayload({payload:{title:'Legacy edited',color:'#444444',startTime:'07:15',endTime:'08:15',bookingType:null,eventType:'individual_training',trainerId:ids.trainerUser},existing:legacyExisting,currentUserId:ids.trainerUser,ownerIds:[ids.trainerUser,ids.trainer]});
    const legacyEdited = await updateBuiltBooking(db,legacyProfile.rows[0].id,buildRoomBookingUpdateRow(legacyEditPayload));
    assert.deepEqual([legacyEdited.rows[0].type,legacyEdited.rows[0].booking_type,legacyEdited.rows[0].event_type,legacyEdited.rows[0].trainer_id],['individual','individual','room_booking',ids.trainer]);
    await assert.rejects(()=>db.query(`update room_bookings set booking_type='changed' where id='${legacyProfile.rows[0].id}'`),/administrator may change/i);
    await assert.rejects(()=>db.query(`update room_bookings set trainer_id='${ids.trainerUser}' where id='${legacyProfile.rows[0].id}'`),/administrator may change/i);
    await assert.rejects(()=>db.query(`update room_bookings set price=1 where id='${legacyProfile.rows[0].id}'`),/administrator may change/i);
    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    const legacyBooking = await db.query(`insert into room_bookings(date,start_time,end_time,trainer_id,title,payment_method,event_type,people_count,note,description) values(current_date,'09:00','10:00','${ids.trainerUser}','Legacy','none','room_booking',2,'auth note','auth description') returning id`);
    const unknownMethodBooking = await db.query(`insert into room_bookings(date,start_time,end_time,trainer_id,title,payment_method,event_type) values(current_date,'09:30','10:30','${ids.trainerUser}','Unknown method','mystery','room_booking') returning id`);
    await db.query(`insert into room_bookings(date,start_time,end_time,trainer_id,title,event_type,people_count,note,description) values(current_date,'10:00','11:00','${ids.trainer}','Profile owner','room_booking',3,'profile note','profile description')`);
    await db.query(`insert into room_bookings(date,start_time,end_time,trainer_id,title,price,payment_method,event_type,people_count,note,description) values(current_date,'11:00','12:00','${ids.otherTrainer}','Foreign',900,'wire','individual_training',4,'foreign note','foreign description')`);
    const protectedBooking = await db.query(`insert into room_bookings(date,start_time,end_time,trainer_id,title,price,payment_method,event_type) values(current_date,'12:00','13:00','${ids.trainerUser}','Paid',500,'cash','individual_training') returning id`);
    await actor(db,'authenticated',ids.trainerUser,'trainer@test.invalid');
    await db.query(`update room_bookings set people_count=6,note='auth edited',description='auth saved' where id='${legacyBooking.rows[0].id}'`);
    const trainerReplacementId = '84000000-0000-0000-0000-000000000001';
    await assert.rejects(
      ()=>db.query(`update room_bookings set id='${trainerReplacementId}' where id='${legacyBooking.rows[0].id}'`),
      /booking id is immutable/i,
    );
    const trainerIdentity = await db.query(`select count(*)::int as original_count,count(*) filter(where id='${trainerReplacementId}')::int as replacement_count from room_bookings where id in ('${legacyBooking.rows[0].id}','${trainerReplacementId}')`);
    assert.deepEqual(trainerIdentity.rows[0],{original_count:1,replacement_count:0});
    const projection = await db.query(`select trainer_id,people_count,note,description,price,payment_method from crm_fetch_schedule_room_bookings()`);
    const authOwned = projection.rows.find((row)=>row.trainer_id===ids.trainerUser && row.note==='auth edited');
    const profileOwned = projection.rows.find((row)=>row.trainer_id===ids.trainer && row.note==='profile note');
    const foreign = projection.rows.find((row)=>row.trainer_id===ids.otherTrainer);
    assert.deepEqual([authOwned.people_count,authOwned.note,authOwned.description],[6,'auth edited','auth saved']);
    assert.deepEqual([profileOwned.people_count,profileOwned.note,profileOwned.description],[3,'profile note','profile description']);
    assert.deepEqual([foreign.people_count,foreign.note,foreign.description],[null,null,null]);
    assert.ok(projection.rows.every((row)=>row.price===null && row.payment_method===null));
    await db.query(`update room_bookings set people_count=5,note='profile edited',description='profile saved' where trainer_id='${ids.trainer}'`);
    const savedProjection = await db.query(`select people_count,note,description,price,payment_method from crm_fetch_schedule_room_bookings() where trainer_id='${ids.trainer}'`);
    assert.deepEqual(savedProjection.rows[0],{people_count:5,note:'profile edited',description:'profile saved',price:null,payment_method:null});
    await db.query(`delete from room_bookings where id='${legacyBooking.rows[0].id}'`);
    await assert.rejects(() => db.query(`delete from room_bookings where id='${unknownMethodBooking.rows[0].id}'`), /administrator may delete/i);
    await assert.rejects(() => db.query(`delete from room_bookings where id='${protectedBooking.rows[0].id}'`), /administrator may delete/i);
    const foreignDelete = await db.query(`delete from room_bookings where trainer_id='${ids.otherTrainer}' returning id`);
    assert.equal(foreignDelete.rows.length,0);
    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    const adminReplacementId = '84000000-0000-0000-0000-000000000002';
    await assert.rejects(
      ()=>db.query(`update room_bookings set id='${adminReplacementId}' where id='${protectedBooking.rows[0].id}'`),
      /booking id is immutable/i,
    );
    const adminIdentity = await db.query(`select count(*)::int as original_count,count(*) filter(where id='${adminReplacementId}')::int as replacement_count from room_bookings where id in ('${protectedBooking.rows[0].id}','${adminReplacementId}')`);
    assert.deepEqual(adminIdentity.rows[0],{original_count:1,replacement_count:0});
    await db.query(`update trainers set is_active=false where id='${ids.trainer}'`);
    await actor(db,'authenticated',ids.trainerUser,'trainer@test.invalid');
    await assert.rejects(() => db.query(`insert into room_bookings(date,start_time,end_time,trainer_id,title,event_type) values(current_date,'14:00','15:00','${ids.trainerUser}','Inactive','room_booking')`), /not allowed/i);
    const inactiveDelete = await db.query(`delete from room_bookings where id='${protectedBooking.rows[0].id}' returning id`);
    assert.equal(inactiveDelete.rows.length,0);
    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    await db.query(`update trainers set is_active=true where id='${ids.trainer}'`);
    const payment = await db.query(`select * from crm_admin_confirm_attendance_payment('${attendanceId}',150,'cash','20000000-0000-0000-0000-000000000005')`);
    const concurrentPayment = await db.query(`select * from crm_admin_confirm_attendance_payment('${attendanceId}',150,'cash','20000000-0000-0000-0000-000000000006')`);
    assert.equal(payment.rows.length,1);
    assert.equal(concurrentPayment.rows[0].id,payment.rows[0].id);
    const confirmedInspection = await db.query(`select * from crm_admin_inspect_attendance_payment('${attendanceId}')`);
    assert.equal(confirmedInspection.rows[0].status,'already_confirmed');
    await assert.rejects(() => db.query(`select * from crm_admin_confirm_attendance_payment('${attendanceId}',300,'card','20000000-0000-0000-0000-000000000005')`), /conflict/i);
    const linked = await db.query(`select entry_type,sub_id from attendance where id='${attendanceId}'`);
    assert.equal(linked.rows[0].entry_type,'subscription'); assert.equal(linked.rows[0].sub_id,payment.rows[0].id);
    await db.query(`select crm_delete_attendance('${attendanceId}')`);
    const preserved = await db.query(`select count(*)::int as count,max(used_trainings)::int as used from subscriptions where id='${payment.rows[0].id}'`);
    assert.equal(preserved.rows[0].count,1); assert.equal(preserved.rows[0].used,0);
    const retryAfterAttendanceDelete = await db.query(`select * from crm_admin_confirm_attendance_payment('${attendanceId}',150,'cash','20000000-0000-0000-0000-000000000005')`);
    assert.equal(retryAfterAttendanceDelete.rows[0].id,payment.rows[0].id);
    const deletedAttendanceInspection = await db.query(`select * from crm_admin_inspect_attendance_payment('${attendanceId}')`);
    assert.equal(deletedAttendanceInspection.rows[0].status,'already_confirmed');

    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    const unmarkedAttendance = await db.query(`select * from crm_record_attendance(null,'${ids.student}',current_date-30,null,null,'g1',1,'unpaid','41000000-0000-0000-0000-000000000001')`);
    await db.query(`insert into subscriptions(student_id,group_id,plan_type,start_date,end_date,total_trainings,used_trainings,amount,paid,pay_method,notes)
      values('${ids.student}','g1','single',current_date-30,current_date-30,1,1,300,true,'card',null)`);
    const unmarkedInspection = await db.query(`select * from crm_admin_inspect_attendance_payment('${unmarkedAttendance.rows[0].id}')`);
    assert.equal(unmarkedInspection.rows[0].status,'legacy_unmarked_match');
    assert.match(unmarkedInspection.rows[0].message,/історична оплата без технічного зв’язку/i);
    await assert.rejects(
      ()=>db.query(`select * from crm_admin_confirm_attendance_payment('${unmarkedAttendance.rows[0].id}',300,'cash','41000000-0000-0000-0000-000000000002',false,'single')`),
      /historical unmarked payment/i,
    );
    const unmarkedPaymentCount = await db.query(`select count(*)::int as count from subscriptions where student_id='${ids.student}' and group_id='g1' and start_date=current_date-30 and plan_type='single'`);
    assert.equal(unmarkedPaymentCount.rows[0].count,1);

    const multipleUnmarkedAttendance = await db.query(`select * from crm_record_attendance(null,'${ids.student}',current_date-31,null,null,'g1',1,'unpaid','41000000-0000-0000-0000-000000000003')`);
    await db.query(`insert into subscriptions(student_id,group_id,plan_type,start_date,end_date,total_trainings,used_trainings,amount,paid,pay_method)
      values
      ('${ids.student}','g1','single',current_date-31,current_date-31,1,1,300,true,'cash'),
      ('${ids.student}','g1','trial',current_date-31,current_date-31,1,1,150,true,'card')`);
    const multipleUnmarkedInspection = await db.query(`select * from crm_admin_inspect_attendance_payment('${multipleUnmarkedAttendance.rows[0].id}')`);
    assert.equal(multipleUnmarkedInspection.rows[0].status,'legacy_unmarked_match');
    await assert.rejects(
      ()=>db.query(`select * from crm_admin_confirm_attendance_payment('${multipleUnmarkedAttendance.rows[0].id}',300,'cash','41000000-0000-0000-0000-000000000004',false,'single')`),
      /historical unmarked payment/i,
    );
    const clearAttendance = await db.query(`select * from crm_record_attendance(null,'${ids.student}',current_date-32,null,null,'g1',1,'unpaid','41000000-0000-0000-0000-000000000005')`);
    const clearInspection = await db.query(`select * from crm_admin_inspect_attendance_payment('${clearAttendance.rows[0].id}')`);
    assert.equal(clearInspection.rows[0].status,'clear');

    const legacyAttendance = await db.query(`select * from crm_record_attendance(null,'${ids.student}',current_date-2,null,null,'g1',1,'trial','40000000-0000-0000-0000-000000000001')`);
    await actor(db,'authenticated',ids.trainerUser,'trainer@test.invalid');
    await assert.rejects(() => db.query(`select * from crm_admin_inspect_attendance_payment('${legacyAttendance.rows[0].id}')`), /administrator required/i);
    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    const legacy = await db.query(`insert into subscriptions(student_id,group_id,plan_type,start_date,end_date,total_trainings,used_trainings,amount,paid,pay_method,notes) values('${ids.student}','g1','trial',current_date-2,current_date-2,1,1,150,true,'card','auto_one_off_from_attendance:${legacyAttendance.rows[0].id}') returning id`);
    const inspection = await db.query(`select * from crm_admin_inspect_attendance_payment('${legacyAttendance.rows[0].id}')`);
    assert.equal(inspection.rows[0].status,'legacy_unverified');
    await assert.rejects(() => db.query(`select * from crm_admin_confirm_attendance_payment('${legacyAttendance.rows[0].id}',150,'cash','40000000-0000-0000-0000-000000000002',false,'trial')`), /explicit reconciliation/i);
    const stillUnverified = await db.query(`select source_attendance_id,paid,pay_method from subscriptions where id='${legacy.rows[0].id}'`);
    assert.deepEqual(stillUnverified.rows[0],{source_attendance_id:null,paid:true,pay_method:'card'});
    const reconciled = await db.query(`select * from crm_admin_confirm_attendance_payment('${legacyAttendance.rows[0].id}',150,'cash','40000000-0000-0000-0000-000000000002',true,'trial')`);
    assert.equal(reconciled.rows[0].id,legacy.rows[0].id);
    const reconciledAttendance = await db.query(`select sub_id,entry_type from attendance where id='${legacyAttendance.rows[0].id}'`);
    assert.deepEqual(reconciledAttendance.rows[0],{sub_id:legacy.rows[0].id,entry_type:'subscription'});
    const reconciliationAudit = await db.query(`select count(*)::int as count from financial_change_audit where table_name='subscriptions' and row_id='${legacy.rows[0].id}' and operation='UPDATE'`);
    assert.equal(reconciliationAudit.rows[0].count,1);

    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    const ambiguousAttendance = await db.query(`select * from crm_record_attendance(null,'${ids.student}',current_date-3,null,null,'g1',1,'single','40000000-0000-0000-0000-000000000003')`);
    const mismatchAttendance = await db.query(`select * from crm_record_attendance(null,'${ids.student}',current_date-4,null,null,'g1',1,'single','40000000-0000-0000-0000-000000000004')`);
    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    await db.query(`insert into subscriptions(student_id,group_id,plan_type,start_date,end_date,total_trainings,used_trainings,amount,paid,pay_method,notes) values
      ('${ids.student}','g1','single',current_date-3,current_date-3,1,1,300,true,'card','auto_one_off_from_attendance:${ambiguousAttendance.rows[0].id}'),
      ('${ids.student}','g1','single',current_date-3,current_date-3,1,1,300,true,'card','auto_one_off_from_attendance:${ambiguousAttendance.rows[0].id}'),
      ('${ids.student}','wrong-group','single',current_date-4,current_date-4,1,1,300,true,'card','auto_one_off_from_attendance:${mismatchAttendance.rows[0].id}')`);
    await assert.rejects(() => db.query(`select * from crm_admin_confirm_attendance_payment('${ambiguousAttendance.rows[0].id}',300,'cash','40000000-0000-0000-0000-000000000005',true)`), /multiple legacy/i);
    await assert.rejects(() => db.query(`select * from crm_admin_confirm_attendance_payment('${mismatchAttendance.rows[0].id}',300,'cash','40000000-0000-0000-0000-000000000006',true)`), /does not match/i);
    const untouchedLegacy = await db.query(`select count(*)::int as count from subscriptions where source_attendance_id is not null and source_attendance_id in ('${ambiguousAttendance.rows[0].id}','${mismatchAttendance.rows[0].id}')`);
    assert.equal(untouchedLegacy.rows[0].count,0);
  } finally { await db.close(); }
});

test('financial migration tolerates installations without optional legacy payment helpers', async () => {
  const db = new PGlite();
  try {
    const withoutOptionalHelpers = bootstrap
      .split('\n')
      .filter((line) => !line.startsWith('create function crm_ensure_one_off_payment_for_attendance')
        && !line.startsWith('create function crm_remove_one_off_payment_if_orphan'))
      .join('\n');
    await db.exec(withoutOptionalHelpers);
    await db.exec(migration);
    const functions = await db.query(`select
      to_regprocedure('public.crm_ensure_one_off_payment_for_attendance(uuid)')::text as ensure_helper,
      to_regprocedure('public.crm_remove_one_off_payment_if_orphan(uuid)')::text as remove_helper`);
    assert.deepEqual(functions.rows[0],{ensure_helper:null,remove_helper:null});
  } finally {
    await db.close();
  }
});

test('new booking classification follows every event type transition', () => {
  assert.equal(classificationTypeForEventType('room_booking'),'room_booking');
  assert.equal(classificationTypeForEventType('individual_training'),'individual');
  assert.equal(classificationTypeForEventType('room_booking'),'room_booking');
  const normalized = normalizeTrainerBookingPayload({
    payload:{eventType:'room_booking',type:'individual',trainerId:ids.trainerUser},
    currentUserId:ids.trainerUser,ownerIds:[ids.trainerUser,ids.trainer],
  });
  assert.equal(normalized.type,'room_booking');
  const roomPayload = {date:'2026-10-08',startTime:'10:00',endTime:'11:00',title:'Room',eventType:'room_booking',type:'room_booking',bookingType:null};
  const ordinary = buildRoomBookingInsertRow(roomPayload);
  const override = buildRoomBookingRpcParams(roomPayload);
  assert.equal(ordinary.type,'room_booking');
  assert.equal(ordinary.booking_type,null);
  assert.equal(override.p_type,ordinary.type);
  assert.equal(override.p_booking_type,ordinary.booking_type);
  const duplicatedRoom = buildRoomBookingRpcParams({...roomPayload,title:'Room copy',bookingType:null});
  assert.equal(duplicatedRoom.p_booking_type,null);
  assert.equal(duplicatedRoom.p_type,'room_booking');
  assert.deepEqual(
    buildRoomBookingRpcParams({eventType:'individual_training',type:'individual',bookingType:'individual_1_2'}),
    {...buildRoomBookingRpcParams({eventType:'individual_training',type:'individual'}),p_booking_type:'individual_1_2'},
  );
});

test.skip('two independent PostgreSQL connections serialize attendance payment confirmation', () => {
  // This repository environment has no PostgreSQL server/container. PGlite exposes
  // one in-process connection, so Promise.all here would not prove cross-connection locking.
});

test.skip('two independent trainer-presence connections wait and re-read the same eligible subscription', () => {
  // PGlite exposes one in-process connection only. The migration-level assertion
  // verifies a student/group advisory lock plus blocking FOR UPDATE (no SKIP
  // LOCKED), while this cross-connection proof must run in the disposable
  // server-backed Supabase integration environment.
});

test.skip('independent PostgreSQL deletion and quantity/relink requests serialize subscription usage', () => {
  // PGlite provides one in-process connection. A real server with at least two
  // independent connections is required to prove row-lock serialization.
});

test.skip('independent conversion and quantity replacement serialize without over-capacity', () => {
  // Staging-required: PGlite has one in-process connection and Promise.all
  // would not prove PostgreSQL row/advisory lock behavior across connections.
});

test.skip('independent trainer and admin attendance creates share lock order without deadlock', () => {
  // Staging-required: needs two server-backed PostgreSQL connections targeting
  // the same natural attendance identity and student/group simultaneously.
});
