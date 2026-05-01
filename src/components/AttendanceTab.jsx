// test preview deploy
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as db from "../db";
import {
  today,
  uid,
  getDisplayName,
  useStickyState,
  getEffectiveEndDate,
  isSubExhausted,
  getActiveSubOnDateForCoverage,
  getNextTrainingDate,
  getPreviousTrainingDate,
} from "../shared/utils";
import { theme } from "../shared/constants";

const MONTH_NAMES = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"
];

const WEEKDAYS_SHORT = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

const makeStyles = () => {
  const isDark = theme.bg === "#0F131A";
  const CELL_SIZE = 40;
  const matrixBase = isDark ? "#131b26" : theme.card;
  const matrixMuted = isDark ? "#101722" : theme.input;
  const matrixCancelled = isDark ? "#2a1b23" : "#ffe9e9";

  return ({
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "center",
    justifyContent: "space-between",
    padding: "15px 16px",
    border: `1px solid ${isDark ? "rgba(148,163,184,0.25)" : theme.border}`,
    borderRadius: 18,
    background: isDark ? "linear-gradient(180deg, rgba(26,36,50,0.96) 0%, rgba(18,26,38,0.96) 100%)" : "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.98) 100%)",
    boxShadow: theme.bg === "#0F131A" ? "0 12px 30px rgba(0,0,0,0.33)" : "0 10px 26px rgba(15, 23, 42, 0.08)",
    backdropFilter: "blur(6px)",
  },
  toolbarLeft: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
  },
  control: {
    height: 36,
    borderRadius: 12,
    border: `1px solid ${isDark ? "rgba(148,163,184,0.28)" : theme.border}`,
    padding: "0 12px",
    background: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.95)",
    fontSize: 14,
    color: theme.textMain,
    boxShadow: isDark ? "inset 0 1px 0 rgba(255,255,255,0.05)" : "inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 0 rgba(15,23,42,0.04)",
  },
  legend: {
    display: "flex",
    gap: 14,
    flexWrap: "wrap",
    fontSize: 13,
    color: theme.textMuted,
  },
  hint: {
    fontSize: 12,
    color: theme.textLight,
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  dot: (bg) => ({
    width: 12,
    height: 12,
    borderRadius: 4,
    background: bg,
    border: "1px solid rgba(0,0,0,0.08)",
  }),
  tableWrap: {
    overflowX: "auto",
    overflowY: "visible",
    border: `1px solid ${isDark ? "rgba(148,163,184,0.24)" : theme.border}`,
    borderRadius: 18,
    background: isDark ? "linear-gradient(180deg, rgba(21,30,43,0.98), rgba(16,23,34,0.98))" : "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.98))",
    position: "relative",
    boxShadow: theme.bg === "#0F131A" ? "0 18px 38px rgba(0,0,0,0.4)" : "0 14px 34px rgba(15, 23, 42, 0.1)",
    backdropFilter: "blur(7px)",
  },
  table: {
    borderCollapse: "separate",
    borderSpacing: "0 6px",
    minWidth: "100%",
  },
  thSticky: {
    position: "sticky",
    left: 0,
    zIndex: 4,
    background: theme.card,
    minWidth: 240,
    maxWidth: 240,
    width: 240,
    borderRight: `1px solid ${isDark ? "rgba(148,163,184,0.18)" : "rgba(148,163,184,0.24)"}`,
    boxShadow: `1px 0 0 ${isDark ? "rgba(148,163,184,0.18)" : "rgba(148,163,184,0.24)"}`,
  },
  headTop: {
    position: "sticky",
    top: 0,
    zIndex: 5,
    background: matrixMuted,
  },
  monthHead: (isCurrent) => ({
    textAlign: "center",
    fontWeight: 700,
    fontSize: isCurrent ? 14 : 13,
    color: isCurrent ? theme.textMain : theme.textMuted,
    borderBottom: isCurrent ? `2px solid ${theme.primary}` : `1px solid ${theme.border}`,
    borderRight: `1px solid ${isDark ? "rgba(148,163,184,0.2)" : "rgba(148,163,184,0.24)"}`,
    padding: "12px 7px 11px",
    background: isCurrent ? (isDark ? "#162742" : `${theme.primary}1A`) : matrixMuted,
    whiteSpace: "nowrap",
    letterSpacing: 0.2,
  }),
  studentHead: {
    padding: "11px 12px",
    textAlign: "left",
    fontWeight: 700,
    fontSize: 14,
    color: theme.textMain,
    borderBottom: `1px solid ${theme.border}`,
    background: matrixMuted,
  },
  dayHead: (isCancelled, isMutedMonth, isCurrentMonth) => ({
    minWidth: CELL_SIZE,
    maxWidth: CELL_SIZE,
    width: CELL_SIZE,
    textAlign: "center",
    verticalAlign: "top",
    borderRight: `1px solid ${isDark ? "rgba(148,163,184,0.16)" : "rgba(148,163,184,0.2)"}`,
    borderBottom: `1px solid ${isDark ? "rgba(148,163,184,0.16)" : "rgba(148,163,184,0.2)"}`,
    padding: "8px 3px",
    background: isCancelled
      ? matrixCancelled
      : isCurrentMonth
        ? matrixBase
        : isMutedMonth
          ? matrixMuted
          : matrixBase,
  }),
  dayNum: (isCurrentMonth, isMutedMonth) => ({
    fontSize: isCurrentMonth ? 16 : 14,
    fontWeight: 700,
    color: isCurrentMonth ? theme.textMain : (isMutedMonth ? theme.textLight : theme.textMuted),
    lineHeight: 1.1,
  }),
  dayName: (isCurrentMonth, isMutedMonth) => ({
    fontSize: 10,
    color: isCurrentMonth ? theme.textMuted : (isMutedMonth ? theme.textLight : theme.textMuted),
    marginTop: 2,
  }),
  cancelBtn: (isCancelled) => ({
    marginTop: 6,
    width: 21,
    height: 21,
    borderRadius: 999,
    border: "1px solid",
    borderColor: isCancelled ? "#10b981" : "#fca5a5",
    background: isCancelled ? (isDark ? "#123126" : "#ecfdf5") : matrixBase,
    color: isCancelled ? "#047857" : "#b91c1c",
    cursor: "pointer",
    fontSize: 12,
    lineHeight: "20px",
    padding: 0,
  }),
  rowHead: {
    position: "sticky",
    left: 0,
    zIndex: 3,
    background: matrixBase,
    borderRight: `1px solid ${isDark ? "rgba(148,163,184,0.18)" : "rgba(148,163,184,0.22)"}`,
    borderBottom: "none",
    borderTopLeftRadius: 15,
    borderBottomLeftRadius: 15,
    padding: "6px 10px",
    boxShadow: isDark ? "inset 0 1px 0 rgba(255,255,255,0.04)" : "inset 0 1px 0 rgba(255,255,255,0.95)",
  },
  profileCard: {
    borderRadius: 14,
    padding: "5px 8px",
    background: isDark ? "linear-gradient(180deg, rgba(148,163,184,0.14), rgba(148,163,184,0.06))" : "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.95))",
    border: `1px solid ${isDark ? "rgba(148,163,184,0.2)" : "rgba(148,163,184,0.25)"}`,
    boxShadow: isDark ? "0 6px 14px rgba(0,0,0,0.24)" : "0 4px 10px rgba(15,23,42,0.08)",
  },
  guestGroupCard: {
    background: isDark ? "linear-gradient(180deg, rgba(99,102,241,0.12), rgba(99,102,241,0.06))" : "linear-gradient(180deg, rgba(238,242,255,0.95), rgba(224,231,255,0.75))",
    border: `1px solid ${isDark ? "rgba(129,140,248,0.28)" : "rgba(129,140,248,0.3)"}`,
  },
  guestGroupBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: "none",
    background: "transparent",
    padding: 0,
    textAlign: "left",
    cursor: "pointer",
    color: theme.textMain,
  },
  guestGroupArrow: (open) => ({
    fontSize: 12,
    color: theme.textMuted,
    transform: open ? "rotate(90deg)" : "rotate(0deg)",
    transition: "transform 0.15s ease",
  }),
  guestChildRowHead: {
    paddingLeft: 18,
  },
  guestChildCard: {
    opacity: 0.96,
  },
  studentName: {
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: 0.1,
    color: theme.textMain,
  },
  studentNameRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  orderBtns: {
    display: "flex",
    gap: 6,
    alignItems: "center",
  },
  orderBtn: {
    width: 18,
    height: 18,
    borderRadius: 5,
    border: `1px solid ${theme.border}`,
    background: matrixBase,
    color: theme.textMuted,
    cursor: "pointer",
    padding: 0,
    lineHeight: "16px",
    fontSize: 11,
  },
  menuWrap: {
    position: "relative",
  },
  menuBtn: {
    width: 26,
    height: 26,
    borderRadius: 999,
    border: `1px solid ${theme.border}`,
    background: isDark ? "linear-gradient(180deg, rgba(148,163,184,0.16), rgba(148,163,184,0.07))" : "linear-gradient(180deg, rgba(148,163,184,0.2), rgba(148,163,184,0.08))",
    color: isDark ? "#d9e2ee" : "#334155",
    cursor: "pointer",
    padding: 0,
    lineHeight: "24px",
    fontSize: 14,
    fontWeight: 700,
    boxShadow: isDark ? "inset 0 1px 0 rgba(255,255,255,0.08), 0 6px 14px rgba(0,0,0,0.28)" : "inset 0 1px 0 rgba(255,255,255,0.7), 0 6px 14px rgba(15,23,42,0.12)",
  },
  menu: {
    position: "fixed",
    minWidth: 198,
    background: isDark ? "linear-gradient(180deg, rgba(22,31,45,0.98), rgba(14,21,32,0.98))" : "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.98))",
    border: `1px solid ${isDark ? "rgba(148,163,184,0.28)" : "rgba(148,163,184,0.35)"}`,
    borderRadius: 16,
    boxShadow: isDark ? "0 26px 52px rgba(0,0,0,0.56)" : "0 20px 42px rgba(15,23,42,0.22)",
    backdropFilter: "blur(9px)",
    zIndex: 20,
    padding: 7,
  },
  totalsHead: {
    minWidth: 150,
    maxWidth: 150,
    width: 150,
    fontWeight: 700,
    color: theme.textMuted,
    whiteSpace: "nowrap",
    fontSize: 12,
    padding: "8px 10px",
  },
  menuItem: {
    width: "100%",
    textAlign: "left",
    border: "none",
    background: "transparent",
    padding: "8px 10px",
    borderRadius: 11,
    fontSize: 12,
    fontWeight: 600,
    color: theme.textMain,
    cursor: "pointer",
    transition: "background 120ms ease, transform 120ms ease",
  },
  menuItemDisabled: {
    color: theme.textLight,
    cursor: "not-allowed",
    opacity: 0.85,
  },
  menuSection: {
    display: "grid",
    gap: 4,
    padding: 3,
    borderRadius: 12,
    background: isDark ? "rgba(148,163,184,0.06)" : "rgba(148,163,184,0.08)",
    marginBottom: 6,
  },
  menuDivider: {
    margin: "2px 1px 6px",
    borderTop: `1px solid ${isDark ? "rgba(148,163,184,0.24)" : "rgba(148,163,184,0.3)"}`,
  },
  notifyRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    fontSize: 12,
    color: theme.textMain,
    fontWeight: 600,
    userSelect: "none",
    borderRadius: 10,
    background: isDark ? "rgba(99,102,241,0.13)" : "rgba(99,102,241,0.1)",
  },
  notifyCheck: {
    width: 16,
    height: 16,
    cursor: "pointer",
    accentColor: theme.primary,
  },
  studentMeta: {
    fontSize: 10,
    fontWeight: 500,
    color: theme.textMuted,
    marginTop: 2,
    lineHeight: 1.15,
  },
  menuDanger: {
    background: isDark ? "rgba(185,28,28,0.2)" : "rgba(254,226,226,0.95)",
    color: isDark ? "#fecaca" : "#b91c1c",
    border: `1px solid ${isDark ? "rgba(248,113,113,0.35)" : "rgba(248,113,113,0.5)"}`,
  },
  cell: (isCancelled, isMutedMonth, isCurrentMonth) => ({
    width: CELL_SIZE,
    minWidth: CELL_SIZE,
    maxWidth: CELL_SIZE,
    height: CELL_SIZE,
    minHeight: CELL_SIZE,
    maxHeight: CELL_SIZE,
    textAlign: "center",
    verticalAlign: "middle",
    borderRight: `1px solid ${isDark ? "rgba(148,163,184,0.16)" : "rgba(148,163,184,0.2)"}`,
    borderBottom: `1px solid ${isDark ? "rgba(148,163,184,0.14)" : "rgba(148,163,184,0.18)"}`,
    background: isCancelled
      ? matrixCancelled
      : isCurrentMonth
        ? matrixBase
        : isMutedMonth
          ? matrixMuted
          : matrixBase,
    boxShadow: isDark ? "inset 0 1px 0 rgba(255,255,255,0.04)" : "inset 0 1px 0 rgba(255,255,255,0.85)",
  }),
  cellShell: {
    width: CELL_SIZE - 4,
    height: CELL_SIZE - 4,
    margin: "0 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    padding: 3,
    boxSizing: "border-box",
    background: isDark ? "rgba(148,163,184,0.09)" : "rgba(255,255,255,0.76)",
    border: `1px solid ${isDark ? "rgba(148,163,184,0.24)" : "rgba(148,163,184,0.28)"}`,
  },
  cellBtn: (bg, disabled, saving) => ({
    width: "100%",
    height: "100%",
    borderRadius: 8,
    border: bg === theme.card
      ? `1px solid ${isDark ? "rgba(148,163,184,0.5)" : "rgba(148,163,184,0.42)"}`
      : "1px solid rgba(0,0,0,0.1)",
    background: bg === theme.card ? (isDark ? "rgba(51,65,85,0.78)" : "rgba(248,250,252,0.98)") : bg,
    cursor: disabled || saving ? "not-allowed" : "pointer",
    opacity: disabled || saving ? 0.55 : 1,
    fontSize: 16,
    fontWeight: 700,
    color: bg === theme.card ? theme.textLight : "#fff",
    boxShadow: bg === theme.card
      ? `inset 0 1px 0 ${isDark ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.92)"}, inset 0 -1px 0 ${isDark ? "rgba(15,23,42,0.35)" : "rgba(148,163,184,0.24)"}, 0 1px 4px rgba(15,23,42,0.08)`
      : "inset 0 1px 0 rgba(255,255,255,0.28), 0 4px 10px rgba(15,23,42,0.2)",
    transform: saving ? "scale(0.97)" : "scale(1)",
  }),
  subPeriodCell: (tone, border, isStart, isEnd, isCancelled) => ({
    background: isCancelled ? (isDark ? "#311d23" : "#fef2f2") : tone,
    boxShadow: [
      `inset 0 1px 0 ${isDark ? "rgba(191,219,254,0.18)" : "rgba(37,99,235,0.12)"}`,
      `inset 0 -1px 0 ${isDark ? "rgba(191,219,254,0.14)" : "rgba(37,99,235,0.1)"}`,
      isStart ? `inset 5px 0 0 ${border}` : "",
      isEnd ? `inset -5px 0 0 ${border}` : "",
    ]
      .filter(Boolean)
      .join(", "),
  }),
  monthDivider: {
    borderRight: `2px solid ${theme.textLight}`,
  },
  totalsRow: {
    background: isDark ? "rgba(148,163,184,0.08)" : "rgba(148,163,184,0.09)",
    boxShadow: `inset 0 1px 0 ${theme.border}`,
  },
  emptyState: {
    padding: 18,
    border: `1px dashed ${theme.border}`,
    borderRadius: 12,
    background: matrixBase,
    color: theme.textMuted,
  },
});
};

const normalizeName = (s) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");

const parseSchedule = (schedule) => {
  if (Array.isArray(schedule)) return schedule;
  if (typeof schedule === "string") {
    try {
      const parsed = JSON.parse(schedule);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const ymd = (dateObj) => {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const monthStart = (monthStr) => {
  const [y, m] = monthStr.split("-").map(Number);
  return new Date(y, m - 1, 1);
};

const shiftMonth = (monthStr, delta) => {
  const dt = monthStart(monthStr);
  dt.setMonth(dt.getMonth() + delta);
  return ymd(new Date(dt.getFullYear(), dt.getMonth(), 1)).slice(0, 7);
};

const monthLabel = (monthStr) => {
  const [y, m] = monthStr.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
};

const buildThreeMonths = (centerMonth) => {
  return [
    shiftMonth(centerMonth, -1),
    centerMonth,
    shiftMonth(centerMonth, 1),
  ];
};

const getMonthDays = (monthStr) => {
  const [y, m] = monthStr.split("-").map(Number);
  const total = new Date(y, m, 0).getDate();
  const out = [];
  for (let i = 1; i <= total; i++) {
    out.push(`${monthStr}-${String(i).padStart(2, "0")}`);
  }
  return out;
};

const getDayOfWeek = (dateStr) => new Date(`${dateStr}T12:00:00`).getDay();
const toDateKey = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return ymd(value);
  return String(value).slice(0, 10);
};
const ANON_GUEST_PREFIX = "__anon_guest__:";
const isAnonymousGuestLabel = (value) => String(value || "").startsWith(ANON_GUEST_PREFIX);
const makeAnonymousGuestLabel = ({ groupId, dateStr }) =>
  `${ANON_GUEST_PREFIX}${String(groupId || "group")}:${String(dateStr || today())}:${uid().slice(0, 8)}`;
const fmtUaShortDate = (dateStr) => {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return dateStr;
  return `${d}.${m}`;
};

const getActiveSubOnDate = (subs, studentId, groupId, dateStr) =>
  getActiveSubOnDateForCoverage(subs, studentId, groupId, dateStr);
const PACK_PLAN_TYPES = new Set(["4pack", "8pack", "12pack"]);
const isPackSubscription = (sub) => PACK_PLAN_TYPES.has(String(sub?.planType || "").trim().toLowerCase());

const getStudentStatusText = (subs, studentId, groupId) => {
  const groupSubs = subs
    .filter((s) => s.studentId === studentId && s.groupId === groupId)
    .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
  if (!groupSubs.length) return { text: "Без абонемента", tone: "neutral" };

  const todayStr = today();
  const tomorrow = new Date(`${todayStr}T12:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = ymd(tomorrow);

  const activeNow = getActiveSubOnDate(groupSubs, studentId, groupId, todayStr);
  const latestAvailable = [...groupSubs]
    .filter((s) => (s.usedTrainings || 0) < (s.totalTrainings || 0) && !isSubExhausted(s))
    .sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""))[0];
  const latest = [...groupSubs].sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""))[0];
  const sub = activeNow || latestAvailable || latest;
  if (!sub) return { text: "Абонементів немає", tone: "neutral" };

  const total = sub.totalTrainings || 0;
  const used = sub.usedTrainings || 0;
  const left = Math.max(0, total - used);
  const start = sub.activationDate || sub.startDate || "";
  const end = getEffectiveEndDate(sub) || sub.endDate || "";
  const isDanger = left <= 0 || (end && end < todayStr);
  const isWarning = !isDanger && (left <= 1 || end === todayStr || end === tomorrowStr);

  return {
    tone: isDanger ? "danger" : (isWarning ? "warning" : "neutral"),
    text: `${left}/${total}  •  ${fmtUaShortDate(start)}–${fmtUaShortDate(end)}`,
  };
};

export default function AttendanceTab({
  groups,
  rawSubs,
  subs,
  setSubs,
  attn,
  setAttn,
  students,
  setStudents,
  studentMap,
  studentGrps,
  setStudentGrps,
  cancelled,
  setCancelled,
  customOrders,
  onActionAddSub,
  onActionEditSub,
  onActionEditStudent,
  onActionMessageStudent,
  warnedStudents,
  setWarnedStudents,
}) {
  const styles = useMemo(
    () => makeStyles(),
    [theme.bg, theme.card, theme.input, theme.border, theme.textMain, theme.textMuted, theme.textLight, theme.primary]
  );
  const [gid, setGid] = useStickyState("", "ds_attn_gid_v2");
  const [centerMonth, setCenterMonth] = useState(today().slice(0, 7));
  const [entryMode, setEntryMode] = useState("auto");
  const [busyCell, setBusyCell] = useState("");
  const [busyCancelDate, setBusyCancelDate] = useState("");
  const [newStudentName, setNewStudentName] = useState("");
  const [addMode, setAddMode] = useState("student");
  const [guestNameInput, setGuestNameInput] = useState("");
  const [guestEntryType, setGuestEntryType] = useState("trial");
  const [creatingGuest, setCreatingGuest] = useState(false);
  const [guestRosterByGroup, setGuestRosterByGroup] = useStickyState({}, "ds_attn_guest_roster_v1");
  const [creatingStudent, setCreatingStudent] = useState(false);
  const [guestGroupExpandedByGroup, setGuestGroupExpandedByGroup] = useState({});
  const [localOrders, setLocalOrders] = useStickyState({}, "ds_attn_local_order_v1");
  const [openMenuState, setOpenMenuState] = useState(null);
  const menuPopupRef = useRef(null);

  useEffect(() => {
    if (!openMenuState) return;
    const onDocClick = (e) => {
      if (menuPopupRef.current?.contains(e.target)) return;
      if (e.target?.closest?.("[data-attn-menu-btn='1']")) return;
      setOpenMenuState(null);
    };
    const onViewportChange = () => setOpenMenuState(null);
    document.addEventListener("click", onDocClick);
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("resize", onViewportChange);
    return () => {
      document.removeEventListener("click", onDocClick);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("resize", onViewportChange);
    };
  }, [openMenuState]);

  useEffect(() => {
    if (!groups?.length) return;
    if (!gid || !groups.some((g) => g.id === gid)) {
      setGid(groups[0].id);
    }
  }, [groups, gid, setGid]);

  const currentGroup = useMemo(
    () => groups.find((g) => g.id === gid) || null,
    [groups, gid]
  );
  const subsForAttendanceSemantics = useMemo(
    () => subs.filter((s) => isPackSubscription(s)),
    [subs]
  );

  const currentDirectionId = currentGroup?.directionId || null;
  const schedule = useMemo(
    () => parseSchedule(currentGroup?.schedule),
    [currentGroup]
  );

  const scheduleDays = useMemo(
    () => schedule.map((s) => s.day).filter((d) => typeof d === "number"),
    [schedule]
  );

  const months = useMemo(() => buildThreeMonths(centerMonth), [centerMonth]);

  const visibleDays = useMemo(() => {
    const all = months.flatMap(getMonthDays);
    if (!scheduleDays.length) return all;
    return all.filter((d) => scheduleDays.includes(getDayOfWeek(d)));
  }, [months, scheduleDays]);

  const monthSpans = useMemo(() => {
    return months.map((month) => ({
      month,
      label: monthLabel(month),
      span: visibleDays.filter((d) => d.startsWith(month)).length,
    }));
  }, [months, visibleDays]);

  const visibleDayIndex = useMemo(() => {
    const map = {};
    visibleDays.forEach((d, idx) => {
      map[d] = idx;
});
    return map;
  }, [visibleDays]);

  const studentIdsInGroup = useMemo(() => {
    const fromLinks = studentGrps
      .filter((sg) => sg.groupId === gid)
      .map((sg) => sg.studentId);

    const fromSubs = rawSubs
      .filter((s) => s.groupId === gid)
      .map((s) => s.studentId);

    if (fromLinks.length) return [...new Set(fromLinks)];
    return [...new Set(fromSubs)];
  }, [studentGrps, rawSubs, gid]);

  const orderedStudents = useMemo(() => {
    const list = studentIdsInGroup
      .map((id) => studentMap[id])
      .filter(Boolean);

    const savedOrder = localOrders?.[gid] || customOrders?.[gid] || [];
    const orderIndex = new Map(savedOrder.map((id, idx) => [id, idx]));

    return [...list].sort((a, b) => {
      const aIdx = orderIndex.has(a.id) ? orderIndex.get(a.id) : Number.MAX_SAFE_INTEGER;
      const bIdx = orderIndex.has(b.id) ? orderIndex.get(b.id) : Number.MAX_SAFE_INTEGER;
      if (aIdx !== bIdx) return aIdx - bIdx;
      return getDisplayName(a).localeCompare(getDisplayName(b), "uk");
    });
  }, [studentIdsInGroup, studentMap, customOrders, localOrders, gid]);

  const handleCreateStudentInGroup = async () => {
    const name = (newStudentName || "").trim();
    if (!gid) return;
    if (!name) {
      alert("Введи ім'я учениці.");
      return;
    }

    const duplicateInGroup = orderedStudents.some(
      (s) => normalizeName(getDisplayName(s)) === normalizeName(name)
    );
    if (duplicateInGroup) {
      alert("Учениця з таким ім'ям уже є в цій групі.");
      return;
    }

    setCreatingStudent(true);
    try {
      const createdStudent = await db.insertStudent({ name });
      const link = await db.addStudentGroup(createdStudent.id, gid);

      if (typeof setStudents === "function") {
        setStudents((prev) => [...(prev || []), createdStudent]);
      }
      if (typeof setStudentGrps === "function") {
        setStudentGrps((prev) => {
          const list = prev || [];
          if (list.some((sg) => sg.studentId === createdStudent.id && sg.groupId === gid)) return list;
          return [...list, link || { id: `sg_${uid()}`, studentId: createdStudent.id, groupId: gid }];
        });
      }
      setLocalOrders((prev) => {
        const arr = prev?.[gid] || customOrders?.[gid] || [];
        if (arr.includes(createdStudent.id)) return prev;
        return { ...(prev || {}), [gid]: [...arr, createdStudent.id] };
      });
      setNewStudentName("");
    } catch (err) {
      alert(err?.message || "Не вдалося створити ученицю.");
    } finally {
      setCreatingStudent(false);
    }
  };

  const moveStudent = (studentId, direction) => {
    setLocalOrders((prev) => {
      const idsInGroup = orderedStudents.map((s) => s.id);
      const base = ((prev?.[gid] || customOrders?.[gid] || [])).filter((id) => idsInGroup.includes(id));
      const full = [...base, ...idsInGroup.filter((id) => !base.includes(id))];
      const idx = full.indexOf(studentId);
      if (idx < 0) return prev;
      const nextIdx = direction === "up" ? idx - 1 : idx + 1;
      if (nextIdx < 0 || nextIdx >= full.length) return prev;
      const next = [...full];
      [next[idx], next[nextIdx]] = [next[nextIdx], next[idx]];
      return { ...(prev || {}), [gid]: next };
    });
  };

  const buildGuestAutoLabel = () => {
    const dateLabel = today();
    const sameDayCount = attn.filter((a) =>
      String(a.groupId) === String(gid) &&
      !a.studentId &&
      toDateKey(a.date) === dateLabel
    ).length;
    return `Гість ${dateLabel} #${sameDayCount + 1}`;
  };

  const handleCreateGuestAttendance = async () => {
    if (!gid) return;
    if (!guestEntryType || (guestEntryType !== "trial" && guestEntryType !== "single")) return;
    const trimmedName = (guestNameInput || "").trim();
    const guestLabel = trimmedName || makeAnonymousGuestLabel({ groupId: gid, dateStr: "pending" });
    setCreatingGuest(true);
    try {
      const row = { id: `g_${uid()}`, isGuest: true, guestName: guestLabel, attendanceIds: [], anonymous: isAnonymousGuestLabel(guestLabel), guestEntryType };
      setGuestRosterByGroup((prev) => ({ ...(prev || {}), [gid]: [...(prev?.[gid] || []), row] }));
      setGuestNameInput("");
    } finally {
      setCreatingGuest(false);
    }
  };

  const handleRemoveFromGroup = async (student) => {
    if (!gid || !student?.id) return;
    const ok = window.confirm(`Прибрати ${getDisplayName(student)} з групи "${currentGroup?.name || gid}"?`);
    if (!ok) return;
    try {
      await db.removeStudentGroup(student.id, gid);
      if (typeof setStudentGrps === "function") {
        setStudentGrps((prev) => prev.filter((sg) => !(sg.studentId === student.id && sg.groupId === gid)));
      }
      setLocalOrders((prev) => {
        const arr = prev?.[gid] || [];
        if (!arr.includes(student.id)) return prev;
        return { ...(prev || {}), [gid]: arr.filter((id) => id !== student.id) };
      });
    } catch (err) {
      alert(err?.message || "Не вдалося прибрати ученицю з групи");
    }
  };

  const handleAddSub = (student) => {
    if (typeof onActionAddSub === "function") {
      onActionAddSub(student.id, gid);
    }
    setOpenMenuState(null);
  };

  const handleEditStudent = (student) => {
    if (typeof onActionEditStudent === "function") {
      onActionEditStudent(student);
    } else {
      alert("Редагування учениці недоступне в цьому екрані");
    }
    setOpenMenuState(null);
  };

  const handleEditSub = (student) => {
    const activeSub = getActiveSubOnDate(subsForAttendanceSemantics, student.id, gid, today());
    const lastSub = [...subsForAttendanceSemantics]
      .filter((s) => s.studentId === student.id && s.groupId === gid)
      .sort((a, b) => {
        const aKey = a.activationDate || a.startDate || a.created_at || "";
        const bKey = b.activationDate || b.startDate || b.created_at || "";
        if (aKey !== bKey) return bKey.localeCompare(aKey);
        return (b.created_at || "").localeCompare(a.created_at || "");
      })[0];
    const targetSub = activeSub || lastSub;

    if (!targetSub) {
      alert("Абонемент не знайдено.");
      setOpenMenuState(null);
      return;
    }
    if (typeof onActionEditSub === "function") {
      onActionEditSub(targetSub);
    } else {
      alert("Редагування абонемента недоступне в цьому екрані");
    }
    setOpenMenuState(null);
  };

  const handleMessageStudent = (student) => {
    if (typeof onActionMessageStudent === "function") {
      onActionMessageStudent(student);
    }
    setOpenMenuState(null);
  };

  const handleConvertGuestToStudent = async (guestRow) => {
    if (!guestRow?.guestName || !gid) return;
    const defaultName = isAnonymousGuestLabel(guestRow.guestName) ? "Гість" : guestRow.guestName;
    const enteredName = window.prompt("Ім'я нової учениці", defaultName);
    if (enteredName == null) return;
    const name = enteredName.trim();
    if (!name) {
      alert("Вкажи ім'я учениці.");
      return;
    }
    try {
      const createdStudent = await db.insertStudent({ name });
      const link = await db.addStudentGroup(createdStudent.id, gid);
      const safeRowIds = Array.isArray(guestRow.attendanceIds) ? guestRow.attendanceIds.filter(Boolean) : [];
      if (!safeRowIds.length) {
        alert("Не знайдено записів гостя в поточному видимому періоді.");
        return;
      }
      const ok = window.confirm(`Перетворити гостя на ученицю і переприв'язати ${safeRowIds.length} запис(ів) тільки з поточного видимого періоду?`);
      if (!ok) return;
      await db.relinkGuestAttendanceToStudent({ groupId: gid, studentId: createdStudent.id, attendanceIds: safeRowIds });
      if (typeof setStudents === "function") {
        setStudents((prev) => [...(prev || []), createdStudent]);
      }
      if (typeof setStudentGrps === "function") {
        setStudentGrps((prev) => [...(prev || []), link || { id: `sg_${uid()}`, studentId: createdStudent.id, groupId: gid }]);
      }
      await reloadFromDb();
      setOpenMenuState(null);
    } catch (err) {
      alert(err?.message || "Не вдалося перетворити гостя на ученицю.");
    }
  };
  const handleRemoveGuestRosterRow = (guestRow) => {
    const hasAttendance = attn.some((a) => String(a.groupId) === String(gid) && !a.studentId && normalizeName(a.guestName) === normalizeName(guestRow.guestName));
    if (hasAttendance) {
      alert("Спочатку приберіть відмітки відвідувань цього гостя в таблиці.");
      return;
    }
    setGuestRosterByGroup((prev) => ({ ...(prev || {}), [gid]: (prev?.[gid] || []).filter((r) => r.id !== guestRow.id) }));
    setOpenMenuState(null);
  };

  const warnedKey = (studentId) => `${gid || "group"}:${studentId}`;

  const isWarned = (studentId) => !!warnedStudents?.[warnedKey(studentId)];

  const toggleWarned = async (studentId, checked) => {
    if (typeof setWarnedStudents !== "function") return;
    const key = warnedKey(studentId);
    setWarnedStudents((prev) => ({ ...(prev || {}), [key]: !!checked }));
    try {
      await db.upsertWarnedStudent(gid, studentId, checked);
    } catch (err) {
      setWarnedStudents((prev) => ({ ...(prev || {}), [key]: !checked }));
      alert(err?.message || "Не вдалося зберегти статус сповіщення");
    }
  };

  const openStudentMenu = (student, btnEl) => {
    const rect = btnEl.getBoundingClientRect();
    const menuWidth = 170;
    const menuHeight = 196;
    const margin = 8;

    let left = rect.right - menuWidth;
    if (left < margin) left = margin;
    if (left + menuWidth > window.innerWidth - margin) {
      left = window.innerWidth - menuWidth - margin;
    }

    let top = rect.bottom + 6;
    if (top + menuHeight > window.innerHeight - margin) {
      top = rect.top - menuHeight - 6;
    }
    if (top < margin) top = margin;

    setOpenMenuState({ studentId: student.id, top, left });
  };

  const subsById = useMemo(() => {
    const map = {};
    subs.forEach((s) => {
      map[s.id] = s;
    });
    return map;
  }, [subs]);

  const lastAttendanceBySub = useMemo(() => {
    const map = {};
    attn.forEach((a) => {
      if (!a.subId) return;
      if (!map[a.subId] || map[a.subId] < a.date) {
        map[a.subId] = a.date;
      }
    });
    return map;
  }, [attn]);

  const subPeriodsByStudent = useMemo(() => {
    const map = {};

    subsForAttendanceSemantics
      .filter((s) => s.groupId === gid)
      .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""))
      .forEach((s) => {
        const start = s.activationDate || s.startDate || "0000-00-00";
        const exhausted = (s.usedTrainings || 0) >= (s.totalTrainings || 0);
        const defaultEnd = getEffectiveEndDate(s) || s.endDate || "2099-12-31";
        const end = exhausted
          ? (lastAttendanceBySub[s.id] || defaultEnd)
          : defaultEnd;
        const completed = exhausted || end < today();

        if (!map[s.studentId]) map[s.studentId] = [];
        map[s.studentId].push({
          subId: s.id,
          start,
          end: end >= start ? end : start,
          completed,
        });
      });

    return map;
  }, [subsForAttendanceSemantics, gid, lastAttendanceBySub]);

  const getSubPeriodForCell = (studentId, dateStr) => {
    const periods = subPeriodsByStudent[studentId] || [];
    return periods.find((p) => p.start <= dateStr && p.end >= dateStr) || null;
  };

  const sameStudentByRecord = (record, student) => {
    if (record.studentId) {
      return String(record.studentId) === String(student.id);
    }
    if (record.subId) {
      const linkedSub = subsById[record.subId];
      return String(linkedSub?.studentId) === String(student.id);
    }
    const recName = normalizeName(record.guestName);
    const stName1 = normalizeName(getDisplayName(student));
    const stName2 = normalizeName(student.name);
    return !!recName && (recName === stName1 || recName === stName2);
  };

  const recordMatchesCell = (record, student, dateStr, groupId = gid) => {
    return (
      String(record.groupId) === String(groupId) &&
      toDateKey(record.date) === toDateKey(dateStr) &&
      sameStudentByRecord(record, student)
    );
  };

  const getRecordsForCell = (student, dateStr) => {
    return attn.filter((a) => recordMatchesCell(a, student, dateStr));
  };

  const getRecordForCell = (student, dateStr) => {
    const all = getRecordsForCell(student, dateStr);
    return all[0] || null;
  };

  const isCancelledDate = (dateStr) =>
    cancelled.some((c) => c.groupId === gid && c.date === dateStr);

  const hasAttendanceInDirection = (student) => {
    if (!currentDirectionId) return false;
    const directionGroupIds = new Set(
      groups
        .filter((g) => g.directionId === currentDirectionId)
        .map((g) => g.id)
    );

    return attn.some((a) => {
      if (!directionGroupIds.has(a.groupId)) return false;
      return sameStudentByRecord(a, student);
    });
  };

  const resolveNewEntry = (student, dateStr) => {
    if (entryMode === "subscription") {
      const activeSub = getActiveSubOnDate(subsForAttendanceSemantics, student.id, gid, dateStr);
      if (!activeSub) {
        throw new Error("На цю дату немає активного абонемента.");
      }
      return { entryType: "subscription", subId: activeSub.id };
    }

    if (entryMode === "single") {
      return { entryType: "single", subId: null };
    }

    if (entryMode === "trial") {
      if (hasAttendanceInDirection(student)) {
        throw new Error("Пробне заняття доступне тільки для нових учениць у цьому напрямку.");
      }
      return { entryType: "trial", subId: null };
    }

    if (entryMode === "debt") {
      const activeSub = getActiveSubOnDate(subsForAttendanceSemantics, student.id, gid, dateStr);
      if (activeSub) {
        throw new Error("У учениці є активний абонемент, борг ставити не можна.");
      }
      return { entryType: "debt", subId: null };
    }

    const activeSub = getActiveSubOnDate(subsForAttendanceSemantics, student.id, gid, dateStr);
    if (activeSub) {
      return { entryType: "subscription", subId: activeSub.id };
    }

    if (!hasAttendanceInDirection(student)) {
      return { entryType: "trial", subId: null };
    }

    return { entryType: "single", subId: null };
  };

  const reloadFromDb = async () => {
    const [freshAttn, freshSubs, freshCancelled] = await Promise.all([
      db.fetchAttendance(),
      db.fetchSubs(),
      db.fetchCancelled(),
    ]);
    setAttn(freshAttn);
    setSubs(freshSubs);
    setCancelled(freshCancelled);
    return { freshAttn, freshSubs, freshCancelled };
  };

  const handleToggleCell = async (student, dateStr) => {
    if (!gid) return;
    if (isCancelledDate(dateStr)) return;

    const cellKey = `${student.id}_${dateStr}`;
    setBusyCell(cellKey);

    try {
      const existing = getRecordsForCell(student, dateStr);

      if (existing.length) {
        if (existing.length === 1 && (existing[0].quantity || 1) === 1) {
          const rec = existing[0];
          await db.deleteAttendance(rec.id);
          await db.insertAttendance({
            id: `tmp_${uid()}`,
            subId: rec.subId,
            studentId: student.id,
            date: dateStr,
            guestName: rec.guestName || student.name || getDisplayName(student),
            guestType: rec.guestType || rec.entryType || "subscription",
            groupId: gid,
            quantity: 2,
            entryType: rec.entryType || rec.guestType || "subscription",
          });
          if (rec.subId) {
            await db.syncSubUsedTrainings(rec.subId);
          }
          await reloadFromDb();
          return;
        }

        const subIdsToSync = [...new Set(existing.map((rec) => rec.subId).filter(Boolean))];
        for (const rec of existing) {
          if (rec.id) {
            await db.deleteAttendance(rec.id);
          }
        }
        for (const subId of subIdsToSync) {
          await db.syncSubUsedTrainings(subId);
        }
        await reloadFromDb();
        return;
      }

      const nextEntry = resolveNewEntry(student, dateStr);

      await db.insertAttendance({
        id: `tmp_${uid()}`,
        subId: nextEntry.subId,
        studentId: student.id,
        date: dateStr,
        guestName: student.name || getDisplayName(student),
        guestType: nextEntry.entryType,
        groupId: gid,
        quantity: 1,
        entryType: nextEntry.entryType,
      });

      if (nextEntry.subId) {
        await db.syncSubUsedTrainings(nextEntry.subId);
      }
      await reloadFromDb();
    } catch (err) {
      const msg = err?.message || "Невідома помилка";
      if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
        try {
          const { freshAttn } = await reloadFromDb();
          const existsAfterReload = freshAttn.some((a) => recordMatchesCell(a, student, dateStr));
          if (!existsAfterReload) {
            alert("Не вдалося додати відвідування. Спробуй ще раз.");
          }
        } catch {
          alert("Запис уже є в базі.");
        }
      } else {
        alert(msg);
      }
    } finally {
      setBusyCell("");
    }
  };

  const handleToggleCancelled = async (dateStr) => {
    if (!gid || !currentGroup) return;

    setBusyCancelDate(dateStr);
    try {
      const existing = cancelled.find((c) => c.groupId === gid && c.date === dateStr);

      if (!existing) {
        const ok = window.confirm(`Скасувати тренування ${dateStr}?`);
        if (!ok) return;

        const affected = rawSubs.filter((s) => {
          if (!isPackSubscription(s)) return false;
          if (s.groupId !== gid) return false;
          const end = getEffectiveEndDate(s) || s.endDate || "2099-12-31";
          return (s.startDate || "0000-00-00") <= dateStr && end >= dateStr;
        });

        const originalEnds = [];

        for (const sub of affected) {
          const oldEndDate = sub.endDate;
          const newEnd = getNextTrainingDate(schedule, oldEndDate);
          await db.updateSub(sub.id, { endDate: newEnd });
          originalEnds.push({
            subId: sub.id,
            oldEndDate,
            newEndDate: newEnd,
          });
        }

        await db.insertCancelled({
          id: uid(),
          groupId: gid,
          date: dateStr,
          originalEnds,
        });

        await reloadFromDb();
        return;
      }

      const ok = window.confirm(`Відновити тренування ${dateStr}?`);
      if (!ok) return;

      const originalEnds = existing.originalEnds;
      const hasNewFormat = Array.isArray(originalEnds) && originalEnds.length > 0;
      const hasLegacyFormat = !hasNewFormat && originalEnds && Object.keys(originalEnds).length;

      if (hasNewFormat) {
        for (const item of originalEnds) {
          if (!item?.subId) continue;
          await db.updateSub(item.subId, { endDate: item.oldEndDate || null });
        }
      } else if (hasLegacyFormat) {
        for (const [subId, oldEnd] of Object.entries(originalEnds)) {
          await db.updateSub(subId, { endDate: oldEnd });
        }
      } else {
        const affected = rawSubs.filter((s) => isPackSubscription(s) && s.groupId === gid && (s.endDate || "") >= dateStr);
        for (const sub of affected) {
          const reverted = getPreviousTrainingDate(schedule, sub.endDate);
          await db.updateSub(sub.id, { endDate: reverted });
        }
      }

      await db.deleteCancelled(existing.id);
      await reloadFromDb();
    } catch (err) {
      alert(err?.message || "Не вдалося змінити статус тренування");
    } finally {
      setBusyCancelDate("");
    }
  };

  const handleToggleGuestCell = async (guestRow, dateStr) => {
    if (!gid || isCancelledDate(dateStr)) return;
    let guestIdentity = String(guestRow?.guestName || "").trim();
    if (isAnonymousGuestLabel(guestIdentity) && guestIdentity.includes(":pending:")) {
      guestIdentity = makeAnonymousGuestLabel({ groupId: gid, dateStr });
      if (guestRow?.id) {
        setGuestRosterByGroup((prev) => ({
          ...(prev || {}),
          [gid]: (prev?.[gid] || []).map((r) => (r.id === guestRow.id ? { ...r, guestName: guestIdentity } : r)),
        }));
      }
    }
    if (!guestIdentity) return;
    const existingById = (guestRow.attendanceIds || [])
      .map((id) => attn.find((a) => a.id === id))
      .find((a) => a && toDateKey(a.date) === toDateKey(dateStr));
    const existingByName = attn.find((a) =>
      String(a.groupId) === String(gid) &&
      !a.studentId &&
      normalizeName(a.guestName) === normalizeName(guestIdentity) &&
      toDateKey(a.date) === toDateKey(dateStr)
    );
    const existing = existingById || existingByName || null;
    try {
      if (existing?.id) {
        await db.deleteAttendance(existing.id);
      } else {
        const entry = guestRow.guestEntryType || guestEntryType || "trial";
        await db.insertAttendance({ id: `tmp_${uid()}`, subId: null, studentId: null, date: dateStr, guestName: guestIdentity, guestType: entry, groupId: gid, quantity: 1, entryType: entry });
      }
      await reloadFromDb();
    } catch (err) {
      alert(err?.message || "Не вдалося змінити відвідування гостя.");
    }
  };

  const getCellView = (student, dateStr) => {
    const rec = getRecordForCell(student, dateStr);
    const isDark = theme.bg === "#0F131A";
    if (!rec) return { bg: isDark ? "#182230" : theme.card, mark: "" };

    const type = String(rec.entryType || rec.guestType || "subscription").trim().toLowerCase();
    const mark = (rec.quantity || 1) >= 2 ? "2" : "✓";
    if (type === "debt") return { bg: isDark ? "#7f1d1d" : "#dc2626", mark: "!" };
    if (type === "single") return { bg: isDark ? "#7a4313" : "#f59e0b", mark };
    if (type === "trial") return { bg: isDark ? "#0f5a43" : "#10b981", mark };
    return { bg: isDark ? "#1f3e79" : "#2563eb", mark };
  };

  const guestRows = useMemo(() => {
    const tempRows = guestRosterByGroup?.[gid] || [];
    const persistedRows = attn.filter((a) =>
      String(a.groupId) === String(gid) &&
      !a.studentId &&
      visibleDays.includes(toDateKey(a.date))
    );
    const merged = new Map();

    tempRows.forEach((r) => {
      const key = normalizeName(r.guestName) || `guest_${r.id}`;
      merged.set(key, { ...r, attendanceIds: Array.isArray(r.attendanceIds) ? [...r.attendanceIds] : [] });
    });

    persistedRows.forEach((r) => {
      const key = normalizeName(r.guestName) || `guest_${toDateKey(r.date)}`;
      const baseName = (r.guestName || "").trim() || `Гість ${toDateKey(r.date)}`;
      const existing = merged.get(key) || {
        id: `guest:${key}`,
        isGuest: true,
        guestName: baseName,
        anonymous: isAnonymousGuestLabel(baseName),
        attendanceIds: [],
        guestEntryType: String(r.entryType || r.guestType || "trial").toLowerCase() === "single" ? "single" : "trial",
      };
      if (r.id && !existing.attendanceIds.includes(r.id)) existing.attendanceIds.push(r.id);
      merged.set(key, existing);
    });

    return Array.from(merged.values());
  }, [guestRosterByGroup, gid, attn, visibleDays]);

  const groupedGuestRows = useMemo(
    () => guestRows.filter((r) => r.isGuest),
    [guestRows]
  );
  const guestGroupExpanded = !!guestGroupExpandedByGroup[String(gid)];
  const displayRows = useMemo(() => {
    const students = orderedStudents.map((s) => ({ ...s, isGuest: false }));
    if (!groupedGuestRows.length) return [...students];
    const parent = {
      id: `guest-group:${gid}`,
      isGuestGroup: true,
      isGuest: false,
      guestCount: groupedGuestRows.length,
    };
    const guestChildren = guestGroupExpanded
      ? groupedGuestRows.map((g) => ({ ...g, isGuestChild: true }))
      : [];
    return [...students, parent, ...guestChildren];
  }, [orderedStudents, groupedGuestRows, guestGroupExpanded, gid]);

  const groupStudentIdSet = useMemo(
    () => new Set(studentIdsInGroup.map((id) => String(id))),
    [studentIdsInGroup]
  );

  if (!groups?.length) {
    return <div style={styles.emptyState}>Немає груп.</div>;
  }

  if (!currentGroup) {
    return <div style={styles.emptyState}>Вибери групу.</div>;
  }

  const totalsByDate = visibleDays.reduce((acc, dateStr) => {
    if (isCancelledDate(dateStr)) {
      acc[dateStr] = { total: 0, removed: 0 };
      return acc;
    }

    const records = attn.filter(
      (a) => a.groupId === gid && toDateKey(a.date) === toDateKey(dateStr)
    );

    const total = records.reduce((sum, a) => sum + (a.quantity || 1), 0);
    const removed = records.reduce((sum, a) => {
      const resolvedStudentId = a.studentId || subsById[a.subId]?.studentId || null;
      if (!resolvedStudentId) return sum;
      if (groupStudentIdSet.has(String(resolvedStudentId))) return sum;
      return sum + (a.quantity || 1);
    }, 0);

    acc[dateStr] = { total, removed };
    return acc;
  }, {});

  return (
    <div style={styles.wrap}>
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          <select value={gid} onChange={(e) => setGid(e.target.value)} style={styles.control}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>

          <input
            type="month"
            value={centerMonth}
            onChange={(e) => setCenterMonth(e.target.value)}
            style={styles.control}
          />

          <select
            value={entryMode}
            onChange={(e) => setEntryMode(e.target.value)}
            style={styles.control}
          >
            <option value="auto">Авто</option>
            <option value="subscription">Абонемент</option>
            <option value="single">Разове</option>
            <option value="trial">Пробне</option>
            <option value="debt">Борг</option>
          </select>

        </div>

        <div style={styles.legend}>
          <div style={styles.legendItem}>
            <span style={styles.dot("#2563eb")} />
            <span>Абонемент</span>
          </div>
          <div style={styles.legendItem}>
            <span style={styles.dot("#f59e0b")} />
            <span>Разове</span>
          </div>
          <div style={styles.legendItem}>
            <span style={styles.dot("#10b981")} />
            <span>Пробне</span>
          </div>
          <div style={styles.legendItem}>
            <span style={styles.dot("#dc2626")} />
            <span>Борг</span>
          </div>
          <div style={styles.legendItem}>
            <span style={styles.dot("#fee2e2")} />
            <span>Скасоване</span>
          </div>
          <div style={styles.legendItem}>
            <span style={styles.dot("#eff6ff")} />
            <span>Період абонемента</span>
          </div>
          <div style={styles.legendItem}>
            <span style={styles.dot("#f3f4f6")} />
            <span>Завершений абонемент</span>
          </div>
          <div style={styles.hint}>✓ = 1 заняття, 2 = 2 заняття за день</div>
        </div>
      </div>

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ ...styles.thSticky, ...styles.headTop, ...styles.studentHead }}>
                Учениці
              </th>
              {monthSpans.map((m) => (
                <th
                  key={m.month}
                  colSpan={m.span}
                  style={{ ...styles.headTop, ...styles.monthHead(m.month === centerMonth) }}
                >
                  {m.label}
                </th>
              ))}
            </tr>

            <tr>
              <th style={{ ...styles.thSticky, ...styles.headTop, ...styles.studentHead }}>
                {currentGroup.name}
              </th>
              {visibleDays.map((dateStr) => {
                const cancelledDay = isCancelledDate(dateStr);
                const dow = getDayOfWeek(dateStr);
                const isBusy = busyCancelDate === dateStr;
                const monthKey = dateStr.slice(0, 7);
                const isCurrentMonth = monthKey === centerMonth;
                const isMutedMonth = monthKey !== centerMonth;
                const dayIdx = visibleDayIndex[dateStr];
                const nextDay = dayIdx < visibleDays.length - 1 ? visibleDays[dayIdx + 1] : null;
                const isMonthBoundary = !!nextDay && nextDay.slice(0, 7) !== dateStr.slice(0, 7);
                const headStyle = {
                  ...styles.headTop,
                  ...styles.dayHead(cancelledDay, isMutedMonth, isCurrentMonth),
                  ...(isMonthBoundary ? styles.monthDivider : {}),
                };

                return (
                  <th
                    key={dateStr}
                    style={headStyle}
                  >
                    <div style={styles.dayNum(isCurrentMonth, isMutedMonth)}>{dateStr.slice(8, 10)}</div>
                    <div style={styles.dayName(isCurrentMonth, isMutedMonth)}>{WEEKDAYS_SHORT[dow]}</div>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleToggleCancelled(dateStr)}
                      style={styles.cancelBtn(cancelledDay)}
                      title={cancelledDay ? "Відновити тренування" : "Скасувати тренування"}
                    >
                      {cancelledDay ? "↺" : "×"}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {displayRows.map((student, rowIndex) => {
              if (student.isGuestGroup) {
                return (
                  <tr key={student.id}>
                    <td style={styles.rowHead}>
                      <div style={{ ...styles.profileCard, ...styles.guestGroupCard }}>
                        <button
                          type="button"
                          onClick={() => setGuestGroupExpandedByGroup((prev) => ({ ...(prev || {}), [String(gid)]: !guestGroupExpanded }))}
                          style={styles.guestGroupBtn}
                        >
                          <span style={styles.guestGroupArrow(guestGroupExpanded)}>▸</span>
                          <span style={styles.studentName}>{`Гості (${student.guestCount})`}</span>
                        </button>
                        <div style={styles.studentMeta}>Тимчасові гості</div>
                      </div>
                    </td>
                    {visibleDays.map((dateStr) => {
                      const dayIdx = visibleDayIndex[dateStr];
                      const nextDay = dayIdx < visibleDays.length - 1 ? visibleDays[dayIdx + 1] : null;
                      const isMonthBoundary = !!nextDay && nextDay.slice(0, 7) !== dateStr.slice(0, 7);
                      const isLastDay = dayIdx === visibleDays.length - 1;
                      const cellStyle = {
                        ...styles.cell(isCancelledDate(dateStr), dateStr.slice(0, 7) !== centerMonth, dateStr.slice(0, 7) === centerMonth),
                        ...(isMonthBoundary ? styles.monthDivider : {}),
                      };
                      if (isLastDay) {
                        cellStyle.borderTopRightRadius = 15;
                        cellStyle.borderBottomRightRadius = 15;
                      }
                      return <td key={dateStr} style={cellStyle} />;
                    })}
                  </tr>
                );
              }
              if (student.isGuest) {
                return (
                  <tr key={student.id}>
                    <td style={{ ...styles.rowHead, ...(student.isGuestChild ? styles.guestChildRowHead : {}) }}>
                      <div style={{ ...styles.profileCard, ...(student.isGuestChild ? styles.guestChildCard : {}) }}>
                        <div style={styles.studentNameRow}>
                          <div style={styles.studentName}>{`${rowIndex + 1}. ${student.anonymous ? "Гість" : student.guestName}`}</div>
                          <div style={styles.menuWrap}>
                            <button type="button" style={styles.menuBtn} title="Дії" data-attn-menu-btn="1" onClick={(e) => { e.stopPropagation(); openStudentMenu(student, e.currentTarget); }}>⋮</button>
                          </div>
                        </div>
                        <div style={styles.studentMeta}>Тимчасовий гість (trial/single)</div>
                      </div>
                    </td>
                    {visibleDays.map((dateStr) => {
                      const dayIdx = visibleDayIndex[dateStr];
                      const nextDay = dayIdx < visibleDays.length - 1 ? visibleDays[dayIdx + 1] : null;
                      const isMonthBoundary = !!nextDay && nextDay.slice(0, 7) !== dateStr.slice(0, 7);
                      const isLastDay = dayIdx === visibleDays.length - 1;
                      const rec = attn.find((a) =>
                        String(a.groupId) === String(gid) &&
                        !a.studentId &&
                        normalizeName(a.guestName) === normalizeName(student.guestName) &&
                        toDateKey(a.date) === toDateKey(dateStr)
                      );
                      const t = String(rec?.entryType || rec?.guestType || "subscription").toLowerCase();
                      const mark = rec ? ((rec.quantity || 1) >= 2 ? "2" : "✓") : "";
                      const cellView = !rec
                        ? { bg: theme.bg === "#0F131A" ? "#182230" : theme.card, mark: "" }
                        : t === "debt"
                          ? { bg: theme.bg === "#0F131A" ? "#7f1d1d" : "#dc2626", mark: "!" }
                          : t === "single"
                            ? { bg: theme.bg === "#0F131A" ? "#7a4313" : "#f59e0b", mark }
                            : t === "trial"
                              ? { bg: theme.bg === "#0F131A" ? "#0f5a43" : "#10b981", mark }
                              : { bg: theme.bg === "#0F131A" ? "#1f3e79" : "#2563eb", mark };
                      return (
                        <td key={dateStr} style={{ ...styles.cell(isCancelledDate(dateStr), dateStr.slice(0, 7) !== centerMonth, dateStr.slice(0, 7) === centerMonth), ...(isMonthBoundary ? styles.monthDivider : {}), ...(isLastDay ? { borderTopRightRadius: 15, borderBottomRightRadius: 15 } : {}) }}>
                          <div style={styles.cellShell}><button type="button" onClick={() => handleToggleGuestCell(student, dateStr)} style={styles.cellBtn(cellView.bg, isCancelledDate(dateStr), false)}>{cellView.mark}</button></div>
                        </td>
                      );
                    })}
                  </tr>
                );
              }
              const statusInfo = getStudentStatusText(subsForAttendanceSemantics, student.id, gid);
              const hasPack = rawSubs.some((s) => s.groupId === gid && s.studentId === student.id && isPackSubscription(s));
              const oneOffHistory = rawSubs.some((s) => s.groupId === gid && s.studentId === student.id && ["trial", "single"].includes(String(s.planType || "").toLowerCase()))
                || attn.some((a) => String(a.groupId) === String(gid) && String(a.studentId) === String(student.id) && ["trial", "single"].includes(String(a.entryType || a.guestType || "").toLowerCase()));
              const hasNonOneOff = rawSubs.some((s) => s.groupId === gid && s.studentId === student.id && !["trial", "single"].includes(String(s.planType || "").toLowerCase()));
              const isOnlyOneOffNoPack = !hasPack && oneOffHistory && !hasNonOneOff;
              const warnedDone = isWarned(student.id);
              const isDark = theme.bg === "#0F131A";
              const metaColor = statusInfo.tone === "danger"
                ? (isDark
                    ? (warnedDone ? "#c7767f" : "#ff7b86")
                    : (warnedDone ? "#b06a6a" : "#c81e1e"))
                : statusInfo.tone === "warning"
                  ? (isDark ? (warnedDone ? "#c98a3a" : "#ffb24c") : "#d97706")
                  : styles.studentMeta.color;
              const rowHighlightStyle = statusInfo.tone === "danger"
                ? (isDark
                    ? (warnedDone
                        ? { background: "#3a171b", borderLeft: "3px solid #b24a54", boxShadow: "inset 0 1px 0 rgba(178,74,84,0.35)" }
                        : { background: "#5a161d", borderLeft: "3px solid #ef4444", boxShadow: "inset 0 1px 0 rgba(248,113,113,0.35)" })
                    : (warnedDone
                        ? { background: "#f7eeee", borderLeft: "3px solid #caa5a5" }
                        : { background: "#ffe2e2", borderLeft: "3px solid #dc2626", boxShadow: "inset 0 1px 0 #fecaca" }))
                : statusInfo.tone === "warning"
                  ? (isDark
                      ? (warnedDone
                          ? { background: "#3f2711", borderLeft: "3px solid #c27a1f", boxShadow: "inset 0 1px 0 rgba(194,122,31,0.35)" }
                          : { background: "#5a2f08", borderLeft: "3px solid #f59e0b", boxShadow: "inset 0 1px 0 rgba(251,191,36,0.35)" })
                      : { background: "#fff7ed", borderLeft: "3px solid #f59e0b" })
                  : (isOnlyOneOffNoPack ? (isDark ? { background: "#2b1f4a", borderLeft: "3px solid #a855f7" } : { background: "#f3e8ff", borderLeft: "3px solid #9333ea" }) : {});

              return (
              <tr key={student.id}>
                <td style={{ ...styles.rowHead, ...rowHighlightStyle }}>
                  <div style={styles.profileCard}>
                    <div style={styles.studentNameRow}>
                      <div style={styles.studentName}>{`${rowIndex + 1}. ${getDisplayName(student)}`}</div>
                      <div style={styles.orderBtns}>
                        <div style={styles.menuWrap}>
                        <button
                          type="button"
                          style={styles.menuBtn}
                          title="Дії"
                          data-attn-menu-btn="1"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (openMenuState?.studentId === student.id) {
                              setOpenMenuState(null);
                              return;
                            }
                            openStudentMenu(student, e.currentTarget);
                          }}
                        >
                          ⋮
                        </button>
                        </div>
                      </div>
                    </div>
                    <div style={{ ...styles.studentMeta, color: metaColor }}>
                      {statusInfo.text}
                    </div>
                  </div>
                </td>

                {visibleDays.map((dateStr) => {
                  const cancelledDay = isCancelledDate(dateStr);
                  const monthKey = dateStr.slice(0, 7);
                  const isCurrentMonth = monthKey === centerMonth;
                  const isMutedMonth = monthKey !== centerMonth;
                  const cellKey = `${student.id}_${dateStr}`;
                  const saving = busyCell === cellKey;
                  const cellView = getCellView(student, dateStr);
                  const subPeriod = getSubPeriodForCell(student.id, dateStr);
                  const dayIdx = visibleDayIndex[dateStr];
                  const prevDay = dayIdx > 0 ? visibleDays[dayIdx - 1] : null;
                  const nextDay = dayIdx < visibleDays.length - 1 ? visibleDays[dayIdx + 1] : null;
                  const isLastDay = dayIdx === visibleDays.length - 1;
                  const isStart = !!subPeriod && (!prevDay || prevDay < subPeriod.start);
                  const isEnd = !!subPeriod && (!nextDay || nextDay > subPeriod.end);
                  const isDark = theme.bg === "#0F131A";
                  const tone = subPeriod?.completed ? (isDark ? "#2b3647" : "#ecf1f5") : (isDark ? "#1d2f4e" : "#e0edff");
                  const border = subPeriod?.completed ? (isDark ? "#5f728d" : "#64748b") : (isDark ? "#3f6fc2" : "#2563eb");
                  const buttonBg = subPeriod?.completed && cellView.mark ? (isDark ? "#4b5b70" : "#9ca3af") : cellView.bg;
                  const isMonthBoundary = !!nextDay && nextDay.slice(0, 7) !== dateStr.slice(0, 7);
                  const cellStyle = subPeriod
                    ? {
                        ...styles.cell(cancelledDay, isMutedMonth, isCurrentMonth),
                        ...styles.subPeriodCell(tone, border, isStart, isEnd, cancelledDay),
                        ...(isMonthBoundary ? styles.monthDivider : {}),
                      }
                    : {
                        ...styles.cell(cancelledDay, isMutedMonth, isCurrentMonth),
                        ...(isMonthBoundary ? styles.monthDivider : {}),
                      };
                  if (isLastDay) {
                    cellStyle.borderTopRightRadius = 15;
                    cellStyle.borderBottomRightRadius = 15;
                  }

                  return (
                    <td key={dateStr} style={cellStyle}>
                      <div style={styles.cellShell}>
                      <button
                        type="button"
                        disabled={cancelledDay || saving}
                        onClick={() => handleToggleCell(student, dateStr)}
                        style={styles.cellBtn(buttonBg, cancelledDay, saving)}
                        title={cancelledDay ? "Тренування скасоване" : dateStr}
                      >
                        {cellView.mark}
                      </button>
                      </div>
                    </td>
                  );
                })}
              </tr>
            )})}

            {!displayRows.length && (
              <tr>
                <td style={styles.rowHead}>Немає учениць</td>
                <td colSpan={visibleDays.length} style={{ padding: 16, color: theme.textMuted }}>
                  У цій групі поки немає учениць.
                </td>
              </tr>
            )}

            <tr>
              <td style={styles.rowHead}>
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  <button type="button" onClick={() => setAddMode("student")} style={{ ...styles.control, height: 28, fontSize: 12, padding: "0 8px", background: addMode === "student" ? theme.primary : theme.input, color: addMode === "student" ? "#fff" : theme.textMain }}>Учениця</button>
                  <button type="button" onClick={() => setAddMode("guest")} style={{ ...styles.control, height: 28, fontSize: 12, padding: "0 8px", background: addMode === "guest" ? theme.primary : theme.input, color: addMode === "guest" ? "#fff" : theme.textMain }}>Гість</button>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted, marginBottom: 6 }}>{addMode === "student" ? "Додати ученицю" : "Додати гостя"}</div>
                <div style={{ display: "flex", gap: 6, position: "relative", zIndex: 2 }}>
                  {addMode === "student" ? (
                    <>
                      <input value={newStudentName} onChange={(e) => setNewStudentName(e.target.value)} placeholder="Ім'я учениці" style={{ ...styles.control, height: 30, flex: 1, minWidth: 0, fontSize: 12 }} />
                      <button type="button" style={{ ...styles.control, height: 30, fontSize: 12, padding: "0 10px" }} onClick={handleCreateStudentInGroup} disabled={creatingStudent}>Додати</button>
                    </>
                  ) : (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleCreateGuestAttendance();
                      }}
                      style={{ display: "flex", gap: 6, width: "100%" }}
                    >
                      <input value={guestNameInput} onChange={(e) => setGuestNameInput(e.target.value)} placeholder="Ім'я гостя (необов'язково)" style={{ ...styles.control, height: 30, flex: 1, minWidth: 0, fontSize: 12 }} />
                      <select value={guestEntryType} onChange={(e) => setGuestEntryType(e.target.value)} style={{ ...styles.control, height: 30, fontSize: 12, padding: "0 8px" }}>
                        <option value="trial">Пробне</option>
                        <option value="single">Разове</option>
                      </select>
                      <button
                        type="submit"
                        style={{ ...styles.control, height: 30, fontSize: 12, padding: "0 10px" }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleCreateGuestAttendance();
                        }}
                        disabled={creatingGuest || !gid}
                      >
                        Додати
                      </button>
                    </form>
                  )}
                </div>
              </td>
              <td colSpan={visibleDays.length} style={{ ...styles.cell(false), background: theme.input }} />
            </tr>

            <tr style={styles.totalsRow}>
              <td style={{ ...styles.rowHead, ...styles.totalsHead, ...styles.totalsRow }}>Всього присутніх:</td>
              {visibleDays.map((dateStr) => (
                <td
                  key={`total_${dateStr}`}
                  style={{
                    ...styles.cell(isCancelledDate(dateStr), dateStr.slice(0, 7) !== centerMonth, dateStr.slice(0, 7) === centerMonth),
                    ...styles.totalsRow,
                    fontWeight: 700,
                    color: theme.textMain,
                  }}
                >
                  <div style={{ display: "inline-flex", alignItems: "baseline", gap: 4 }}>
                    <span>{totalsByDate[dateStr]?.total || 0}</span>
                    {!!totalsByDate[dateStr]?.removed && (
                      <span style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted }}>
                        (+{totalsByDate[dateStr].removed} видал.)
                      </span>
                    )}
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {openMenuState && createPortal(
        <div
          ref={menuPopupRef}
          style={{ ...styles.menu, top: openMenuState.top, left: openMenuState.left }}
        >
          {(() => {
            const student = displayRows.find((s) => s.id === openMenuState.studentId);
            if (!student) return null;
            if (student.isGuest) {
              return (
                <>
                  <div style={styles.menuSection}>
                    <button type="button" style={styles.menuItem} onClick={() => handleConvertGuestToStudent(student)}>Перетворити на ученицю</button>
                  </div>
                  <div style={styles.menuSection}>
                    <button type="button" style={{ ...styles.menuItem, ...styles.menuDanger }} onClick={() => handleRemoveGuestRosterRow(student)}>Прибрати тимчасового гостя</button>
                  </div>
                </>
              );
            }
            return (
              <>
                <div style={styles.menuSection}>
                  <button type="button" style={styles.menuItem} onClick={() => moveStudent(student.id, "up")}>Перемістити вгору</button>
                  <button type="button" style={styles.menuItem} onClick={() => moveStudent(student.id, "down")}>Перемістити вниз</button>
                </div>
                <div style={styles.menuSection}>
                  <button type="button" style={styles.menuItem} onClick={() => handleAddSub(student)}>Додати абонемент</button>
                  <button type="button" style={styles.menuItem} onClick={() => handleEditSub(student)}>Змінити абонемент</button>
                  <button type="button" style={styles.menuItem} onClick={() => handleEditStudent(student)}>Редагувати ученицю</button>
                </div>
                <div style={styles.menuSection}>
                  <button type="button" style={styles.menuItem} onClick={() => handleMessageStudent(student)}>Написати повідомлення</button>
                </div>
                <div style={styles.menuSection}>
                  <label style={styles.notifyRow}>
                    <input
                      type="checkbox"
                      style={styles.notifyCheck}
                      checked={isWarned(student.id)}
                      onChange={(e) => toggleWarned(student.id, e.target.checked)}
                    />
                    <span>Сповіщено про завершення</span>
                  </label>
                </div>
                <div style={styles.menuDivider} />
                <div style={styles.menuSection}>
                  <button type="button" style={{ ...styles.menuItem, ...styles.menuDanger }} onClick={() => { handleRemoveFromGroup(student); setOpenMenuState(null); }}>Прибрати з групи</button>
                </div>
              </>
            );
          })()}
        </div>,
        document.body
      )}
    </div>
  );
}
