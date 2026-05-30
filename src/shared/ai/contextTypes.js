export const CRM_CONTEXT_TYPES = Object.freeze({
  GLOBAL: "global",
  DASHBOARD: "dashboard",
  ATTENDANCE: "attendance",
  PAYMENTS: "payments",
  STUDENTS: "students",
  GROUPS: "groups",
  TRAINERS: "trainers",
  FORECAST: "forecast",
});

export const CRM_CONTEXT_TYPE_LIST = Object.freeze(Object.values(CRM_CONTEXT_TYPES));

export const LATER_PHASE_CONTEXT_TYPES = Object.freeze({
  MESSAGES: "messages",
  INSTAGRAM: "instagram",
});

export const isCRMContextType = (type) => CRM_CONTEXT_TYPE_LIST.includes(type);
