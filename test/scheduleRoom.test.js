import test from "node:test";
import assert from "node:assert/strict";
import {
  UNKNOWN_ROOM_NAME,
  resolveOverrideRoomName,
  resolveScheduleRoomName,
} from "../src/scheduleRoom.js";

const rooms = new Map([["room-2", "Перейменована зала"]]);

test("roomId resolves the current room name before stored and legacy names", () => {
  assert.equal(resolveScheduleRoomName({ roomId: "room-2", roomName: "Стара", room: "Legacy" }, rooms), "Перейменована зала");
});

test("stored and legacy names are used in order, without inventing the primary room", () => {
  assert.equal(resolveScheduleRoomName({ room_name: "Збережена", room: "Legacy" }, rooms), "Збережена");
  assert.equal(resolveScheduleRoomName({ hall: "Стара зала" }, rooms), "Стара зала");
  assert.equal(resolveScheduleRoomName({}, rooms), UNKNOWN_ROOM_NAME);
  assert.notEqual(resolveScheduleRoomName({}, rooms), "Основна зала");
});

test("an active one-off override room wins over the base group slot", () => {
  assert.equal(
    resolveOverrideRoomName({ status: "active", roomName: "Разова зала" }, { roomId: "room-2" }, rooms),
    "Разова зала",
  );
  assert.equal(
    resolveOverrideRoomName({ status: "active", roomId: "room-2", roomName: "Стара" }, { roomName: "Базова" }, rooms),
    "Перейменована зала",
  );
});
