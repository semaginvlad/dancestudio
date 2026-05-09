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

const STATUS_LABELS = {
  active: "Активний",
  warning: "Закінчується",
  expired: "Протермінований"
};

const STATUS_COLORS = {
  active: theme.success,
  warning: theme.warning,
  expired: theme.danger
};

const inputSt = {
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

const btnP = {
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

const btnS = {
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

const cardSt = {
  background: theme.card,
  borderRadius: 24,
  padding: "24px",
  border: "none",
  boxShadow: "0 10px 40px rgba(168, 177, 206, 0.15)"
};

const applyThemeBindings = () => {
  STATUS_COLORS.active = theme.success;
  STATUS_COLORS.warning = theme.warning;
  STATUS_COLORS.expired = theme.danger;

  const kpop = DIRECTIONS.find((d) => d.id === "kpop");
  if (kpop) kpop.color = theme.primary;

  inputSt.background = theme.input;
  inputSt.color = theme.textMain;

  btnP.background = theme.primary;
  btnP.boxShadow = `0 8px 24px ${theme.primary}40`;

  btnS.background = theme.input;
  btnS.color = theme.textMuted;

  cardSt.background = theme.card;
  cardSt.boxShadow = theme.bg === "#0F131A" ? "0 10px 40px rgba(0, 0, 0, 0.32)" : "0 10px 40px rgba(168, 177, 206, 0.15)";
};

applyThemeBindings();

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
  applyThemeBindings,
};
