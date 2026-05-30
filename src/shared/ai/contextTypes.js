export const AI_CONTEXT_TYPES = Object.freeze({
  global: "global",
  dashboard: "dashboard",
  attendance: "attendance",
  payments: "payments",
  students: "students",
  groups: "groups",
  trainers: "trainers",
  forecast: "forecast",
});

export const AI_CONTEXT_TYPE_VALUES = Object.freeze(Object.values(AI_CONTEXT_TYPES));

export const LATER_PHASE_CONTEXT_TYPES = Object.freeze({
  messages: "messages",
  instagram: "instagram",
});

export function normalizeContextType(contextType = AI_CONTEXT_TYPES.global) {
  const normalized = String(contextType || AI_CONTEXT_TYPES.global).trim().toLowerCase();
  return AI_CONTEXT_TYPE_VALUES.includes(normalized) ? normalized : AI_CONTEXT_TYPES.global;
}
