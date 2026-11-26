import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { create, act } from 'react-test-renderer';
import { createServer } from 'vite';

globalThis.window = { innerWidth: 1200, localStorage: { getItem: () => null, setItem: () => {} }, addEventListener() {}, removeEventListener() {}, confirm: () => true };
globalThis.document = { activeElement: null, querySelector: () => null, addEventListener() {}, removeEventListener() {} };

test('overlapping independent closures remain visible and manageable after a single-date edit', async (t) => {
 const server=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'silent',plugins:[{
  name:'mock-schedule-db',enforce:'pre',resolveId(source){if(source==='../db')return '\0diagnostic-db';},
  load(id){if(id==='\0diagnostic-db')return `export const fetchStudioRooms = async () => [{id:'r1',name:'Зал 1',isActive:true},{id:'r2',name:'Зал 2',isActive:true},{id:'r3',name:'Зал 3',isActive:true}]; export const fetchPendingIndividualIncome = async () => []; export const fetchScheduleFinancialOperations = async () => []; export const createStudioRoom = async () => {}; export const updateStudioRoom = async () => {}; export const renameStudioRoom = async () => {}; export const setStudioRoomBookingTrainerExceptions = async () => {};`;},
 }]});
 let tree;
 try {
  const {default:ScheduleTab}=await server.ssrLoadModule('/src/components/ScheduleTab.jsx');
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-12-06T12:00:00Z')});
  const date='2026-12-06';
  const block={id:'rule',title:'Закрито',note:'',startsOn:'2026-11-28',endsOn:'2026-12-27',startTime:'16:00',endTime:'22:00',weekdays:[6,7],allRooms:true,roomIds:[],roomNames:[],isActive:true};
  const once={id:'once',title:'Внутрішній ремонт 42',note:'',startsOn:date,endsOn:date,startTime:'17:00',endTime:'22:00',weekdays:[7],allRooms:false,roomIds:['r2'],roomNames:['Зал 2'],isActive:true};
  const existingBooking={id:'existing',date,startTime:'18:00',endTime:'19:00',roomName:'Зал 2',status:'active'};
  const confirmations=[]; let declineWarning=true; window.confirm=message=>{confirmations.push(message);if(declineWarning){declineWarning=false;return false;}return true;};
  let submitted, seriesSaved=false;
  const props={isAdmin:true,bookingBlocks:[block,once],bookingBlocksLoadStatus:'ready',roomBookings:[existingBooking],roomBookingsLoadStatus:'ready',onRetryRoomBookings:async()=>[existingBooking],onRetryBookingBlocks:async()=>[block,once],onSaveBookingBlock:async()=>{seriesSaved=true;},onSaveBookingBlockException:async draft=>{submitted=draft;}};
  await act(async()=>{tree=create(React.createElement(ScheduleTab,props));});
  const targetOverlay=tree.root.findAll(node=>node.props['data-closure-overlay']).find(node=>{const key=JSON.parse(node.props['data-closure-overlay']);return key[0]==='rule' && key[1]===date;});
  await act(async()=>targetOverlay.findByProps({'aria-label':'Закритий час'}).props.onClick());
  const dialog=tree.root.findByProps({'aria-label':'Правила закриття'});
  assert.match(JSON.stringify(tree.toJSON()),/Внутрішній ремонт 42/);
  assert.match(JSON.stringify(tree.toJSON()),/залишаються активним|залишається активним/);
  await act(async()=>tree.root.findAllByType('button').find(node=>node.children.includes('Змінити лише цю дату')).props.onClick());
  const times=tree.root.findAllByType('input').filter(node=>node.props.type==='time');
  await act(async()=>times[0].props.onChange({target:{value:'17:00'}}));
  const roomScope=tree.root.findAllByType('input').filter(node=>node.props.name==='booking-block-room-scope');
  await act(async()=>roomScope[1].props.onChange());
  const room2=tree.root.findAllByType('label').find(label=>label.children.includes('Зал 2'));
  await act(async()=>room2.findByType('input').props.onChange());
  await act(async()=>tree.root.findAllByType('button').find(node=>node.children.includes('Зберегти закриття')).props.onClick());
  assert.equal(submitted,undefined); assert.match(confirmations[0],/Внутрішній ремонт 42/); confirmations.length=0;
  await act(async()=>tree.root.findAllByType('button').find(node=>node.children.includes('Зберегти закриття')).props.onClick());
  assert.equal(seriesSaved,false); assert.equal(submitted.blockId,'rule'); assert.equal(submitted.occurrenceDate,date); assert.equal(submitted.kind,'override'); assert.equal(submitted.startTime,'17:00'); assert.equal(submitted.endTime,'22:00'); assert.equal(submitted.allRooms,false); assert.deepEqual(submitted.roomIds,['r2']);
  assert.match(confirmations[0],/Внутрішній ремонт 42.*2026-12-06.*17:00.*22:00.*Зал 2/);
  assert.match(confirmations[1],/бронювань/);
  assert.deepEqual(existingBooking,{id:'existing',date,startTime:'18:00',endTime:'19:00',roomName:'Зал 2',status:'active'});
  const exception={date,kind:submitted.kind,title:submitted.title,note:submitted.note,startTime:submitted.startTime,endTime:submitted.endTime,allRooms:submitted.allRooms,roomIds:submitted.roomIds,roomNames:submitted.roomNames};
  await act(async()=>tree.update(React.createElement(ScheduleTab,{...props,bookingBlocks:[{...block,exceptions:[exception]},once]})));
  const overlays=tree.root.findAll(node=>node.props['data-closure-overlay'] && JSON.parse(node.props['data-closure-overlay'])[1]===date);
  assert.equal(overlays.length,2);
  assert.ok(overlays.some(node=>JSON.parse(node.props['data-closure-overlay'])[0]==='rule'));
  assert.ok(overlays.some(node=>JSON.parse(node.props['data-closure-overlay'])[0]==='once'));
  const resultDialog=tree.root.findByProps({'aria-label':'Правила закриття'});
  assert.match(JSON.stringify(tree.toJSON()),/Внутрішній ремонт 42/);
  assert.match(JSON.stringify(tree.toJSON()),/залишається активним/);
  await act(async()=>tree.root.findAllByType('button').find(node=>node.children.includes('Змінити лише цю дату')).props.onClick());
  const skipLabel=tree.root.findAllByType('label').find(label=>label.children.includes(' Вимкнути закриття на цю дату'));
  await act(async()=>skipLabel.findByType('input').props.onChange({target:{checked:true}}));
  confirmations.length=0;
  await act(async()=>tree.root.findAllByType('button').find(node=>node.children.includes('Зберегти закриття')).props.onClick());
  assert.equal(submitted.kind,'skip'); assert.equal(confirmations.length,0);
  await act(async()=>tree.update(React.createElement(ScheduleTab,{...props,bookingBlocks:[{...block,exceptions:[{date,kind:'skip'}]},once]})));
  assert.match(JSON.stringify(tree.toJSON()),/Це входження вимкнено на цю дату/);
  assert.match(JSON.stringify(tree.toJSON()),/Внутрішній ремонт 42/);
  assert.equal(tree.root.findAll(node=>node.props['data-closure-overlay'] && JSON.parse(node.props['data-closure-overlay'])[1]===date).length,1);
  await act(async()=>tree.root.findAllByType('button').find(node=>node.children.includes('Переглянути це правило')).props.onClick());
  const selectedDialog=tree.root.findByProps({'aria-label':'Правила закриття'});
  assert.match(JSON.stringify(tree.toJSON()),/Внутрішній ремонт 42/);
  await act(async()=>selectedDialog.findAllByType('button').find(node=>node.children.includes('Керування цим правилом')).props.onClick());
  assert.ok(tree.root.findAllByType('button').some(node=>node.children.includes('Показати всі правила')));
  await act(async()=>tree.update(React.createElement(ScheduleTab,{...props,isAdmin:false,roomBookings:[],bookingBlocks:[{...block,title:'',note:'',exceptions:[{...exception,title:'',note:''}]},{...once,title:'',note:''}]})));
  const trainerOverlay=tree.root.findAll(node=>node.props['data-closure-overlay']).find(node=>JSON.parse(node.props['data-closure-overlay'])[1]===date);
  await act(async()=>trainerOverlay.findByProps({'aria-label':'Закритий час'}).props.onClick());
  assert.equal(tree.root.findAllByProps({'aria-label':'Правила закриття'}).length,0);
  assert.doesNotMatch(JSON.stringify(tree.toJSON()),/Внутрішній ремонт 42/);
 } finally { if(tree) await act(async()=>tree.unmount()); t.mock.timers.reset(); await server.close(); }
});
