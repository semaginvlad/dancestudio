import React, { useMemo, useState } from "react";
import { cardSt, theme } from "../shared/constants";

const DAY_START_HOUR = 8;
const DAY_END_HOUR = 22;
const HOUR_PX = 54;
const HEADER_H = 56;
const toLocalDateKey = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const startOfWeek = (date) => {
  const d = new Date(`${toLocalDateKey(date)}T12:00:00`);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
};
const addDays = (date, days) => { const d = new Date(`${toLocalDateKey(date)}T12:00:00`); d.setDate(d.getDate() + days); return d; };
const toMin = (t = "") => {
  const [h, m] = String(t || "").split(":");
  const hh = Number(h); const mm = Number(m || 0);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
};
const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;
const parseWeekday = (raw) => {
  if (raw == null) return null;
  const n = Number(raw);
  if (Number.isFinite(n)) return n >= 1 && n <= 7 ? n % 7 : (n >= 0 && n <= 6 ? n : null);
  return ({ mon: 1, monday: 1, пн: 1, tue: 2, tuesday: 2, вт: 2, wed: 3, wednesday: 3, ср: 3, thu: 4, thursday: 4, чт: 4, fri: 5, friday: 5, пт: 5, sat: 6, saturday: 6, сб: 6, sun: 0, sunday: 0, нд: 0 }[String(raw).trim().toLowerCase()]) ?? null;
};

const parseGroupSchedule = (groups = []) => {
  const out = [];
  groups.forEach((g) => (Array.isArray(g.schedule) ? g.schedule : []).forEach((row, idx) => {
    const weekday = parseWeekday(row.weekday ?? row.dayOfWeek ?? row.day ?? row.dow ?? row.weekDay);
    const startTime = String(row.startTime || row.start || row.time || "").slice(0, 5);
    const endTime = String(row.endTime || row.end || "").slice(0, 5) || "";
    if (weekday === null || !startTime) return;
    out.push({ id: `${g.id}_${idx}`, groupId: g.id, groupName: g.name || g.id, directionId: g.directionId, trainerId: g.trainer_id || null, weekday, startTime, endTime });
  }));
  return out;
};

const palette = {
  latin: { bg: "rgba(250, 211, 144, 0.25)", border: "#f59e0b" },
  bachata: { bg: "rgba(244, 114, 182, 0.22)", border: "#ec4899" },
  high_heels: { bg: "rgba(196, 181, 253, 0.24)", border: "#8b5cf6" },
  jazz_funk: { bg: "rgba(147, 197, 253, 0.22)", border: "#3b82f6" },
  k_pop: { bg: "rgba(134, 239, 172, 0.22)", border: "#22c55e" },
  dancehall: { bg: "rgba(251, 191, 36, 0.2)", border: "#d97706" },
  reserve: { bg: "rgba(45, 212, 191, 0.2)", border: "#14b8a6" },
  cancelled: { bg: "rgba(248, 113, 113, 0.16)", border: theme.danger },
  default: { bg: "rgba(148, 163, 184, 0.2)", border: "#64748b" },
};
const pickColor = (e) => {
  if (e.cancelled) return palette.cancelled;
  if (e.kind === "booking") return palette.reserve;
  const key = String(e.direction || "").trim().toLowerCase().replace(/\s+/g, "_");
  return palette[key] || palette.default;
};

export default function ScheduleTab({ groups = [], directionsList = [], trainers = [], cancelled = [], roomBookings = [], isAdmin = false, onAddBooking, onDeleteBooking }) {
  const safeGroups = Array.isArray(groups) ? groups : [];
  const safeDirections = Array.isArray(directionsList) ? directionsList : [];
  const safeTrainers = Array.isArray(trainers) ? trainers : [];
  const safeCancelled = Array.isArray(cancelled) ? cancelled : [];
  const safeBookings = Array.isArray(roomBookings) ? roomBookings : [];
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({ date: toLocalDateKey(new Date()), startTime: "12:00", endTime: "13:00", trainerId: "", trainerName: "", title: "", note: "" });

  const dirMap = useMemo(() => new Map(safeDirections.map((d) => [String(d.id), d.name || d.id])), [safeDirections]);
  const trainerMap = useMemo(() => new Map(safeTrainers.map((t) => [String(t.id), t.name || [t.firstName, t.lastName].filter(Boolean).join(" ")])), [safeTrainers]);
  const cancelledSet = useMemo(() => new Set(safeCancelled.map((c) => `${c.groupId}:${String(c.date).slice(0, 10)}`)), [safeCancelled]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const events = useMemo(() => {
    const slots = parseGroupSchedule(safeGroups);
    const groupEvents = [];
    weekDays.forEach((day) => {
      const date = toLocalDateKey(day); const dow = day.getDay();
      slots.filter((s) => s.weekday === dow).forEach((s) => groupEvents.push({
        kind: "group", id: `${s.id}_${date}`, date, startTime: s.startTime, endTime: s.endTime || "", title: s.groupName,
        direction: dirMap.get(String(s.directionId || "")) || "—", trainer: trainerMap.get(String(s.trainerId || "")) || "—",
        cancelled: cancelledSet.has(`${s.groupId}:${date}`),
      }));
    });
    const bookingEvents = safeBookings.map((b) => ({
      kind: "booking", id: b.id, date: b.date, startTime: b.startTime, endTime: b.endTime, title: b.title,
      direction: "Individual / reserve", trainer: b.trainerName || trainerMap.get(String(b.trainerId || "")) || "—", note: b.note || "", cancelled: false,
    }));
    return [...groupEvents, ...bookingEvents].filter((e) => weekDays.some((d) => toLocalDateKey(d) === e.date));
  }, [safeGroups, weekDays, dirMap, trainerMap, cancelledSet, safeBookings]);

  const eventsByDay = useMemo(() => {
    const map = new Map(weekDays.map((d) => [toLocalDateKey(d), []]));
    events.forEach((e) => { if (map.has(e.date)) map.get(e.date).push(e); });
    map.forEach((arr) => arr.sort((a, b) => (toMin(a.startTime) || 0) - (toMin(b.startTime) || 0)));
    return map;
  }, [events, weekDays]);

  const toTopHeight = (startTime, endTime) => {
    const start = Math.max(DAY_START_HOUR * 60, toMin(startTime) ?? DAY_START_HOUR * 60);
    const endDefault = start + 60;
    const end = Math.min(DAY_END_HOUR * 60, (toMin(endTime) ?? endDefault));
    const top = ((start - DAY_START_HOUR * 60) / 60) * HOUR_PX;
    const height = Math.max(28, ((Math.max(end, start + 30) - start) / 60) * HOUR_PX);
    return { top, height, start, end };
  };

  const detectConflicts = (candidate) => {
    const cStart = toMin(candidate.startTime); const cEnd = toMin(candidate.endTime);
    if (cStart == null || cEnd == null || cEnd <= cStart) return [];
    return events.filter((e) => {
      if (e.date !== candidate.date) return false;
      const eStart = toMin(e.startTime);
      const eEnd = toMin(e.endTime);
      if (eStart == null || eEnd == null || eEnd <= eStart) return false;
      return overlaps(cStart, cEnd, eStart, eEnd);
    });
  };

  const saveBooking = async () => {
    if (!isAdmin) return;
    if (!draft.date || !draft.startTime || !draft.endTime || !draft.title.trim()) return alert("Заповніть дату, час і назву");
    const conflicts = detectConflicts(draft);
    if (conflicts.length && !window.confirm(`Є перетин у графіку (${conflicts.length}). Зберегти все одно?`)) return;
    await onAddBooking({ date: draft.date, startTime: draft.startTime, endTime: draft.endTime, trainerId: draft.trainerId || null, trainerName: draft.trainerName || null, title: draft.title.trim(), type: "individual", note: draft.note || null });
    setDraft((p) => ({ ...p, title: "", note: "" }));
    setShowForm(false);
  };

  const gridHeight = (DAY_END_HOUR - DAY_START_HOUR) * HOUR_PX;
  const today = toLocalDateKey(new Date());

  try {
    return <div style={{ display: "grid", gap: 12 }}>
    <div style={{ ...cardSt, border: `1px solid ${theme.border}`, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <button onClick={() => setWeekStart((d) => addDays(d, -7))}>← Попередній тиждень</button>
      <button onClick={() => setWeekStart(startOfWeek(new Date()))}>Сьогодні</button>
      <button onClick={() => setWeekStart((d) => addDays(d, 7))}>Наступний тиждень →</button>
      <div style={{ marginLeft: "auto", fontSize: 12, color: theme.textLight }}>Тиждень: {toLocalDateKey(weekDays[0])} — {toLocalDateKey(weekDays[6])}</div>
      {isAdmin && <button style={{ fontWeight: 700 }} onClick={() => setShowForm((v) => !v)}>+ Додати тренування / резерв</button>}
    </div>

    {isAdmin && showForm && <div style={{ ...cardSt, border: `1px solid ${theme.border}` }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8 }}>
        <input type="date" value={draft.date} onChange={(e) => setDraft((p) => ({ ...p, date: e.target.value }))} />
        <input type="time" value={draft.startTime} onChange={(e) => setDraft((p) => ({ ...p, startTime: e.target.value }))} />
        <input type="time" value={draft.endTime} onChange={(e) => setDraft((p) => ({ ...p, endTime: e.target.value }))} />
        <select value={draft.trainerId} onChange={(e) => setDraft((p) => ({ ...p, trainerId: e.target.value }))}><option value="">Тренер</option>{safeTrainers.map((t) => <option key={t.id} value={t.id}>{t.name || [t.firstName, t.lastName].filter(Boolean).join(" ")}</option>)}</select>
        <input placeholder="Назва / клієнт" value={draft.title} onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))} />
        <input placeholder="Нотатка" value={draft.note} onChange={(e) => setDraft((p) => ({ ...p, note: e.target.value }))} />
      </div>
      <div style={{ marginTop: 8 }}><button onClick={saveBooking}>Зберегти резерв</button></div>
    </div>}

    <div style={{ ...cardSt, border: `1px solid ${theme.border}`, padding: 0, overflow: "auto" }}>
      <div style={{ minWidth: 980 }}>
        <div style={{ display: "grid", gridTemplateColumns: `70px repeat(7, 1fr)`, height: HEADER_H, borderBottom: `1px solid ${theme.border}` }}>
          <div />
          {weekDays.map((d) => {
            const dk = toLocalDateKey(d); const isToday = dk === today;
            return <div key={dk} style={{ padding: "8px 10px", borderLeft: `1px solid ${theme.border}`, background: isToday ? "rgba(90,129,250,0.16)" : "transparent" }}>
              <div style={{ fontWeight: 700 }}>{d.toLocaleDateString("uk-UA", { weekday: "short" })}</div>
              <div style={{ fontSize: 12, color: theme.textLight }}>{dk}</div>
            </div>;
          })}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: `70px repeat(7, 1fr)`, position: "relative", minHeight: gridHeight }}>
          <div style={{ position: "relative", borderRight: `1px solid ${theme.border}` }}>
            {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, i) => DAY_START_HOUR + i).map((h) => <div key={h} style={{ position: "absolute", top: i * HOUR_PX - 8, left: 8, fontSize: 11, color: theme.textLight }}>{String(h).padStart(2, "0")}:00</div>)}
          </div>

          {weekDays.map((d) => {
            const dateKey = toLocalDateKey(d); const dayEvents = eventsByDay.get(dateKey) || [];
            return <div key={dateKey} style={{ position: "relative", borderLeft: `1px solid ${theme.border}`, minHeight: gridHeight }}>
              {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, i) => <div key={i} style={{ position: "absolute", top: i * HOUR_PX, left: 0, right: 0, borderTop: `1px solid ${theme.border}`, opacity: 0.45 }} />)}
              {dayEvents.map((e, idx) => {
                const { top, height, start, end } = toTopHeight(e.startTime, e.endTime);
                const overlapCount = dayEvents.filter((x) => overlaps(start, end, toTopHeight(x.startTime, x.endTime).start, toTopHeight(x.startTime, x.endTime).end)).length;
                const width = overlapCount > 1 ? "47%" : "94%";
                const left = overlapCount > 1 ? `${(idx % 2) * 49 + 3}%` : "3%";
                const c = pickColor(e);
                return <div key={e.id} style={{ position: "absolute", top, left, width, height, padding: 6, borderRadius: 10, border: `1px solid ${c.border}`, background: c.bg, overflow: "hidden", fontSize: 11 }}>
                  <div style={{ fontWeight: 800, fontSize: 12, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{e.title}</div>
                  <div style={{ color: theme.textLight }}>{e.startTime}{e.endTime ? `–${e.endTime}` : ""} · {e.kind === "booking" ? "Reserve" : e.direction}</div>
                  <div style={{ whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{e.trainer}</div>
                  {e.cancelled && <div style={{ color: theme.danger, fontWeight: 700 }}>cancelled</div>}
                  {isAdmin && e.kind === "booking" && <button style={{ marginTop: 4, fontSize: 10 }} onClick={() => onDeleteBooking(e.id)}>Видалити</button>}
                </div>;
              })}
            </div>;
          })}
        </div>
      </div>
    </div>
  </div>;
  } catch (e) {
    return <div style={{ ...cardSt, border: `1px solid ${theme.danger}` }}>
      <b>Графік тимчасово недоступний</b>
      <div style={{ marginTop: 6, fontSize: 12, color: theme.textLight }}>
        Помилка рендеру ScheduleTab: {String(e?.message || e)}
      </div>
    </div>;
  }
}
