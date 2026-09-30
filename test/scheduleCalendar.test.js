import test from "node:test";
import assert from "node:assert/strict";
import { buildEventDetails, calendarStateForDate, monthPreview, navigateCalendar, navigationLabels, recurringActionLabels, weekEventLayout } from "../src/scheduleCalendar.js";

const key = (date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;

test("day, week and month navigation keep selected date and week anchor synchronized", () => {
  assert.equal(navigateCalendar("day", "2026-09-30", 1).selectedDate, "2026-10-01");
  assert.equal(navigateCalendar("week", "2026-09-30", 1).selectedDate, "2026-10-07");
  assert.equal(navigateCalendar("month", "2026-09-30", 1).selectedDate, "2026-10-30");
  for (const mode of ["day", "week", "month"]) assert.equal(key(navigateCalendar(mode, "2020-01-01", 0, new Date("2026-09-30T12:00:00")).weekStart), "2026-09-28");
});

test("month navigation clamps end-of-month dates without overflow", () => {
  assert.equal(navigateCalendar("month", "2025-01-31", 1).selectedDate, "2025-02-28");
  assert.equal(navigateCalendar("month", "2024-01-31", 1).selectedDate, "2024-02-29");
  assert.equal(navigateCalendar("month", "2025-03-31", -1).selectedDate, "2025-02-28");
  assert.equal(navigateCalendar("month", "2025-12-31", 1).selectedDate, "2026-01-31");
  assert.equal(navigateCalendar("month", "2026-01-31", -1).selectedDate, "2025-12-31");
  assert.equal(navigateCalendar("month", "2025-01-28", 1).selectedDate, "2025-02-28");
  assert.equal(navigateCalendar("month", "2025-03-30", 1).selectedDate, "2025-04-30");
  assert.equal(navigateCalendar("month", "2025-04-29", 1).selectedDate, "2025-05-29");
});

test("switching modes can canonicalize any selected date", () => {
  const state = calendarStateForDate("2026-10-04");
  assert.equal(state.selectedDate, "2026-10-04");
  assert.equal(key(state.weekStart), "2026-09-28");
  assert.deepEqual(navigationLabels("month"), { previous: "Попередній місяць", next: "Наступний місяць" });
});

test("event detail presentation is type-specific and omits irrelevant empty rows", () => {
  const base = { date: "2026-09-30", startTime: "10:00", endTime: "11:00", roomName: "Зала 2", trainer: "Олена", title: "Прибирання" };
  const cleaning = buildEventDetails({ ...base, eventType: "cleaning", note: "Після ремонту" });
  assert.deepEqual(cleaning.map(x => x.label), ["Примітка"]);
  assert.ok(!cleaning.some(x => /Група|Тренер|Напрям/.test(x.label)));
  assert.deepEqual(buildEventDetails({ ...base, eventType: "group_lesson" }).map(x => x.label), ["Група", "Тренер"]);
  assert.deepEqual(buildEventDetails({ ...base, eventType: "individual_training" }).map(x => x.label), ["Клієнт / назва", "Тренер"]);
  assert.ok(buildEventDetails({ ...base, eventType: "room_booking" }).some(x => x.label === "Назва / клієнт"));
  assert.deepEqual(buildEventDetails({ ...base, eventType: "custom_admin_event" }).map(x => x.label), ["Назва", "Тренер"]);
  assert.ok(!buildEventDetails({ eventType: "custom_admin_event" }).some(x => x.value === "—"));
});

test("month previews expose three events and a deterministic remainder", () => {
  const result = monthPreview([1,2,3,4,5]);
  assert.deepEqual(result.visible, [1,2,3]);
  assert.equal(result.remaining, 2);
});

test("simultaneous week events keep one real-time coordinate and remain accessible", () => {
  for (const count of [2, 3, 6, 9]) {
    const events = Array.from({length: count}, (_, id) => ({ id, startMin: 600, colIndex: id }));
    const layout = weekEventLayout(events);
    assert.equal(layout.length, count);
    assert.deepEqual(new Set(layout.map(x => x.timeCoordinate)), new Set([600]));
    assert.equal(layout.filter(x => x.isRepresentative).length, 1);
    assert.equal(layout[0].overflowCount, count - 1);
    assert.equal(layout[0].simultaneous.length, count);
  }
});

test("recurring destructive actions always carry their context", () => {
  assert.deepEqual(recurringActionLabels(true), ["Видалити лише цю подію", "Видалити всю серію", "Скасувати лише цю подію", "Скасувати всю серію"]);
});

test("critical calendar controls retain keyboard and ARIA affordances", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
  assert.match(source, /aria-label=\{periodNavigationLabels\.previous\}/);
  assert.match(source, /aria-label="Фільтр за залою"/);
  assert.match(source, /aria-label=\{`Дії: \$\{e\.title\}, \$\{e\.date\}, \$\{e\.startTime\}`\}/);
  assert.match(source, /role="button"[\s\S]{0,100}tabIndex=\{0\}/);
  assert.match(source, /role="dialog" aria-modal="true" aria-labelledby="schedule-event-details-title"/);
  assert.doesNotMatch(source, /<button key=\{key\}[\s\S]{0,3000}role="button"/);
});

test("lesson plan details expose only one add-plan action", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
  const details = source.slice(source.indexOf("{selectedEventDetails &&"), source.indexOf("{bulkPlanSetup &&"));
  assert.equal((details.match(/Додати план/g) || []).length, 1);
});
