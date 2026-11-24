import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { createServer } from 'vite';

globalThis.window = { innerWidth: 1200, localStorage: { getItem: () => null, setItem: () => {} }, addEventListener() {}, removeEventListener() {} };
globalThis.document = { activeElement: null, querySelector: () => null, addEventListener() {}, removeEventListener() {} };
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent', plugins: [{
  name: 'mock-schedule-db', enforce: 'pre',
  resolveId(source) { if (source === '../db') return '\0mock-schedule-db'; },
  load(id) { if (id === '\0mock-schedule-db') return `export const fetchStudioRooms = async () => []; export const fetchPendingIndividualIncome = async () => []; export const fetchScheduleFinancialOperations = async () => []; export const createStudioRoom = async () => {}; export const updateStudioRoom = async () => {}; export const renameStudioRoom = async () => {}; export const setStudioRoomBookingTrainerExceptions = async () => {};`; },
}] });
after(() => server.close());
const { default: ScheduleTab } = await server.ssrLoadModule('/src/components/ScheduleTab.jsx');
const date = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
const names = ['Зала 1', 'Зала 2', 'Зала 3'];
const block = { id: 'rule', startsOn: date, endsOn: date, startTime: '10:00', endTime: '11:00', weekdays: [1,2,3,4,5,6,7], allRooms: false, roomIds: ['r1','r2','r3'], roomNames: names, isActive: true };
const booking = { id: 'booking', date, startTime: '10:15', endTime: '10:45', roomName: names[0], title: 'Існуюче бронювання', status: 'active' };

test('the real weekly calendar shows one closure and opens an overlapping booking', async () => {
  let tree;
  await act(async () => { tree = create(React.createElement(ScheduleTab, { bookingBlocks: [block], bookingBlocksLoadStatus: 'ready', roomBookings: [booking], roomBookingsLoadStatus: 'ready' })); });
  assert.equal(tree.root.findAllByProps({ 'aria-label': 'Закритий час' }).length, 1);
  const card = tree.root.findAllByProps({ 'data-event-card': '1' }).find(node => node.props['aria-label'].includes('Існуюче бронювання'));
  assert.ok(card);
  assert.ok(card.props.style.zIndex > tree.root.findAll(node => node.props['data-closure-overlay'])[0].props.style.zIndex);
  await act(async () => card.props.onClick({ stopPropagation() {} }));
  assert.equal(tree.root.findAllByProps({ 'aria-labelledby': 'schedule-event-details-title' }).length, 1);
  await act(async () => tree.unmount());
});
