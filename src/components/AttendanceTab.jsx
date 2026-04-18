// test preview deploy
import React, { useEffect, useMemo, useState } from "react";
import * as db from "../db";
import {
  today,
  uid,
  getDisplayName,
  useStickyState,
  getEffectiveEndDate,
  isSubExhausted,
  getNextTrainingDate,
  getPreviousTrainingDate,
} from "../shared/utils";

const MONTH_NAMES = [
  "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"
];

const WEEKDAYS_SHORT = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

const styles = {
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
    padding: 12,
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    background: "#fff",
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
    border: "1px solid #d1d5db",
    padding: "0 12px",
    background: "#fff",
    fontSize: 14,
  },
  legend: {
    display: "flex",
    gap: 14,
    flexWrap: "wrap",
    fontSize: 13,
    color: "#374151",
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
    overflow: "auto",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    background: "#fff",
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
    background: "#fff",
    minWidth: 240,
    maxWidth: 240,
    width: 240,
    borderRight: "1px solid #e5e7eb",
  },
  headTop: {
    position: "sticky",
    top: 0,
    zIndex: 5,
    background: "#f9fafb",
  },
  monthHead: {
    textAlign: "center",
    fontWeight: 700,
    fontSize: 13,
    color: "#111827",
    borderBottom: "1px solid #e5e7eb",
    borderRight: "1px solid #e5e7eb",
    padding: "10px 6px",
    background: "#f9fafb",
    whiteSpace: "nowrap",
  },
  studentHead: {
    padding: "10px 12px",
    textAlign: "left",
    fontWeight: 700,
    fontSize: 14,
    color: "#111827",
    borderBottom: "1px solid #e5e7eb",
    background: "#f9fafb",
  },
  dayHead: (isCancelled) => ({
    minWidth: 58,
    maxWidth: 58,
    width: 58,
    textAlign: "center",
    verticalAlign: "top",
    borderRight: "1px solid #eef2f7",
    borderBottom: "1px solid #e5e7eb",
    padding: "8px 4px",
    background: isCancelled ? "#fef2f2" : "#fff",
  }),
  dayNum: {
    fontSize: 15,
    fontWeight: 700,
    color: "#111827",
    lineHeight: 1.1,
  },
  dayName: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 2,
  },
  cancelBtn: (isCancelled) => ({
    marginTop: 6,
    width: 22,
    height: 22,
    borderRadius: 999,
    border: "1px solid",
    borderColor: isCancelled ? "#10b981" : "#fca5a5",
    background: isCancelled ? "#ecfdf5" : "#fff",
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
    background: "#fff",
    borderRight: "1px solid #e5e7eb",
    borderBottom: "1px solid #eef2f7",
    padding: "8px 10px",
  },
  studentName: {
    fontSize: 14,
    fontWeight: 600,
    color: "#111827",
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
  },
  orderBtn: {
    width: 18,
    height: 18,
    borderRadius: 5,
    border: "1px solid #d1d5db",
    background: "#fff",
    color: "#374151",
    cursor: "pointer",
    padding: 0,
    lineHeight: "16px",
    fontSize: 11,
  },
  studentMeta: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 2,
    lineHeight: 1.2,
  },
  cell: (isCancelled) => ({
    width: 58,
    minWidth: 58,
    maxWidth: 58,
    height: 54,
    textAlign: "center",
    verticalAlign: "middle",
    borderRight: "1px solid #f3f4f6",
    borderBottom: "1px solid #eef2f7",
    background: isCancelled ? "#fef2f2" : "#fff",
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
    color: bg === "#ffffff" ? "#9ca3af" : "#fff",
  }),
  subPeriodCell: (tone, border, isStart, isEnd, isCancelled) => ({
    background: isCancelled ? "#fef2f2" : tone,
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
    borderRight: "1px solid #d1d5db",
  },
  emptyState: {
    padding: 18,
    border: "1px dashed #d1d5db",
    borderRadius: 12,
    background: "#fff",
    color: "#6b7280",
  },
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

const getActiveSubOnDate = (subs, studentId, groupId, dateStr) => {
  const validSubs = subs
    .filter((s) => {
      if (s.studentId !== studentId) return false;
      if (s.groupId !== groupId) return false;
      if ((s.usedTrainings || 0) >= (s.totalTrainings || 0)) return false;
      if (isSubExhausted(s)) return false;
      const end = getEffectiveEndDate(s) || "2099-12-31";
      return (s.startDate || "0000-00-00") <= dateStr && end >= dateStr;
    })
    .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));

  return validSubs[0] || null;
};

const getStudentStatusText = (subs, studentId, groupId) => {
  const groupSubs = subs
    .filter((s) => s.studentId === studentId && s.groupId === groupId)
    .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
  if (!groupSubs.length) return { text: "Без абонемента", tone: "neutral" };

  const todayStr = today();
  const tomorrow = new Date(`${todayStr}T12:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = ymd(tomorrow);

  const activeNow = groupSubs.find((s) => {
    const end = getEffectiveEndDate(s) || s.endDate || "2099-12-31";
    return (s.startDate || "0000-00-00") <= todayStr && end >= todayStr;
  });
  const latest = [...groupSubs].sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""))[0];
  const sub = activeNow || latest;
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
  studentMap,
  studentGrps,
  cancelled,
  setCancelled,
  customOrders,
}) {
  const [gid, setGid] = useStickyState("", "ds_attn_gid_v2");
  const [centerMonth, setCenterMonth] = useState(today().slice(0, 7));
  const [entryMode, setEntryMode] = useState("auto");
  const [busyCell, setBusyCell] = useState("");
  const [busyCancelDate, setBusyCancelDate] = useState("");
  const [localOrders, setLocalOrders] = useStickyState({}, "ds_attn_local_order_v1");

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

    return [...new Set([...fromLinks, ...fromSubs])];
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
    const records = attn.filter((a) => recordMatchesCell(a, student, dateStr));

    const isDebugCase =
      String(student?.id) === "e5914deb-3c16-4f7e-b549-abaffe48d914" &&
      toDateKey(dateStr) === "2026-04-17" &&
      String(gid) === "lat-mix-am";

    if (isDebugCase) {
      const candidates = attn.filter(
        (a) =>
          String(a.groupId) === "lat-mix-am" &&
          toDateKey(a.date) === "2026-04-17"
      );
      console.log("[AttendanceTab debug]", {
        studentId: student.id,
        gid,
        dateStr,
        candidates: candidates.map((a) => ({
          id: a.id,
          studentId: a.studentId,
          subId: a.subId,
          groupId: a.groupId,
          date: a.date,
          guestName: a.guestName,
          matchesCell: recordMatchesCell(a, student, dateStr),
        })),
      });
    }

    return records;
  };

  const getRecordForCell = (student, dateStr) => {
    const all = getRecordsForCell(student, dateStr);
    return all[0] || null;
  };

  const isCancelledDate = (dateStr) =>
    cancelled.some((c) => c.groupId === gid && c.date === dateStr);

  const hasTrialInDirection = (student) => {
    if (!currentDirectionId) return false;
    const directionGroupIds = groups
      .filter((g) => g.directionId === currentDirectionId)
      .map((g) => g.id);

    return attn.some((a) => {
      if (!directionGroupIds.includes(a.groupId)) return false;
      if ((a.entryType || "subscription") !== "trial") return false;
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

        const originalEnds = {};

        for (const sub of affected) {
          originalEnds[sub.id] = sub.endDate;
          const newEnd = getNextTrainingDate(schedule, sub.endDate);
          await db.updateSub(sub.id, { endDate: newEnd });
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

      if (existing.originalEnds && Object.keys(existing.originalEnds).length) {
        for (const [subId, oldEnd] of Object.entries(existing.originalEnds)) {
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
    if (!rec) return { bg: "#ffffff", mark: "" };

    const type = rec.entryType || "subscription";
    if (type === "single") return { bg: "#f59e0b", mark: "✓" };
    if (type === "trial") return { bg: "#10b981", mark: "✓" };
    return { bg: "#2563eb", mark: "✓" };
  };

  if (!groups?.length) {
    return <div style={styles.emptyState}>Немає груп.</div>;
  }

  if (!currentGroup) {
    return <div style={styles.emptyState}>Вибери групу.</div>;
  }

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
                  style={{ ...styles.headTop, ...styles.monthHead }}
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
                const dayIdx = visibleDayIndex[dateStr];
                const nextDay = dayIdx < visibleDays.length - 1 ? visibleDays[dayIdx + 1] : null;
                const isMonthBoundary = !!nextDay && nextDay.slice(0, 7) !== dateStr.slice(0, 7);
                const headStyle = {
                  ...styles.headTop,
                  ...styles.dayHead(cancelledDay),
                  ...(isMonthBoundary ? styles.monthDivider : {}),
                };

                return (
                  <th
                    key={dateStr}
                    style={headStyle}
                  >
                    <div style={styles.dayNum}>{dateStr.slice(8, 10)}</div>
                    <div style={styles.dayName}>{WEEKDAYS_SHORT[dow]}</div>
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
              const metaColor = statusInfo.tone === "danger"
                ? "#dc2626"
                : statusInfo.tone === "warning"
                  ? "#d97706"
                  : styles.studentMeta.color;
              const rowHighlightStyle = statusInfo.tone === "danger"
                ? { background: "#fef2f2", borderLeft: "3px solid #dc2626" }
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
                    </div>
                  </div>
                  <div style={{ ...styles.studentMeta, color: metaColor }}>
                    {statusInfo.text}
                  </div>
                </td>

                {visibleDays.map((dateStr) => {
                  const cancelledDay = isCancelledDate(dateStr);
                  const cellKey = `${student.id}_${dateStr}`;
                  const saving = busyCell === cellKey;
                  const cellView = getCellView(student, dateStr);
                  const subPeriod = getSubPeriodForCell(student.id, dateStr);
                  const dayIdx = visibleDayIndex[dateStr];
                  const prevDay = dayIdx > 0 ? visibleDays[dayIdx - 1] : null;
                  const nextDay = dayIdx < visibleDays.length - 1 ? visibleDays[dayIdx + 1] : null;
                  const isStart = !!subPeriod && (!prevDay || prevDay < subPeriod.start);
                  const isEnd = !!subPeriod && (!nextDay || nextDay > subPeriod.end);
                  const tone = subPeriod?.completed ? "#edf1f5" : "#e8f1ff";
                  const border = subPeriod?.completed ? "#6b7280" : "#3b82f6";
                  const buttonBg = subPeriod?.completed && cellView.mark ? "#9ca3af" : cellView.bg;
                  const isMonthBoundary = !!nextDay && nextDay.slice(0, 7) !== dateStr.slice(0, 7);
                  const cellStyle = subPeriod
                    ? {
                        ...styles.cell(cancelledDay),
                        ...styles.subPeriodCell(tone, border, isStart, isEnd, cancelledDay),
                        ...(isMonthBoundary ? styles.monthDivider : {}),
                      }
                    : {
                        ...styles.cell(cancelledDay),
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
                <td colSpan={visibleDays.length} style={{ padding: 16, color: "#6b7280" }}>
                  У цій групі поки немає учениць.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
