import React from "react";

const theme = {
  primary: "#5A81FA",
  secondary: "#2C3D8F",
  bg: "#F8F9FD",
  card: "#FFFFFF",
  input: "#F2F5FF",
  textMain: "#1F1F1F",
  textMuted: "#6A6E83",
  textLight: "#A8B1CE",
  border: "#C7D2E8",
  success: "#34C759",
  warning: "#FF9500",
  danger: "#FF453A",
  exhausted: "#A8B1CE",
  archive: "#E2E8F0"
};

const WEEKDAYS = ["НД", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];
const MONTHS = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", 
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"
];

const DIRECTIONS = [
  { id: "latina", name: "Latina Solo", color: "#FF453A" },
  { id: "bachata", name: "Bachata Lady Style", color: "#FF9500" },
  { id: "heels", name: "High Heels", color: "#AF52DE" },
  { id: "dancehall", name: "Dancehall Female", color: "#34C759" },
  { id: "kpop", name: "K-pop Cover Dance", color: theme.primary },
  { id: "jazzfunk", name: "Jazz Funk", color: "#FF2D55" },
];

const PLAN_TYPES = [
  { id: "trial", name: "Пробне", trainings: 1, price: 150 },
  { id: "single", name: "Разове", trainings: 1, price: 300 },
  { id: "4pack", name: "Абонемент 4", trainings: 4, price: 1000 },
  { id: "8pack", name: "Абонемент 8", trainings: 8, price: 1500 },
  { id: "12pack", name: "Абонемент 12", trainings: 12, price: 1800 },
];

const PAY_METHODS = [
  { id: "card", name: "💳 Карта" }, 
  { id: "cash", name: "💵 Готівка" }
];

const DEFAULT_GROUPS = [
  { id: "lat-base-am", name: "Latin base (ранкова)", directionId: "latina", schedule: [{ day: 2, time: "09:50" }, { day: 4, time: "09:50" }], trainerPct: 50 },
  { id: "lat-base-pm", name: "Latin base (вечірня)", directionId: "latina", schedule: [{ day: 1, time: "16:50" }, { day: 5, time: "16:50" }], trainerPct: 50 },
  { id: "lat-mix-am", name: "Latin mix (ранкова)", directionId: "latina", schedule: [{ day: 1, time: "10:00" }, { day: 3, time: "10:00" }, { day: 5, time: "10:00" }], trainerPct: 50 },
  { id: "lat-mix-pm1", name: "Latin mix (вечірня 18:00)", directionId: "latina", schedule: [{ day: 1, time: "18:00" }, { day: 3, time: "18:00" }, { day: 5, time: "18:00" }], trainerPct: 50 },
  { id: "lat-mix-pm2", name: "Latin mix (вечірня 19:10)", directionId: "latina", schedule: [{ day: 1, time: "19:10" }, { day: 3, time: "19:10" }, { day: 5, time: "19:10" }], trainerPct: 50 },
  { id: "bach-base", name: "Bachata base", directionId: "bachata", schedule: [{ day: 2, time: "18:05" }, { day: 4, time: "18:05" }], trainerPct: 50 },
  { id: "bach-mix2", name: "Bachata mix 2", directionId: "bachata", schedule: [{ day: 2, time: "11:00" }, { day: 4, time: "11:00" }], trainerPct: 50 },
  { id: "bach-mix1", name: "Bachata mix 1", directionId: "bachata", schedule: [{ day: 1, time: "11:00" }, { day: 5, time: "11:00" }], trainerPct: 50 },
  { id: "heels-base", name: "High Heels base", directionId: "heels", schedule: [{ day: 2, time: "20:20" }, { day: 4, time: "20:20" }], trainerPct: 50 },
  { id: "heels-mix", name: "High Heels mix", directionId: "heels", schedule: [{ day: 2, time: "19:15" }, { day: 4, time: "19:15" }], trainerPct: 50 },
  { id: "kpop1", name: "K-pop Cover Dance", directionId: "kpop", schedule: [{ day: 6, time: "15:00" }, { day: 0, time: "15:00" }], trainerPct: 50 },
  { id: "jazz1", name: "Jazz Funk mix", directionId: "jazzfunk", schedule: [{ day: 6, time: "14:00" }, { day: 0, time: "14:00" }], trainerPct: 50 },
  { id: "dance1", name: "Dancehall Female", directionId: "dancehall", schedule: [{ day: 2, time: "17:00" }, { day: 4, time: "17:00" }], trainerPct: 50 },
];

const toLocalISO = (dt) => {
  if (isNaN(dt.getTime())) return "2000-01-01"; 
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
};

const addMonth = (d) => { 
  const dt = new Date(d+"T12:00:00"); 
  dt.setMonth(dt.getMonth()+1); 
  return toLocalISO(dt); 
};

const today = () => toLocalISO(new Date());

const fmt = (d) => { 
  if(!d || d === "2000-01-01") return "—"; 
  const dt = new Date(d+"T12:00:00"); 
  return dt.toLocaleDateString("uk-UA", {day:"2-digit", month:"2-digit"}); 
};

const daysLeft = (ed) => {
  if (!ed || ed === "2000-01-01") return 0;
  return Math.ceil((new Date(ed+"T23:59:59") - new Date()) / 86400000);
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);

function getDisplayName(st) {
  if (!st) return "Невідомо";
  const l = st.lastName || st.last_name || "";
  const f = st.firstName || st.first_name || "";
  if (l || f) return `${l} ${f}`.trim();
  return st.name || "Без імені";
}

function getSubStatus(sub) {
  if (!sub?.endDate) return "expired";
  if (sub.endDate < today()) return "expired";
  if ((sub.usedTrainings||0) >= (sub.totalTrainings||1)) return "expired";
  const dl = daysLeft(sub.endDate), tl = (sub.totalTrainings||1)-(sub.usedTrainings||0);
  if (dl <= 3 || tl <= 1) return "warning";
  return "active";
}

function getNextTrainingDate(schedule, afterDateStr) {
  if (!schedule || schedule.length === 0 || !afterDateStr) {
    const d = new Date((afterDateStr || today()) + "T12:00:00");
    d.setDate(d.getDate() + 7);
    return toLocalISO(d);
  }
  const targetDays = schedule.map(s => s.day);
  let d = new Date(afterDateStr + "T12:00:00");
  for (let i = 0; i < 14; i++) {
    d.setDate(d.getDate() + 1);
    if (targetDays.includes(d.getDay())) return toLocalISO(d);
  }
  return afterDateStr;
}

function getPreviousTrainingDate(schedule, beforeDateStr) {
  if (!schedule || schedule.length === 0 || !beforeDateStr) {
    const d = new Date((beforeDateStr || today()) + "T12:00:00");
    d.setDate(d.getDate() - 7);
    return toLocalISO(d);
  }
  const targetDays = schedule.map(s => s.day);
  let d = new Date(beforeDateStr + "T12:00:00");
  for (let i = 0; i < 14; i++) {
    d.setDate(d.getDate() - 1);
    if (targetDays.includes(d.getDay())) return toLocalISO(d);
  }
  return beforeDateStr;
}

function getNotifMsg(sub, student, group, direction){
  if (!student) return "Привіт! Абонемент закінчився.";
  const fName = student.firstName || student.first_name || student.name?.split(" ")[1] || student.name?.split(" ")[0] || ""; 
  const gName = group?.name || "";
  const dName = direction?.name || "";
  const tpl = student.messageTemplate || student.message_template;
  if(tpl) return tpl.replace(/\{ім'я\}/g, fName).replace(/\{група\}/g, gName).replace(/\{напрямок\}/g, dName);
  return `Привіт, ${fName}! 💃\nНагадуємо, що твій абонемент у групі ${gName} (${dName}) закінчився.\nЧекаємо на продовження! ❤️`;
}

const STATUS_LABELS = { active: "Активний", warning: "Закінчується", expired: "Протермінований" };
const STATUS_COLORS = { active: theme.success, warning: theme.warning, expired: theme.danger };

// ==========================================
// 2. ХУК ДЛЯ ЗБЕРЕЖЕННЯ В ЛОКАЛЬНІЙ ПАМ'ЯТІ

export {
  theme,
  WEEKDAYS,
  MONTHS,
  DIRECTIONS,
  PLAN_TYPES,
  PAY_METHODS,
  DEFAULT_GROUPS,
  inputSt,
  btnP,
  btnS,
  cardSt,
  STATUS_LABELS,
  STATUS_COLORS,
};
export const inputSt = {
  width: "100%",
  padding: "16px 20px",
  background: theme.input,
  border: `1px solid transparent`,
  borderRadius: 16,
  color: theme.textMain,
  fontSize: 14,
  fontWeight: 500,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
  transition: "0.2s"
};

export const btnP = {
  padding: "16px 28px",
  background: theme.primary,
  color: "#fff",
  border: "none",
  borderRadius: 100,
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
  boxShadow: `0 8px 24px ${theme.primary}40`
};

export const btnS = {
  padding: "16px 28px",
  background: theme.input,
  color: theme.textMuted,
  border: "none",
  borderRadius: 100,
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit"
};

export const cardSt = {
  background: theme.card,
  borderRadius: 24,
  padding: "24px",
  border: "none",
  boxShadow: "0 10px 40px rgba(168, 177, 206, 0.15)"
};
