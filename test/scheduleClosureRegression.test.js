import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { confirmBookingBlockOverlaps, expandBookingBlocks, findBookingBlockConflict, hasFutureBookingBlockOccurrence, validateBookingBlock } from "../src/scheduleBookingBlocks.js";

const room = { id: "r", name: "Зал", isActive: true };
const block = { id: "b", title: "", startsOn: "2026-12-01", endsOn: "2026-12-01", startTime: "10:00", endTime: "11:00", roomIds: ["r"], roomNames: ["Зал"], allRooms: false, weekdays: [1,2,3,4,5,6,7], isActive: true };

test("single and weekly closures reuse the same model and selected room", () => {
  assert.equal(validateBookingBlock(block).valid, true);
  assert.equal(expandBookingBlocks([block], "2026-12-01", "2026-12-01", [room]).length, 1);
  const weekly = { ...block, endsOn: "2026-12-15", weekdays: [2,4], repeats: true };
  assert.deepEqual(expandBookingBlocks([weekly], "2026-12-01", "2026-12-15", [room]).map(x => x.date), ["2026-12-01","2026-12-03","2026-12-08","2026-12-10","2026-12-15"]);
  assert.ok(findBookingBlockConflict({ date:"2026-12-03",startTime:"10:30",endTime:"10:45",roomName:"Зал" }, [weekly], [room]));
});
test("only active rules with an actual future occurrence are listed", () => {
  const now = new Date(2026,11,1,11,0);
  assert.equal(hasFutureBookingBlockOccurrence(block, now), false);
  assert.equal(hasFutureBookingBlockOccurrence({...block,endsOn:"2026-12-03",weekdays:[2]}, now), false);
  assert.equal(hasFutureBookingBlockOccurrence({...block,endsOn:"2026-12-03",weekdays:[4]}, now), true);
  assert.equal(hasFutureBookingBlockOccurrence({...block,isActive:false,endsOn:"2026-12-03"}, now), false);
});
test("calendar creation and explicit existing-booking confirmation are wired", async () => {
  const source = await readFile(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
  assert.match(source, /openNewBlock\(\{ date: draft.date, startTime: draft.startTime, endTime: draft.endTime, roomName: draft.roomName \}\)/);
  assert.match(source, /if \(!confirmBookingBlockOverlaps\(freshBookings, conflictDraft/);
  assert.match(source, /if \(guard.conflict\) throw new Error/);
});

test("overlapping existing bookings require explicit confirmation and remain intact", () => {
  const bookings = [{ id: "existing", date: "2026-12-01", startTime: "10:15", endTime: "10:45", roomName: "Зал", status: "active" }];
  let message = "";
  assert.equal(confirmBookingBlockOverlaps(bookings, block, [room], text => { message = text; return false; }), false);
  assert.match(message, /уже є 1 бронювань/);
  assert.equal(bookings[0].status, "active");
  assert.equal(confirmBookingBlockOverlaps(bookings, block, [room], () => true), true);
  assert.equal(bookings[0].status, "active");
  assert.equal(confirmBookingBlockOverlaps([{...bookings[0], status:"cancelled"}], block, [room], () => { throw new Error("unexpected confirmation"); }), true);
});
