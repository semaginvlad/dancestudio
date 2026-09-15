import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  normalizeSiteDirectionContent,
  normalizeSitePageContent,
  SITE_PAGE_CONTENT_FIELDS,
  validateSiteLogo,
} from '../src/shared/sitePageContent.js';

const migrationPath = new URL('../supabase/migrations/20260915090000_site_page_and_direction_content.sql', import.meta.url);
const logoMigrationPath = new URL('../supabase/migrations/20260915120000_site_header_logo.sql', import.meta.url);
const brandingMigrationPath = new URL('../supabase/migrations/20260915150000_site_branding_independent_of_home_publication.sql', import.meta.url);
const brandingChecksPath = new URL('../supabase/tests/site_branding_checks.sql', import.meta.url);

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

test('home logo whitelist and client validation only accept PNG files up to 2 MB', () => {
  assert.equal(SITE_PAGE_CONTENT_FIELDS.home.includes('logo_url'), true);
  assert.deepEqual(normalizeSitePageContent('home', { logo_url: ' https://cdn/logo.png ', logoUrl: 'private' }), { logo_url: 'https://cdn/logo.png' });
  assert.doesNotThrow(() => validateSiteLogo({ type: 'image/png', size: 2 * 1024 * 1024 }));
  assert.throws(() => validateSiteLogo({ type: 'image/jpeg', size: 1 }), /PNG/);
  assert.throws(() => validateSiteLogo({ type: 'image/png', size: 2 * 1024 * 1024 + 1 }), /2 МБ/);
});

test('logo migration provisions constrained storage and exposes only logo_url', async () => {
  const sql = await readFile(logoMigrationPath, 'utf8');
  assert.match(sql, /'site-assets'.*true.*2097152.*image\/png/s);
  assert.match(sql, /name = 'branding\/header-logo\.png'/);
  assert.match(sql, /public\.rls_is_admin\(\)/);
  assert.match(sql, /'logo_url', nullif\(btrim\(sp\.content->>'logo_url'\)/);
  assert.doesNotMatch(sql, /service.role|service_role/i);
});

test('follow-up migration exposes branding without publishing the home page', async () => {
  const [migration, checks] = await Promise.all([
    readFile(brandingMigrationPath, 'utf8'),
    readFile(brandingChecksPath, 'utf8'),
  ]);
  assert.match(migration, /'branding', jsonb_build_object\([\s\S]*?'logo_url'/);
  assert.match(migration, /from public\.site_pages sp where sp\.page_key = 'home'/);
  assert.match(migration, /from public\.site_pages sp\s+where sp\.is_published = true/);
  assert.doesNotMatch(migration, /(?:update|insert into|delete from)\s+public\.site_pages/i);
  assert.match(checks, /set is_published = false/);
  assert.match(checks, /jsonb_array_elements\(public\.fetch_public_site_config\(\)->'pages'\)/);
  assert.match(checks, /fetch_public_site_config\(\)->'branding'->>'logo_url'/);
  assert.match(checks, /rollback/);
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
