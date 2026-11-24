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

test('admin chooses one occurrence and receives its effective fields', async () => {
  const start = new Date(`${date}T12:00:00`); start.setDate(start.getDate()-7);
  const end = new Date(`${date}T12:00:00`); end.setDate(end.getDate()+7);
  const key = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const recurring = {...block,title:'Базова назва',note:'Базова нотатка',startsOn:key(start),endsOn:key(end),weekdays:[new Date(`${date}T12:00:00`).getDay() || 7],exceptions:[{date,kind:'override',title:'Назва винятку',note:'Нотатка винятку',startTime:'12:00',endTime:'13:00',allRooms:true,roomIds:[],roomNames:[]}]};
  let tree;
  await act(async () => { tree = create(React.createElement(ScheduleTab, { isAdmin:true, bookingBlocks:[recurring],bookingBlocksLoadStatus:'ready',roomBookings:[],roomBookingsLoadStatus:'ready' })); });
  const overlay = tree.root.findAllByProps({'aria-label':'Закритий час'}).find(node=>node.props.onClick);
  await act(async () => overlay.props.onClick());
  const choose = tree.root.findAllByType('button').find(node=>node.children.includes('Змінити лише цю дату'));
  assert.ok(choose);
  await act(async () => choose.props.onClick());
  assert.ok(tree.root.findAllByType('input').some(node=>node.props.value==='Назва винятку'));
  assert.ok(tree.root.findAllByType('input').some(node=>node.props.value==='Нотатка винятку'));
  assert.ok(tree.root.findAllByType('input').some(node=>node.props.value==='12:00'));
  assert.ok(tree.root.findAllByType('input').some(node=>node.props.value===date && node.props.disabled));
  await act(async () => tree.unmount());
});

test('both roles render only the effective closure when a rule arrives twice', async () => {
  const start = new Date(`${date}T12:00:00`); start.setDate(start.getDate()-7);
  const end = new Date(`${date}T12:00:00`); end.setDate(end.getDate()+7);
  const key = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const rule = {...block,title:'',note:'',startsOn:key(start),endsOn:key(end),startTime:'08:00',endTime:'13:00',weekdays:[new Date(`${date}T12:00:00`).getDay() || 7],allRooms:true,roomIds:[],roomNames:[]};
  const exception = {date,kind:'override',title:'',note:'',startTime:'16:00',endTime:'18:00',allRooms:false,roomIds:['r2'],roomNames:['Зала 2']};
  for (const isAdmin of [true,false]) {
    let tree;
    const props = {isAdmin,bookingBlocks:[rule,{...rule,exceptions:[exception]}],bookingBlocksLoadStatus:'ready',roomBookings:[],roomBookingsLoadStatus:'ready'};
    await act(async () => { tree = create(React.createElement(ScheduleTab,props)); });
    const overlays = tree.root.findAll(node=>node.props['data-closure-overlay']);
    assert.equal(overlays.length,1);
    assert.deepEqual(JSON.parse(overlays[0].props['data-closure-overlay']),['rule',date,'16:00','18:00']);
    assert.equal(JSON.stringify(tree.toJSON()).includes('Приватна нотатка'),false);
    await act(async () => tree.update(React.createElement(ScheduleTab,{...props,bookingBlocks:[rule,{...rule,exceptions:[{date,kind:'skip'}]}]})));
    assert.equal(tree.root.findAll(node=>node.props['data-closure-overlay']).length,0);
    await act(async () => tree.unmount());
  }
});
