import test from 'node:test';
import assert from 'node:assert/strict';

import { formatGroupScheduleLabel, getInternalGroupLabel } from '../src/shared/groupLabels.js';
import {
  getScheduleSlotStartTime,
  getExplicitMergeSchedulePatch,
  splitPaymentGroups,
  synchronizeScheduleSlotTime,
  withDirtyGroupSchedule,
} from '../src/shared/groupSchedule.js';

test('conflicting legacy time uses startTime consistently in payments, groups and attendance labels', () => {
  const group = {
    id: 'latin-mix',
    name: 'Latin mix',
    publicLevel: 'mix',
    schedule: [{ day: 1, time: '18:30', startTime: '18:00' }],
  };

  assert.equal(getScheduleSlotStartTime(group.schedule[0]), '18:00');
  assert.equal(formatGroupScheduleLabel(group.schedule), '[пн] 18:00');
  assert.match(getInternalGroupLabel(group), /Latin mix · MIX · \[пн\] 18:00/);
});

test('entering the visible legacy time replaces a stale startTime', () => {
  assert.deepEqual(
    synchronizeScheduleSlotTime({ day: 1, time: '18:30', startTime: '18:00' }, '18:30', '19:30'),
    { day: 1, time: '18:30', startTime: '18:30', endTime: '19:30' },
  );
});

test('entering a new time replaces both conflicting start fields', () => {
  assert.deepEqual(
    synchronizeScheduleSlotTime({ day: 1, time: '18:30', startTime: '18:00' }, '19:00', '20:00'),
    { day: 1, time: '19:00', startTime: '19:00', endTime: '20:00' },
  );
});

test('group metadata updates omit an untouched schedule', () => {
  const schedule = [{ day: 1, time: '18:30', startTime: '18:00' }];
  assert.deepEqual(withDirtyGroupSchedule({ name: 'New name' }, schedule, false), { name: 'New name' });
  assert.deepEqual(withDirtyGroupSchedule({ trainerId: 'trainer-2' }, schedule, false), { trainerId: 'trainer-2' });
});

test('calendar and group editors persist the same synchronized slot structure', () => {
  const conflict = { day: 1, time: '18:30', startTime: '18:00', endTime: '19:00' };
  const fromGroupEditor = synchronizeScheduleSlotTime(conflict, '19:00', '20:00');
  const fromCalendarEditor = synchronizeScheduleSlotTime(conflict, '19:00', '20:00');
  assert.deepEqual(fromCalendarEditor, fromGroupEditor);
  const reloaded = JSON.parse(JSON.stringify(fromGroupEditor));
  assert.equal(getScheduleSlotStartTime(reloaded), '19:00');
});

test('merge and undo preserve conflicting hours unless a schedule change was explicit', () => {
  const schedule = [{ day: 1, time: '18:30', startTime: '18:00' }];
  assert.deepEqual(getExplicitMergeSchedulePatch('keep_target_schedule', schedule), {});
  assert.deepEqual(getExplicitMergeSchedulePatch('use_source_schedule', schedule), { schedule });
  assert.deepEqual(getExplicitMergeSchedulePatch('custom_schedule', schedule), { schedule });
});

test('historical payment group is not current while its old payments remain filterable', () => {
  const groups = [
    { id: 'current', name: 'Current', isActive: true },
    { id: 'old', name: 'Old', archivedAt: '2026-01-01' },
    { id: 'unused-old', name: 'Unused old', archivedAt: '2025-01-01' },
  ];
  const oldPayment = { id: 'payment-1', groupId: 'old', amount: 1500 };
  const result = splitPaymentGroups(groups, [oldPayment]);

  assert.deepEqual(result.current.map(({ id }) => id), ['current']);
  assert.deepEqual(result.historical.map(({ id }) => id), ['old']);
  assert.equal([oldPayment].filter((payment) => payment.groupId === result.historical[0].id)[0].amount, 1500);
});
