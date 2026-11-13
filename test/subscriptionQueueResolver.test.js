import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const student = '10000000-0000-0000-0000-000000000001';
const old = '20000000-0000-0000-0000-000000000001';
const next = '20000000-0000-0000-0000-000000000002';
const other = '20000000-0000-0000-0000-000000000003';
const migration = new URL('../supabase/migrations/20261113090000_subscription_queue_resolver.sql', import.meta.url);

async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table subscriptions (id uuid primary key, student_id uuid, group_id text,
      paid_at date, previous_subscription_id uuid, activation_date date,
      start_date date, end_date date, original_end_date date,
      total_trainings integer, used_trainings integer);
  `);
  await db.exec(await readFile(migration, 'utf8'));
  return db;
}
async function insert(db, id, group, { previous = null, paid = null, used = 0, activation = null, end = '2026-12-31' } = {}) {
  await db.query(`insert into subscriptions values ($1,$2,$3,$4,$5,$6,'2026-10-01',$7,$7,8,$8)`,
    [id, student, group, paid, previous, activation, end, used]);
}
async function resolve(db, group, date) {
  return (await db.query('select * from crm_resolve_subscription_for_attendance($1,$2,$3)', [student, group, date])).rows[0];
}
const date = value => value instanceof Date ? value.toISOString().slice(0, 10) : value;

test('queue selects predecessor until exhausted or deadline and is isolated by group', async t => {
  const db = await setup(); t.after(() => db.close());
  await insert(db, old, 'a', { activation: '2026-10-01' });
  await insert(db, next, 'a', { previous: old, paid: '2026-11-01' });
  await insert(db, other, 'b', { activation: '2026-10-01' });
  const before = (await db.query('select * from subscriptions order by id')).rows;
  assert.equal((await resolve(db, 'a', '2026-11-14')).subscription_id, old);
  assert.equal((await resolve(db, 'b', '2026-11-15')).subscription_id, other);
  const deadline = await resolve(db, 'a', '2026-11-15');
  assert.equal(deadline.subscription_id, next);
  assert.equal(date(deadline.activation_date), '2026-11-15');
  assert.equal((await resolve(db, 'a', '2026-11-16')).subscription_id, next);
  assert.deepEqual((await db.query('select * from subscriptions order by id')).rows, before);
  await db.query('update subscriptions set used_trainings = 8 where id = $1', [old]);
  const early = await resolve(db, 'a', '2026-11-05');
  assert.equal(early.subscription_id, next);
  assert.equal(date(early.activation_date), '2026-11-05');
});

test('legacy selection, debt and ambiguous or broken graphs are controlled', async t => {
  const db = await setup(); t.after(() => db.close());
  await insert(db, old, 'a', { activation: '2026-10-01' });
  assert.equal((await resolve(db, 'a', '2026-11-01')).subscription_id, old);
  assert.equal((await resolve(db, 'empty', '2026-11-01')).result, 'debt');
  await insert(db, other, 'a', { activation: '2026-10-01' });
  assert.equal((await resolve(db, 'a', '2026-11-01')).result, 'ambiguity');
  await db.query('delete from subscriptions where id = $1', [other]);
  await insert(db, next, 'a', { previous: old, paid: '2026-11-01' });
  await db.query('update subscriptions set previous_subscription_id = $1, paid_at = $2 where id = $3', [next, '2026-11-01', old]);
  assert.equal((await resolve(db, 'a', '2026-11-01')).result, 'ambiguity');
  await db.query('update subscriptions set previous_subscription_id = $1 where id = $2', [other, old]);
  assert.equal((await resolve(db, 'a', '2026-11-01')).result, 'ambiguity');
});

test('explicit activation records only the selected queued subscription', async t => {
  const db = await setup(); t.after(() => db.close());
  await insert(db, old, 'a', { used: 8, activation: '2026-10-01' });
  await insert(db, next, 'a', { previous: old, paid: '2026-11-01' });
  const original = (await db.query('select * from subscriptions where id = $1', [old])).rows[0];
  await db.query('select * from crm_record_subscription_queue_activation($1,$2,$3)', [student, 'a', '2026-11-05']);
  const later = await resolve(db, 'a', '2026-11-10');
  assert.equal(later.subscription_id, next);
  assert.equal(date(later.activation_date), '2026-11-05');
  assert.deepEqual((await db.query('select * from subscriptions where id = $1', [old])).rows[0], original);
});
