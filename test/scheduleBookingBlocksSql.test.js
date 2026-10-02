import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL("../supabase/migrations/20261002090000_schedule_booking_blocks.sql", import.meta.url);
const checksUrl = new URL("../supabase/tests/schedule_booking_blocks_checks.sql", import.meta.url);

const expectDatabaseError = async (action, pattern) => {
  await assert.rejects(action, pattern);
};

test("booking-block trigger and explicit override RPC are transactionally authoritative", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;
      create function public.crm_is_admin_session() returns boolean language sql stable as $$ select coalesce(current_setting('test.admin',true),'')='on' $$;
      create function public.crm_is_active_trainer_session() returns boolean language sql stable as $$ select coalesce(current_setting('test.trainer',true),'')='on' $$;
      create table public.studio_rooms(id uuid primary key default gen_random_uuid(),name text not null,is_active boolean default true,sort_order int default 0,created_at timestamptz default now());
      create table public.room_bookings(
        id uuid primary key default gen_random_uuid(),date date not null,start_time text not null,end_time text not null,
        trainer_id text,trainer_name text,title text not null,type text not null default 'individual',booking_type text,
        people_count integer,price integer,payment_method text,event_type text,note text,color text,recurrence text,
        recurrence_until date,description text,status text default 'active',created_at timestamptz default now(),room_name text);
      create table public.group_lesson_overrides(id uuid primary key default gen_random_uuid(),room_name text);
      create table public.groups(id uuid primary key default gen_random_uuid(),schedule jsonb default '[]'::jsonb);
    `);
    await db.exec(await readFile(migrationUrl, "utf8"));
    await db.exec(await readFile(checksUrl, "utf8"));

    const roomId = "10000000-0000-0000-0000-000000000001";
    const blockId = "20000000-0000-0000-0000-000000000001";
    await db.exec(`
      select set_config('test.admin','on',false);
      insert into studio_rooms(id,name) values('${roomId}','Зал 1');
      insert into room_bookings(date,start_time,end_time,title,room_name)
      values('2026-10-02','10:20','10:40','Legacy overlap','Зал 1'),
            ('2026-10-04','10:20','10:40','Legacy all-room overlap','Зал 1');
      insert into schedule_booking_blocks(id,title,starts_on,ends_on,start_time,end_time,all_rooms,weekdays,created_by)
      values('${blockId}','Закрито','2026-10-02','2026-10-02','10:00','11:00',false,array[5]::smallint[],'00000000-0000-0000-0000-000000000001');
      insert into schedule_booking_block_rooms values('${blockId}','${roomId}');
    `);
    const args = `'2026-10-02','10:15','10:45',null,null,'Резерв','individual',null,null,null,null,'room_booking',null,null,'none',null,null,'active','  зал   1  '`;

    await expectDatabaseError(
      () => db.exec("insert into room_bookings(date,start_time,end_time,title,room_name) values('2026-10-02','10:15','10:45','Direct admin','  зал   1  ')"),
      /Цей час закритий адміністратором/,
    );
    const created = await db.query(`select (public.crm_admin_override_create_room_booking(${args})).id as id`);
    assert.ok(created.rows[0]?.id);
    await expectDatabaseError(
      () => db.exec("insert into room_bookings(date,start_time,end_time,title,room_name) values('2026-10-02','10:15','10:45','No leaked context','Зал 1')"),
      /Цей час закритий адміністратором/,
    );

    await db.exec("select set_config('test.admin','off',false); select set_config('test.trainer','on',false)");
    await expectDatabaseError(() => db.query(`select public.crm_admin_override_create_room_booking(${args})`), /Лише адміністратор/);
    await expectDatabaseError(
      () => db.exec("insert into room_bookings(date,start_time,end_time,title,room_name) values('2026-10-02','10:15','10:45','Trainer','Зал 1')"),
      /Цей час закритий адміністратором/,
    );
    await db.exec("insert into room_bookings(date,start_time,end_time,title,room_name,status) values('2026-10-02','10:15','10:45','Cancelled','Зал 1','cancelled')");

    await db.exec(`
      select set_config('test.admin','on',false); select set_config('test.trainer','off',false);
      insert into schedule_booking_blocks(title,starts_on,ends_on,start_time,end_time,all_rooms,weekdays,created_by)
      values('Усі зали','2026-10-04','2026-10-04','10:00','11:00',true,array[7]::smallint[],'00000000-0000-0000-0000-000000000001');
      insert into room_bookings(date,start_time,end_time,title,room_name) values('2026-10-03','10:15','10:45','Update me','Зал 1');
    `);
    const target = (await db.query("select id from room_bookings where title='Update me'" )).rows[0].id;
    await expectDatabaseError(() => db.exec(`update room_bookings set date='2026-10-02' where id='${target}'`), /Цей час закритий адміністратором/);
    const updated = await db.query(`select (public.crm_admin_override_update_room_booking('${target}',${args})).id as id`);
    assert.equal(updated.rows[0]?.id, target);

    await db.exec("select set_config('test.admin','off',false); select set_config('test.trainer','on',false)");
    await expectDatabaseError(
      () => db.exec("insert into room_bookings(date,start_time,end_time,title,room_name) values('2026-10-04','10:15','10:45','All rooms','Інша зала')"),
      /Цей час закритий адміністратором/,
    );

    await db.exec("select set_config('test.admin','on',false); select set_config('test.trainer','off',false)");
    const renamed = await db.query(`select (public.rename_studio_room('${roomId}','Перейменована зала')).name as name`);
    assert.equal(renamed.rows[0]?.name, "Перейменована зала");
    const renamedBookings = await db.query("select count(*)::int as count from room_bookings where title like 'Legacy%' and room_name='Перейменована зала'");
    assert.equal(renamedBookings.rows[0]?.count, 2);
    assert.equal(await db.query("select current_setting('crm.room_rename_old_name',true) as value").then((result) => result.rows[0]?.value || ""), "");
    await db.exec("insert into room_bookings(date,start_time,end_time,title,room_name) values('2026-10-02','10:20','10:40','Move me','Інша зала')");
    await expectDatabaseError(
      () => db.exec("update room_bookings set room_name='Перейменована зала' where title='Move me'"),
      /Цей час закритий адміністратором/,
    );
  } finally {
    await db.close();
  }
});
