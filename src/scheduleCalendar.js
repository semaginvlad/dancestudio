const dateKey = (date) => {
  const d = date instanceof Date ? date : new Date(`${date}T12:00:00`);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const addDays = (date, amount) => {
  const next = new Date(`${dateKey(date)}T12:00:00`);
  next.setDate(next.getDate() + amount);
  return next;
};

export const calendarStateForDate = (date) => {
  const selected = dateKey(date);
  const anchor = new Date(`${selected}T12:00:00`);
  const weekday = anchor.getDay();
  return {
    selectedDate: selected,
    weekStart: addDays(anchor, weekday === 0 ? -6 : 1 - weekday),
  };
};

export const navigateCalendar = (viewMode, selectedDate, direction, now = new Date()) => {
  if (direction === 0) return calendarStateForDate(now);
  const anchor = new Date(`${selectedDate}T12:00:00`);
  if (viewMode === "month") anchor.setMonth(anchor.getMonth() + direction);
  else anchor.setDate(anchor.getDate() + direction * (viewMode === "week" ? 7 : 1));
  return calendarStateForDate(anchor);
};

export const calendarPeriodLabel = (viewMode, selectedDate, weekStart) => {
  const selected = new Date(`${selectedDate}T12:00:00`);
  if (viewMode === "month") return selected.toLocaleDateString("uk-UA", { month: "long", year: "numeric" });
  if (viewMode === "day") return selected.toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const start = new Date(weekStart);
  return `${dateKey(start)} — ${dateKey(addDays(start, 6))}`;
};

export const navigationLabels = (viewMode) => {
  const unit = viewMode === "month" ? "місяць" : viewMode === "day" ? "день" : "тиждень";
  return { previous: `Попередній ${unit}`, next: `Наступний ${unit}` };
};

const present = (label, value) => value !== undefined && value !== null && String(value).trim() && String(value).trim() !== "—"
  ? { label, value: String(value).trim() }
  : null;

export const buildEventDetails = (event = {}) => {
  const type = event.eventType || event.type || (event.kind === "group" ? "group_lesson" : "custom_admin_event");
  const common = [present("Зала", event.roomName), present("Дата", event.date), present("Час", event.startTime && event.endTime ? `${event.startTime}–${event.endTime}` : event.startTime)];
  const byType = {
    group_lesson: [present("Група", event.groupName || event.title), present("Напрям", event.direction), present("Тренер", event.trainer || event.trainerName)],
    individual_training: [present("Клієнт / назва", event.title), present("Тренер", event.trainer || event.trainerName), present("Кількість людей", event.peopleCount), present("Примітка", event.note || event.description)],
    room_booking: [present("Назва / клієнт", event.title), present("Кількість людей", event.peopleCount), present("Ціна", event.price), present("Спосіб оплати", event.paymentMethod), present("Примітка", event.note || event.description)],
    cleaning: [present("Примітка", event.note || event.description)],
    custom_admin_event: [present("Назва", event.title), present("Тренер", event.trainer || event.trainerName), present("Кількість людей", event.peopleCount), present("Примітка", event.note || event.description)],
  };
  return [...(byType[type] || byType.custom_admin_event), ...common].filter(Boolean);
};

export const monthPreview = (events, limit = 3) => ({ visible: events.slice(0, limit), remaining: Math.max(0, events.length - limit) });

export const weekEventLayout = (events, maxColumns = 3) => events.map((event) => ({
  ...event,
  displayColumn: Math.min(event.colIndex || 0, maxColumns - 1),
  isOverflow: (event.colIndex || 0) >= maxColumns,
}));

export const recurringActionLabels = (recurring) => recurring
  ? ["Видалити лише цю подію", "Видалити всю серію", "Скасувати лише цю подію", "Скасувати всю серію"]
  : ["Видалити подію", "Скасувати подію"];
