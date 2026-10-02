import test from "node:test";
import assert from "node:assert/strict";
import { blockMatchesRoom, expandBookingBlocks, findBookingBlockConflict, getBookingBlockSaveGuard, intervalsOverlap, isoWeekday, parseDateOnly, resolveBookingBlockRooms, runBookingBlockMutation, validateBookingBlock } from "../src/scheduleBookingBlocks.js";

const rooms = [{ id: "one", name: "Перша", isActive: true }, { id: "two", name: "Друга", isActive: true }];
const base = { id: "b", title: "Закрито", startsOn: "2026-10-01", endsOn: "2026-10-07", startTime: "10:00", endTime: "11:00", weekdays: [1,2,3,4,5,6,7], allRooms: false, roomIds: ["one"], roomNames: ["Стара назва"], isActive: true };

test("date-only parsing and ISO weekdays avoid UTC shifts", () => { assert.equal(parseDateOnly("2026-10-02").getDate(), 2); assert.equal(isoWeekday("2026-10-04"), 7); });
test("adjacent intervals are allowed; partial and full overlap conflict", () => { assert.equal(intervalsOverlap("10:00","11:00","11:00","12:00"), false); assert.equal(intervalsOverlap("10:00","11:00","10:30","12:00"), true); assert.equal(intervalsOverlap("10:00","13:00","11:00","12:00"), true); });
test("single date, weekday range and selected/all room expansion", () => { assert.equal(expandBookingBlocks([{...base, startsOn:"2026-10-02", endsOn:"2026-10-02", weekdays:[5]}], "2026-10-02", "2026-10-02", rooms).length, 1); assert.equal(expandBookingBlocks([{...base, allRooms:true}], "2026-10-01", "2026-10-07", rooms).length, 14); assert.equal(expandBookingBlocks([{...base, weekdays:[1,3]}], "2026-10-01", "2026-10-07", rooms).length, 2); });
test("room ID survives rename and canonical name is fallback", () => { assert.equal(blockMatchesRoom(base, {id:"one", name:"Нова"}), true); assert.equal(blockMatchesRoom(base, {name:" стара  НАЗВА "}), true); });
test("inactive and cancelled do not conflict", () => { assert.equal(findBookingBlockConflict({date:"2026-10-02",startTime:"10:30",endTime:"11:30",roomId:"one",status:"cancelled"}, [base], rooms), null); assert.equal(findBookingBlockConflict({date:"2026-10-02",startTime:"10:30",endTime:"11:30",roomId:"one"}, [{...base,isActive:false}], rooms), null); });
for (const recurrence of ["daily","weekly","monthly"]) test(`recurring ${recurrence} conflict`, () => { const block = {...base, startsOn:"2026-10-01",endsOn:"2027-02-01",weekdays:[1,2,3,4,5,6,7]}; assert.ok(findBookingBlockConflict({date:"2026-09-02", recurrence, recurrenceUntil:"2027-02-02", startTime:"10:30",endTime:"11:30",roomId:"one"}, [block], rooms)); });
for (const recurrence of ["daily","weekly","monthly"]) test(`open-ended ${recurrence} reaches a future finite block`, () => { const block = {...base, startsOn:"2027-01-04",endsOn:"2027-03-31",weekdays:[1,2,3,4,5,6,7]}; assert.ok(findBookingBlockConflict({date:"2026-01-04", recurrence, recurrenceUntil:null, startTime:"10:30",endTime:"11:30",roomId:"one"}, [block], rooms)); });
test("monthly recurrence from January 31 skips February and returns on March 31", () => { const february = {...base, startsOn:"2026-02-28",endsOn:"2026-02-28",weekdays:[6]}; const march = {...base, startsOn:"2026-03-31",endsOn:"2026-03-31",weekdays:[2]}; const booking={date:"2026-01-31",recurrence:"monthly",recurrenceUntil:null,startTime:"10:30",endTime:"11:30",roomId:"one"}; assert.equal(findBookingBlockConflict(booking,[february],rooms),null); assert.equal(findBookingBlockConflict(booking,[march],rooms)?.date,"2026-03-31"); });
test("all-room block expands into the legacy fallback room", () => { const occurrences=expandBookingBlocks([{...base,allRooms:true,startsOn:"2026-10-02",endsOn:"2026-10-02",weekdays:[5]}],"2026-10-02","2026-10-02",[]); assert.equal(occurrences.length,1); assert.equal(occurrences[0].roomName,"Основна зала"); });
test("trainer is blocked while admin must explicitly confirm override", () => { const booking={date:"2026-10-02",startTime:"10:30",endTime:"11:30",roomId:"one"}; const trainer=getBookingBlockSaveGuard(booking,[base],rooms,false); const admin=getBookingBlockSaveGuard(booking,[base],rooms,true); assert.equal(trainer.blocked,true); assert.equal(trainer.requiresConfirmation,false); assert.equal(admin.blocked,false); assert.equal(admin.requiresConfirmation,true); });
test("selected-room draft resolves current canonical names before existing-booking checks", () => { const draft=resolveBookingBlockRooms({...base,roomIds:["one"],roomNames:undefined},[{id:"one",name:"  Перейменована   зала  "},{id:"two",name:"Друга"}]); assert.deepEqual(draft.roomNames,["Перейменована зала"]); const matching={date:"2026-10-02",startTime:"10:30",endTime:"10:45",roomName:"перейменована ЗАЛА"}; const other={...matching,roomName:"Друга"}; assert.ok(findBookingBlockConflict(matching,[draft],rooms)); assert.equal(findBookingBlockConflict(other,[draft],rooms),null); });
test("draft warning keeps all-room, adjacent and cancelled semantics", () => { const booking={date:"2026-10-02",startTime:"10:30",endTime:"10:45",roomName:"Друга"}; assert.ok(findBookingBlockConflict(booking,[{...base,allRooms:true,roomIds:[],roomNames:[]}],rooms)); assert.equal(findBookingBlockConflict({...booking,startTime:"11:00",endTime:"12:00"},[{...base,allRooms:true}],rooms),null); assert.equal(findBookingBlockConflict({...booking,status:"cancelled"},[{...base,allRooms:true}],rooms),null); });
test("client validation covers required fields and selected rooms", () => { assert.equal(validateBookingBlock({...base}).valid, true); assert.equal(validateBookingBlock({...base,title:"",roomIds:[]}).valid, false); });

test("booking-block mutation guard drops a rapid duplicate and clears saving after success", async () => {
  const guard={current:false}; const states=[]; let calls=0; let release;
  const pending=new Promise(resolve=>{release=resolve;});
  const first=runBookingBlockMutation(guard,value=>states.push(value),async()=>{calls+=1; await pending; return "saved";});
  const second=await runBookingBlockMutation(guard,value=>states.push(value),async()=>{calls+=1;});
  assert.deepEqual(second,{skipped:true}); assert.equal(calls,1); assert.equal(guard.current,true);
  release(); assert.deepEqual(await first,{skipped:false,value:"saved"}); assert.equal(guard.current,false); assert.deepEqual(states,[true,false]);
});

test("booking-block mutation guard clears after failure and permits create/update retry", async () => {
  const guard={current:false}; const states=[]; let calls=0;
  await assert.rejects(runBookingBlockMutation(guard,value=>states.push(value),async()=>{calls+=1; throw new Error("RPC failed");}),/RPC failed/);
  assert.equal(guard.current,false);
  const retry=await runBookingBlockMutation(guard,value=>states.push(value),async()=>{calls+=1; return {id:"updated"};});
  assert.equal(calls,2); assert.equal(retry.value.id,"updated"); assert.deepEqual(states,[true,false,true,false]);
});

test("booking-block manager disables save, preserves failed draft, and shares guard for create/update", async () => {
  const source=await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx",import.meta.url),"utf8");
  assert.match(source,/disabled=\{blockSaving\}>\{blockSaving \? "Збереження…" : "Зберегти"\}/);
  assert.match(source,/runBookingBlockMutation\(blockSavingRef, setBlockSaving, \(\) => onSaveBookingBlock\?\.\(presentationDraft\)\)/);
  assert.match(source,/catch \(error\) \{ setBlockError/);
  assert.doesNotMatch(source,/catch \(error\) \{[^}]*setBlockDraft/);
});
