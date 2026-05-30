const asPlainObject = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});

export const AI_PRIVACY_EXCLUDES = Object.freeze([
  "phones",
  "telegram_handles",
  "instagram_handles",
  "chat_messages",
  "raw_chats",
  "private_notes",
  "raw_payment_rows",
]);

export const AI_CONTEXT_DATA_POLICY = Object.freeze({
  pii: "minimized",
  mode: "aggregate-only",
  excludes: AI_PRIVACY_EXCLUDES,
});

export const asArray = (value) => (Array.isArray(value) ? value : []);

export const safeNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export const toCount = (value) => safeNumber(value, 0);

export const safeString = (value, fallback = "") => {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
};

export const getGroupId = (row = {}) => {
  const record = asPlainObject(row);
  return record.groupId ?? record.group_id ?? record.group?.id ?? null;
};

export const getStudentId = (row = {}) => {
  const record = asPlainObject(row);
  return record.studentId ?? record.student_id ?? record.student?.id ?? null;
};

export const getTrainerId = (row = {}) => {
  const record = asPlainObject(row);
  return record.trainerId ?? record.trainer_id ?? record.trainer?.id ?? null;
};

export const getDateKey = (value) => {
  const raw = value && typeof value === "object" && !(value instanceof Date)
    ? value.date ?? value.startDate ?? value.start_date ?? value.createdAt ?? value.created_at ?? value.trialDate ?? value.trial_date ?? value.endDate ?? value.end_date
    : value;
  if (!raw) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString().slice(0, 10);
  const text = String(raw).trim();
  if (!text) return null;
  const isoDate = text.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (isoDate) return isoDate;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

export const getMonthKey = (value) => {
  const dateKey = getDateKey(value);
  return dateKey ? dateKey.slice(0, 7) : null;
};

export const getWeekKey = (value) => {
  const dateKey = getDateKey(value);
  if (!dateKey) return null;
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
};

export const sumBy = (rows = [], valueGetter = (row) => row) => asArray(rows).reduce((sum, row) => {
  const value = typeof valueGetter === "function" ? valueGetter(row) : row?.[valueGetter];
  return sum + safeNumber(value);
}, 0);

export const countBy = (rows = [], keyGetter = (row) => row) => asArray(rows).reduce((acc, row) => {
  const key = typeof keyGetter === "function" ? keyGetter(row) : row?.[keyGetter];
  if (key === null || key === undefined || key === "") return acc;
  const safeKey = String(key);
  acc[safeKey] = (acc[safeKey] || 0) + 1;
  return acc;
}, {});

export const summarizeBy = (rows = [], keyGetter = (row) => row, valueGetter = () => 1) => {
  const summary = asArray(rows).reduce((acc, row) => {
    const key = typeof keyGetter === "function" ? keyGetter(row) : row?.[keyGetter];
    if (key === null || key === undefined || key === "") return acc;
    const safeKey = String(key);
    if (!acc[safeKey]) acc[safeKey] = { count: 0, total: 0 };
    acc[safeKey].count += 1;
    acc[safeKey].total += safeNumber(typeof valueGetter === "function" ? valueGetter(row) : row?.[valueGetter]);
    return acc;
  }, {});

  return Object.entries(summary).map(([key, value]) => ({ key, ...value }));
};

export const pseudonymizeStudentRef = (row = {}, prefix = "student") => {
  const id = getStudentId(row) ?? row?.id ?? safeString(row?.studentName || row?.name, "unknown");
  const token = safeString(id, "unknown");
  let hash = 0;
  for (let index = 0; index < token.length; index += 1) {
    hash = ((hash * 31) + token.charCodeAt(index)) % 100000;
  }
  return `${prefix}_${String(hash).padStart(5, "0")}`;
};
