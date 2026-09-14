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
  const next = { ...slot, startTime: start, time: start, endTime: end };
  if (Object.prototype.hasOwnProperty.call(next, "start")) next.start = start;
  if (Object.prototype.hasOwnProperty.call(next, "end")) next.end = end;
  return next;
};

export const synchronizeGroupSchedule = (schedule) => parseGroupSchedule(schedule).map((slot) => (
  synchronizeScheduleSlotTime(slot, getScheduleSlotStartTime(slot))
));

// Existing schedules can contain conflicting legacy fields. Only an explicit
// schedule edit is allowed to include that column in a group details update.
export const withDirtyGroupSchedule = (payload, schedule, scheduleDirty) => (
  scheduleDirty ? { ...payload, schedule } : payload
);

export const getExplicitMergeSchedulePatch = (scheduleMode, schedule) => (
  scheduleMode && scheduleMode !== "keep_target_schedule" ? { schedule } : {}
);

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
