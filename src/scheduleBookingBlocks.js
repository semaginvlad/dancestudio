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
      const matchingRooms = block.allRooms ? rooms.filter((room) => room.isActive !== false) : rooms.filter((room) => blockMatchesRoom(block, room));
      matchingRooms.forEach((room) => occurrences.push({ ...block, id: `${block.id}:${key}:${room.id}`, blockId: block.id, kind: "booking_block", eventType: "booking_block", date: key, roomId: room.id, roomName: room.name, title: block.title, startTime: block.startTime, endTime: block.endTime, startMin: timeMinutes(block.startTime), endMin: timeMinutes(block.endTime), readOnly: true }));
    }
  }
  return occurrences;
}

export function findBookingBlockConflict(booking, blocks, rooms = []) {
  if (!booking || booking.status === "cancelled") return null;
  const room = rooms.find((item) => String(item.id) === String(booking.roomId)) || { id: booking.roomId, name: booking.roomName };
  const first = parseDateOnly(booking.date);
  const until = parseDateOnly(booking.recurrenceUntil || booking.date) || first;
  if (!first) return null;
  const recurrence = ["daily", "weekly", "monthly"].includes(booking.recurrence) ? booking.recurrence : "none";
  for (let occurrence = new Date(first); occurrence <= until;) {
    const key = formatDateOnly(occurrence);
    const conflict = (blocks || []).find((block) => blockMatchesDate(block, key) && blockMatchesRoom(block, room) && intervalsOverlap(booking.startTime, booking.endTime, block.startTime, block.endTime));
    if (conflict) return { block: conflict, date: key };
    if (recurrence === "none") break;
    if (recurrence === "daily") occurrence.setDate(occurrence.getDate() + 1);
    if (recurrence === "weekly") occurrence.setDate(occurrence.getDate() + 7);
    if (recurrence === "monthly") occurrence.setMonth(occurrence.getMonth() + 1);
  }
  return null;
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
