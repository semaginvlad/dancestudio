// src/utils.js

export const DIRECTIONS = [
  { id: "latina", name: "Latina Solo", color: "#E84855" },
  { id: "bachata", name: "Bachata Lady Style", color: "#F9A03F" },
  { id: "heels", name: "High Heels", color: "#7B2D8E" },
  { id: "dancehall", name: "Dancehall Female", color: "#2ECC71" },
  { id: "kpop", name: "K-pop Cover Dance", color: "#3498DB" },
  { id: "jazzfunk", name: "Jazz Funk", color: "#E91E8C" },
];

export const WEEKDAYS = ["НД", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];
export const WEEKDAYS_FULL = ["Неділя", "Понеділок", "Вівторок", "Середа", "Четвер", "Пʼятниця", "Субота"];

export const PLAN_TYPES = [
  { id: "trial", name: "Пробне", trainings: 1, price: 150 },
  { id: "single", name: "Разове", trainings: 1, price: 300 },
  { id: "4pack", name: "Абонемент 4", trainings: 4, price: 1000 },
  { id: "8pack", name: "Абонемент 8", trainings: 8, price: 1500 },
  { id: "12pack", name: "Абонемент 12", trainings: 12, price: 1800 },
];

export const PAY_METHODS = [{ id: "card", name: "💳 Карта" }, { id: "cash", name: "💵 Готівка" }];

export const DEFAULT_GROUPS = [
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

export const toLocalISO = (dt) => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
export const toISO = (d) => { try { if (d instanceof Date) return toLocalISO(d); const dt = new Date(d+"T12:00:00"); return isNaN(dt)?toLocalISO(new Date()):toLocalISO(dt); } catch{return toLocalISO(new Date())} };
export const addMonth = (d) => { const dt = new Date(d+"T12:00:00"); dt.setMonth(dt.getMonth()+1); return toLocalISO(dt); };
export const today = () => toLocalISO(new Date());
export const fmt = (d) => { if(!d) return "—"; const dt=new Date(d+"T12:00:00"); return dt.toLocaleDateString("uk-UA",{day:"2-digit",month:"2-digit"}); };
export const daysLeft = (ed) => Math.ceil((new Date(ed+"T23:59:59")-new Date())/86400000);
export const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,7);

export function getSubStatus(sub) {
  if (!sub?.endDate) return "expired";
  if (sub.endDate < today()) return "expired";
  if ((sub.usedTrainings||0) >= (sub.totalTrainings||1)) return "expired";
  const dl = daysLeft(sub.endDate), tl = (sub.totalTrainings||1)-(sub.usedTrainings||0);
  if (dl <= 3 || tl <= 1) return "warning";
  return "active";
}

export const STATUS_LABELS = { active: "Активний", warning: "Закінчується", expired: "Протермінований" };
export const STATUS_COLORS = { active: "#2ECC71", warning: "#F9A03F", expired: "#E84855" };
