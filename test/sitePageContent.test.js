import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  HOME_SECTION_DEFAULT_ENABLED,
  HOME_SECTION_FIELDS,
  HOME_SECTION_ORDER,
  normalizeHomeSection,
  normalizeHomeSections,
  normalizeSiteDirectionContent,
  normalizeSitePageContent,
  SITE_PAGE_CONTENT_FIELDS,
  validateSiteLogo,
} from '../src/shared/sitePageContent.js';

const migrationPath = new URL('../supabase/migrations/20260915090000_site_page_and_direction_content.sql', import.meta.url);
const logoMigrationPath = new URL('../supabase/migrations/20260915120000_site_header_logo.sql', import.meta.url);
const brandingMigrationPath = new URL('../supabase/migrations/20260915150000_site_branding_independent_of_home_publication.sql', import.meta.url);
const brandingChecksPath = new URL('../supabase/tests/site_branding_checks.sql', import.meta.url);
const homeSectionsMigrationPath = new URL('../supabase/migrations/20260918120000_home_page_sections.sql', import.meta.url);

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

test('home sections have a fixed contract and default visibility', () => {
  assert.deepEqual(HOME_SECTION_ORDER, ['hero', 'directions', 'schedule', 'team', 'join_cta', 'brand_metrics', 'open_groups', 'week_pulse']);
  assert.deepEqual(HOME_SECTION_ORDER.map((id) => HOME_SECTION_DEFAULT_ENABLED[id]), [true, true, true, true, true, false, false, false]);
  for (const sectionId of HOME_SECTION_ORDER) assert.ok(HOME_SECTION_FIELDS[sectionId].includes('enabled'));
});

test('home section normalization preserves booleans, trims text and drops unknown fields', () => {
  assert.deepEqual(normalizeHomeSection('hero', { enabled: false, title: '  Танцюй  ', description: ' ', url: 'https://example.test', style: 'red', campaign_signals: {} }), { enabled: false, title: 'Танцюй' });
  assert.deepEqual(normalizeHomeSection('team', { enabled: true }), { enabled: true });
  assert.deepEqual(normalizeHomeSection('week_pulse', { title: ' Pulse ' }), { title: 'Pulse' });
  assert.throws(() => normalizeHomeSection('hero', { enabled: 'false' }), /логічним/);
  for (const sectionId of ['campaign_signals', 'hero_brand_frame', 'brand_notes', 'featured_routes', 'directions_campaign_slot', 'directions_logic', 'schedule_focus_notes']) {
    assert.throws(() => normalizeHomeSection(sectionId, {}), /Невідома/);
  }
  assert.deepEqual(normalizeHomeSections({ hero: { title: 'Hero' }, brand_notes: { title: 'private' } }), { hero: { title: 'Hero' } });
  assert.deepEqual(normalizeHomeSections({ hero: { enabled: 'false' }, team: { title: ' Team ' } }), { team: { title: 'Team' } });
});

test('home section CTA targets and featured limits are strict', () => {
  for (const pageKey of ['schedule', 'directions', 'coaches', 'about', 'join', 'directions_quiz']) {
    assert.deepEqual(normalizeHomeSection('hero', { primary_cta_page_key: pageKey }), { primary_cta_page_key: pageKey });
  }
  assert.deepEqual(normalizeHomeSection('hero', { secondary_cta_page_key: '' }), {});
  assert.throws(() => normalizeHomeSection('hero', { primary_cta_page_key: 'https://example.test' }), /дозволену/);
  assert.deepEqual(normalizeHomeSection('directions', { featured_limit: 1 }), { featured_limit: 1 });
  assert.deepEqual(normalizeHomeSection('directions', { featured_limit: 6 }), { featured_limit: 6 });
  for (const invalid of [0, 7, 1.5, '3']) assert.throws(() => normalizeHomeSection('directions', { featured_limit: invalid }), /цілим числом/);
});

test('sections are only accepted on home and legacy home content is retained', () => {
  const home = normalizeSitePageContent('home', { logo_url: ' logo.png ', title: ' Legacy ', primaryCtaLabel: ' Join ', sections: { hero: { enabled: false } } });
  assert.deepEqual(home, { logo_url: 'logo.png', title: 'Legacy', primaryCtaLabel: 'Join', sections: { hero: { enabled: false } } });
  assert.deepEqual(normalizeSitePageContent('about', { title: 'About', sections: { hero: { enabled: false } } }), { title: 'About' });
});

test('home section migration is additive, atomic and keeps the public V1 contract', async () => {
  const sql = await readFile(homeSectionsMigrationPath, 'utf8');
  assert.match(sql, /admin_update_home_section\(p_section_id text, p_section_content jsonb\)/);
  assert.match(sql, /for update/);
  assert.match(sql, /jsonb_set\(v_content, '\{sections\}'/);
  assert.match(sql, /'schema_version', 1/);
  assert.match(sql, /revoke all on function public\.admin_update_home_section\(text, jsonb\) from public/);
  assert.match(sql, /grant execute on function public\.admin_update_home_section\(text, jsonb\) to authenticated/);
  assert.doesNotMatch(sql, /grant execute on function public\.admin_update_home_section[^;]+to anon/i);
  assert.doesNotMatch(sql, /(?:alter|insert into|delete from)\s+(?:public\.)?(?:groups|payments|subscriptions|attendance)\b/i);
  assert.doesNotMatch(sql, /create or replace function public\.fetch_public_schedule/i);
});
