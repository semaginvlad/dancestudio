import test from "node:test";
import assert from "node:assert/strict";
import { blockMatchesRoom, expandBookingBlocks, findBookingBlockConflict, intervalsOverlap, isoWeekday, parseDateOnly, validateBookingBlock } from "../src/scheduleBookingBlocks.js";

const rooms = [{ id: "one", name: "Перша", isActive: true }, { id: "two", name: "Друга", isActive: true }];
const base = { id: "b", title: "Закрито", startsOn: "2026-10-01", endsOn: "2026-10-07", startTime: "10:00", endTime: "11:00", weekdays: [1,2,3,4,5,6,7], allRooms: false, roomIds: ["one"], roomNames: ["Стара назва"], isActive: true };

test("date-only parsing and ISO weekdays avoid UTC shifts", () => { assert.equal(parseDateOnly("2026-10-02").getDate(), 2); assert.equal(isoWeekday("2026-10-04"), 7); });
test("adjacent intervals are allowed; partial and full overlap conflict", () => { assert.equal(intervalsOverlap("10:00","11:00","11:00","12:00"), false); assert.equal(intervalsOverlap("10:00","11:00","10:30","12:00"), true); assert.equal(intervalsOverlap("10:00","13:00","11:00","12:00"), true); });
test("single date, weekday range and selected/all room expansion", () => { assert.equal(expandBookingBlocks([{...base, startsOn:"2026-10-02", endsOn:"2026-10-02", weekdays:[5]}], "2026-10-02", "2026-10-02", rooms).length, 1); assert.equal(expandBookingBlocks([{...base, allRooms:true}], "2026-10-01", "2026-10-07", rooms).length, 14); assert.equal(expandBookingBlocks([{...base, weekdays:[1,3]}], "2026-10-01", "2026-10-07", rooms).length, 2); });
test("room ID survives rename and canonical name is fallback", () => { assert.equal(blockMatchesRoom(base, {id:"one", name:"Нова"}), true); assert.equal(blockMatchesRoom(base, {name:" стара  НАЗВА "}), true); });
test("inactive and cancelled do not conflict", () => { assert.equal(findBookingBlockConflict({date:"2026-10-02",startTime:"10:30",endTime:"11:30",roomId:"one",status:"cancelled"}, [base], rooms), null); assert.equal(findBookingBlockConflict({date:"2026-10-02",startTime:"10:30",endTime:"11:30",roomId:"one"}, [{...base,isActive:false}], rooms), null); });
for (const recurrence of ["daily","weekly","monthly"]) test(`recurring ${recurrence} conflict`, () => { const block = {...base, startsOn:"2026-10-01",endsOn:"2027-02-01",weekdays:[1,2,3,4,5,6,7]}; assert.ok(findBookingBlockConflict({date:"2026-09-02", recurrence, recurrenceUntil:"2027-02-02", startTime:"10:30",endTime:"11:30",roomId:"one"}, [block], rooms)); });
test("client validation covers required fields and selected rooms", () => { assert.equal(validateBookingBlock({...base}).valid, true); assert.equal(validateBookingBlock({...base,title:"",roomIds:[]}).valid, false); });
