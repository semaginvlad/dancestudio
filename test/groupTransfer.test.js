import test from 'node:test';
import assert from 'node:assert/strict';

import { getInternalGroupLabel } from '../src/shared/groupLabels.js';
import { getTransferTargetGroups } from '../src/shared/groupTrainer.js';

const latinGroup = (id, overrides = {}) => ({
  id,
  name: 'Latin',
  publicLevel: 'mix',
  ageCategory: 'adults_16_plus',
  archived_at: null,
  schedule: [{ day: 1, startTime: `1${id}:00` }],
  ...overrides,
});

test('transfer offers all six current groups connected to the same trainer by every supported relation', () => {
  const fromGroup = latinGroup('current', { trainer_id: 'trainer-1' });
  const targets = [
    latinGroup('1'),
    latinGroup('2'),
    latinGroup('3', { schedule: [{ day: 3, trainerId: 'trainer-1', startTime: '18:00' }] }),
    latinGroup('4', { schedule: JSON.stringify([{ day: 4, trainer_id: 'trainer-1', startTime: '19:00' }]) }),
    latinGroup('5', { trainerId: 'trainer-1' }),
    latinGroup('6', { trainer_id: 'trainer-1', show_on_public_site: false }),
  ];
  const trainerGroups = [
    { group_id: '1', trainer_id: 'trainer-1', is_primary: true },
    { groupId: '2', trainerId: 'trainer-1', isPrimary: false },
  ];

  assert.deepEqual(
    getTransferTargetGroups({ groups: [fromGroup, ...targets], fromGroup, trainerGroups }).map(({ id }) => id),
    ['1', '2', '3', '4', '5', '6'],
  );
});

test('transfer excludes the current and archived groups but ignores public CRM fields', () => {
  const fromGroup = latinGroup('current', { trainerId: 'trainer-1' });
  const privateGroup = latinGroup('private', {
    trainerId: 'trainer-1',
    show_on_public_site: false,
    public_level: null,
    age_category: null,
    public_join_status: 'closed',
    start_date: '2099-01-01',
  });
  const archivedGroup = latinGroup('archived', { trainerId: 'trainer-1', archived_at: '2026-01-01' });

  assert.deepEqual(
    getTransferTargetGroups({ groups: [fromGroup, privateGroup, archivedGroup], fromGroup }).map(({ id }) => id),
    ['private'],
  );
});

test('same-name Latin groups receive distinct complete labels and startTime wins over time', () => {
  const groups = [
    latinGroup('a', { schedule: [{ day: 1, time: '18:30', startTime: '18:00' }] }),
    latinGroup('b', { publicLevel: 'base', ageCategory: 'teens_under_16', schedule: [{ day: 2, startTime: '19:10' }] }),
    latinGroup('c', { schedule: [{ day: 1, startTime: '19:10' }, { day: 3, startTime: '19:10' }, { day: 5, startTime: '19:10' }] }),
  ];
  const labels = groups.map(getInternalGroupLabel);

  assert.equal(new Set(labels).size, 3);
  assert.equal(labels[0], 'Latin · MIX · 16+ · [пн] 18:00');
  assert.equal(labels[1], 'Latin · BASE · 10–16 · [вт] 19:10');
  assert.equal(labels[2], 'Latin · MIX · 16+ · [пн·ср·пт] 19:10');
});
