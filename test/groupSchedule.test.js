import test from 'node:test';
import assert from 'node:assert/strict';

import { formatGroupScheduleLabel, getInternalGroupLabel } from '../src/shared/groupLabels.js';
import {
  getScheduleSlotStartTime,
  splitPaymentGroups,
  synchronizeScheduleSlotTime,
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

test('schedule edits keep time and startTime synchronized', () => {
  assert.deepEqual(
    synchronizeScheduleSlotTime({ day: 1, time: '18:30', startTime: '18:00' }, '19:10', '20:10'),
    { day: 1, time: '19:10-20:10', startTime: '19:10' },
  );
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
