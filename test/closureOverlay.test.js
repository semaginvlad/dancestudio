import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { createServer } from 'vite';
import { expandBookingBlocks } from '../src/scheduleBookingBlocks.js';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
after(() => server.close());
const { ClosureOverlay, groupClosureLanes, deduplicateClosureEvents } = await server.ssrLoadModule('/src/components/ClosureOverlay.jsx');
const rooms = [1, 2, 3].map(n => ({ id: `r${n}`, name: `Зала ${n}`, isActive: true }));
const rule = { id: 'rule-a', startsOn: '2026-12-01', endsOn: '2026-12-15', startTime: '10:00', endTime: '11:00', weekdays: [2], allRooms: true, isActive: true };
const lanesFor = (rules) => {
  const events = expandBookingBlocks(rules, '2026-12-01', '2026-12-01', rooms);
  return rooms.map(room => ({ roomName: room.name, events: events.filter(e => e.roomId === room.id) }));
};
const renderGroups = (lanes, onOpen = () => {}) => {
  const groups = groupClosureLanes(lanes);
  const tree = create(React.createElement(React.Fragment, null, groups.map(group => React.createElement(ClosureOverlay, { key: group.key, group, hourPx: 60, startHour: 8, endHour: 22, gap: 0, isAdmin: true, onOpen }))));
  return { groups, tree };
};

test('one recurring closure across three rooms renders one full-width indicator', () => {
  const { groups, tree } = renderGroups(lanesFor([rule]));
  assert.deepEqual(groups[0].runs, [{ start: 0, end: 2 }]);
  assert.equal(tree.root.findAllByProps({ 'aria-label': 'Закритий час' }).length, 1);
  assert.equal(tree.root.findByProps({ 'data-closure-run': '0-2' }).props.style.width, 'calc(300% + 0px)');
});

test('a subset covers only its rooms, including non-adjacent rooms', () => {
  const selected = { ...rule, allRooms: false, roomIds: ['r1', 'r2'], roomNames: ['Зала 1', 'Зала 2'] };
  const { groups, tree } = renderGroups(lanesFor([selected]));
  assert.deepEqual(groups[0].runs, [{ start: 0, end: 1 }]);
  assert.equal(tree.root.findAllByProps({ 'aria-label': 'Закритий час' }).length, 1);
  assert.equal(tree.root.findByProps({ 'data-closure-run': '0-1' }).props.style.width, 'calc(200% + 0px)');
  const sparse = { ...selected, roomIds: ['r1', 'r3'], roomNames: ['Зала 1', 'Зала 3'] };
  assert.deepEqual(renderGroups(lanesFor([sparse])).groups[0].runs, [{ start: 0, end: 0 }, { start: 2, end: 2 }]);
});

test('distinct rules stay distinct even with the same title and time', () => {
  const lanes = lanesFor([rule, { ...rule, id: 'rule-b' }]);
  const { tree } = renderGroups(lanes);
  const indicators = tree.root.findAllByProps({ 'aria-label': 'Закритий час' });
  assert.equal(indicators.length, 2);
  assert.notEqual(indicators[0].props.style.left, indicators[1].props.style.left);
  assert.equal(deduplicateClosureEvents(lanes.flatMap(lane => lane.events)).length, 2);
});

test('overlay does not capture the booking hit area and booking remains above it', async () => {
  const { groups } = renderGroups(lanesFor([rule]));
  let clicked = false;
  const tree = create(React.createElement('div', null,
    React.createElement(ClosureOverlay, { group: groups[0], hourPx: 60, startHour: 8, endHour: 22, gap: 0, isAdmin: true, onOpen: () => {} }),
    React.createElement('button', { style: { position: 'absolute', zIndex: 4 }, onClick: () => { clicked = true; } }, 'Бронювання')));
  assert.equal(tree.root.findByProps({ 'data-closure-overlay': groups[0].key }).props.style.pointerEvents, 'none');
  assert.equal(tree.root.findByProps({ 'data-closure-overlay': groups[0].key }).props.style.zIndex, 3);
  act(() => tree.root.findAllByType('button').find(node => node.children.includes('Бронювання')).props.onClick());
  assert.equal(clicked, true);
  const source = await readFile(new URL('../src/components/ScheduleTab.jsx', import.meta.url), 'utf8');
  assert.match(source, /zIndex: 5 \+ event\.colIndex/);
  assert.match(source, /zIndex: 4 \}\}/);
});
