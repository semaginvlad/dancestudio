import test from 'node:test';
import assert from 'node:assert/strict';
import { expandBookingBlocks, findBookingBlockRuleOverlaps } from '../src/scheduleBookingBlocks.js';

const rooms = [{id:'r1',name:'Зал 1'},{id:'r2',name:'Зал 2'},{id:'r3',name:'Зал 3'}];
const weekly = {id:'weekly',title:'Вихідні',startsOn:'2026-11-28',endsOn:'2026-12-27',startTime:'16:00',endTime:'22:00',allRooms:true,roomIds:[],roomNames:[],weekdays:[6,7],isActive:true};
const once = {id:'once',title:'Разове',startsOn:'2026-12-06',endsOn:'2026-12-06',startTime:'17:00',endTime:'22:00',allRooms:false,roomIds:['r2'],roomNames:['Зал 2'],weekdays:[7],isActive:true};

test('independent rules explain the shared date, time and room; the adjacent date stays unchanged', () => {
 const selected={...weekly,blockId:'weekly',startsOn:'2026-12-06',endsOn:'2026-12-06',startTime:'17:00',allRooms:false,roomIds:['r2'],roomNames:['Зал 2']};
 const overlap=findBookingBlockRuleOverlaps(selected,[weekly,once],rooms);
 assert.equal(overlap.length,1); assert.equal(overlap[0].block.id,'once');
 assert.deepEqual([overlap[0].date,overlap[0].startTime,overlap[0].endTime,overlap[0].roomNames],['2026-12-06','17:00','22:00',['Зал 2']]);
 const updated={...weekly,exceptions:[{date:'2026-12-06',kind:'override',title:'Зміна',startTime:'17:00',endTime:'22:00',allRooms:false,roomIds:['r2'],roomNames:['Зал 2']}]};
 assert.equal(expandBookingBlocks([updated,once],'2026-12-06','2026-12-06',rooms).length,2);
 assert.equal(expandBookingBlocks([updated],'2026-12-05','2026-12-05',rooms).length,3);
 assert.equal(findBookingBlockRuleOverlaps({...selected,kind:'skip'},[weekly,once],rooms).length,0);
});

test('rule warning respects rooms, adjacent times, skip, and distant weekly occurrences', () => {
 const draft={...once,id:'new',startsOn:'2026-11-28',endsOn:'9999-12-31',weekdays:[6,7]};
 assert.equal(findBookingBlockRuleOverlaps({...draft,startTime:'22:00',endTime:'23:00'},[weekly],rooms).length,0);
 assert.equal(findBookingBlockRuleOverlaps({...draft,roomIds:['r1'],roomNames:['Зал 1']},[once],rooms).length,0);
 assert.equal(findBookingBlockRuleOverlaps(draft,[{...once,exceptions:[]}],rooms)[0].date,'2026-12-06');
 const skipped={...weekly,exceptions:[{date:'2026-12-06',kind:'skip'}]};
 assert.equal(findBookingBlockRuleOverlaps({...once,id:'new'},[skipped],rooms).length,0);
});
