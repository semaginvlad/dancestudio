import test from 'node:test';
import assert from 'node:assert/strict';
import { formatGroupStartDate, getPublicGroupBlockers, isArchivedSiteGroup } from '../src/shared/siteGroups.js';

test('eligible public group has no blockers', () => {
  assert.deepEqual(getPublicGroupBlockers({
    publicLevel: 'base', ageCategory: 'adults_16_plus', schedule: [{ day: 1, time: '19:00' }],
  }), []);
});

test('reports every reason that prevents a group from appearing', () => {
  assert.deepEqual(getPublicGroupBlockers({ archivedAt: '2026-09-14', schedule: [] }), [
    'група архівна', 'немає рівня', 'немає вікової категорії', 'немає графіка',
  ]);
  assert.equal(isArchivedSiteGroup({ archived_at: '2026-09-14' }), true);
});

test('accepts a JSON schedule and formats ISO start dates without timezone shifts', () => {
  assert.deepEqual(getPublicGroupBlockers({
    public_level: 'mix', age_category: 'teens_under_16', schedule: '[{"day":0,"time":"10:30"}]',
  }), []);
  assert.equal(formatGroupStartDate('2026-09-14'), '14.09.2026');
  assert.equal(formatGroupStartDate(null), 'Не вказано');
});
