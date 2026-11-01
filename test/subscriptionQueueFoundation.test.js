import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migrationUrl = new URL(
  "../supabase/migrations/20261101090000_subscription_queue_data_foundation.sql",
  import.meta.url,
);

const ids = {
  studentA: "10000000-0000-0000-0000-000000000001",
  studentB: "10000000-0000-0000-0000-000000000002",
  aGroupOne: "20000000-0000-0000-0000-000000000001",
  aGroupTwo: "20000000-0000-0000-0000-000000000002",
  aGroupOneNext: "20000000-0000-0000-0000-000000000003",
  bGroupOne: "20000000-0000-0000-0000-000000000004",
  legacy: "20000000-0000-0000-0000-000000000005",
};

const setup = async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create table public.subscriptions (
      id uuid primary key,
      student_id uuid,
      group_id text,
      created_at timestamptz default now()
    );
    create table public.student_groups (
      id uuid primary key default gen_random_uuid(),
      student_id uuid not null,
      group_id text not null,
      unique (student_id, group_id)
    );
    create table public.group_merge_operations (id text primary key);
    insert into public.subscriptions (id, student_id, group_id, created_at)
    values ('${ids.legacy}', '${ids.studentA}', 'legacy-group', '2020-01-01T00:00:00Z');
  `);
  await db.exec(await readFile(migrationUrl, "utf8"));
  return db;
};

test("legacy subscriptions remain valid without invented payment or queue data", async () => {
  const db = await setup();
  const result = await db.query(
    "select paid_at, previous_subscription_id from public.subscriptions where id = $1",
    [ids.legacy],
  );
  assert.equal(result.rows[0].paid_at, null);
  assert.equal(result.rows[0].previous_subscription_id, null);
  await db.close();
});

test("one student can have independent subscription queues in different groups", async () => {
  const db = await setup();
  await db.exec(`
    insert into public.subscriptions (id, student_id, group_id, paid_at)
    values
      ('${ids.aGroupOne}', '${ids.studentA}', 'group-one', '2026-11-01'),
      ('${ids.aGroupTwo}', '${ids.studentA}', 'group-two', '2026-11-01');
  `);
  const count = await db.query(
    "select count(*)::integer as count from public.subscriptions where student_id = $1 and paid_at = $2",
    [ids.studentA, "2026-11-01"],
  );
  assert.equal(count.rows[0].count, 2);
  await db.close();
});

test("a subscription can explicitly follow another in the same student and group queue", async () => {
  const db = await setup();
  await db.exec(`
    insert into public.subscriptions (id, student_id, group_id, paid_at)
    values ('${ids.aGroupOne}', '${ids.studentA}', 'group-one', '2026-11-01');
    insert into public.subscriptions (id, student_id, group_id, paid_at, previous_subscription_id)
    values ('${ids.aGroupOneNext}', '${ids.studentA}', 'group-one', '2026-11-10', '${ids.aGroupOne}');
  `);
  const result = await db.query(
    "select previous_subscription_id from public.subscriptions where id = $1",
    [ids.aGroupOneNext],
  );
  assert.equal(result.rows[0].previous_subscription_id, ids.aGroupOne);
  await db.close();
});

test("database rejects a predecessor from another group or another student", async () => {
  const db = await setup();
  await db.exec(`
    insert into public.subscriptions (id, student_id, group_id, paid_at)
    values ('${ids.aGroupOne}', '${ids.studentA}', 'group-one', '2026-11-01');
  `);
  await assert.rejects(
    db.query(
      "insert into public.subscriptions (id, student_id, group_id, previous_subscription_id) values ($1, $2, 'group-two', $3)",
      [ids.aGroupTwo, ids.studentA, ids.aGroupOne],
    ),
    /foreign key constraint/i,
  );
  await assert.rejects(
    db.query(
      "insert into public.subscriptions (id, student_id, group_id, previous_subscription_id) values ($1, $2, 'group-one', $3)",
      [ids.bGroupOne, ids.studentB, ids.aGroupOne],
    ),
    /foreign key constraint/i,
  );
  await db.close();
});

test("database rejects self-links and incomplete queue ownership", async () => {
  const db = await setup();
  await assert.rejects(
    db.query(
      "insert into public.subscriptions (id, student_id, group_id, previous_subscription_id) values ($1, $2, 'group-one', $1)",
      [ids.aGroupOne, ids.studentA],
    ),
    /check constraint/i,
  );
  await assert.rejects(
    db.query(
      "insert into public.subscriptions (id, student_id, group_id, previous_subscription_id) values ($1, null, 'group-one', $2)",
      [ids.aGroupOneNext, ids.aGroupOne],
    ),
    /check constraint/i,
  );
  await db.close();
});

test("database rejects indirect predecessor cycles on create and edit", async () => {
  const db = await setup();
  await db.exec(`
    insert into public.subscriptions (id, student_id, group_id)
    values
      ('${ids.aGroupOne}', '${ids.studentA}', 'group-one'),
      ('${ids.aGroupOneNext}', '${ids.studentA}', 'group-one');
    update public.subscriptions
    set previous_subscription_id = '${ids.aGroupOne}'
    where id = '${ids.aGroupOneNext}';
  `);
  await assert.rejects(
    db.query(
      "update public.subscriptions set previous_subscription_id = $1 where id = $2",
      [ids.aGroupOneNext, ids.aGroupOne],
    ),
    /predecessor cycle/i,
  );

  const thirdId = "20000000-0000-0000-0000-000000000006";
  await db.query(
    "insert into public.subscriptions (id, student_id, group_id, previous_subscription_id) values ($1, $2, 'group-one', $3)",
    [thirdId, ids.studentA, ids.aGroupOneNext],
  );
  await assert.rejects(
    db.query(
      "update public.subscriptions set previous_subscription_id = $1 where id = $2",
      [thirdId, ids.aGroupOne],
    ),
    /predecessor cycle/i,
  );
  await db.close();
});

test("group transfer atomically preserves internal queue links and detaches boundaries", async () => {
  const db = await setup();
  const predecessorId = "20000000-0000-0000-0000-000000000010";
  const movedFirstId = "20000000-0000-0000-0000-000000000011";
  const movedSecondId = "20000000-0000-0000-0000-000000000012";
  const successorId = "20000000-0000-0000-0000-000000000013";
  await db.exec(`
    insert into public.student_groups (student_id, group_id)
    values ('${ids.studentA}', 'source-group');
    insert into public.subscriptions (id, student_id, group_id, previous_subscription_id)
    values
      ('${predecessorId}', '${ids.studentA}', 'source-group', null),
      ('${movedFirstId}', '${ids.studentA}', 'source-group', '${predecessorId}'),
      ('${movedSecondId}', '${ids.studentA}', 'source-group', '${movedFirstId}'),
      ('${successorId}', '${ids.studentA}', 'source-group', '${movedSecondId}');
  `);

  await db.query(
    "select * from public.crm_move_group_memberships_and_subscriptions($1, $2, $3::uuid[], $3::uuid[], $4::uuid[], '{}'::jsonb)",
    ["source-group", "target-group", [ids.studentA], [movedFirstId, movedSecondId]],
  );

  const rows = (await db.query(`
    select id, group_id, previous_subscription_id
    from public.subscriptions
    where student_id = '${ids.studentA}' and group_id in ('source-group', 'target-group')
    order by id
  `)).rows;
  const byId = new Map(rows.map((row) => [row.id, row]));
  assert.equal(byId.get(movedFirstId).group_id, "target-group");
  assert.equal(byId.get(movedFirstId).previous_subscription_id, null, "source boundary is detached");
  assert.equal(byId.get(movedSecondId).previous_subscription_id, movedFirstId, "internal queue link survives");
  assert.equal(byId.get(successorId).previous_subscription_id, null, "remaining source boundary is detached");
  const memberships = (await db.query(
    "select group_id from public.student_groups where student_id = $1",
    [ids.studentA],
  )).rows.map((row) => row.group_id);
  assert.deepEqual(memberships, ["target-group"]);

  await db.query(
    "select * from public.crm_move_group_memberships_and_subscriptions($1, $2, $3::uuid[], $3::uuid[], $4::uuid[], $5::jsonb)",
    [
      "target-group",
      "source-group",
      [ids.studentA],
      [movedFirstId, movedSecondId],
      JSON.stringify({
        [movedFirstId]: predecessorId,
        [movedSecondId]: movedFirstId,
        [successorId]: movedSecondId,
      }),
    ],
  );
  const restored = (await db.query(`
    select id, group_id, previous_subscription_id
    from public.subscriptions
    where id in ('${movedFirstId}', '${movedSecondId}', '${successorId}')
    order by id
  `)).rows;
  const restoredById = new Map(restored.map((row) => [row.id, row]));
  assert.equal(restoredById.get(movedFirstId).group_id, "source-group");
  assert.equal(restoredById.get(movedFirstId).previous_subscription_id, predecessorId);
  assert.equal(restoredById.get(movedSecondId).previous_subscription_id, movedFirstId);
  assert.equal(restoredById.get(successorId).previous_subscription_id, movedSecondId);
  await db.close();
});

test("invalid subscription transfer rolls back before membership changes", async () => {
  const db = await setup();
  await db.exec(`
    insert into public.student_groups (student_id, group_id)
    values ('${ids.studentA}', 'source-group');
    insert into public.subscriptions (id, student_id, group_id)
    values ('${ids.aGroupOne}', '${ids.studentA}', 'other-group');
  `);
  await assert.rejects(
    db.query(
      "select * from public.crm_move_group_memberships_and_subscriptions($1, $2, $3::uuid[], $3::uuid[], $4::uuid[], '{}'::jsonb)",
      ["source-group", "target-group", [ids.studentA], [ids.aGroupOne]],
    ),
    /cannot be moved/i,
  );
  const memberships = (await db.query(
    "select group_id from public.student_groups where student_id = $1",
    [ids.studentA],
  )).rows.map((row) => row.group_id);
  assert.deepEqual(memberships, ["source-group"]);
  await db.close();
});

test("admin subscription creation sends the explicit payment date and predecessor", async () => {
  const form = await readFile(new URL("../src/components/Forms.jsx", import.meta.url), "utf8");
  const db = await readFile(new URL("../src/db.js", import.meta.url), "utf8");

  assert.match(form, /<Field label="Дата оплати \*">/);
  assert.match(form, /const isEditingExisting = Boolean\(initial\?\.id\)/);
  assert.match(form, /initial\?\.paidAt \|\| \(isEditingExisting \? "" : today\(\)\)/);
  assert.match(form, /!isEditingExisting && !paidAt/);
  assert.match(form, /paidAt: paidAt \|\| null/);
  assert.match(form, /previousSubscriptionId: previousSubscriptionId \|\| null/);
  assert.match(db, /paid_at: s\.paidAt \|\| null/);
  assert.match(db, /previous_subscription_id: s\.previousSubscriptionId \|\| null/);
  assert.doesNotMatch(db, /paid_at:\s*s\.created_at/);
});
