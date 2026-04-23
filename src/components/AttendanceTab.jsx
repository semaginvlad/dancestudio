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
  const matrixBase = isDark ? "#131b26" : theme.card;
  const matrixMuted = isDark ? "#101722" : theme.input;
  const matrixCancelled = isDark ? "#2a1b23" : "#ffe9e9";

  return ({
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  toolbar: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
    border: `1px solid ${theme.border}`,
    borderRadius: 14,
    background: `linear-gradient(180deg, ${theme.card} 0%, ${theme.input} 100%)`,
    boxShadow: theme.bg === "#0F131A" ? "0 6px 20px rgba(0,0,0,0.25)" : "0 6px 20px rgba(15, 23, 42, 0.05)",
  },
  toolbarLeft: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
  },
  control: {
    height: 38,
    borderRadius: 10,
    border: `1px solid ${theme.border}`,
    padding: "0 12px",
    background: matrixBase,
    fontSize: 14,
    color: theme.textMain,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9)",
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
    border: `1px solid ${theme.border}`,
    borderRadius: 14,
    background: theme.card,
    position: "relative",
    boxShadow: theme.bg === "#0F131A" ? "0 10px 28px rgba(0,0,0,0.3)" : "0 10px 28px rgba(15, 23, 42, 0.08)",
  },
  table: {
    borderCollapse: "separate",
    borderSpacing: 0,
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
    borderRight: `1px solid ${theme.border}`,
    boxShadow: `1px 0 0 ${theme.border}`,
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
    borderRight: `1px solid ${theme.border}`,
    padding: "10px 6px 9px",
    background: isCurrent ? (isDark ? "#162742" : `${theme.primary}1A`) : matrixMuted,
    whiteSpace: "nowrap",
  }),
  studentHead: {
    padding: "10px 12px",
    textAlign: "left",
    fontWeight: 700,
    fontSize: 14,
    color: theme.textMain,
    borderBottom: `1px solid ${theme.border}`,
    background: matrixMuted,
  },
  dayHead: (isCancelled, isMutedMonth, isCurrentMonth) => ({
    minWidth: 58,
    maxWidth: 58,
    width: 58,
    textAlign: "center",
    verticalAlign: "top",
    borderRight: `1px solid ${theme.border}`,
    borderBottom: `1px solid ${theme.border}`,
    padding: "8px 4px",
    background: isCancelled
      ? matrixCancelled
      : isCurrentMonth
        ? matrixBase
        : isMutedMonth
          ? matrixMuted
          : matrixBase,
  }),
  dayNum: (isCurrentMonth, isMutedMonth) => ({
    fontSize: isCurrentMonth ? 15 : 14,
    fontWeight: 700,
    color: isCurrentMonth ? theme.textMain : (isMutedMonth ? theme.textLight : theme.textMuted),
    lineHeight: 1.1,
  }),
  dayName: (isCurrentMonth, isMutedMonth) => ({
    fontSize: 11,
    color: isCurrentMonth ? theme.textMuted : (isMutedMonth ? theme.textLight : theme.textMuted),
    marginTop: 2,
  }),
  cancelBtn: (isCancelled) => ({
    marginTop: 6,
    width: 22,
    height: 22,
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
    borderRight: `1px solid ${theme.border}`,
    borderBottom: `1px solid ${theme.border}`,
    padding: "8px 10px",
  },
  studentName: {
    fontSize: 14,
    fontWeight: 600,
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
    gap: 4,
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
    width: 18,
    height: 18,
    borderRadius: 5,
    border: `1px solid ${theme.border}`,
    background: matrixBase,
    color: theme.textMuted,
    cursor: "pointer",
    padding: 0,
    lineHeight: "16px",
    fontSize: 12,
  },
  menu: {
    position: "fixed",
    minWidth: 160,
    background: matrixBase,
    border: `1px solid ${theme.border}`,
    borderRadius: 10,
    boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
    zIndex: 20,
    padding: 6,
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
    borderRadius: 8,
    fontSize: 12,
    color: theme.textMuted,
    cursor: "pointer",
  },
  menuItemDisabled: {
    color: theme.textLight,
    cursor: "not-allowed",
    opacity: 0.85,
  },
  menuDivider: {
    margin: "6px 0",
    borderTop: `1px solid ${theme.border}`,
  },
  notifyRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    fontSize: 12,
    color: theme.textMuted,
    userSelect: "none",
  },
  notifyCheck: {
    width: 14,
    height: 14,
    cursor: "pointer",
  },
  studentMeta: {
    fontSize: 11,
    color: theme.textMuted,
    marginTop: 2,
    lineHeight: 1.2,
  },
  cell: (isCancelled, isMutedMonth, isCurrentMonth) => ({
    width: 58,
    minWidth: 58,
    maxWidth: 58,
    height: 54,
    textAlign: "center",
    verticalAlign: "middle",
    borderRight: `1px solid ${theme.border}`,
    borderBottom: `1px solid ${theme.border}`,
    background: isCancelled
      ? matrixCancelled
      : isCurrentMonth
        ? matrixBase
        : isMutedMonth
          ? matrixMuted
          : matrixBase,
  }),
  cellBtn: (bg, disabled, saving) => ({
    width: 32,
    height: 32,
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.08)",
    background: bg,
    cursor: disabled || saving ? "not-allowed" : "pointer",
    opacity: disabled || saving ? 0.55 : 1,
    fontSize: 16,
    fontWeight: 700,
    color: bg === theme.card ? theme.textLight : "#fff",
  }),
  subPeriodCell: (tone, border, isStart, isEnd, isCancelled) => ({
    background: isCancelled ? (isDark ? "#311d23" : "#fef2f2") : tone,
    boxShadow: [
      `inset 0 1px 0 ${border}`,
      `inset 0 -1px 0 ${border}`,
      isStart ? `inset 2px 0 0 ${border}` : "",
      isEnd ? `inset -2px 0 0 ${border}` : "",
    ]
      .filter(Boolean)
      .join(", "),
  }),
  monthDivider: {
    borderRight: `2px solid ${theme.textLight}`,
  },
  totalsRow: {
    background: matrixMuted,
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
const fmtUaShortDate = (dateStr) => {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return dateStr;
  return `${d}.${m}`;
};

const getActiveSubOnDate = (subs, studentId, groupId, dateStr) =>
  getActiveSubOnDateForCoverage(subs, studentId, groupId, dateStr);

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
  const [creatingStudent, setCreatingStudent] = useState(false);
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
    const activeSub = getActiveSubOnDate(subs, student.id, gid, today());
    const lastSub = [...subs]
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

    subs
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
  }, [subs, gid, lastAttendanceBySub]);

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

  const hasTrialInDirection = (student) => {
    if (!currentDirectionId) return false;
    const directionGroupIds = new Set(
      groups
        .filter((g) => g.directionId === currentDirectionId)
        .map((g) => g.id)
    );

    return attn.some((a) => {
      const type = a.entryType || a.guestType || "subscription";
      if (type !== "trial") return false;
      if (!directionGroupIds.has(a.groupId)) return false;
      return sameStudentByRecord(a, student);
    });
  };

  const resolveNewEntry = (student, dateStr) => {
    if (entryMode === "subscription") {
      const activeSub = getActiveSubOnDate(subs, student.id, gid, dateStr);
      if (!activeSub) {
        throw new Error("На цю дату немає активного абонемента.");
      }
      return { entryType: "subscription", subId: activeSub.id };
    }

    if (entryMode === "single") {
      return { entryType: "single", subId: null };
    }

    if (entryMode === "trial") {
      if (hasTrialInDirection(student)) {
        throw new Error("Пробне по цьому напрямку вже використане.");
      }
      return { entryType: "trial", subId: null };
    }

    if (entryMode === "debt") {
      const activeSub = getActiveSubOnDate(subs, student.id, gid, dateStr);
      if (activeSub) {
        throw new Error("У учениці є активний абонемент, борг ставити не можна.");
      }
      return { entryType: "debt", subId: null };
    }

    const activeSub = getActiveSubOnDate(subs, student.id, gid, dateStr);
    if (activeSub) {
      return { entryType: "subscription", subId: activeSub.id };
    }

    if (!hasTrialInDirection(student)) {
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
        const affected = rawSubs.filter((s) => s.groupId === gid && (s.endDate || "") >= dateStr);
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

  const getCellView = (student, dateStr) => {
    const rec = getRecordForCell(student, dateStr);
    const isDark = theme.bg === "#0F131A";
    if (!rec) return { bg: isDark ? "#182230" : theme.card, mark: "" };

    const type = rec.entryType || "subscription";
    const mark = (rec.quantity || 1) >= 2 ? "2" : "✓";
    if (type === "debt") return { bg: isDark ? "#7f1d1d" : "#dc2626", mark: "!" };
    if (type === "single") return { bg: isDark ? "#7a4313" : "#f59e0b", mark };
    if (type === "trial") return { bg: isDark ? "#0f5a43" : "#10b981", mark };
    return { bg: isDark ? "#1f3e79" : "#2563eb", mark };
  };

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
            {orderedStudents.map((student) => {
              const statusInfo = getStudentStatusText(subs, student.id, gid);
              const warnedDone = isWarned(student.id);
              const metaColor = statusInfo.tone === "danger"
                ? (warnedDone ? "#b06a6a" : "#c81e1e")
                : statusInfo.tone === "warning"
                  ? "#d97706"
                  : styles.studentMeta.color;
              const rowHighlightStyle = statusInfo.tone === "danger"
                ? (warnedDone
                    ? { background: "#f7eeee", borderLeft: "3px solid #caa5a5" }
                    : { background: "#ffe2e2", borderLeft: "3px solid #dc2626", boxShadow: "inset 0 1px 0 #fecaca" })
                : statusInfo.tone === "warning"
                  ? { background: "#fff7ed", borderLeft: "3px solid #f59e0b" }
                  : {};

              return (
              <tr key={student.id}>
                <td style={{ ...styles.rowHead, ...rowHighlightStyle }}>
                  <div style={styles.studentNameRow}>
                    <div style={styles.studentName}>{getDisplayName(student)}</div>
                    <div style={styles.orderBtns}>
                      <button type="button" style={styles.orderBtn} onClick={() => moveStudent(student.id, "up")} title="Вгору">↑</button>
                      <button type="button" style={styles.orderBtn} onClick={() => moveStudent(student.id, "down")} title="Вниз">↓</button>
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

                  return (
                    <td key={dateStr} style={cellStyle}>
                      <button
                        type="button"
                        disabled={cancelledDay || saving}
                        onClick={() => handleToggleCell(student, dateStr)}
                        style={styles.cellBtn(buttonBg, cancelledDay, saving)}
                        title={cancelledDay ? "Тренування скасоване" : dateStr}
                      >
                        {cellView.mark}
                      </button>
                    </td>
                  );
                })}
              </tr>
            )})}

            {!orderedStudents.length && (
              <tr>
                <td style={styles.rowHead}>Немає учениць</td>
                <td colSpan={visibleDays.length} style={{ padding: 16, color: theme.textMuted }}>
                  У цій групі поки немає учениць.
                </td>
              </tr>
            )}

            <tr>
              <td style={styles.rowHead}>
                <div style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted, marginBottom: 6 }}>Додати ученицю</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    value={newStudentName}
                    onChange={(e) => setNewStudentName(e.target.value)}
                    placeholder="Ім'я учениці"
                    style={{ ...styles.control, height: 30, flex: 1, minWidth: 0, fontSize: 12 }}
                  />
                  <button
                    type="button"
                    style={{ ...styles.control, height: 30, fontSize: 12, padding: "0 10px" }}
                    onClick={handleCreateStudentInGroup}
                    disabled={creatingStudent}
                  >
                    Додати
                  </button>
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
            const student = orderedStudents.find((s) => s.id === openMenuState.studentId);
            if (!student) return null;
            return (
              <>
                <button type="button" style={styles.menuItem} onClick={() => handleAddSub(student)}>Додати абонемент</button>
                <button type="button" style={styles.menuItem} onClick={() => handleEditSub(student)}>Змінити абонемент</button>
                <button type="button" style={styles.menuItem} onClick={() => handleEditStudent(student)}>Редагувати ученицю</button>
                <button
                  type="button"
                  style={styles.menuItem}
                  onClick={() => handleMessageStudent(student)}
                >
                  Написати повідомлення
                </button>
                <div style={styles.menuDivider} />
                <label style={styles.notifyRow}>
                  <input
                    type="checkbox"
                    style={styles.notifyCheck}
                    checked={isWarned(student.id)}
                    onChange={(e) => toggleWarned(student.id, e.target.checked)}
                  />
                  <span>Сповіщено про завершення</span>
                </label>
                <button type="button" style={{ ...styles.menuItem, color: "#b91c1c" }} onClick={() => { handleRemoveFromGroup(student); setOpenMenuState(null); }}>Прибрати з групи</button>
              </>
            );
          })()}
        </div>,
        document.body
      )}
    </div>
  );
}
