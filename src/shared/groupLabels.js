import { WEEKDAYS } from "./constants";

const parseSchedule = (schedule) => {
  if (Array.isArray(schedule)) return schedule;
  if (typeof schedule !== "string") return [];
  try {
    const parsed = JSON.parse(schedule);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const getGroupLevelLabel = (level) => {
  const value = String(level || "").trim().toLowerCase();
  if (value === "base") return "BASE";
  if (value === "mix") return "MIX";
  return value ? value.toLocaleUpperCase("uk-UA") : "";
};

export const getGroupAgeCategoryLabel = (ageCategory) => {
  const value = String(ageCategory || "").trim();
  if (value === "teens_under_16") return "10–16";
  if (value === "adults_16_plus") return "16+";
  return value;
};

export const formatGroupScheduleLabel = (schedule) => {
  const groupedByTime = new Map();
  parseSchedule(schedule).forEach((slot) => {
    const time = String(slot?.time || "").trim();
    if (!time) return;
    const day = WEEKDAYS[Number(slot?.day)] || "?";
    const days = groupedByTime.get(time) || [];
    days.push(day);
    groupedByTime.set(time, days);
  });
  return Array.from(groupedByTime, ([time, days]) => `[${days.map((day) => String(day).toLocaleLowerCase("uk-UA")).join("·")}] ${time}`).join(" · ");
};

export const getInternalGroupLabel = (group = {}) => {
  const name = String(group.name || group.title || group.id || "Група").trim();
  const level = getGroupLevelLabel(group.publicLevel ?? group.public_level);
  const ageCategory = getGroupAgeCategoryLabel(group.ageCategory ?? group.age_category);
  const schedule = formatGroupScheduleLabel(group.schedule);
  return [name, level, ageCategory, schedule].filter(Boolean).join(" · ");
};
