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
  if (viewMode === "month") {
    const originalDay = anchor.getDate();
    const targetMonthIndex = anchor.getMonth() + direction;
    const targetYear = anchor.getFullYear() + Math.floor(targetMonthIndex / 12);
    const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
    const lastTargetDay = new Date(targetYear, targetMonth + 1, 0, 12).getDate();
    anchor.setFullYear(targetYear, targetMonth, Math.min(originalDay, lastTargetDay));
  } else anchor.setDate(anchor.getDate() + direction * (viewMode === "week" ? 7 : 1));
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
  const byType = {
    group_lesson: [present("Група", event.groupName || event.title), present("Напрям", event.direction), present("Тренер", event.trainer || event.trainerName)],
    individual_training: [present("Клієнт / назва", event.title), present("Тренер", event.trainer || event.trainerName), present("Кількість людей", event.peopleCount), present("Примітка", event.note || event.description)],
    room_booking: [present("Назва / клієнт", event.title), present("Кількість людей", event.peopleCount), present("Ціна", event.price), present("Спосіб оплати", event.paymentMethod), present("Примітка", event.note || event.description)],
    cleaning: [present("Примітка", event.note || event.description)],
    custom_admin_event: [present("Назва", event.title), present("Тренер", event.trainer || event.trainerName), present("Кількість людей", event.peopleCount), present("Примітка", event.note || event.description)],
  };
  return (byType[type] || byType.custom_admin_event).filter(Boolean);
};

export const monthPreview = (events, limit = 3) => ({ visible: events.slice(0, limit), remaining: Math.max(0, events.length - limit) });

export const weekEventLayout = (events) => {
  const compareEvents = (a, b) =>
    Number(a.startMin) - Number(b.startMin) ||
    Number(a.endMin) - Number(b.endMin) ||
    String(a.title || "").localeCompare(String(b.title || ""), "uk") ||
    String(a.id || "").localeCompare(String(b.id || ""));
  const sorted = [...events].sort(compareEvents);
  const clusters = [];
  sorted.forEach((event) => {
    const start = Number(event.startMin);
    const end = Number(event.endMin);
    const current = clusters.at(-1);
    // Strict comparison intentionally keeps adjacent intervals in separate clusters.
    if (!current || start >= current.endMin) {
      clusters.push({ startMin: start, endMin: end, events: [event] });
      return;
    }
    current.events.push(event);
    current.endMin = Math.max(current.endMin, end);
  });
  const clusterByEvent = new Map();
  clusters.forEach((cluster) => cluster.events.forEach((event) => clusterByEvent.set(event, cluster)));
  return events.map((event) => {
    const cluster = clusterByEvent.get(event) || { startMin: Number(event.startMin), endMin: Number(event.endMin), events: [event] };
    return {
      ...event,
      timeCoordinate: cluster.startMin,
      clusterStartMin: cluster.startMin,
      clusterEndMin: cluster.endMin,
      simultaneous: cluster.events,
      isRepresentative: cluster.events[0] === event,
      overflowCount: Math.max(0, cluster.events.length - 1),
    };
  });
};

export const collisionTilePreview = (events, { availableHeightPx = 42, isMobile = false } = {}) => {
  const columns = isMobile ? 2 : events.length >= 8 ? 3 : 2;
  const usableHeight = Math.max(0, Number(availableHeightPx) - 6);
  const rows = Math.floor(usableHeight / 18);
  const capacity = rows > 0 ? columns * rows : 1;
  const visibleCount = events.length > capacity ? capacity - 1 : Math.min(events.length, capacity);
  return {
    columns,
    visible: events.slice(0, visibleCount),
    overflow: Math.max(0, events.length - visibleCount),
  };
};

export const collisionClusterGeometry = (startMin, endMin, weekHourPx, dayStartHour = 8) => ({
  top: ((Number(startMin) - dayStartHour * 60) / 60) * Number(weekHourPx),
  height: Math.max(0, ((Number(endMin) - Number(startMin)) / 60) * Number(weekHourPx)),
});

export const EVENT_STATUS_STYLES = {
  active: { opacity: 1, text: "Активно" },
  tentative: { opacity: 0.65, text: "Попередньо" },
  cancelled: { opacity: 0.45, text: "Скасовано", textDecoration: "line-through" },
};

export const collisionStatusPresentation = (status) => {
  const normalized = EVENT_STATUS_STYLES[status] ? status : "active";
  return { status: normalized, ...EVENT_STATUS_STYLES[normalized], showLabel: normalized !== "active" };
};

export const isEventCardKeyboardActivation = (event) =>
  event?.target === event?.currentTarget && (event?.key === "Enter" || event?.key === " ");

export const requireScheduleSaveResult = (result, message = "Зміни не були збережені") => {
  if (result === null || result === undefined || result === false) throw new Error(message);
  return result;
};

export const canEditCollisionEvent = (event, { canMutateEvent, canEditGroupLesson } = {}) =>
  event?.kind === "booking"
    ? Boolean(canMutateEvent?.(event))
    : Boolean(canEditGroupLesson?.(event));

export const recurringActionLabels = (recurring) => recurring
  ? ["Видалити лише цю подію", "Видалити всю серію", "Скасувати лише цю подію", "Скасувати всю серію"]
  : ["Видалити подію", "Скасувати подію"];
