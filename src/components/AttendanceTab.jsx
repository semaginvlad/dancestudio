import React, { useEffect, useMemo, useState } from "react";
import * as db from "../db";
import { supabase } from "../supabase";
import { theme, WEEKDAYS, MONTHS, inputSt, btnS } from "../shared/constants";
import { getDisplayName, today, useStickyState } from "../shared/utils";
import { GroupSelect } from "./UI";

const toMonthValue = (dateStr) => (dateStr || today()).slice(0, 7);

function monthDays(monthValue) {
  if (!monthValue) return [];
  const [y, m] = monthValue.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const res = [];
  for (let d = 1; d <= daysInMonth; d++) {
    res.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return res;
}

function prevMonth(monthValue) {
  const [y, m] = monthValue.split("-").map(Number);
  const dt = new Date(y, m - 2, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

function nextMonth(monthValue) {
  const [y, m] = monthValue.split("-").map(Number);
  const dt = new Date(y, m, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

export default function AttendanceTabNew({
  groups,
  subs,
  setSubs,
  attn,
  setAttn,
  studentMap,
  studentGrps,
  cancelled,
}) {
  const [gid, setGid] = useStickyState("", "ds_attn_new_gid");
  const [monthValue, setMonthValue] = useState(toMonthValue(today()));
  const [savingCell, setSavingCell] = useState("");

  useEffect(() => {
    if (groups?.length && !gid) setGid(groups[0].id);
  }, [groups, gid, setGid]);

  const currentGroup = useMemo(() => groups.find(g => g.id === gid) || null, [groups, gid]);

  const studentsInGroup = useMemo(() => {
    const ids = new Set([
      ...studentGrps.filter(sg => sg.groupId === gid).map(sg => sg.studentId),
      ...subs.filter(s => s.groupId === gid).map(s => s.studentId),
    ]);

    const list = [...ids]
      .map(id => studentMap[id])
      .filter(Boolean)
      .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b), "uk"));

    return list;
  }, [gid, studentGrps, subs, studentMap]);

  const visibleDays = useMemo(() => {
    const all = monthDays(monthValue);
    if (!currentGroup?.schedule?.length) return all;

    const scheduleDays = currentGroup.schedule.map(s => s.day);
    const attnDates = new Set(attn.filter(a => a.groupId === gid).map(a => a.date));
    const cancelledDates = new Set((cancelled || []).filter(c => c.groupId === gid).map(c => c.date));

    return all.filter(d => {
      const dow = new Date(`${d}T12:00:00`).getDay();
      return scheduleDays.includes(dow) || attnDates.has(d) || cancelledDates.has(d);
    });
  }, [monthValue, currentGroup, attn, cancelled, gid]);

  const monthTitle = useMemo(() => {
    const [y, m] = monthValue.split("-").map(Number);
    return `${MONTHS[m - 1]} ${y}`;
  }, [monthValue]);

  const getStudentRecord = (student, date) => {
    const possibleNames = [
      getDisplayName(student),
      student?.name || "",
      `${student?.lastName || student?.last_name || ""} ${student?.firstName || student?.first_name || ""}`.trim(),
    ].map(v => (v || "").trim().toLowerCase()).filter(Boolean);

    const matches = attn.filter(a => {
      if (a.groupId !== gid || a.date !== date) return false;

      if (a.subId) {
        const linkedSub = subs.find(s => s.id === a.subId);
        return linkedSub?.studentId === student.id;
      }

      return possibleNames.includes((a.guestName || "").trim().toLowerCase());
    });

    if (!matches.length) return null;

    return [...matches].sort((a, b) => {
      const ac = a.createdAt || "";
      const bc = b.createdAt || "";
      if (ac !== bc) return bc.localeCompare(ac);
      return String(b.id).localeCompare(String(a.id));
    })[0];
  };

  const getMatchingSub = (student, date) => {
    return [...subs]
      .filter(s => (
        s.studentId === student.id &&
        s.groupId === gid &&
        s.startDate <= date &&
        s.endDate >= date
      ))
      .sort((a, b) => {
        const as = a.startDate || "";
        const bs = b.startDate || "";
        return bs.localeCompare(as);
      })[0] || null;
  };

  const refreshAttendance = async () => {
    const fresh = await db.fetchAttendance();
    setAttn(fresh);
  };

  const toggleCell = async (student, date) => {
    const key = `${student.id}_${date}`;
    if (savingCell === key) return;
    setSavingCell(key);

    try {
      const existing = getStudentRecord(student, date);
      if (existing) {
        await db.deleteAttendance(existing.id);
        await refreshAttendance();
        return;
      }

      const sub = getMatchingSub(student, date);
      if (sub) {
        await db.insertAttendance({
          subId: sub.id,
          date,
          quantity: 1,
          entryType: "subscription",
          groupId: gid,
        });
      } else {
        await db.insertAttendance({
          guestName: student.name || getDisplayName(student),
          guestType: "single",
          groupId: gid,
          date,
          quantity: 1,
          entryType: "single",
        });
      }

      await refreshAttendance();
    } catch (e) {
      console.warn("toggleCell error:", e);
    } finally {
      setSavingCell("");
    }
  };

  return (
    <div style={{ maxWidth: "100%" }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <GroupSelect groups={groups} value={gid} onChange={setGid} />
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button style={{ ...btnS, padding: "12px 16px", borderRadius: 12 }} onClick={() => setMonthValue(prevMonth(monthValue))}>{"<"}</button>
          <input
            style={{ ...inputSt, width: "auto", minWidth: 160, textAlign: "center", cursor: "pointer" }}
            type="month"
            value={monthValue}
            onChange={(e) => setMonthValue(e.target.value)}
            onClick={(e) => e.target.showPicker && e.target.showPicker()}
          />
          <button style={{ ...btnS, padding: "12px 16px", borderRadius: 12 }} onClick={() => setMonthValue(nextMonth(monthValue))}>{">"}</button>
        </div>
      </div>

      <div style={{ marginBottom: 12, color: theme.textMuted, fontWeight: 700, fontSize: 14 }}>{monthTitle}</div>

      <div style={{ overflowX: "auto", background: theme.card, borderRadius: 24, padding: "20px 0", boxShadow: "0 10px 30px rgba(168, 177, 206, 0.15)", border: `1px solid ${theme.border}` }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: "100%", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ position: "sticky", left: 0, background: theme.card, padding: "10px 16px", textAlign: "left", zIndex: 3, borderRight: `2px solid ${theme.border}`, minWidth: 220, color: theme.textMuted }}>Учениця</th>
              {visibleDays.map(d => {
                const dayNum = new Date(`${d}T12:00:00`).getDay();
                const isCancelled = (cancelled || []).some(c => c.groupId === gid && c.date === d);
                return (
                  <th key={d} style={{ padding: "8px 2px", background: isCancelled ? "rgba(255,69,58,0.12)" : theme.card, color: theme.textMain, fontWeight: 600, minWidth: 44, textAlign: "center", borderBottom: `3px solid ${theme.border}` }}>
                    <div style={{ fontSize: 10, color: theme.textMuted }}>{WEEKDAYS[dayNum]}</div>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>{d.slice(-2)}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {studentsInGroup.map((student, index) => (
              <tr key={student.id}>
                <td style={{ position: "sticky", left: 0, background: theme.card, padding: "10px 16px", fontWeight: 600, color: theme.textMain, borderRight: `2px solid ${theme.border}`, borderBottom: `1px solid ${theme.border}`, zIndex: 1, whiteSpace: "nowrap" }}>
                  <span style={{ color: theme.textLight, marginRight: 8, fontSize: 12 }}>{index + 1}.</span>
                  {getDisplayName(student)}
                </td>
                {visibleDays.map(d => {
                  const rec = getStudentRecord(student, d);
                  const key = `${student.id}_${d}`;
                  const isCancelled = (cancelled || []).some(c => c.groupId === gid && c.date === d);
                  let bg = theme.input;
                  if (rec?.entryType === "subscription") bg = theme.primary;
                  else if (rec?.entryType === "trial") bg = theme.success;
                  else if (rec?.entryType === "single") bg = theme.warning;
                  else if (rec?.entryType === "unpaid") bg = theme.danger;

                  return (
                    <td key={d} style={{ padding: "4px 0", height: 48, borderBottom: `1px solid ${theme.border}`, background: isCancelled ? "rgba(255,69,58,0.12)" : "transparent" }}>
                      <div style={{ height: 32, width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {!isCancelled && (
                          <button
                            type="button"
                            onClick={() => toggleCell(student, d)}
                            disabled={savingCell === key}
                            style={{
                              width: 26,
                              height: 26,
                              borderRadius: 8,
                              background: bg,
                              border: "none",
                              cursor: savingCell === key ? "wait" : "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#fff",
                              fontSize: 14,
                              opacity: savingCell === key ? 0.6 : 1,
                            }}
                          >
                            {rec ? "✓" : ""}
                          </button>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
