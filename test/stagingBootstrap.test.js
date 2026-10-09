import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const bootstrap = fs.readFileSync(new URL('../supabase/staging_bootstrap.sql', import.meta.url), 'utf8');
const runbook = fs.readFileSync(new URL('../supabase/STAGING_RUNBOOK.md', import.meta.url), 'utf8');
const hardening = fs.readFileSync(new URL('../supabase/migrations/20261005090000_harden_financial_attendance_boundary.sql', import.meta.url), 'utf8');

test('staging bootstrap is manual, ordered, data-free, and includes current hardening verbatim', () => {
  assert.match(bootstrap,/STAGING ONLY[\s\S]*Never run against production/i);
  assert.match(bootstrap,/STAGING bootstrap requires a new empty project/);
  assert.ok(bootstrap.includes(hardening),'financial hardening source must be embedded verbatim');
  const migrationMarkers = [...bootstrap.matchAll(/-- BEGIN SOURCE: supabase\/migrations\/(\d+[^\n]+\.sql)/g)].map((match)=>match[1]);
  assert.deepEqual(migrationMarkers,[...migrationMarkers].sort());
  assert.equal(migrationMarkers.at(-1),'20261005090000_harden_financial_attendance_boundary.sql');
  assert.doesNotMatch(bootstrap,/67c2f1cb-5741-444a-8b37-864800f4bf82|8d33dcf6-7369-4767-8661-a227870ebf76/);
  assert.match(bootstrap,/production trainer-profile UUID seeds intentionally omitted/);
  assert.match(runbook,/SQL Editor → New query/);
  assert.match(runbook,/не надсилайте паролі, API keys, service-role keys або production дані/i);
  assert.match(runbook,/Authentication → Users → Add user/);
});

test('staging bootstrap executes on a disposable PostgreSQL-compatible database', async () => {
  const db = new PGlite();
  try {
    // Supabase owns these roles/schemas. PGlite needs minimal interface stubs;
    // they are deliberately not part of staging_bootstrap.sql.
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as
        $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text,name text,owner uuid);
      create function storage.foldername(text) returns text[] language sql immutable as
        $$select string_to_array($1,'/')$$;
    `);
    // Supabase provides pgcrypto; this PGlite build already provides
    // gen_random_uuid() but does not package CREATE EXTENSION metadata.
    await db.exec(bootstrap.replace('create extension if not exists pgcrypto;',''));
    const result = await db.query(`select
      to_regclass('public.attendance')::text as attendance,
      to_regclass('public.subscriptions')::text as subscriptions,
      to_regprocedure('public.crm_record_trainer_presence(uuid,date,text,integer,uuid)')::text as trainer_presence,
      to_regprocedure('public.crm_admin_record_reception(uuid,date,text,text,text,integer,text,uuid)')::text as admin_reception,
      (select count(*)::int from public.students) as student_count,
      (select count(*)::int from public.subscriptions) as subscription_count,
      (select count(*)::int from public.attendance) as attendance_count`);
    assert.deepEqual(result.rows[0],{
      attendance:'attendance',subscriptions:'subscriptions',
      trainer_presence:'crm_record_trainer_presence(uuid,date,text,integer,uuid)',
      admin_reception:'crm_admin_record_reception(uuid,date,text,text,text,integer,text,uuid)',
      student_count:0,subscription_count:0,attendance_count:0,
    });
  } finally {
    await db.close();
  }
});

