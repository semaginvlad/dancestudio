import test from "node:test";
import assert from "node:assert/strict";
import { buildGroupSelectSections } from "../src/shared/groupSelect.js";
import {
  applyTrialConversion,
  canConvertTrialBooking,
  buildMonthRange,
  buildWeekRange,
  filterTrialBookings,
  getTrialCategory,
  getTrialDisplayName,
  groupTrialBookingsByDate,
  groupAndSortTrialBookings,
  getTrialDayMarker,
  localDateKey,
  safeTrialViewMode,
  shiftCalendarMonth,
  sortTrialBookings,
  startOfMondayWeek,
  shouldExpandTrialHistory,
  trialDayOverflow,
} from "../src/shared/trialBookings.js";

const sortRows = [
  { id: "3", name: "Яна", trialDate: "2026-09-25", status: "new", groupId: "b" },
  { id: "2", name: "Анна", trialDate: "2026-09-24", status: "contacted", groupId: "a" },
  { id: "1", name: "Анна", trialDate: "2026-09-24", status: "confirmed", groupId: "a" },
];

test("trial sorting supports every explicit mode", () => {
  const groups = { a: { name: "Bachata" }, b: { name: "Zumba" } };
  assert.deepEqual(sortTrialBookings(sortRows, "date_asc", "upcoming", groups).map(({ id }) => id), ["1", "2", "3"]);
  assert.deepEqual(sortTrialBookings(sortRows, "date_desc", "upcoming", groups).map(({ id }) => id), ["3", "1", "2"]);
  assert.deepEqual(sortTrialBookings(sortRows, "name", "upcoming", groups).map(({ id }) => id), ["1", "2", "3"]);
  assert.deepEqual(sortTrialBookings(sortRows, "status", "upcoming", groups).map(({ id }) => id), ["1", "2", "3"]);
  assert.deepEqual(sortTrialBookings(sortRows, "group", "upcoming", groups).map(({ id }) => id), ["1", "2", "3"]);
  assert.deepEqual(sortTrialBookings(sortRows, "priority", "upcoming", groups).map(({ id }) => id), ["1", "2", "3"]);
});

test("name sorting uses the same current profile display name as the row", () => {
  const rows = [
    { id: "1", studentId: "student-1", name: "Аліна стара", trialDate: "2026-09-24" },
    { id: "2", studentId: "student-2", name: "Яна стара", trialDate: "2026-09-24" },
    { id: "3", name: "Віра без профілю", trialDate: "2026-09-24" },
  ];
  const students = {
    "student-1": { firstName: "Яна актуальна" },
    "student-2": { firstName: "Анна актуальна" },
  };
  const displayName = (student) => student.firstName;
  assert.equal(getTrialDisplayName(rows[0], students, displayName), "Яна актуальна");
  assert.equal(getTrialDisplayName(rows[2], students, displayName), "Віра без профілю");
  assert.deepEqual(sortTrialBookings(rows, "name", "upcoming", {}, students, displayName).map(({ id }) => id), ["2", "3", "1"]);
});

test("group sorting uses full internal labels and group id before date for identical labels", () => {
  const groups = {
    advanced: { id: "advanced", name: "Heels", publicLevel: "mix", ageCategory: "teens_under_16", schedule: [{ day: 2, time: "19:00" }] },
    base: { id: "base", name: "Heels", publicLevel: "base", ageCategory: "adults_16_plus", schedule: [{ day: 1, time: "18:00" }] },
    same_b: { id: "same_b", name: "Jazz", publicLevel: "base", ageCategory: "adults_16_plus", schedule: [{ day: 3, time: "20:00" }] },
    same_a: { id: "same_a", name: "Jazz", publicLevel: "base", ageCategory: "adults_16_plus", schedule: [{ day: 3, time: "20:00" }] },
  };
  const rows = [
    { id: "advanced-row", groupId: "advanced", name: "A", trialDate: "2026-09-24" },
    { id: "base-row", groupId: "base", name: "B", trialDate: "2026-09-24" },
    { id: "same-b-row", groupId: "same_b", name: "C", trialDate: "2026-09-20" },
    { id: "same-a-row", groupId: "same_a", name: "D", trialDate: "2026-09-25" },
  ];
  assert.deepEqual(sortTrialBookings(rows, "group", "upcoming", groups).map(({ id }) => id), ["base-row", "advanced-row", "same-a-row", "same-b-row"]);
});

test("trial sorting uses date, name and id as deterministic tie breakers", () => {
  const rows = [
    { id: "b", name: "Оля", trialDate: "2026-10-02", status: "new" },
    { id: "a", name: "Оля", trialDate: "2026-10-02", status: "new" },
    { id: "c", name: "Аня", trialDate: "2026-10-01", status: "new" },
  ];
  assert.deepEqual(sortTrialBookings(rows, "status", "upcoming").map(({ id }) => id), ["c", "a", "b"]);
});

test("sorting remains scoped to category and completed statuses remain history", () => {
  const grouped = groupAndSortTrialBookings([
    { id: "future-z", name: "Яна", trialDate: "2026-10-02", status: "new" },
    { id: "past", name: "Бета", trialDate: "2026-09-20", status: "confirmed" },
    { id: "future-a", name: "Аня", trialDate: "2026-10-01", status: "contacted" },
    { id: "done", name: "Віра", trialDate: "2026-10-03", status: "came" },
  ], "2026-09-22", "name");
  assert.deepEqual(grouped.upcoming.map(({ id }) => id), ["future-a", "future-z"]);
  assert.deepEqual(grouped.overdue.map(({ id }) => id), ["past"]);
  assert.deepEqual(grouped.history.map(({ id }) => id), ["done"]);
});

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

test("category switching preserves history expansion across desktop and mobile layouts", () => {
  assert.equal(shouldExpandTrialHistory("all"), false);
  assert.equal(shouldExpandTrialHistory("history"), true);
  assert.equal(shouldExpandTrialHistory("upcoming"), false);
  assert.equal(shouldExpandTrialHistory("all"), false);
});

test("relative day markers are shown only for active trial statuses", () => {
  const today = "2026-09-23";
  assert.equal(getTrialDayMarker("2026-09-20", today, "confirmed"), "прострочено на 3 днів");
  for (const status of ["came", "no_show", "became_student", "declined", "cancelled"]) {
    assert.equal(getTrialDayMarker("2026-09-20", today, status), "", status);
  }
});

test("calendar weeks start on Monday and contain seven local dates", () => {
  assert.equal(localDateKey(startOfMondayWeek("2026-10-04")), "2026-09-28");
  assert.deepEqual(buildWeekRange("2026-10-04").map(localDateKey), ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
});

test("month navigation crosses year boundaries", () => {
  assert.equal(localDateKey(shiftCalendarMonth("2026-12-15", 1)), "2027-01-01");
  assert.equal(localDateKey(shiftCalendarMonth("2026-01-15", -1)), "2025-12-01");
});

test("month range includes complete adjacent-month weeks", () => {
  const days = buildMonthRange("2026-10-12").map(localDateKey);
  assert.equal(days[0], "2026-09-28");
  assert.equal(days.at(-1), "2026-11-01");
  assert.equal(days.length % 7, 0);
});

test("calendar grouping sorts by time, group and current display name", () => {
  const groups = { a: { name: "Alpha", schedule: [{ day: 4, time: "19:00" }] }, b: { name: "Beta", schedule: [{ day: 4, time: "18:00" }] } };
  const rows = [
    { id: "3", groupId: "a", name: "Аня", trialDate: "2026-10-01" },
    { id: "2", groupId: "b", name: "Яна", trialDate: "2026-10-01" },
    { id: "1", groupId: "b", name: "Віра", trialDate: "2026-10-01" },
  ];
  assert.deepEqual(groupTrialBookingsByDate(rows, groups)["2026-10-01"].map(({ id }) => id), ["1", "2", "3"]);
});

test("calendar source applies search, filters and category before date range", () => {
  const rows = [
    { id: "1", name: "Марія", status: "confirmed", groupId: "g", trialDate: "2026-10-02" },
    { id: "2", name: "Оля", status: "new", groupId: "g", trialDate: "2026-10-03" },
  ];
  const filtered = filterTrialBookings(rows, { search: "мар", status: "confirmed", groupId: "g" }, { g: { directionId: "d" } });
  const categorized = groupAndSortTrialBookings(filtered, "2026-10-01");
  assert.deepEqual(categorized.upcoming.map(({ id }) => id), ["1"]);
});

test("date-only calendar values never shift through UTC parsing", () => {
  assert.equal(localDateKey(buildWeekRange("2026-01-01")[3]), "2026-01-01");
  assert.equal(localDateKey("2026-01-01T23:59:59-11:00"), "2026-01-01");
});

test("month cells expose three events and an overflow count", () => {
  const result = trialDayOverflow([1, 2, 3, 4, 5]);
  assert.deepEqual(result.visible, [1, 2, 3]);
  assert.equal(result.hiddenCount, 2);
});

test("unknown persisted calendar view safely falls back to list", () => {
  assert.equal(safeTrialViewMode("month"), "month");
  assert.equal(safeTrialViewMode("timeline"), "list");
  assert.equal(safeTrialViewMode(null), "list");
});
