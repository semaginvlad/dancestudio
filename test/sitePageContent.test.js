import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  normalizeSiteDirectionContent,
  normalizeSitePageContent,
  SITE_PAGE_CONTENT_FIELDS,
} from '../src/shared/sitePageContent.js';

const migrationPath = new URL('../supabase/migrations/20260915090000_site_page_and_direction_content.sql', import.meta.url);

test('page text is trimmed and retained for saving', () => {
  assert.deepEqual(normalizeSitePageContent('schedule', {
    title: ' Розклад ', cityStudioLabel: ' KYIV / DANCE STUDIO ',
  }), { title: 'Розклад', cityStudioLabel: 'KYIV / DANCE STUDIO' });
});

test('blank fields fall back without clearing non-empty content', () => {
  assert.deepEqual(normalizeSitePageContent('schedule', {
    title: '   ', baseTitle: 'BASE', mixTitle: '',
  }), { baseTitle: 'BASE' });
});

test('page and direction content enforce their key whitelists', () => {
  assert.equal(SITE_PAGE_CONTENT_FIELDS.schedule.includes('emptyScheduleMessage'), true);
  assert.deepEqual(normalizeSitePageContent('home', { title: 'Soroka', privateNote: 'secret', city: 'Kyiv' }), { title: 'Soroka' });
  assert.deepEqual(normalizeSiteDirectionContent({ title: 'Heels', phone: '+380', description: 'Dance' }), { title: 'Heels', description: 'Dance' });
  assert.throws(() => normalizeSitePageContent('unknown', {}), /Невідомий/);
});

test('public RPC is additive, whitelists content and preserves the V1 config contract', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /'schema_version', 1/);
  for (const key of ["'pages'", "'navigation'", "'trainers'", "'directions'"]) assert.match(sql, new RegExp(key));
  assert.match(sql, /jsonb_strip_nulls/);
  assert.match(sql, /sp\.content->>'emptyScheduleMessage'/);
  assert.doesNotMatch(sql, /sp\.content\s+as\s+public_content/i);
  assert.match(sql, /grant execute on function public\.fetch_public_site_config\(\) to anon, authenticated/);
});

test('site-text migration does not touch groups, schedules, payments or attendance', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.doesNotMatch(sql, /(?:alter|update|insert into|delete from)\s+(?:public\.)?(?:groups|trainer_groups|payments|subscriptions|attendance)\b/i);
  assert.doesNotMatch(sql, /create or replace function public\.fetch_public_schedule/i);
});
