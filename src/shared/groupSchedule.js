export const parseGroupSchedule = (schedule) => {
  if (Array.isArray(schedule)) return schedule;
  if (typeof schedule !== "string") return [];
  try {
    const parsed = JSON.parse(schedule);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// startTime is canonical; `time` remains a backwards-compatible fallback.
export const getScheduleSlotStartTime = (slot = {}) => {
  const explicit = String(slot.startTime ?? slot.start ?? "").trim();
  if (explicit) return explicit;
  return String(slot.time ?? "").trim().split(/\s*[-–—]\s*/, 1)[0] || "";
};

export const synchronizeScheduleSlotTime = (slot = {}, startTime, endTime) => {
  const start = String(startTime || "").trim();
  const end = String(endTime ?? slot.endTime ?? slot.end ?? "").trim();
  return { ...slot, startTime: start, time: end ? `${start}-${end}` : start };
};

export const synchronizeGroupSchedule = (schedule) => parseGroupSchedule(schedule).map((slot) => (
  synchronizeScheduleSlotTime(slot, getScheduleSlotStartTime(slot))
));

export const isArchivedGroup = (group = {}) => (
  !!(group.archivedAt ?? group.archived_at) || group.isActive === false ||
  group.is_active === false || group.active === false
);

export const splitPaymentGroups = (groups = [], subscriptions = []) => {
  const referencedIds = new Set(subscriptions.map((sub) => String(sub.groupId ?? sub.group_id ?? "")));
  return {
    current: groups.filter((group) => !isArchivedGroup(group)),
    historical: groups.filter((group) => isArchivedGroup(group) && referencedIds.has(String(group.id))),
  };
};
