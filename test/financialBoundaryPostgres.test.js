import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { buildRoomBookingInsertRow, buildRoomBookingUpdateRow } from '../src/roomBookingPayload.js';
import { normalizeTrainerBookingPayload } from '../src/trainerBookingPayload.js';

const migration = fs.readFileSync(new URL('../supabase/migrations/20261005090000_harden_financial_attendance_boundary.sql', import.meta.url), 'utf8');
const ids = {
  student: '10000000-0000-0000-0000-000000000001', trainer: '10000000-0000-0000-0000-000000000002',
  trainerUser: '10000000-0000-0000-0000-000000000003', adminUser: '10000000-0000-0000-0000-000000000004',
  validSub: '10000000-0000-0000-0000-000000000005', expiredSub: '10000000-0000-0000-0000-000000000006',
  exhaustedSub: '10000000-0000-0000-0000-000000000007',
  otherTrainer: '10000000-0000-0000-0000-000000000008', otherTrainerUser: '10000000-0000-0000-0000-000000000009',
  limitedSub: '10000000-0000-0000-0000-000000000010',
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
create policy room_admin on room_bookings for all to authenticated using(rls_is_admin()) with check(rls_is_admin());
create policy room_trainer_select on room_bookings for select to authenticated using(trainer_id=auth.uid()::text);
create policy room_trainer_insert on room_bookings for insert to authenticated with check(trainer_id=auth.uid()::text);
create policy room_trainer_update on room_bookings for update to authenticated using(trainer_id=auth.uid()::text) with check(trainer_id=auth.uid()::text);
create policy room_trainer_delete on room_bookings for delete to authenticated using(trainer_id=auth.uid()::text);
insert into groups values('g1',null),('g2',null); insert into students values('${ids.student}','Test'); insert into student_groups values('${ids.student}','g1'),('${ids.student}','g2');
insert into trainers values('${ids.trainer}','Trainer','${ids.trainerUser}',true,null,null),('${ids.otherTrainer}','Other','${ids.otherTrainerUser}',true,null,null); insert into trainer_groups values('${ids.trainer}','g1',true);
alter table trainers enable row level security; revoke all on trainers from public,anon,authenticated; grant select,update on trainers to authenticated;
create policy trainers_admin_only on trainers for all to authenticated using(rls_is_admin()) with check(rls_is_admin());
insert into subscriptions(id,student_id,group_id,plan_type,start_date,end_date,total_trainings,used_trainings,amount,paid) values
('${ids.validSub}','${ids.student}','g1','4pack',current_date-1,current_date+30,4,0,1000,true),
('${ids.expiredSub}','${ids.student}','g1','4pack',current_date-40,current_date-1,4,0,1000,true),
('${ids.exhaustedSub}','${ids.student}','g1','single',current_date-1,current_date+1,1,1,300,true),
('${ids.limitedSub}','${ids.student}','g1','single',current_date-1,current_date+1,1,0,300,true);
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
    await db.exec(`create policy room_trainer_profile_owner on room_bookings for all to authenticated using(crm_is_active_booking_owner(trainer_id)) with check(crm_is_active_booking_owner(trainer_id));`);
    await actor(db,'authenticated',ids.trainerUser,'trainer@test.invalid');
    const hiddenTrainer = await db.query(`select * from trainers`);
    assert.equal(hiddenTrainer.rows.length,0);
    const finalPolicies = await db.query(`select tablename,policyname from pg_policies where schemaname='public' and tablename in ('attendance','subscriptions') order by tablename,policyname`);
    assert.deepEqual(finalPolicies.rows,[
      {tablename:'attendance',policyname:'attendance_admin_all'},
      {tablename:'attendance',policyname:'attendance_trainer_select_own_groups'},
      {tablename:'subscriptions',policyname:'subscriptions_admin_all'},
    ]);
    const hiddenFinance = await db.query(`select * from subscriptions`);
    assert.equal(hiddenFinance.rows.length,0);
    await assert.rejects(()=>db.query(`insert into subscriptions(student_id,group_id,plan_type,start_date,end_date,total_trainings,used_trainings,amount,paid) values('${ids.student}','g1','single',current_date,current_date,1,0,300,true)`),/row-level security/i);
    const operationalSubs = await db.query(`select * from crm_fetch_my_attendance_subscriptions()`);
    assert.ok(operationalSubs.rows.length>=1);
    assert.equal(Object.hasOwn(operationalSubs.rows[0],'amount'),false);
    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    const adminGuest = await db.query(`insert into attendance(date,guest_name,guest_type,group_id,quantity,entry_type) values(current_date-8,'Admin guest','trial','g1',1,'trial') returning id`);
    const adminRelink = await db.query(`select * from crm_relink_guest_attendance('g1','${ids.student}',array['${adminGuest.rows[0].id}'::uuid])`);
    assert.equal(adminRelink.rows[0].student_id,ids.student);
    const outsideGuest = await db.query(`insert into attendance(date,guest_name,guest_type,group_id,quantity,entry_type) values(current_date-7,'Outside','trial','g2',1,'trial') returning id`);
    await actor(db,'authenticated',ids.trainerUser,'trainer@test.invalid');
    await assert.rejects(() => db.query(`select * from crm_relink_guest_attendance('g2','${ids.student}',array['${outsideGuest.rows[0].id}'::uuid])`), /outside trainer group/i);
    const conversionGuest = await db.query(`select * from crm_record_attendance(null,null,current_date-6,'Retry guest','trial','g1',1,'trial','50000000-0000-0000-0000-000000000001')`);
    const conversionKey = '50000000-0000-0000-0000-000000000002';
    const converted = await db.query(`select * from crm_convert_guest_to_student('g1',array['${conversionGuest.rows[0].id}'::uuid],'Retry Student',null,null,null,null,null,null,'${conversionKey}')`);
    const convertedRetry = await db.query(`select * from crm_convert_guest_to_student('g1',array['${conversionGuest.rows[0].id}'::uuid],'Retry Student',null,null,null,null,null,null,'${conversionKey}')`);
    assert.equal(convertedRetry.rows[0].id,converted.rows[0].id);
    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    const convertedCount = await db.query(`select count(*)::int as count from students where name='Retry Student'`);
    assert.equal(convertedCount.rows[0].count,1);
    await actor(db,'authenticated',ids.trainerUser,'trainer@test.invalid');
    await assert.rejects(() => db.query(`select * from crm_record_attendance('${ids.expiredSub}','${ids.student}',current_date,null,null,'g1',1,'subscription','20000000-0000-0000-0000-000000000001')`), /does not cover/i);
    await assert.rejects(() => db.query(`select * from crm_record_attendance('${ids.exhaustedSub}','${ids.student}',current_date,null,null,'g1',1,'subscription','20000000-0000-0000-0000-000000000002')`), /no remaining/i);
    const limited = await db.query(`select * from crm_record_attendance('${ids.limitedSub}','${ids.student}',current_date,null,null,'g1',1,'subscription','20000000-0000-0000-0000-000000000009')`);
    const limitedRetry = await db.query(`select * from crm_record_attendance('${ids.limitedSub}','${ids.student}',current_date,null,null,'g1',1,'subscription','20000000-0000-0000-0000-000000000010')`);
    assert.equal(limitedRetry.rows[0].id,limited.rows[0].id);
    await assert.rejects(()=>db.query(`select * from crm_record_attendance('${ids.limitedSub}','${ids.student}',current_date,null,null,'g1',2,'subscription','20000000-0000-0000-0000-000000000011')`),/conflict/i);
    await assert.rejects(()=>db.query(`select * from crm_record_attendance('${ids.limitedSub}','${ids.student}',current_date+1,null,null,'g1',1,'subscription','20000000-0000-0000-0000-000000000012')`),/no remaining/i);
    const directAttendanceUpdate = await db.query(`update attendance set quantity=9 where id='${limited.rows[0].id}' returning id`);
    const directAttendanceDelete = await db.query(`delete from attendance where id='${limited.rows[0].id}' returning id`);
    assert.equal(directAttendanceUpdate.rows.length,0); assert.equal(directAttendanceDelete.rows.length,0);
    await assert.rejects(()=>db.query(`insert into attendance(student_id,date,group_id,quantity,entry_type) values('${ids.student}',current_date,'g1',1,'debt')`),/row-level security/i);
    await assert.rejects(() => db.query(`select * from crm_replace_attendance_quantity('${limited.rows[0].id}',1,2,'30000000-0000-0000-0000-000000000001')`), /no remaining/i);
    const first = await db.query(`select * from crm_record_attendance('${ids.validSub}','${ids.student}',current_date,null,null,'g1',1,'subscription','20000000-0000-0000-0000-000000000003')`);
    assert.equal(first.rows.length,1);
    const attendanceIdForQuantity = first.rows[0].id;
    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    const unchanged = await db.query(`select a.quantity,s.used_trainings from attendance a join subscriptions s on s.id=a.sub_id where a.id='${limited.rows[0].id}'`);
    assert.equal(unchanged.rows[0].quantity,1); assert.equal(unchanged.rows[0].used_trainings,1);
    const activation = await db.query(`select activation_date from subscriptions where id='${ids.validSub}'`);
    assert.ok(activation.rows[0].activation_date);
    await actor(db,'authenticated',ids.trainerUser,'trainer@test.invalid');
    await assert.rejects(() => db.query(`select * from crm_record_attendance('${ids.validSub}','${ids.student}',current_date,null,null,'g1',2,'subscription','20000000-0000-0000-0000-000000000003')`), /idempotency key conflict/i);
    const changed = await db.query(`select * from crm_replace_attendance_quantity('${attendanceIdForQuantity}',1,2,'30000000-0000-0000-0000-000000000002')`);
    assert.equal(changed.rows[0].quantity,2);
    const competingUsage = await Promise.allSettled([
      db.query(`select * from crm_replace_attendance_quantity('${attendanceIdForQuantity}',2,3,'30000000-0000-0000-0000-000000000003')`),
      db.query(`select * from crm_replace_attendance_quantity('${attendanceIdForQuantity}',2,4,'30000000-0000-0000-0000-000000000004')`),
    ]);
    assert.equal(competingUsage.filter((result)=>result.status==='fulfilled').length,1);
    assert.equal(competingUsage.filter((result)=>result.status==='rejected').length,1);
    const trial = await db.query(`select * from crm_record_attendance(null,'${ids.student}',current_date-1,null,null,'g1',1,'trial','20000000-0000-0000-0000-000000000004')`);
    const attendanceId = trial.rows[0].id;
    await assert.rejects(() => db.query(`select * from crm_admin_confirm_attendance_payment('${attendanceId}',150,'cash','20000000-0000-0000-0000-000000000005')`), /administrator required/i);
    await assert.rejects(() => db.query(`insert into room_bookings(date,start_time,end_time,trainer_id,title,price,payment_method,event_type) values(current_date,'10:00','11:00','${ids.trainerUser}','Bad',300,'cash','individual_training')`), /administrator may set booking finance/i);
    const trainerCreatePayload = normalizeTrainerBookingPayload({
      payload:{date:new Date().toISOString().slice(0,10),startTime:'08:00',endTime:'09:00',trainerId:ids.trainerUser,title:'UI create',eventType:'room_booking',color:'#111111',roomName:'Main'},
      currentUserId:ids.trainerUser,ownerIds:[ids.trainerUser,ids.trainer],
    });
    const uiCreated = await insertBuiltBooking(db,buildRoomBookingInsertRow(trainerCreatePayload));
    const uiExisting = { trainerId:uiCreated.rows[0].trainer_id,type:uiCreated.rows[0].type,bookingType:uiCreated.rows[0].booking_type,eventType:uiCreated.rows[0].event_type };
    const uiEditPayload = normalizeTrainerBookingPayload({payload:{title:'UI edited',color:'#222222',startTime:'08:15',endTime:'09:15'},existing:uiExisting,currentUserId:ids.trainerUser,ownerIds:[ids.trainerUser,ids.trainer]});
    const uiEdited = await updateBuiltBooking(db,uiCreated.rows[0].id,buildRoomBookingUpdateRow(uiEditPayload));
    assert.deepEqual([uiEdited.rows[0].type,uiEdited.rows[0].booking_type,uiEdited.rows[0].event_type,uiEdited.rows[0].trainer_id],['room_booking',null,'room_booking',ids.trainerUser]);
    const booking = await db.query(`insert into room_bookings(date,start_time,end_time,trainer_id,title,event_type) values(current_date,'10:00','11:00','${ids.trainerUser}','Safe','room_booking') returning id`);
    await assert.rejects(() => db.query(`update room_bookings set price=300 where id='${booking.rows[0].id}'`), /administrator may change booking finance/i);
    await db.query(`update room_bookings set title='Safe updated' where id='${booking.rows[0].id}'`);
    await db.query(`delete from room_bookings where id='${booking.rows[0].id}'`);
    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    const legacyProfile = await db.query(`insert into room_bookings(date,start_time,end_time,trainer_id,title,type,booking_type,event_type,color) values(current_date,'07:00','08:00','${ids.trainer}','Legacy profile','individual','individual','room_booking','#333333') returning id,date,start_time,end_time,trainer_id,title,type,booking_type,event_type,color,status,room_name`);
    await actor(db,'authenticated',ids.trainerUser,'trainer@test.invalid');
    const legacyExisting = {trainerId:legacyProfile.rows[0].trainer_id,type:legacyProfile.rows[0].type,bookingType:legacyProfile.rows[0].booking_type,eventType:legacyProfile.rows[0].event_type};
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
    await db.query(`update trainers set is_active=false where id='${ids.trainer}'`);
    await actor(db,'authenticated',ids.trainerUser,'trainer@test.invalid');
    await assert.rejects(() => db.query(`insert into room_bookings(date,start_time,end_time,trainer_id,title,event_type) values(current_date,'14:00','15:00','${ids.trainerUser}','Inactive','room_booking')`), /not allowed/i);
    await assert.rejects(() => db.query(`delete from room_bookings where id='${protectedBooking.rows[0].id}'`), /not allowed|administrator may delete/i);
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
    const preserved = await db.query(`select count(*)::int as count from subscriptions where id='${payment.rows[0].id}'`);
    assert.equal(preserved.rows[0].count,1);
    const retryAfterAttendanceDelete = await db.query(`select * from crm_admin_confirm_attendance_payment('${attendanceId}',150,'cash','20000000-0000-0000-0000-000000000005')`);
    assert.equal(retryAfterAttendanceDelete.rows[0].id,payment.rows[0].id);
    const deletedAttendanceInspection = await db.query(`select * from crm_admin_inspect_attendance_payment('${attendanceId}')`);
    assert.equal(deletedAttendanceInspection.rows[0].status,'already_confirmed');

    await actor(db,'authenticated',ids.trainerUser,'trainer@test.invalid');
    const legacyAttendance = await db.query(`select * from crm_record_attendance(null,'${ids.student}',current_date-2,null,null,'g1',1,'trial','40000000-0000-0000-0000-000000000001')`);
    await assert.rejects(() => db.query(`select * from crm_admin_inspect_attendance_payment('${legacyAttendance.rows[0].id}')`), /administrator required/i);
    await actor(db,'authenticated',ids.adminUser,'admin@test.invalid');
    const legacy = await db.query(`insert into subscriptions(student_id,group_id,plan_type,start_date,end_date,total_trainings,used_trainings,amount,paid,pay_method,notes) values('${ids.student}','g1','trial',current_date-2,current_date-2,1,1,150,true,'card','auto_one_off_from_attendance:${legacyAttendance.rows[0].id}') returning id`);
    const inspection = await db.query(`select * from crm_admin_inspect_attendance_payment('${legacyAttendance.rows[0].id}')`);
    assert.equal(inspection.rows[0].status,'legacy_unverified');
    await assert.rejects(() => db.query(`select * from crm_admin_confirm_attendance_payment('${legacyAttendance.rows[0].id}',150,'cash','40000000-0000-0000-0000-000000000002',false)`), /explicit reconciliation/i);
    const stillUnverified = await db.query(`select source_attendance_id,paid,pay_method from subscriptions where id='${legacy.rows[0].id}'`);
    assert.deepEqual(stillUnverified.rows[0],{source_attendance_id:null,paid:true,pay_method:'card'});
    const reconciled = await db.query(`select * from crm_admin_confirm_attendance_payment('${legacyAttendance.rows[0].id}',150,'cash','40000000-0000-0000-0000-000000000002',true)`);
    assert.equal(reconciled.rows[0].id,legacy.rows[0].id);
    const reconciledAttendance = await db.query(`select sub_id,entry_type from attendance where id='${legacyAttendance.rows[0].id}'`);
    assert.deepEqual(reconciledAttendance.rows[0],{sub_id:legacy.rows[0].id,entry_type:'subscription'});
    const reconciliationAudit = await db.query(`select count(*)::int as count from financial_change_audit where table_name='subscriptions' and row_id='${legacy.rows[0].id}' and operation='UPDATE'`);
    assert.equal(reconciliationAudit.rows[0].count,1);

    await actor(db,'authenticated',ids.trainerUser,'trainer@test.invalid');
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

test.skip('two independent PostgreSQL connections serialize attendance payment confirmation', () => {
  // This repository environment has no PostgreSQL server/container. PGlite exposes
  // one in-process connection, so Promise.all here would not prove cross-connection locking.
});
