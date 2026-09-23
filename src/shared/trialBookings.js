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

const dateNumber = (value) => Number(String(value || "").slice(0, 10).replaceAll("-", "")) || 0;

export function getTrialCategory(booking, todayKey = localDateKey()) {
  const status = String(booking?.status || "new");
  if (HISTORY_TRIAL_STATUSES.includes(status)) return "history";
  if (!ACTIVE_TRIAL_STATUSES.includes(status)) return "history";
  const date = localDateKey(booking?.trialDate || booking?.trial_date || "");
  if (date < todayKey) return "overdue";
  if (date === todayKey) return "today";
  return "upcoming";
}

export function groupAndSortTrialBookings(bookings = [], todayKey = localDateKey()) {
  const grouped = Object.fromEntries(TRIAL_CATEGORIES.map((category) => [category, []]));
  bookings.forEach((booking, index) => grouped[getTrialCategory(booking, todayKey)].push({ booking, index }));
  const statusRank = { confirmed: 0, contacted: 1, new: 2 };
  TRIAL_CATEGORIES.forEach((category) => {
    grouped[category].sort((a, b) => {
      const aDate = dateNumber(a.booking.trialDate || a.booking.trial_date);
      const bDate = dateNumber(b.booking.trialDate || b.booking.trial_date);
      let result = 0;
      if (category === "today") result = (statusRank[a.booking.status] ?? 9) - (statusRank[b.booking.status] ?? 9);
      else if (category === "upcoming") result = aDate - bDate;
      else result = bDate - aDate;
      return result || a.index - b.index;
    });
    grouped[category] = grouped[category].map(({ booking }) => booking);
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
