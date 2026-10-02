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
export const resolveBookingBlockRooms = (block = {}, rooms = []) => {
  if (block.allRooms) return { ...block, roomNames: [] };
  const selectedIds = new Set((block.roomIds || []).map(String));
  const roomNames = [];
  const seenNames = new Set();
  for (const room of rooms || []) {
    if (!selectedIds.has(String(room?.id))) continue;
    const name = String(room?.name || "").trim().replace(/\s+/g, " ");
    const canonicalName = canonicalRoomName(name);
    if (!canonicalName || seenNames.has(canonicalName)) continue;
    seenNames.add(canonicalName);
    roomNames.push(name);
  }
  return { ...block, roomNames };
};
export const blockMatchesDate = (block, date) => block?.isActive !== false && date >= block.startsOn && date <= block.endsOn && (block.weekdays || []).map(Number).includes(isoWeekday(date));

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
  const first = parseDateOnly(booking.date);
  if (!first) return null;
  const recurrence = ["daily", "weekly", "monthly"].includes(booking.recurrence) ? booking.recurrence : "none";
  const explicitUntil = parseDateOnly(booking.recurrenceUntil);
  for (const block of blocks || []) {
    if (block?.isActive === false || !blockMatchesRoom(block, room) || !intervalsOverlap(booking.startTime, booking.endTime, block.startTime, block.endTime)) continue;
    const blockStart = parseDateOnly(block.startsOn);
    const blockEnd = parseDateOnly(block.endsOn);
    if (!blockStart || !blockEnd) continue;
    const rangeStart = new Date(Math.max(first.getTime(), blockStart.getTime()));
    const rangeEnd = new Date(Math.min((explicitUntil || blockEnd).getTime(), blockEnd.getTime()));
    for (let candidate = rangeStart; candidate <= rangeEnd; candidate.setDate(candidate.getDate() + 1)) {
      const elapsedDays = Math.round((candidate.getTime() - first.getTime()) / 86400000);
      const occurs = recurrence === "none"
        ? elapsedDays === 0
        : recurrence === "daily"
          ? elapsedDays >= 0
          : recurrence === "weekly"
            ? elapsedDays >= 0 && elapsedDays % 7 === 0
            : elapsedDays >= 0 && candidate.getDate() === first.getDate();
      const key = formatDateOnly(candidate);
      if (occurs && blockMatchesDate(block, key)) return { block, date: key };
    }
  }
  return null;
}

export const getBookingBlockSaveGuard = (booking, blocks, rooms, isAdmin) => {
  const conflict = findBookingBlockConflict(booking, blocks, rooms);
  return { conflict, blocked: Boolean(conflict) && !isAdmin, requiresConfirmation: Boolean(conflict) && Boolean(isAdmin) };
};

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
