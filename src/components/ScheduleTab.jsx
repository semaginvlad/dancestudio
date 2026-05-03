import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { btnP, btnS, cardSt, inputSt, theme } from "../shared/constants";
import { useStickyState } from "../shared/utils";

const DAY_START_HOUR = 8;
const DAY_END_HOUR = 22;
const HOUR_PX = 54;
const MIN_EVENT_HEIGHT = 24;
const DEFAULT_TYPES = [
  {
    id: "individual_1_2",
    label: "Індивідуальне 1–2 особи",
    peopleMin: 1,
    peopleMax: 2,
    price: 200,
  },
  {
    id: "small_group_3_9",
    label: "Міні-група 3–9 осіб",
    peopleMin: 3,
    peopleMax: 9,
    price: 500,
  },
  {
    id: "group_10_plus",
    label: "Група 10+ осіб",
    peopleMin: 10,
    peopleMax: null,
    price: 1000,
  },
];
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
const addDays = (date, days) => {
  const d = new Date(`${toLocalDateKey(date)}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d;
};
const toMin = (t = "") => {
  const raw = String(t || "").trim();
  if (!raw) return null;
  const n = raw.replace(/\s+/g, "").replace(".", ":");
  if (n.includes("-")) return toMin(n.split("-")[0]);
  if (/^\d{1,2}$/.test(n)) return Number(n) * 60;
  const [h, m] = n.split(":");
  const hh = Number(h);
  const mm = Number(m || 0);
  return Number.isFinite(hh) && Number.isFinite(mm) ? hh * 60 + mm : null;
};
const minToHHMM = (mins) => {
  const m = ((Number(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const overlaps = (aS, aE, bS, bE) => aS < bE && bS < aE;
const parseWeekday = (raw) => {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (Number.isFinite(n)) {
    if (n >= 0 && n <= 6) return n;
    if (n >= 1 && n <= 7) return n % 7;
  }
  const m = {
    mon: 1,
    monday: 1,
    пн: 1,
    tue: 2,
    tuesday: 2,
    вт: 2,
    wed: 3,
    wednesday: 3,
    ср: 3,
    thu: 4,
    thursday: 4,
    чт: 4,
    fri: 5,
    friday: 5,
    пт: 5,
    sat: 6,
    saturday: 6,
    сб: 6,
    sun: 0,
    sunday: 0,
    нд: 0,
  };
  return m[String(raw).trim().toLowerCase()] ?? null;
};
const norm = (s = "") => String(s).toLowerCase().replace(/[-_]/g, " ");
const colorKey = (e) => {
  if (e.cancelled) return "cancelled";
  const t = `${norm(e.direction)} ${norm(e.title)} ${norm(e.eventType)}`;
  if (/custom_admin_event/.test(t)) return "custom";
  if (e.kind === "booking") return "reserve";
  if (/latin|latina|латина/.test(t)) return "latin";
  if (/bachata|бачата/.test(t)) return "bachata";
  if (/high heels|heels/.test(t)) return "high_heels";
  if (/jazz funk|jazz-funk/.test(t)) return "jazz_funk";
  if (/k pop|kpop|k-pop/.test(t)) return "k_pop";
  if (/dancehall/.test(t)) return "dancehall";
  return "default";
};
const palette = {
  latin: { bg: "rgba(250,211,144,.24)", border: "#f59e0b" },
  bachata: { bg: "rgba(244,114,182,.22)", border: "#ec4899" },
  high_heels: { bg: "rgba(196,181,253,.24)", border: "#8b5cf6" },
  jazz_funk: { bg: "rgba(147,197,253,.22)", border: "#3b82f6" },
  k_pop: { bg: "rgba(134,239,172,.22)", border: "#22c55e" },
  dancehall: { bg: "rgba(132,204,22,.22)", border: "#65a30d" },
  reserve: { bg: "rgba(45,212,191,.2)", border: "#14b8a6" },
  custom: { bg: "rgba(129,140,248,.2)", border: "#6366f1" },
  cancelled: { bg: "rgba(248,113,113,.16)", border: theme.danger },
  default: { bg: "rgba(148,163,184,.2)", border: "#64748b" },
};

const layoutDayEvents = (events = []) => {
  const sorted = [...events].sort(
    (a, b) =>
      a.startMin - b.startMin ||
      a.endMin - b.endMin ||
      String(a.title).localeCompare(String(b.title)),
  );
  const clusters = [];
  let cur = [];
  let curEnd = -1;
  sorted.forEach((e) => {
    if (!cur.length || e.startMin < curEnd) {
      cur.push(e);
      curEnd = Math.max(curEnd, e.endMin);
    } else {
      clusters.push(cur);
      cur = [e];
      curEnd = e.endMin;
    }
  });
  if (cur.length) clusters.push(cur);
  const out = [];
  clusters.forEach((cluster) => {
    const colsEnd = [];
    const local = [];
    cluster.forEach((e) => {
      let col = colsEnd.findIndex((x) => x <= e.startMin);
      if (col === -1) {
        colsEnd.push(e.endMin);
        col = colsEnd.length - 1;
      } else colsEnd[col] = e.endMin;
      local.push({ ...e, colIndex: col });
    });
    const colCount = Math.max(colsEnd.length, 1);
    local.forEach((e) => out.push({ ...e, colCount }));
  });
  return out;
};

export default function ScheduleTab({
  groups = [],
  directionsList = [],
  trainers = [],
  cancelled = [],
  roomBookings = [],
  isAdmin = false,
  onAddBooking,
  onDeleteBooking,
  onUpdateBooking,
}) {
  const safeGroups = Array.isArray(groups) ? groups : [];
  const safeDirections = Array.isArray(directionsList) ? directionsList : [];
  const safeTrainers = Array.isArray(trainers) ? trainers : [];
  const safeCancelled = Array.isArray(cancelled) ? cancelled : [];
  const safeBookings = Array.isArray(roomBookings) ? roomBookings : [];
  const [bookingTypes, setBookingTypes] = useStickyState(
    DEFAULT_TYPES,
    "ds_schedule_booking_options_v1",
  );
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [openMenuState, setOpenMenuState] = useState(null); // { eventId, top, left }
  const [draft, setDraft] = useState({
    date: toLocalDateKey(new Date()),
    startTime: "12:00",
    endTime: "13:00",
    eventType: "room_booking",
    bookingType: DEFAULT_TYPES[0].id,
    paymentMethod: "card",
    peopleCount: 1,
    trainerId: "",
    trainerName: "",
    title: "",
    note: "",
    price: DEFAULT_TYPES[0].price,
  });
  const dirMap = useMemo(
    () => new Map(safeDirections.map((d) => [String(d.id), d.name || d.id])),
    [safeDirections],
  );
  const trainerMap = useMemo(
    () =>
      new Map(
        safeTrainers.map((t) => [
          String(t.id),
          t.name || [t.firstName, t.lastName].filter(Boolean).join(" "),
        ]),
      ),
    [safeTrainers],
  );
  const cancelledSet = useMemo(
    () =>
      new Set(
        safeCancelled.map((c) => `${c.groupId}:${String(c.date).slice(0, 10)}`),
      ),
    [safeCancelled],
  );
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const eventsByDay = useMemo(() => {
    const map = new Map(weekDays.map((d) => [toLocalDateKey(d), []]));
    const slots = [];
    safeGroups.forEach((g) =>
      (Array.isArray(g.schedule) ? g.schedule : []).forEach((row, idx) => {
        const wd = parseWeekday(
          row.weekday ?? row.dayOfWeek ?? row.day ?? row.dow ?? row.weekDay,
        );
        const st = toMin(row.startTime || row.start || row.time || "");
        if (wd == null || st == null) return;
        const en = toMin(row.endTime || row.end || "") ?? st + 60;
        slots.push({
          id: `${g.id}_${idx}`,
          groupId: g.id,
          weekday: wd,
          startTime: minToHHMM(st),
          endTime: minToHHMM(en),
          title: g.name || g.id,
          direction: dirMap.get(String(g.directionId || "")) || "—",
          trainer: trainerMap.get(String(g.trainer_id || "")) || "—",
        });
      }),
    );
    weekDays.forEach((d) => {
      const date = toLocalDateKey(d);
      slots
        .filter((s) => s.weekday === d.getDay())
        .forEach((s) => {
          const st = toMin(s.startTime);
          const en = toMin(s.endTime) ?? st + 60;
          map
            .get(date)
            .push({
              ...s,
              kind: "group",
              eventType: "group_lesson",
              date,
              startMin: st,
              endMin: en,
              cancelled: cancelledSet.has(`${s.groupId}:${date}`),
            });
        });
    });
    safeBookings.forEach((b) => {
      if (!map.has(b.date)) return;
      const st = toMin(b.startTime);
      const en = toMin(b.endTime);
      if (st == null || en == null || en <= st) return;
      const bt = bookingTypes.find(
        (x) => x.id === (b.bookingType || b.booking_type || b.type),
      );
      map
        .get(b.date)
        .push({
          id: b.id,
          kind: "booking",
          date: b.date,
          startTime: b.startTime,
          endTime: b.endTime,
          startMin: st,
          endMin: en,
          title: b.title || "Подія",
          direction: bt?.label || "Reserve",
          trainer:
            b.trainerName || trainerMap.get(String(b.trainerId || "")) || "—",
          peopleCount: b.peopleCount ?? b.people_count,
          price: b.price,
          paymentMethod: b.paymentMethod || b.payment_method,
          bookingType: b.bookingType || b.booking_type || b.type,
          eventType: b.eventType || b.event_type || "room_booking",
          note: b.note || "",
        });
    });
    map.forEach((arr, k) => map.set(k, layoutDayEvents(arr)));
    return map;
  }, [
    weekDays,
    safeGroups,
    safeBookings,
    dirMap,
    trainerMap,
    cancelledSet,
    bookingTypes,
  ]);

  const saveBooking = async () => {
    if (!isAdmin) return;
    const st = toMin(draft.startTime);
    const en = toMin(draft.endTime);
    if (
      !draft.date ||
      !draft.title.trim() ||
      st == null ||
      en == null ||
      en <= st
    )
      return alert("Перевірте дату/час/назву");
    const payload = {
      ...draft,
      title: draft.title.trim(),
      trainerId: draft.trainerId || null,
      trainerName: draft.trainerName || null,
      peopleCount:
        draft.eventType === "custom_admin_event"
          ? null
          : Number(draft.peopleCount || 0) || null,
      price:
        draft.eventType === "custom_admin_event"
          ? null
          : Number(draft.price || 0) || null,
      bookingType:
        draft.eventType === "custom_admin_event" ? null : draft.bookingType,
      paymentMethod:
        draft.eventType === "custom_admin_event"
          ? "none"
          : draft.paymentMethod || "none",
    };
    if (editingId) await onUpdateBooking(editingId, payload);
    else await onAddBooking(payload);
    setShowForm(false);
    setEditingId(null);
  };
  const startEdit = (e) => {
    setEditingId(e.id);
    setShowForm(true);
    setDraft((p) => ({
      ...p,
      date: e.date,
      startTime: e.startTime,
      endTime: e.endTime,
      eventType: e.eventType || "room_booking",
      bookingType: e.bookingType || DEFAULT_TYPES[0].id,
      paymentMethod: e.paymentMethod || "none",
      peopleCount: e.peopleCount || 0,
      price: e.price || 0,
      trainerName: e.trainer || "",
      title: e.title || "",
      note: e.note || "",
    }));
  };

  const duplicateBookingLikeEvent = (e) => {
    setEditingId(null);
    setShowForm(true);
    setDraft((p) => ({
      ...p,
      date: e.date,
      startTime: e.startTime,
      endTime: e.endTime,
      eventType: e.eventType || "room_booking",
      bookingType: e.bookingType || DEFAULT_TYPES[0].id,
      paymentMethod: e.paymentMethod || "none",
      peopleCount: e.peopleCount || 0,
      price: e.price || 0,
      trainerName: e.trainer || "",
      title: e.title || "",
      note: e.note || "",
    }));
  };

  useEffect(() => {
    if (!openMenuState) return undefined;
    const onDocClick = () => setOpenMenuState(null);
    const onEsc = (ev) => {
      if (ev.key === "Escape") setOpenMenuState(null);
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [openMenuState]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          ...cardSt,
          border: `1px solid ${theme.border}`,
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          style={btnS}
          onClick={() => setWeekStart((d) => addDays(d, -7))}
        >
          ← Попередній тиждень
        </button>
        <button
          style={btnS}
          onClick={() => setWeekStart(startOfWeek(new Date()))}
        >
          Сьогодні
        </button>
        <button style={btnS} onClick={() => setWeekStart((d) => addDays(d, 7))}>
          Наступний тиждень →
        </button>
        <div
          style={{ marginLeft: "auto", fontSize: 12, color: theme.textLight }}
        >
          Тиждень: {toLocalDateKey(weekDays[0])} — {toLocalDateKey(weekDays[6])}
        </div>
        {isAdmin && (
          <button
            style={btnP}
            onClick={() => {
              setEditingId(null);
              setShowForm((v) => !v);
            }}
          >
            + Додати тренування / резерв
          </button>
        )}
      </div>

      {isAdmin && showForm && (
        <div style={{ ...cardSt, border: `1px solid ${theme.border}` }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
              gap: 8,
            }}
          >
            <select
              style={inputSt}
              value={draft.eventType}
              onChange={(e) =>
                setDraft((p) => ({ ...p, eventType: e.target.value }))
              }
            >
              <option value="room_booking">Резерв залу</option>
              <option value="individual_training">
                Індивідуальне тренування
              </option>
              <option value="custom_admin_event">Custom event</option>
            </select>
            <input
              style={inputSt}
              type="date"
              value={draft.date}
              onChange={(e) =>
                setDraft((p) => ({ ...p, date: e.target.value }))
              }
            />
            <input
              style={inputSt}
              type="time"
              value={draft.startTime}
              onChange={(e) =>
                setDraft((p) => ({ ...p, startTime: e.target.value }))
              }
            />
            <input
              style={inputSt}
              type="time"
              value={draft.endTime}
              onChange={(e) =>
                setDraft((p) => ({ ...p, endTime: e.target.value }))
              }
            />
            {draft.eventType !== "custom_admin_event" && (
              <>
                <select
                  style={inputSt}
                  value={draft.bookingType}
                  onChange={(e) => {
                    const bt = bookingTypes.find(
                      (x) => x.id === e.target.value,
                    );
                    setDraft((p) => ({
                      ...p,
                      bookingType: e.target.value,
                      price: bt?.price || p.price,
                    }));
                  }}
                >
                  {bookingTypes.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
                <input
                  style={inputSt}
                  type="number"
                  placeholder="К-ть людей"
                  value={draft.peopleCount}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      peopleCount: Number(e.target.value || 0),
                    }))
                  }
                />
                <input
                  style={inputSt}
                  type="number"
                  placeholder="Ціна"
                  value={draft.price}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      price: Number(e.target.value || 0),
                    }))
                  }
                />
                <select
                  style={inputSt}
                  value={draft.paymentMethod}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, paymentMethod: e.target.value }))
                  }
                >
                  <option value="card">card</option>
                  <option value="cash">cash</option>
                  <option value="none">none</option>
                </select>
              </>
            )}
            <select
              style={inputSt}
              value={draft.trainerId}
              onChange={(e) =>
                setDraft((p) => ({ ...p, trainerId: e.target.value }))
              }
            >
              <option value="">Тренер</option>
              {safeTrainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name ||
                    [t.firstName, t.lastName].filter(Boolean).join(" ")}
                </option>
              ))}
            </select>
            <input
              style={inputSt}
              placeholder="Назва / клієнт"
              value={draft.title}
              onChange={(e) =>
                setDraft((p) => ({ ...p, title: e.target.value }))
              }
            />
            <input
              style={inputSt}
              placeholder="Нотатка"
              value={draft.note}
              onChange={(e) =>
                setDraft((p) => ({ ...p, note: e.target.value }))
              }
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button style={btnP} onClick={saveBooking}>
              {editingId ? "Зберегти зміни" : "Зберегти резерв"}
            </button>
            <button
              style={btnS}
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
            >
              Скасувати
            </button>
          </div>
        </div>
      )}

      <div
        style={{
          ...cardSt,
          border: `1px solid ${theme.border}`,
          padding: 0,
          overflow: "auto",
        }}
      >
        <div style={{ minWidth: 980 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "70px repeat(7,1fr)",
              borderBottom: `1px solid ${theme.border}`,
              minHeight: 56,
            }}
          >
            <div />
            {weekDays.map((d) => (
              <div
                key={toLocalDateKey(d)}
                style={{ padding: 8, borderLeft: `1px solid ${theme.border}` }}
              >
                <b>{d.toLocaleDateString("uk-UA", { weekday: "short" })}</b>
                <div style={{ fontSize: 12, color: theme.textLight }}>
                  {toLocalDateKey(d)}
                </div>
              </div>
            ))}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "70px repeat(7,1fr)",
              minHeight: (DAY_END_HOUR - DAY_START_HOUR) * HOUR_PX,
            }}
          >
            <div
              style={{
                position: "relative",
                borderRight: `1px solid ${theme.border}`,
              }}
            >
              {Array.from(
                { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
                (_, i) => (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      top: i * HOUR_PX - 8,
                      left: 8,
                      fontSize: 11,
                      color: theme.textLight,
                    }}
                  >
                    {String(DAY_START_HOUR + i).padStart(2, "0")}:00
                  </div>
                ),
              )}
            </div>
            {weekDays.map((d) => {
              const date = toLocalDateKey(d);
              const dayEvents = eventsByDay.get(date) || [];
              return (
                <div
                  key={date}
                  style={{
                    position: "relative",
                    borderLeft: `1px solid ${theme.border}`,
                  }}
                >
                  {Array.from(
                    { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
                    (_, i) => (
                      <div
                        key={i}
                        style={{
                          position: "absolute",
                          top: i * HOUR_PX,
                          left: 0,
                          right: 0,
                          borderTop: `1px solid ${theme.border}`,
                          opacity: 0.35,
                        }}
                      />
                    ),
                  )}
                  {dayEvents.map((e) => {
                    const dur = Math.max(0, e.endMin - e.startMin);
                    const top =
                      ((e.startMin - DAY_START_HOUR * 60) / 60) * HOUR_PX;
                    const height = Math.max(
                      MIN_EVENT_HEIGHT,
                      (dur / 60) * HOUR_PX,
                    );
                    const gap = 2;
                    const available = 94;
                    const width =
                      e.colCount > 1
                        ? (available - gap * (e.colCount - 1)) / e.colCount
                        : available;
                    const left = 3 + e.colIndex * (width + gap);
                    const c = palette[colorKey(e)] || palette.default;
                    return (
                      <div
                        key={e.id}
                        style={{
                          position: "absolute",
                          top,
                          left: `${left}%`,
                          width: `${width}%`,
                          height,
                          border: `1px solid ${c.border}`,
                          background: c.bg,
                          borderRadius: 10,
                          padding: 6,
                          fontSize: 11,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "start",
                            gap: 6,
                          }}
                        >
                          <div style={{ fontWeight: 700, paddingRight: 8 }}>
                            {e.title}
                          </div>
                          {isAdmin && (
                            <div style={{ position: "relative" }}>
                              <button
                                style={{
                                  ...btnS,
                                  padding: "0 6px",
                                  fontSize: 12,
                                  lineHeight: "16px",
                                }}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  const rect = ev.currentTarget.getBoundingClientRect();
                                  setOpenMenuState((prev) =>
                                    prev?.eventId === e.id
                                      ? null
                                      : {
                                          eventId: e.id,
                                          top: rect.bottom + 6,
                                          left: rect.right - 190,
                                        },
                                  );
                                }}
                              >
                                ⋮
                              </button>
                              {openMenuState?.eventId === e.id &&
                                createPortal(
                                  <div
                                    onClick={(ev) => ev.stopPropagation()}
                                    style={{
                                      position: "fixed",
                                      left: Math.max(8, openMenuState.left),
                                      top: Math.max(8, openMenuState.top),
                                      zIndex: 3000,
                                      minWidth: 190,
                                      background: theme.card,
                                      border: `1px solid ${theme.border}`,
                                      borderRadius: 8,
                                      padding: 6,
                                      display: "grid",
                                      gap: 4,
                                      boxShadow: "0 10px 28px rgba(0,0,0,.25)",
                                    }}
                                  >
                                  {e.kind === "booking" ? (
                                    <>
                                      <button
                                        style={btnS}
                                        onClick={() => {
                                          setOpenMenuState(null);
                                          startEdit(e);
                                        }}
                                      >
                                        Редагувати
                                      </button>
                                      <button
                                        style={btnS}
                                        onClick={() => {
                                          setOpenMenuState(null);
                                          duplicateBookingLikeEvent(e);
                                        }}
                                      >
                                        Дублювати
                                      </button>
                                      <button
                                        style={btnS}
                                        onClick={() => {
                                          setOpenMenuState(null);
                                          if (window.confirm("Видалити подію?"))
                                            onDeleteBooking(e.id);
                                        }}
                                      >
                                        Видалити
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        style={btnS}
                                        onClick={() => {
                                          setOpenMenuState(null);
                                          alert(
                                            `Деталі заняття:\n${e.title}\nДата: ${e.date}\nЧас: ${e.startTime}-${e.endTime}\nНапрямок: ${e.direction}\nТренер: ${e.trainer}`,
                                          );
                                        }}
                                      >
                                        Деталі заняття
                                      </button>
                                      <button
                                        style={btnS}
                                        onClick={() => {
                                          setOpenMenuState(null);
                                          alert(
                                            "Редагування групових занять буде додано наступним кроком",
                                          );
                                        }}
                                      >
                                        Редагувати групу
                                      </button>
                                      <button
                                        style={btnS}
                                        onClick={() => {
                                          setOpenMenuState(null);
                                          alert(
                                            "Скасування з графіка буде додано наступним кроком",
                                          );
                                        }}
                                      >
                                        Скасувати заняття
                                      </button>
                                    </>
                                  )}
                                  </div>,
                                  document.body,
                                )}
                            </div>
                          )}
                        </div>
                        <div>
                          {e.startTime}–{e.endTime}
                        </div>
                        <div>{e.trainer}</div>
                        {e.peopleCount ? <div>{e.peopleCount} ос.</div> : null}
                        {e.price ? <div>{e.price}₴</div> : null}
                        {e.paymentMethod && e.paymentMethod !== "none" ? (
                          <div>{e.paymentMethod}</div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {isAdmin && (
        <div style={{ ...cardSt, border: `1px solid ${theme.border}` }}>
          <b>Типи резерву / ціни</b>
          {bookingTypes.map((t, i) => (
            <div
              key={t.id}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 120px",
                gap: 8,
                marginTop: 6,
              }}
            >
              <input
                style={inputSt}
                value={t.label}
                onChange={(e) =>
                  setBookingTypes((p) =>
                    p.map((x, idx) =>
                      idx === i ? { ...x, label: e.target.value } : x,
                    ),
                  )
                }
              />
              <input
                style={inputSt}
                type="number"
                value={t.price}
                onChange={(e) =>
                  setBookingTypes((p) =>
                    p.map((x, idx) =>
                      idx === i
                        ? { ...x, price: Number(e.target.value || 0) }
                        : x,
                    ),
                  )
                }
              />
            </div>
          ))}
          <button
            style={{ ...btnS, marginTop: 8 }}
            onClick={() => setBookingTypes(DEFAULT_TYPES)}
          >
            Reset to defaults
          </button>
        </div>
      )}
    </div>
  );
}
