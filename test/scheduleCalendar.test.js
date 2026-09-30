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

test("switching modes can canonicalize any selected date", () => {
  const state = calendarStateForDate("2026-10-04");
  assert.equal(state.selectedDate, "2026-10-04");
  assert.equal(key(state.weekStart), "2026-09-28");
  assert.deepEqual(navigationLabels("month"), { previous: "Попередній місяць", next: "Наступний місяць" });
});

test("event detail presentation is type-specific and omits irrelevant empty rows", () => {
  const base = { date: "2026-09-30", startTime: "10:00", endTime: "11:00", roomName: "Зала 2", trainer: "Олена", title: "Прибирання" };
  const cleaning = buildEventDetails({ ...base, eventType: "cleaning", note: "Після ремонту" });
  assert.deepEqual(cleaning.map(x => x.label), ["Примітка", "Зала", "Дата", "Час"]);
  assert.ok(!cleaning.some(x => /Група|Тренер|Напрям/.test(x.label)));
  for (const type of ["group_lesson", "individual_training", "room_booking", "custom_admin_event"]) assert.ok(buildEventDetails({ ...base, eventType: type }).length >= 4);
  assert.ok(!buildEventDetails({ eventType: "custom_admin_event" }).some(x => x.value === "—"));
});

test("month previews expose three events and a deterministic remainder", () => {
  const result = monthPreview([1,2,3,4,5]);
  assert.deepEqual(result.visible, [1,2,3]);
  assert.equal(result.remaining, 2);
});

test("busy week layout caps visual columns without losing events", () => {
  const events = Array.from({length: 6}, (_, i) => ({ id: i, colIndex: i }));
  const layout = weekEventLayout(events);
  assert.equal(layout.length, 6);
  assert.equal(layout[5].displayColumn, 2);
  assert.equal(layout.filter(x => x.isOverflow).length, 3);
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
});

test("lesson plan details expose only one add-plan action", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
  const details = source.slice(source.indexOf("{selectedEventDetails &&"), source.indexOf("{bulkPlanSetup &&"));
  assert.equal((details.match(/Додати план/g) || []).length, 1);
});
