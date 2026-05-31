const asPlainObject = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});

export const AI_PRIVACY_EXCLUDES = Object.freeze([
  "phones",
  "phone_numbers",
  "telegram",
  "telegram_handles",
  "instagram",
  "instagram_handles",
  "messages",
  "chat_messages",
  "raw_chats",
  "private_notes",
  "notes",
  "raw_payment_rows",
]);

export const AI_CONTEXT_DATA_POLICY = Object.freeze({
  pii: "minimized",
  mode: "aggregate-only",
  excludes: AI_PRIVACY_EXCLUDES,
  notes: "Only aggregate counts and non-sensitive labels are included. Phones, messengers, raw chats, private notes, and raw payment rows are excluded.",
});

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

export const toCount = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

export const asArray = (value) => (Array.isArray(value) ? value : []);
