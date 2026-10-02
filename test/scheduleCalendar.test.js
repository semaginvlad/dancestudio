import test from "node:test";
import assert from "node:assert/strict";
import { buildEventDetails, calendarStateForDate, canMutateScheduleEvent, compactDayPreview, getTrainerInitials, monthPreview, navigateCalendar, navigationLabels, overlapEventLayout, recurringActionLabels, resolveWeekRoomNames, roomLaneLayout, sortCalendarEvents, weekEventGeometry, weekLaneSelection, weekEventLayout } from "../src/scheduleCalendar.js";

const key = (date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;

test("day, week and month navigation keep selected date and week anchor synchronized", () => {
  assert.equal(navigateCalendar("day", "2026-09-30", 1).selectedDate, "2026-10-01");
  assert.equal(navigateCalendar("week", "2026-09-30", 1).selectedDate, "2026-10-07");
  assert.equal(navigateCalendar("month", "2026-09-30", 1).selectedDate, "2026-10-30");
  for (const mode of ["day", "week", "month"]) assert.equal(key(navigateCalendar(mode, "2020-01-01", 0, new Date("2026-09-30T12:00:00")).weekStart), "2026-09-28");
});

test("booking-block identity is read-only even for administrators", () => {
  assert.equal(canMutateScheduleEvent({ readOnly: true, kind: "booking" }, { isAdmin: true }), false);
  assert.equal(canMutateScheduleEvent({ kind: "booking_block" }, { isAdmin: true }), false);
  assert.equal(canMutateScheduleEvent({ eventType: "booking_block" }, { isAdmin: true }), false);
});

test("ordinary admin and owned trainer bookings remain mutable", () => {
  const booking = { kind: "booking", eventType: "room_booking" };
  assert.equal(canMutateScheduleEvent(booking, { isAdmin: true }), true);
  assert.equal(canMutateScheduleEvent(booking, { isAssignedToTrainer: true }), true);
  assert.equal(canMutateScheduleEvent(booking, { isAssignedToTrainer: false }), false);
});

test("booking-block activation opens details for click and keyboard without booking actions", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
  assert.match(source, /isReadOnlyScheduleEvent\(event\)[\s\S]*setSelectedEventDetails\(event\)/);
  assert.match(source, /activateScheduleEvent\(e, \{ editMutable: true \}\)/);
  assert.match(source, /ev\.key === "Enter" \|\| ev\.key === " "/);
  assert.match(source, /selectedEventDetails\.kind === "booking" && canMutateEvent\(selectedEventDetails\)/);
  assert.match(source, /if \(!canMutateEvent\(e\)\) \{ setSelectedEventDetails\(e\); return; \}/);
  assert.match(source, /if \(!canMutateEvent\(event\)\) \{ setSelectedEventDetails\(event\); return; \}/);
});

test("booking-block details include reason and note only", () => {
  assert.deepEqual(buildEventDetails({ kind: "booking_block", eventType: "booking_block", title: "Ремонт", note: "Фарбування" }), [
    { label: "Причина", value: "Ремонт" },
    { label: "Примітка", value: "Фарбування" },
  ]);
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

test("week collision clusters use real interval overlap and preserve every event", () => {
  const cluster = (events) => weekEventLayout(events).find((event) => event.isRepresentative);

  const sameStart = cluster([{ id: "a", startMin: 600, endMin: 630 }, { id: "b", startMin: 600, endMin: 660 }]);
  assert.deepEqual(sameStart.simultaneous.map((event) => event.id), ["a", "b"]);
  assert.equal(sameStart.clusterStartMin, 600);
  assert.equal(sameStart.clusterEndMin, 660);

  const staggered = cluster([{ id: "early", startMin: 590, endMin: 650 }, { id: "later", startMin: 600, endMin: 660 }]);
  assert.deepEqual(staggered.simultaneous.map((event) => event.id), ["early", "later"]);
  assert.equal(staggered.timeCoordinate, 590);
  assert.equal(staggered.clusterEndMin, 660);

  const nested = cluster([{ id: "outer", startMin: 600, endMin: 720 }, { id: "inner", startMin: 660, endMin: 690 }]);
  assert.deepEqual(nested.simultaneous.map((event) => event.id), ["outer", "inner"]);

  const transitive = cluster([
    { id: "first", startMin: 600, endMin: 660 },
    { id: "second", startMin: 630, endMin: 690 },
    { id: "third", startMin: 675, endMin: 720 },
  ]);
  assert.deepEqual(transitive.simultaneous.map((event) => event.id), ["first", "second", "third"]);
  assert.equal(transitive.clusterEndMin, 720);

  const adjacentLayout = weekEventLayout([{ id: "before", startMin: 600, endMin: 660 }, { id: "after", startMin: 660, endMin: 720 }]);
  assert.equal(adjacentLayout.filter((event) => event.isRepresentative).length, 2);
  assert.ok(adjacentLayout.every((event) => event.simultaneous.length === 1));

  for (const count of [6, 9]) {
    const events = Array.from({ length: count }, (_, index) => ({ id: `event-${index}`, startMin: 600 + index, endMin: 700 + index }));
    const layout = weekEventLayout(events);
    const summary = layout.find((event) => event.isRepresentative);
    assert.equal(summary.simultaneous.length, count);
    assert.deepEqual(new Set(layout.map((event) => event.id)), new Set(events.map((event) => event.id)));
  }
});

test("collision representative may be shortest without limiting the cluster range", () => {
  const layout = weekEventLayout([
    { id: "long", title: "Long", startMin: 600, endMin: 720 },
    { id: "short", title: "Short", startMin: 600, endMin: 615 },
  ]);
  const representative = layout.find((event) => event.isRepresentative);
  assert.equal(representative.id, "short");
  assert.equal(representative.clusterEndMin, 720);
  assert.equal(representative.simultaneous.length, 2);
});

test("collision list sorting is stable by start, end, title and id", () => {
  const events = [
    { id: "z", title: "Бета", startMin: 600, endMin: 690 },
    { id: "b", title: "Альфа", startMin: 600, endMin: 660 },
    { id: "a", title: "Альфа", startMin: 600, endMin: 660 },
    { id: "early", title: "Початок", startMin: 590, endMin: 650 },
  ];
  const representative = weekEventLayout(events).find((event) => event.isRepresentative);
  assert.deepEqual(representative.simultaneous.map((event) => event.id), ["early", "a", "b", "z"]);
  assert.deepEqual(new Set(representative.simultaneous.map((event) => event.id)), new Set(events.map((event) => event.id)));
});

test("recurring destructive actions always carry their context", () => {
  assert.deepEqual(recurringActionLabels(true), ["Видалити лише цю подію", "Видалити всю серію", "Скасувати лише цю подію", "Скасувати всю серію"]);
});

test("critical calendar controls retain keyboard and ARIA affordances", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
  assert.match(source, /aria-label=\{periodNavigationLabels\.previous\}/);
  assert.match(source, /aria-label="Фільтр за залою"/);
  assert.match(source, /data-testid="week-room-lane-calendar"/);
  assert.match(source, /type="button" data-event-card="1" aria-label=\{accessibleLabel\}/);
  assert.match(source, /role="dialog" aria-modal="true" aria-labelledby="schedule-event-details-title"/);
  assert.match(source, /ref=\{concurrentDialogRef\} role="dialog" aria-modal="true" aria-labelledby="concurrent-events-title" tabIndex=\{-1\}/);
  assert.match(source, /concurrentTriggerRef\.current\?\.focus/);
  assert.doesNotMatch(source, /<button key=\{key\}[\s\S]{0,3000}role="button"/);
});

test("lesson plan details expose only one add-plan action", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
  const details = source.slice(source.indexOf("{selectedEventDetails &&"), source.indexOf("{bulkPlanSetup &&"));
  assert.equal((details.match(/Додати план/g) || []).length, 1);
});

test("collision tile preview keeps visible content and deterministic overflow", async () => {
  const { collisionTilePreview } = await import("../src/scheduleCalendar.js");
  const events = Array.from({ length: 12 }, (_, id) => ({ id }));
  assert.deepEqual(collisionTilePreview(events.slice(0, 2), { availableHeightPx: 60 }), { columns: 2, visible: events.slice(0, 2), overflow: 0 });
  assert.equal(collisionTilePreview(events.slice(0, 4), { availableHeightPx: 60 }).visible.length, 4);
  const short = collisionTilePreview(events, { availableHeightPx: 27 });
  assert.equal(short.visible.length, 2);
  assert.equal(short.overflow, 10);
  const long = collisionTilePreview(events, { availableHeightPx: 270 });
  assert.equal(long.visible.length, 12);
  assert.equal(long.overflow, 0);
  assert.equal(collisionTilePreview(events.slice(0, 10), { availableHeightPx: 108, isMobile: true }).columns, 2);
});

test("schedule save result rejects silent permission and callback failures", async () => {
  const { requireScheduleSaveResult } = await import("../src/scheduleCalendar.js");
  assert.throws(() => requireScheduleSaveResult(undefined), /не були збережені/);
  assert.throws(() => requireScheduleSaveResult(null, "Немає доступу"), /Немає доступу/);
  assert.deepEqual(requireScheduleSaveResult({ id: "saved" }), { id: "saved" });
});

test("all schedule edit paths expose guarded async save state", async () => {
  const fs = await import("node:fs/promises");
  const schedule = await fs.readFile(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
  const app = await fs.readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(schedule, /bookingSaving \? "Зберігаємо…"/);
  assert.match(schedule, /formErrors\.save \? <div role="alert"/);
  assert.match(schedule, /groupOverrideEdit\.saving \? "Зберігаємо…"/);
  assert.match(schedule, /groupSlotEdit\.saving \? "Зберігаємо…"/);
  assert.match(schedule, /await onUpdateBooking\?\.\(editingId, payload\)/);
  assert.match(schedule, /await onUpdateGroupLessonOverride\?\.\(groupOverrideEdit\.overrideId, payload\)/);
  assert.match(schedule, /await onUpdateGroupSchedule\(groupSlotEdit\.groupId, nextSchedule\)/);
  assert.match(app, /const updateRoomBookingAction[\s\S]*?return updated;/);
  assert.match(app, /const updateGroupScheduleAction[\s\S]*?return updated;/);
});

test("collision edit permission follows admin, booking ownership and group assignment", async () => {
  const { canEditCollisionEvent } = await import("../src/scheduleCalendar.js");
  const booking = { id: "booking", kind: "booking", trainerId: "owner" };
  const group = { id: "group", kind: "group" };
  const adminPolicy = { canMutateEvent: () => true, canEditGroupLesson: () => true };
  const ownerPolicy = { canMutateEvent: (event) => event.trainerId === "owner", canEditGroupLesson: () => true };
  const outsiderPolicy = { canMutateEvent: () => false, canEditGroupLesson: () => false };
  assert.equal(canEditCollisionEvent(booking, adminPolicy), true);
  assert.equal(canEditCollisionEvent(booking, ownerPolicy), true);
  assert.equal(canEditCollisionEvent(booking, outsiderPolicy), false);
  assert.equal(canEditCollisionEvent(group, adminPolicy), true);
  assert.equal(canEditCollisionEvent(group, outsiderPolicy), false);
});

test("collision tile statuses distinguish active, tentative and cancelled", async () => {
  const { collisionStatusPresentation } = await import("../src/scheduleCalendar.js");
  assert.deepEqual(collisionStatusPresentation("active"), { status: "active", opacity: 1, text: "Активно", showLabel: false });
  assert.equal(collisionStatusPresentation("tentative").text, "Попередньо");
  assert.equal(collisionStatusPresentation("tentative").showLabel, true);
  assert.equal(collisionStatusPresentation("cancelled").text, "Скасовано");
  assert.equal(collisionStatusPresentation("cancelled").textDecoration, "line-through");
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
  assert.match(source, /Статус: \$\{eventStatus\.text\}/);
  assert.match(source, /eventStatus\.showLabel/);
});

test("short adjacent collision clusters retain exact scaled time geometry", async () => {
  const { collisionClusterGeometry, collisionTilePreview } = await import("../src/scheduleCalendar.js");
  for (const hourPx of [32, 54, 70]) {
    const first = collisionClusterGeometry(600, 630, hourPx);
    const second = collisionClusterGeometry(630, 660, hourPx);
    assert.equal(first.top + first.height, second.top);
    assert.equal(first.height, hourPx / 2);
  }
  const shortDesktop = collisionTilePreview([1, 2, 3, 4], { availableHeightPx: 27, isMobile: false });
  const shortMobile = collisionTilePreview([1, 2, 3, 4], { availableHeightPx: 16, isMobile: true });
  assert.ok(shortDesktop.visible.length >= 1);
  assert.equal(shortMobile.visible.length, 0);
  assert.equal(shortMobile.overflow, 4);
});

test("week card keyboard activation ignores nested action controls", async () => {
  const { isEventCardKeyboardActivation } = await import("../src/scheduleCalendar.js");
  const card = {};
  const action = {};
  assert.equal(isEventCardKeyboardActivation({ key: "Enter", target: card, currentTarget: card }), true);
  assert.equal(isEventCardKeyboardActivation({ key: " ", target: card, currentTarget: card }), true);
  assert.equal(isEventCardKeyboardActivation({ key: "Enter", target: action, currentTarget: card }), false);
  assert.equal(isEventCardKeyboardActivation({ key: " ", target: action, currentTarget: card }), false);
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
  assert.match(source, /type="button" data-event-card="1"/);
  assert.doesNotMatch(source, /aria-label=\{`Редагувати: \$\{event\.title\}/);
});

test("room lanes isolate simultaneous and transitive overlaps by room", () => {
  const events = [
    { id: "a", roomName: "Зал 1", startMin: 990, endMin: 1050 },
    { id: "b", roomName: "Зал 2", startMin: 990, endMin: 1080 },
    { id: "c", roomName: "Зал 3", startMin: 1020, endMin: 1110 },
    { id: "d", roomName: "Зал 1", startMin: 1050, endMin: 1140 },
  ];
  const lanes = roomLaneLayout(events, ["Зал 1", "Зал 2", "Зал 3"]);
  assert.equal(lanes.length, 3);
  assert.deepEqual(lanes.map((lane) => lane.events.length), [2, 1, 1]);
  assert.ok(lanes.flatMap((lane) => lane.events).every((event) => event.simultaneous.every((peer) => peer.roomName === event.roomName)));
  assert.ok(lanes.flatMap((lane) => lane.events).every((event) => event.timeCoordinate === event.startMin));
});

test("dense evening room lanes retain all twelve real time coordinates", () => {
  const events = Array.from({ length: 12 }, (_, index) => ({
    id: String(index), roomName: `Зал ${(index % 3) + 1}`,
    startMin: 990 + index * 25, endMin: 1035 + index * 25,
  }));
  const laidOut = roomLaneLayout(events, ["Зал 1", "Зал 2", "Зал 3"]).flatMap((lane) => lane.events);
  assert.equal(laidOut.length, 12);
  assert.deepEqual(laidOut.map((event) => event.timeCoordinate).sort((a, b) => a - b), events.map((event) => event.startMin));
});

test("only a real same-room overlap is marked as a booking conflict", () => {
  const lanes = roomLaneLayout([
    { id: "same-a", roomName: "Зал 1", startMin: 1080, endMin: 1140 },
    { id: "same-b", roomName: "Зал 1", startMin: 1110, endMin: 1170 },
    { id: "other", roomName: "Зал 2", startMin: 1110, endMin: 1170 },
  ], ["Зал 1", "Зал 2"]);
  assert.ok(lanes[0].events.every((event) => event.hasRoomConflict));
  assert.equal(lanes[1].events[0].hasRoomConflict, false);
});

test("unknown room is appended only when unknown events exist", () => {
  assert.deepEqual(roomLaneLayout([{ id: "x", startMin: 600, endMin: 660 }], ["Зал 1"]).map((lane) => lane.roomName), ["Зал 1", "Зала не вказана"]);
  assert.deepEqual(roomLaneLayout([], ["Зал 1"]).map((lane) => lane.roomName), ["Зал 1"]);
});

test("specific room and mobile week UI keep one wide lane and a day selector", async () => {
  const lanes = roomLaneLayout([{ id: "x", roomName: "Нова назва", startMin: 600, endMin: 660 }], ["Нова назва"]);
  assert.equal(lanes.length, 1);
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
  assert.match(source, /aria-label="Оберіть день тижня"/);
  assert.match(source, /selectedRoom === "all" \? \(isMobile \? "clamp\(138px, 40vw, 156px\)" : 84\) : \(isMobile \? 280 : 180\)/);
  assert.match(source, /aria-label={`Створити подію: \${date}, \${lane.roomName}`}/);
});

test("collision overflow and details use canonical booking status", async () => {
  const { collisionStatusPresentation } = await import("../src/scheduleCalendar.js");
  assert.equal(collisionStatusPresentation("active").showLabel, false);
  assert.equal(collisionStatusPresentation("tentative").text, "Попередньо");
  assert.equal(collisionStatusPresentation("cancelled").text, "Скасовано");
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
  assert.match(source, /concurrentEvents\.map[\s\S]*?collisionStatusPresentation\(event\.status\)/);
  assert.match(source, /aria-label=\{accessibleLabel\}/);
  assert.match(source, /selectedEventDetails\.status \|\| \(selectedEventDetails\.cancelled \? "cancelled" : "active"\)/);
});

test("week room-lane selection preserves date, room and real quarter-hour range", () => {
  assert.deepEqual(weekLaneSelection({
    date: "2026-10-01", roomName: "Зал 2", startY: 459, endY: 594,
    hourPx: 54, dayStartHour: 8, dayEndHour: 22,
  }), { date: "2026-10-01", roomName: "Зал 2", startMinute: 990, endMinute: 1140 });
  const reverse = weekLaneSelection({ date: "2026-10-01", roomName: "Зал 3", startY: 270, endY: 216, hourPx: 54 });
  assert.deepEqual(reverse, { date: "2026-10-01", roomName: "Зал 3", startMinute: 720, endMinute: 780 });
});

test("adjacent fifteen-minute week cards have exact non-overlapping geometry", () => {
  for (const hourPx of [32, 54, 70]) {
    const first = weekEventGeometry(600, 615, hourPx);
    const second = weekEventGeometry(615, 630, hourPx);
    assert.equal(first.top + first.height, second.top);
    assert.equal(first.height, hourPx / 4);
  }
});

test("room-lane creation remains available on desktop and mobile without covering cards", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
  assert.match(source, /canManageBookings \? <div[\s\S]*?onPointerDown=[\s\S]*?onPointerMove=[\s\S]*?onPointerUp=/);
  assert.match(source, /openCreateAt\(date, current\.startMinute, pointerEvent, current\.endMinute, lane\.roomName\)/);
  assert.match(source, /aria-label=\{`Створити подію: \$\{date\}, \$\{lane\.roomName\}`\}/);
  assert.match(source, /onKeyDown=\{\(pointerEvent\)[\s\S]*?openCreateAt\(date,[\s\S]*?lane\.roomName\)/);
  assert.match(source, /style=\{\{ position: "absolute", inset: 0, zIndex: 1/);
  assert.match(source, /data-event-card="1"[\s\S]*?zIndex: 5 \+ event\.colIndex/);
});

test("booking details retain every mutation action and occurrence-series semantics", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
  const details = source.slice(source.indexOf('{selectedEventDetails &&'), source.indexOf('{bulkPlanSetup &&'));
  assert.match(details, /selectedEventDetails\.kind === "booking" && canMutateEvent\(selectedEventDetails\)/);
  for (const label of ["Редагувати", "Дублювати", "Видалити лише цю подію", "Видалити всю серію", "Позначити як попереднє бронювання", "Скасувати лише цю подію", "Скасувати всю серію", "Повернути active", "Скинути колір"]) assert.match(details, new RegExp(label));
  assert.match(details, /deleteBookingEvent\(event, "occurrence"\)/);
  assert.match(details, /deleteBookingEvent\(event, "series"\)/);
  assert.match(details, /cancelBookingEvent\(event, "occurrence"\)/);
  assert.match(details, /cancelBookingEvent\(event, "series"\)/);
});

test("group details retain permission-gated lesson actions and admin-only regular edit", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
  const details = source.slice(source.indexOf('{selectedEventDetails &&'), source.indexOf('{bulkPlanSetup &&'));
  assert.match(details, /selectedEventDetails\.kind === "group" && canEditGroupSingleLesson\(selectedEventDetails\)/);
  assert.match(details, /openLessonPlanEditor\(event\)/);
  assert.match(details, /openGroupOverrideEditor\(event\)/);
  assert.match(details, /cancelSingleGroupLesson\(event\)/);
  assert.match(details, /\{isAdmin \? <button[\s\S]*?openGroupSlotEditor\(event\)/);
});

test("week plan and same-room conflict indicators are accessible sibling controls", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
  assert.match(source, /const hasPlan = hasLessonPlanForEvent\(event\)/);
  assert.match(source, /getLessonPlanSeriesLabelForEvent\(event\)/);
  assert.match(source, /aria-label=\{planSeriesLabel \? `Є план, порядок/);
  assert.match(source, /<\/button>\s*\{event\.hasRoomConflict && event\.isRepresentative \? <button type="button" aria-label=\{`Відкрити конфлікт бронювання зали/);
  assert.doesNotMatch(source, /<button[^>]*data-event-card="1"[\s\S]{0,2500}<span[^>]*onClick=/);
  assert.match(source, /concurrentTriggerRef\.current = clickEvent\.currentTarget/);
});

test("desktop week uses stronger matching day dividers and thin room dividers", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
  assert.match(source, /const divider = index > 0 \? `3px solid/);
  assert.match(source, /const divider = dayIndex > 0 \? `3px solid/);
  assert.match(source, /data-day-divider="header"[\s\S]*?borderLeft: divider/);
  assert.match(source, /data-day-divider="body"[\s\S]*?borderLeft: divider/);
  assert.match(source, /data-room-divider="header"[\s\S]*?`1px solid \$\{weekRoomDividerColor\}`/);
  assert.match(source, /data-room-divider="body"[\s\S]*?`1px solid \$\{weekRoomDividerColor\}`/);
});

test("mobile all-room headers and lanes share a width that exposes two lanes at 390px", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
  assert.match(source, /const laneWidth = selectedRoom === "all" \? \(isMobile \? "clamp\(138px, 40vw, 156px\)" : 84\)/);
  assert.match(source, /data-room-divider="header"[\s\S]*?width: laneWidth/);
  assert.match(source, /data-room-lane=\{lane\.roomName\}[\s\S]*?width: laneWidth/);
  const laneAt390 = Math.min(156, Math.max(138, 390 * .4));
  assert.ok(laneAt390 * 2 + 44 <= 390);
  assert.match(source, /selectedRoom === "all"[\s\S]*?: \(isMobile \? 280 : 180\)/);
});

test("compact mobile week preview sorts chronologically and exposes deterministic overflow", () => {
  const events = [
    { id: "late", startMin: 1140, endMin: 1200, title: "Пізня" },
    { id: "early", startMin: 990, endMin: 1050, title: "Рання" },
    { id: "middle", startMin: 1080, endMin: 1110, title: "Середня" },
    { id: "four", startMin: 1200, endMin: 1230 },
    { id: "five", startMin: 1230, endMin: 1260 },
    { id: "six", startMin: 1260, endMin: 1290 },
  ];
  const preview = compactDayPreview(events, 5);
  assert.deepEqual(preview.visible.map((event) => event.id), ["early", "middle", "late", "four", "five"]);
  assert.equal(preview.remaining, 1);
});

test("mobile week overview is a horizontally snapping seven-day time grid", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
  const overview = source.slice(source.indexOf('data-testid="mobile-week-overview"'), source.indexOf('{(!isMobile || mobileWeekMode === "day")'));
  assert.match(overview, /overflowX: "auto"/);
  assert.match(overview, /scrollSnapType: "x proximity"/);
  assert.match(overview, /const dayWidth = "clamp\(118px, 34vw, 136px\)"/);
  assert.match(overview, /repeat\(7, \$\{dayWidth\}\)/);
  assert.match(overview, /scrollSnapAlign: "start"/);
  assert.match(overview, /position: "sticky", left: 0/);
  assert.match(overview, /const miniHourPx = 28/);
  assert.match(overview, /weekDays\.map/);
  assert.match(overview, /roomFilteredEventsByDay\.get\(date\) \|\| \[\]/);
  assert.match(overview, /setSelectedDate\(date\); setMobileWeekMode\("day"\)/);
  assert.doesNotMatch(overview, /data-mobile-agenda-day|agendaEvents|preview\.remaining|\+\{preview/);
});

test("week cards retain all compact event type marks", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
  assert.match(source, /group_lesson: "Г"/);
  assert.match(source, /individual_training: "І"/);
  assert.match(source, /room_booking: "Р"/);
  assert.match(source, /cleaning: "П"/);
  assert.match(source, /custom_admin_event: "П"/);
});

test("week cards resolve trainer and booking-owner initials without inventing missing names", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
  assert.match(source, /const getScheduleEventTrainerInitials = \(event = \{\}\) =>\s*getEventTrainerInitials\(event\) \|\| getTrainerInitials\(getTrainerNameById\(event\.trainerId \|\| event\.trainer_id\)\)/);
  assert.equal(getTrainerInitials("Олена Коваль"), "ОК");
  assert.equal(getTrainerInitials("Марія"), "М");
  assert.equal(getTrainerInitials(""), "");
  assert.equal(getTrainerInitials("—"), "");
});

test("short desktop and mobile-day room cards always render type and available initials", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
  const roomCards = source.slice(source.indexOf("{lane.events.map((event)"), source.indexOf("{concurrentEvents?.length"));
  assert.match(roomCards, /const typeMark = getEventTypeMark\(event\)/);
  assert.match(roomCards, /const trainerInitials = getScheduleEventTrainerInitials\(event\)/);
  assert.match(roomCards, /fontSize: 6, lineHeight: "9px"/);
  assert.doesNotMatch(roomCards, /height >= 42 \? \(getEventTrainerInitials/);
  assert.match(roomCards, /\{typeMark \? <span aria-hidden="true"/);
  assert.match(roomCards, /\{trainerInitials \? <span aria-hidden="true"/);
});

test("mobile week mini-grid uses dynamic overlap columns and exact geometry", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
  const overview = source.slice(source.indexOf('data-testid="mobile-week-overview"'), source.indexOf('{(!isMobile || mobileWeekMode === "day")'));
  assert.match(overview, /events: overlapEventLayout\(events\)/);
  assert.match(overview, /weekEventGeometry\(event\.startMin, event\.endMin, miniHourPx, DAY_START_HOUR\)/);
  assert.match(overview, /const width = 100 \/ event\.colCount/);
  assert.match(overview, /const left = event\.colIndex \* width/);
  assert.match(overview, /height: geometry\.height/);
  assert.match(overview, /sameRoomConflictIds\.has\(event\.id\)/);
  assert.match(overview, /pointerEvents: "none"/);
  const blocks = overview.slice(overview.indexOf('return <span key={event.id}'), overview.indexOf('</span>;'));
  assert.match(blocks, /\{event\.title\}/);
  assert.doesNotMatch(blocks, /typeMark|trainerInitials|event\.startTime|event\.roomName/);
});

test("week card accessible labels retain full type, trainer, title, time, room and status", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
  assert.match(source, /const fullType = getEventTypeLabel\(event\.eventType\)/);
  assert.match(source, /const accessibleLabel = `\$\{fullType\}\$\{trainerName \? ` · \$\{trainerName\}` : ""\} · \$\{event\.title\} · \$\{event\.startTime\}–\$\{event\.endTime\} · \$\{lane\.roomName\} · Статус: \$\{status\.text\}`/);
  assert.match(source, /aria-label=\{accessibleLabel\} title=\{accessibleLabel\}/);
});

test("time-grid cards use a full-width stacked header and title", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
  const roomCards = source.slice(source.indexOf("{lane.events.map((event)"), source.indexOf("{concurrentEvents?.length"));
  const visibleCard = roomCards.slice(roomCards.indexOf('<button type="button" data-event-card="1"'), roomCards.indexOf('</button>'));
  assert.doesNotMatch(visibleCard, /gridTemplateColumns|borderRight/);
  assert.match(visibleCard, /gridTemplateRows: "13px minmax\(0,1fr\)"/);
  assert.match(visibleCard, /\{typeMark \? <span/);
  assert.match(visibleCard, /\{trainerInitials \? <span/);
  assert.match(visibleCard, /\{event\.startTime\}<\/span>/);
  assert.match(visibleCard, /height < 24 \? <span style=\{\{ display: "flex"/);
  assert.match(visibleCard, /<span aria-hidden="true" style=\{\{ fontSize: 7 \}\}>·<\/span>/);
  assert.doesNotMatch(visibleCard, /event\.endTime|getEventTypeLabel/);
  assert.match(visibleCard, /width: "100%"/);
  assert.match(visibleCard, /overflowWrap: "anywhere"/);
  assert.match(roomCards, /const accessibleLabel = `\$\{fullType\}[\s\S]*?\$\{event\.startTime\}–\$\{event\.endTime\}/);
});

test("calendar sorting retains every filtered event", () => {
  const events = Array.from({ length: 12 }, (_, index) => ({ id: String(index), startMin: 1200 - index * 15, endMin: 1230 - index * 15 }));
  const sorted = sortCalendarEvents(events);
  assert.equal(sorted.length, events.length);
  assert.deepEqual(sorted.map((event) => event.startMin), events.map((event) => event.startMin).sort((a, b) => a - b));
});

test("dynamic overlap layout restores full width after a conflict ends", () => {
  const events = [
    { id: "a", startMin: 600, endMin: 630 },
    { id: "b", startMin: 600, endMin: 630 },
    { id: "c", startMin: 630, endMin: 660 },
  ];
  const layout = overlapEventLayout(events);
  assert.deepEqual(layout.slice(0, 2).map((event) => event.colCount), [2, 2]);
  assert.equal(layout[2].colCount, 1);
  assert.equal(layout[2].colIndex, 0);
  assert.deepEqual(layout.map(({ id, startMin, endMin }) => ({ id, startMin, endMin })), events);
});

test("mobile overview initially scrolls to selected date with a safe fallback", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
  assert.match(source, /mobileWeekOverviewRef\.current\?\.querySelector\(`\[data-week-date="\$\{target\}"\]`\)\?\.scrollIntoView/);
  assert.match(source, /weekKeys\.includes\(selectedDate\) \? selectedDate : \(weekKeys\.includes\(today\) \? today : weekKeys\[0\]\)/);
});

test("week room resolution preserves active, fallback and specific-room lanes", () => {
  assert.deepEqual(resolveWeekRoomNames({ selectedRoom: "all", activeRoomNames: [], knownRoomNames: [], defaultRoom: "Основна зала" }), ["Основна зала"]);
  assert.deepEqual(resolveWeekRoomNames({ selectedRoom: "all", activeRoomNames: [], knownRoomNames: ["Архівна зала"], defaultRoom: "Основна зала" }), ["Архівна зала"]);
  assert.deepEqual(resolveWeekRoomNames({ selectedRoom: "all", activeRoomNames: ["Зал 1", "Зал 2"], knownRoomNames: ["Legacy"], defaultRoom: "Основна зала" }), ["Зал 1", "Зал 2"]);
  assert.deepEqual(resolveWeekRoomNames({ selectedRoom: "Зал 2", activeRoomNames: [], knownRoomNames: [], defaultRoom: "Основна зала" }), ["Зал 2"]);
  const emptyDayLanes = roomLaneLayout([], resolveWeekRoomNames({ selectedRoom: "all", defaultRoom: "Основна зала" }));
  assert.deepEqual(emptyDayLanes.map((lane) => lane.roomName), ["Основна зала"]);
});

test("empty week fallback lanes keep creation bound to the fallback room", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
  assert.match(source, /const weekCanonicalRooms = useMemo\(\(\) => resolveWeekRoomNames/);
  assert.match(source, /knownRoomNames: allKnownRooms\.map\(normalizeRoomName\)\.filter\(Boolean\)/);
  assert.match(source, /defaultRoom: DEFAULT_ROOM/);
  assert.match(source, /roomLaneLayout\(roomFilteredEventsByDay\.get\(date\) \|\| \[\], weekCanonicalRooms, UNKNOWN_ROOM_NAME\)/);
  assert.match(source, /aria-label=\{`Створити подію: \$\{date\}, \$\{lane\.roomName\}`\}/);
  assert.match(source, /openCreateAt\(date, current\.startMinute, pointerEvent, current\.endMinute, lane\.roomName\)/);
});

test("same-room transitive conflicts reuse columns without shrinking the conflict list", () => {
  const events = [
    { id: "A", roomName: "Зал 1", startMin: 540, endMin: 600 },
    { id: "B", roomName: "Зал 1", startMin: 570, endMin: 630 },
    { id: "C", roomName: "Зал 1", startMin: 600, endMin: 660 },
  ];
  const laidOut = roomLaneLayout(events, ["Зал 1"])[0].events;
  assert.deepEqual(laidOut.map(({ id, colIndex, colCount }) => ({ id, colIndex, colCount })), [
    { id: "A", colIndex: 0, colCount: 2 },
    { id: "B", colIndex: 1, colCount: 2 },
    { id: "C", colIndex: 0, colCount: 2 },
  ]);
  assert.ok(laidOut.every((event) => event.simultaneous.length === 3));
  assert.deepEqual(new Set(laidOut.map((event) => event.id)), new Set(["A", "B", "C"]));
});

test("room lanes use three columns only for a true triple overlap and one for adjacent events", () => {
  const triple = roomLaneLayout([
    { id: "A", roomName: "Зал 1", startMin: 540, endMin: 630 },
    { id: "B", roomName: "Зал 1", startMin: 550, endMin: 620 },
    { id: "C", roomName: "Зал 1", startMin: 560, endMin: 610 },
  ], ["Зал 1"])[0].events;
  assert.ok(triple.every((event) => event.colCount === 3));
  const adjacent = roomLaneLayout([
    { id: "A", roomName: "Зал 1", startMin: 540, endMin: 600 },
    { id: "B", roomName: "Зал 1", startMin: 600, endMin: 660 },
  ], ["Зал 1"])[0].events;
  assert.ok(adjacent.every((event) => event.colIndex === 0 && event.colCount === 1));
});

test("desktop and mobile selected-day room cards use shared overlap column metadata", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../src/components/ScheduleTab.jsx", import.meta.url), "utf8");
  const roomCards = source.slice(source.indexOf("{lane.events.map((event)"), source.indexOf("{concurrentEvents?.length"));
  assert.match(roomCards, /const width = 100 \/ event\.colCount/);
  assert.match(roomCards, /const left = event\.colIndex \* width/);
  assert.doesNotMatch(roomCards, /simultaneous\.length[^\n]*width|findIndex\(\(item\) => item\.id === event\.id\)/);
  assert.match(roomCards, /setConcurrentEvents\(event\.simultaneous\)/);
});
