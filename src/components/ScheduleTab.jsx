import React, { useMemo, useState } from "react";
import { cardSt, theme } from "../shared/constants";

const dayMs = 86400000;
const toLocalDateKey = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const startOfWeek = (date) => {
  const d = new Date(`${toLocalDateKey(date)}T12:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
};
const addDays = (date, days) => {
  const d = new Date(`${toLocalDateKey(date)}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d;
};
const toMin = (t = "") => {
  const [h, m] = String(t || "").split(":");
  const hh = Number(h); const mm = Number(m || 0);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
};
const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

const parseWeekday = (raw) => {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  if (Number.isFinite(n)) {
    if (n >= 1 && n <= 7) return n % 7;
    if (n >= 0 && n <= 6) return n;
  }
  const s = String(raw).trim().toLowerCase();
  const map = {
    mon: 1, monday: 1, пн: 1,
    tue: 2, tuesday: 2, вт: 2,
    wed: 3, wednesday: 3, ср: 3,
    thu: 4, thursday: 4, чт: 4,
    fri: 5, friday: 5, пт: 5,
    sat: 6, saturday: 6, сб: 6,
    sun: 0, sunday: 0, нд: 0,
  };
  return map[s] ?? null;
};

const parseGroupSchedule = (groups = []) => {
  const out = [];
  groups.forEach((g) => {
    const rows = Array.isArray(g.schedule) ? g.schedule : [];
    rows.forEach((row, idx) => {
      const wd = parseWeekday(row.weekday ?? row.dayOfWeek ?? row.day ?? row.dow ?? row.weekDay);
      const start = String(row.startTime || row.start || row.time || "").slice(0, 5);
      const end = String(row.endTime || row.end || "").slice(0, 5);
      if (wd === null || !start) return;
      out.push({
        id: `${g.id}_${idx}`,
        groupId: g.id,
        groupName: g.name || g.id,
        directionId: g.directionId,
        trainerId: g.trainer_id || null,
        weekday: wd,
        startTime: start,
        endTime: end || "",
      });
    });
  });
  return out;
};

export default function ScheduleTab({ groups = [], directionsList = [], trainers = [], cancelled = [], roomBookings = [], onAddBooking, onDeleteBooking }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [draft, setDraft] = useState({ date: toLocalDateKey(new Date()), startTime: "12:00", endTime: "13:00", trainerId: "", trainerName: "", title: "", note: "" });

  const dirMap = useMemo(() => new Map((directionsList || []).map((d) => [String(d.id), d.name || d.id])), [directionsList]);
  const trainerMap = useMemo(() => new Map((trainers || []).map((t) => [String(t.id), t.name || [t.firstName, t.lastName].filter(Boolean).join(" ")])), [trainers]);
  const cancelledSet = useMemo(() => new Set((cancelled || []).map((c) => `${c.groupId}:${String(c.date).slice(0, 10)}`)), [cancelled]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const groupSlots = useMemo(() => parseGroupSchedule(groups), [groups]);

  const scheduleEvents = useMemo(() => {
    const groupEvents = [];
    weekDays.forEach((day) => {
      const dateKey = toLocalDateKey(day);
      const dow = day.getDay();
      groupSlots.filter((s) => s.weekday === dow).forEach((s) => {
        groupEvents.push({
          kind: "group",
          id: `${s.id}_${dateKey}`,
          date: dateKey,
          startTime: s.startTime,
          endTime: s.endTime,
          title: s.groupName,
          direction: dirMap.get(String(s.directionId || "")) || "—",
          trainer: trainerMap.get(String(s.trainerId || "")) || "—",
          cancelled: cancelledSet.has(`${s.groupId}:${dateKey}`),
        });
      });
    });
    const bookingEvents = (roomBookings || []).map((b) => ({
      kind: "booking",
      id: b.id,
      date: b.date,
      startTime: b.startTime,
      endTime: b.endTime,
      title: b.title,
      trainer: b.trainerName || trainerMap.get(String(b.trainerId || "")) || "—",
      note: b.note || "",
    }));
    return [...groupEvents, ...bookingEvents].sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
  }, [weekDays, groupSlots, roomBookings, dirMap, trainerMap, cancelledSet]);

  const eventsByDay = useMemo(() => {
    const m = new Map(weekDays.map((d) => [toLocalDateKey(d), []]));
    scheduleEvents.forEach((e) => { if (m.has(e.date)) m.get(e.date).push(e); });
    return m;
  }, [weekDays, scheduleEvents]);

  const detectConflicts = (candidate) => {
    const cStart = toMin(candidate.startTime);
    const cEnd = toMin(candidate.endTime);
    if (cStart === null || cEnd === null || cEnd <= cStart) return [];
    return scheduleEvents.filter((e) => {
      if (e.date !== candidate.date) return false;
      const s = toMin(e.startTime); const en = toMin(e.endTime);
      if (s === null || en === null) return false;
      return overlaps(cStart, cEnd, s, en);
    });
  };

  const saveBooking = async () => {
    if (!draft.date || !draft.startTime || !draft.endTime || !draft.title.trim()) { alert("Заповніть дату, час і назву"); return; }
    const conflicts = detectConflicts(draft);
    if (conflicts.length > 0) {
      const ok = window.confirm(`Є перетин у графіку (${conflicts.length}). Зберегти все одно?`);
      if (!ok) return;
    }
    await onAddBooking({
      date: draft.date,
      startTime: draft.startTime,
      endTime: draft.endTime,
      trainerId: draft.trainerId || null,
      trainerName: draft.trainerName || null,
      title: draft.title.trim(),
      type: "individual",
      note: draft.note || null,
    });
    setDraft((p) => ({ ...p, title: "", note: "" }));
  };

  return <div style={{ display: "grid", gap: 12 }}>
    <div style={{ ...cardSt, border: `1px solid ${theme.border}`, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <button onClick={() => setWeekStart((d) => addDays(d, -7))}>← Попередній тиждень</button>
      <button onClick={() => setWeekStart(startOfWeek(new Date()))}>Сьогодні</button>
      <button onClick={() => setWeekStart((d) => addDays(d, 7))}>Наступний тиждень →</button>
      <div style={{ marginLeft: "auto", color: theme.textLight, fontSize: 12 }}>Тиждень: {toLocalDateKey(weekDays[0])} — {toLocalDateKey(weekDays[6])}</div>
    </div>

    <div style={{ ...cardSt, border: `1px solid ${theme.border}` }}>
      <b>+ Резерв залу</b>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8, marginTop: 8 }}>
        <input type="date" value={draft.date} onChange={(e) => setDraft((p) => ({ ...p, date: e.target.value }))} />
        <input type="time" value={draft.startTime} onChange={(e) => setDraft((p) => ({ ...p, startTime: e.target.value }))} />
        <input type="time" value={draft.endTime} onChange={(e) => setDraft((p) => ({ ...p, endTime: e.target.value }))} />
        <select value={draft.trainerId} onChange={(e) => setDraft((p) => ({ ...p, trainerId: e.target.value }))}><option value="">Тренер</option>{trainers.map((t) => <option key={t.id} value={t.id}>{t.name || [t.firstName, t.lastName].filter(Boolean).join(" ")}</option>)}</select>
        <input placeholder="Назва / клієнт" value={draft.title} onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))} />
        <input placeholder="Нотатка" value={draft.note} onChange={(e) => setDraft((p) => ({ ...p, note: e.target.value }))} />
      </div>
      <div style={{ marginTop: 8 }}><button onClick={saveBooking}>Зберегти резерв</button></div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 8 }}>
      {weekDays.map((d) => {
        const dk = toLocalDateKey(d);
        const list = eventsByDay.get(dk) || [];
        return <div key={dk} style={{ ...cardSt, border: `1px solid ${theme.border}`, minHeight: 240 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>{d.toLocaleDateString("uk-UA", { weekday: "short" })} · {dk.slice(5)}</div>
          <div style={{ display: "grid", gap: 6 }}>
            {list.length === 0 ? <div style={{ color: theme.textLight, fontSize: 12 }}>Немає подій</div> : list.map((e) => <div key={e.id} style={{ border: `1px solid ${e.kind === "group" ? (e.cancelled ? theme.danger : theme.primary) : theme.warning}`, background: e.kind === "group" ? (e.cancelled ? "rgba(234,84,85,0.08)" : "rgba(90,129,250,0.09)") : "rgba(245,159,58,0.12)", borderRadius: 10, padding: 8, opacity: e.cancelled ? 0.65 : 1 }}>
              <div style={{ fontSize: 12, color: theme.textLight }}>{e.startTime}{e.endTime ? `–${e.endTime}` : ""} · {e.kind === "group" ? "Група" : "Резерв"}</div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{e.title}</div>
              {e.kind === "group" ? <div style={{ fontSize: 12 }}>{e.direction} · {e.trainer}{e.cancelled ? " · cancelled" : ""}</div> : <div style={{ fontSize: 12 }}>{e.trainer}{e.note ? ` · ${e.note}` : ""}</div>}
              {e.kind === "booking" && <button style={{ marginTop: 6, fontSize: 11 }} onClick={() => onDeleteBooking(e.id)}>Видалити</button>}
            </div>)}
          </div>
        </div>;
      })}
    </div>
  </div>;
}
