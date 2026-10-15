import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalStudioRoomName,
  isStudioRoomBookingOpen,
  loadStudioRoomsState,
  ROOM_BOOKING_CLOSED_MESSAGE,
  resolveStudioRoomsResponse,
  shouldBlockStudioRoomBookingMutation,
} from "../src/studioRooms.js";

test("studio-room response preserves successful rows and a successful empty result", () => {
  const rooms = [{ id: "one", name: "Перша" }];
  assert.equal(resolveStudioRoomsResponse(rooms, null), rooms);
  assert.deepEqual(resolveStudioRoomsResponse([], null), []);
  assert.deepEqual(resolveStudioRoomsResponse(null, null), []);
});

test("strict studio-room response propagates Supabase errors while legacy mode keeps its fallback", () => {
  const error = new Error("rooms unavailable");
  assert.throws(() => resolveStudioRoomsResponse(null, error, { strict: true }), error);
  const warnings = [];
  assert.deepEqual(resolveStudioRoomsResponse(null, error, { warn: (...args) => warnings.push(args) }), []);
  assert.equal(warnings.length, 1);
});

test("studio-room loading transitions from loading to error", async () => {
  const statuses = [];
  const error = new Error("network failure");
  const result = await loadStudioRoomsState(async () => { throw error; }, {
    setStatus: (status) => statuses.push(status),
  });
  assert.deepEqual(statuses, ["loading", "error"]);
  assert.deepEqual(result, { ok: false, error });
});

test("successful retry transitions error to loading to ready and replaces rooms", async () => {
  const statuses = ["error"];
  const stored = [];
  const rooms = [{ id: "one", name: "Перша" }];
  const result = await loadStudioRoomsState(async () => rooms, {
    setStatus: (status) => statuses.push(status),
    setRooms: (value) => stored.push(value),
  });
  assert.deepEqual(statuses, ["error", "loading", "ready"]);
  assert.deepEqual(stored, [rooms]);
  assert.deepEqual(result, { ok: true, rooms });
});

test("booking availability matches room names canonically and keeps legacy rooms usable", () => {
  const rooms = [
    { id: "open", name: " Зала   1 ", bookingOpen: true },
    { id: "closed", name: "Зала 2", bookingOpen: false },
  ];
  assert.equal(canonicalStudioRoomName("  ЗАЛА   2 "), canonicalStudioRoomName("зала 2"));
  assert.equal(isStudioRoomBookingOpen(rooms, "зала 1"), true);
  assert.equal(isStudioRoomBookingOpen(rooms, "  ЗАЛА  2 "), false);
  assert.equal(isStudioRoomBookingOpen(rooms, "Стара назва"), true);
  assert.equal(ROOM_BOOKING_CLOSED_MESSAGE, "Цей зал тимчасово недоступний для бронювання. Оберіть інший зал.");
});

test("closed room allows cancelling a single booking while blocking regular edits", () => {
  const rooms = [{ id: "closed", name: "Зала 2", bookingOpen: false }];
  assert.equal(shouldBlockStudioRoomBookingMutation(rooms, { roomName: "Зала 2", status: "active" }), true);
  assert.equal(shouldBlockStudioRoomBookingMutation(rooms, { roomName: "Зала 2", status: "cancelled", recurrence: "none" }), false);
});

test("closed room allows cancelling an entire recurring series", () => {
  const rooms = [{ id: "closed", name: "Зала 2", bookingOpen: false }];
  assert.equal(shouldBlockStudioRoomBookingMutation(rooms, {
    roomName: "Зала 2",
    status: "cancelled",
    recurrence: "weekly",
    recurrenceUntil: "2026-12-31",
  }), false);
});
