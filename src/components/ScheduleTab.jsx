import React, { useMemo, useState } from "react";
import { cardSt, theme } from "../shared/constants";
import { useStickyState } from "../shared/utils";

const DAY_START_HOUR = 8;
const DAY_END_HOUR = 22;
const HOUR_PX = 54;
const MIN_EVENT_HEIGHT = 24;
const DEFAULT_TYPES = [
  { id: "individual_1_2", label: "Індивідуальне 1–2 особи", peopleMin: 1, peopleMax: 2, price: 200 },
  { id: "small_group_3_9", label: "Міні-група 3–9 осіб", peopleMin: 3, peopleMax: 9, price: 500 },
  { id: "group_10_plus", label: "Група 10+ осіб", peopleMin: 10, peopleMax: null, price: 1000 },
];
const toLocalDateKey = (date) => { const d = date instanceof Date ? date : new Date(date); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const startOfWeek = (date) => { const d = new Date(`${toLocalDateKey(date)}T12:00:00`); const day = d.getDay(); d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); return d; };
const addDays = (date, days) => { const d = new Date(`${toLocalDateKey(date)}T12:00:00`); d.setDate(d.getDate() + days); return d; };
const toMin = (t = "") => { const [h, m] = String(t || "").split(":"); const hh = Number(h); const mm = Number(m || 0); return Number.isFinite(hh) && Number.isFinite(mm) ? hh * 60 + mm : null; };
const overlaps = (aS, aE, bS, bE) => aS < bE && bS < aE;
const parseWeekday = (raw) => ({ mon: 1, monday: 1, пн: 1, tue: 2, tuesday: 2, вт: 2, wed: 3, wednesday: 3, ср: 3, thu: 4, thursday: 4, чт: 4, fri: 5, friday: 5, пт: 5, sat: 6, saturday: 6, сб: 6, sun: 0, sunday: 0, нд: 0 }[String(raw || "").trim().toLowerCase()]);
const normalizeStyleKey = (s = "") => String(s).toLowerCase().replace(/[-_]/g, " ");
const getColorKey = (e = {}) => {
  if (e.cancelled) return "cancelled";
  if (e.kind === "booking") return "reserve";
  const text = `${normalizeStyleKey(e.direction)} ${normalizeStyleKey(e.title)}`;
  if (/latin|latina|латина/.test(text)) return "latin";
  if (/bachata|бачата/.test(text)) return "bachata";
  if (/high heels|heels/.test(text)) return "high_heels";
  if (/jazz funk|jazz funk|jazz-funk/.test(text)) return "jazz_funk";
  if (/k pop|kpop|k-pop/.test(text)) return "k_pop";
  if (/dancehall/.test(text)) return "dancehall";
  return "default";
};
const palette = { latin: { bg: "rgba(250,211,144,.24)", border: "#f59e0b" }, bachata: { bg: "rgba(244,114,182,.22)", border: "#ec4899" }, high_heels: { bg: "rgba(196,181,253,.24)", border: "#8b5cf6" }, jazz_funk: { bg: "rgba(147,197,253,.22)", border: "#3b82f6" }, k_pop: { bg: "rgba(134,239,172,.22)", border: "#22c55e" }, dancehall: { bg: "rgba(251,191,36,.2)", border: "#d97706" }, reserve: { bg: "rgba(45,212,191,.2)", border: "#14b8a6" }, cancelled: { bg: "rgba(248,113,113,.16)", border: theme.danger }, default: { bg: "rgba(148,163,184,.2)", border: "#64748b" } };

const layoutDayEvents = (events = []) => {
  const sorted = [...events].sort((a, b) => (a.startMin - b.startMin) || (a.endMin - b.endMin) || String(a.title).localeCompare(String(b.title)));
  const clusters = [];
  let current = []; let currentEnd = -1;
  sorted.forEach((e) => {
    if (!current.length || e.startMin < currentEnd) { current.push(e); currentEnd = Math.max(currentEnd, e.endMin); }
    else { clusters.push(current); current = [e]; currentEnd = e.endMin; }
  });
  if (current.length) clusters.push(current);
  const laidOut = [];
  clusters.forEach((cluster) => {
    const cols = [];
    cluster.forEach((e) => {
      let colIndex = cols.findIndex((endMin) => endMin <= e.startMin);
      if (colIndex === -1) { cols.push(e.endMin); colIndex = cols.length - 1; } else cols[colIndex] = e.endMin;
      laidOut.push({ ...e, colIndex, colCount: cols.length });
    });
    const maxCols = Math.max(...laidOut.filter((x) => cluster.includes(x)).map((x) => x.colCount), 1);
    laidOut.forEach((x) => { if (cluster.includes(x)) x.colCount = maxCols; });
  });
  return laidOut;
};

export default function ScheduleTab({ groups = [], directionsList = [], trainers = [], cancelled = [], roomBookings = [], isAdmin = false, onAddBooking, onDeleteBooking }) {
  const safeGroups = Array.isArray(groups) ? groups : [];
  const safeDirections = Array.isArray(directionsList) ? directionsList : [];
  const safeTrainers = Array.isArray(trainers) ? trainers : [];
  const safeCancelled = Array.isArray(cancelled) ? cancelled : [];
  const safeBookings = Array.isArray(roomBookings) ? roomBookings : [];
  const [bookingTypes, setBookingTypes] = useStickyState(DEFAULT_TYPES, "ds_schedule_booking_options_v1");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({ date: toLocalDateKey(new Date()), startTime: "12:00", endTime: "13:00", bookingType: DEFAULT_TYPES[0].id, peopleCount: 1, trainerId: "", trainerName: "", title: "", note: "", price: DEFAULT_TYPES[0].price });
  const dirMap = useMemo(() => new Map(safeDirections.map((d) => [String(d.id), d.name || d.id])), [safeDirections]);
  const trainerMap = useMemo(() => new Map(safeTrainers.map((t) => [String(t.id), t.name || [t.firstName, t.lastName].filter(Boolean).join(" ")])), [safeTrainers]);
  const cancelledSet = useMemo(() => new Set(safeCancelled.map((c) => `${c.groupId}:${String(c.date).slice(0, 10)}`)), [safeCancelled]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const eventsByDay = useMemo(() => {
    const map = new Map(weekDays.map((d) => [toLocalDateKey(d), []]));
    const groupSlots = [];
    safeGroups.forEach((g) => (Array.isArray(g.schedule) ? g.schedule : []).forEach((row, idx) => {
      const wd = Number.isFinite(Number(row.weekday)) ? Number(row.weekday) : parseWeekday(row.weekday ?? row.dayOfWeek ?? row.day ?? row.dow ?? row.weekDay);
      const startTime = String(row.startTime || row.start || row.time || "").slice(0, 5);
      const endTime = String(row.endTime || row.end || "").slice(0, 5);
      if (wd == null || !startTime) return;
      groupSlots.push({ id: `${g.id}_${idx}`, groupId: g.id, weekday: wd, startTime, endTime, title: g.name || g.id, direction: dirMap.get(String(g.directionId || "")) || "—", trainer: trainerMap.get(String(g.trainer_id || "")) || "—" });
    }));
    weekDays.forEach((d) => {
      const date = toLocalDateKey(d);
      groupSlots.filter((s) => s.weekday === d.getDay()).forEach((s) => {
        const startMin = toMin(s.startTime); const endMin = toMin(s.endTime) ?? (startMin + 60);
        if (startMin == null) return;
        map.get(date).push({ ...s, kind: "group", date, startMin, endMin, cancelled: cancelledSet.has(`${s.groupId}:${date}`) });
      });
    });
    safeBookings.forEach((b) => {
      if (!map.has(b.date)) return;
      const startMin = toMin(b.startTime); const endMin = toMin(b.endTime);
      if (startMin == null || endMin == null || endMin <= startMin) return;
      const bt = bookingTypes.find((x) => x.id === (b.bookingType || b.booking_type || b.type));
      map.get(b.date).push({ id: b.id, kind: "booking", date: b.date, title: b.title, startTime: b.startTime, endTime: b.endTime, startMin, endMin, direction: bt?.label || "Reserve", trainer: b.trainerName || trainerMap.get(String(b.trainerId || "")) || "—", peopleCount: b.peopleCount ?? b.people_count, price: b.price, bookingType: b.bookingType || b.booking_type || b.type });
    });
    map.forEach((arr, k) => map.set(k, layoutDayEvents(arr)));
    return map;
  }, [weekDays, safeGroups, safeBookings, dirMap, trainerMap, cancelledSet, bookingTypes]);

  const saveBooking = async () => {
    if (!isAdmin) return;
    const st = toMin(draft.startTime); const en = toMin(draft.endTime);
    if (!draft.date || !draft.title.trim() || st == null || en == null || en <= st) return alert("Перевірте дату/час/назву");
    const dayEvents = eventsByDay.get(draft.date) || [];
    const conflicts = dayEvents.filter((e) => overlaps(st, en, e.startMin, e.endMin));
    if (conflicts.length && !window.confirm(`Є перетин у графіку (${conflicts.length}). Зберегти все одно?`)) return;
    await onAddBooking({ date: draft.date, startTime: draft.startTime, endTime: draft.endTime, trainerId: draft.trainerId || null, trainerName: draft.trainerName || null, title: draft.title.trim(), type: "individual", bookingType: draft.bookingType, peopleCount: Number(draft.peopleCount || 0) || null, price: Number(draft.price || 0) || null, note: draft.note || null });
    setShowForm(false);
  };

  return <div style={{ display: "grid", gap: 12 }}>
    <div style={{ ...cardSt, border: `1px solid ${theme.border}`, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <button onClick={() => setWeekStart((d) => addDays(d, -7))}>← Попередній тиждень</button><button onClick={() => setWeekStart(startOfWeek(new Date()))}>Сьогодні</button><button onClick={() => setWeekStart((d) => addDays(d, 7))}>Наступний тиждень →</button>
      <div style={{ marginLeft: "auto", fontSize: 12, color: theme.textLight }}>Тиждень: {toLocalDateKey(weekDays[0])} — {toLocalDateKey(weekDays[6])}</div>
      {isAdmin && <button onClick={() => setShowForm((v) => !v)}>+ Додати тренування / резерв</button>}
    </div>

    {isAdmin && <div style={{ ...cardSt, border: `1px solid ${theme.border}` }}><b>Типи резерву / ціни</b>{bookingTypes.map((t, i) => <div key={t.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 6, marginTop: 6 }}><input value={t.label} onChange={(e) => setBookingTypes((p) => p.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))} /><input type="number" value={t.price} onChange={(e) => setBookingTypes((p) => p.map((x, idx) => idx === i ? { ...x, price: Number(e.target.value || 0) } : x))} /></div>)}<button style={{ marginTop: 8 }} onClick={() => setBookingTypes(DEFAULT_TYPES)}>Reset default</button></div>}

    {isAdmin && showForm && <div style={{ ...cardSt, border: `1px solid ${theme.border}` }}><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8 }}>
      <input type="date" value={draft.date} onChange={(e) => setDraft((p) => ({ ...p, date: e.target.value }))} />
      <input type="time" value={draft.startTime} onChange={(e) => setDraft((p) => ({ ...p, startTime: e.target.value }))} />
      <input type="time" value={draft.endTime} onChange={(e) => setDraft((p) => ({ ...p, endTime: e.target.value }))} />
      <select value={draft.bookingType} onChange={(e) => { const b = bookingTypes.find((x) => x.id === e.target.value); setDraft((p) => ({ ...p, bookingType: e.target.value, price: b?.price || p.price })); }}>{bookingTypes.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select>
      <input type="number" placeholder="К-ть людей" value={draft.peopleCount} onChange={(e) => setDraft((p) => ({ ...p, peopleCount: Number(e.target.value || 0) }))} />
      <input type="number" placeholder="Ціна" value={draft.price} onChange={(e) => setDraft((p) => ({ ...p, price: Number(e.target.value || 0) }))} />
      <select value={draft.trainerId} onChange={(e) => setDraft((p) => ({ ...p, trainerId: e.target.value }))}><option value="">Тренер</option>{safeTrainers.map((t) => <option key={t.id} value={t.id}>{t.name || [t.firstName, t.lastName].filter(Boolean).join(" ")}</option>)}</select>
      <input placeholder="Назва / клієнт" value={draft.title} onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))} />
      <input placeholder="Нотатка" value={draft.note} onChange={(e) => setDraft((p) => ({ ...p, note: e.target.value }))} />
    </div><button style={{ marginTop: 8 }} onClick={saveBooking}>Зберегти резерв</button></div>}

    <div style={{ ...cardSt, border: `1px solid ${theme.border}`, padding: 0, overflow: "auto" }}><div style={{ minWidth: 980 }}>
      <div style={{ display: "grid", gridTemplateColumns: "70px repeat(7,1fr)", borderBottom: `1px solid ${theme.border}`, minHeight: 54 }}><div />{weekDays.map((d) => <div key={toLocalDateKey(d)} style={{ padding: 8, borderLeft: `1px solid ${theme.border}` }}><b>{d.toLocaleDateString("uk-UA", { weekday: "short" })}</b><div style={{ fontSize: 12 }}>{toLocalDateKey(d)}</div></div>)}</div>
      <div style={{ display: "grid", gridTemplateColumns: "70px repeat(7,1fr)", minHeight: (DAY_END_HOUR - DAY_START_HOUR) * HOUR_PX }}>
        <div style={{ position: "relative", borderRight: `1px solid ${theme.border}` }}>{Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, i) => <div key={i} style={{ position: "absolute", top: i * HOUR_PX - 8, left: 8, fontSize: 11 }}>{String(DAY_START_HOUR + i).padStart(2, "0")}:00</div>)}</div>
        {weekDays.map((d) => { const date = toLocalDateKey(d); const dayEvents = eventsByDay.get(date) || []; return <div key={date} style={{ position: "relative", borderLeft: `1px solid ${theme.border}` }}>
          {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, i) => <div key={i} style={{ position: "absolute", top: i * HOUR_PX, left: 0, right: 0, borderTop: `1px solid ${theme.border}`, opacity: 0.4 }} />)}
          {dayEvents.map((e) => { const dur = Math.max(0, e.endMin - e.startMin); const top = ((e.startMin - DAY_START_HOUR * 60) / 60) * HOUR_PX; const height = Math.max(MIN_EVENT_HEIGHT, (dur / 60) * HOUR_PX); const gap = 4; const widthPct = e.colCount > 1 ? (100 - gap * (e.colCount + 1)) / e.colCount : 94; const leftPct = e.colCount > 1 ? gap + e.colIndex * (widthPct + gap) : 3; const c = palette[getColorKey(e)] || palette.default; return <div key={e.id} style={{ position: "absolute", top, left: `${leftPct}%`, width: `${widthPct}%`, height, border: `1px solid ${c.border}`, background: c.bg, borderRadius: 10, padding: 6, overflow: "hidden", fontSize: 11 }}><div style={{ fontWeight: 700 }}>{e.title}</div><div>{e.startTime}–{e.endTime}</div><div>{e.direction}</div>{e.peopleCount ? <div>{e.peopleCount} ос.</div> : null}{e.price ? <div>{e.price}₴</div> : null}<div>{e.trainer}</div>{isAdmin && e.kind === "booking" && <button style={{ marginTop: 4, fontSize: 10 }} onClick={() => onDeleteBooking(e.id)}>Видалити</button>}</div>; })}
        </div>; })}
      </div>
    </div></div>
  </div>;
}
