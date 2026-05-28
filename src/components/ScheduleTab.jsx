import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { btnP, btnS, cardSt, inputSt, theme } from "../shared/constants";
import { fetchStudioRooms, createStudioRoom, updateStudioRoom, renameStudioRoom } from "../db";
import { useStickyState } from "../shared/utils";

const DAY_START_HOUR = 8;
const DAY_END_HOUR = 22;
const HOUR_PX = 54;
const MIN_EVENT_HEIGHT = 24;
const DEFAULT_TYPES = [
  {
    id: "cleaning",
    label: "Прибирання",
    peopleMin: null,
    peopleMax: null,
    price: 0,
  },
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
const roundToNearest15 = (mins) => Math.max(0, Math.round(mins / 15) * 15);
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
const normalizeLabel = (value = "") =>
  String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
const getDirectionDisplayName = (value = "") => {
  const label = normalizeLabel(value);
  if (/latin|latina|латина/.test(label)) return "Латина";
  if (/bachata|бачата/.test(label)) return "Бачата";
  if (/high heels|heels/.test(label)) return "High Heels";
  if (/jazz funk|jazz-funk/.test(label)) return "Jazz Funk";
  if (/k pop|k-pop|kpop/.test(label)) return "K-pop";
  if (/dancehall/.test(label)) return "Dancehall";
  if (/reserve|booking/.test(label)) return "Резерв";
  if (/individual/.test(label)) return "Індивідуальне";
  if (/custom/.test(label)) return "Подія";
  return value || "—";
};
const getEventTypeLabel = (value = "") => {
  const m = {
    room_booking: "Резерв залу",
    individual_training: "Індивідуальне тренування",
    cleaning: "Прибирання",
    custom_admin_event: "Кастомна подія",
    group_lesson: "Групове заняття",
  };
  return m[value] || value || "—";
};
const getTrainerDisplayName = (trainer) =>
  trainer?.name || [trainer?.firstName, trainer?.lastName].filter(Boolean).join(" ") || "";
const getRoomLabel = (event) =>
  event?.roomName ||
  event?.room_name ||
  event?.room ||
  event?.location ||
  event?.hall ||
  "";
const normalizeRoomName = (value = "") =>
  String(value || "").replace(/\s+/g, " ").trim();
const norm = (s = "") => String(s).toLowerCase().replace(/[-_]/g, " ");
const colorKey = (e) => {
  if (e.cancelled) return "cancelled";
  const t = `${norm(e.direction)} ${norm(e.title)} ${norm(e.eventType)}`;
  if (/custom_admin_event/.test(t)) return "custom";
  if (String(e.bookingType || "").toLowerCase() === "cleaning") return "cleaning";
  if (e.kind === "booking") return "reserve";
  if (/latin|latina|латина/.test(t)) return "latin";
  if (/bachata|бачата/.test(t)) return "bachata";
  if (/high heels|heels/.test(t)) return "high_heels";
  if (/jazz funk|jazz-funk/.test(t)) return "jazz_funk";
  if (/k pop|kpop|k-pop/.test(t)) return "k_pop";
  if (/dancehall/.test(t)) return "dancehall";
  return "default";
};
const recurrenceModes = ["none", "daily", "weekly", "monthly"];
const DEBUG_QUICK_CREATE = false;
const statusStyles = { active: { opacity: 1, text: "Активно" }, tentative: { opacity: 0.65, text: "Попередньо" }, cancelled: { opacity: 0.45, text: "Скасовано" } };
const palette = {
  latin: { bg: "rgba(250,211,144,.24)", border: "#f59e0b" },
  bachata: { bg: "rgba(244,114,182,.22)", border: "#ec4899" },
  high_heels: { bg: "rgba(196,181,253,.24)", border: "#8b5cf6" },
  jazz_funk: { bg: "rgba(147,197,253,.22)", border: "#3b82f6" },
  k_pop: { bg: "rgba(134,239,172,.22)", border: "#22c55e" },
  dancehall: { bg: "rgba(132,204,22,.22)", border: "#65a30d" },
  reserve: { bg: "rgba(45,212,191,.2)", border: "#14b8a6" },
  cleaning: { bg: "rgba(148,163,184,.22)", border: "#94a3b8" },
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
  allowBookingMutations = false,
  onAddBooking,
  onDeleteBooking,
  onUpdateBooking,
  onUpdateGroupSchedule,
  currentUser = null,
}) {
  const DEFAULT_ROOM = "Основна зала";
  const NO_ROOM = "Без залу";
  const safeGroups = Array.isArray(groups) ? groups : [];
  const safeDirections = Array.isArray(directionsList) ? directionsList : [];
  const safeTrainers = Array.isArray(trainers) ? trainers : [];
  const safeCancelled = Array.isArray(cancelled) ? cancelled : [];
  const safeBookings = Array.isArray(roomBookings) ? roomBookings : [];
  const canManageBookings = isAdmin || allowBookingMutations;
  const currentTrainerId = currentUser?.id ? String(currentUser.id) : "";
  const currentTrainerFromState = safeTrainers.find(
    (t) => String(t.authUserId || "") === currentTrainerId,
  ) || safeTrainers.find((t) => String(t.id) === currentTrainerId);
  const currentTrainerName =
    getTrainerDisplayName(currentTrainerFromState) ||
    currentUser?.user_metadata?.full_name ||
    currentUser?.user_metadata?.name ||
    currentUser?.email ||
    "";
  const allowedEventTypes = isAdmin
    ? ["room_booking", "individual_training", "cleaning", "custom_admin_event"]
    : ["room_booking", "individual_training"];
  const [bookingTypes, setBookingTypes] = useStickyState(
    DEFAULT_TYPES,
    "ds_schedule_booking_options_v1",
  );
  const tariffTypes = useMemo(
    () => bookingTypes.filter((type) => type.id !== "cleaning"),
    [bookingTypes],
  );
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [viewMode, setViewMode] = useState("week"); // month | week | day
  const [selectedDate, setSelectedDate] = useState(() => toLocalDateKey(new Date()));
  const [selectedRoom, setSelectedRoom] = useState("all");
  const [dayRoomColumnLimit, setDayRoomColumnLimit] = useStickyState(
    typeof window !== "undefined" && window.innerWidth < 900 ? "1" : "all",
    "ds_day_room_column_limit_v1",
  );
  const [showRoomsManager, setShowRoomsManager] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [renamingRoomId, setRenamingRoomId] = useState(null);
  const [renamingRoomName, setRenamingRoomName] = useState("");
  const [studioRooms, setStudioRooms] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [openMenuState, setOpenMenuState] = useState(null); // { eventId, top, left }
  const [groupSlotEdit, setGroupSlotEdit] = useState(null); // { groupId, slotIndex, groupName, weekday, startTime, endTime, direction, trainer, error }
  const [selectedEventDetails, setSelectedEventDetails] = useState(null);
  const [hoverSlot, setHoverSlot] = useState(null);
  const [formMode, setFormMode] = useState("full");
  const [formErrors, setFormErrors] = useState({});
  const [selection, setSelection] = useState(null);
  const [draft, setDraft] = useState({
    date: toLocalDateKey(new Date()),
    startTime: "12:00",
    endTime: "13:00",
    eventType: "room_booking",
    bookingType: DEFAULT_TYPES[1].id,
    paymentMethod: "none",
    peopleCount: 1,
    trainerId: "",
    trainerName: "",
    title: "",
    note: "",
    recurrence: "none",
    recurrenceUntil: "",
    color: "",
    description: "",
    status: "active",
    price: 0,
    roomName: DEFAULT_ROOM,
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
          getTrainerDisplayName(t),
        ]),
      ),
    [safeTrainers],
  );
  const activeStudioRooms = useMemo(() => {
    const safeStudioRooms = Array.isArray(studioRooms) ? studioRooms : [];
    return safeStudioRooms
      .filter((room) => room?.isActive !== false && normalizeRoomName(room?.name))
      .sort((a, b) => {
        const sortDiff = Number(a?.sortOrder || 0) - Number(b?.sortOrder || 0);
        if (sortDiff !== 0) return sortDiff;
        const aTs = new Date(a?.createdAt || 0).getTime();
        const bTs = new Date(b?.createdAt || 0).getTime();
        return aTs - bTs;
      });
  }, [studioRooms]);
  const primaryRoomName = useMemo(() => normalizeRoomName(activeStudioRooms[0]?.name) || DEFAULT_ROOM, [activeStudioRooms]);
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
  const buildEventsByDayForDates = useMemo(() => (dates = []) => {
    const normalizedDates = dates.map((d) => (d instanceof Date ? d : new Date(`${toLocalDateKey(d)}T12:00:00`)));
    const map = new Map(normalizedDates.map((d) => [toLocalDateKey(d), []]));
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
          slotIndex: idx,
          weekday: wd,
          startTime: minToHHMM(st),
          endTime: minToHHMM(en),
          title: g.name || g.id,
          direction: getDirectionDisplayName(dirMap.get(String(g.directionId || "")) || "—"),
          trainer: trainerMap.get(String(g.trainer_id || "")) || "—",
        });
      }),
    );
    normalizedDates.forEach((d) => {
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
              groupName: s.title,
              slotIndex: s.slotIndex,
              startMin: st,
              endMin: en,
                  cancelled: cancelledSet.has(`${s.groupId}:${date}`),
                  roomName: getRoomLabel(s) || primaryRoomName,
                });
        });
    });
    safeBookings.forEach((b) => {
      const st = toMin(b.startTime);
      const en = toMin(b.endTime);
      if (st == null || en == null || en <= st) return;
      const recurrenceRaw = String(b.recurrence || "")
        .trim()
        .toLowerCase();
      const recurrence = recurrenceModes.includes(recurrenceRaw)
        ? recurrenceRaw
        : "none";
      const until = b.recurrenceUntil
        ? new Date(`${b.recurrenceUntil}T00:00:00`)
        : null;
      const baseDate = new Date(`${b.date}T00:00:00`);
      const bt = bookingTypes.find(
        (x) => x.id === (b.bookingType || b.booking_type || b.type),
      );
      if (recurrence === "none") {
        if (!map.has(b.date)) return;
        map.get(b.date).push({
          id: `${b.id}:${b.date}`,
          parentId: b.id,
          kind: "booking",
          date: b.date,
          parentDate: b.date,
          startTime: b.startTime,
          endTime: b.endTime,
          startMin: st,
          endMin: en,
          title: b.title || "Подія",
          roomName: getRoomLabel(b) || primaryRoomName,
          direction: getDirectionDisplayName(bt?.label || "Reserve"),
          trainerId: b.trainerId || b.trainer_id || null,
          trainer:
            b.trainerName || trainerMap.get(String(b.trainerId || b.trainer_id || "")) || "—",
          peopleCount: b.peopleCount ?? b.people_count,
          price: b.price,
          paymentMethod: b.paymentMethod || b.payment_method,
          bookingType: b.bookingType || b.booking_type || b.type,
          eventType: b.eventType || b.event_type || "room_booking",
          note: b.note || "",
          recurrence,
          recurrenceUntil: b.recurrenceUntil || "",
          color: b.color || "",
          description: b.description || "",
          status: b.status || "active",
        });
        return;
      }
      normalizedDates.forEach((day) => {
        const dateKey = toLocalDateKey(day);
        if (!map.has(dateKey)) return;
        if (until && day > until) return;
        if (day < baseDate) return;
        if (recurrence === "weekly" && day.getDay() !== baseDate.getDay()) return;
        if (recurrence === "monthly" && day.getDate() !== baseDate.getDate()) return;
        map.get(dateKey).push({
          id: `${b.id}:${dateKey}`,
          parentId: b.id,
          kind: "booking",
          date: dateKey,
          parentDate: b.date,
          startTime: b.startTime,
          endTime: b.endTime,
          startMin: st,
          endMin: en,
          title: b.title || "Подія",
          roomName: getRoomLabel(b) || primaryRoomName,
          direction: getDirectionDisplayName(bt?.label || "Reserve"),
          trainerId: b.trainerId || b.trainer_id || null,
          trainer:
            b.trainerName || trainerMap.get(String(b.trainerId || b.trainer_id || "")) || "—",
          peopleCount: b.peopleCount ?? b.people_count,
          price: b.price,
          paymentMethod: b.paymentMethod || b.payment_method,
          bookingType: b.bookingType || b.booking_type || b.type,
          eventType: b.eventType || b.event_type || "room_booking",
          note: b.note || "",
          recurrence,
          recurrenceUntil: b.recurrenceUntil || "",
          color: b.color || "",
          description: b.description || "",
          status: b.status || "active",
        });
      });
    });
    map.forEach((arr, k) => {
      const deduped = [];
      const seen = new Set();
      arr.forEach((e) => {
        const dedupeKey = `${e.kind}:${e.parentId || e.id}:${e.date}:${e.startTime}:${e.endTime}`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);
        deduped.push(e);
      });
      map.set(k, layoutDayEvents(deduped));
    });
    return map;
  }, [
    safeGroups,
    safeBookings,
    dirMap,
    trainerMap,
    cancelledSet,
    bookingTypes,
    primaryRoomName,
  ]);
  const eventsByDay = useMemo(() => buildEventsByDayForDates(weekDays), [buildEventsByDayForDates, weekDays]);

  const getTariffPrice = (bookingType) =>
    tariffTypes.find((type) => type.id === bookingType)?.price || 0;
  const allKnownRooms = useMemo(() => {
    const set = new Set(activeStudioRooms.map((x) => normalizeRoomName(x?.name)).filter(Boolean));
    eventsByDay.forEach((arr) => {
      (arr || []).forEach((e) => {
        const room = normalizeRoomName(e.roomName || "");
        if (room) set.add(room);
      });
    });
    if (!set.size) set.add(DEFAULT_ROOM);
    return Array.from(set);
  }, [activeStudioRooms, eventsByDay]);
  const roomFilteredEventsByDay = useMemo(() => {
    if (selectedRoom === "all") return eventsByDay;
    const map = new Map();
    eventsByDay.forEach((arr, key) => {
      map.set(key, (arr || []).filter((e) => (e.roomName || primaryRoomName) === selectedRoom));
    });
    return map;
  }, [eventsByDay, selectedRoom, primaryRoomName]);
  const canMutateEvent = (event) =>
    isAdmin || (event?.kind === "booking" && String(event.trainerId || "") === currentTrainerId);
  const normalizeBookingPayload = (source) => {
    const eventType = allowedEventTypes.includes(source.eventType)
      ? source.eventType
      : "room_booking";
    const trainerId = isAdmin ? source.trainerId || null : currentTrainerId || null;
    const trainerName = isAdmin ? source.trainerName || null : currentTrainerName || null;
    const base = {
      ...source,
      eventType,
      trainerId,
      trainerName,
      recurrence: source.recurrence || "none",
      recurrenceUntil: source.recurrence === "none" ? null : source.recurrenceUntil || null,
      color: source.color || null,
      description: source.description || null,
      status: source.status || "active",
      roomName: normalizeRoomName(source.roomName || primaryRoomName) || primaryRoomName,
    };
    if (eventType === "individual_training") {
      const bookingType = tariffTypes.some((type) => type.id === source.bookingType)
        ? source.bookingType
        : tariffTypes[0]?.id || "individual_1_2";
      return {
        ...base,
        bookingType,
        peopleCount: Number(source.peopleCount || 0) || null,
        price: isAdmin ? Number(source.price || 0) || null : getTariffPrice(bookingType),
        paymentMethod: source.paymentMethod || "none",
      };
    }
    if (eventType === "room_booking") {
      return {
        ...base,
        bookingType: null,
        peopleCount: null,
        price: isAdmin ? Number(source.price || 0) || null : null,
        paymentMethod: "none",
      };
    }
    if (eventType === "cleaning") {
      return {
        ...base,
        bookingType: "cleaning",
        peopleCount: null,
        price: null,
        paymentMethod: "none",
      };
    }
    return {
      ...base,
      bookingType: null,
      peopleCount: null,
      price: null,
      paymentMethod: "none",
    };
  };

  const getDraftTitle = (source = {}) => {
    const eventType = source.eventType || source.type || "room_booking";
    const explicitTitle = String(source.title || source.name || "").trim();
    if (explicitTitle) return explicitTitle;
    if (eventType === "cleaning") return "Прибирання";
    if (eventType === "room_booking") {
      const bookingTypeId = source.bookingType || "";
      const bookingTypeLabel = bookingTypes.find((x) => x.id === bookingTypeId)?.label || "";
      return String(bookingTypeLabel || "Резерв залу").trim();
    }
    if (eventType === "individual_training") {
      const candidate = String(source.studentName || source.clientName || source.trainerName || "").trim();
      return candidate || "Індивідуальне тренування";
    }
    if (eventType === "group_lesson") {
      const groupTitle = String(source.groupName || source.group_title || "").trim();
      if (groupTitle) return groupTitle;
    }
    return "";
  };


  const validateDraft = (source) => {
    const st = toMin(source.startTime);
    const en = toMin(source.endTime);
    const normalizedTitle = getDraftTitle(source);
    const errors = {
      title: !normalizedTitle ? "Вкажіть назву події" : "",
      date: !source.date ? "Оберіть дату" : "",
      startTime: st == null ? "Оберіть час початку" : "",
      endTime: en == null || (st != null && en <= st) ? "Час завершення має бути пізніше" : "",
    };
    return { errors, hasErrors: Object.values(errors).some(Boolean), normalizedTitle };
  };

  const saveBooking = async () => {
    if (!canManageBookings) return;
    const { errors, hasErrors, normalizedTitle } = validateDraft(draft);
    const fallbackRoomName = normalizeRoomName(draft.roomName || (selectedRoom === "all" ? primaryRoomName : selectedRoom) || primaryRoomName) || DEFAULT_ROOM;
    setFormErrors(errors);
    if (hasErrors) return;
    const payload = normalizeBookingPayload({
      ...draft,
      title: normalizedTitle,
      roomName: fallbackRoomName,
    });
    if (editingId) await onUpdateBooking(editingId, payload);
    else await onAddBooking(payload);
    setShowForm(false);
    setEditingId(null);
    setFormErrors({});
  };
  const startEdit = (e) => {
    setEditingId(e.parentId || e.id);
    setFormMode("full");
    setShowForm(true);
    setDraft((p) => ({
      ...p,
      date: e.date,
      startTime: e.startTime,
      endTime: e.endTime,
      eventType: e.eventType || "room_booking",
      bookingType: e.bookingType || tariffTypes[0]?.id || "individual_1_2",
      paymentMethod: e.paymentMethod || "none",
      peopleCount: e.peopleCount || 0,
      price: e.price || 0,
      trainerId: isAdmin ? e.trainerId || "" : currentTrainerId,
      trainerName: e.trainer || "",
      title: e.title || "",
      roomName: e.roomName || primaryRoomName,
      note: e.note || "",
      recurrence: e.recurrence || "none",
      recurrenceUntil: e.recurrenceUntil || "",
      color: e.color || "",
      description: e.description || "",
      status: e.status || "active",
    }));
  };

  const duplicateBookingLikeEvent = (e) => {
    setEditingId(null);
    setFormMode("full");
    setShowForm(true);
    setDraft((p) => ({
      ...p,
      date: e.date,
      startTime: e.startTime,
      endTime: e.endTime,
      eventType: e.eventType || "room_booking",
      bookingType: e.bookingType || tariffTypes[0]?.id || "individual_1_2",
      paymentMethod: e.paymentMethod || "none",
      peopleCount: e.peopleCount || 0,
      price: e.price || 0,
      trainerId: isAdmin ? e.trainerId || "" : currentTrainerId,
      trainerName: e.trainer || "",
      title: e.title || "",
      roomName: e.roomName || primaryRoomName,
      note: e.note || "",
      recurrence: e.recurrence || "none",
      recurrenceUntil: e.recurrenceUntil || "",
      color: e.color || "",
      description: e.description || "",
      status: e.status || "active",
    }));
  };
  const openCreateAt = (date, minute, clickEvent, endMinuteOverride = null) => {
    const start = roundToNearest15(minute);
    const base = {
      date,
      startTime: minToHHMM(start),
      endTime: minToHHMM(endMinuteOverride || (start + 60)),
      eventType: "room_booking",
      status: "active",
      recurrence: "none",
      title: "",
      trainerId: isAdmin ? "" : currentTrainerId,
      trainerName: isAdmin ? "" : currentTrainerName,
      bookingType: tariffTypes[0]?.id || "individual_1_2",
      peopleCount: 1,
      price: 0,
      paymentMethod: "none",
      roomName: DEFAULT_ROOM,
    };
    if (DEBUG_QUICK_CREATE) console.log("[quick-create] openCreateAt", base);
    setEditingId(null);
    setFormMode("compact");
    setDraft((p) => ({ ...p, ...base }));
    setFormErrors({});
    setShowForm(true);
  };
  const minuteFromY = (y) =>
    roundToNearest15(DAY_START_HOUR * 60 + (y / HOUR_PX) * 60);
  const applyQuickToFullForm = () => setFormMode("full");

  const openGroupSlotEditor = (e) => {
    if (e.groupId == null || e.slotIndex == null) {
      setGroupSlotEdit({
        error: "Не вдалося визначити запис розкладу для редагування",
        groupName: e.groupName || e.title || "—",
        direction: e.direction || "—",
        trainer: e.trainer || "—",
      });
      return;
    }
    setGroupSlotEdit({
      groupId: e.groupId,
      slotIndex: e.slotIndex,
      groupName: e.groupName || e.title,
      weekday: e.weekday,
      startTime: e.startTime,
      endTime: e.endTime,
      direction: e.direction || "—",
      trainer: e.trainer || "—",
      error: "",
    });
  };

  const saveGroupSlotEdit = async () => {
    if (!groupSlotEdit || !onUpdateGroupSchedule || groupSlotEdit.error) return;
    if (groupSlotEdit.groupId == null || groupSlotEdit.slotIndex == null) {
      setGroupSlotEdit((p) => ({ ...(p || {}), error: "Не вдалося визначити запис розкладу для редагування" }));
      return;
    }
    const g = safeGroups.find((x) => String(x.id) === String(groupSlotEdit.groupId));
    if (!g) {
      setGroupSlotEdit((p) => ({ ...(p || {}), error: "Не вдалося визначити запис розкладу для редагування" }));
      return;
    }
    const prev = Array.isArray(g.schedule) ? g.schedule : [];
    if (!prev[groupSlotEdit.slotIndex]) {
      setGroupSlotEdit((p) => ({ ...(p || {}), error: "Не вдалося визначити запис розкладу для редагування" }));
      return;
    }
    const nextSchedule = prev.map((row, idx) => {
      if (idx !== groupSlotEdit.slotIndex) return row;
      const next = { ...row };
      if ("weekday" in next) next.weekday = groupSlotEdit.weekday;
      else if ("dayOfWeek" in next) next.dayOfWeek = groupSlotEdit.weekday;
      else if ("day" in next) next.day = groupSlotEdit.weekday;
      else if ("dow" in next) next.dow = groupSlotEdit.weekday;
      else if ("weekDay" in next) next.weekDay = groupSlotEdit.weekday;
      else next.weekday = groupSlotEdit.weekday;
      if ("startTime" in next) next.startTime = groupSlotEdit.startTime;
      else if ("start" in next) next.start = groupSlotEdit.startTime;
      else if ("time" in next) next.time = `${groupSlotEdit.startTime}-${groupSlotEdit.endTime || ""}`.replace(/-$/, "");
      else next.startTime = groupSlotEdit.startTime;
      if ("endTime" in next) next.endTime = groupSlotEdit.endTime;
      else if ("end" in next) next.end = groupSlotEdit.endTime;
      return next;
    });
    try {
      await onUpdateGroupSchedule(groupSlotEdit.groupId, nextSchedule);
      setGroupSlotEdit(null);
    } catch (err) {
      console.error(err);
      alert("Не вдалося зберегти зміни розкладу");
    }
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
  

  const selectedDateObj = useMemo(() => new Date(`${selectedDate}T12:00:00`), [selectedDate]);
  const monthStart = useMemo(() => new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth(), 1), [selectedDateObj]);
  const monthCells = useMemo(() => {
    const firstWeekday = (monthStart.getDay() + 6) % 7;
    const start = addDays(monthStart, -firstWeekday);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [monthStart]);
  const monthEventsByDay = useMemo(() => buildEventsByDayForDates(monthCells), [buildEventsByDayForDates, monthCells]);
  const dayEventsByDay = useMemo(() => buildEventsByDayForDates([selectedDateObj]), [buildEventsByDayForDates, selectedDateObj]);
  const selectedDateEvents = useMemo(() => {
    const arr = dayEventsByDay.get(selectedDate) || [];
    if (selectedRoom === "all") return arr;
    return arr.filter((e) => (e.roomName || primaryRoomName) === selectedRoom);
  }, [dayEventsByDay, selectedDate, selectedRoom, primaryRoomName]);
  const selectedDateByRoom = useMemo(() => {
    const map = new Map();
    selectedDateEvents.forEach((e) => {
      const room = (e.roomName || "").trim() || primaryRoomName || NO_ROOM;
      if (!map.has(room)) map.set(room, []);
      map.get(room).push(e);
    });
    return map;
  }, [selectedDateEvents, primaryRoomName]);
  const dayRoomsToRender = useMemo(() => {
    if (selectedRoom !== "all") return Array.from(selectedDateByRoom.entries());
    const activeRoomNames = activeStudioRooms.map((room) => normalizeRoomName(room.name)).filter(Boolean);
    const baseRooms = activeRoomNames.length ? activeRoomNames : Array.from(selectedDateByRoom.keys());
    const byRoom = new Map(baseRooms.map((room) => [room, []]));
    selectedDateEvents.forEach((event) => {
      const room = normalizeRoomName(event.roomName) || primaryRoomName;
      if (!byRoom.has(room)) byRoom.set(room, []);
      byRoom.get(room).push(event);
    });
    const limit = dayRoomColumnLimit === "all" ? byRoom.size : Math.max(1, Number(dayRoomColumnLimit || 1));
    return Array.from(byRoom.entries()).slice(0, limit);
  }, [selectedRoom, selectedDateByRoom, selectedDateEvents, activeStudioRooms, primaryRoomName, dayRoomColumnLimit]);

  const dayRoomGridTemplate = useMemo(() => {
    if (selectedRoom !== "all") return "minmax(260px,1fr)";
    const count = Math.max(1, dayRoomsToRender.length);
    if (dayRoomColumnLimit === "all") return `repeat(${count}, minmax(240px, 1fr))`;
    return `repeat(${Math.max(1, Number(dayRoomColumnLimit || 1))}, minmax(240px, 1fr))`;
  }, [selectedRoom, dayRoomsToRender.length, dayRoomColumnLimit]);

  const shiftSelectedDate = (days) => setSelectedDate(toLocalDateKey(addDays(selectedDateObj, days)));
  const loadStudioRooms = async () => {
    try {
      const rooms = await fetchStudioRooms();
      setStudioRooms(Array.isArray(rooms) ? rooms : []);
    } catch (error) {
      console.warn("Failed to load studio rooms:", error);
      setStudioRooms([]);
    }
  };
  const addCustomRoom = async () => {
    const next = normalizeRoomName(newRoomName);
    if (!next) return;
    try {
      await createStudioRoom(next);
    } catch (error) {
      console.warn("Failed to create studio room:", error);
    }
    setNewRoomName("");
    await loadStudioRooms();
  };
  const removeCustomRoom = async (room) => {
    try {
      await updateStudioRoom(room.id, { isActive: false });
    } catch (error) {
      console.warn("Failed to archive studio room:", error);
    }
    if (String(selectedRoom || "").toLowerCase() === normalizeRoomName(room.name).toLowerCase()) setSelectedRoom("all");
    await loadStudioRooms();
  };
  const startRenameRoom = (room) => {
    setRenamingRoomId(room.id);
    setRenamingRoomName(room.name || "");
  };
  const cancelRenameRoom = () => {
    setRenamingRoomId(null);
    setRenamingRoomName("");
  };
  const saveRenameRoom = async (room) => {
    const nextName = normalizeRoomName(renamingRoomName);
    if (!nextName) return;
    const duplicate = (Array.isArray(studioRooms) ? studioRooms : []).some((x) =>
      x.id !== room.id && normalizeRoomName(x.name).toLowerCase() === nextName.toLowerCase(),
    );
    if (duplicate) {
      console.warn("Failed to rename studio room: duplicate name", nextName);
      return;
    }
    try {
      await renameStudioRoom(room.id, room.name, nextName);
      if (String(selectedRoom || "").toLowerCase() === normalizeRoomName(room.name).toLowerCase()) {
        setSelectedRoom(nextName);
      }
      await loadStudioRooms();
      cancelRenameRoom();
    } catch (error) {
      console.warn("Failed to rename studio room:", error);
    }
  };
  useEffect(() => { loadStudioRooms(); }, []);
  useEffect(() => {
    if (selectedRoom === "all") return;
    if (!allKnownRooms.includes(selectedRoom)) setSelectedRoom("all");
  }, [selectedRoom, allKnownRooms]);
  const isTodaySelected = selectedDate === toLocalDateKey(new Date());
  const nowMinute = (() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  })();
  const isNarrowScreen = typeof window !== "undefined" ? window.innerWidth < 900 : false;
  const isMobile = typeof window !== "undefined" ? window.innerWidth < 768 : false;
  const isDarkTheme = String(theme.bg || "").toLowerCase() !== "#ffffff";
  const typeAccent = {
    group_lesson: { bg: "rgba(245,158,11,.14)", border: "#f59e0b", text: "#b45309" },
    individual_training: { bg: "rgba(20,184,166,.14)", border: "#14b8a6", text: "#0f766e" },
    room_booking: { bg: "rgba(59,130,246,.12)", border: "#3b82f6", text: "#1d4ed8" },
    cleaning: { bg: "rgba(100,116,139,.16)", border: "#64748b", text: "#475569" },
    custom_admin_event: { bg: "rgba(168,85,247,.14)", border: "#a855f7", text: "#7e22ce" },
  };
  const monthHasEvents = useMemo(
    () => monthCells.some((d) => ((selectedRoom === "all" ? monthEventsByDay.get(toLocalDateKey(d)) : (monthEventsByDay.get(toLocalDateKey(d)) || []).filter((e) => (e.roomName || primaryRoomName) === selectedRoom)) || []).length > 0),
    [monthCells, monthEventsByDay, selectedRoom, primaryRoomName],
  );
  const weekHasEvents = useMemo(
    () => weekDays.some((d) => (roomFilteredEventsByDay.get(toLocalDateKey(d)) || []).length > 0),
    [weekDays, roomFilteredEventsByDay],
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ ...cardSt, border: `1px solid ${theme.border}`, display: "grid", gap: isMobile ? 8 : 10 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          style={{ ...btnS, minHeight: isMobile ? 44 : undefined, fontSize: isMobile ? 13 : undefined }}
          onClick={() => setWeekStart((d) => addDays(d, -7))}
        >
          ← Попередній тиждень
        </button>
        <button
          style={{ ...btnS, minHeight: isMobile ? 44 : undefined, fontSize: isMobile ? 13 : undefined }}
          onClick={() => setWeekStart(startOfWeek(new Date()))}
        >
          Сьогодні
        </button>
        <button style={{ ...btnS, minHeight: isMobile ? 44 : undefined, fontSize: isMobile ? 13 : undefined }} onClick={() => setWeekStart((d) => addDays(d, 7))}>
          Наступний тиждень →
        </button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[
            { id: "month", label: "Місяць" },
            { id: "week", label: "Тиждень" },
            { id: "day", label: "День" },
          ].map((m) => (
            <button
              key={m.id}
              style={{ ...(viewMode === m.id ? btnP : btnS), minHeight: isMobile ? 44 : undefined, fontSize: isMobile ? 13 : undefined }}
              onClick={() => setViewMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select
          style={{ ...inputSt, minHeight: 44, maxWidth: isMobile ? "100%" : 210, fontSize: isMobile ? 13 : undefined }}
          value={selectedRoom}
          onChange={(e) => setSelectedRoom(e.target.value)}
        >
          <option value="all">Усі зали</option>
          {allKnownRooms.map((room) => <option key={room} value={room}>{room}</option>)}
        </select>
        <button style={{ ...btnS, minHeight: isMobile ? 44 : undefined }} onClick={() => setShowRoomsManager((v) => !v)}>Зали</button>
        <div
          style={{ marginLeft: isMobile ? 0 : "auto", fontSize: 12, color: theme.textLight }}
        >
          Тиждень: {toLocalDateKey(weekDays[0])} — {toLocalDateKey(weekDays[6])}
        </div>
        {canManageBookings && (
          <button
            style={{ ...btnP, minHeight: isMobile ? 44 : undefined, fontSize: isMobile ? 13 : undefined }}
            onClick={() => {
              setEditingId(null);
              setFormMode("full");
              setShowForm((v) => !v);
            }}
          >
            + Додати тренування / резерв
          </button>
        )}
        </div>
      </div>

      {canManageBookings && showForm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 5100, background: isDarkTheme ? "rgba(6,10,22,.62)" : "rgba(15,23,42,.24)", display: "grid", placeItems: isMobile ? "end center" : "center", padding: isMobile ? 0 : 12 }}>
        <div style={{ ...cardSt, border: `1px solid ${theme.border}`, width: formMode === "compact" ? "min(560px, 96vw)" : "min(620px, 96vw)", maxHeight: isMobile ? "84vh" : "92vh", overflow: "auto", borderRadius: isMobile ? "18px 18px 0 0" : 20, background: isDarkTheme ? "linear-gradient(180deg, rgba(22,30,46,.96), rgba(12,18,32,.96))" : "linear-gradient(180deg, #ffffff, #f8fafc)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div>
              <b style={{ fontSize: 20 }}>{editingId ? "Редагувати подію" : "Нова подія"}</b>
              <div style={{ fontSize: 12, color: theme.textLight }}>{draft.date} · {draft.startTime}–{draft.endTime}</div>
            </div>
            <button style={btnS} onClick={() => { setShowForm(false); setEditingId(null); setFormErrors({}); }}>✕</button>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 10,
            }}
          >
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: theme.textLight }}>Основне</div>
            <input style={{ ...inputSt, borderColor: formErrors.title ? theme.danger : inputSt.borderColor }} placeholder="Назва / клієнт / група" value={draft.title} onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))} />
            {formErrors.title ? <div style={{ color: theme.danger, fontSize: 12 }}>{formErrors.title}</div> : null}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{allowedEventTypes.map((eventType) => { const ac = typeAccent[eventType] || typeAccent.room_booking; const active = draft.eventType === eventType; return <button key={eventType} type="button" style={{ ...btnS, minHeight: isMobile ? 38 : 34, padding: "0 10px", borderColor: active ? ac.border : theme.border, color: active ? ac.text : theme.text, background: active ? ac.bg : "transparent" }} onClick={() => { setDraft((p) => ({ ...p, eventType, bookingType: eventType === "individual_training" ? p.bookingType || tariffTypes[0]?.id : null, peopleCount: eventType === "individual_training" ? p.peopleCount || 1 : null, price: eventType === "individual_training" ? getTariffPrice(p.bookingType || tariffTypes[0]?.id) : 0, paymentMethod: eventType === "individual_training" ? p.paymentMethod || "none" : "none" })); }}>{getEventTypeLabel(eventType)}</button>; })}</div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: theme.textLight }}>Час і місце</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
              <input style={{ ...inputSt, borderColor: formErrors.date ? theme.danger : inputSt.borderColor }} type="date" value={draft.date} onChange={(e) => setDraft((p) => ({ ...p, date: e.target.value }))} />
              <input style={{ ...inputSt, borderColor: formErrors.startTime ? theme.danger : inputSt.borderColor }} type="time" value={draft.startTime} onChange={(e) => setDraft((p) => ({ ...p, startTime: e.target.value }))} />
              <input style={{ ...inputSt, borderColor: formErrors.endTime ? theme.danger : inputSt.borderColor }} type="time" value={draft.endTime} onChange={(e) => setDraft((p) => ({ ...p, endTime: e.target.value }))} />
            </div>
            {(formErrors.date || formErrors.startTime || formErrors.endTime) ? <div style={{ color: theme.danger, fontSize: 12 }}>{formErrors.date || formErrors.startTime || formErrors.endTime}</div> : null}
            {formMode === "compact" ? <button style={{ ...btnS, minHeight: isMobile ? 40 : 34 }} onClick={applyQuickToFullForm}>Показати всі поля</button> : null}
            {formMode === "full" ? <>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", color: theme.textLight }}>Деталі</div>
            {draft.eventType === "individual_training" && (
              <>
                <select
                  style={inputSt}
                  value={draft.bookingType || tariffTypes[0]?.id || ""}
                  onChange={(e) => {
                    const nextPrice = getTariffPrice(e.target.value);
                    setDraft((p) => ({
                      ...p,
                      bookingType: e.target.value,
                      price: nextPrice,
                    }));
                  }}
                >
                  {tariffTypes.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
                <input
                  style={inputSt}
                  type="number"
                  placeholder="К-ть людей"
                  value={draft.peopleCount ?? ""}
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
                  value={draft.price ?? ""}
                  readOnly={!isAdmin}
                  disabled={!isAdmin}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      price: Number(e.target.value || 0),
                    }))
                  }
                />
                <select
                  style={inputSt}
                  value={draft.paymentMethod || "none"}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, paymentMethod: e.target.value }))
                  }
                >
                  <option value="card">Карта</option>
                  <option value="cash">Готівка</option>
                  <option value="none">Без оплати</option>
                </select>
              </>
            )}
            {draft.eventType === "room_booking" && isAdmin && (
              <input
                style={inputSt}
                type="number"
                placeholder="Ціна"
                value={draft.price ?? ""}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    price: Number(e.target.value || 0),
                  }))
                }
              />
            )}
            <select
              style={inputSt}
              value={isAdmin ? draft.trainerId || "" : currentTrainerId}
              disabled={!isAdmin}
              onChange={(e) =>
                setDraft((p) => ({ ...p, trainerId: e.target.value }))
              }
            >
              {isAdmin ? <option value="">Тренер</option> : null}
              {!isAdmin && currentTrainerId ? (
                <option value={currentTrainerId}>{currentTrainerName || currentTrainerId}</option>
              ) : null}
              {isAdmin && safeTrainers.map((t) => (
                <option key={t.id} value={t.id}>
                  {getTrainerDisplayName(t)}
                </option>
              ))}
            </select>
            <select style={inputSt} value={draft.roomName || primaryRoomName} onChange={(e) => setDraft((p) => ({ ...p, roomName: e.target.value }))}>
              {allKnownRooms.map((room) => <option key={room} value={room}>{room}</option>)}
            </select>
            <input
              style={inputSt}
              placeholder="Нотатка"
              value={draft.note}
              onChange={(e) =>
                setDraft((p) => ({ ...p, note: e.target.value }))
              }
            />
            <select style={inputSt} value={draft.recurrence} onChange={(e) => setDraft((p) => ({ ...p, recurrence: e.target.value }))}>
              <option value="none">Без повтору</option>
              <option value="daily">Щодня</option>
              <option value="weekly">Щотижня</option>
              <option value="monthly">Щомісяця</option>
            </select>
            <input style={inputSt} type="date" value={draft.recurrenceUntil || ""} onChange={(e) => setDraft((p) => ({ ...p, recurrenceUntil: e.target.value }))} />
            <input style={inputSt} type="color" value={draft.color || "#64748b"} onChange={(e) => setDraft((p) => ({ ...p, color: e.target.value }))} />
            <select style={inputSt} value={draft.status || "active"} onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value }))}>
              <option value="active">Активно</option>
              <option value="tentative">Попередньо</option>
              <option value="cancelled">Скасовано</option>
            </select>
            <input style={inputSt} placeholder="Опис" value={draft.description || ""} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))} />
            </> : null}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, position: "sticky", bottom: 0, background: isDarkTheme ? "rgba(12,18,32,.92)" : "rgba(255,255,255,.95)", paddingTop: 8, paddingBottom: "calc(8px + env(safe-area-inset-bottom, 0px))" }}>
            <button style={{ ...btnP, minHeight: isMobile ? 46 : undefined }} onClick={saveBooking}>
              Зберегти
            </button>
            <button
              style={{ ...btnS, minHeight: isMobile ? 46 : undefined }}
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
                setFormErrors({});
              }}
            >
              Скасувати
            </button>
            {editingId ? <button style={{ ...btnS, color: theme.danger, marginLeft: "auto", minHeight: isMobile ? 46 : undefined }} onClick={async () => { await onDeleteBooking(editingId); setShowForm(false); setEditingId(null); }}>Видалити</button> : null}
          </div>
        </div>
        </div>
      )}

      {selectedEventDetails && (
        <div style={{ position: "fixed", inset: 0, zIndex: 5000, background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center" }}>
          <div style={{ ...cardSt, border: `1px solid ${theme.border}`, width: "min(560px,92vw)", maxHeight: "90vh", overflow: "auto" }}>
            <b>Деталі заняття</b>
            <div style={{ marginTop: 8, display: "grid", gap: 4, fontSize: 13 }}>
              <div><b>Назва:</b> {selectedEventDetails.title}</div>
              <div><b>Дата:</b> {selectedEventDetails.date}</div>
              <div><b>Час:</b> {selectedEventDetails.startTime}–{selectedEventDetails.endTime}</div>
              <div><b>Група:</b> {selectedEventDetails.groupName || selectedEventDetails.title}</div>
              <div><b>Напрямок:</b> {selectedEventDetails.direction || "—"}</div>
              <div><b>Тренер:</b> {selectedEventDetails.trainer || "—"}</div>
              <div><b>Тип події:</b> {getEventTypeLabel(selectedEventDetails.eventType)}</div>
              {selectedEventDetails.cancelled ? <div style={{ color: theme.danger }}><b>Статус:</b> cancelled</div> : null}
            </div>
            <div style={{ marginTop: 10 }}>
              <button style={btnP} onClick={() => setSelectedEventDetails(null)}>Закрити</button>
            </div>
          </div>
        </div>
      )}

      {isAdmin && groupSlotEdit && (
        <div style={{ position: "fixed", inset: 0, zIndex: 5000, background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center" }}>
          <div style={{ ...cardSt, border: `1px solid ${theme.border}`, width: "min(620px,94vw)", maxHeight: "90vh", overflow: "auto" }}>
          <b>Редагувати заняття групи</b>
          <div style={{ fontSize: 12, color: theme.textLight, marginTop: 4 }}>
            Група: {groupSlotEdit.groupName}
          </div>
          <div style={{ fontSize: 12, color: theme.textLight, marginTop: 2 }}>
            Напрямок: {groupSlotEdit.direction || "—"} · Тренер: {groupSlotEdit.trainer || "—"}
          </div>
          {groupSlotEdit.error ? (
            <div style={{ marginTop: 8, color: theme.danger, fontSize: 13 }}>{groupSlotEdit.error}</div>
          ) : null}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 8 }}>
            <select style={inputSt} value={groupSlotEdit.weekday} onChange={(e) => setGroupSlotEdit((p) => ({ ...p, weekday: Number(e.target.value || 0) }))}>
              <option value={1}>Пн</option><option value={2}>Вт</option><option value={3}>Ср</option><option value={4}>Чт</option><option value={5}>Пт</option><option value={6}>Сб</option><option value={0}>Нд</option>
            </select>
            <input style={inputSt} type="time" value={groupSlotEdit.startTime} onChange={(e) => setGroupSlotEdit((p) => ({ ...p, startTime: e.target.value }))} />
            <input style={inputSt} type="time" value={groupSlotEdit.endTime} onChange={(e) => setGroupSlotEdit((p) => ({ ...p, endTime: e.target.value }))} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button style={btnP} onClick={saveGroupSlotEdit} disabled={!!groupSlotEdit.error}>Зберегти</button>
            <button style={btnS} onClick={() => setGroupSlotEdit(null)}>Скасувати</button>
          </div>
          </div>
        </div>
      )}

      {showRoomsManager ? (
        <div style={{ ...cardSt, border: `1px solid ${theme.border}` }}>
          <b>Налаштування залів</b>
          <form
            style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}
            onSubmit={(e) => {
              e.preventDefault();
              addCustomRoom();
            }}
          >
            <input style={{ ...inputSt, minHeight: 44 }} placeholder="Нова назва залу" value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} />
            <button type="submit" style={btnP}>Додати залу</button>
          </form>
          <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {studioRooms.map((room) => {
              const isRenaming = renamingRoomId === room.id;
              return (
                <span key={room.id} style={{ padding: "6px 10px", border: `1px solid ${theme.border}`, borderRadius: 999, display: "inline-flex", gap: 8, alignItems: "center" }}>
                  {isRenaming ? (
                    <>
                      <input style={{ ...inputSt, minHeight: 24, padding: "0 6px", width: 140 }} value={renamingRoomName} onChange={(e) => setRenamingRoomName(e.target.value)} />
                      <button type="button" style={{ ...btnP, padding: "0 6px", lineHeight: "20px" }} onClick={() => saveRenameRoom(room)}>✓</button>
                      <button type="button" style={{ ...btnS, padding: "0 6px", lineHeight: "20px" }} onClick={cancelRenameRoom}>✕</button>
                    </>
                  ) : (
                    <>
                      {room.name}
                      <button type="button" style={{ ...btnS, padding: "0 6px", lineHeight: "16px" }} onClick={() => startRenameRoom(room)}>✎</button>
                      {normalizeRoomName(room.name) !== normalizeRoomName(primaryRoomName) ? <button type="button" style={{ ...btnS, padding: "0 6px", lineHeight: "16px" }} onClick={() => removeCustomRoom(room)}>×</button> : null}
                    </>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      {viewMode === "month" ? (
        <div style={{ ...cardSt, border: `1px solid ${theme.border}`, background: "linear-gradient(180deg, rgba(255,255,255,.02), rgba(255,255,255,.01))", boxShadow: "0 12px 32px rgba(0,0,0,.2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
            <b style={{ fontSize: 20, letterSpacing: "-0.01em" }}>
              {selectedDateObj.toLocaleDateString("uk-UA", { month: "long", year: "numeric" })}
            </b>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={{ ...btnS, minHeight: 40 }} onClick={() => setSelectedDate(toLocalDateKey(addDays(monthStart, -1)))}>←</button>
              <button style={{ ...btnS, minHeight: 40 }} onClick={() => setSelectedDate(toLocalDateKey(new Date()))}>Сьогодні</button>
              <button style={{ ...btnS, minHeight: 40 }} onClick={() => setSelectedDate(toLocalDateKey(addDays(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1), 0)))}>→</button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6, marginBottom: 6 }}>
            {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"].map((d) => (
              <div key={d} style={{ fontSize: 12, color: theme.textLight, textAlign: "center", fontWeight: 700 }}>{d}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 6 }}>
            {monthCells.map((d) => {
              const key = toLocalDateKey(d);
              const monthDayEvents = monthEventsByDay.get(key) || [];
              const items = selectedRoom === "all"
                ? monthDayEvents
                : monthDayEvents.filter((e) => (e.roomName || primaryRoomName) === selectedRoom);
              const inMonth = d.getMonth() === monthStart.getMonth();
              const sortedItems = items.slice().sort((a, b) => a.startMin - b.startMin);
              const visibleMonthChipCount = selectedRoom === "all" ? 0 : 2;
              const previewItems = selectedRoom === "all" ? sortedItems.slice(0, 3) : sortedItems.slice(0, visibleMonthChipCount);
              const remaining = selectedRoom === "all"
                ? Math.max(0, items.length - previewItems.length)
                : Math.max(0, items.length - visibleMonthChipCount);
              return (
                <button key={key} onClick={() => { setSelectedDate(key); setViewMode("day"); }} style={{ textAlign: "left", minHeight: isMobile ? 76 : 116, border: `1px solid ${key === toLocalDateKey(new Date()) ? "#6366f1" : theme.border}`, borderRadius: 12, background: inMonth ? "rgba(255,255,255,.02)" : "rgba(255,255,255,.01)", color: theme.text, padding: isMobile ? 6 : 8, display: "grid", alignContent: "start", gap: isMobile ? 3 : 5 }}>
                  <div style={{ fontWeight: 700, color: inMonth ? theme.text : theme.textLight }}>{d.getDate()}</div>
                  {items.length > 0 && selectedRoom === "all" ? (
                    <>
                      <div
                        onClick={(ev) => { ev.stopPropagation(); setSelectedDate(key); setViewMode("day"); }}
                        style={{ fontSize: 11.5, color: theme.textLight, fontWeight: 700 }}
                      >
                        {items.length} подій
                      </div>
                      <div
                        onClick={(ev) => { ev.stopPropagation(); setSelectedDate(key); setViewMode("day"); }}
                        style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}
                      >
                        {Array.from(new Set(items.map((ev) => colorKey(ev)))).slice(0, 4).map((tone) => {
                          const c = palette[tone] || palette.default;
                          return <span key={tone} style={{ width: 12, height: 4, borderRadius: 999, background: c.border, opacity: 0.55 }} />;
                        })}
                      </div>
                    </>
                  ) : null}
                  {!isMobile && selectedRoom !== "all" ? previewItems.slice(0, 2).map((e) => {
                    const c = e.color ? { bg: `${e.color}18`, border: `${e.color}99` } : palette[colorKey(e)] || palette.default;
                    return (
                      <div key={e.id} onClick={(ev) => { ev.stopPropagation(); setSelectedDate(key); setViewMode("day"); }} style={{ border: `1px solid ${c.border}`, background: c.bg, borderRadius: 8, padding: "2px 6px", fontSize: 11, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden", opacity: 0.92 }}>
                        {e.startTime} {e.title}
                      </div>
                    );
                  }) : null}
                  {!isMobile && selectedRoom !== "all" && remaining > 0 ? <div style={{ fontSize: 11, color: theme.textLight, fontWeight: 700, opacity: 0.85 }}>+{remaining} ще</div> : null}
                </button>
              );
            })}
          </div>
          {!monthHasEvents ? (
            <div style={{ marginTop: 10, border: `1px dashed ${theme.border}`, borderRadius: 10, padding: 10, color: theme.textLight }}>
              У цій залі подій немає.
            </div>
          ) : null}
        </div>
      ) : null}

      {viewMode === "day" ? (
        <div style={{ ...cardSt, border: `1px solid ${theme.border}`, background: "linear-gradient(180deg, rgba(255,255,255,.02), rgba(255,255,255,.01))", boxShadow: "0 12px 32px rgba(0,0,0,.2)" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center", paddingBottom: 8, borderBottom: `1px solid ${theme.border}` }}>
            <button style={{ ...btnS, minHeight: 44 }} onClick={() => shiftSelectedDate(-1)}>←</button>
            <input style={{ ...inputSt, minHeight: 44, borderRadius: 999, padding: "0 14px" }} type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
            <button style={{ ...btnS, minHeight: 44 }} onClick={() => shiftSelectedDate(1)}>→</button>
            <div style={{ fontSize: 12, color: theme.textLight }}>
              {selectedDateObj.toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long" })}
            </div>
            {selectedRoom === "all" ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: "auto", flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: theme.textLight }}>Залів на екрані:</span>
                {["1", "2", "3", "all"].map((v) => (
                  <button key={v} type="button" style={dayRoomColumnLimit === v ? btnP : btnS} onClick={() => setDayRoomColumnLimit(v)}>
                    {v === "all" ? "Усі" : v}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div style={{ overflowX: selectedRoom === "all" ? "auto" : "visible" }}>
            {selectedRoom === "all" && isMobile ? <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 8 }}>{dayRoomsToRender.map(([room]) => <span key={room} style={{ border: `1px solid ${theme.border}`, borderRadius: 999, padding: "4px 10px", fontSize: 12, whiteSpace: "nowrap" }}>{room || NO_ROOM}</span>)}</div> : null}
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: selectedRoom === "all" && isNarrowScreen ? "1fr" : dayRoomGridTemplate, minWidth: selectedRoom === "all" ? `max-content` : undefined }}>
              {dayRoomsToRender.map(([room, items]) => (
                <div key={room} style={{ border: `1px solid ${theme.border}`, borderRadius: 14, overflow: "hidden", minWidth: isMobile ? 230 : 240 }}>
                  <div style={{ padding: "8px 10px", borderBottom: `1px solid ${theme.border}`, fontWeight: 800 }}>{room || NO_ROOM}</div>
                  <div style={{ position: "relative", minHeight: (DAY_END_HOUR - DAY_START_HOUR) * 42, background: "rgba(255,255,255,.01)" }}>
                    {canManageBookings ? (
                      <div
                        style={{ position: "absolute", inset: 0, zIndex: 1, cursor: "crosshair" }}
                        onMouseDown={(ev) => {
                          const rect = ev.currentTarget.getBoundingClientRect();
                          const y = ev.clientY - rect.top;
                          const mins = minuteFromY(y);
                          setSelection({ date: selectedDate, startMinute: mins, endMinute: mins, dragging: true, roomName: room });
                        }}
                        onMouseMove={(ev) => {
                          const rect = ev.currentTarget.getBoundingClientRect();
                          const y = ev.clientY - rect.top;
                          const mins = minuteFromY(y);
                          setHoverSlot({ date: selectedDate, minute: mins });
                          setSelection((p) => (p?.dragging && p.date === selectedDate ? { ...p, endMinute: mins } : p));
                        }}
                        onMouseUp={(ev) => {
                          const rect = ev.currentTarget.getBoundingClientRect();
                          const y = ev.clientY - rect.top;
                          const mins = minuteFromY(y);
                          const cur = selection && selection.date === selectedDate ? selection : { startMinute: mins, endMinute: mins };
                          const startMinute = Math.min(cur.startMinute, mins);
                          const endRaw = Math.max(cur.startMinute, mins);
                          const endMinute = endRaw - startMinute < 15 ? startMinute + 60 : endRaw;
                          openCreateAt(selectedDate, startMinute, ev, endMinute);
                          setDraft((p) => ({ ...p, roomName: room || p.roomName }));
                          setSelection(null);
                        }}
                      />
                    ) : null}
                    {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, i) => (
                      <div key={i} style={{ position: "absolute", top: i * 42, left: 0, right: 0, borderTop: `1px solid ${theme.border}`, opacity: 0.25 }} />
                    ))}
                    {isTodaySelected ? (
                      <div style={{ position: "absolute", left: 0, right: 0, top: ((nowMinute - DAY_START_HOUR * 60) / 60) * 42, borderTop: "1px solid #ef4444", boxShadow: "0 0 0 1px rgba(239,68,68,.2)" }} />
                    ) : null}
                    {items.sort((a,b)=>a.startMin-b.startMin).map((e) => {
                      const dur = Math.max(0, e.endMin - e.startMin);
                      const top = ((e.startMin - DAY_START_HOUR * 60) / 60) * 42;
                      const height = Math.max(24, (dur / 60) * 42);
                      const c = e.color ? { bg: `${e.color}22`, border: e.color } : palette[colorKey(e)] || palette.default;
                      return (
                        <div key={e.id} style={{ position: "absolute", left: 8, right: 8, top, height, border: `1px solid ${c.border}`, background: c.bg, borderRadius: 10, padding: 6, overflow: "hidden" }}>
                          <div style={{ fontSize: 11, fontWeight: 800, lineHeight: "1.2em", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{e.startTime}–{e.endTime} · {e.title}</div>
                          {height > 38 ? <div style={{ fontSize: 10.5, color: theme.textLight, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{e.trainer} · {getEventTypeLabel(e.eventType)}</div> : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {!dayRoomsToRender.length ? (
                <div style={{ border: `1px dashed ${theme.border}`, borderRadius: 12, padding: 12, color: theme.textLight }}>
                  У цій залі подій немає.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {viewMode === "week" ? (
      <div
        style={{
          ...cardSt,
          border: `1px solid ${theme.border}`,
          padding: 0,
          overflowX: "auto",
          overflowY: "hidden",
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
              const dayEvents = roomFilteredEventsByDay.get(date) || [];
              return (
                <div
                  key={date}
                  style={{
                    position: "relative",
                    borderLeft: `1px solid ${theme.border}`,
                  }}
                >
                  {canManageBookings ? (
                    <div
                      style={{ position: "absolute", inset: 0, zIndex: 1, cursor: "crosshair" }}
                      onMouseDown={(ev) => {
                        const rect = ev.currentTarget.getBoundingClientRect();
                        const y = ev.clientY - rect.top;
                        const mins = minuteFromY(y);
                        setSelection({ date, startMinute: mins, endMinute: mins, x: ev.clientX, y: ev.clientY, dragging: true });
                      }}
                      onMouseMove={(ev) => {
                        const rect = ev.currentTarget.getBoundingClientRect();
                        const y = ev.clientY - rect.top;
                        const mins = minuteFromY(y);
                        setHoverSlot({ date, minute: mins });
                        setSelection((p) => (p?.dragging && p.date === date ? { ...p, endMinute: mins, x: ev.clientX, y: ev.clientY } : p));
                      }}
                      onMouseLeave={() => {
                        setHoverSlot(null);
                        setSelection((p) => (p?.dragging && p.date === date ? { ...p, dragging: false } : p));
                      }}
                      onMouseUp={(ev) => {
                        ev.stopPropagation();
                        const rect = ev.currentTarget.getBoundingClientRect();
                        const y = ev.clientY - rect.top;
                        const mins = minuteFromY(y);
                        const cur = selection && selection.date === date ? selection : { startMinute: mins, endMinute: mins };
                        const startMinute = Math.min(cur.startMinute, mins);
                        const endRaw = Math.max(cur.startMinute, mins);
                        const endMinute = endRaw - startMinute < 15 ? startMinute + 60 : endRaw;
                        openCreateAt(date, startMinute, ev, endMinute);
                        setSelection(null);
                      }}
                    />
                  ) : null}
                  {canManageBookings && hoverSlot?.date === date ? (
                    <div style={{ position: "absolute", left: 0, right: 0, top: ((hoverSlot.minute - DAY_START_HOUR * 60) / 60) * HOUR_PX, height: HOUR_PX / 4, background: "rgba(99,102,241,.14)", pointerEvents: "none", zIndex: 2 }} />
                  ) : null}
                  {canManageBookings && selection?.date === date ? (
                    <div style={{ position: "absolute", left: 0, right: 0, top: ((Math.min(selection.startMinute, selection.endMinute) - DAY_START_HOUR * 60) / 60) * HOUR_PX, height: (Math.max(15, Math.abs(selection.endMinute - selection.startMinute)) / 60) * HOUR_PX, background: "rgba(59,130,246,.16)", border: "1px dashed #3b82f6", pointerEvents: "none", zIndex: 3 }} />
                  ) : null}
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
                    const c = e.color
                      ? { bg: `${e.color}22`, border: e.color }
                      : palette[colorKey(e)] || palette.default;
                    const stView = statusStyles[e.status] || statusStyles.active;
                    const canMutateThisEvent = canMutateEvent(e);
                    return (
                      <div
                        key={e.id}
                        data-event-card="1"
                        style={{
                          position: "absolute",
                          top,
                          left: `${left}%`,
                          width: `${width}%`,
                          height,
                          border: `1px solid ${c.border}`,
                          background: c.bg,
                          opacity: stView.opacity,
                          borderRadius: 10,
                          padding: 6,
                          fontSize: 11,
                          overflow: "hidden",
                          zIndex: openMenuState?.eventId === e.id ? 2000 : 5,
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
                          <div style={{ fontWeight: 700, paddingRight: 26, lineHeight: "1.2em", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minWidth: 0, wordBreak: "break-word" }}>
                            {e.title}
                          </div>
                          {(isAdmin || e.kind === "booking") && (
                            <div style={{ position: "absolute", top: 6, right: 6, zIndex: 2100 }}>
                              <button
                                style={{
                                  ...btnS,
                                  padding: "0 6px",
                                  fontSize: 12,
                                  lineHeight: "16px",
                                  position: "relative",
                                  zIndex: 2200,
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
                                          setSelectedEventDetails(e);
                                        }}
                                      >
                                        Деталі події
                                      </button>
                                      {canMutateThisEvent ? (
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
                                              if (window.confirm("Видалити подію/серію?"))
                                                onDeleteBooking(e.parentId || e.id);
                                            }}
                                          >
                                            Видалити
                                          </button>
                                          <div style={{ fontSize: 11, color: theme.textLight, padding: "2px 4px" }}>Статус події</div>
                                          <button style={btnS} onClick={async () => { setOpenMenuState(null); await onUpdateBooking(e.parentId || e.id, { status: "tentative" }); }}>Позначити як попередню</button>
                                          <button style={btnS} onClick={async () => { setOpenMenuState(null); await onUpdateBooking(e.parentId || e.id, { status: "cancelled" }); }}>Позначити як скасовану</button>
                                          <button style={btnS} onClick={async () => { setOpenMenuState(null); await onUpdateBooking(e.parentId || e.id, { status: "active" }); }}>Повернути в активні</button>
                                          <button style={btnS} onClick={async () => { setOpenMenuState(null); await onUpdateBooking(e.parentId || e.id, { color: null }); }}>Прибрати власний колір</button>
                                          <div style={{ fontSize: 10, color: theme.textLight, padding: "0 4px" }}>не видаляє подію, лише змінює статус</div>
                                        </>
                                      ) : null}
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        style={btnS}
                                        onClick={() => {
                                          setOpenMenuState(null);
                                          setSelectedEventDetails(e);
                                        }}
                                      >
                                        Деталі заняття
                                      </button>
                                      {isAdmin && (
                                        <button
                                          style={btnS}
                                          onClick={() => {
                                            setOpenMenuState(null);
                                            openGroupSlotEditor(e);
                                          }}
                                        >
                                          Редагувати заняття
                                        </button>
                                      )}
                                    </>
                                  )}
                                  </div>,
                                  document.body,
                                )}
                            </div>
                          )}
                        </div>
                        <div style={{ overflow: "hidden", minWidth: 0, fontSize: 10.5, color: theme.textLight, lineHeight: "1.25em", wordBreak: "break-word" }}>
                          <div style={{ color: theme.text, fontSize: 11, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{e.startTime}–{e.endTime}</div>
                          {height > 44 ? <div style={{ whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{e.trainer}</div> : null}
                          {e.kind === "booking" && height > 56 ? <div style={{ whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{stView.text}</div> : null}
                          {e.kind === "booking" && height > 68 ? <div style={{ whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{getEventTypeLabel(e.eventType)}</div> : null}
                          {e.description && height > 82 ? <div style={{ whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{e.description}</div> : null}
                          {e.peopleCount && height > 92 ? <div style={{ whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{e.peopleCount} ос.</div> : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        {!weekHasEvents ? (
          <div style={{ margin: 10, border: `1px dashed ${theme.border}`, borderRadius: 10, padding: 10, color: theme.textLight }}>
            У цій залі подій немає.
          </div>
        ) : null}
      </div>
      ) : null}

      

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
