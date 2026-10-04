import test from "node:test";
import assert from "node:assert/strict";
import { loadStudioRoomsState, resolveStudioRoomsResponse } from "../src/studioRooms.js";

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
