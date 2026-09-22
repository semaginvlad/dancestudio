import test from "node:test";
import assert from "node:assert/strict";
import { buildGroupSelectSections } from "../src/shared/groupSelect.js";
import {
  applyTrialConversion,
  canConvertTrialBooking,
  getTrialCategory,
  groupAndSortTrialBookings,
  localDateKey,
} from "../src/shared/trialBookings.js";

test("group select includes dynamic directions and directionless groups exactly once", () => {
  const groups = [
    { id: "dynamic", directionId: "heels_pro", name: "Heels Pro" },
    { id: "none", name: "Open class" },
    { id: "dynamic", directionId: "heels_pro", name: "duplicate" },
  ];
  const sections = buildGroupSelectSections(groups, [{ id: "bachata", name: "Bachata" }]);
  assert.equal(sections.flatMap((section) => section.groups).length, 2);
  assert.equal(sections.find((section) => section.id === "heels_pro").name, "heels pro");
  assert.equal(sections.find((section) => section.id === "__none__").name, "Без напрямку");
});

test("new booking input hides archived groups while edit input preserves its current archived group", () => {
  const groups = [{ id: "active", name: "Active" }, { id: "old", name: "Old", archived_at: "2025-01-01" }];
  const isArchived = (group) => Boolean(group.archived_at);
  const createGroups = groups.filter((group) => !isArchived(group));
  const editGroups = groups.filter((group) => !isArchived(group) || group.id === "old");
  assert.deepEqual(createGroups.map((group) => group.id), ["active"]);
  assert.deepEqual(editGroups.map((group) => group.id), ["active", "old"]);
});

test("trial categories preserve statuses and use local date keys without UTC shifts", () => {
  const today = "2026-09-22";
  assert.equal(localDateKey(new Date(2026, 8, 22, 0, 15)), today);
  assert.equal(localDateKey("2026-09-22T23:30:00-07:00"), today);
  assert.equal(getTrialCategory({ trialDate: "2026-09-21", status: "confirmed" }, today), "overdue");
  assert.equal(getTrialCategory({ trialDate: today, status: "new" }, today), "today");
  assert.equal(getTrialCategory({ trialDate: "2026-09-23", status: "contacted" }, today), "upcoming");
  assert.equal(getTrialCategory({ trialDate: today, status: "came" }, today), "history");
});

test("every trial category has stable required sorting", () => {
  const rows = [
    { id: "o1", trialDate: "2026-09-20", status: "new" },
    { id: "o2", trialDate: "2026-09-21", status: "contacted" },
    { id: "t-new", trialDate: "2026-09-22", status: "new" },
    { id: "t-confirmed-a", trialDate: "2026-09-22", status: "confirmed" },
    { id: "t-confirmed-b", trialDate: "2026-09-22", status: "confirmed" },
    { id: "u2", trialDate: "2026-09-24", status: "new" },
    { id: "u1", trialDate: "2026-09-23", status: "new" },
    { id: "h1", trialDate: "2026-09-18", status: "came" },
    { id: "h2", trialDate: "2026-09-21", status: "cancelled" },
  ];
  const grouped = groupAndSortTrialBookings(rows, "2026-09-22");
  assert.deepEqual(grouped.overdue.map((row) => row.id), ["o2", "o1"]);
  assert.deepEqual(grouped.today.map((row) => row.id), ["t-confirmed-a", "t-confirmed-b", "t-new"]);
  assert.deepEqual(grouped.upcoming.map((row) => row.id), ["u1", "u2"]);
  assert.deepEqual(grouped.history.map((row) => row.id), ["h2", "h1"]);
});

test("conversion is enabled only for confirmed and busy id blocks a double click", () => {
  const booking = { id: "trial-1", status: "confirmed" };
  assert.equal(canConvertTrialBooking(booking), true);
  assert.equal(canConvertTrialBooking({ ...booking, status: "contacted" }), false);
  assert.equal(canConvertTrialBooking(booking, "trial-1"), false);
});

test("conversion updates local collections without duplicate student or group link", () => {
  const result = {
    student: { id: "student-1", name: "Updated" },
    studentGroup: { studentId: "student-1", groupId: "group-1" },
    trialBooking: { id: "trial-1", status: "became_student" },
  };
  const next = applyTrialConversion({
    students: [{ id: "student-1", name: "Old" }],
    studentGrps: [{ studentId: "student-1", groupId: "group-1" }],
    trialBookings: [{ id: "trial-1", status: "confirmed" }],
  }, "trial-1", result);
  assert.equal(next.students.length, 1);
  assert.equal(next.students[0].name, "Updated");
  assert.equal(next.studentGrps.length, 1);
  assert.equal(next.trialBookings[0].status, "became_student");
});
