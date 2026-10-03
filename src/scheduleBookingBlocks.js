const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const canonicalRoomName = (value = "") => String(value).trim().replace(/\s+/g, " ").toLocaleLowerCase("uk-UA");
export const parseDateOnly = (value) => {
  if (!DATE_RE.test(String(value || ""))) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
};
export const formatDateOnly = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const isoWeekday = (dateOrKey) => {
  const date = dateOrKey instanceof Date ? dateOrKey : parseDateOnly(dateOrKey);
  return date ? (date.getDay() || 7) : null;
};
export const timeMinutes = (value) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ""));
  if (!match) return null;
  const result = Number(match[1]) * 60 + Number(match[2]);
  return result >= 0 && result < 1440 && Number(match[2]) < 60 ? result : null;
};
export const intervalsOverlap = (startA, endA, startB, endB) => {
  const values = [startA, endA, startB, endB].map(timeMinutes);
  return values.every(Number.isFinite) && values[0] < values[3] && values[2] < values[1];
};
export const blockMatchesRoom = (block, room = {}) => {
  if (block?.allRooms) return true;
  const ids = (block?.roomIds || []).map(String);
  if (room.id != null && ids.includes(String(room.id))) return true;
  return (block?.roomNames || []).some((name) => canonicalRoomName(name) === canonicalRoomName(room.name));
};
export function reconcileBookingBlockRooms(block = {}, studioRooms = []) {
  if (block.allRooms) return { ...block, roomIds: [], roomNames: [] };
  const roomIds = Array.isArray(block.roomIds) ? [...block.roomIds] : [];
  const previousNames = Array.isArray(block.roomNames) ? [...block.roomNames] : [];
  const canonicalById = new Map((studioRooms || []).filter((room) => room?.id != null).map((room) => [String(room.id), String(room.name || "").trim().replace(/\s+/g, " ")]));
  const roomNames = [];
  const seen = new Set();
  const appendName = (name) => {
    const normalized = String(name || "").trim().replace(/\s+/g, " ");
    const canonical = canonicalRoomName(normalized);
    if (!canonical || seen.has(canonical)) return;
    seen.add(canonical);
    roomNames.push(normalized);
  };
  roomIds.forEach((roomId, index) => appendName(canonicalById.get(String(roomId)) || previousNames[index]));
  previousNames.slice(roomIds.length).forEach(appendName);
  return { ...block, roomIds, roomNames };
}
// Backward-compatible entry point; room reconciliation has one implementation.
export const resolveBookingBlockRooms = reconcileBookingBlockRooms;
export function buildBookingBlockDisplayRooms(activeRooms = [], eventRoomNames = [], defaultRoom = "Основна зала") {
  const result = [];
  const seen = new Set();
  const append = (room, canonical) => {
    if (!canonical || seen.has(canonical)) return;
    seen.add(canonical);
    result.push(room);
  };
  for (const room of activeRooms || []) {
    const name = String(room?.name || "").trim().replace(/\s+/g, " ");
    const canonical = canonicalRoomName(name);
    append({ ...room, name, isActive: room?.isActive !== false }, canonical);
  }
  for (const value of eventRoomNames || []) {
    const name = String(typeof value === "string" ? value : value?.name || "").trim().replace(/\s+/g, " ");
    const canonical = canonicalRoomName(name);
    append({ id: `legacy:${canonical}`, name, isActive: true }, canonical);
  }
  if (!result.length) {
    const name = String(defaultRoom || "").trim().replace(/\s+/g, " ");
    if (name) result.push({ id: "legacy:default", name, isActive: true });
  }
  return result;
}
export const blockMatchesDate = (block, date) => block?.isActive !== false && date >= block.startsOn && date <= block.endsOn && (block.weekdays || []).map(Number).includes(isoWeekday(date));

const MS_PER_DAY = 86400000;
const calendarDayNumber = (date) => Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY);
const addCalendarDays = (date, days) => {
  const utc = new Date((calendarDayNumber(date) + days) * MS_PER_DAY);
  return parseDateOnly(`${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`);
};

export function bookingRecurrenceCandidates(booking, rangeStartKey, rangeEndKey) {
  const first = parseDateOnly(booking?.date);
  const blockStart = parseDateOnly(rangeStartKey);
  const blockEnd = parseDateOnly(rangeEndKey);
  if (!first || !blockStart || !blockEnd) return [];
  const recurrence = ["daily", "weekly", "monthly"].includes(booking?.recurrence) ? booking.recurrence : "none";
  if (recurrence === "none") return first >= blockStart && first <= blockEnd ? [formatDateOnly(first)] : [];
  const explicitUntil = parseDateOnly(booking?.recurrenceUntil);
  const from = parseDateOnly([formatDateOnly(first), formatDateOnly(blockStart)].sort().at(-1));
  const untilKey = explicitUntil ? formatDateOnly(explicitUntil) : formatDateOnly(blockEnd);
  const to = parseDateOnly([untilKey, formatDateOnly(blockEnd)].sort()[0]);
  if (!from || !to || from > to) return [];
  if (recurrence === "daily") {
    const count = Math.min(7, calendarDayNumber(to) - calendarDayNumber(from) + 1);
    return Array.from({ length: count }, (_, index) => formatDateOnly(addCalendarDays(from, index)));
  }
  if (recurrence === "weekly") {
    const offset = calendarDayNumber(from) - calendarDayNumber(first);
    const candidate = addCalendarDays(first, Math.ceil(offset / 7) * 7);
    return candidate && candidate <= to ? [formatDateOnly(candidate)] : [];
  }

  // Gregorian dates and weekdays repeat every 400 years. Scanning at most
  // 4,800 monthly candidates is sufficient even for a block ending in 9999.
  const firstDay = first.getDate();
  const startMonth = from.getFullYear() * 12 + from.getMonth();
  const endMonth = Math.min(to.getFullYear() * 12 + to.getMonth(), startMonth + 4799);
  const candidates = [];
  for (let monthIndex = startMonth; monthIndex <= endMonth; monthIndex += 1) {
    const year = Math.floor(monthIndex / 12);
    const month = monthIndex % 12;
    const candidate = new Date(year, month, firstDay, 12);
    if (candidate.getFullYear() !== year || candidate.getMonth() !== month || candidate.getDate() !== firstDay) continue;
    if (candidate >= from && candidate <= to) candidates.push(formatDateOnly(candidate));
  }
  return candidates;
}

export function expandBookingBlocks(blocks, rangeStart, rangeEnd, rooms = []) {
  const start = parseDateOnly(rangeStart);
  const end = parseDateOnly(rangeEnd);
  if (!start || !end || start > end) return [];
  const occurrences = [];
  for (const block of blocks || []) {
    if (block?.isActive === false) continue;
    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      const key = formatDateOnly(date);
      if (!blockMatchesDate(block, key)) continue;
      const availableRooms = rooms.length ? rooms : [{ id: "legacy:default", name: "Основна зала", isActive: true }];
      const matchingRooms = block.allRooms ? availableRooms.filter((room) => room.isActive !== false) : availableRooms.filter((room) => blockMatchesRoom(block, room));
      matchingRooms.forEach((room) => occurrences.push({ ...block, id: `${block.id}:${key}:${room.id}`, blockId: block.id, kind: "booking_block", eventType: "booking_block", date: key, roomId: room.id, roomName: room.name, title: block.title, startTime: block.startTime, endTime: block.endTime, startMin: timeMinutes(block.startTime), endMin: timeMinutes(block.endTime), readOnly: true }));
    }
  }
  return occurrences;
}

export function findBookingBlockConflict(booking, blocks, rooms = []) {
  if (!booking || booking.status === "cancelled") return null;
  const room = rooms.find((item) => String(item.id) === String(booking.roomId)) || { id: booking.roomId, name: booking.roomName };
  if (!parseDateOnly(booking.date)) return null;
  for (const block of blocks || []) {
    if (block?.isActive === false || !blockMatchesRoom(block, room) || !intervalsOverlap(booking.startTime, booking.endTime, block.startTime, block.endTime)) continue;
    const conflictDate = bookingRecurrenceCandidates(booking, block.startsOn, block.endsOn).find((date) => blockMatchesDate(block, date));
    if (conflictDate) return { block, date: conflictDate };
  }
  return null;
}

export const getBookingBlockSaveGuard = (booking, blocks, rooms, isAdmin) => {
  const conflict = findBookingBlockConflict(booking, blocks, rooms);
  return { conflict, blocked: Boolean(conflict) && !isAdmin, requiresConfirmation: Boolean(conflict) && Boolean(isAdmin) };
};

export async function getFreshBookingBlockSaveGuard(booking, blocks, rooms, isAdmin, refreshBlocks) {
  let guard = getBookingBlockSaveGuard(booking, blocks, rooms, isAdmin);
  if (!guard.conflict) return guard;
  const freshBlocks = await refreshBlocks();
  if (!Array.isArray(freshBlocks)) throw new Error("Не вдалося оновити правила недоступності.");
  const reconciled = freshBlocks.map((block) => reconcileBookingBlockRooms(block, rooms));
  guard = getBookingBlockSaveGuard(booking, reconciled, rooms, isAdmin);
  return guard;
}

export async function runBookingBlockMutation(inFlightRef, setSaving, mutation) {
  if (inFlightRef.current) return { skipped: true };
  inFlightRef.current = true;
  setSaving(true);
  try {
    return { skipped: false, value: await mutation() };
  } finally {
    inFlightRef.current = false;
    setSaving(false);
  }
}

export function validateBookingBlock(input) {
  const errors = {};
  if (!String(input?.title || "").trim()) errors.title = "Вкажіть назву";
  else if (String(input.title).trim().length > 120) errors.title = "Максимум 120 символів";
  if (String(input?.note || "").length > 2000) errors.note = "Максимум 2000 символів";
  if (!parseDateOnly(input?.startsOn) || !parseDateOnly(input?.endsOn) || input.startsOn > input.endsOn) errors.dates = "Перевірте діапазон дат";
  const weekdays = [...new Set((input?.weekdays || []).map(Number))];
  if (!weekdays.length || weekdays.some((day) => day < 1 || day > 7)) errors.weekdays = "Оберіть дні тижня";
  if (!intervalsOverlap(input?.startTime, input?.endTime, input?.startTime, input?.endTime)) errors.time = "Час завершення має бути пізніше";
  if (!input?.allRooms && !(input?.roomIds || []).length) errors.rooms = "Оберіть хоча б одну залу";
  return { valid: !Object.keys(errors).length, errors };
}
