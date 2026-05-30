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

export const getGroupId = (row = {}) => {
  const record = asPlainObject(row);
  return record.groupId ?? record.group_id ?? record.group?.id ?? null;
};

export const toCount = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

export const asArray = (value) => (Array.isArray(value) ? value : []);
