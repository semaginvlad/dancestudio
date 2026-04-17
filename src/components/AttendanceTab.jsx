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
    padding: "10px 12px",
  },
  studentName: {
    fontSize: 14,
    fontWeight: 600,
    color: "#111827",
  },
  studentMeta: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 3,
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

const getActiveSubOnDate = (subs, studentId, groupId, dateStr) => {
  return subs.find((s) => {
    if (s.studentId !== studentId) return false;
    if (s.groupId !== groupId) return false;
    if (isSubExhausted(s)) return false;
    const end = getEffectiveEndDate(s) || "2099-12-31";
    return (s.startDate || "0000-00-00") <= dateStr && end >= dateStr;
  }) || null;
};

const getStudentStatusText = (subs, studentId, groupId) => {
  const groupSubs = subs
    .filter((s) => s.studentId === studentId && s.groupId === groupId)
    .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
  if (!groupSubs.length) return "Без абонемента";
  const active = groupSubs.find((s) => !isSubExhausted(s));
  if (!active) return "Абонементів немає";
  const end = getEffectiveEndDate(active) || active.endDate || "—";
  return `До ${end}`;
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

    const savedOrder = customOrders?.[gid] || [];
    const orderIndex = new Map(savedOrder.map((id, idx) => [id, idx]));

    return [...list].sort((a, b) => {
      const aIdx = orderIndex.has(a.id) ? orderIndex.get(a.id) : Number.MAX_SAFE_INTEGER;
      const bIdx = orderIndex.has(b.id) ? orderIndex.get(b.id) : Number.MAX_SAFE_INTEGER;
      if (aIdx !== bIdx) return aIdx - bIdx;
      return getDisplayName(a).localeCompare(getDisplayName(b), "uk");
    });
  }, [studentIdsInGroup, studentMap, customOrders, gid]);

  const subsById = useMemo(() => {
    const map = {};
    subs.forEach((s) => {
      map[s.id] = s;
    });
    return map;
  }, [subs]);

  const sameStudentByRecord = (record, student) => {
    if (record.subId) {
      const linkedSub = subsById[record.subId];
      return linkedSub?.studentId === student.id;
    }
    const recName = normalizeName(record.guestName);
    const stName1 = normalizeName(getDisplayName(student));
    const stName2 = normalizeName(student.name);
    return !!recName && (recName === stName1 || recName === stName2);
  };

  const getRecordsForCell = (student, dateStr) => {
    return attn.filter(
      (a) =>
        a.groupId === gid &&
        a.date === dateStr &&
        sameStudentByRecord(a, student)
    );
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
  };

  const handleToggleCell = async (student, dateStr) => {
    if (!gid) return;
    if (isCancelledDate(dateStr)) return;

    const cellKey = `${student.id}_${dateStr}`;
    setBusyCell(cellKey);

    try {
      const existing = getRecordsForCell(student, dateStr);

      if (existing.length) {
        for (const rec of existing) {
          if (rec.id) {
            await db.deleteAttendance(rec.id);
          }
        }
        await reloadFromDb();
        return;
      }

      const nextEntry = resolveNewEntry(student, dateStr);

      await db.insertAttendance({
        id: `tmp_${uid()}`,
        subId: nextEntry.subId,
        date: dateStr,
        guestName: student.name || getDisplayName(student),
        guestType: nextEntry.entryType,
        groupId: gid,
        quantity: 1,
        entryType: nextEntry.entryType,
      });

      await reloadFromDb();
    } catch (err) {
      const msg = err?.message || "Невідома помилка";
      if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("unique")) {
        try {
          await reloadFromDb();
          alert("Запис уже був у базі. Журнал оновлено.");
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

                return (
                  <th
                    key={dateStr}
                    style={{ ...styles.headTop, ...styles.dayHead(cancelledDay) }}
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
            {orderedStudents.map((student) => (
              <tr key={student.id}>
                <td style={styles.rowHead}>
                  <div style={styles.studentName}>{getDisplayName(student)}</div>
                  <div style={styles.studentMeta}>
                    {getStudentStatusText(subs, student.id, gid)}
                  </div>
                </td>

                {visibleDays.map((dateStr) => {
                  const cancelledDay = isCancelledDate(dateStr);
                  const cellKey = `${student.id}_${dateStr}`;
                  const saving = busyCell === cellKey;
                  const cellView = getCellView(student, dateStr);

                  return (
                    <td key={dateStr} style={styles.cell(cancelledDay)}>
                      <button
                        type="button"
                        disabled={cancelledDay || saving}
                        onClick={() => handleToggleCell(student, dateStr)}
                        style={styles.cellBtn(cellView.bg, cancelledDay, saving)}
                        title={cancelledDay ? "Тренування скасоване" : dateStr}
                      >
                        {cellView.mark}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}

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
