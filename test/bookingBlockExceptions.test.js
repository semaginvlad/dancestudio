import test from 'node:test';
import assert from 'node:assert/strict';
import { expandBookingBlocks, findBookingBlockConflict } from '../src/scheduleBookingBlocks.js';

const rooms = [{id:'a',name:'A'}, {id:'b',name:'B'}];
const base = {id:'rule', title:'Base', note:'Base note', startsOn:'2027-01-05', endsOn:'2027-01-26', startTime:'10:00',endTime:'11:00',allRooms:false,roomIds:['a'],roomNames:['A'],weekdays:[2],isActive:true};
const override = {date:'2027-01-12',kind:'override',title:'Changed',note:'Note',startTime:'12:00',endTime:'13:00',allRooms:false,roomIds:['b'],roomNames:['B']};
const events = block => expandBookingBlocks([block],base.startsOn,base.endsOn,rooms).map(({date,roomName,startTime,title})=>({date,roomName,startTime,title}));
const booking = (date,startTime,roomName,extra={})=>({date,startTime,endTime:startTime==='10:15'?'10:45':'12:45',roomName,...extra});

test('override changes only one date and its time, room and details', () => {
 const result=events({...base,exceptions:[override]});
 assert.deepEqual(result,[{date:'2027-01-05',roomName:'A',startTime:'10:00',title:'Base'},{date:'2027-01-12',roomName:'B',startTime:'12:00',title:'Changed'},{date:'2027-01-19',roomName:'A',startTime:'10:00',title:'Base'},{date:'2027-01-26',roomName:'A',startTime:'10:00',title:'Base'}]);
 assert.ok(findBookingBlockConflict(booking('2027-01-12','12:15','B'),[{...base,exceptions:[override]}],rooms));
 assert.equal(findBookingBlockConflict(booking('2027-01-12','10:15','A'),[{...base,exceptions:[override]}],rooms),null);
 assert.ok(findBookingBlockConflict(booking('2027-01-05','12:15','B',{recurrence:'weekly',recurrenceUntil:'2027-01-26'}),[{...base,exceptions:[override]}],rooms));
});
test('skip removes one occurrence; deleting either exception restores the base', () => {
 const skip={date:'2027-01-12',kind:'skip'};
 assert.deepEqual(events({...base,exceptions:[skip]}).map(x=>x.date),['2027-01-05','2027-01-19','2027-01-26']);
 assert.equal(findBookingBlockConflict(booking('2027-01-12','10:15','A'),[{...base,exceptions:[skip]}],rooms),null);
 for (const exception of [skip,override]) {
  const restored={...base,exceptions:[exception].filter(()=>false)};
  assert.deepEqual(events(restored),events(base));
  assert.ok(findBookingBlockConflict(booking('2027-01-12','10:15','A'),[restored],rooms));
 }
});

test('time-only and room-only overrides leave the rest of the series unchanged', () => {
 const timeOnly={...base,date:'2027-01-12',kind:'override',startTime:'12:00',endTime:'13:00'};
 const roomOnly={...base,date:'2027-01-12',kind:'override',roomIds:['b'],roomNames:['B']};
 for (const item of [timeOnly,roomOnly]) {
  const result=events({...base,exceptions:[item]});
  assert.deepEqual(result.filter(event=>event.date!=='2027-01-12'),events(base).filter(event=>event.date!=='2027-01-12'));
 }
 assert.equal(events({...base,exceptions:[timeOnly]})[1].startTime,'12:00');
 assert.equal(events({...base,exceptions:[roomOnly]})[1].roomName,'B');
});

test('all-room rule is completely replaced before rendering rooms, even with duplicate rule copies', () => {
 const threeRooms = [{id:'1',name:'Зал 1'},{id:'2',name:'Зал 2'},{id:'3',name:'Зал 3'}];
 const rule = {...base,allRooms:true,roomIds:[],roomNames:[],startTime:'08:00',endTime:'13:00'};
 const changed = {date:'2027-01-12',kind:'override',title:'Зміна',note:'Приватно',startTime:'16:00',endTime:'18:00',allRooms:false,roomIds:['2'],roomNames:['Зал 2']};
 for (const copies of [[rule,{...rule,exceptions:[changed]}],[{...rule,exceptions:[changed]},rule]]) {
  const shown=expandBookingBlocks(copies,'2027-01-12','2027-01-12',threeRooms);
  assert.deepEqual(shown.map(({roomName,startTime,endTime})=>({roomName,startTime,endTime})),[{roomName:'Зал 2',startTime:'16:00',endTime:'18:00'}]);
  assert.equal(expandBookingBlocks(copies,'2027-01-19','2027-01-19',threeRooms).length,3);
  assert.equal(findBookingBlockConflict({date:'2027-01-12',startTime:'08:30',endTime:'09:00',roomName:'Зал 1'},copies,threeRooms),null);
  assert.ok(findBookingBlockConflict({date:'2027-01-12',startTime:'16:30',endTime:'17:00',roomName:'Зал 2'},copies,threeRooms));
 }
 const skipped = [rule,{...rule,exceptions:[{date:'2027-01-12',kind:'skip'}]}];
 assert.deepEqual(expandBookingBlocks(skipped,'2027-01-12','2027-01-12',threeRooms),[]);
 assert.equal(expandBookingBlocks(skipped,'2027-01-19','2027-01-19',threeRooms).length,3);
});
