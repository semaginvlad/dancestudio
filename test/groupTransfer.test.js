import test from 'node:test';
import assert from 'node:assert/strict';

import { getInternalGroupLabel } from '../src/shared/groupLabels.js';
import { getTransferTargetGroups } from '../src/shared/groupTrainer.js';
import { readFile } from 'node:fs/promises';
import {
  commitGroupMergeThenRefresh,
  commitServerMutationThenRefresh,
  projectMovedMemberships,
  projectMovedSubscriptions,
} from '../src/groupMergeMutations.js';

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

test('Attendance and merge flows use the atomic membership/subscription RPC helper', async () => {
  const attendance = await readFile(new URL('../src/components/AttendanceTab.jsx', import.meta.url), 'utf8');
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const db = await readFile(new URL('../src/db.js', import.meta.url), 'utf8');

  assert.match(attendance, /commit: \(\) => db\.moveGroupMembershipsAndSubscriptions\(/);
  assert.doesNotMatch(attendance, /await db\.addStudentGroup\(studentId, newGroupId\)[\s\S]{0,500}await db\.removeStudentGroup/);
  assert.equal((app.match(/await db\.moveGroupMembershipsAndSubscriptions\(/g) || []).length, 1, 'forward merge uses the atomic move RPC');
  assert.match(app, /await db\.undoGroupMergeAtomically\(operation\.id/);
  assert.doesNotMatch(app, /await db\.markGroupMergeOperationUndone\(/);
  assert.equal((app.match(/await commitGroupMergeThenRefresh\(\{/g) || []).length, 2, 'merge and undo commit locally before refresh');
  assert.match(attendance, /await commitServerMutationThenRefresh\(\{/);
  assert.match(db, /supabase\.rpc\('crm_move_group_memberships_and_subscriptions'/);
  assert.doesNotMatch(db, /payload\.group_id\s*=\s*s\.groupId/);
});

const moveState = (state, { sourceGroupId, targetGroupId, studentIds, subscriptionIds, restore = {} }) => {
  for (const subId of subscriptionIds) {
    const sub = state.subscriptions.find((row) => String(row.id) === String(subId));
    if (!sub || String(sub.groupId) !== String(sourceGroupId)) throw new Error('RPC source-group validation error');
  }
  state.memberships = projectMovedMemberships(state.memberships, {
    sourceGroupId,
    targetGroupId,
    addTargetStudentIds: studentIds,
    removeSourceStudentIds: studentIds,
  });
  state.subscriptions = projectMovedSubscriptions(state.subscriptions, {
    targetGroupId,
    subscriptionIds,
    restorePreviousSubscriptionIds: restore,
  });
};

const normalizeMoveState = (state) => ({
  ...state,
  memberships: state.memberships.map(({ studentId, groupId }) => ({ studentId, groupId })),
});

test('successful merge and undo stay fully local when both canonical refreshes fail', async () => {
  const initial = {
    memberships: [{ id: 'sg-source', studentId: 'student-1', groupId: 'source' }],
    subscriptions: [
      { id: 'sub-1', studentId: 'student-1', groupId: 'source', previousSubscriptionId: null },
      { id: 'sub-2', studentId: 'student-1', groupId: 'source', previousSubscriptionId: 'sub-1' },
    ],
    sourceArchived: false,
  };
  const server = structuredClone(initial);
  const local = structuredClone(initial);
  let operation = { id: 'merge-1', status: 'pending' };

  const merge = await commitGroupMergeThenRefresh({
    commit: async () => {
      moveState(server, { sourceGroupId: 'source', targetGroupId: 'target', studentIds: ['student-1'], subscriptionIds: ['sub-1', 'sub-2'] });
      server.sourceArchived = true;
      return { ...operation, status: 'completed' };
    },
    applyCommitted: (completed) => {
      moveState(local, { sourceGroupId: 'source', targetGroupId: 'target', studentIds: ['student-1'], subscriptionIds: ['sub-1', 'sub-2'] });
      local.sourceArchived = true;
      operation = completed;
    },
    refresh: async () => { throw new Error('merge refresh failed'); },
    applyRefresh: () => assert.fail('failed refresh must not apply rows'),
  });
  assert.equal(merge.refreshed, false);
  assert.equal(operation.status, 'completed', 'undo remains enabled');
  assert.deepEqual(local, server, 'merge is fully projected before refresh');

  const undo = await commitGroupMergeThenRefresh({
    commit: async () => {
      moveState(server, {
        sourceGroupId: 'target', targetGroupId: 'source', studentIds: ['student-1'], subscriptionIds: ['sub-1', 'sub-2'],
        restore: { 'sub-1': null, 'sub-2': 'sub-1' },
      });
      server.sourceArchived = false;
      return { ...operation, status: 'undone', undoneAt: 'now' };
    },
    applyCommitted: (undone) => {
      moveState(local, {
        sourceGroupId: 'target', targetGroupId: 'source', studentIds: ['student-1'], subscriptionIds: ['sub-1', 'sub-2'],
        restore: { 'sub-1': null, 'sub-2': 'sub-1' },
      });
      local.sourceArchived = false;
      operation = undone;
    },
    refresh: async () => { throw new Error('undo refresh failed'); },
    applyRefresh: () => assert.fail('failed refresh must not apply rows'),
  });
  assert.equal(undo.refreshed, false);
  assert.equal(operation.status, 'undone');
  assert.deepEqual(normalizeMoveState(local), normalizeMoveState(initial), 'undo is fully projected before refresh');
  assert.deepEqual(local, server);
});

test('attendance transfer remains repeatable after subscriptions refresh fails', async () => {
  const initial = {
    memberships: [{ id: 'sg-source', studentId: 'student-1', groupId: 'source' }],
    subscriptions: [{ id: 'sub-1', studentId: 'student-1', groupId: 'source', previousSubscriptionId: null }],
  };
  const server = structuredClone(initial);
  const local = structuredClone(initial);
  let visibleGroupId = 'source';

  const transfer = async (sourceGroupId, targetGroupId) => commitServerMutationThenRefresh({
    commit: async () => moveState(server, {
      sourceGroupId, targetGroupId, studentIds: ['student-1'], subscriptionIds: ['sub-1'],
    }),
    applyCommitted: () => {
      moveState(local, { sourceGroupId, targetGroupId, studentIds: ['student-1'], subscriptionIds: ['sub-1'] });
      visibleGroupId = targetGroupId;
    },
    refresh: async () => { throw new Error('subscriptions refresh failed'); },
    applyRefresh: () => assert.fail('failed refresh must not apply rows'),
  });

  assert.equal((await transfer('source', 'target')).refreshed, false);
  assert.equal(visibleGroupId, 'target');
  assert.deepEqual(local, server, 'attendance transfer is fully projected before refresh');

  assert.equal((await transfer(visibleGroupId, 'source')).refreshed, false, 'reverse transfer uses the committed local source group');
  assert.equal(visibleGroupId, 'source');
  assert.deepEqual(normalizeMoveState(local), normalizeMoveState(initial));
  assert.deepEqual(local, server);
});
