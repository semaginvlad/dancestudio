import test from "node:test";
import assert from "node:assert/strict";
import { blockMatchesRoom, bookingRecurrenceCandidates, buildBookingBlockDisplayRooms, expandBookingBlocks, findBookingBlockConflict, getBookingBlockSaveGuard, getFreshBookingBlockSaveGuard, intervalsOverlap, isoWeekday, parseDateOnly, reconcileBookingBlockRooms, resolveBookingBlockRooms, runBookingBlockMutation, selectBookingBlockRooms, validateBookingBlock } from "../src/scheduleBookingBlocks.js";

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
test("bounded candidates avoid scanning long calendar ranges", () => { const future={startsOn:"9000-01-01",endsOn:"9999-12-31"}; assert.deepEqual(bookingRecurrenceCandidates({date:"2026-01-01",recurrence:"none"},future.startsOn,future.endsOn),[]); assert.equal(bookingRecurrenceCandidates({date:"2026-01-01",recurrence:"daily"},future.startsOn,future.endsOn).length,7); assert.equal(bookingRecurrenceCandidates({date:"2026-01-01",recurrence:"weekly"},future.startsOn,future.endsOn).length,1); });
for (const recurrence of ["daily","weekly"]) test(`long open-ended ${recurrence} finds a year-9000 block`, () => { const block={...base,startsOn:"9000-01-01",endsOn:"9999-12-31",weekdays:[1,2,3,4,5,6,7]}; assert.ok(findBookingBlockConflict({date:"2026-01-01",recurrence,recurrenceUntil:null,startTime:"10:30",endTime:"10:45",roomId:"one"},[block],rooms)); });
test("one-off checks only its own date even when block ends in 9999", () => { const long={...base,startsOn:"9000-01-01",endsOn:"9999-12-31"}; assert.equal(findBookingBlockConflict({date:"2026-01-01",recurrence:"none",startTime:"10:30",endTime:"10:45",roomId:"one"},[long],rooms),null); const same={...long,startsOn:"2026-01-01"}; assert.equal(findBookingBlockConflict({date:"2026-01-01",recurrence:"none",startTime:"10:30",endTime:"10:45",roomId:"one"},[same],rooms)?.date,"2026-01-01"); });
test("one-off and unknown modes ignore stale recurrenceUntil", () => { for (const recurrence of ["none","crafted"]) assert.deepEqual(bookingRecurrenceCandidates({date:"2026-10-02",recurrence,recurrenceUntil:"2026-01-01"},"2026-10-02","2026-10-02"),["2026-10-02"]); });
test("weekly candidates align to the booking start using calendar days", () => { assert.deepEqual(bookingRecurrenceCandidates({date:"2026-01-01",recurrence:"weekly"},"2026-01-03","2026-01-20"),["2026-01-08"]); });
test("monthly candidates skip invalid days and are capped to one Gregorian cycle", () => { assert.deepEqual(bookingRecurrenceCandidates({date:"2026-01-31",recurrence:"monthly"},"2026-02-01","2026-03-31"),["2026-03-31"]); assert.ok(bookingRecurrenceCandidates({date:"2026-01-31",recurrence:"monthly"},"2026-01-01","9999-12-31").length <= 4800); });
test("all-room block expands into the legacy fallback room", () => { const occurrences=expandBookingBlocks([{...base,allRooms:true,startsOn:"2026-10-02",endsOn:"2026-10-02",weekdays:[5]}],"2026-10-02","2026-10-02",[]); assert.equal(occurrences.length,1); assert.equal(occurrences[0].roomName,"Основна зала"); });
test("trainer is blocked while admin must explicitly confirm override", () => { const booking={date:"2026-10-02",startTime:"10:30",endTime:"11:30",roomId:"one"}; const trainer=getBookingBlockSaveGuard(booking,[base],rooms,false); const admin=getBookingBlockSaveGuard(booking,[base],rooms,true); assert.equal(trainer.blocked,true); assert.equal(trainer.requiresConfirmation,false); assert.equal(admin.blocked,false); assert.equal(admin.requiresConfirmation,true); });
test("selected-room draft resolves current canonical names before existing-booking checks", () => { const draft=resolveBookingBlockRooms({...base,roomIds:["one"],roomNames:undefined},[{id:"one",name:"  Перейменована   зала  "},{id:"two",name:"Друга"}]); assert.deepEqual(draft.roomNames,["Перейменована зала"]); const matching={date:"2026-10-02",startTime:"10:30",endTime:"10:45",roomName:"перейменована ЗАЛА"}; const other={...matching,roomName:"Друга"}; assert.ok(findBookingBlockConflict(matching,[draft],rooms)); assert.equal(findBookingBlockConflict(other,[draft],rooms),null); });
test("room reconciliation uses stable IDs and current names after rename", () => { const original={...base,roomNames:["Стара назва"]}; const reconciled=reconcileBookingBlockRooms(original,[{id:"one",name:" Нова   назва ",isActive:true}]); assert.notEqual(reconciled,original); assert.deepEqual(reconciled.roomIds,["one"]); assert.deepEqual(reconciled.roomNames,["Нова назва"]); assert.deepEqual(original.roomNames,["Стара назва"]); const booking={date:"2026-10-02",startTime:"10:30",endTime:"10:45",roomName:"нова НАЗВА"}; assert.ok(findBookingBlockConflict(booking,[reconciled],rooms)); assert.equal(blockMatchesRoom(reconciled,{name:"Стара назва"}),false); });
test("archived and partially unresolved room associations survive unrelated edits", () => { const block={...base,title:"Нова причина",roomIds:["one","archived"],roomNames:["Стара активна","Архівна зала"]}; const reconciled=reconcileBookingBlockRooms(block,[{id:"one",name:"Актуальна"}]); assert.deepEqual(reconciled.roomIds,["one","archived"]); assert.deepEqual(reconciled.roomNames,["Актуальна","Архівна зала"]); assert.equal(reconciled.title,"Нова причина"); assert.ok(findBookingBlockConflict({date:"2026-10-02",startTime:"10:30",endTime:"10:45",roomName:"архівна  ЗАЛА"},[reconciled],rooms)); });
test("room picker offers active rooms and only archived rooms already bound to the draft", () => {
  const studioRooms=[
    {id:"active",name:"Активна",isActive:true},
    {id:"kept",name:"Архівна чинна",isActive:false},
    {id:"hidden",name:"Архівна інша",isActive:false},
    {id:"active",name:"Дублікат",isActive:true},
  ];
  assert.deepEqual(selectBookingBlockRooms(studioRooms,{roomIds:[]}).map(room=>room.id),["active"]);
  assert.deepEqual(selectBookingBlockRooms(studioRooms,{roomIds:["kept","missing"],roomNames:["Стара назва","Відсутня"]}).map(room=>[room.id,room.name]),[
    ["active","Активна"], ["kept","Архівна чинна"], ["missing","Відсутня"],
  ]);
});
test("reconciliation deduplicates names and clears associations for all-room rules", () => { const selected=reconcileBookingBlockRooms({...base,roomIds:["one","two"],roomNames:["OLD"," зал 1 "]},[{id:"one",name:"Зал 1"}]); assert.deepEqual(selected.roomIds,["one","two"]); assert.deepEqual(selected.roomNames,["Зал 1"]); const all=reconcileBookingBlockRooms({...base,allRooms:true,roomIds:["one"],roomNames:["Перша"]},rooms); assert.deepEqual(all.roomIds,[]); assert.deepEqual(all.roomNames,[]); });
test("calendar expansion and save guard share the reconciled rule", () => { const canonicalRooms=[{id:"one",name:"Нова",isActive:true}]; const reconciled=reconcileBookingBlockRooms({...base,roomNames:["Стара"]},canonicalRooms); const display=buildBookingBlockDisplayRooms(canonicalRooms,[...reconciled.roomNames],"Основна зала"); assert.equal(expandBookingBlocks([reconciled],"2026-10-02","2026-10-02",display)[0].roomName,"Нова"); assert.ok(getBookingBlockSaveGuard({date:"2026-10-02",startTime:"10:30",endTime:"10:45",roomName:"Нова"},[reconciled],canonicalRooms,true).requiresConfirmation); });
test("new mutation presentation has no placeholder id while edits retain their UUID", () => { const created=resolveBookingBlockRooms({...base,id:undefined,roomNames:undefined},rooms); const updated=resolveBookingBlockRooms({...base,id:"11111111-1111-1111-1111-111111111111",roomNames:undefined},rooms); assert.notEqual(created.id,"draft"); assert.equal(updated.id,"11111111-1111-1111-1111-111111111111"); assert.deepEqual(created.roomNames,["Перша"]); });
test("conflict-only id never enters the create/update mutation payload", async () => { const source=await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx",import.meta.url),"utf8"); assert.match(source,/const conflictDraft = \{ \.\.\.presentationDraft, id: presentationDraft\.id \|\| "draft" \}/); assert.match(source,/findBookingBlockConflict\(booking, \[conflictDraft\]/); assert.match(source,/onSaveBookingBlock\?\.\(presentationDraft\)/); assert.doesNotMatch(source,/onSaveBookingBlock\?\.\(conflictDraft\)/); const app=await (await import("node:fs/promises")).readFile(new URL("../src/App.jsx",import.meta.url),"utf8"); assert.match(app,/block\.id \? await db\.updateScheduleBookingBlock\(block\.id, block\) : await db\.createScheduleBookingBlock\(block\)/); });
test("draft warning keeps all-room, adjacent and cancelled semantics", () => { const booking={date:"2026-10-02",startTime:"10:30",endTime:"10:45",roomName:"Друга"}; assert.ok(findBookingBlockConflict(booking,[{...base,allRooms:true,roomIds:[],roomNames:[]}],rooms)); assert.equal(findBookingBlockConflict({...booking,startTime:"11:00",endTime:"12:00"},[{...base,allRooms:true}],rooms),null); assert.equal(findBookingBlockConflict({...booking,status:"cancelled"},[{...base,allRooms:true}],rooms),null); });
test("display rooms merge active and legacy lanes with canonical active priority", () => { const display=buildBookingBlockDisplayRooms([{id:"active",name:" Зал 1 ",isActive:true}],["зал   1","Legacy"],"Основна зала"); assert.deepEqual(display,[{id:"active",name:"Зал 1",isActive:true},{id:"legacy:legacy",name:"Legacy",isActive:true}]); const all=expandBookingBlocks([{...base,allRooms:true,startsOn:"2026-10-02",endsOn:"2026-10-02",weekdays:[5]}],"2026-10-02","2026-10-02",display); assert.deepEqual(all.map(item=>item.roomName),["Зал 1","Legacy"]); });
test("specific room stays in its lane and default appears only with no rooms", () => { const display=buildBookingBlockDisplayRooms([], ["Legacy"], "Основна зала"); const selected={...base,roomIds:[],roomNames:["legacy"],startsOn:"2026-10-02",endsOn:"2026-10-02",weekdays:[5]}; assert.deepEqual(expandBookingBlocks([selected],"2026-10-02","2026-10-02",display).map(item=>item.roomName),["Legacy"]); assert.deepEqual(buildBookingBlockDisplayRooms([],[],"Основна зала").map(room=>room.name),["Основна зала"]); assert.deepEqual(display.map(room=>room.name),["Legacy"]); });
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
  assert.match(source,/disabled=\{blockSaving \|\| !bookingBlockMutationsReady[\s\S]*?\}>\{blockSaving \? "Збереження…" : "Зберегти"\}/);
  assert.match(source,/runBookingBlockMutation\(blockSavingRef, setBlockSaving, async \(\) =>/);
  assert.match(source,/return onSaveBookingBlock\?\.\(presentationDraft\)/);
  assert.match(source,/catch \(error\) \{ setBlockError/);
  assert.doesNotMatch(source,/catch \(error\) \{[^}]*setBlockDraft/);
});

test("booking-block loading fails closed without erasing the last successful list", async () => {
  const app=await (await import("node:fs/promises")).readFile(new URL("../src/App.jsx",import.meta.url),"utf8");
  assert.match(app,/useState\("loading"\)/);
  assert.match(app,/if \(bookingBlocks\?\.ok\) \{[\s\S]*setScheduleBookingBlocks\(bookingBlocks\.data\);[\s\S]*bookingBlocksLoadStatusRef\.current = "ready";[\s\S]*setBookingBlocksLoadStatus\("ready"\);[\s\S]*\} else \{[\s\S]*bookingBlocksLoadStatusRef\.current = "error";[\s\S]*setBookingBlocksLoadStatus\("error"\)/);
  assert.doesNotMatch(app,/setScheduleBookingBlocks\(bookingBlocks \|\| \[\]\)/);
  assert.match(app,/const blocks = await db\.fetchScheduleBookingBlocks\(\);\s*setScheduleBookingBlocks\(blocks\);\s*bookingBlocksLoadStatusRef\.current = "ready";\s*setBookingBlocksLoadStatus\("ready"\)/);
  assert.match(app,/bookingBlocksLoadStatusRef\.current !== "ready"[\s\S]*Зміни бронювань тимчасово вимкнені/);
  assert.match(app,/bookingBlocksLoadStatusRef\.current = "loading";\s*setBookingBlocksLoadStatus\("loading"\)/);
});

test("room rename reconciles immediately and refresh failure remains fail-closed", async () => { const source=await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx",import.meta.url),"utf8"); assert.match(source,/setStudioRooms\(\(previous\) => previous\.map/); assert.match(source,/try \{ await onRetryBookingBlocks\(\); \}\s*catch \(refreshError\)/); assert.match(source,/fetchStudioRooms\(\{ includeInactive: isAdmin, strict: true \}\)/); });

test("schedule UI distinguishes ready empty data from load failure and gates every booking mutation", async () => {
  const source=await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx",import.meta.url),"utf8");
  assert.match(source,/const bookingBlocksReady = bookingBlocksLoadStatus === "ready"/);
  assert.match(source,/const canManageBookings = \(isAdmin \|\| allowBookingMutations\) && bookingBlocksReady/);
  assert.match(source,/const canMutateEvent = \(event\) => bookingBlocksReady && roomBookingsReady && canMutateScheduleEvent/);
  assert.match(source,/role=\{bookingBlocksLoadStatus === "error" \? "alert" : "status"\}/);
  assert.match(source,/onRetryBookingBlocks\(\)\.catch/);
  assert.match(source,/disabled=\{blockSaving \|\| !bookingBlockMutationsReady/);
});

test("room-booking loading fails closed and fresh rows drive block warnings", async () => {
  const fs=await import("node:fs/promises");
  const app=await fs.readFile(new URL("../src/App.jsx",import.meta.url),"utf8");
  const schedule=await fs.readFile(new URL("../src/components/ScheduleTab.jsx",import.meta.url),"utf8");
  assert.match(app,/roomBookingsLoadStatusRef = useRef\("loading"\)/);
  assert.match(app,/if \(rb\?\.ok\)[\s\S]*setRoomBookings\(rb\.data\)[\s\S]*roomBookingsLoadStatusRef\.current = "ready"[\s\S]*else[\s\S]*roomBookingsLoadStatusRef\.current = "error"/);
  assert.doesNotMatch(app,/setRoomBookings\(rb \|\| \[\]\)/);
  assert.match(app,/const bookings = await \(isAdmin \? db\.fetchRoomBookings\(\) : db\.fetchScheduleRoomBookings\(\)\)/);
  assert.match(schedule,/const freshBookings = await onRetryRoomBookings\?\.\(\)/);
  assert.match(schedule,/freshBookings\.some\(\(booking\) => findBookingBlockConflict/);
  assert.match(schedule,/role=\{roomBookingsLoadStatus === "error" \? "alert" : "status"\}/);
  assert.match(schedule,/if \(block\.isActive\) \{ await onToggleBookingBlock\?\.\(block\); return; \}/);
});

test("admin override is explicit and a newly discovered server conflict requires confirmation", async () => {
  const fs=await import("node:fs/promises");
  const app=await fs.readFile(new URL("../src/App.jsx",import.meta.url),"utf8");
  const schedule=await fs.readFile(new URL("../src/components/ScheduleTab.jsx",import.meta.url),"utf8");
  const db=await fs.readFile(new URL("../src/db.js",import.meta.url),"utf8");
  assert.match(app,/options\.overrideBookingBlock[\s\S]*db\.adminOverrideInsertRoomBooking/);
  assert.match(app,/options\.overrideBookingBlock[\s\S]*db\.adminOverrideUpdateRoomBooking/);
  assert.match(schedule,/await onRetryBookingBlocks\?\.\(\);[\s\S]*Явно підтвердити обхід[\s\S]*persistBooking\(true\)/);
  assert.match(db,/crm_admin_override_create_room_booking/);
  assert.match(db,/crm_admin_override_update_room_booking/);
});

test("trainer refreshes stale conflicting blocks before the shared mutation rejects", async () => {
  const source=await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx",import.meta.url),"utf8");
  assert.match(source,/getFreshBookingBlockSaveGuard\([\s\S]*async \(\) => onRetryBookingBlocks\?\.\(\)/);
  assert.match(source,/if \(guard\.conflict && !isAdmin\) throw new Error\(bookingBlockMessage\(guard\.conflict\)\)/);
  assert.match(source,/bookingMutationRef\.current = true[\s\S]*finally \{[\s\S]*bookingMutationRef\.current = false/);
  assert.match(source,/if \(!isAdmin\) throw error;[\s\S]*window\.confirm[\s\S]*persistBooking\(true\)/);
});

test("fresh trainer guard releases deleted blocks, retains active blocks, and fails closed", async () => {
  const booking={date:"2026-10-02",startTime:"10:30",endTime:"10:45",roomId:"one"};
  const released=await getFreshBookingBlockSaveGuard(booking,[base],rooms,false,async()=>[]);
  assert.equal(released.conflict,null);
  const retained=await getFreshBookingBlockSaveGuard(booking,[base],rooms,false,async()=>[base]);
  assert.ok(retained.conflict);
  await assert.rejects(getFreshBookingBlockSaveGuard(booking,[base],rooms,false,async()=>{throw new Error("refresh failed");}),/refresh failed/);
  let refreshed=false;
  const deletedForAdmin=await getFreshBookingBlockSaveGuard(booking,[base],rooms,true,async()=>{refreshed=true; return [];});
  assert.equal(deletedForAdmin.conflict,null);
  assert.equal(refreshed,true);
  const activeForAdmin=await getFreshBookingBlockSaveGuard(booking,[base],rooms,true,async()=>[base]);
  assert.equal(activeForAdmin.requiresConfirmation,true);
  await assert.rejects(getFreshBookingBlockSaveGuard(booking,[base],rooms,true,async()=>{throw new Error("admin refresh failed");}),/admin refresh failed/);
});

test("editor and status actions share explicit override and retain UI on failure or declined confirmation", async () => {
  const source=await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx",import.meta.url),"utf8");
  assert.match(source,/const updateBookingEventWithGuard = async[\s\S]*runBookingMutation\([\s\S]*overrideBookingBlock: override/);
  assert.match(source,/updateBookingEventWithGuard\(event, \{ status: "tentative" \}\)/);
  assert.match(source,/updateBookingEventWithGuard\(event, \{ status: "active" \}\)/);
  assert.match(source,/return updateBookingEventWithGuard\(event, \{ status: "cancelled" \}\)/);
  assert.match(source,/detailsMutationError \? <div role="alert"/);
  assert.match(source,/if \(await updateBookingEventWithGuard[\s\S]*setSelectedEventDetails\(null\)/);
  assert.doesNotMatch(source,/setSelectedEventDetails\(null\); await onUpdateBooking\(event\.parentId \|\| event\.id, \{ status:/);
});

test("single-occurrence removal uses the guarded atomic RPC and keeps details open on failure", async () => {
  const fs=await import("node:fs/promises");
  const source=await fs.readFile(new URL("../src/components/ScheduleTab.jsx",import.meta.url),"utf8");
  const app=await fs.readFile(new URL("../src/App.jsx",import.meta.url),"utf8");
  const db=await fs.readFile(new URL("../src/db.js",import.meta.url),"utf8");
  const removal=source.slice(source.indexOf("const removeSingleRecurringBookingOccurrence"),source.indexOf("const deleteBookingEvent"));
  assert.match(removal,/runBookingMutation\([\s\S]*onRemoveBookingOccurrence\?\.\(parentId, occurrenceDate\)[\s\S]*removesOnlyOccurrences: true/);
  assert.doesNotMatch(removal,/onUpdateBooking|onAddBooking|onDeleteBooking/);
  assert.match(source,/captureGuardedDetailsOperation\(\(\) => deleteBookingEvent\(event, "occurrence"\)\)[\s\S]*setSelectedEventDetails\(null\)/);
  assert.match(source,/captureGuardedDetailsOperation\(\(\) => cancelBookingEvent\(event, "occurrence"\)\)[\s\S]*setSelectedEventDetails\(null\)/);
  assert.match(source,/detailsMutationBusy[\s\S]*detailsMutationError \? <div role="alert"/);
  assert.match(app,/db\.removeRoomBookingOccurrence\(id, occurrenceDate\)[\s\S]*reloadScheduleRoomBookingsAction/);
  assert.match(db,/crm_remove_room_booking_occurrence/);
});

test("committed occurrence removal with refresh failure invalidates stale booking actions", async () => {
  const fs=await import("node:fs/promises");
  const app=await fs.readFile(new URL("../src/App.jsx",import.meta.url),"utf8");
  const schedule=await fs.readFile(new URL("../src/components/ScheduleTab.jsx",import.meta.url),"utf8");
  assert.match(app,/await db\.removeRoomBookingOccurrence\(id, occurrenceDate\)[\s\S]*catch \(error\)[\s\S]*setRoomBookings\(\(previous\) => previous\.filter[\s\S]*refreshRequired: true/);
  assert.match(app,/Повторне видалення заблоковано/);
  assert.match(schedule,/const canManageBookings = \(isAdmin \|\| allowBookingMutations\) && bookingBlocksReady && roomBookingsReady/);
  assert.match(schedule,/const canMutateEvent = \(event\) => bookingBlocksReady && roomBookingsReady/);
  assert.match(schedule,/roomBookingsLoadNotice \|\| "Поточні бронювання не завантажилися/);
});

test("continuous multi-date block validates and expands across both boundary dates", () => {
  const continuous={...base,startsOn:"2026-10-03",endsOn:"2026-10-04",startTime:"16:00",endTime:"12:30",allRooms:true};
  assert.equal(validateBookingBlock(continuous).valid,true);
  assert.equal(validateBookingBlock({...continuous,endsOn:"2026-10-03"}).valid,false);
  const events=expandBookingBlocks([continuous],"2026-10-03","2026-10-04",[rooms[0]]);
  assert.deepEqual(events.map(({date,startTime,endTime})=>({date,startTime,endTime})),[
    {date:"2026-10-03",startTime:"16:00",endTime:"24:00"},
    {date:"2026-10-04",startTime:"00:00",endTime:"12:30"},
  ]);
});

test("continuous multi-date block conflicts on both ends but permits adjacent bookings", () => {
  const block={...base,startsOn:"2026-10-03",endsOn:"2026-10-04",startTime:"16:00",endTime:"12:30",allRooms:true};
  assert.ok(findBookingBlockConflict({date:"2026-10-03",startTime:"16:30",endTime:"17:00",roomName:"Перша"},[block],rooms));
  assert.ok(findBookingBlockConflict({date:"2026-10-04",startTime:"11:30",endTime:"12:00",roomName:"Перша"},[block],rooms));
  assert.equal(findBookingBlockConflict({date:"2026-10-03",startTime:"15:00",endTime:"16:00",roomName:"Перша"},[block],rooms),null);
  assert.equal(findBookingBlockConflict({date:"2026-10-04",startTime:"12:30",endTime:"13:00",roomName:"Перша"},[block],rooms),null);
});

test("continuous block finds a later weekly occurrence on a fully blocked interior date", () => {
  const block={...base,startsOn:"2026-10-01",endsOn:"2026-10-20",startTime:"16:00",endTime:"09:00",allRooms:true};
  const booking={date:"2026-10-01",recurrence:"weekly",recurrenceUntil:"2026-10-31",startTime:"10:00",endTime:"11:00",roomName:"Перша"};
  const conflict=findBookingBlockConflict(booking,[block],rooms);
  assert.equal(conflict?.date,"2026-10-08");
});

test("selected-room UI exposes controlled scope, loading/error states and multi-select", async () => {
  const source=await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx",import.meta.url),"utf8");
  assert.match(source,/name="booking-block-room-scope"/);
  assert.match(source,/studioRoomsLoadStatus === "loading"/);
  assert.match(source,/studioRoomsLoadStatus === "error"/);
  assert.match(source,/onClick=\{loadStudioRooms\}>Повторити<\/button>/);
  assert.match(source,/selectableBlockRooms\.map/);
  assert.match(source,/!blockDraft\.allRooms && \(!\(blockDraft\.roomIds \|\| \[\]\)\.length/);
});
