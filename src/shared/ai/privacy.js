export const AI_DATA_POLICY = Object.freeze({
  pii: "minimized",
  rawMessages: false,
  rawPrivateNotes: false,
  rawPaymentRows: false,
  excludedFields: Object.freeze([
    "phone",
    "telegram",
    "instagram",
    "instagramHandle",
    "instagram_handle",
    "contact",
    "notes",
    "note",
    "messageTemplate",
    "message_template",
    "internalNote",
    "internal_note",
    "chatId",
    "chat_id",
    "text",
    "message",
  ]),
  laterPhaseContexts: Object.freeze(["messages", "instagram"]),
});

export const asArray = (value) => (Array.isArray(value) ? value : []);

export const toId = (value) => (value == null ? "" : String(value));

export const getGroupId = (row = {}) => row.groupId ?? row.group_id ?? row.group?.id ?? "";

export const getStudentId = (row = {}) => row.studentId ?? row.student_id ?? row.student?.id ?? "";

export const getTrainerId = (row = {}) => row.trainerId ?? row.trainer_id ?? row.trainer?.id ?? "";

export const getDateKey = (value) => String(value || "").slice(0, 10);

export const getRevenueDate = (sub = {}) => getDateKey(
  sub.activationDate
  || sub.activation_date
  || sub.startDate
  || sub.start_date
  || sub.created_at
);

export function getWeekKey(value) {
  const key = getDateKey(value);
  if (!key) return "unknown";
  const date = new Date(`${key}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "unknown";
  const start = new Date(date);
  start.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
}

export const getMonthKey = (value) => {
  const key = getDateKey(value);
  return key ? key.slice(0, 7) : "unknown";
};

export function pseudonymize(value, prefix = "student") {
  const raw = toId(value) || "unknown";
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) hash = ((hash << 5) - hash) + raw.charCodeAt(i);
  return `${prefix}_${Math.abs(hash).toString(36).slice(0, 6) || "0"}`;
}

export function safeName(entity = {}, fallback = "Unknown") {
  return String(entity.name || entity.title || entity.label || fallback).trim() || fallback;
}

export function countBy(rows = [], keyFn = () => "unknown") {
  return asArray(rows).reduce((acc, row) => {
    const key = String(keyFn(row) || "unknown");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

export function sumBy(rows = [], valueFn = () => 0) {
  return asArray(rows).reduce((sum, row) => sum + (Number(valueFn(row)) || 0), 0);
}

export function summarizeBy(rows = [], keyFn = () => "unknown", valueFn = () => 1) {
  return Object.entries(asArray(rows).reduce((acc, row) => {
    const key = String(keyFn(row) || "unknown");
    acc[key] = (acc[key] || 0) + (Number(valueFn(row)) || 0);
    return acc;
  }, {})).map(([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);
}
