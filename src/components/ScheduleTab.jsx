import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { btnP, btnS, cardSt, inputSt, theme } from "../shared/constants";
import { fetchStudioRooms, createStudioRoom, updateStudioRoom, renameStudioRoom } from "../db";
import { useStickyState } from "../shared/utils";

const DAY_START_HOUR = 8;
const DAY_END_HOUR = 22;
const HOUR_PX = 54;
const MIN_EVENT_HEIGHT = 24;
const TRAINING_PLAN_TYPES = [
  { id: "choreography", label: "Хореографія" },
  { id: "technique", label: "Техніка" },
  { id: "routine", label: "Зв'язка" },
  { id: "practice", label: "Напрацювання" },
  { id: "review", label: "Повторення" },
  { id: "filming", label: "Зйомка" },
  { id: "performance_prep", label: "Підготовка до виступу" },
  { id: "other", label: "Інше" },
];
const TRAINING_PLAN_DIFFICULTIES = [
  { id: "easy", label: "Легко" },
  { id: "medium", label: "Середньо" },
  { id: "hard", label: "Складно" },
];
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
const isMissingTrainerName = (name) => {
  const value = String(name ?? "").trim();
  return !value || value === "—" || value === "-";
};
const getTrainerInitials = (name = "") => {
  if (isMissingTrainerName(name)) return "";
  const parts = String(name || "")
    .replace(/[()]/g, " ")
    .split(/[\s-]+/)
    .map((part) => part.trim())
    .filter((part) => part && part !== "—");
  if (!parts.length) return "";
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase("uk-UA"))
    .join("");
};
const getEventTrainerInitials = (event) =>
  getTrainerInitials(event?.trainerName || event?.trainer_name || event?.trainerDisplayName || event?.trainer_display_name || event?.trainer || "");
const getEventTypeMark = (event) => {
  const marks = {
    group_lesson: "Г",
    individual_training: "І",
    room_booking: "Р",
    cleaning: "К",
    custom_admin_event: "П",
  };
  return marks[event?.eventType || event?.type] || "";
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

const getSlotTitle = (slot, group) =>
  String(slot?.title || slot?.name || slot?.label || group?.name || group?.title || group?.id || "").trim();
const getSlotTrainerId = (slot, group) =>
  slot?.trainerId ?? slot?.trainer_id ?? slot?.trainer ?? group?.trainer_id ?? group?.trainerId ?? null;
const getSlotNote = (slot) => slot?.note ?? slot?.notes ?? slot?.description ?? "";
const getSlotEndTimeRaw = (slot) => {
  if (slot?.endTime || slot?.end) return slot.endTime || slot.end;
  const time = String(slot?.time || "");
  return time.includes("-") ? time.split("-").slice(1).join("-") : "";
};
const setExistingOrDefault = (target, aliases, value, defaultKey = aliases[0]) => {
  let wrote = false;
  aliases.forEach((key) => {
    if (key in target) {
      target[key] = value;
      wrote = true;
    }
  });
  if (!wrote) target[defaultKey] = value;
};
const WEEKDAY_OPTIONS = [
  { value: 1, label: "Пн" },
  { value: 2, label: "Вт" },
  { value: 3, label: "Ср" },
  { value: 4, label: "Чт" },
  { value: 5, label: "Пт" },
  { value: 6, label: "Сб" },
  { value: 0, label: "Нд" },
];
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
  groupLessonOverrides = [],
  trainingLessonPlans = [],
  isAdmin = false,
  allowBookingMutations = false,
  onAddBooking,
  onDeleteBooking,
  onUpdateBooking,
  onUpdateGroupSchedule,
  onAddGroupLessonOverride,
  onUpdateGroupLessonOverride,
  onDeleteGroupLessonOverride,
  onUpsertTrainingLessonPlan,
  currentUser = null,
}) {
  const DEFAULT_ROOM = "Основна зала";
  const NO_ROOM = "Без залу";
  const safeGroups = Array.isArray(groups) ? groups : [];
  const safeDirections = Array.isArray(directionsList) ? directionsList : [];
  const safeTrainers = Array.isArray(trainers) ? trainers : [];
  const safeCancelled = Array.isArray(cancelled) ? cancelled : [];
  const safeBookings = Array.isArray(roomBookings) ? roomBookings : [];
  const safeGroupLessonOverrides = Array.isArray(groupLessonOverrides) ? groupLessonOverrides : [];
  const safeTrainingLessonPlans = Array.isArray(trainingLessonPlans) ? trainingLessonPlans : [];
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
  const isGroupOwnedByCurrentTrainer = (groupId) =>
    safeGroups.some((g) => String(g.id) === String(groupId) && String(g.trainer_id || "") === currentTrainerId);
  const canEditGroupSingleLesson = (event) =>
    isAdmin || (event?.kind === "group" && isGroupOwnedByCurrentTrainer(event.groupId));
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
  const [groupSlotEdit, setGroupSlotEdit] = useState(null); // { groupId, slotIndex, groupName, title, weekday, startTime, endTime, roomName, trainerId, note, direction, trainer, error }
  const [groupOverrideEdit, setGroupOverrideEdit] = useState(null);
  const [lessonPlanEdit, setLessonPlanEdit] = useState(null);
  const [selectedEventDetails, setSelectedEventDetails] = useState(null);
  const [hoverSlot, setHoverSlot] = useState(null);
  const [formMode, setFormMode] = useState("compact");
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
    originalParentDate: null,
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
  const getTrainerNameById = (trainerId) =>
    trainerId ? trainerMap.get(String(trainerId)) || "" : "";
  const getResolvedTrainerName = (trainerName, trainerId) => {
    const currentName = String(trainerName ?? "").trim();
    if (!isMissingTrainerName(currentName)) return currentName;
    return getTrainerNameById(trainerId);
  };
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
  const groupLessonOverrideMap = useMemo(() => {
    const map = new Map();
    safeGroupLessonOverrides.forEach((override) => {
      if (override?.groupId == null || override?.date == null || override?.slotIndex == null) return;
      map.set(`${override.groupId}:${String(override.date).slice(0, 10)}:${override.slotIndex}`, override);
    });
    return map;
  }, [safeGroupLessonOverrides]);
  const getLessonPlanKey = (groupId, trainerId, lessonDate, scheduleSlotIndex = 0) =>
    `${String(groupId || "")}:${String(trainerId || "")}:${String(lessonDate || "").slice(0, 10)}:${Number(scheduleSlotIndex || 0)}`;
  const trainingLessonPlanMap = useMemo(() => {
    const map = new Map();
    safeTrainingLessonPlans.forEach((plan) => {
      if (!plan?.groupId || !plan?.trainerId || !plan?.lessonDate) return;
      map.set(getLessonPlanKey(plan.groupId, plan.trainerId, plan.lessonDate, plan.scheduleSlotIndex), plan);
    });
    return map;
  }, [safeTrainingLessonPlans]);
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
        const en = toMin(getSlotEndTimeRaw(row)) ?? st + 60;
        const slotTrainerId = getSlotTrainerId(row, g);
        const slotTitle = getSlotTitle(row, g) || g.id;
        slots.push({
          id: `${g.id}_${idx}`,
          groupId: g.id,
          slotIndex: idx,
          weekday: wd,
          startTime: minToHHMM(st),
          endTime: minToHHMM(en),
          title: slotTitle,
          direction: getDirectionDisplayName(dirMap.get(String(g.directionId || "")) || "—"),
          trainerId: slotTrainerId || null,
          trainer: trainerMap.get(String(slotTrainerId || "")) || "—",
          roomName: getRoomLabel(row) || getRoomLabel(g) || primaryRoomName,
          note: getSlotNote(row),
        });
      }),
    );
    normalizedDates.forEach((d) => {
      const date = toLocalDateKey(d);
      slots
        .filter((s) => s.weekday === d.getDay())
        .forEach((s) => {
          const override = groupLessonOverrideMap.get(`${s.groupId}:${date}:${s.slotIndex}`);
          if (override?.status === "cancelled") return;
          const effectiveStartTime = override?.status === "active" ? override.startTime : s.startTime;
          const effectiveEndTime = override?.status === "active" ? override.endTime : s.endTime;
          const st = toMin(effectiveStartTime);
          const en = toMin(effectiveEndTime) ?? st + 60;
          if (st == null || en == null || en <= st) return;
          const effectiveTrainerId = override?.status === "active" && override.trainerId !== undefined ? override.trainerId : s.trainerId;
          const effectiveTitle = override?.status === "active" && String(override.title || "").trim() ? override.title : s.title;
          map.get(date).push({
            ...s,
            id: `${s.groupId}_${s.slotIndex}:${date}`,
            kind: "group",
            eventType: "group_lesson",
            date,
            groupName: s.title,
            slotIndex: s.slotIndex,
            startTime: effectiveStartTime,
            endTime: effectiveEndTime,
            startMin: st,
            endMin: en,
            trainerId: effectiveTrainerId || null,
            trainer: trainerMap.get(String(effectiveTrainerId || "")) || s.trainer || "—",
            title: effectiveTitle,
            note: override?.status === "active" ? override.note || "" : s.note || "",
            cancelled: cancelledSet.has(`${s.groupId}:${date}`),
            roomName: override?.status === "active" ? (override.roomName || s.roomName || primaryRoomName) : (getRoomLabel(s) || primaryRoomName),
            isOverride: override?.status === "active",
            overrideId: override?.status === "active" ? override.id : null,
            originalStartTime: override?.originalStartTime || s.startTime,
            originalEndTime: override?.originalEndTime || s.endTime,
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
          trainerName: getResolvedTrainerName(b.trainerName || b.trainer_name, b.trainerId || b.trainer_id) || null,
          trainer:
            getResolvedTrainerName(b.trainerName || b.trainer_name, b.trainerId || b.trainer_id) || "—",
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
          trainerName: getResolvedTrainerName(b.trainerName || b.trainer_name, b.trainerId || b.trainer_id) || null,
          trainer:
            getResolvedTrainerName(b.trainerName || b.trainer_name, b.trainerId || b.trainer_id) || "—",
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
    groupLessonOverrideMap,
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
    const trainerName = trainerId
      ? getResolvedTrainerName(source.trainerName, trainerId) || (isAdmin ? null : currentTrainerName || null)
      : null;
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
      date: editingId && draft.originalParentDate ? draft.originalParentDate : draft.date,
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
    const parentDate = e.parentDate || e.date;
    const isRecurringOccurrence = Boolean(
      e.parentId && parentDate && e.date && parentDate !== e.date && e.recurrence !== "none",
    );
    setEditingId(e.parentId || e.id);
    setFormMode("full");
    setShowForm(true);
    setDraft((p) => ({
      ...p,
      date: isRecurringOccurrence ? parentDate : e.date,
      originalParentDate: isRecurringOccurrence ? parentDate : null,
      startTime: e.startTime,
      endTime: e.endTime,
      eventType: e.eventType || "room_booking",
      bookingType: e.bookingType || tariffTypes[0]?.id || "individual_1_2",
      paymentMethod: e.paymentMethod || "none",
      peopleCount: e.peopleCount || 0,
      price: e.price || 0,
      trainerId: isAdmin ? e.trainerId || "" : currentTrainerId,
      trainerName: getResolvedTrainerName(e.trainerName || e.trainer, isAdmin ? e.trainerId : currentTrainerId),
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
      trainerName: getResolvedTrainerName(e.trainerName || e.trainer, isAdmin ? e.trainerId : currentTrainerId),
      title: e.title || "",
      roomName: e.roomName || primaryRoomName,
      note: e.note || "",
      recurrence: e.recurrence || "none",
      recurrenceUntil: e.recurrenceUntil || "",
      originalParentDate: null,
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
      originalParentDate: null,
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
  const applyFullToCompactForm = () => setFormMode("compact");

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
    const g = safeGroups.find((x) => String(x.id) === String(e.groupId));
    const slot = Array.isArray(g?.schedule) ? g.schedule[e.slotIndex] : null;
    const st = toMin(slot?.startTime || slot?.start || slot?.time || e.startTime || "");
    const en = toMin(getSlotEndTimeRaw(slot) || e.endTime || "") ?? (st == null ? null : st + 60);
    const trainerId = getSlotTrainerId(slot, g) || "";
    setGroupSlotEdit({
      groupId: e.groupId,
      slotIndex: e.slotIndex,
      groupName: g?.name || e.groupName || e.title || "—",
      title: getSlotTitle(slot, g) || e.groupName || e.title || "",
      weekday: parseWeekday(slot?.weekday ?? slot?.dayOfWeek ?? slot?.day ?? slot?.dow ?? slot?.weekDay) ?? e.weekday,
      startTime: st == null ? e.startTime || "" : minToHHMM(st),
      endTime: en == null ? e.endTime || "" : minToHHMM(en),
      roomName: getRoomLabel(slot) || getRoomLabel(g) || e.roomName || primaryRoomName,
      trainerId,
      note: getSlotNote(slot),
      direction: e.direction || getDirectionDisplayName(dirMap.get(String(g?.directionId || "")) || "—"),
      trainer: trainerMap.get(String(trainerId || "")) || e.trainer || "—",
      error: slot ? "" : "Не вдалося визначити запис розкладу для редагування",
    });
  };

  const openGroupOverrideEditor = (e) => {
    if (!canEditGroupSingleLesson(e)) return;
    setGroupOverrideEdit({
      overrideId: e.overrideId || null,
      groupId: e.groupId,
      slotIndex: e.slotIndex,
      groupName: e.groupName || e.title || "—",
      date: e.date,
      originalStartTime: e.originalStartTime || e.startTime,
      originalEndTime: e.originalEndTime || e.endTime,
      startTime: e.startTime,
      endTime: e.endTime,
      roomName: e.roomName || primaryRoomName,
      trainerId: e.trainerId || "",
      title: e.isOverride ? e.title || "" : "",
      note: e.note || "",
      status: "active",
      error: "",
    });
  };

  const saveGroupOverrideEdit = async () => {
    if (!groupOverrideEdit) return;
    const st = toMin(groupOverrideEdit.startTime);
    const en = toMin(groupOverrideEdit.endTime);
    if (st == null || en == null || en <= st) {
      setGroupOverrideEdit((p) => ({ ...(p || {}), error: "Час завершення має бути пізніше часу початку" }));
      return;
    }
    const payload = {
      groupId: groupOverrideEdit.groupId,
      date: groupOverrideEdit.date,
      slotIndex: groupOverrideEdit.slotIndex,
      originalStartTime: groupOverrideEdit.originalStartTime,
      originalEndTime: groupOverrideEdit.originalEndTime,
      startTime: groupOverrideEdit.startTime,
      endTime: groupOverrideEdit.endTime,
      roomName: normalizeRoomName(groupOverrideEdit.roomName || primaryRoomName) || primaryRoomName,
      trainerId: groupOverrideEdit.trainerId || null,
      title: groupOverrideEdit.title || null,
      note: groupOverrideEdit.note || null,
      status: "active",
    };
    try {
      if (groupOverrideEdit.overrideId) await onUpdateGroupLessonOverride?.(groupOverrideEdit.overrideId, payload);
      else await onAddGroupLessonOverride?.(payload);
      setGroupOverrideEdit(null);
    } catch (err) {
      console.error(err);
      setGroupOverrideEdit((p) => ({ ...(p || {}), error: "Не вдалося зберегти зміни цього заняття" }));
    }
  };

  const resetGroupOverrideEdit = async () => {
    if (!groupOverrideEdit?.overrideId) return;
    try {
      await onDeleteGroupLessonOverride?.(groupOverrideEdit.overrideId);
      setGroupOverrideEdit(null);
    } catch (err) {
      console.error(err);
      setGroupOverrideEdit((p) => ({ ...(p || {}), error: "Не вдалося скинути зміни цього заняття" }));
    }
  };

  const resolveLessonPlanTrainerId = (event) => {
    const group = safeGroups.find((g) => String(g.id) === String(event?.groupId));
    return event?.trainerId || group?.trainer_id || (!isAdmin ? currentTrainerId : "");
  };

  const openLessonPlanEditor = (event) => {
    if (!canEditGroupSingleLesson(event)) return;
    const groupId = event?.groupId || "";
    const trainerId = resolveLessonPlanTrainerId(event);
    const lessonDate = event?.date || "";
    const scheduleSlotIndex = Number(event?.slotIndex || 0);
    if (!groupId || !lessonDate || !trainerId) {
      setLessonPlanEdit({
        groupId,
        trainerId,
        lessonDate,
        scheduleSlotIndex,
        groupName: event?.groupName || event?.title || "—",
        trainerName: event?.trainer || "—",
        planType: "other",
        goal: "",
        plannedContent: "",
        plannedDifficulty: "medium",
        plannedOutcome: "",
        notes: "",
        saving: false,
        error: "Не вдалося визначити групу, дату або тренера для плану.",
      });
      return;
    }

    const existing = trainingLessonPlanMap.get(getLessonPlanKey(groupId, trainerId, lessonDate, scheduleSlotIndex));
    setLessonPlanEdit({
      id: existing?.id || null,
      groupId,
      trainerId,
      lessonDate,
      scheduleSlotIndex,
      groupName: event?.groupName || event?.title || "—",
      trainerName: event?.trainer || trainerMap.get(String(trainerId)) || currentTrainerName || "—",
      planType: existing?.planType || "other",
      goal: existing?.goal || "",
      plannedContent: existing?.plannedContent || "",
      plannedDifficulty: existing?.plannedDifficulty || "medium",
      plannedOutcome: existing?.plannedOutcome || "",
      notes: existing?.notes || "",
      saving: false,
      error: "",
    });
  };

  const saveLessonPlanEdit = async () => {
    if (!lessonPlanEdit || lessonPlanEdit.saving) return;
    if (!lessonPlanEdit.groupId || !lessonPlanEdit.trainerId || !lessonPlanEdit.lessonDate) {
      setLessonPlanEdit((p) => ({ ...(p || {}), error: "Не вдалося визначити групу, дату або тренера для плану." }));
      return;
    }
    setLessonPlanEdit((p) => ({ ...(p || {}), saving: true, error: "" }));
    try {
      await onUpsertTrainingLessonPlan?.({
        groupId: lessonPlanEdit.groupId,
        trainerId: lessonPlanEdit.trainerId,
        lessonDate: lessonPlanEdit.lessonDate,
        scheduleSlotIndex: Number(lessonPlanEdit.scheduleSlotIndex || 0),
        planType: lessonPlanEdit.planType || "other",
        goal: lessonPlanEdit.goal || "",
        plannedContent: lessonPlanEdit.plannedContent || "",
        plannedDifficulty: lessonPlanEdit.plannedDifficulty || null,
        plannedOutcome: lessonPlanEdit.plannedOutcome || "",
        notes: lessonPlanEdit.notes || "",
      });
      setLessonPlanEdit(null);
    } catch (err) {
      console.error(err);
      setLessonPlanEdit((p) => ({ ...(p || {}), saving: false, error: err?.message || "Не вдалося зберегти план заняття" }));
    }
  };

  const cancelSingleGroupLesson = async (e) => {
    if (!canEditGroupSingleLesson(e)) return;
    if (!window.confirm("Скасувати тільки це заняття?")) return;
    const payload = {
      groupId: e.groupId,
      date: e.date,
      slotIndex: e.slotIndex,
      originalStartTime: e.originalStartTime || e.startTime,
      originalEndTime: e.originalEndTime || e.endTime,
      startTime: e.startTime,
      endTime: e.endTime,
      roomName: e.roomName || primaryRoomName,
      trainerId: e.trainerId || null,
      title: e.isOverride ? e.title || null : null,
      note: e.note || null,
      status: "cancelled",
    };
    try {
      if (e.overrideId) await onUpdateGroupLessonOverride?.(e.overrideId, payload);
      else await onAddGroupLessonOverride?.(payload);
    } catch (err) {
      console.error(err);
      alert("Не вдалося скасувати це заняття");
    }
  };

  const saveGroupSlotEdit = async () => {
    if (!groupSlotEdit || !onUpdateGroupSchedule || groupSlotEdit.error) return;
    if (groupSlotEdit.groupId == null || groupSlotEdit.slotIndex == null) {
      setGroupSlotEdit((p) => ({ ...(p || {}), error: "Не вдалося визначити запис розкладу для редагування" }));
      return;
    }
    const st = toMin(groupSlotEdit.startTime);
    const en = toMin(groupSlotEdit.endTime);
    if (st == null || en == null || en <= st) {
      setGroupSlotEdit((p) => ({ ...(p || {}), error: "Час завершення має бути пізніше часу початку" }));
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
      setExistingOrDefault(next, ["weekday", "dayOfWeek", "day", "dow", "weekDay"], groupSlotEdit.weekday, "weekday");
      setExistingOrDefault(next, ["startTime", "start"], groupSlotEdit.startTime, "startTime");
      setExistingOrDefault(next, ["endTime", "end"], groupSlotEdit.endTime, "endTime");
      if ("time" in next) next.time = `${groupSlotEdit.startTime}-${groupSlotEdit.endTime}`;
      const title = String(groupSlotEdit.title || "").trim() || null;
      setExistingOrDefault(next, ["title", "name", "label"], title, "title");
      next.title = title;
      setExistingOrDefault(next, ["roomName", "room_name", "room", "location", "hall"], normalizeRoomName(groupSlotEdit.roomName || primaryRoomName) || primaryRoomName, "roomName");
      setExistingOrDefault(next, ["trainerId", "trainer_id"], groupSlotEdit.trainerId || null, "trainerId");
      const note = String(groupSlotEdit.note || "").trim() || null;
      setExistingOrDefault(next, ["note", "notes", "description"], note, "note");
      next.note = note;
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
  const isTodaySelected = selectedDate === toLocalDateKey(new Date());
  const nowMinute = (() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  })();
  const isNarrowScreen = typeof window !== "undefined" ? window.innerWidth < 900 : false;
  const isMobile = typeof window !== "undefined" ? window.innerWidth < 768 : false;
  const isDarkTheme = String(theme.bg || "").toLowerCase() === "#0f131a";
  const typeAccent = {
    group_lesson: { bg: "rgba(99,102,241,.12)", border: "#6366f1", text: isDarkTheme ? "#c7d2fe" : "#4338ca" },
    individual_training: { bg: "rgba(6,182,212,.14)", border: "#06b6d4", text: isDarkTheme ? "#a5f3fc" : "#0e7490" },
    room_booking: { bg: "rgba(59,130,246,.14)", border: "#3b82f6", text: isDarkTheme ? "#bfdbfe" : "#1d4ed8" },
    cleaning: { bg: "rgba(245,158,11,.14)", border: "#f59e0b", text: isDarkTheme ? "#fde68a" : "#b45309" },
    custom_admin_event: { bg: "rgba(217,70,239,.14)", border: "#d946ef", text: isDarkTheme ? "#f5d0fe" : "#a21caf" },
  };
  const editorSurface = isDarkTheme
    ? "linear-gradient(180deg, rgba(15,23,42,.78), rgba(2,6,23,.7))"
    : "linear-gradient(180deg, rgba(255,255,255,.78), rgba(248,250,252,.68))";
  const editorOverlay = isDarkTheme ? "rgba(2,6,23,.58)" : "rgba(15,23,42,.12)";
  const editorInputSt = {
    ...inputSt,
    minHeight: isMobile ? 38 : 40,
    borderRadius: 12,
    padding: isMobile ? "0 10px" : "0 12px",
    fontSize: isMobile ? 12.5 : 13,
    background: isDarkTheme ? "rgba(15,23,42,.46)" : "rgba(255,255,255,.7)",
    color: theme.text,
    borderColor: isDarkTheme ? "rgba(148,163,184,.24)" : "rgba(148,163,184,.38)",
    backdropFilter: "blur(14px)",
    WebkitBackdropFilter: "blur(14px)",
    boxShadow: isDarkTheme ? "inset 0 1px 0 rgba(255,255,255,.06)" : "inset 0 1px 0 rgba(255,255,255,.82), 0 1px 2px rgba(15,23,42,.04)",
  };
  const editorBtnSt = {
    ...btnS,
    minHeight: isMobile ? 38 : 40,
    borderRadius: 999,
    padding: isMobile ? "0 12px" : "0 14px",
    fontSize: isMobile ? 12.5 : 13,
    background: isDarkTheme ? "rgba(15,23,42,.42)" : "rgba(255,255,255,.66)",
    color: theme.text,
    borderColor: isDarkTheme ? "rgba(148,163,184,.25)" : "rgba(148,163,184,.38)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
  };
  const editorSectionLabelSt = { fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".08em", color: theme.textLight, fontWeight: 800 };
  const eventTypeIcon = { room_booking: "◌", individual_training: "✦", group_lesson: "●", cleaning: "✧", custom_admin_event: "◆" };
  const toolbarBtnSt = {
    ...btnS,
    minHeight: isMobile ? 34 : 40,
    borderRadius: 999,
    padding: isMobile ? "0 10px" : "0 14px",
    fontSize: isMobile ? 12 : 13,
    background: isDarkTheme ? "rgba(15,23,42,.38)" : "rgba(255,255,255,.62)",
    border: `1px solid ${isDarkTheme ? "rgba(148,163,184,.22)" : "rgba(148,163,184,.34)"}`,
    color: theme.text,
    boxShadow: isDarkTheme ? "inset 0 1px 0 rgba(255,255,255,.05)" : "inset 0 1px 0 rgba(255,255,255,.75)",
  };
  const toolbarActiveSt = {
    ...toolbarBtnSt,
    color: "#fff",
    background: `linear-gradient(135deg, ${theme.primary}, #7c3aed)`,
    borderColor: "rgba(255,255,255,.28)",
    boxShadow: `0 8px 20px ${theme.primary}35`,
  };
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
    const eventRoomNames = Array.from(selectedDateByRoom.keys()).map((room) => normalizeRoomName(room)).filter(Boolean);
    const orderedRooms = Array.from(new Set([...(eventRoomNames.length ? eventRoomNames : []), ...activeRoomNames]));
    const baseRooms = orderedRooms.length ? orderedRooms : eventRoomNames;
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
    if (selectedRoom !== "all") return isMobile ? "minmax(100%, 1fr)" : "minmax(260px,1fr)";
    const count = Math.max(1, dayRoomsToRender.length);
    if (isMobile) {
      if (dayRoomColumnLimit !== "all" && Math.max(1, Number(dayRoomColumnLimit || 1)) === 1) return "minmax(100%, 1fr)";
      return `repeat(${count}, minmax(240px, 260px))`;
    }
    if (dayRoomColumnLimit === "all") return `repeat(${count}, minmax(240px, 1fr))`;
    return `repeat(${Math.max(1, Number(dayRoomColumnLimit || 1))}, minmax(240px, 1fr))`;
  }, [selectedRoom, dayRoomsToRender.length, dayRoomColumnLimit, isMobile]);
  const dayRoomScrollWidth = useMemo(() => {
    if (!isMobile || selectedRoom !== "all" || dayRoomColumnLimit === "1") return undefined;
    const count = Math.max(1, dayRoomsToRender.length);
    return `${count * 250 + Math.max(0, count - 1) * 10}px`;
  }, [isMobile, selectedRoom, dayRoomColumnLimit, dayRoomsToRender.length]);

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
      <div style={{ ...cardSt, border: `1px solid ${theme.border}`, display: "grid", gap: isMobile ? 5 : 10, padding: isMobile ? 8 : cardSt.padding, background: isMobile ? (isDarkTheme ? "rgba(15,23,42,.42)" : "rgba(255,255,255,.62)") : cardSt.background, backdropFilter: isMobile ? "blur(12px)" : undefined }}>
        <div style={{ display: "flex", gap: isMobile ? 5 : 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          style={toolbarBtnSt}
          onClick={() => setWeekStart((d) => addDays(d, -7))}
        >
          {isMobile ? "←" : "← Попередній тиждень"}
        </button>
        <button
          style={toolbarBtnSt}
          onClick={() => setWeekStart(startOfWeek(new Date()))}
        >
          Сьогодні
        </button>
        <button style={toolbarBtnSt} onClick={() => setWeekStart((d) => addDays(d, 7))}>
          {isMobile ? "→" : "Наступний тиждень →"}
        </button>
        </div>
        <div style={{ display: "flex", gap: isMobile ? 5 : 6, flexWrap: "wrap" }}>
          {[
            { id: "month", label: "Місяць" },
            { id: "week", label: "Тиждень" },
            { id: "day", label: "День" },
          ].map((m) => (
            <button
              key={m.id}
              style={viewMode === m.id ? toolbarActiveSt : toolbarBtnSt}
              onClick={() => setViewMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: isMobile ? 5 : 8, alignItems: "center", flexWrap: "wrap" }}>
        <select
          style={{ ...editorInputSt, minHeight: isMobile ? 34 : 44, maxWidth: isMobile ? 160 : 210, fontSize: isMobile ? 12 : undefined, borderRadius: 999 }}
          value={selectedRoom}
          onChange={(e) => setSelectedRoom(e.target.value)}
        >
          <option value="all">Усі зали</option>
          {allKnownRooms.map((room) => <option key={room} value={room}>{room}</option>)}
        </select>
        {isAdmin ? <button style={toolbarBtnSt} onClick={() => setShowRoomsManager((v) => !v)}>Зали</button> : null}
        <div
          style={{ marginLeft: isMobile ? 0 : "auto", fontSize: isMobile ? 10.5 : 12, color: theme.textLight, width: isMobile ? "100%" : undefined }}
        >
          Тиждень: {toLocalDateKey(weekDays[0])} — {toLocalDateKey(weekDays[6])}
        </div>
        {canManageBookings && (
          <button
            style={{ ...toolbarActiveSt, minHeight: isMobile ? 34 : 40, padding: isMobile ? "0 12px" : "0 16px" }}
            onClick={() => {
              setEditingId(null);
              setFormMode("full");
              setShowForm((v) => !v);
            }}
          >
            {isMobile ? "+ Додати" : "+ Додати тренування / резерв"}
          </button>
        )}
        </div>
      </div>

      {canManageBookings && showForm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 5100, background: editorOverlay, display: "grid", placeItems: isMobile ? "end center" : "center", padding: isMobile ? "0 8px" : 12, overflowX: "hidden" }}>
        <div style={{ ...cardSt, border: `1px solid ${theme.border}`, width: isMobile ? "calc(100vw - 16px)" : (formMode === "compact" ? "min(480px, 96vw)" : "min(540px, 96vw)"), maxWidth: isMobile ? "none" : undefined, maxHeight: isMobile ? "74vh" : "86vh", overflowY: "auto", overflowX: "hidden", borderRadius: isMobile ? "16px 16px 0 0" : 18, background: editorSurface, backdropFilter: "blur(22px) saturate(1.2)", WebkitBackdropFilter: "blur(22px) saturate(1.2)", boxShadow: isDarkTheme ? "0 22px 60px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.08)" : "0 22px 60px rgba(15,23,42,.18), inset 0 1px 0 rgba(255,255,255,.85)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div>
              <b style={{ fontSize: isMobile ? 17 : 18, color: theme.text }}>{editingId ? "Редагувати подію" : "Нова подія"}</b>
              <div style={{ fontSize: 12, color: theme.textLight }}>{draft.date} · {draft.startTime}–{draft.endTime}</div>
            </div>
            <button style={{ ...editorBtnSt, minHeight: isMobile ? 32 : 34, width: isMobile ? 34 : 36, padding: 0, justifyContent: "center" }} onClick={() => { setShowForm(false); setEditingId(null); setFormErrors({}); }}>✕</button>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: isMobile ? 7 : 8,
            }}
          >
            <div style={editorSectionLabelSt}>Основне</div>
            <input style={{ ...editorInputSt, minHeight: isMobile ? 42 : 46, fontSize: isMobile ? 14 : 15, borderColor: formErrors.title ? theme.danger : editorInputSt.borderColor }} placeholder="Назва / клієнт / група" value={draft.title} onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))} />
            {formErrors.title ? <div style={{ color: theme.danger, fontSize: 12 }}>{formErrors.title}</div> : null}
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{allowedEventTypes.map((eventType) => { const ac = typeAccent[eventType] || typeAccent.room_booking; const active = draft.eventType === eventType; return <button key={eventType} type="button" style={{ ...editorBtnSt, minHeight: isMobile ? 30 : 32, padding: isMobile ? "0 8px" : "0 10px", gap: 5, borderColor: active ? ac.border : theme.border, color: active ? ac.text : theme.textLight, background: active ? ac.bg : (isDarkTheme ? "rgba(15,23,42,.3)" : "rgba(255,255,255,.54)"), boxShadow: active ? `0 0 0 1px ${ac.border}66, 0 0 14px ${ac.border}22` : "none" }} onClick={() => { setDraft((p) => ({ ...p, eventType, bookingType: eventType === "individual_training" ? p.bookingType || tariffTypes[0]?.id : null, peopleCount: eventType === "individual_training" ? p.peopleCount || 1 : null, price: eventType === "individual_training" ? getTariffPrice(p.bookingType || tariffTypes[0]?.id) : 0, paymentMethod: eventType === "individual_training" ? p.paymentMethod || "none" : "none" })); }}><span style={{ fontSize: 11, color: ac.border }}>{eventTypeIcon[eventType] || "•"}</span>{isMobile ? getEventTypeLabel(eventType).replace("Індивідуальне тренування", "Індивід.").replace("Кастомна подія", "Інше") : getEventTypeLabel(eventType)}</button>; })}</div>
            <div style={editorSectionLabelSt}>Час і місце</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
            <input style={{ ...editorInputSt, borderColor: formErrors.date ? theme.danger : editorInputSt.borderColor }} type="date" value={draft.date} onChange={(e) => setDraft((p) => ({ ...p, date: e.target.value }))} />
              <input style={{ ...editorInputSt, borderColor: formErrors.startTime ? theme.danger : editorInputSt.borderColor }} type="time" value={draft.startTime} onChange={(e) => setDraft((p) => ({ ...p, startTime: e.target.value }))} />
              <input style={{ ...editorInputSt, borderColor: formErrors.endTime ? theme.danger : editorInputSt.borderColor }} type="time" value={draft.endTime} onChange={(e) => setDraft((p) => ({ ...p, endTime: e.target.value }))} />
            </div>
            {(formErrors.date || formErrors.startTime || formErrors.endTime) ? <div style={{ color: theme.danger, fontSize: 12 }}>{formErrors.date || formErrors.startTime || formErrors.endTime}</div> : null}
            <select style={editorInputSt} value={draft.roomName || primaryRoomName} onChange={(e) => setDraft((p) => ({ ...p, roomName: e.target.value }))}>
              {allKnownRooms.map((room) => <option key={room} value={room}>{room}</option>)}
            </select>
            {draft.eventType !== "cleaning" ? (
              <select
                style={editorInputSt}
                value={isAdmin ? draft.trainerId || "" : currentTrainerId}
                disabled={!isAdmin}
                onChange={(e) => {
                  const trainerId = e.target.value;
                  setDraft((p) => ({
                    ...p,
                    trainerId,
                    trainerName: trainerId ? getTrainerNameById(trainerId) : "",
                  }));
                }}
              >
                {isAdmin ? <option value="">Тренер</option> : null}
                {!isAdmin && currentTrainerId ? <option value={currentTrainerId}>{currentTrainerName || currentTrainerId}</option> : null}
                {isAdmin && safeTrainers.map((t) => <option key={t.id} value={t.id}>{getTrainerDisplayName(t)}</option>)}
              </select>
            ) : null}
            {formMode === "compact" ? <button style={{ ...editorBtnSt, minHeight: isMobile ? 34 : 36 }} onClick={applyQuickToFullForm}>Показати всі поля</button> : null}
            {formMode === "full" ? <>
            <div style={editorSectionLabelSt}>Деталі</div>
            {draft.eventType === "individual_training" && (
              <>
                <select
                  style={editorInputSt}
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
                  style={editorInputSt}
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
                  style={editorInputSt}
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
                  style={editorInputSt}
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
                style={editorInputSt}
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
            <input
              style={editorInputSt}
              placeholder="Нотатка"
              value={draft.note}
              onChange={(e) =>
                setDraft((p) => ({ ...p, note: e.target.value }))
              }
            />
            <select style={editorInputSt} value={draft.recurrence} onChange={(e) => setDraft((p) => ({ ...p, recurrence: e.target.value }))}>
              <option value="none">Без повтору</option>
              <option value="daily">Щодня</option>
              <option value="weekly">Щотижня</option>
              <option value="monthly">Щомісяця</option>
            </select>
            <input style={editorInputSt} type="date" value={draft.recurrenceUntil || ""} onChange={(e) => setDraft((p) => ({ ...p, recurrenceUntil: e.target.value }))} />
            <input style={editorInputSt} type="color" value={draft.color || "#64748b"} onChange={(e) => setDraft((p) => ({ ...p, color: e.target.value }))} />
            <select style={editorInputSt} value={draft.status || "active"} onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value }))}>
              <option value="active">Активно</option>
              <option value="tentative">Попередньо</option>
              <option value="cancelled">Скасовано</option>
            </select>
            <input style={editorInputSt} placeholder="Опис" value={draft.description || ""} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))} />
            <button type="button" style={{ ...editorBtnSt, minHeight: isMobile ? 34 : 36 }} onClick={applyFullToCompactForm}>Сховати зайві поля</button>
            </> : null}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, position: "sticky", bottom: 0, background: isDarkTheme ? "rgba(2,6,23,.94)" : "rgba(255,255,255,.96)", borderTop: `1px solid ${theme.border}`, paddingTop: 8, paddingBottom: "calc(8px + env(safe-area-inset-bottom, 0px))" }}>
            <button style={{ ...btnP, minHeight: isMobile ? 42 : 40, borderRadius: 999, padding: "0 16px" }} onClick={saveBooking}>
              Зберегти
            </button>
            <button
              style={{ ...editorBtnSt, minHeight: isMobile ? 42 : 40 }}
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
                setFormErrors({});
              }}
            >
              Скасувати
            </button>
            {editingId ? <button style={{ ...editorBtnSt, color: theme.danger, marginLeft: "auto", minHeight: isMobile ? 42 : 40 }} onClick={async () => { await onDeleteBooking(editingId); setShowForm(false); setEditingId(null); }}>Видалити</button> : null}
          </div>
        </div>
        </div>
      )}

      {selectedEventDetails && (
        <div style={{ position: "fixed", inset: 0, zIndex: 5000, background: editorOverlay, display: "grid", placeItems: "center", padding: 12 }}>
          <div style={{ ...cardSt, border: `1px solid ${theme.border}`, width: "min(480px,94vw)", maxHeight: "86vh", overflow: "auto", borderRadius: 18, background: editorSurface, color: theme.text }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
              <div>
                <div style={editorSectionLabelSt}>Деталі</div>
                <b style={{ fontSize: 18 }}>{selectedEventDetails.title || selectedEventDetails.groupName || "Подія"}</b>
              </div>
              <button style={{ ...editorBtnSt, minHeight: 32, width: 34, padding: 0 }} onClick={() => setSelectedEventDetails(null)}>✕</button>
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span style={{ ...editorBtnSt, minHeight: 28, padding: "0 9px" }}>🕒 {selectedEventDetails.startTime}–{selectedEventDetails.endTime}</span>
              <span style={{ ...editorBtnSt, minHeight: 28, padding: "0 9px" }}>📅 {selectedEventDetails.date}</span>
              <span style={{ ...editorBtnSt, minHeight: 28, padding: "0 9px" }}>⌂ {selectedEventDetails.roomName || primaryRoomName || "—"}</span>
              <span style={{ ...editorBtnSt, minHeight: 28, padding: "0 9px" }}>{getEventTypeLabel(selectedEventDetails.eventType)}</span>
              {selectedEventDetails.cancelled ? <span style={{ ...editorBtnSt, minHeight: 28, padding: "0 9px", color: theme.danger }}>Скасовано</span> : null}
            </div>
            <div style={{ marginTop: 12, display: "grid", gap: 8, fontSize: 13 }}>
              <div style={{ color: theme.textLight }}>Група / клієнт</div>
              <div>{selectedEventDetails.groupName || selectedEventDetails.title || "—"}</div>
              <div style={{ color: theme.textLight }}>Напрямок · Тренер</div>
              <div>{selectedEventDetails.direction || "—"} · {selectedEventDetails.trainer || "—"}</div>
            </div>
          </div>
        </div>
      )}


      {lessonPlanEdit && (
        <div style={{ position: "fixed", inset: 0, zIndex: 5050, background: editorOverlay, display: "grid", placeItems: isMobile ? "end center" : "center", padding: isMobile ? "0 8px" : 12 }}>
          <div style={{ ...cardSt, border: `1px solid ${theme.border}`, width: isMobile ? "calc(100vw - 16px)" : "min(560px,96vw)", maxHeight: isMobile ? "74vh" : "86vh", overflowY: "auto", borderRadius: isMobile ? "16px 16px 0 0" : 18, background: editorSurface, backdropFilter: "blur(22px) saturate(1.2)", WebkitBackdropFilter: "blur(22px) saturate(1.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 10 }}>
              <div>
                <b style={{ fontSize: isMobile ? 17 : 18, color: theme.text }}>План заняття</b>
                <div style={{ fontSize: 12, color: theme.textLight }}>{lessonPlanEdit.groupName} · {lessonPlanEdit.lessonDate}</div>
              </div>
              <button style={{ ...editorBtnSt, minHeight: 32, width: 34, padding: 0 }} onClick={() => setLessonPlanEdit(null)} disabled={lessonPlanEdit.saving}>✕</button>
            </div>

            <div style={{ display: "grid", gap: 9 }}>
              <div style={editorSectionLabelSt}>Тип і складність</div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) 180px", gap: 8 }}>
                <select
                  style={editorInputSt}
                  value={lessonPlanEdit.planType || "other"}
                  onChange={(e) => setLessonPlanEdit((p) => ({ ...p, planType: e.target.value, error: "" }))}
                  disabled={lessonPlanEdit.saving}
                >
                  {TRAINING_PLAN_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
                </select>
                <select
                  style={editorInputSt}
                  value={lessonPlanEdit.plannedDifficulty || "medium"}
                  onChange={(e) => setLessonPlanEdit((p) => ({ ...p, plannedDifficulty: e.target.value, error: "" }))}
                  disabled={lessonPlanEdit.saving}
                >
                  {TRAINING_PLAN_DIFFICULTIES.map((level) => <option key={level.id} value={level.id}>{level.label}</option>)}
                </select>
              </div>

              <div style={editorSectionLabelSt}>Ціль</div>
              <input
                style={editorInputSt}
                value={lessonPlanEdit.goal || ""}
                onChange={(e) => setLessonPlanEdit((p) => ({ ...p, goal: e.target.value, error: "" }))}
                placeholder="Що хочемо отримати після заняття"
                disabled={lessonPlanEdit.saving}
              />

              <div style={editorSectionLabelSt}>Що вчимо / робимо</div>
              <textarea
                style={{ ...editorInputSt, minHeight: 82, paddingTop: 10, resize: "vertical" }}
                value={lessonPlanEdit.plannedContent || ""}
                onChange={(e) => setLessonPlanEdit((p) => ({ ...p, plannedContent: e.target.value, error: "" }))}
                placeholder="Коротко: блоки, комбінації, повторення, зйомка..."
                disabled={lessonPlanEdit.saving}
              />

              <div style={editorSectionLabelSt}>Очікуваний результат</div>
              <textarea
                style={{ ...editorInputSt, minHeight: 66, paddingTop: 10, resize: "vertical" }}
                value={lessonPlanEdit.plannedOutcome || ""}
                onChange={(e) => setLessonPlanEdit((p) => ({ ...p, plannedOutcome: e.target.value, error: "" }))}
                placeholder="Наприклад: впевнено повторюють 1-й куплет / готові до зйомки"
                disabled={lessonPlanEdit.saving}
              />

              <div style={editorSectionLabelSt}>Нотатки</div>
              <textarea
                style={{ ...editorInputSt, minHeight: 58, paddingTop: 10, resize: "vertical" }}
                value={lessonPlanEdit.notes || ""}
                onChange={(e) => setLessonPlanEdit((p) => ({ ...p, notes: e.target.value, error: "" }))}
                placeholder="Опційно"
                disabled={lessonPlanEdit.saving}
              />

              <div style={{ fontSize: 12, color: theme.textLight }}>
                Ключ плану: група {lessonPlanEdit.groupId || "—"} · тренер {lessonPlanEdit.trainerName || lessonPlanEdit.trainerId || "—"} · слот {Number(lessonPlanEdit.scheduleSlotIndex || 0) + 1}
              </div>
              {lessonPlanEdit.error ? <div style={{ color: theme.danger, fontSize: 12 }}>{lessonPlanEdit.error}</div> : null}
            </div>

            <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
              <button style={btnP} onClick={saveLessonPlanEdit} disabled={lessonPlanEdit.saving || !lessonPlanEdit.groupId || !lessonPlanEdit.trainerId || !lessonPlanEdit.lessonDate}>
                {lessonPlanEdit.saving ? "Зберігаємо..." : "Зберегти план"}
              </button>
              <button style={btnS} onClick={() => setLessonPlanEdit(null)} disabled={lessonPlanEdit.saving}>Скасувати</button>
            </div>
          </div>
        </div>
      )}

      {groupOverrideEdit && (
        <div style={{ position: "fixed", inset: 0, zIndex: 5050, background: editorOverlay, display: "grid", placeItems: isMobile ? "end center" : "center", padding: isMobile ? "0 8px" : 12 }}>
          <div style={{ ...cardSt, border: `1px solid ${theme.border}`, width: isMobile ? "calc(100vw - 16px)" : "min(540px,96vw)", maxHeight: isMobile ? "74vh" : "86vh", overflowY: "auto", borderRadius: isMobile ? "16px 16px 0 0" : 18, background: editorSurface, backdropFilter: "blur(22px) saturate(1.2)", WebkitBackdropFilter: "blur(22px) saturate(1.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div>
                <b style={{ fontSize: isMobile ? 17 : 18, color: theme.text }}>Змінити тільки це заняття</b>
                <div style={{ fontSize: 12, color: theme.textLight }}>{groupOverrideEdit.groupName} · {groupOverrideEdit.date}</div>
              </div>
              <button style={{ ...editorBtnSt, minHeight: 32, width: 34, padding: 0 }} onClick={() => setGroupOverrideEdit(null)}>✕</button>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={editorSectionLabelSt}>Назва і дата</div>
              <input style={editorInputSt} placeholder={groupOverrideEdit.groupName || "Назва заняття"} value={groupOverrideEdit.title || ""} onChange={(e) => setGroupOverrideEdit((p) => ({ ...p, title: e.target.value }))} />
              <input style={{ ...editorInputSt, opacity: 0.75 }} type="date" value={groupOverrideEdit.date || ""} readOnly />
              <div style={editorSectionLabelSt}>Час і місце</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
                <input style={editorInputSt} type="time" value={groupOverrideEdit.startTime || ""} onChange={(e) => setGroupOverrideEdit((p) => ({ ...p, startTime: e.target.value }))} />
                <input style={editorInputSt} type="time" value={groupOverrideEdit.endTime || ""} onChange={(e) => setGroupOverrideEdit((p) => ({ ...p, endTime: e.target.value }))} />
              </div>
              <select style={editorInputSt} value={groupOverrideEdit.roomName || primaryRoomName} onChange={(e) => setGroupOverrideEdit((p) => ({ ...p, roomName: e.target.value }))}>
                {allKnownRooms.map((room) => <option key={room} value={room}>{room}</option>)}
              </select>
              <select style={editorInputSt} value={groupOverrideEdit.trainerId || ""} onChange={(e) => setGroupOverrideEdit((p) => ({ ...p, trainerId: e.target.value }))}>
                <option value="">Без тренера</option>
                {safeTrainers.map((t) => <option key={t.id} value={t.id}>{getTrainerDisplayName(t) || t.email || t.id}</option>)}
              </select>
              <input style={editorInputSt} placeholder="Нотатка" value={groupOverrideEdit.note || ""} onChange={(e) => setGroupOverrideEdit((p) => ({ ...p, note: e.target.value }))} />
              <select style={editorInputSt} value="active" disabled>
                <option value="active">Активно</option>
              </select>
              {groupOverrideEdit.error ? <div style={{ color: theme.danger, fontSize: 12 }}>{groupOverrideEdit.error}</div> : null}
              <div style={{ fontSize: 12, color: theme.textLight }}>
                Регулярний графік групи не зміниться; буде збережено override тільки для цієї дати й слоту.
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              <button style={btnP} onClick={saveGroupOverrideEdit}>Зберегти</button>
              <button style={btnS} onClick={() => setGroupOverrideEdit(null)}>Скасувати</button>
              {groupOverrideEdit.overrideId ? <button style={{ ...btnS, color: theme.danger, marginLeft: "auto" }} onClick={resetGroupOverrideEdit}>Скинути зміни для цього заняття</button> : null}
            </div>
          </div>
        </div>
      )}

      {isAdmin && groupSlotEdit && (
        <div style={{ position: "fixed", inset: 0, zIndex: 5050, background: editorOverlay, display: "grid", placeItems: isMobile ? "end center" : "center", padding: isMobile ? "0 8px" : 12 }}>
          <div style={{ ...cardSt, border: `1px solid ${theme.border}`, width: isMobile ? "calc(100vw - 16px)" : "min(540px,96vw)", maxHeight: isMobile ? "74vh" : "86vh", overflowY: "auto", borderRadius: isMobile ? "16px 16px 0 0" : 18, background: editorSurface, backdropFilter: "blur(22px) saturate(1.2)", WebkitBackdropFilter: "blur(22px) saturate(1.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div>
                <b style={{ fontSize: isMobile ? 17 : 18, color: theme.text }}>Змінити регулярний графік</b>
                <div style={{ fontSize: 12, color: theme.textLight }}>{groupSlotEdit.groupName || "—"} · {groupSlotEdit.direction || "—"}</div>
              </div>
              <button style={{ ...editorBtnSt, minHeight: 32, width: 34, padding: 0 }} onClick={() => setGroupSlotEdit(null)}>✕</button>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={editorSectionLabelSt}>Назва і повторення</div>
              <input style={editorInputSt} placeholder={groupSlotEdit.groupName || "Назва заняття"} value={groupSlotEdit.title || ""} onChange={(e) => setGroupSlotEdit((p) => ({ ...p, title: e.target.value, error: "" }))} />
              <select style={editorInputSt} value={groupSlotEdit.weekday ?? 1} onChange={(e) => setGroupSlotEdit((p) => ({ ...p, weekday: Number(e.target.value || 0), error: "" }))}>
                {WEEKDAY_OPTIONS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
              </select>
              <div style={editorSectionLabelSt}>Час і місце</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
                <input style={editorInputSt} type="time" value={groupSlotEdit.startTime || ""} onChange={(e) => setGroupSlotEdit((p) => ({ ...p, startTime: e.target.value, error: "" }))} />
                <input style={editorInputSt} type="time" value={groupSlotEdit.endTime || ""} onChange={(e) => setGroupSlotEdit((p) => ({ ...p, endTime: e.target.value, error: "" }))} />
              </div>
              <select style={editorInputSt} value={groupSlotEdit.roomName || primaryRoomName} onChange={(e) => setGroupSlotEdit((p) => ({ ...p, roomName: e.target.value, error: "" }))}>
                {allKnownRooms.map((room) => <option key={room} value={room}>{room}</option>)}
              </select>
              <select style={editorInputSt} value={groupSlotEdit.trainerId || ""} onChange={(e) => setGroupSlotEdit((p) => ({ ...p, trainerId: e.target.value, error: "" }))}>
                <option value="">Без тренера</option>
                {safeTrainers.map((t) => <option key={t.id} value={t.id}>{getTrainerDisplayName(t) || t.email || t.id}</option>)}
              </select>
              <input style={editorInputSt} placeholder="Нотатка" value={groupSlotEdit.note || ""} onChange={(e) => setGroupSlotEdit((p) => ({ ...p, note: e.target.value, error: "" }))} />
              {groupSlotEdit.error ? <div style={{ color: theme.danger, fontSize: 12 }}>{groupSlotEdit.error}</div> : null}
              <div style={{ fontSize: 12, color: theme.textLight }}>
                Це змінить усі повторювані заняття цього слоту, не лише обрану дату.
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              <button style={btnP} onClick={saveGroupSlotEdit} disabled={!!groupSlotEdit.error}>Зберегти</button>
              <button style={btnS} onClick={() => setGroupSlotEdit(null)}>Скасувати</button>
            </div>
          </div>
        </div>
      )}

      {isAdmin && showRoomsManager ? (
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gridAutoRows: isMobile ? 58 : undefined, gap: isMobile ? 4 : 6 }}>
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
                <button key={key} onClick={() => { setSelectedDate(key); setViewMode("day"); }} style={{ textAlign: "left", width: "100%", minWidth: 0, boxSizing: "border-box", minHeight: isMobile ? 58 : 116, height: isMobile ? 58 : undefined, border: `1px solid ${key === toLocalDateKey(new Date()) ? "#6366f1" : theme.border}`, borderRadius: isMobile ? 10 : 12, background: inMonth ? (isDarkTheme ? "rgba(255,255,255,.025)" : "#ffffff") : (isDarkTheme ? "rgba(255,255,255,.01)" : "#f8fafc"), color: theme.text, padding: isMobile ? 5 : 8, display: "grid", alignContent: "start", gap: isMobile ? 2 : 5, overflow: "hidden" }}>
                  <div style={{ fontWeight: 700, color: inMonth ? theme.text : theme.textLight }}>{d.getDate()}</div>
                  {items.length > 0 && selectedRoom === "all" ? (
                    <>
                      <div
                        onClick={(ev) => { ev.stopPropagation(); setSelectedDate(key); setViewMode("day"); }}
                        style={{ fontSize: isMobile ? 10 : 11.5, color: theme.textLight, fontWeight: 700, lineHeight: 1.1 }}
                      >
                        {items.length} подій
                      </div>
                      <div
                        onClick={(ev) => { ev.stopPropagation(); setSelectedDate(key); setViewMode("day"); }}
                        style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}
                      >
                        {Array.from(new Set(items.map((ev) => colorKey(ev)))).slice(0, 4).map((tone) => {
                          const c = palette[tone] || palette.default;
                          return <span key={tone} style={{ width: isMobile ? 6 : 12, height: isMobile ? 6 : 4, borderRadius: 999, background: c.border, opacity: 0.65 }} />;
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
        <div style={{ ...cardSt, border: `1px solid ${theme.border}`, minWidth: 0, maxWidth: "100%", background: isDarkTheme ? "linear-gradient(180deg, rgba(15,23,42,.36), rgba(2,6,23,.18))" : "linear-gradient(180deg, rgba(255,255,255,.72), rgba(248,250,252,.54))", boxShadow: isDarkTheme ? "0 12px 32px rgba(0,0,0,.24)" : "0 12px 28px rgba(15,23,42,.08)" }}>
          <div style={{ display: "flex", gap: isMobile ? 5 : 8, marginBottom: isMobile ? 6 : 10, flexWrap: "wrap", alignItems: "center", paddingBottom: isMobile ? 6 : 8, borderBottom: `1px solid ${theme.border}` }}>
            <button style={toolbarBtnSt} onClick={() => shiftSelectedDate(-1)}>←</button>
            <input style={{ ...editorInputSt, minHeight: isMobile ? 34 : 40, width: isMobile ? 136 : 170, borderRadius: 999 }} type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
            <button style={toolbarBtnSt} onClick={() => shiftSelectedDate(1)}>→</button>
            <div style={{ fontSize: isMobile ? 10.5 : 12, color: theme.textLight, whiteSpace: "nowrap" }}>
              {selectedDateObj.toLocaleDateString("uk-UA", { weekday: isMobile ? "short" : "long", day: "numeric", month: "short" })}
            </div>
            {selectedRoom === "all" ? (
              <div style={{ display: "flex", gap: 4, alignItems: "center", marginLeft: isMobile ? 0 : "auto", flexWrap: "wrap" }}>
                <span style={{ fontSize: isMobile ? 10.5 : 12, color: theme.textLight }}>Залів:</span>
                {["1", "2", "3", "all"].map((v) => (
                  <button key={v} type="button" style={dayRoomColumnLimit === v ? toolbarActiveSt : toolbarBtnSt} onClick={() => setDayRoomColumnLimit(v)}>
                    {v === "all" ? "Усі" : v}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div style={{ width: "100%", maxWidth: "100%", minWidth: 0, overflowX: selectedRoom === "all" ? "auto" : "visible", overflowY: "visible", WebkitOverflowScrolling: "touch", touchAction: selectedRoom === "all" ? "pan-x pan-y" : "auto", overscrollBehaviorX: "contain" }}>
            {selectedRoom === "all" && isMobile ? <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 8 }}>{dayRoomsToRender.map(([room]) => <span key={room} style={{ border: `1px solid ${theme.border}`, borderRadius: 999, padding: "4px 10px", fontSize: 12, whiteSpace: "nowrap" }}>{room || NO_ROOM}</span>)}</div> : null}
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: dayRoomGridTemplate, width: dayRoomScrollWidth, minWidth: selectedRoom === "all" && (!isMobile || dayRoomColumnLimit !== "1") ? (dayRoomScrollWidth || `max-content`) : undefined }}>
              {dayRoomsToRender.map(([room, items]) => (
                <div key={room} style={{ border: `1px solid ${theme.border}`, borderRadius: 14, overflow: "hidden", minWidth: isMobile ? (selectedRoom === "all" && dayRoomColumnLimit !== "1" ? 240 : "100%") : 240, width: isMobile && selectedRoom === "all" && dayRoomColumnLimit !== "1" ? 240 : undefined }}>
                  <div style={{ padding: "8px 10px", borderBottom: `1px solid ${theme.border}`, fontWeight: 800 }}>{room || NO_ROOM}</div>
                  <div style={{ position: "relative", minHeight: (DAY_END_HOUR - DAY_START_HOUR) * 42, background: "rgba(255,255,255,.01)" }}>
                    {canManageBookings && !isMobile ? (
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
                      const typeMark = getEventTypeMark(e);
                      const trainerInitials = height >= 42 ? (getEventTrainerInitials(e) || getTrainerInitials(trainerMap.get(String(e.trainerId || e.trainer_id || "")))) : "";
                      const typeMarkSt = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: isMobile ? 14 : 16, height: isMobile ? 14 : 16, borderRadius: 999, background: c.border, color: "#fff", fontSize: isMobile ? 8.5 : 9.5, fontWeight: 800, lineHeight: 1, flex: "0 0 auto", boxShadow: isDarkTheme ? "0 1px 2px rgba(0,0,0,.22)" : "0 1px 2px rgba(15,23,42,.12)" };
                      const trainerMarkSt = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: isMobile ? 14 : 16, height: isMobile ? 14 : 16, borderRadius: 999, background: isDarkTheme ? "rgba(15,23,42,.84)" : "rgba(30,41,59,.9)", color: "#fff", border: isDarkTheme ? "1px solid rgba(148,163,184,.3)" : "1px solid rgba(15,23,42,.14)", fontSize: isMobile ? 7.5 : 8.5, fontWeight: 900, lineHeight: 1, flex: "0 0 auto", boxShadow: isDarkTheme ? "0 1px 2px rgba(0,0,0,.2)" : "0 1px 2px rgba(15,23,42,.1)" };
                      return (
                        <div
                          key={e.id}
                          onMouseDown={(ev) => { ev.stopPropagation(); }}
                          onClick={(ev) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                            if (canMutateEvent(e)) startEdit(e);
                            else setSelectedEventDetails(e);
                          }}
                          style={{ position: "absolute", left: isMobile ? 5 : 8, right: isMobile ? 5 : 8, top, height, border: `1px solid ${c.border}`, background: c.bg, borderRadius: isMobile ? 8 : 10, padding: isMobile ? 4 : 6, overflow: "hidden", zIndex: 4 }}
                        >
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 4, minWidth: 0 }}>
                            {typeMark ? <span style={typeMarkSt}>{typeMark}</span> : null}
                            {trainerInitials ? <span style={trainerMarkSt}>{trainerInitials}</span> : null}
                            <div style={{ fontSize: isMobile ? 10.5 : 11, fontWeight: 800, lineHeight: "1.15em", display: "-webkit-box", WebkitLineClamp: height > 42 ? 2 : 1, WebkitBoxOrient: "vertical", overflow: "hidden", minWidth: 0 }}>{e.title}</div>
                          </div>
                          <div style={{ display: "flex", gap: 4, alignItems: "center", minWidth: 0, marginTop: 1 }}>
                            <span style={{ fontSize: isMobile ? 9.5 : 10.5, color: theme.textLight, fontWeight: 700, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{e.startTime}–{e.endTime}</span>
                          </div>
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
                    const textRightPadding = (isAdmin || e.kind === "booking" || canEditGroupSingleLesson(e)) ? (isMobile ? 18 : 26) : 0;
                    const typeMark = getEventTypeMark(e);
                    const trainerInitials = height >= 42 ? (getEventTrainerInitials(e) || getTrainerInitials(trainerMap.get(String(e.trainerId || e.trainer_id || "")))) : "";
                    const extraLine = height >= 96 && e.kind === "booking"
                      ? (e.status && e.status !== "active" ? stView.text : (e.peopleCount ? `${e.peopleCount} ос.` : ""))
                      : "";
                    const typeMarkSt = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: isMobile ? 14 : 16, height: isMobile ? 14 : 16, borderRadius: 999, background: c.border, color: "#fff", fontSize: isMobile ? 8.5 : 9.5, fontWeight: 800, lineHeight: 1, flex: "0 0 auto", boxShadow: isDarkTheme ? "0 1px 2px rgba(0,0,0,.22)" : "0 1px 2px rgba(15,23,42,.12)" };
                    const trainerMarkSt = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: isMobile ? 14 : 16, height: isMobile ? 14 : 16, borderRadius: 999, background: isDarkTheme ? "rgba(15,23,42,.84)" : "rgba(30,41,59,.9)", color: "#fff", border: isDarkTheme ? "1px solid rgba(148,163,184,.3)" : "1px solid rgba(15,23,42,.14)", fontSize: isMobile ? 7.5 : 8.5, fontWeight: 900, lineHeight: 1, flex: "0 0 auto", boxShadow: isDarkTheme ? "0 1px 2px rgba(0,0,0,.2)" : "0 1px 2px rgba(15,23,42,.1)" };
                    return (
                      <div
                        key={e.id}
                        data-event-card="1"
                        onMouseDown={(ev) => ev.stopPropagation()}
                        onMouseUp={(ev) => ev.stopPropagation()}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          if (e.kind === "booking") {
                            if (canMutateThisEvent) startEdit(e);
                            else setSelectedEventDetails(e);
                          } else {
                            setSelectedEventDetails(e);
                          }
                        }}
                        style={{
                          position: "absolute",
                          top,
                          left: `${left}%`,
                          width: `${width}%`,
                          height,
                          border: `1px solid ${c.border}`,
                          background: c.bg,
                          opacity: stView.opacity,
                          borderRadius: isMobile ? 8 : 10,
                          padding: isMobile ? 4 : 6,
                          fontSize: isMobile ? 10 : 11,
                          overflow: "hidden",
                          zIndex: openMenuState?.eventId === e.id ? 2000 : 5,
                        }}
                      >
                        <div style={{ minWidth: 0, paddingRight: textRightPadding }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 4, minWidth: 0 }}>
                            {typeMark ? <span style={typeMarkSt}>{typeMark}</span> : null}
                            {trainerInitials ? <span style={trainerMarkSt}>{trainerInitials}</span> : null}
                            <div style={{ fontWeight: 800, lineHeight: "1.15em", display: "-webkit-box", WebkitLineClamp: height > 46 ? 2 : 1, WebkitBoxOrient: "vertical", overflow: "hidden", minWidth: 0, wordBreak: "break-word" }}>
                              {e.title}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 4, alignItems: "center", minWidth: 0, marginTop: 2 }}>
                            <span style={{ color: theme.text, fontSize: isMobile ? 10 : 11, fontWeight: 700, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{e.startTime}–{e.endTime}</span>
                          </div>
                          {extraLine ? <div style={{ marginTop: 2, fontSize: isMobile ? 9.5 : 10.5, color: theme.textLight, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{extraLine}</div> : null}
                          {(isAdmin || e.kind === "booking" || canEditGroupSingleLesson(e)) && (
                            <div style={{ position: "absolute", top: isMobile ? 4 : 6, right: isMobile ? 4 : 6, zIndex: 2100 }}>
                              <button
                                style={{
                                  ...btnS,
                                  padding: isMobile ? "0 4px" : "0 6px",
                                  fontSize: isMobile ? 10 : 12,
                                  lineHeight: isMobile ? "14px" : "16px",
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
                                      {canEditGroupSingleLesson(e) ? (
                                        <button
                                          style={btnS}
                                          onClick={() => {
                                            setOpenMenuState(null);
                                            openLessonPlanEditor(e);
                                          }}
                                        >
                                          План заняття
                                        </button>
                                      ) : null}
                                      {canEditGroupSingleLesson(e) ? (
                                        <button
                                          style={btnS}
                                          onClick={() => {
                                            setOpenMenuState(null);
                                            openGroupOverrideEditor(e);
                                          }}
                                        >
                                          Змінити тільки це заняття
                                        </button>
                                      ) : null}
                                      {canEditGroupSingleLesson(e) ? (
                                        <button
                                          style={btnS}
                                          onClick={() => {
                                            setOpenMenuState(null);
                                            cancelSingleGroupLesson(e);
                                          }}
                                        >
                                          Скасувати заняття
                                        </button>
                                      ) : null}
                                      {isAdmin && (
                                        <>
                                          <button
                                            style={btnS}
                                            onClick={() => {
                                              setOpenMenuState(null);
                                              openGroupSlotEditor(e);
                                            }}
                                          >
                                            Змінити регулярний графік
                                          </button>
                                          <div style={{ fontSize: 10, color: theme.textLight, padding: "0 4px" }}>
                                            Це змінить усі повторювані заняття цього слоту, не лише обрану дату.
                                          </div>
                                        </>
                                      )}
                                    </>
                                  )}
                                  </div>,
                                  document.body,
                                )}
                            </div>
                          )}
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
                style={editorInputSt}
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
                style={editorInputSt}
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
