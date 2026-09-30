import { getInternalGroupLabel } from "./groupLabels.js";
import { getScheduleSlotStartTime } from "./groupSchedule.js";

export const ACTIVE_TRIAL_STATUSES = ["new", "contacted", "confirmed"];
export const HISTORY_TRIAL_STATUSES = ["came", "no_show", "became_student", "declined", "cancelled"];
export const TRIAL_CATEGORIES = ["overdue", "today", "upcoming", "history"];

export const localDateKey = (value = new Date()) => {
  if (typeof value === "string") return value.slice(0, 10);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const TRIAL_VIEW_MODES = ["list", "week", "month"];

export const safeTrialViewMode = (value) => TRIAL_VIEW_MODES.includes(value) ? value : "list";

/** Parse a calendar date without letting UTC move a date-only value to another day. */
export function parseLocalDate(value) {
  const key = localDateKey(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function addCalendarDays(value, amount) {
  const date = parseLocalDate(value);
  if (!date) return null;
  date.setDate(date.getDate() + amount);
  return date;
}

export function startOfMondayWeek(value = new Date()) {
  const date = parseLocalDate(value);
  if (!date) return null;
  const weekday = date.getDay();
  date.setDate(date.getDate() - (weekday === 0 ? 6 : weekday - 1));
  return date;
}

export function buildWeekRange(value = new Date()) {
  const start = startOfMondayWeek(value);
  return start ? Array.from({ length: 7 }, (_, index) => addCalendarDays(start, index)) : [];
}

export function shiftCalendarMonth(value, amount) {
  const date = parseLocalDate(value);
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12);
}

export function buildMonthRange(value = new Date()) {
  const date = parseLocalDate(value);
  if (!date) return [];
  const first = new Date(date.getFullYear(), date.getMonth(), 1, 12);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0, 12);
  const start = startOfMondayWeek(first);
  const end = addCalendarDays(startOfMondayWeek(last), 6);
  const days = [];
  for (let cursor = start; cursor <= end; cursor = addCalendarDays(cursor, 1)) days.push(cursor);
  return days;
}

export function getTrialEventTime(booking = {}, group = {}) {
  const direct = [booking.trialTime, booking.trial_time, booking.time]
    .map((value) => String(value || "").trim())
    .find(Boolean);
  if (direct) return direct.slice(0, 5);
  const date = parseLocalDate(booking.trialDate || booking.trial_date);
  if (!date) return "";
  const slot = (group.schedule || []).find((item) => Number(item.day ?? item.dayOfWeek) === date.getDay());
  return getScheduleSlotStartTime(slot).slice(0, 5);
}

export function groupTrialBookingsByDate(bookings = [], groupMap = {}, studentMap = {}, getDisplayName) {
  return bookings.reduce((result, booking) => {
    const key = localDateKey(booking.trialDate || booking.trial_date || "");
    if (!parseLocalDate(key)) return result;
    (result[key] ||= []).push(booking);
    result[key].sort((a, b) => textCompare(getTrialEventTime(a, groupMap[a.groupId]), getTrialEventTime(b, groupMap[b.groupId]))
      || textCompare(getInternalGroupLabel(groupMap[a.groupId] || { name: a.groupName || "" }), getInternalGroupLabel(groupMap[b.groupId] || { name: b.groupName || "" }))
      || textCompare(getTrialDisplayName(a, studentMap, getDisplayName), getTrialDisplayName(b, studentMap, getDisplayName))
      || textCompare(a.id, b.id));
    return result;
  }, {});
}

export const trialDayOverflow = (bookings = [], limit = 3) => ({ visible: bookings.slice(0, limit), hiddenCount: Math.max(0, bookings.length - limit) });

export function selectTrialCalendarRows(categories = {}, category = "all") {
  if (TRIAL_CATEGORIES.includes(category)) return categories[category] || [];
  return TRIAL_CATEGORIES.flatMap((key) => categories[key] || []);
}

/** Keep calendar details scoped to the rendered range and filtered source. */
export function resolveTrialCalendarSelection(days = [], selectedDay = null, selectedTrialId = null, bookingsByDate = {}) {
  const visibleKeys = new Set(days.map(localDateKey));
  const day = selectedDay && visibleKeys.has(selectedDay) ? selectedDay : null;
  const rows = day ? (bookingsByDate[day] || []) : [];
  const trialId = selectedTrialId && rows.some((booking) => String(booking.id) === String(selectedTrialId)) ? selectedTrialId : null;
  return { day, trialId };
}

export const formatTrialCalendarEventAriaLabel = ({ name, group, time, status }) =>
  `${name || "Новий контакт"}, ${group || "Група"}, ${time || "час не вказано"}, статус: ${status || "не вказано"}`;

const dateNumber = (value) => Number(String(value || "").slice(0, 10).replaceAll("-", "")) || 0;

export const TRIAL_SORT_MODES = ["priority", "date_asc", "date_desc", "name", "status", "group"];

const textCompare = (a, b) => String(a || "").localeCompare(String(b || ""), "uk-UA", { sensitivity: "base", numeric: true });

export function getTrialDisplayName(booking = {}, studentMap = {}, getDisplayName = (student) => student?.name) {
  const student = studentMap[booking.studentId];
  return (student && getDisplayName(student)) || booking.name || "Новий контакт";
}

/** Pure, deterministic sorting for one trial category. */
export function sortTrialBookings(bookings = [], mode = "priority", category = "upcoming", groupMap = {}, studentMap = {}, getDisplayName) {
  const selectedMode = TRIAL_SORT_MODES.includes(mode) ? mode : "priority";
  const statusRank = { confirmed: 0, contacted: 1, new: 2, came: 3, became_student: 4, no_show: 5, declined: 6, cancelled: 7 };
  return bookings.map((booking, index) => ({ booking, index })).sort((a, b) => {
    const aDate = dateNumber(a.booking.trialDate || a.booking.trial_date);
    const bDate = dateNumber(b.booking.trialDate || b.booking.trial_date);
    let result = 0;
    if (selectedMode === "priority") {
      if (category === "today") result = (statusRank[a.booking.status] ?? 99) - (statusRank[b.booking.status] ?? 99);
      else if (category === "upcoming") result = aDate - bDate;
      else result = bDate - aDate;
    } else if (selectedMode === "date_asc") result = aDate - bDate;
    else if (selectedMode === "date_desc") result = bDate - aDate;
    else if (selectedMode === "name") result = textCompare(getTrialDisplayName(a.booking, studentMap, getDisplayName), getTrialDisplayName(b.booking, studentMap, getDisplayName));
    else if (selectedMode === "status") result = (statusRank[a.booking.status] ?? 99) - (statusRank[b.booking.status] ?? 99) || textCompare(a.booking.status, b.booking.status);
    else if (selectedMode === "group") {
      const aGroup = groupMap[a.booking.groupId] ? getInternalGroupLabel(groupMap[a.booking.groupId]) : (a.booking.groupName || "");
      const bGroup = groupMap[b.booking.groupId] ? getInternalGroupLabel(groupMap[b.booking.groupId]) : (b.booking.groupName || "");
      result = textCompare(aGroup, bGroup);
      if (!result) result = textCompare(a.booking.groupId, b.booking.groupId);
    }
    return result
      || aDate - bDate
      || textCompare(getTrialDisplayName(a.booking, studentMap, getDisplayName), getTrialDisplayName(b.booking, studentMap, getDisplayName))
      || textCompare(a.booking.id, b.booking.id)
      || a.index - b.index;
  }).map(({ booking }) => booking);
}

export function getTrialCategory(booking, todayKey = localDateKey()) {
  const status = String(booking?.status || "new");
  if (HISTORY_TRIAL_STATUSES.includes(status)) return "history";
  if (!ACTIVE_TRIAL_STATUSES.includes(status)) return "history";
  const date = localDateKey(booking?.trialDate || booking?.trial_date || "");
  if (date < todayKey) return "overdue";
  if (date === todayKey) return "today";
  return "upcoming";
}

export function groupAndSortTrialBookings(bookings = [], todayKey = localDateKey(), mode = "priority", groupMap = {}, studentMap = {}, getDisplayName) {
  const grouped = Object.fromEntries(TRIAL_CATEGORIES.map((category) => [category, []]));
  bookings.forEach((booking) => grouped[getTrialCategory(booking, todayKey)].push(booking));
  TRIAL_CATEGORIES.forEach((category) => {
    grouped[category] = sortTrialBookings(grouped[category], mode, category, groupMap, studentMap, getDisplayName);
  });
  return grouped;
}

export function filterTrialBookings(bookings = [], filters = {}, groupMap = {}) {
  const query = String(filters.search || "").trim().toLocaleLowerCase("uk-UA");
  return bookings.filter((booking) => {
    const group = groupMap[booking.groupId];
    const haystack = [booking.name, booking.phone, booking.telegram, booking.instagram].filter(Boolean).join(" ").toLocaleLowerCase("uk-UA");
    return (!query || haystack.includes(query))
      && (!filters.status || filters.status === "all" || String(booking.status || "new") === filters.status)
      && (!filters.groupId || filters.groupId === "all" || String(booking.groupId) === filters.groupId)
      && (!filters.directionId || filters.directionId === "all" || String(group?.directionId || "") === filters.directionId);
  });
}

export const canConvertTrialBooking = (booking, markingTrialId = "") =>
  String(booking?.status) === "confirmed" && String(markingTrialId) !== String(booking?.id);

export const isTrialHistoryStatus = (status) => HISTORY_TRIAL_STATUSES.includes(String(status || ""));

export const shouldExpandTrialHistory = (category) => category === "history";

export function applyTrialConversion(state, bookingId, result = {}) {
  const students = [...(state.students || [])];
  const student = result.student;
  if (student?.id) {
    const index = students.findIndex((row) => String(row.id) === String(student.id));
    if (index < 0) students.push(student); else students[index] = { ...students[index], ...student };
  }
  const studentGrps = [...(state.studentGrps || [])];
  const link = result.studentGroup;
  if (link?.studentId && link?.groupId && !studentGrps.some((row) => String(row.studentId) === String(link.studentId) && String(row.groupId) === String(link.groupId))) studentGrps.push(link);
  const trialBookings = (state.trialBookings || []).map((row) => String(row.id) === String(bookingId)
    ? (result.trialBooking || { ...row, status: "became_student" })
    : row);
  return { students, studentGrps, trialBookings };
}

export function getTrialDayMarker(dateValue, todayKey = localDateKey(), status = "new") {
  if (isTrialHistoryStatus(status)) return "";
  const date = localDateKey(dateValue);
  const asLocalNoon = (key) => new Date(`${key}T12:00:00`);
  const days = Math.round((asLocalNoon(date) - asLocalNoon(todayKey)) / 86400000);
  if (days === 0) return "сьогодні";
  if (days === 1) return "завтра";
  if (days > 1) return `через ${days} днів`;
  return `прострочено на ${Math.abs(days)} днів`;
}
