import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import * as db from "./db";
import { supabase } from "./supabase";
import { getOperationalTrainers } from "./shared/trainers";
import { formatGroupScheduleLabel, getGroupAgeCategoryLabel, getGroupLevelLabel } from "./shared/groupLabels";
import Analytics from "./pages/Analytics";
import {
  APP_BUILD_LABEL,
  DEFAULT_GROUPS,
  DIRECTIONS,
  PLAN_TYPES,
  STATUS_COLORS,
  STATUS_LABELS,
  WEEKDAYS,
  applyThemeBindings,
  btnP,
  btnS,
  cardSt,
  inputSt,
  theme,
} from "./shared/constants";
import {
  addMonth,
  daysLeft,
  fmt,
  getDisplayName,
  getCancellationDate,
  getCancelledDatesForGroup,
  getNextNonCancelledTrainingDate,
  getNotifMsg,
  getSubStatus,
  today,
  toLocalISO,
  uid,
  useStickyState,
} from "./shared/utils";
import { buildAnalyticsFoundation } from "./shared/analytics";
import { resolveGroupTrainer } from "./shared/groupTrainer";
import { ADMIN_EMAILS, isAdminEmail } from "./shared/adminAccess";
import { Badge, Field, GroupSelect, Modal, Pill, StudentSelectWithSearch } from "./components/UI";
import { StudentForm, SubForm, TrialBookingForm, WaitlistForm } from "./components/Forms";
import AttendanceTab from "./components/AttendanceTab";
import ProAnalyticsTab from "./components/ProAnalyticsTab";
import DashboardTab from "./components/DashboardTab";
import MessagesTab from "./components/MessagesTab";
import TrainersTab from "./components/TrainersTab";
import TrainersNotificationsTab from "./components/TrainersNotificationsTab";
import AppUpdateBanner from "./components/AppUpdateBanner";
import ScheduleTab from "./components/ScheduleTab";
import StudentsCrmTab from "./components/StudentsCrmTab";
import {
  extractPushSubscriptionPayload,
  getPushStatus,
  PUSH_STATUS,
  requestPushSubscription,
  sendTestPushRequest,
} from "./push";
import { applyPwaUpdate, subscribeToPwaUpdates } from "./pwaUpdate";

const translitMap = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ye", ж: "zh", з: "z", и: "y", і: "i", ї: "yi", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch",
  ш: "sh", щ: "shch", ь: "", ю: "yu", я: "ya", э: "e", ё: "yo", ы: "y", ъ: "",
};
const normalizeDirectionId = (name = "") => String(name || "")
  .trim()
  .toLowerCase()
  .split("")
  .map((ch) => translitMap[ch] ?? ch)
  .join("")
  .replace(/[^a-z0-9]+/gi, "_")
  .replace(/^_+|_+$/g, "");
const UI_WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const PUBLIC_LEVEL_OPTIONS = [
  { value: "base", label: "BASE" },
  { value: "mix", label: "MIX" },
];
const PUBLIC_JOIN_STATUS_OPTIONS = [
  { value: "open", label: "Можна приєднатись" },
  { value: "experience_only", label: "Лише з досвідом" },
  { value: "closed", label: "Закрита група" },
];
const AGE_CATEGORY_OPTIONS = [
  { value: "teens_under_16", label: "10–16" },
  { value: "adults_16_plus", label: "16+" },
];
const addDaysForScheduleRange = (date, days) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toLocalISO(d);
};

const getGroupArchiveMeta = (group = {}) => {
  if (Object.prototype.hasOwnProperty.call(group, "is_active")) {
    return { mode: "is_active", isArchived: group.is_active === false };
  }
  if (Object.prototype.hasOwnProperty.call(group, "active")) {
    return { mode: "active", isArchived: group.active === false };
  }
  if (Object.prototype.hasOwnProperty.call(group, "archived_at")) {
    return { mode: "archived_at", isArchived: !!group.archived_at };
  }
  return { mode: null, isArchived: false };
};

const isGroupArchived = (group) => getGroupArchiveMeta(group).isArchived;


export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [authBlockMessage, setAuthBlockMessage] = useState("");
  const [accessChecking, setAccessChecking] = useState(true);
  const [accessAllowed, setAccessAllowed] = useState(false);
  const [pushStatus, setPushStatus] = useState(PUSH_STATUS.permissionDefault);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushInfo, setPushInfo] = useState("");
  const [testPushBusy, setTestPushBusy] = useState(false);
  const [testPushInfo, setTestPushInfo] = useState("");
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInstalling, setUpdateInstalling] = useState(false);

  const [students, setStudents] = useState([]);
  const [subs, setSubs] = useState([]);
  const [attn, setAttn] = useState([]);
  const [groups, setGroups] = useState(DEFAULT_GROUPS);
  const [scheduleGroups, setScheduleGroups] = useState(DEFAULT_GROUPS);
  const [directions, setDirections] = useState([]);
  const [cancelled, setCancelled] = useState([]);
  const [scheduleCancelled, setScheduleCancelled] = useState([]);
  const [studentGrps, setStudentGrps] = useState([]);
  const [waitlist, setWaitlist] = useState([]); 
  const [trialBookings, setTrialBookings] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [trainerGroups, setTrainerGroups] = useState([]);
  const [roomBookings, setRoomBookings] = useState([]);
  const [studioRooms, setStudioRooms] = useState([]);
  const [groupLessonOverrides, setGroupLessonOverrides] = useState([]);
  const [trainingLessonPlans, setTrainingLessonPlans] = useState([]);
  const [trainingLessonReports, setTrainingLessonReports] = useState([]);
  
  const [tab, setTab] = useStickyState("dashboard", "ds_danceStudioTab");
  const [modal, setModal] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [financeDetailItem, setFinanceDetailItem] = useState(null);
  const [searchQ, setSearchQ] = useState("");
  
  const [prefillSub, setPrefillSub] = useState(null);

  const [filterDir, setFilterDir] = useStickyState("all", "ds_filterDir");
  const [filterGroup, setFilterGroup] = useStickyState("all", "ds_filterGroup");
  const [filterStatus, setFilterStatus] = useStickyState("all", "ds_filterStatus");
  const [filterPlanType, setFilterPlanType] = useStickyState("all", "ds_filterPlanType");
  const [filterPaid, setFilterPaid] = useStickyState("all", "ds_filterPaid");
  const [filterPayMethod, setFilterPayMethod] = useStickyState("all", "ds_filterPayMethod");
  const [filterTrainer, setFilterTrainer] = useStickyState("all", "ds_filterTrainer");
  const [filterFromDate, setFilterFromDate] = useStickyState("", "ds_filterFromDate");
  const [filterToDate, setFilterToDate] = useStickyState("", "ds_filterToDate");
  const [filterDatePreset, setFilterDatePreset] = useStickyState("custom", "ds_filterDatePreset");
  const [filterAudit, setFilterAudit] = useStickyState("all", "ds_filterAudit");
  const [paymentsFiltersOpen, setPaymentsFiltersOpen] = useState(false);
  const [adminGroupSearch, setAdminGroupSearch] = useStickyState("", "ds_adminGroupSearch");
  const [adminGroupArchiveFilter, setAdminGroupArchiveFilter] = useStickyState("active", "ds_adminGroupArchiveFilter");
  const [adminGroupTrainerFilter, setAdminGroupTrainerFilter] = useStickyState("all", "ds_adminGroupTrainerFilter");
  const [stFilterDir, setStFilterDir] = useStickyState("all", "ds_stFilterDir");
  const [stFilterGroup, setStFilterGroup] = useStickyState("all", "ds_stFilterGroup");
  const [finFilterDir, setFinFilterDir] = useStickyState("all", "ds_finFilterDir");
  const [finFilterGroup, setFinFilterGroup] = useStickyState("all", "ds_finFilterGroup");
  const [finSortBy, setFinSortBy] = useStickyState("total", "ds_finSortBy"); 
  const [finSortOrder, setFinSortOrder] = useStickyState("desc", "ds_finSortOrder");
  const [customOrders, setCustomOrders] = useState({});
  const [warnedStudents, setWarnedStudents] = useState({});
  const [restoreGroupByStudent, setRestoreGroupByStudent] = useState({});
  const [selectedMessageStudentId, setSelectedMessageStudentId] = useState("");
  const [newGroupDraft, setNewGroupDraft] = useState({
    id: "",
    name: "",
    directionMode: "existing",
    directionId: DIRECTIONS[0]?.id || "",
    newDirectionName: "",
    schedule: [],
    startDate: "",
    trainerPct: "0",
    trainerId: "",
    showOnPublicSite: false,
    publicLevel: "",
    publicJoinStatus: "open",
    ageCategory: "",
  });

  const [expandedDirs, setExpandedDirs] = useState({});
  const [expandedSubDirs, setExpandedSubDirs] = useState({});
  const [trainersSubtab, setTrainersSubtab] = useStickyState("trainers", "ds_trainersSubtab");
  const [adminTab, setAdminTab] = useState("analytics");
  const [groupEditDraft, setGroupEditDraft] = useState(null);
  const [groupMergeDraft, setGroupMergeDraft] = useState(null);
  const [groupMergeBusy, setGroupMergeBusy] = useState(false);
  const [groupDeleteDraft, setGroupDeleteDraft] = useState(null);
  const [groupDeleteConfirmation, setGroupDeleteConfirmation] = useState("");
  const [groupDeleteBusy, setGroupDeleteBusy] = useState(false);
  const [groupDeleteError, setGroupDeleteError] = useState("");
  const [groupMergeOperations, setGroupMergeOperations] = useState([]);
  const [adminGroupFiltersOpen, setAdminGroupFiltersOpen] = useState(false);
  const [adminFinanceFiltersOpen, setAdminFinanceFiltersOpen] = useState(false);
  const [themeMode, setThemeMode] = useStickyState("dark", "ds_themeMode");
  const [attendanceScale, setAttendanceScale] = useStickyState(100, "ds_attendance_scale_v1");
  const [scheduleScale, setScheduleScale] = useStickyState(100, "ds_schedule_scale_v1");
  const [themeRenderTick, setThemeRenderTick] = useState(0);
  const safeThemeMode = themeMode === "light" || themeMode === "dark" ? themeMode : "dark";
  const safeAttendanceScale = Math.min(130, Math.max(60, Number(attendanceScale) || 100));
  const safeScheduleScale = Math.min(130, Math.max(60, Number(scheduleScale) || 100));
  const changeAttendanceScale = (delta) => setAttendanceScale((prev) => Math.min(130, Math.max(60, (Number(prev) || 100) + delta)));
  const changeScheduleScale = (delta) => setScheduleScale((prev) => Math.min(130, Math.max(60, (Number(prev) || 100) + delta)));
  const resetAttendanceScale = () => setAttendanceScale(100);
  const resetScheduleScale = () => setScheduleScale(100);
  const attendanceScaleBtnStyle = { ...btnS, minHeight: 28, height: 28, minWidth: 32, padding: "0 8px", fontSize: 12, borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center" };
  const scheduleScaleBtnStyle = attendanceScaleBtnStyle;
  const [directionDraft, setDirectionDraft] = useState({ id: "", name: "", color: "#7b8ea8" });
  const [directionEdits, setDirectionEdits] = useState({});

  const adminEmails = ADMIN_EMAILS;
  const isAdmin = user && isAdminEmail(user.email, adminEmails);

  useEffect(() => {
    if (!isAdmin) {
      setStudioRooms([]);
      return;
    }
    let active = true;
    const loadRooms = () => db.fetchStudioRooms().then((rooms) => {
      if (active) setStudioRooms(Array.isArray(rooms) ? rooms : []);
    });
    loadRooms();
    window.addEventListener("studio-rooms-changed", loadRooms);
    return () => {
      active = false;
      window.removeEventListener("studio-rooms-changed", loadRooms);
    };
  }, [isAdmin]);




  useEffect(() => {
    return subscribeToPwaUpdates(() => setUpdateAvailable(true));
  }, []);

  const handleApplyUpdate = () => {
    setUpdateInstalling(true);
    applyPwaUpdate();
  };

  const pushStatusLabel = useMemo(() => {
    switch (pushStatus) {
      case PUSH_STATUS.unsupported: return "Push не підтримується в цьому браузері";
      case PUSH_STATUS.installRequired: return "Для iPhone встановіть додаток на головний екран";
      case PUSH_STATUS.permissionDenied: return "Дозвіл на push заборонено";
      case PUSH_STATUS.permissionGranted: return "Дозвіл надано, підписка ще не збережена";
      case PUSH_STATUS.subscribed: return "Підписку збережено";
      case PUSH_STATUS.missingVapidKey: return "Не налаштовано VAPID public key";
      default: return "Push ще не увімкнено";
    }
  }, [pushStatus]);

  useEffect(() => {
    let mounted = true;
    if (!user) {
      setPushStatus(PUSH_STATUS.permissionDefault);
      setPushInfo("");
      return;
    }
    getPushStatus()
      .then((status) => {
        if (mounted) setPushStatus(status);
      })
      .catch(() => {
        if (mounted) setPushStatus(PUSH_STATUS.error);
      });
    return () => {
      mounted = false;
    };
  }, [user]);

  useEffect(() => {
    const onDocClick = () => setMoreMenuOpen(false);
    if (moreMenuOpen) document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [moreMenuOpen]);



  const handleSendTestPush = async () => {
    if (!user || pushStatus !== PUSH_STATUS.subscribed || testPushBusy) return;
    setTestPushBusy(true);
    setTestPushInfo("надсилається");

    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data?.session?.access_token || "";
      const result = await sendTestPushRequest(accessToken);

      if (!result.ok) {
        setTestPushInfo(`помилка: ${result.error || "невідома помилка"}`);
        return;
      }

      if (result.status === "no_active_subscriptions") {
        setTestPushInfo("немає активних підписок");
        return;
      }

      setTestPushInfo("надіслано");
    } catch (error) {
      setTestPushInfo(`помилка: ${String(error?.message || error)}`);
    } finally {
      setTestPushBusy(false);
    }
  };

  const handleEnablePush = async () => {
    if (!user || pushBusy) return;
    setPushBusy(true);
    setPushInfo("");
    try {
      const vapidPublicKey = import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY || "";
      const result = await requestPushSubscription({ vapidPublicKey });
      setPushStatus(result.status || PUSH_STATUS.error);
      if (!result.ok) {
        setPushInfo(result.error || "Не вдалося увімкнути push");
        return;
      }

      const payload = extractPushSubscriptionPayload(result.subscription);
      await db.upsertPushSubscription(user.id, payload);
      setPushStatus(PUSH_STATUS.subscribed);
      setPushInfo("Push підписку збережено");
    } catch (error) {
      setPushStatus(PUSH_STATUS.error);
      setPushInfo(String(error?.message || error));
    } finally {
      setPushBusy(false);
    }
  };

  useEffect(() => {
    if (user && !isAdmin && !["attendance", "schedule"].includes(tab)) {
      setTab("attendance");
    }
  }, [isAdmin, setTab, tab, user]);

  useLayoutEffect(() => {
    const dark = {
      primary: "#5A81FA",
      secondary: "#2C3D8F",
      bg: "#0F131A",
      card: "#171D27",
      input: "#1E2633",
      textMain: "#E7EEFC",
      textMuted: "#9FB0CA",
      textLight: "#8093B1",
      border: "#2B3546",
      success: "#25B87A",
      warning: "#F59F3A",
      danger: "#EA5455",
      exhausted: "#A8B1CE",
      archive: "#1A2230",
      text: "#E7EEFC",
      textSoft: "#8093B1",
      panel: "#171D27",
      panelSoft: "#1E2633",
      good: "#25B87A",
      warn: "#F59F3A",
      bad: "#EA5455",
    };
    const light = {
      primary: "#4A6FE3",
      secondary: "#2C3D8F",
      bg: "#F8F9FD",
      card: "#FFFFFF",
      input: "#F2F5FF",
      textMain: "#1F1F1F",
      textMuted: "#6A6E83",
      textLight: "#A8B1CE",
      border: "#C7D2E8",
      success: "#34C759",
      warning: "#FF9500",
      danger: "#FF453A",
      exhausted: "#A8B1CE",
      archive: "#E2E8F0",
      text: "#1F1F1F",
      textSoft: "#A8B1CE",
      panel: "#FFFFFF",
      panelSoft: "#F2F5FF",
      good: "#34C759",
      warn: "#FF9500",
      bad: "#FF453A",
    };
    const next = safeThemeMode === "light" ? light : dark;
    Object.assign(theme, next);
    applyThemeBindings();
    setThemeRenderTick((v) => v + 1);
  }, [safeThemeMode]);

  useEffect(() => {
    let mounted = true;

    const initSession = async () => {
      setLoading(true);
      setAccessChecking(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      const currentUser = session?.user || null;
      if (!currentUser) {
        setUser(null);
        setAccessAllowed(false);
        setAccessChecking(false);
        setLoading(false);
        return;
      }
      await acceptAuthenticatedUser(currentUser, "getSession", () => mounted);
    };

    initSession().catch((error) => {
      console.warn("[access guard] initial session failed", String(error?.message || error));
      if (mounted) {
        setUser(null);
        setAccessAllowed(false);
        setAccessChecking(false);
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.info("[access guard] auth event", { event, email: session?.user?.email || null });
      if (!mounted) return;
      if (event === "SIGNED_OUT") {
        setUser(null);
        setAccessAllowed(false);
        setAccessChecking(false);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (user && !isAdmin && !["attendance", "schedule"].includes(tab)) {
      setTab("attendance");
    }
  }, [user, isAdmin, tab, setTab]);


  const clearLoadedData = () => {
    setStudents([]);
    setSubs([]);
    setAttn([]);
    setGroups(DEFAULT_GROUPS);
    setScheduleGroups(DEFAULT_GROUPS);
    setCancelled([]);
    setScheduleCancelled([]);
    setStudentGrps([]);
    setWaitlist([]);
    setTrialBookings([]);
    setTrainers([]);
    setTrainerGroups([]);
    setRoomBookings([]);
    setGroupLessonOverrides([]);
    setTrainingLessonPlans([]);
    setTrainingLessonReports([]);
    setGroupMergeOperations([]);
  };

  const resetAuthState = () => {
    setUser(null);
    setAccessAllowed(false);
    setAccessChecking(false);
    setLoading(false);
    clearLoadedData();
  };

  const denyAccess = async (message = "Доступ до CRM закрито. Зверніться до адміністратора.") => {
    console.info("[access guard] deny", { message });
    setAuthBlockMessage(message);
    resetAuthState();
    await supabase.auth.signOut();
  };

  const validateTrainerSession = async (currentUser, source = "unknown") => {
    if (!currentUser) return { allowed: false, message: "Доступ до CRM не знайдено. Зверніться до адміністратора.", reason: "missing_user" };
    const adminResult = isAdminEmail(currentUser.email, adminEmails);
    console.info("[access guard] checking", { source, email: currentUser.email || null, isAdmin: adminResult });
    if (adminResult) return { allowed: true, isAdmin: true, reason: "admin" };

    try {
      const trainerProfile = await db.fetchMyTrainerProfile();
      console.info("[access guard] trainer profile", {
        source,
        email: currentUser.email || null,
        access_disabled_at: trainerProfile?.accessDisabledAt || null,
        archived_at: trainerProfile?.archivedAt || null,
        is_active: trainerProfile?.isActive,
        has_profile: !!trainerProfile,
      });
      if (!trainerProfile) return { allowed: false, message: "Доступ до CRM не знайдено. Зверніться до адміністратора.", reason: "missing_profile" };
      if (!trainerProfile.hasAccessGuardFields) return { allowed: false, message: "Не вдалося перевірити доступ до CRM. Зверніться до адміністратора.", reason: "missing_guard_fields" };
      if (trainerProfile.accessDisabledAt) return { allowed: false, message: "Доступ до CRM закрито. Зверніться до адміністратора.", reason: "access_disabled" };
      if (trainerProfile.archivedAt) return { allowed: false, message: "Доступ до CRM закрито. Зверніться до адміністратора.", reason: "archived" };
      if (trainerProfile.isActive === false) return { allowed: false, message: "Доступ до CRM закрито. Зверніться до адміністратора.", reason: "inactive" };
      return { allowed: true, isAdmin: false, trainerProfile, reason: "trainer_active" };
    } catch (error) {
      console.warn("[access guard] trainer profile check failed", String(error?.message || error));
      return { allowed: false, message: "Не вдалося перевірити доступ до CRM. Зверніться до адміністратора.", reason: "profile_check_failed" };
    }
  };

  const acceptAuthenticatedUser = async (currentUser, source = "unknown", isStillMounted = () => true) => {
    console.info("[access guard] start", { source, email: currentUser?.email || null });
    setAccessChecking(true);
    setLoading(true);
    try {
      const guard = await validateTrainerSession(currentUser, source);
      console.info("[access guard] decision", { source, email: currentUser?.email || null, allowed: !!guard.allowed, reason: guard.reason || null });
      if (!isStillMounted()) return false;
      if (!guard.allowed) {
        await denyAccess(guard.message || "Доступ до CRM закрито. Зверніться до адміністратора.");
        return false;
      }
      setAuthBlockMessage("");
      setAccessAllowed(true);
      setUser(currentUser);
      await loadAllData(currentUser);
      return true;
    } catch (error) {
      console.warn("[access guard] acceptAuthenticatedUser failed", String(error?.message || error));
      if (isStillMounted()) await denyAccess("Не вдалося перевірити доступ до CRM. Зверніться до адміністратора.");
      return false;
    } finally {
      if (isStillMounted()) {
        console.info("[access guard] finish", { source, email: currentUser?.email || null });
        setAccessChecking(false);
        setLoading(false);
      }
    }
  };

  const loadAllData = async (currentUser = user) => {
    console.info("[access guard] loadAllData", { email: currentUser?.email || null, isAdmin: currentUser ? isAdminEmail(currentUser.email, adminEmails) : false });
    setLoading(true);
    try {
      const safeFetch = async (fn, label = "unknown") => { try { return await fn(); } catch (e) { console.warn(`[loadAllData] ${label} failed`, e); return null; } };
      const isCurrentAdmin = currentUser && isAdminEmail(currentUser.email, adminEmails);
      
      const fetchCustomOrders = async () => {
        if (!isCurrentAdmin) return db.fetchMyCustomOrders();

        try {
          const { data, error } = await supabase
            .from("custom_orders")
            .select("group_id, student_ids");

          if (error) {
            console.error("Fetch orders error:", error);
            return {};
          }

          return (data || []).reduce((acc, row) => {
            acc[row.group_id] = Array.isArray(row.student_ids) ? row.student_ids : [];
            return acc;
          }, {});
        } catch (e) {
          console.error("Fetch orders exception:", e);
          return {};
        }
      };

      const fetchTrainerProfiles = isCurrentAdmin
        ? db.fetchTrainers
        : () => db.fetchMyTrainerProfile();
      const fetchScheduleBookings = isCurrentAdmin
        ? db.fetchRoomBookings
        : db.fetchScheduleRoomBookings;
      const fetchScheduleGroupRows = isCurrentAdmin
        ? () => null
        : db.fetchScheduleGroups;
      const fetchScheduleCancelled = db.fetchScheduleCancelled;
      const fetchAttendanceSubscriptions = isCurrentAdmin
        ? () => db.fetchSubs({ includeFinancial: true })
        : db.fetchMyAttendanceSubscriptions;
      const fetchAttendanceGroupRows = isCurrentAdmin
        ? () => null
        : db.fetchMyAttendanceGroups;
      const fetchAttendanceRosterRows = isCurrentAdmin
        ? () => null
        : db.fetchMyAttendanceRoster;
      const todayKey = toLocalISO(new Date());
      const overrideStartDate = addDaysForScheduleRange(todayKey, -90);
      const overrideEndDate = addDaysForScheduleRange(todayKey, 180);
      const [st, gr, scheduleGr, attendanceGr, attendanceRoster, su, at, ca, scheduleCa, sg, wl, tb, ord, warned, tr, trg, dirs, rb, glo, tlp, tlr, gmo] = await Promise.all([
        safeFetch(db.fetchStudents, "fetchStudents"), safeFetch(db.fetchGroups, "fetchGroups"), safeFetch(fetchScheduleGroupRows, "fetchScheduleGroupRows"), safeFetch(fetchAttendanceGroupRows, "fetchAttendanceGroupRows"), safeFetch(fetchAttendanceRosterRows, "fetchAttendanceRosterRows"), safeFetch(fetchAttendanceSubscriptions, "fetchAttendanceSubscriptions"),
        safeFetch(db.fetchAttendance, "fetchAttendance"), safeFetch(db.fetchCancelled, "fetchCancelled"), safeFetch(fetchScheduleCancelled, "fetchScheduleCancelled"), safeFetch(db.fetchStudentGroups, "fetchStudentGroups"),
        safeFetch(isCurrentAdmin ? db.fetchWaitlist : async () => [], "fetchWaitlist"), safeFetch(db.fetchTrialBookings, "fetchTrialBookings"),
        fetchCustomOrders(), safeFetch(db.fetchWarnedStudents, "fetchWarnedStudents"), safeFetch(fetchTrainerProfiles, "fetchTrainerProfiles"), safeFetch(db.fetchTrainerGroups, "fetchTrainerGroups"),
        safeFetch(db.fetchDirections, "fetchDirections"), safeFetch(fetchScheduleBookings, "fetchScheduleBookings"),
        safeFetch(() => db.fetchGroupLessonOverrides(overrideStartDate, overrideEndDate), "fetchGroupLessonOverrides"),
        safeFetch(() => db.fetchTrainingLessonPlans({ dateFrom: overrideStartDate, dateTo: overrideEndDate }), "fetchTrainingLessonPlans"),
        safeFetch(() => db.fetchTrainingLessonReports({ dateFrom: overrideStartDate, dateTo: overrideEndDate }), "fetchTrainingLessonReports"),
        safeFetch(isCurrentAdmin && db.fetchGroupMergeOperations ? db.fetchGroupMergeOperations : async () => [], "fetchGroupMergeOperations")
      ]);

      const baseGroups = gr?.length ? gr : DEFAULT_GROUPS;
      const scheduleGroupRows = scheduleGr || [];
      const attendanceGroupRows = attendanceGr || [];
      const allGroups = isCurrentAdmin
        ? baseGroups
        : Array.from(new Map([...baseGroups, ...scheduleGroupRows, ...attendanceGroupRows].map((group) => [String(group.id), group])).values());
      const allScheduleGroups = isCurrentAdmin
        ? allGroups
        : scheduleGroupRows;
      const currentTrainerId = String(tr?.id || "");
      const currentTrainerGroupRows = isCurrentAdmin
        ? (trg || [])
        : (trg || []).filter((row) => String(row.trainerId) === currentTrainerId);
      const trainerGroupIdsForAttendance = new Set(currentTrainerGroupRows.map((row) => String(row.groupId)));
      const allowedGroups = isCurrentAdmin
        ? allGroups
        : (attendanceGroupRows.length
          ? attendanceGroupRows
          : allGroups.filter((g) => trainerGroupIdsForAttendance.has(String(g.id))));
      const allowedGroupIds = new Set(allowedGroups.map((g) => String(g.id)));
      if (!isCurrentAdmin) {
        console.info("[trainer visibility] loaded groups", {
          trainerProfileId: currentTrainerId || null,
          scheduleGroupRows: scheduleGroupRows.length,
          attendanceGroupRows: attendanceGroupRows.length,
          trainerGroupRows: currentTrainerGroupRows.length,
          attendanceGroupIds: Array.from(allowedGroupIds),
          attendanceGroupNames: allowedGroups.map((group) => group.name || group.id),
        });
      }
      const scopedSubs = isCurrentAdmin ? (su || []) : (su || []).filter((s) => allowedGroupIds.has(String(s.groupId)));
      const scopedAttn = isCurrentAdmin ? (at || []) : (at || []).filter((a) => allowedGroupIds.has(String(a.groupId)));
      const rosterStudents = attendanceRoster?.students || [];
      const rosterStudentGroups = attendanceRoster?.studentGroups || [];
      const scopedStudentGrps = isCurrentAdmin
        ? (sg || [])
        : (rosterStudentGroups.length
          ? rosterStudentGroups.filter((row) => allowedGroupIds.has(String(row.groupId)))
          : (sg || []).filter((row) => allowedGroupIds.has(String(row.groupId))));
      const scopedCancelled = isCurrentAdmin ? (ca || []) : (ca || []).filter((c) => allowedGroupIds.has(String(c.groupId)));
      const allowedStudentIds = new Set([
        ...scopedStudentGrps.map((row) => String(row.studentId)),
        ...scopedSubs.map((sub) => String(sub.studentId)),
        ...scopedAttn.map((row) => String(row.studentId || "")).filter(Boolean),
      ]);
      const scopedStudents = isCurrentAdmin
        ? (st || [])
        : (rosterStudents.length
          ? rosterStudents.filter((student) => allowedStudentIds.has(String(student.id)))
          : (st || []).filter((student) => allowedStudentIds.has(String(student.id))));
      if (!isCurrentAdmin) {
        console.info("[trainer visibility] loaded roster", {
          attendanceGroupIds: Array.from(allowedGroupIds),
          directStudentGroupsBefore: (sg || []).length,
          rosterStudentGroups: rosterStudentGroups.length,
          studentGroupsAfter: scopedStudentGrps.length,
          directStudentsBefore: (st || []).length,
          rosterStudents: rosterStudents.length,
          studentsAfter: scopedStudents.length,
          subscriptionsAfter: scopedSubs.length,
          attendanceRowsAfter: scopedAttn.length,
        });
      }

      // Frontend/data-layer scoping only; Supabase RLS is still required for true server-side enforcement.
      setStudents(scopedStudents);
      setGroups(allowedGroups);
      setScheduleGroups(allScheduleGroups);
      setSubs(scopedSubs);
      setAttn(scopedAttn);
      setCancelled(scopedCancelled);
      setScheduleCancelled(scheduleCa || []);
      setStudentGrps(scopedStudentGrps);
      const directionByGroupId = Object.fromEntries((allowedGroups || []).map((group) => [String(group.id), group.directionId || null]));
      setWaitlist((wl || []).map((entry) => ({
        ...entry,
        directionId: entry.directionId || directionByGroupId[String(entry.groupId || "")] || null,
      })));
      setTrialBookings(tb || []);
      setCustomOrders(ord || {});
      setWarnedStudents(isCurrentAdmin ? (warned || {}) : {});
      setTrainers(isCurrentAdmin ? (tr || []) : (tr ? [tr] : []));
      setTrainerGroups(currentTrainerGroupRows);
      setDirections(dirs || []);
      setRoomBookings(rb || []);
      setGroupLessonOverrides(glo || []);
      setTrainingLessonPlans(tlp || []);
      setTrainingLessonReports(tlr || []);
      setGroupMergeOperations(isCurrentAdmin ? (gmo || []) : []);
    } catch (e) {
      console.error("Global load error", e);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      setAuthBlockMessage("");
      const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPass });
      if (error) throw error;
      const currentUser = data?.user || null;
      await acceptAuthenticatedUser(currentUser, "signInWithPassword");
    } catch (e) {
      setAuthBlockMessage("");
      alert("Помилка входу: перевірте email та пароль");
    }
  };

  const createGroupAction = async () => {
    const name = String(newGroupDraft.name || "").trim();
    if (!name) { alert("Вкажіть назву групи."); return; }
    const directionId = newGroupDraft.directionMode === "new"
      ? normalizeDirectionId(newGroupDraft.newDirectionName)
      : String(newGroupDraft.directionId || "").trim();
    if (!directionId) { alert("Вкажіть напрямок."); return; }
    const draftId = String(newGroupDraft.id || "").trim() || normalizeDirectionId(name);
    if (!draftId) { alert("Не вдалося сформувати id групи."); return; }
    const duplicateName = groups.some((g) => String(g.name || "").trim().toLowerCase() === name.toLowerCase());
    if (duplicateName) { alert("Група з такою назвою вже існує."); return; }
    const duplicateId = groups.some((g) => String(g.id) === draftId);
    if (duplicateId) { alert("Група з таким id вже існує. Змініть назву або id."); return; }
    if (newGroupDraft.directionMode === "new") {
      const existingDir = directionsList.find((d) => d.id === directionId);
      if (existingDir && existingDir.name.toLowerCase() !== String(newGroupDraft.newDirectionName || "").trim().toLowerCase()) {
        alert("Конфлікт напрямку: такий direction id вже існує з іншою назвою.");
        return;
      }
    }
    if (newGroupDraft.showOnPublicSite && !newGroupDraft.publicLevel) {
      alert("Оберіть рівень на сайті для публічної групи.");
      return;
    }
    if (newGroupDraft.showOnPublicSite && !newGroupDraft.ageCategory) {
      alert("Оберіть вікову категорію для публічної групи.");
      return;
    }
    const selectedTrainerId = String(newGroupDraft.trainerId || "").trim();
    const validTrainerId = selectedTrainerId && trainers.some((t) => String(t.id) === selectedTrainerId)
      ? selectedTrainerId
      : null;
    const trainerPctNum = Math.max(0, Math.min(100, parseInt(String(newGroupDraft.trainerPct || "").trim(), 10) || 0));
    const payload = {
      id: draftId,
      name,
      directionId,
      schedule: Array.isArray(newGroupDraft.schedule) ? newGroupDraft.schedule : [],
      startDate: newGroupDraft.startDate || null,
      trainerPct: trainerPctNum,
      showOnPublicSite: !!newGroupDraft.showOnPublicSite,
      publicLevel: newGroupDraft.publicLevel || null,
      publicJoinStatus: newGroupDraft.publicJoinStatus || "open",
      ageCategory: newGroupDraft.ageCategory || null,
    };
    try {
      const created = await db.insertGroup(payload);
      setGroups((prev) => [created, ...prev]);
      setScheduleGroups((prev) => (prev.some((g) => String(g.id) === String(created.id)) ? prev.map((g) => String(g.id) === String(created.id) ? { ...g, ...created } : g) : [created, ...prev]));
      if (validTrainerId && db.upsertTrainerGroup) {
        const binding = await db.upsertTrainerGroup(validTrainerId, created.id);
        setTrainerGroups((prev) => (
          prev.some((x) => String(x.trainerId) === String(binding.trainerId) && String(x.groupId) === String(binding.groupId))
            ? prev
            : [...prev, binding]
        ));
      }
      setNewGroupDraft({
        id: "",
        name: "",
        directionMode: "existing",
        directionId,
        newDirectionName: "",
        schedule: [],
        startDate: "",
        trainerPct: "0",
        trainerId: "",
        showOnPublicSite: false,
        publicLevel: "",
        publicJoinStatus: "open",
        ageCategory: "",
      });
      setModal(null);
    } catch (e) {
      const msg = e?.message || "Не вдалося створити групу.";
      alert(msg.includes("duplicate") ? "Конфлікт id/назви: група вже існує." : msg);
    }
  };

  const openEditGroup = (group) => {
    setGroupEditDraft({
      id: group.id,
      name: group.name || "",
      directionId: group.directionId || directionsList[0]?.id || "",
      schedule: parseGroupSchedule(group.schedule),
      startDate: group.startDate || group.start_date || "",
      trainerPct: String(group.trainerPct ?? 0),
      trainerId: getGroupPrimaryTrainerId(group.id),
      showOnPublicSite: !!group.showOnPublicSite,
      publicLevel: group.publicLevel || "",
      publicJoinStatus: group.publicJoinStatus || "open",
      ageCategory: group.ageCategory || "",
    });
  };

  const saveGroupEdit = async () => {
    if (!groupEditDraft?.id) return;
    if (groupEditDraft.showOnPublicSite && !groupEditDraft.publicLevel) {
      alert("Оберіть рівень на сайті для публічної групи.");
      return;
    }
    if (groupEditDraft.showOnPublicSite && !groupEditDraft.ageCategory) {
      alert("Оберіть вікову категорію для публічної групи.");
      return;
    }
    const trainerPctNum = Math.max(0, Math.min(100, parseInt(String(groupEditDraft.trainerPct || "").trim(), 10) || 0));
    const payload = {
      name: String(groupEditDraft.name || "").trim(),
      directionId: groupEditDraft.directionId,
      schedule: Array.isArray(groupEditDraft.schedule) ? groupEditDraft.schedule : [],
      startDate: groupEditDraft.startDate || null,
      trainerPct: trainerPctNum,
      showOnPublicSite: !!groupEditDraft.showOnPublicSite,
      publicLevel: groupEditDraft.publicLevel || null,
      publicJoinStatus: groupEditDraft.publicJoinStatus || "open",
      ageCategory: groupEditDraft.ageCategory || null,
    };
    try {
      const updated = await db.updateGroup(groupEditDraft.id, payload);
      setGroups((prev) => prev.map((g) => (String(g.id) === String(updated.id) ? updated : g)));
      setScheduleGroups((prev) => prev.map((g) => (String(g.id) === String(updated.id) ? { ...g, ...updated } : g)));

      const targetTrainerId = String(groupEditDraft.trainerId || "").trim();
      const groupRows = trainerGroups.filter((tg) => String(tg.groupId) === String(groupEditDraft.id));
      if (targetTrainerId) {
        for (const row of groupRows) {
          if (String(row.trainerId) !== targetTrainerId && db.deleteTrainerGroup) {
            await db.deleteTrainerGroup(row.trainerId, row.groupId);
          }
        }
        const binding = await db.upsertTrainerGroup(targetTrainerId, groupEditDraft.id);
        setTrainerGroups((prev) => {
          const filtered = prev.filter((x) => !(String(x.groupId) === String(groupEditDraft.id) && String(x.trainerId) !== targetTrainerId));
          if (filtered.some((x) => String(x.trainerId) === String(binding.trainerId) && String(x.groupId) === String(binding.groupId))) return filtered;
          return [...filtered, binding];
        });
      } else {
        for (const row of groupRows) {
          if (db.deleteTrainerGroup) await db.deleteTrainerGroup(row.trainerId, row.groupId);
        }
        setTrainerGroups((prev) => prev.filter((x) => String(x.groupId) !== String(groupEditDraft.id)));
      }

      setGroupEditDraft(null);
    } catch (e) {
      alert(e?.message || "Не вдалося зберегти групу");
    }
  };

  const buildGroupArchivePatch = (mode, shouldArchive) => {
    if (mode === "is_active") return { is_active: !shouldArchive };
    if (mode === "active") return { active: !shouldArchive };
    if (mode === "archived_at") return { archived_at: shouldArchive ? today() : null };
    return null;
  };

  const toggleGroupArchive = async (group) => {
    const meta = archiveMetaByGroupId[String(group.id)];
    if (!meta?.mode) {
      alert("Для архівації груп потрібне поле is_active, active або archived_at у таблиці groups.");
      return;
    }

    const shouldArchive = !meta.isArchived;
    if (shouldArchive) {
      const confirmed = window.confirm("Архівувати групу? Історія та абонементи залишаться, група зникне з активного списку.");
      if (!confirmed) return;
    }

    const patch = buildGroupArchivePatch(meta.mode, shouldArchive);
    if (!patch) return;

    try {
      const updated = await db.updateGroup(group.id, patch);
      setGroups((prev) => prev.map((g) => (String(g.id) === String(updated.id) ? updated : g)));
      setScheduleGroups((prev) => prev.map((g) => (String(g.id) === String(updated.id) ? { ...g, ...updated } : g)));
    } catch (e) {
      alert(e?.message || (shouldArchive ? "Не вдалося архівувати групу" : "Не вдалося відновити групу"));
    }
  };

  const openPermanentGroupDelete = (group) => {
    if (!group?.archived_at) return;
    setGroupDeleteDraft(group);
    setGroupDeleteConfirmation("");
    setGroupDeleteError("");
  };

  const closePermanentGroupDelete = () => {
    if (groupDeleteBusy) return;
    setGroupDeleteDraft(null);
    setGroupDeleteConfirmation("");
    setGroupDeleteError("");
  };

  const permanentlyDeleteGroup = async () => {
    if (!groupDeleteDraft?.archived_at || groupDeleteBusy) return;
    if (groupDeleteConfirmation !== groupDeleteDraft.name) return;
    setGroupDeleteBusy(true);
    setGroupDeleteError("");
    try {
      const deletedId = await db.deleteArchivedGroup(groupDeleteDraft.id);
      const keepOtherGroups = (row) => String(row.id) !== String(deletedId);
      const keepOtherGroupLinks = (row) => String(row.groupId ?? row.group_id) !== String(deletedId);
      setGroups((prev) => prev.filter(keepOtherGroups));
      setScheduleGroups((prev) => prev.filter(keepOtherGroups));
      setTrainerGroups((prev) => prev.filter(keepOtherGroupLinks));
      setCancelled((prev) => prev.filter(keepOtherGroupLinks));
      setScheduleCancelled((prev) => prev.filter(keepOtherGroupLinks));
      setGroupLessonOverrides((prev) => prev.filter(keepOtherGroupLinks));
      setGroupDeleteDraft(null);
      setGroupDeleteConfirmation("");
    } catch (e) {
      setGroupDeleteError(e?.message || "Не вдалося видалити групу назавжди.");
    } finally {
      setGroupDeleteBusy(false);
    }
  };


  const activeGroups = useMemo(() => groups.filter((g) => !isGroupArchived(g)), [groups]);
  const activeScheduleGroups = useMemo(() => (
    scheduleGroups.filter((g) => !isGroupArchived(g))
  ), [scheduleGroups]);

  const visibleGroups = useMemo(() => {
    if (!user) return [];
    // For trainer users, groups state is already scoped to Attendance access via
    // crm_fetch_my_attendance_groups()/trainer_groups in loadAllData. Do not
    // re-filter by groups.trainer_id here, because substitutions can bind one
    // group to multiple trainers through trainer_groups.
    return activeGroups;
  }, [activeGroups, user]);

  const studentMap = useMemo(()=>Object.fromEntries(students.map(s=>[s.id,s])),[students]);
  const groupMap = useMemo(()=>Object.fromEntries(groups.map(g=>[g.id,g])),[groups]);
  const directionsList = useMemo(() => {
    const base = (directions?.length ? directions : [...DIRECTIONS]).map((d) => ({
      id: d.id,
      name: d.name || d.id,
      color: d.color || "#7b8ea8",
      isActive: d.isActive !== false,
    }));
    const existingIds = new Set(base.map((d) => d.id));
    groups.forEach((g) => {
      if (!g?.directionId || existingIds.has(g.directionId)) return;
      base.push({
        id: g.directionId,
        name: String(g.directionId).replace(/_/g, " "),
        color: "#7b8ea8",
      });
      existingIds.add(g.directionId);
    });
    return base;
  }, [directions, groups]);
  const persistedDirectionIds = useMemo(() => new Set((directions || []).map((d) => String(d.id))), [directions]);
  const dirMap = useMemo(()=>Object.fromEntries(directionsList.map(d=>[d.id,d])),[directionsList]);
  const groupsCountByDirection = useMemo(() => {
    const next = {};
    groups.forEach((g) => {
      const id = String(g.directionId || "");
      if (!id) return;
      next[id] = (next[id] || 0) + 1;
    });
    return next;
  }, [groups]);
  const upsertDirectionEdit = (id, patch) => setDirectionEdits((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }));

  const createDirectionAction = async () => {
    const name = String(directionDraft.name || "").trim();
    if (!name) { alert("Вкажіть назву напрямку."); return; }
    const id = normalizeDirectionId(directionDraft.id || name);
    if (!id) { alert("Не вдалося сформувати ID напрямку."); return; }
    if (directionsList.some((d) => String(d.id) === id)) { alert("Напрямок з таким ID вже існує."); return; }
    try {
      const inserted = await db.insertDirection({ id, name, color: directionDraft.color || "#7b8ea8", isActive: true });
      setDirections((prev) => [...prev, inserted]);
      setDirectionDraft({ id: "", name: "", color: "#7b8ea8" });
    } catch (e) {
      alert(e?.message || "Не вдалося створити напрямок.");
    }
  };

  const saveDirectionEdit = async (directionId) => {
    if (!persistedDirectionIds.has(String(directionId))) return;
    const base = directionsList.find((d) => String(d.id) === String(directionId));
    const edit = directionEdits[directionId] || {};
    if (!base) return;
    const nextId = normalizeDirectionId(edit.id ?? base.id);
    const nextName = String(edit.name ?? base.name ?? "").trim();
    if (!nextId || !nextName) { alert("ID та назва напрямку обов'язкові."); return; }
    if (nextId !== base.id && directionsList.some((d) => String(d.id) === nextId)) { alert("Конфлікт ID напрямку."); return; }
    try {
      const updated = await db.updateDirection(base.id, {
        id: nextId,
        name: nextName,
        color: edit.color ?? base.color ?? "#7b8ea8",
      });
      setDirections((prev) => prev.map((d) => (String(d.id) === String(base.id) ? updated : d)));
      setDirectionEdits((prev) => {
        const next = { ...prev };
        delete next[directionId];
        return next;
      });
    } catch (e) {
      alert(e?.message || "Не вдалося зберегти напрямок.");
    }
  };

  const toggleDirectionActive = async (direction) => {
    if (!persistedDirectionIds.has(String(direction.id))) return;
    try {
      const updated = await db.updateDirection(direction.id, { isActive: !(direction.isActive !== false) });
      setDirections((prev) => prev.map((d) => (String(d.id) === String(direction.id) ? updated : d)));
    } catch (e) {
      alert(e?.message || "Не вдалося оновити статус напрямку.");
    }
  };

  const deleteDirectionAction = async (direction) => {
    const id = String(direction.id);
    if (!persistedDirectionIds.has(id)) return;
    const linkedGroups = groupsCountByDirection[id] || 0;
    if (linkedGroups > 0) { alert(`Неможливо видалити: є ${linkedGroups} груп(и), прив'язаних до цього напрямку.`); return; }
    if (!window.confirm(`Видалити напрямок "${direction.name}"?`)) return;
    try {
      await db.deleteDirection(id);
      setDirections((prev) => prev.filter((d) => String(d.id) !== id));
    } catch (e) {
      alert(e?.message || "Не вдалося видалити напрямок.");
    }
  };
  const parseGroupSchedule = (schedule) => {
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
  const resolveTrainerForGroup = (group) => resolveGroupTrainer({ group, trainerGroups, trainers });
  const getGroupPrimaryTrainerId = (groupId) => {
    const group = groups.find((g) => String(g.id) === String(groupId)) || scheduleGroups.find((g) => String(g.id) === String(groupId)) || { id: groupId };
    return resolveTrainerForGroup(group).trainerId;
  };
  const formatGroupSchedule = formatGroupScheduleLabel;
  const getGroupLabel = (group) => group ? `${group.name || group.id} (${group.id})` : "—";
  const getGroupMergeScheduleModeLabel = (mode) => {
    if (mode === "keep_target_schedule") return "Залишити графік цільової групи";
    if (mode === "custom_schedule") return "Використати вручну заданий графік";
    return "Взяти графік групи, яку приєднуємо";
  };

  const archiveMetaByGroupId = useMemo(() => {
    const result = {};
    groups.forEach((g) => {
      result[String(g.id)] = getGroupArchiveMeta(g);
    });
    return result;
  }, [groups]);


  const adminGroupRows = useMemo(() => groups.map((group) => {
    const archiveMeta = archiveMetaByGroupId[String(group.id)] || { mode: null, isArchived: false };
    const trainerInfo = resolveGroupTrainer({ group, trainerGroups, trainers });
    return { group, archiveMeta, trainerInfo };
  }), [groups, archiveMetaByGroupId, trainerGroups, trainers]);

  const filteredAdminGroupRows = useMemo(() => {
    const q = String(adminGroupSearch || "").trim().toLowerCase();
    return adminGroupRows.filter(({ group, archiveMeta, trainerInfo }) => {
      if (adminGroupArchiveFilter === "active" && archiveMeta.isArchived) return false;
      if (adminGroupArchiveFilter === "archived" && !archiveMeta.isArchived) return false;
      if (adminGroupTrainerFilter !== "all" && String(trainerInfo.trainerId || "") !== String(adminGroupTrainerFilter)) return false;
      if (!q) return true;
      const dir = dirMap[group.directionId];
      return [group.name, group.id, group.directionId, dir?.name, trainerInfo.trainerName, getGroupLevelLabel(group.publicLevel), formatGroupSchedule(group.schedule)]
        .some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [adminGroupRows, adminGroupArchiveFilter, adminGroupTrainerFilter, adminGroupSearch, dirMap]);

  const getGroupFirstScheduleTime = (group) => {
    const slots = parseGroupSchedule(group?.schedule)
      .map((slot) => String(slot?.time || "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "uk"));
    return slots[0] || "";
  };

  const groupedAdminGroupSections = useMemo(() => {
    const sections = new Map();
    filteredAdminGroupRows.forEach((row) => {
      const directionId = String(row.group?.directionId || "").trim();
      const dir = directionId ? dirMap[directionId] : null;
      const key = directionId || "__no_direction__";
      if (!sections.has(key)) {
        sections.set(key, {
          key,
          directionId,
          directionName: dir?.name || directionId || "Без напрямку",
          color: dir?.color || "#7b8ea8",
          rows: [],
        });
      }
      sections.get(key).rows.push(row);
    });

    return Array.from(sections.values())
      .map((section) => ({
        ...section,
        rows: section.rows.slice().sort((a, b) => {
          const nameCompare = String(a.group?.name || "").localeCompare(String(b.group?.name || ""), "uk", { sensitivity: "base" });
          if (nameCompare !== 0) return nameCompare;
          return getGroupFirstScheduleTime(a.group).localeCompare(getGroupFirstScheduleTime(b.group), "uk");
        }),
      }))
      .sort((a, b) => {
        if (!a.directionId && b.directionId) return 1;
        if (a.directionId && !b.directionId) return -1;
        return a.directionName.localeCompare(b.directionName, "uk", { sensitivity: "base" });
      });
  }, [filteredAdminGroupRows, dirMap]);

 const subsExt = useMemo(()=>{
    const oneOffPlanTypes = new Set(["trial", "single"]);
    const usedMap = {};
    attn.forEach(a => {
      const subId = a.subId ?? a.sub_id ?? a.subscriptionId ?? a.subscription_id;
      if (subId) usedMap[subId] = (usedMap[subId] || 0) + (a.quantity || 1);
    });
    return subs.map(s => {
      const planType = String(s.planType || "").trim().toLowerCase();
      const usedTrainings = oneOffPlanTypes.has(planType)
        ? Number(s.usedTrainings || 0)
        : (usedMap[s.id] || 0);
      const extSub = { ...s, usedTrainings };
      extSub.status = getSubStatus(extSub);
      return extSub;
    });
  },[subs, attn]);


  const openGroupMerge = (sourceGroup) => {
    const sourceMeta = archiveMetaByGroupId[String(sourceGroup.id)] || getGroupArchiveMeta(sourceGroup);
    if (sourceMeta.isArchived) return;
    const firstTarget = activeGroups.find((group) => String(group.id) !== String(sourceGroup.id));
    const sourceStudentIds = Array.from(new Set(
      studentGrps
        .filter((link) => String(link.groupId) === String(sourceGroup.id))
        .map((link) => String(link.studentId))
        .filter(Boolean)
    ));
    setGroupMergeDraft({
      sourceGroupId: sourceGroup.id,
      targetGroupId: firstTarget?.id || "",
      scheduleMode: "use_source_schedule",
      customSchedule: parseGroupSchedule(sourceGroup.schedule),
      selectedStudentIds: sourceStudentIds,
      studentSearch: "",
    });
  };

  const groupMergeSummary = useMemo(() => {
    if (!groupMergeDraft?.sourceGroupId) return null;
    const sourceGroup = groups.find((group) => String(group.id) === String(groupMergeDraft.sourceGroupId));
    const targetGroup = groups.find((group) => String(group.id) === String(groupMergeDraft.targetGroupId));
    const sourceStudentIds = Array.from(new Set(
      studentGrps
        .filter((link) => String(link.groupId) === String(groupMergeDraft.sourceGroupId))
        .map((link) => String(link.studentId))
        .filter(Boolean)
    ));
    const selectedSet = new Set(
      (Array.isArray(groupMergeDraft.selectedStudentIds) ? groupMergeDraft.selectedStudentIds : sourceStudentIds)
        .map((id) => String(id))
    );
    const selectedStudentIds = sourceStudentIds.filter((studentId) => selectedSet.has(String(studentId)));
    const targetStudentIds = new Set(
      studentGrps
        .filter((link) => String(link.groupId) === String(groupMergeDraft.targetGroupId))
        .map((link) => String(link.studentId))
        .filter(Boolean)
    );
    const newLinkStudentIds = selectedStudentIds.filter((studentId) => !targetStudentIds.has(studentId));
    const movableSubs = subsExt.filter((sub) => {
      if (String(sub.groupId) !== String(groupMergeDraft.sourceGroupId)) return false;
      if (!selectedSet.has(String(sub.studentId))) return false;
      const total = Number(sub.totalTrainings || 0);
      const used = Number(sub.usedTrainings || 0);
      return sub.status !== "expired" && (!total || used < total);
    });
    return {
      sourceGroup,
      targetGroup,
      sourceStudentsCount: sourceStudentIds.length,
      selectedStudentsCount: selectedStudentIds.length,
      newLinksCount: newLinkStudentIds.length,
      movableSubsCount: movableSubs.length,
      sourceStudentIds,
      selectedStudentIds,
      newLinkStudentIds,
      shouldArchiveSource: selectedStudentIds.length === sourceStudentIds.length,
      movableSubs,
    };
  }, [groupMergeDraft, groups, studentGrps, subsExt]);

  const executeGroupMerge = async () => {
    if (!groupMergeDraft || !groupMergeSummary?.sourceGroup || !groupMergeSummary?.targetGroup) return;
    const sourceId = groupMergeDraft.sourceGroupId;
    const targetId = groupMergeDraft.targetGroupId;
    if (!targetId || String(sourceId) === String(targetId)) {
      alert("Оберіть іншу активну цільову групу.");
      return;
    }
    const sourceMeta = archiveMetaByGroupId[String(sourceId)] || getGroupArchiveMeta(groupMergeSummary.sourceGroup);
    if (sourceMeta.isArchived) {
      alert("Архівні групи не можна обʼєднувати як джерело.");
      return;
    }
    if (groupMergeSummary.shouldArchiveSource && !sourceMeta.mode) {
      alert("Для архівації старої групи потрібне поле is_active, active або archived_at у таблиці groups.");
      return;
    }
    if (!db.addStudentGroup || !db.removeStudentGroup || !db.updateSub || !db.updateGroup || !db.insertGroupMergeOperation || !db.updateGroupMergeOperationStatus) {
      alert("Не вистачає db helper-ів: потрібні addStudentGroup, removeStudentGroup, updateSub, updateGroup, insertGroupMergeOperation, updateGroupMergeOperationStatus.");
      return;
    }

    if (!groupMergeSummary.selectedStudentsCount) {
      alert("Оберіть хоча б одну ученицю для переносу.");
      return;
    }
    const confirmed = window.confirm(`Обʼєднати ${getGroupLabel(groupMergeSummary.sourceGroup)} → ${getGroupLabel(groupMergeSummary.targetGroup)}? ${groupMergeSummary.shouldArchiveSource ? "Стара група буде архівована." : "Обрано не всіх учениць, стара група залишиться активною."}`);
    if (!confirmed) return;

    setGroupMergeBusy(true);
    let savedOperation = null;
    try {
      const previousTargetSchedule = parseGroupSchedule(groupMergeSummary.targetGroup.schedule);
      const scheduleMode = groupMergeDraft.scheduleMode || "use_source_schedule";
      const newTargetSchedule = scheduleMode === "use_source_schedule"
        ? parseGroupSchedule(groupMergeSummary.sourceGroup.schedule)
        : scheduleMode === "custom_schedule"
          ? parseGroupSchedule(groupMergeDraft.customSchedule)
          : previousTargetSchedule;
      const previousSubscriptionGroupIds = Object.fromEntries(
        groupMergeSummary.movableSubs.map((sub) => [String(sub.id), sub.groupId])
      );
      const operationDraft = {
        id: uid(),
        sourceGroupId: sourceId,
        targetGroupId: targetId,
        selectedStudentIds: groupMergeSummary.selectedStudentIds,
        newTargetLinksStudentIds: groupMergeSummary.newLinkStudentIds,
        removedSourceLinksStudentIds: groupMergeSummary.selectedStudentIds,
        movedSubscriptionIds: groupMergeSummary.movableSubs.map((sub) => sub.id),
        previousSubscriptionGroupIds,
        previousTargetSchedule,
        newTargetSchedule,
        previousSourceArchiveState: sourceMeta,
        sourceWasArchivedBefore: sourceMeta.isArchived,
        scheduleMode,
        executedBy: user?.id || user?.email || null,
        status: "pending",
      };
      savedOperation = await db.insertGroupMergeOperation(operationDraft);

      const createdLinks = [];
      for (const studentId of groupMergeSummary.newLinkStudentIds) {
        const link = await db.addStudentGroup(studentId, targetId);
        createdLinks.push(link);
      }

      for (const studentId of groupMergeSummary.selectedStudentIds) {
        await db.removeStudentGroup(studentId, sourceId);
      }

      const updatedSubs = [];
      for (const sub of groupMergeSummary.movableSubs) {
        const updatedSub = await db.updateSub(sub.id, { groupId: targetId });
        updatedSubs.push(updatedSub);
      }

      let updatedTargetGroup = null;
      if (scheduleMode !== "keep_target_schedule") {
        updatedTargetGroup = await db.updateGroup(targetId, { schedule: newTargetSchedule });
      }

      let archivedSourceGroup = null;
      if (groupMergeSummary.shouldArchiveSource) {
        const archivePatch = buildGroupArchivePatch(sourceMeta.mode, true);
        archivedSourceGroup = await db.updateGroup(sourceId, archivePatch);
      }
      const completedOperation = await db.updateGroupMergeOperationStatus(savedOperation.id, "completed");

      setGroupMergeOperations((prev) => [completedOperation, ...prev.filter((op) => String(op.id) !== String(completedOperation.id))]);
      setStudentGrps((prev) => {
        const removedIds = new Set(groupMergeSummary.selectedStudentIds.map((id) => String(id)));
        const withoutSource = prev.filter((link) => !(String(link.groupId) === String(sourceId) && removedIds.has(String(link.studentId))));
        const existing = new Set(withoutSource.map((link) => `${String(link.studentId)}:${String(link.groupId)}`));
        const additions = createdLinks.filter((link) => {
          const key = `${String(link.studentId)}:${String(link.groupId)}`;
          if (existing.has(key)) return false;
          existing.add(key);
          return true;
        });
        return [...withoutSource, ...additions];
      });
      setSubs((prev) => prev.map((sub) => {
        const updated = updatedSubs.find((item) => String(item.id) === String(sub.id));
        return updated ? { ...sub, ...updated } : sub;
      }));
      setGroups((prev) => prev.map((group) => {
        if (String(group.id) === String(targetId) && updatedTargetGroup) return { ...group, ...updatedTargetGroup };
        if (archivedSourceGroup && String(group.id) === String(sourceId)) return { ...group, ...archivedSourceGroup };
        return group;
      }));
      setScheduleGroups((prev) => prev.map((group) => {
        if (String(group.id) === String(targetId) && updatedTargetGroup) return { ...group, ...updatedTargetGroup };
        if (archivedSourceGroup && String(group.id) === String(sourceId)) return { ...group, ...archivedSourceGroup };
        return group;
      }));
      setGroupMergeDraft(null);
    } catch (e) {
      if (savedOperation?.id && db.updateGroupMergeOperationStatus) {
        try {
          const failedOperation = await db.updateGroupMergeOperationStatus(savedOperation.id, "failed", { errorMessage: e?.message || String(e) });
          setGroupMergeOperations((prev) => [failedOperation, ...prev.filter((op) => String(op.id) !== String(failedOperation.id))]);
        } catch (statusError) {
          console.warn("Failed to mark group merge operation as failed", statusError);
        }
      }
      alert(`${e?.message || "Не вдалося обʼєднати групи"}. Merge міг бути виконаний частково — потрібна ручна перевірка.`);
    } finally {
      setGroupMergeBusy(false);
    }
  };

  const undoGroupMerge = async (operation) => {
    if (!operation || operation.undoneAt || operation.status !== "completed") return;
    if (!db.addStudentGroup || !db.removeStudentGroup || !db.updateSub || !db.updateGroup || !db.markGroupMergeOperationUndone) {
      alert("Не вистачає db helper-ів для скасування merge.");
      return;
    }
    const confirmed = window.confirm(`Скасувати merge ${operation.sourceGroupId} → ${operation.targetGroupId}? Attendance і фінанси не змінюються.`);
    if (!confirmed) return;

    setGroupMergeBusy(true);
    try {
      const restoredSourceLinks = [];
      for (const studentId of operation.selectedStudentIds || []) {
        const link = await db.addStudentGroup(studentId, operation.sourceGroupId);
        restoredSourceLinks.push(link);
      }

      for (const studentId of operation.newTargetLinksStudentIds || []) {
        await db.removeStudentGroup(studentId, operation.targetGroupId);
      }

      const updatedSubs = [];
      for (const subId of operation.movedSubscriptionIds || []) {
        const previousGroupId = operation.previousSubscriptionGroupIds?.[String(subId)];
        if (previousGroupId === undefined || previousGroupId === null) continue;
        const updatedSub = await db.updateSub(subId, { groupId: previousGroupId });
        updatedSubs.push(updatedSub);
      }

      const updatedTargetGroup = await db.updateGroup(operation.targetGroupId, {
        schedule: Array.isArray(operation.previousTargetSchedule) ? operation.previousTargetSchedule : [],
      });

      const archiveMode = operation.previousSourceArchiveState?.mode;
      let updatedSourceGroup = null;
      if (archiveMode) {
        const restorePatch = buildGroupArchivePatch(archiveMode, !!operation.sourceWasArchivedBefore);
        if (restorePatch) updatedSourceGroup = await db.updateGroup(operation.sourceGroupId, restorePatch);
      }

      const updatedOperation = await db.markGroupMergeOperationUndone(operation.id, { undoneBy: user?.id || user?.email || null });

      setGroupMergeOperations((prev) => prev.map((op) => String(op.id) === String(updatedOperation.id) ? updatedOperation : op));
      setStudentGrps((prev) => {
        const targetRemovalIds = new Set((operation.newTargetLinksStudentIds || []).map((id) => String(id)));
        const withoutMergeTargetLinks = prev.filter((link) => !(String(link.groupId) === String(operation.targetGroupId) && targetRemovalIds.has(String(link.studentId))));
        const existing = new Set(withoutMergeTargetLinks.map((link) => `${String(link.studentId)}:${String(link.groupId)}`));
        const additions = restoredSourceLinks.filter((link) => {
          const key = `${String(link.studentId)}:${String(link.groupId)}`;
          if (existing.has(key)) return false;
          existing.add(key);
          return true;
        });
        return [...withoutMergeTargetLinks, ...additions];
      });
      setSubs((prev) => prev.map((sub) => {
        const updated = updatedSubs.find((item) => String(item.id) === String(sub.id));
        return updated ? { ...sub, ...updated } : sub;
      }));
      setGroups((prev) => prev.map((group) => {
        if (String(group.id) === String(operation.targetGroupId)) return { ...group, ...updatedTargetGroup };
        if (updatedSourceGroup && String(group.id) === String(operation.sourceGroupId)) return { ...group, ...updatedSourceGroup };
        return group;
      }));
      setScheduleGroups((prev) => prev.map((group) => {
        if (String(group.id) === String(operation.targetGroupId)) return { ...group, ...updatedTargetGroup };
        if (updatedSourceGroup && String(group.id) === String(operation.sourceGroupId)) return { ...group, ...updatedSourceGroup };
        return group;
      }));
    } catch (e) {
      alert(e?.message || "Не вдалося скасувати merge");
    } finally {
      setGroupMergeBusy(false);
    }
  };

  const ScheduleEditor = ({ value, onChange, disabled = false }) => {
    const rows = parseGroupSchedule(value);
    const activeRooms = studioRooms.filter((room) => room?.isActive !== false && room?.id && String(room?.name || "").trim());
    const getRoomName = (slot = {}) => String(
      slot.roomName ?? slot.room_name ?? slot.room ?? slot.location ?? slot.hall ?? "",
    ).trim();
    const getRoomId = (slot = {}) => {
      const storedId = String(slot.roomId ?? slot.room_id ?? "").trim();
      if (storedId && activeRooms.some((room) => String(room.id) === storedId)) return storedId;
      const legacyName = getRoomName(slot).toLocaleLowerCase("uk-UA");
      return legacyName
        ? String(activeRooms.find((room) => String(room.name).trim().toLocaleLowerCase("uk-UA") === legacyName)?.id || "")
        : "";
    };
    const updateRow = (index, patch) => {
      onChange(rows.map((slot, slotIndex) => (
        slotIndex === index ? { ...slot, ...patch } : slot
      )));
    };
    const updateRoom = (index, roomId) => {
      onChange(rows.map((slot, slotIndex) => {
        if (slotIndex !== index) return slot;
        const { room_id, room_name, room, location, hall, ...rest } = slot;
        const selectedRoom = activeRooms.find((candidate) => String(candidate.id) === String(roomId));
        return { ...rest, roomId: selectedRoom?.id || "", roomName: selectedRoom?.name || "" };
      }));
    };
    const removeRow = (index) => onChange(rows.filter((_, slotIndex) => slotIndex !== index));
    return (
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((slot, index) => (
          <div key={`${slot.day}-${slot.time}-${index}`} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8, alignItems: "center" }}>
            <select style={inputSt} value={Number(slot.day) || 0} onChange={(e) => updateRow(index, { day: Number(e.target.value) })} disabled={disabled}>
              {UI_WEEKDAY_ORDER.map((dayIdx) => <option key={dayIdx} value={dayIdx}>{WEEKDAYS[dayIdx]}</option>)}
            </select>
            <input style={inputSt} type="time" value={String(slot.time || "")} onChange={(e) => updateRow(index, { time: e.target.value })} disabled={disabled} />
            <select
              aria-label="Зал"
              style={inputSt}
              value={getRoomId(slot)}
              onChange={(e) => updateRoom(index, e.target.value)}
              disabled={disabled}
            >
              <option value="">Зал не вибрано</option>
              {activeRooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
            </select>
            <button type="button" style={{ ...btnS, color: theme.danger, width: "100%" }} onClick={() => removeRow(index)} disabled={disabled}>Видалити</button>
          </div>
        ))}
        {!rows.length && <div style={{ fontSize: 12, color: theme.textMuted }}>Графік порожній — групу можна створити без занять.</div>}
        <button type="button" style={btnS} onClick={() => onChange([...rows, { day: 1, time: "19:00", roomId: "", roomName: "" }])} disabled={disabled}>Додати заняття</button>
      </div>
    );
  };


  const activeSubs = useMemo(()=>subsExt.filter(s=>s.status!=="expired"),[subsExt]);

  const notifications = useMemo(()=>{
    const items=[];
    subsExt.filter(s => s.status !== "active").forEach(sub=>{
      const st=studentMap[sub.studentId], gr=groupMap[sub.groupId];
      if(!st || !gr) return; 
      if(sub.status==="expired" && subsExt.some(s=>s.studentId===sub.studentId && s.groupId===sub.groupId && s.status!=="expired")) return; 
      const dir=dirMap[gr.directionId];
      items.push({subId:sub.id, type:sub.status, student:st, group:gr, direction:dir, notified:sub.notificationSent,
        message:sub.status==="expired"?"Абонемент закінчився":(daysLeft(sub.endDate)<=3?`${daysLeft(sub.endDate)} дн.`:`${(sub.totalTrainings||0)-(sub.usedTrainings||0)} трен.`)});
    });return items;
  },[subsExt, studentMap, groupMap, dirMap]);

  const alertsByGroup = useMemo(() => {
    const grouped = {};
    notifications.forEach(n => {
       if(!n.group) return;
       if(!grouped[n.group.id]) grouped[n.group.id] = { group: n.group, dir: n.direction, items: [] };
       grouped[n.group.id].items.push(n);
    });
    return Object.values(grouped).sort((a,b) => (a.group?.name||"").localeCompare(b.group?.name||""));
  }, [notifications]);

  const analytics = useMemo(()=>{
    const analyticsFoundation = buildAnalyticsFoundation({
      students,
      groups,
      studentGrps,
      subs,
      attn,
      trainers,
      trainerGroups,
      periodType: "month",
      anchorDate: today(),
    });
    const totalRev=subs.filter(s=>s.paid).reduce((a,s)=>a+(s.amount||0),0);
    const unpaid=subs.filter(s=>!s.paid&&getSubStatus(s)!=="expired").reduce((a,s)=>a+(s.amount||0),0);
    const byDir={};directionsList.forEach(d=>{const gids=groups.filter(g=>g.directionId===d.id).map(g=>g.id);const ds=activeSubs.filter(s=>gids.includes(s.groupId));byDir[d.id]={students:new Set(ds.map(s=>s.studentId)).size}});
    const splits=[]; groups.forEach(g=>{
      const gSubs=subs.filter(s=>s.groupId===g.id&&s.paid);
      const total=gSubs.reduce((a,s)=>a+(s.amount||0),0);
      if(total>0){splits.push({group:g,total,trainer:Math.round(total*(g.trainerPct||50)/100),studio:Math.round(total*(100-(g.trainerPct||50))/100), subs: gSubs})}
    });
    let totalLTV = 0; let usersWithPurchases = 0; let trialUsers = 0; let convertedUsers = 0;
    Object.values(studentMap).forEach(st => {
      const stSubs = subs.filter(s => s.studentId === st.id);
      if(stSubs.length > 0) {
        const moneySpent = stSubs.filter(s => s.paid).reduce((acc, curr) => acc + (curr.amount || 0), 0);
        if(moneySpent > 0) { totalLTV += moneySpent; usersWithPurchases++; }
        if (stSubs.some(s => s.planType === "trial")) { trialUsers++; if (stSubs.some(s => s.planType !== "trial")) convertedUsers++; }
      }
    });

    const currMonth = today().slice(0, 7);
    const prevMonthDate = new Date(); prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
    const prevMonth = toLocalISO(prevMonthDate).slice(0, 7);

    const currMonthSubs = subs.filter(s => s.startDate?.startsWith(currMonth) || s.created_at?.startsWith(currMonth));
    const currMonthAttn = attn.filter(a => a.date?.startsWith(currMonth));
    const currMonthCancelled = new Set(cancelled.filter(c => c.date?.startsWith(currMonth)).map(c => c.date + c.groupId)).size;

    const currMonthRev = subs.filter(s => s.paid && (s.created_at?.startsWith(currMonth) || s.startDate?.startsWith(currMonth))).reduce((a,s)=>a+(s.amount||0),0);
    const prevMonthRev = subs.filter(s => s.paid && (s.created_at?.startsWith(prevMonth) || s.startDate?.startsWith(prevMonth))).reduce((a,s)=>a+(s.amount||0),0);

    const chartData = analyticsFoundation.ui.charts.line.series.map((row) => ({
      day: row.x,
      count: row.y,
    }));
    const maxChartVal = Math.max(...chartData.map(d => d.count), 1);

    const currMonthDetails = {
      trial: [...currMonthSubs.filter(s => s.planType === "trial"), ...currMonthAttn.filter(a => a.entryType === "trial" && !a.subId)],
      single: [...currMonthSubs.filter(s => s.planType === "single"), ...currMonthAttn.filter(a => a.entryType === "single" && !a.subId)],
      pack4: currMonthSubs.filter(s => s.planType === "4pack"),
      pack8: currMonthSubs.filter(s => s.planType === "8pack"),
      pack12: currMonthSubs.filter(s => s.planType === "12pack"),
      unpaidAttn: currMonthAttn.filter(a => a.entryType === "unpaid")
    };

    return {
      totalStudents:students.length, activeStudents:new Set(activeSubs.map(s=>s.studentId)).size, 
      totalRev, unpaid, byDir, splits, currMonthRev, prevMonthRev,
      avgLTV: usersWithPurchases > 0 ? Math.round(totalLTV / usersWithPurchases) : 0, 
      conversionRate: trialUsers > 0 ? Math.round((convertedUsers / trialUsers) * 100) : 0,
      currMonthStats: { trial: currMonthDetails.trial.length, single: currMonthDetails.single.length, pack4: currMonthDetails.pack4.length, pack8: currMonthDetails.pack8.length, pack12: currMonthDetails.pack12.length, cancelledCount: currMonthCancelled, unpaidAttn: currMonthDetails.unpaidAttn.length },
      currMonthDetails, chartData, maxChartVal,
      foundation: analyticsFoundation,
    };
  },[students,subs,activeSubs,groups, studentMap, cancelled, attn, studentGrps, trainers, trainerGroups]);

  // ФІКС ПРО АНАЛІТИКИ: Захищаємо від крашу, якщо напрямок або група видалена
  const proAnalytics = useMemo(() => {
    const last30DaysStr = toLocalISO(new Date(new Date().getTime() - 30 * 86400000));
    const subToSt = {}; subs.forEach(s => subToSt[s.id] = s.studentId);
    
    const getTopSpenders = (months) => {
      const dateLimit = new Date(); dateLimit.setMonth(dateLimit.getMonth() - months);
      const totals = {};
      subs.forEach(s => { 
        if (s.paid && s.startDate && s.startDate >= toLocalISO(dateLimit)) {
          totals[s.studentId] = (totals[s.studentId] || 0) + (s.amount || 0); 
        }
      });
      return Object.entries(totals).map(([id, total]) => ({ student: studentMap[id], total })).filter(x => x.student).sort((a,b) => b.total - a.total).slice(0, 5);
    };

    const groupAttnCounts = {};
    attn.forEach(a => { 
      if (a.date && a.date >= last30DaysStr) { 
        const stId = a.subId ? subToSt[a.subId] : null; 
        if (stId) { 
          if (!groupAttnCounts[a.groupId]) groupAttnCounts[a.groupId] = {}; 
          groupAttnCounts[a.groupId][stId] = (groupAttnCounts[a.groupId][stId] || 0) + 1; 
        } 
      } 
    });
    
    const bestAttenders = groups.map(g => { 
        const counts = groupAttnCounts[g.id] || {}; 
        const bestId = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b, null); 
        const dir = dirMap[g.directionId] || {}; // Запобігає падінню
        return { group: {...g, direction: dir}, student: studentMap[bestId], count: counts[bestId] }; 
    }).filter(x => x.student && x.group);

    const latestAttnByStudent = {};
    attn.forEach(a => {
        let stId = null;
        if (a.subId) stId = subToSt[a.subId];
        else if (a.guestName) {
            const s = Object.values(studentMap).find(x => x.name === a.guestName);
            if (s) stId = s.id;
        }
        if (stId && a.date) {
            if (!latestAttnByStudent[stId] || a.date > latestAttnByStudent[stId]) {
                latestAttnByStudent[stId] = a.date;
            }
        }
    });

    const upsellCandidates = [];
    const churnRisk = [];
    
    activeSubs.forEach(sub => {
      const st = studentMap[sub.studentId];
      const gr = groupMap[sub.groupId];
      if(!st || !gr) return;
      const dir = dirMap[gr.directionId] || {}; // Запобігає падінню
      
      const stAttnDates = attn.filter(a => a.groupId === gr.id && a.subId === sub.id && a.date).map(a => a.date).sort();
      const stAttn30Days = stAttnDates.filter(d => d >= last30DaysStr).length;

      if (sub.planType === '4pack' && stAttn30Days >= 6) upsellCandidates.push({ student: st, group: {...gr, direction: dir}, suggest: '8 занять', reason: `У цій групі: ${stAttn30Days} трен. за 30 днів` }); 
      else if (sub.planType === '8pack' && stAttn30Days >= 10) upsellCandidates.push({ student: st, group: {...gr, direction: dir}, suggest: '12 занять', reason: `У цій групі: ${stAttn30Days} трен. за 30 днів` });
      
      const trainingsLeft = (sub.totalTrainings || 1) - (sub.usedTrainings || 0);
      const dl = daysLeft(sub.endDate);
      
      if (trainingsLeft <= 1 || dl <= 3) {
          const lastDate = latestAttnByStudent[st.id] || sub.startDate;
          if (lastDate && lastDate !== "2000-01-01") {
            const daysSinceLast = Math.floor((new Date() - new Date(lastDate + "T12:00:00")) / 86400000);
            if (daysSinceLast >= 10 && !churnRisk.some(c => c.student.id === st.id)) {
                churnRisk.push({ student: st, group: {...gr, direction: dir}, daysSinceLast });
            }
          }
      }
    });

    const dayCounts = {0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0};
    attn.filter(a => a.date && a.date >= last30DaysStr).forEach(a => {
        const d = new Date(a.date + "T12:00:00").getDay();
        if (!isNaN(d)) dayCounts[d]++;
    });
    const popularDays = WEEKDAYS.map((name, i) => ({ day: name, count: dayCounts[i] })).sort((a,b) => b.count - a.count);

    return { topSpenders: { 1: getTopSpenders(1), 3: getTopSpenders(3), 6: getTopSpenders(6), 12: getTopSpenders(12) }, bestAttenders, upsellCandidates, churnRisk, popularDays };
  }, [subs, attn, groups, studentMap, activeSubs, dirMap]);

  const filteredStudents=useMemo(()=>{
    let r=students; if(searchQ) r=r.filter(s=>getDisplayName(s).toLowerCase().includes(searchQ.toLowerCase()));
    if(stFilterDir !== "all") r = r.filter(st => studentGrps.some(sg => sg.studentId === st.id && groupMap[sg.groupId]?.directionId === stFilterDir));
    if(stFilterGroup !== "all") r = r.filter(st => studentGrps.some(sg => sg.studentId === st.id && sg.groupId === stFilterGroup));
    return r.sort((a,b)=>getDisplayName(a).localeCompare(getDisplayName(b),"uk"));
  },[students, searchQ, stFilterDir, stFilterGroup, studentGrps, groupMap]);

  const studentsByDirection = useMemo(() => {
    const result = {}; 
    directionsList.forEach(d => { result[d.id] = { direction: d, students: [] }; });
    const inactive = [];

    filteredStudents.forEach(st => { 
      const sgs = studentGrps.filter(sg => sg.studentId === st.id); 
      const hasActiveSub = activeSubs.some(s => s.studentId === st.id);
      
      if (sgs.length === 0 && !hasActiveSub) {
        inactive.push(st);
        return;
      }
      
      const dirs = new Set(); 
      sgs.forEach(sg => {
        const g = groupMap[sg.groupId]; 
        if (g) dirs.add(g.directionId);
      }); 
      if (dirs.size === 0 && hasActiveSub) {
        const firstSubDir = groupMap[activeSubs.find(s => s.studentId === st.id).groupId]?.directionId;
        if(firstSubDir) dirs.add(firstSubDir);
      }
      
      dirs.forEach(did => {
        if (result[did]) result[did].students.push(st);
      }); 
    });
    
    return { 
      grouped: Object.values(result).filter(d => d.students.length > 0),
      inactive 
    };
  }, [filteredStudents, studentGrps, groupMap, activeSubs]);

  const filteredSubs=useMemo(()=>{
    const from = filterFromDate || "";
    const to = filterToDate || "";
    let r=subsExt;
    if(filterPlanType!=="all")r=r.filter(s=>String(s.planType||"").toLowerCase()===filterPlanType);
    if(filterPaid!=="all")r=r.filter(s=>filterPaid==="paid"?!!s.paid:!s.paid);
    if(filterDir!=="all"){const gids=groups.filter(g=>g.directionId===filterDir).map(g=>g.id);r=r.filter(s=>gids.includes(s.groupId))}
    if(filterGroup!=="all")r=r.filter(s=>s.groupId===filterGroup);
    if(filterStatus!=="all")r=r.filter(s=>s.status===filterStatus);
    if(filterPayMethod!=="all")r=r.filter(s=>String(s.payMethod||"")===filterPayMethod);
    if(filterTrainer!=="all"){
      const trainerGroupIds = new Set(trainerGroups.filter((tg) => String(tg.trainerId) === String(filterTrainer)).map((tg) => String(tg.groupId)));
      r=r.filter(s=>trainerGroupIds.has(String(s.groupId)));
    }
    if(from)r=r.filter(s=>(s.activationDate||s.startDate||"")>=from);
    if(to)r=r.filter(s=>(s.activationDate||s.startDate||"")<=to);
    if(searchQ){const q=searchQ.toLowerCase();r=r.filter(s=>getDisplayName(studentMap[s.studentId]).toLowerCase().includes(q))}
    return r.sort((a,b)=>({warning:0,active:1,expired:2}[a.status]??3)-({warning:0,active:1,expired:2}[b.status]??3));
  },[subsExt,filterPlanType,filterPaid,filterDir,filterGroup,filterStatus,filterPayMethod,filterTrainer,filterFromDate,filterToDate,searchQ,groups,studentMap,trainerGroups]);


  const resetPaymentsFilters = () => {
    setFilterPlanType("all");
    setFilterPaid("all");
    setFilterDir("all");
    setFilterGroup("all");
    setFilterTrainer("all");
    setFilterPayMethod("all");
    setFilterStatus("all");
    setFilterDatePreset("custom");
    setFilterFromDate("");
    setFilterToDate("");
    setFilterAudit("all");
  };

  const activePaymentsFilterCount = useMemo(() => [
    filterPlanType !== "all",
    filterPaid !== "all",
    filterDir !== "all",
    filterGroup !== "all",
    filterTrainer !== "all",
    filterPayMethod !== "all",
    filterStatus !== "all",
    filterDatePreset !== "custom" || !!filterFromDate || !!filterToDate,
    filterAudit !== "all",
  ].filter(Boolean).length, [filterPlanType, filterPaid, filterDir, filterGroup, filterTrainer, filterPayMethod, filterStatus, filterDatePreset, filterFromDate, filterToDate, filterAudit]);

  const paymentsSummary = useMemo(() => {
    const paidRows = filteredSubs.filter((s) => !!s.paid);
    const unpaidRows = filteredSubs.filter((s) => !s.paid);
    return {
      count: filteredSubs.length,
      paidTotal: paidRows.reduce((sum, s) => sum + Number(s.amount || 0), 0),
      unpaidTotal: unpaidRows.reduce((sum, s) => sum + Number(s.amount || 0), 0),
      activeCount: filteredSubs.filter((s) => s.status === "active").length,
    };
  }, [filteredSubs]);

  const paymentAnomalies = useMemo(() => {
    const anomalies = [];
    const byKey = {};
    filteredSubs.forEach((s) => {
      const dateKey = String(s.activationDate || s.startDate || "").slice(0, 10);
      const key = `${s.studentId}|${s.groupId}|${dateKey}`;
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push(s);
    });
    Object.values(byKey).forEach((rows) => {
      const first = rows[0];
      const pt = String(first?.planType || "").toLowerCase();
      if ((pt === "trial" || pt === "single") && rows.length > 1) anomalies.push({ type: "duplicate_oneoff_same_day", rows });
      if (rows.length > 1) anomalies.push({ type: "multiple_payments_same_day", rows });
    });
    filteredSubs.forEach((s) => {
      const pt = String(s.planType || "").toLowerCase();
      if (pt !== "trial" && pt !== "single") return;
      const dateKey = String(s.activationDate || s.startDate || "").slice(0, 10);
      const hasAttendance = attn.some((a) => String(a.studentId) === String(s.studentId) && String(a.groupId) === String(s.groupId) && String(a.date).slice(0, 10) === dateKey && String(a.entryType || a.guestType || "").toLowerCase() === pt);
      if (!hasAttendance) anomalies.push({ type: "oneoff_without_attendance", rows: [s] });
      const nearPack = subsExt.some((p) => String(p.studentId) === String(s.studentId) && String(p.groupId) === String(s.groupId) && ["4pack","8pack","12pack"].includes(String(p.planType||"").toLowerCase()) && String(p.startDate || "") <= dateKey && String(p.endDate || "9999-12-31") >= dateKey);
      if (nearPack) anomalies.push({ type: "oneoff_near_pack_subscription", rows: [s] });
    });
    attn.forEach((a) => {
      const t = String(a.entryType || a.guestType || "").toLowerCase();
      if (t !== "trial" && t !== "single") return;
      const dateKey = String(a.date || "").slice(0, 10);
      const hasPayment = subsExt.some((s) => String(s.studentId) === String(a.studentId) && String(s.groupId) === String(a.groupId) && String(s.planType || "").toLowerCase() === t && String(s.activationDate || s.startDate || "").slice(0, 10) === dateKey);
      if (!hasPayment) anomalies.push({ type: "attendance_oneoff_without_payment", rows: [a] });
    });
    return anomalies;
  }, [filteredSubs, attn, subsExt]);
  const anomalyLabelMap = {
    duplicate_oneoff_same_day: "Дубль разового / пробного в один день",
    multiple_payments_same_day: "Кілька оплат в один день",
    oneoff_near_pack_subscription: "Разове / пробне накладається на абонемент",
    oneoff_without_attendance: "Є оплата без відвідування",
    attendance_oneoff_without_payment: "Є відвідування без оплати",
  };

  const subsGroupedByDir = useMemo(()=>{
    const result={}; directionsList.forEach(d=>{result[d.id]={direction:d,subs:[]}});
    filteredSubs.forEach(sub=>{ const gr=groupMap[sub.groupId]; if(gr && result[gr.directionId]){result[gr.directionId].subs.push(sub);} });
    return {grouped:Object.values(result).filter(d=>d.subs.length>0)};
  },[filteredSubs, groupMap]);

  useEffect(() => {
    if (filterDatePreset === "custom") return;
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const endOfWeek = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate() + 6);
    const startOfLastWeek = new Date(startOfWeek); startOfLastWeek.setDate(startOfWeek.getDate() - 7);
    const endOfLastWeek = new Date(startOfWeek); endOfLastWeek.setDate(startOfWeek.getDate() - 1);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const map = {
      today: [toIso(now), toIso(now)],
      this_week: [toIso(startOfWeek), toIso(endOfWeek)],
      last_week: [toIso(startOfLastWeek), toIso(endOfLastWeek)],
      this_month: [toIso(startOfMonth), toIso(endOfMonth)],
      last_month: [toIso(startOfLastMonth), toIso(endOfLastMonth)],
    };
    const row = map[filterDatePreset];
    if (row) { setFilterFromDate(row[0]); setFilterToDate(row[1]); }
  }, [filterDatePreset, setFilterFromDate, setFilterToDate]);

  if(loading || accessChecking) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:theme.bg,color:theme.textMuted,fontFamily:"Poppins, sans-serif",fontSize:18}}>Завантаження...</div>;

  if (!user || !accessAllowed) {
    return (
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:theme.bg, fontFamily:"'Poppins',sans-serif"}}>
        <form onSubmit={handleLogin} style={{background:theme.card, padding:40, borderRadius:32, width:350, boxShadow:"0 20px 50px rgba(0,0,0,0.1)"}}>
          <h2 style={{marginTop:0, marginBottom:24, textAlign:"center", color:theme.secondary}}>Dance Studio</h2>
          {authBlockMessage && <div style={{marginBottom:16, padding:"10px 12px", borderRadius:12, background:"rgba(234,84,85,0.12)", color:theme.danger, fontSize:13, fontWeight:700, lineHeight:1.35}}>{authBlockMessage}</div>}
          <input style={{...inputSt, marginBottom:16}} type="email" placeholder="Email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} required />
          <input style={{...inputSt, marginBottom:24}} type="password" placeholder="Пароль" value={authPass} onChange={e=>setAuthPass(e.target.value)} required />
          <button style={{...btnP, width:"100%"}} type="submit">Увійти</button>
        </form>
      </div>
    );
  }

  const deleteStudentAction = async(id) => {
    if(!confirm("Видалити ученицю назавжди? Її дані зникнуть звідусіль.")) return;
    try {
      const st = students.find(s=>s.id===id);
      const names = [st?.name, getDisplayName(st)].filter(Boolean);
      const subsToDel = subs.filter(s=>s.studentId===id).map(s=>s.id);
      
      setAttn(p=>p.filter(a => {
        if(a.subId && subsToDel.includes(a.subId)) return false;
        if(a.guestName && names.includes(a.guestName)) return false;
        return true;
      }));
      setSubs(p=>p.filter(s=>s.studentId!==id));
      setStudents(p=>p.filter(s=>s.id!==id));
      setStudentGrps(p=>p.filter(sg=>sg.studentId!==id));
      if(db.deleteStudent) await db.deleteStudent(id);
    } catch(e) { console.warn("Помилка видалення учениці:", e); }
  };

  const deleteSubAction = async(id) => {
    if(!confirm("Видалити абонемент?")) return;
    try {
      setAttn(p=>p.filter(a=>a.subId!==id));
      setSubs(p=>p.filter(s=>s.id!==id));
      if(db.deleteSub) await db.deleteSub(id);
    } catch(e) { console.warn("Помилка видалення абонемента:", e); }
  };

  const syncStudentGroupLinks = async (studentId, selectedGroups) => {
    if (!studentId || !Array.isArray(selectedGroups)) return;
    const desiredIds = Array.from(new Set(selectedGroups.map((id) => String(id || "").trim()).filter(Boolean)));
    const desiredSet = new Set(desiredIds);
    const currentRows = studentGrps.filter((sg) => String(sg.studentId) === String(studentId));
    const currentIds = new Set(currentRows.map((sg) => String(sg.groupId)));
    const addedLinks = [];

    for (const row of currentRows) {
      if (!desiredSet.has(String(row.groupId))) await db.removeStudentGroup(studentId, row.groupId);
    }
    for (const groupId of desiredIds) {
      if (!currentIds.has(String(groupId))) {
        const link = db.addStudentGroup
          ? await db.addStudentGroup(studentId, groupId)
          : await db.restoreStudentToGroup(groupId, studentId);
        addedLinks.push(link || { id: uid(), studentId, groupId });
      }
    }

    setStudentGrps((prev) => {
      const withoutRemoved = (prev || []).filter((sg) => !(String(sg.studentId) === String(studentId) && !desiredSet.has(String(sg.groupId))));
      return desiredIds.reduce((acc, groupId) => {
        if (acc.some((sg) => String(sg.studentId) === String(studentId) && String(sg.groupId) === String(groupId))) return acc;
        const added = addedLinks.find((sg) => String(sg.groupId) === String(groupId));
        return [...acc, added || { id: uid(), studentId, groupId }];
      }, withoutRemoved);
    });
  };

  const createStudentAction = async (d) => {
    const { selectedGroups, ...studentPayload } = d;
    try {
      const s = await db.insertStudent(studentPayload);
      const created = s || { id: uid(), ...studentPayload };
      setStudents((p) => [...p, created]);
      if (Array.isArray(selectedGroups)) await syncStudentGroupLinks(created.id, selectedGroups);
      setModal(null);
    } catch(e) {
      console.warn(e);
      setStudents((p) => [...p, { id: uid(), ...studentPayload }]);
      setModal(null);
    }
  };

  const updateStudentAction = async (d) => {
    const { selectedGroups, ...studentPayload } = d;
    try {
      if(db.updateStudent) await db.updateStudent(editItem.id, studentPayload);
      if (Array.isArray(selectedGroups)) await syncStudentGroupLinks(editItem.id, selectedGroups);
      const oldNames = [editItem.name, getDisplayName(editItem)].filter(Boolean);
      const newName = getDisplayName({...editItem, ...studentPayload});
      setStudents(p=>p.map(x=>x.id===editItem.id?{...x,...studentPayload}:x));
      setAttn(p=>p.map(a=>{ if(a.guestName && oldNames.includes(a.guestName)){ return {...a, guestName: newName}; } return a; }));
      setModal(null);setEditItem(null);
    }catch(e){console.warn(e);}
  };

  const restoreStudentToGroup = async (studentId) => {
    const groupId = String(restoreGroupByStudent[studentId] || "").trim();
    if (!groupId) {
      alert("Обери групу для відновлення");
      return;
    }
    const st = studentMap[studentId];
    const gr = groupMap[groupId];
    const ok = window.confirm(`Відновити ${getDisplayName(st)} у групу "${gr?.name || groupId}"?`);
    if (!ok) return;

    try {
      const link = await db.restoreStudentToGroup(groupId, studentId);
      setStudentGrps((prev) => {
        if (prev.some((sg) => String(sg.studentId) === String(studentId) && String(sg.groupId) === String(groupId))) return prev;
        return [...prev, link || { id: uid(), studentId, groupId }];
      });
      setRestoreGroupByStudent((prev) => {
        const next = { ...prev };
        delete next[studentId];
        return next;
      });
    } catch (e) {
      alert(`Не вдалося відновити ученицю в групу: ${e?.message || e}`);
    }
  };

  const addTrialBookingAction = async (payload) => {
    try {
      const created = await db.insertTrialBooking({
        ...payload,
        studentId: payload.studentId || null,
        status: payload.status || "new",
      });
      setTrialBookings((prev) => [created, ...prev]);
      setModal(null);
    } catch (e) {
      console.error("Failed to add trial booking:", e);
      alert(`Не вдалося додати запис на пробне: ${e?.message || e}`);
    }
  };

  const updateTrialBookingAction = async (payload) => {
    if (!editItem?.id) return;

    try {
      const saved = await db.updateTrialBooking(editItem.id, {
        ...payload,
        studentId: payload.studentId || null,
      });
      setTrialBookings((prev) => prev.map((row) => (String(row.id) === String(editItem.id) ? saved : row)));
      setModal(null);
      setEditItem(null);
    } catch (e) {
      console.error("Failed to update trial booking:", e);
      alert(`Не вдалося оновити запис на пробне: ${e?.message || e}`);
    }
  };

  const cancelTrialBookingAction = async (booking) => {
    if (!booking?.id) return;
    if (!window.confirm("Скасувати запис на пробне?")) return;

    try {
      const next = await db.updateTrialBooking(booking.id, { status: "cancelled" });
      setTrialBookings((prev) => prev.map((row) => (String(row.id) === String(booking.id) ? next : row)));
    } catch (e) {
      console.error("Failed to cancel trial booking:", e);
      alert(`Не вдалося скасувати пробне: ${e?.message || e}`);
    }
  };




  // Frontend guard only; Supabase RLS is still required for server-side booking ownership enforcement.
  const currentTrainerProfile = trainers.find(
    (trainer) => String(trainer.authUserId || "") === String(user?.id || "") || String(trainer.id || "") === String(user?.id || ""),
  );
  const currentTrainerScopeIds = Array.from(new Set([
    user?.id,
    currentTrainerProfile?.id,
    currentTrainerProfile?.authUserId,
  ].filter(Boolean).map(String)));
  const isAssignedToCurrentTrainer = (trainerId) =>
    !!trainerId && currentTrainerScopeIds.includes(String(trainerId));
  const canMutateRoomBooking = (booking) => {
    if (isAdmin) return true;
    return !!booking && isAssignedToCurrentTrainer(booking.trainerId || booking.trainer_id);
  };

  const normalizeTrainerSchedulePayload = (payload = {}) => {
    const eventType = ["room_booking", "individual_training"].includes(String(payload?.eventType || ""))
      ? payload.eventType
      : "room_booking";
    const payloadTrainerId = payload?.trainerId || payload?.trainer_id || null;
    return {
      ...payload,
      trainerId: isAssignedToCurrentTrainer(payloadTrainerId) ? payloadTrainerId : user?.id || null,
      eventType,
      bookingType: eventType === "individual_training" ? payload.bookingType || null : null,
      peopleCount: eventType === "individual_training" ? payload.peopleCount || null : null,
      price: eventType === "individual_training" ? payload.price || null : null,
      paymentMethod: eventType === "individual_training" ? payload.paymentMethod || "none" : "none",
    };
  };

  const addRoomBookingAction = async (payload) => {
    const safePayload = isAdmin ? payload : normalizeTrainerSchedulePayload(payload);
    const created = await db.insertRoomBooking(safePayload);
    setRoomBookings((prev) => [...prev, created].sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`)));
  };

  const deleteRoomBookingAction = async (id) => {
    const booking = roomBookings.find((x) => String(x.id) === String(id));
    if (!canMutateRoomBooking(booking)) {
      alert("Можна видаляти тільки власні резерви / індивідуальні тренування.");
      return;
    }
    if (isAdmin && !window.confirm("Видалити резерв залу?")) return;
    await db.deleteRoomBooking(id);
    setRoomBookings((prev) => prev.filter((x) => String(x.id) !== String(id)));
  };

  const updateRoomBookingAction = async (id, payload) => {
    const booking = roomBookings.find((x) => String(x.id) === String(id));
    if (!canMutateRoomBooking(booking)) {
      alert("Можна редагувати тільки власні резерви / індивідуальні тренування.");
      return;
    }
    const safePayload = isAdmin
      ? payload
      : normalizeTrainerSchedulePayload({
          ...booking,
          ...payload,
          eventType: payload?.eventType || booking.eventType || "room_booking",
        });
    const updated = await db.updateRoomBooking(id, safePayload);
    setRoomBookings((prev) => prev.map((x) => (String(x.id) === String(id) ? updated : x)));
  };


  const canMutateGroupLessonOverride = (groupId) => {
    if (isAdmin) return true;
    return groups.some((g) => String(g.id) === String(groupId) && String(g.trainer_id || "") === String(user?.id || ""));
  };

  const addGroupLessonOverrideAction = async (payload) => {
    if (!canMutateGroupLessonOverride(payload?.groupId)) {
      alert("Можна редагувати тільки заняття своїх груп.");
      return null;
    }
    const created = await db.insertGroupLessonOverride({
      ...payload,
      createdBy: user?.id || null,
    });
    setGroupLessonOverrides((prev) => [
      ...prev.filter((x) => !(String(x.groupId) === String(created.groupId) && String(x.date) === String(created.date) && Number(x.slotIndex) === Number(created.slotIndex))),
      created,
    ]);
    return created;
  };


  const upsertTrainingLessonPlanAction = async (payload) => {
    if (!canMutateGroupLessonOverride(payload?.groupId)) {
      alert("Можна редагувати тільки плани занять своїх груп.");
      return null;
    }
    const saved = await db.upsertTrainingLessonPlan(payload);
    setTrainingLessonPlans((prev) => [
      ...prev.filter((x) => !(
        String(x.groupId) === String(saved.groupId) &&
        String(x.trainerId) === String(saved.trainerId) &&
        String(x.lessonDate).slice(0, 10) === String(saved.lessonDate).slice(0, 10) &&
        Number(x.scheduleSlotIndex || 0) === Number(saved.scheduleSlotIndex || 0)
      )),
      saved,
    ]);
    return saved;
  };

  const upsertTrainingLessonReportAction = async (payload) => {
    if (!canMutateGroupLessonOverride(payload?.groupId)) {
      alert("Можна зберігати результати тільки для своїх груп.");
      return null;
    }
    const saved = await db.upsertTrainingLessonReport(payload);
    setTrainingLessonReports((prev) => [
      ...prev.filter((x) => !(
        String(x.groupId) === String(saved.groupId) &&
        String(x.trainerId) === String(saved.trainerId) &&
        String(x.lessonDate).slice(0, 10) === String(saved.lessonDate).slice(0, 10) &&
        Number(x.scheduleSlotIndex || 0) === Number(saved.scheduleSlotIndex || 0)
      )),
      saved,
    ]);
    return saved;
  };

  const updateGroupLessonOverrideAction = async (id, patch) => {
    const existing = groupLessonOverrides.find((x) => String(x.id) === String(id));
    if (!canMutateGroupLessonOverride(existing?.groupId || patch?.groupId)) {
      alert("Можна редагувати тільки заняття своїх груп.");
      return null;
    }
    const updated = await db.updateGroupLessonOverride(id, patch);
    setGroupLessonOverrides((prev) => prev.map((x) => (String(x.id) === String(id) ? updated : x)));
    return updated;
  };

  const deleteGroupLessonOverrideAction = async (id) => {
    const existing = groupLessonOverrides.find((x) => String(x.id) === String(id));
    if (!canMutateGroupLessonOverride(existing?.groupId)) {
      alert("Можна редагувати тільки заняття своїх груп.");
      return;
    }
    await db.deleteGroupLessonOverride(id);
    setGroupLessonOverrides((prev) => prev.filter((x) => String(x.id) !== String(id)));
  };

  const updateGroupScheduleAction = async (groupId, schedule) => {
    if (!isAdmin) {
      alert("Редагування розкладу груп доступне тільки адміністратору.");
      return;
    }
    const updated = await db.updateGroup(groupId, { schedule });
    setGroups((prev) => prev.map((g) => (String(g.id) === String(groupId) ? { ...g, ...updated } : g)));
    setScheduleGroups((prev) => prev.map((g) => (String(g.id) === String(groupId) ? { ...g, ...updated } : g)));
  };

  const clearSubscriptionWarningForStudent = async (groupId, studentId) => {
    if (!groupId || !studentId) return;
    const key = `${groupId}:${studentId}`;
    setWarnedStudents((prev) => ({ ...(prev || {}), [key]: false }));
    try {
      await db.upsertWarnedStudent(groupId, studentId, false);
    } catch (err) {
      console.warn("Failed to clear subscription warning flag:", err);
    }
  };

  const applyConvertedDebtAttendance = (convertedRows = []) => {
    if (!Array.isArray(convertedRows) || convertedRows.length === 0) return;
    const byId = new Map(convertedRows.map((row) => [String(row.id), row]));
    setAttn((prev) => (prev || []).map((row) => byId.get(String(row.id)) || row));
  };

  const getCancelledTrainingCompensatedSubscription = (payload = {}) => {
    const groupId = payload.groupId == null ? "" : String(payload.groupId).trim();
    const startDate = getCancellationDate({ date: payload.startDate });
    const baseEndDate = getCancellationDate({ date: payload.endDate });
    if (!groupId || !startDate || !baseEndDate) return payload;

    const group = (groups || []).find((g) => String(g.id).trim() === groupId)
      || (scheduleGroups || []).find((g) => String(g.id).trim() === groupId);
    const cancelledSources = [cancelled || [], scheduleCancelled || []];
    const matchingCancelledDates = [...getCancelledDatesForGroup(cancelledSources, groupId, { startDate, endDate: baseEndDate })]
      .sort((dateA, dateB) => dateA.localeCompare(dateB));

    if (!matchingCancelledDates.length) return payload;

    let compensatedEndDate = baseEndDate;
    matchingCancelledDates.forEach(() => {
      compensatedEndDate = getNextNonCancelledTrainingDate(group?.schedule || [], compensatedEndDate, groupId, cancelledSources);
    });

    return {
      ...payload,
      endDate: compensatedEndDate,
      originalEndDate: payload.originalEndDate || baseEndDate,
    };
  };

  const createSubscriptionAction = async (payload) => {
    const compensatedPayload = getCancelledTrainingCompensatedSubscription(payload);
    try {
      let createdSub = await db.insertSub(compensatedPayload);
      const savedSub = createdSub || { id: uid(), ...compensatedPayload, notificationSent: false };

      try {
        const conversion = await db.convertDebtAttendanceToSubscription({
          studentId: savedSub.studentId || compensatedPayload.studentId,
          groupId: savedSub.groupId || compensatedPayload.groupId,
          subId: savedSub.id,
          startDate: savedSub.startDate || compensatedPayload.startDate,
          endDate: savedSub.endDate || compensatedPayload.endDate,
        });
        applyConvertedDebtAttendance(conversion?.attendance || []);
        if (conversion?.subscription) {
          createdSub = {
            ...savedSub,
            ...conversion.subscription,
            paid: conversion.subscription.paid ?? savedSub.paid,
          };
        }
      } catch (conversionErr) {
        console.warn("Failed to convert debt attendance after subscription creation:", conversionErr);
      }

      const finalSub = createdSub || savedSub;
      try {
        const freshSubs = await db.fetchSubs({ includeFinancial: true });
        setSubs(freshSubs);
      } catch (refreshErr) {
        console.warn("Failed to refresh subscriptions after subscription creation:", refreshErr);
        setSubs((prev) => [finalSub, ...(prev || []).filter((sub) => String(sub.id) !== String(finalSub.id))]);
      }
      await clearSubscriptionWarningForStudent(finalSub.groupId || compensatedPayload.groupId, finalSub.studentId || compensatedPayload.studentId);
      setModal(null);
      setPrefillSub(null);
    } catch (e) {
      console.warn(e);
      setSubs((prev) => [{ id: uid(), ...compensatedPayload, notificationSent: false }, ...(prev || [])]);
      setModal(null);
      setPrefillSub(null);
    }
  };

  const studentsMobileModalVariant = tab === "students" ? "students-mobile" : undefined;
  const trialBookingMobileModalVariant = tab === "students" ? "trial-booking-mobile" : undefined;

  return (
    <div className={tab === "messages" ? "app-messages-active" : undefined} data-theme-version={themeRenderTick} data-build-label={APP_BUILD_LABEL} style={{minHeight:"100dvh", background:theme.bg, color:theme.textMain, fontFamily:"'Poppins',sans-serif", paddingBottom: "max(100px, env(safe-area-inset-bottom))"}}>
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
      <style>{`
        @media (max-width: 768px) {
          th:first-child, td:first-child { 
            min-width: 140px !important; 
            padding: 8px !important; 
            font-size: 11px !important; 
          }
          th, td { padding: 4px !important; }
          header { padding: calc(14px + env(safe-area-inset-top)) 14px 10px !important; flex-direction: row; gap: 8px; align-items: center !important; }
          .app-brand h1 { font-size: 18px !important; letter-spacing: -0.3px !important; }
          .brand-desktop { display: none !important; }
          .brand-mobile { display: inline !important; }
          .mobile-hide { display: none !important; }
          .mobile-more-wrap { display: block !important; }
          .bottom-form { flex-direction: column !important; align-items: stretch !important; }
          .bottom-form input { width: 100% !important; }
          .app-messages-active { padding-bottom: 0 !important; overflow-x: hidden; }
          .app-main-messages { width: 100% !important; max-width: none !important; height: calc(100dvh - 148px); padding-left: 0 !important; padding-right: 0 !important; overflow: hidden !important; min-height: 0; }
          .split-container { flex-direction: column !important; }
          .split-left, .split-right {
             flex: 1 1 auto !important;
             max-width: 100% !important;
             width: 100% !important;
          }
        }
      `}</style>
      <header style={{padding:"20px 16px 12px", maxWidth:1200, margin:"0 auto", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10}}>
        <div className="app-brand"><h1 style={{margin:0, fontSize:26, fontWeight:800, letterSpacing: "-1px", color: theme.secondary}}><span className="brand-desktop">Dance Studio.</span><span className="brand-mobile" style={{display:"none"}}>Soroka Dance Studio</span></h1></div>
        <div style={{display:"flex", gap:12, alignItems: 'center'}}>
          <button className="mobile-hide" type="button" style={btnS} onClick={() => setThemeMode((m) => (m === "dark" ? "light" : "dark"))}>
            {safeThemeMode === "dark" ? "☀️ Light" : "🌙 Dark"}
          </button>
          {isAdmin && <button className="mobile-hide" style={btnS} onClick={()=>setModal("addStudent")}>+ Учениця</button>}
          {isAdmin && <button className="mobile-hide" style={btnS} onClick={()=>setModal("addGroup")}>+ Додати групу</button>}
          {isAdmin && <button className="mobile-hide" style={btnS} onClick={()=>setModal("manageDirections")}>⚙️ Напрямки</button>}
          {isAdmin && <button className="mobile-hide" style={btnP} onClick={()=>setModal("addSub")}>+ Абонемент</button>}
          <div className="mobile-hide" style={{display:"flex", flexDirection:"column", gap:4, alignItems:"flex-start"}}>
            <button type="button" style={{...btnS, opacity: pushBusy ? 0.8 : 1}} onClick={handleEnablePush} disabled={pushBusy || !user}>
              {pushBusy ? "Увімкнення..." : "Увімкнути push"}
            </button>
            <button
              type="button"
              style={{...btnS, opacity: testPushBusy || pushStatus !== PUSH_STATUS.subscribed ? 0.7 : 1}}
              onClick={handleSendTestPush}
              disabled={testPushBusy || pushStatus !== PUSH_STATUS.subscribed || !user}
            >
              {testPushBusy ? "Надсилання..." : "Надіслати тестовий push"}
            </button>
            <div style={{fontSize:11, color: theme.textMuted, maxWidth:260}}>{pushStatusLabel}</div>
            {!!pushInfo && <div style={{fontSize:11, color: pushStatus === PUSH_STATUS.error ? theme.danger : theme.success, maxWidth:260}}>{pushInfo}</div>}
            {!!testPushInfo && <div style={{fontSize:11, color: testPushInfo.startsWith("помилка") ? theme.danger : theme.success, maxWidth:260}}>{testPushInfo}</div>}
          </div>
          <button className="mobile-hide" style={{...btnS, padding:"10px 16px", fontSize: 13}} onClick={() => supabase.auth.signOut().then(()=>window.location.reload())}>Вихід ({user.email.split('@')[0]})</button>
          <div className="mobile-more-wrap" style={{display:"none", position:"relative"}}>
            <button type="button" style={{...btnS, padding:"8px 10px", fontSize:12}} onClick={(e) => { e.stopPropagation(); setMoreMenuOpen((v) => !v); }}>Ще ▾</button>
            {moreMenuOpen && (
              <div onClick={(e) => e.stopPropagation()} style={{position:"absolute", right:0, top:"calc(100% + 8px)", zIndex:30, minWidth:176, background: theme.card, border:`1px solid ${theme.border}`, borderRadius:12, boxShadow:"0 10px 24px rgba(0,0,0,0.18)", padding:7, display:"flex", flexDirection:"column", gap:5}}>
                <button type="button" style={{...btnS, minHeight:32, height:32, width:"100%", padding:"0 10px", fontSize:12, display:"flex", alignItems:"center", justifyContent:"center"}} onClick={() => setThemeMode((m) => (m === "dark" ? "light" : "dark"))}>{safeThemeMode === "dark" ? "☀️ Light" : "🌙 Dark"}</button>
                <button type="button" style={{...btnS, opacity: pushBusy ? 0.8 : 1, minHeight:32, height:32, width:"100%", padding:"0 10px", fontSize:12, display:"flex", alignItems:"center", justifyContent:"center"}} onClick={handleEnablePush} disabled={pushBusy || !user}>{pushBusy ? "Увімкнення..." : "Увімкнути push"}</button>
                <button type="button" style={{...btnS, opacity: testPushBusy || pushStatus !== PUSH_STATUS.subscribed ? 0.7 : 1, minHeight:32, height:32, width:"100%", padding:"0 10px", fontSize:12, display:"flex", alignItems:"center", justifyContent:"center"}} onClick={handleSendTestPush} disabled={testPushBusy || pushStatus !== PUSH_STATUS.subscribed || !user}>{testPushBusy ? "Надсилання..." : "Тест push"}</button>
                {tab === "attendance" && (
                  <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 6, display: "grid", gap: 5, background: theme.bg === "#0F131A" ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.55)" }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: theme.textMuted, textAlign: "left" }}>Масштаб</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <button type="button" style={attendanceScaleBtnStyle} onClick={() => changeAttendanceScale(-5)} disabled={safeAttendanceScale <= 60} aria-label="Зменшити масштаб відвідування">−</button>
                      <span style={{ minWidth: 42, textAlign: "center", fontSize: 12, fontWeight: 900, color: theme.textMain }}>{safeAttendanceScale}%</span>
                      <button type="button" style={attendanceScaleBtnStyle} onClick={() => changeAttendanceScale(5)} disabled={safeAttendanceScale >= 130} aria-label="Збільшити масштаб відвідування">+</button>
                      <button type="button" style={{ ...attendanceScaleBtnStyle, minWidth: 48 }} onClick={resetAttendanceScale} disabled={safeAttendanceScale === 100}>100%</button>
                    </div>
                  </div>
                )}
                {tab === "schedule" && (
                  <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 6, display: "grid", gap: 5, background: theme.bg === "#0F131A" ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.55)" }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: theme.textMuted, textAlign: "left" }}>Масштаб графіку</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <button type="button" style={scheduleScaleBtnStyle} onClick={() => changeScheduleScale(-5)} disabled={safeScheduleScale <= 60} aria-label="Зменшити масштаб графіку">−</button>
                      <span style={{ minWidth: 42, textAlign: "center", fontSize: 12, fontWeight: 900, color: theme.textMain }}>{safeScheduleScale}%</span>
                      <button type="button" style={scheduleScaleBtnStyle} onClick={() => changeScheduleScale(5)} disabled={safeScheduleScale >= 130} aria-label="Збільшити масштаб графіку">+</button>
                      <button type="button" style={{ ...scheduleScaleBtnStyle, minWidth: 48 }} onClick={resetScheduleScale} disabled={safeScheduleScale === 100}>100%</button>
                    </div>
                  </div>
                )}

                {isAdmin && <button type="button" style={{...btnS, minHeight:32, height:32, width:"100%", padding:"0 10px", fontSize:12, display:"flex", alignItems:"center", justifyContent:"center"}} onClick={()=>setModal("addStudent")}>+ Учениця</button>}
                {isAdmin && <button type="button" style={{...btnS, minHeight:32, height:32, width:"100%", padding:"0 10px", fontSize:12, display:"flex", alignItems:"center", justifyContent:"center"}} onClick={()=>setModal("addGroup")}>+ Додати групу</button>}
                {isAdmin && <button type="button" style={{...btnS, minHeight:32, height:32, width:"100%", padding:"0 10px", fontSize:12, display:"flex", alignItems:"center", justifyContent:"center"}} onClick={()=>setModal("manageDirections")}>⚙️ Напрямки</button>}
                {isAdmin && <button type="button" style={{...btnS, minHeight:32, height:32, width:"100%", padding:"0 10px", fontSize:12, display:"flex", alignItems:"center", justifyContent:"center"}} onClick={()=>setModal("addSub")}>+ Абонемент</button>}
                <button type="button" style={{...btnS, minHeight:32, height:32, width:"100%", padding:"0 10px", fontSize:12, display:"flex", alignItems:"center", justifyContent:"center"}} onClick={() => supabase.auth.signOut().then(()=>window.location.reload())}>Вихід</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <nav style={{maxWidth:1200, margin:"0 auto", padding:"0 24px 30px", overflowX:"auto"}}>
        <div style={{display:"inline-flex", background: theme.card, borderRadius: 100, padding: 6, boxShadow: "0 4px 20px rgba(168, 177, 206, 0.15)"}}>
          {isAdmin ? (
            [
              {id:"dashboard", label:"Дашборд"},
              {id:"admin", label:"Адмін"},
              {id:"schedule", label:"Графік"},
              {id:"attendance", label:"Відвідування"},
              {id:"messages", label:"Повідомлення / Чати"},
              {id:"subs", label:"Оплати"},
              {id:"students", label:"Учениці"},
              {id:"analytics", label:"📊 Instagram"}
            ].map(t=><button key={t.id} onClick={()=>{setTab(t.id);setSearchQ("")}} style={{padding: "12px 24px", background: tab===t.id ? theme.primary : "transparent", border: "none", borderRadius: 100, color: tab===t.id ? "#fff" : theme.textMuted, fontSize: 14, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", transition: "0.2s"}}>{t.label}</button>)
          ) : (
            [
              { id: "attendance", label: "Мої групи (Відвідування)" },
              { id: "schedule", label: "Графік" },
            ].map((t) => <button key={t.id} onClick={() => setTab(t.id)} style={{padding: "12px 24px", background: tab===t.id ? theme.primary : "transparent", border: "none", borderRadius: 100, color: tab===t.id ? "#fff" : theme.textMuted, fontSize: 14, fontWeight: 600, cursor:"pointer"}}>{t.label}</button>)
          )}
        </div>
      </nav>

      <main className={tab === "messages" ? "app-main-messages" : undefined} style={{maxWidth:1200, margin:"0 auto", padding:"0 24px"}}>
        {isAdmin && tab==="dashboard" && (
          <DashboardTab
            subs={subs}
            students={students}
            studentGrps={studentGrps}
            groups={activeGroups}
            directionsList={directionsList}
            attn={attn}
            waitlist={waitlist}
            trialBookings={trialBookings}
            trainers={trainers}
            trainerGroups={trainerGroups}
            cancelled={cancelled}
            roomBookings={roomBookings}
            groupLessonOverrides={groupLessonOverrides}
            isAdmin={!!isAdmin}
            aiInsightsContext={{
              proAnalytics,
              paymentAnomalies,
              analytics,
            }}
          />
        )}
        {tab === "schedule" && (isAdmin || user) && (
          <ScheduleTab
            groups={isAdmin ? activeGroups : activeScheduleGroups}
            directionsList={directionsList}
            trainers={trainers}
            cancelled={scheduleCancelled}
            roomBookings={roomBookings}
            groupLessonOverrides={groupLessonOverrides}
            trainingLessonPlans={trainingLessonPlans}
            currentUser={user}
            isAdmin={isAdmin}
            allowBookingMutations={!isAdmin}
            onAddBooking={addRoomBookingAction}
            onDeleteBooking={deleteRoomBookingAction}
            onUpdateBooking={updateRoomBookingAction}
            onUpdateGroupSchedule={updateGroupScheduleAction}
            onAddGroupLessonOverride={addGroupLessonOverrideAction}
            onUpdateGroupLessonOverride={updateGroupLessonOverrideAction}
            onDeleteGroupLessonOverride={deleteGroupLessonOverrideAction}
            onUpsertTrainingLessonPlan={upsertTrainingLessonPlanAction}
            scheduleScale={safeScheduleScale}
          />
        )}

        {tab === "attendance" && <AttendanceTab groups={visibleGroups} trainers={trainers} currentUser={user} trainingLessonPlans={trainingLessonPlans} trainingLessonReports={trainingLessonReports} onUpsertTrainingLessonReport={upsertTrainingLessonReportAction} rawSubs={subs} subs={subsExt} setSubs={setSubs} isAdmin={isAdmin} fetchSubscriptions={isAdmin ? () => db.fetchSubs({ includeFinancial: true }) : db.fetchMyAttendanceSubscriptions} attn={attn} setAttn={setAttn} studentMap={studentMap} students={students} setStudents={setStudents} studentGrps={studentGrps} setStudentGrps={setStudentGrps} cancelled={cancelled} scheduleCancelled={scheduleCancelled} setCancelled={setCancelled} customOrders={customOrders} setCustomOrders={setCustomOrders} warnedStudents={warnedStudents} setWarnedStudents={setWarnedStudents} {...(isAdmin ? { onActionAddSub: (stId, gId) => { setPrefillSub({studentId: stId, groupId: gId}); setModal("addSub"); }, onActionEditSub: (sub) => { setEditItem(sub); setModal("editSub"); } } : {})} onActionEditStudent={(student) => { setEditItem(student); setModal("editStudent"); }} onActionMessageStudent={(student) => { if (!isAdmin) { alert("Доступ до повідомлень лише для адміністратора"); return; } setSelectedMessageStudentId(student.id); setTab("messages"); }} trialBookings={trialBookings} setTrialBookings={setTrialBookings} attendanceScale={safeAttendanceScale} />}
        {isAdmin && tab==="messages" && (
          <MessagesTab
            students={students}
            trainers={trainers}
            groups={groups}
            waitlist={waitlist}
            studentGrps={studentGrps}
            subs={subsExt}
            attn={attn}
            selectedStudentId={selectedMessageStudentId}
            onSelectStudent={setSelectedMessageStudentId}
            onOpenTrainerNotifications={() => {
              setTab("admin");
              setAdminTab("analytics");
              setTrainersSubtab("notifications");
            }}
          />
        )}
        {isAdmin && tab==="admin" && (
          <div className="admin-mobile-shell" style={{ display: "grid", gap: 12, minWidth: 0 }}>
            <style>{`
              .admin-mobile-select-nav, .admin-mobile-header, .admin-mobile-filter-toggle, .admin-mobile-reset { display: none; }
              .admin-mobile-shell, .admin-mobile-shell * { box-sizing: border-box; }
              @media (max-width: 768px) {
                main { overflow-x: hidden !important; }
                .admin-mobile-shell { width: 100%; max-width: 100%; overflow-x: hidden; padding-bottom: calc(20px + env(safe-area-inset-bottom, 0px)); }
                .admin-desktop-tabs { display: none !important; }
                .admin-mobile-select-nav { display: grid; gap: 6px; position: sticky; top: 0; z-index: 35; background: ${theme.bg}; padding: 6px 0 8px; }
                .admin-mobile-select-nav select { width: 100%; min-height: 44px; border-radius: 14px; border: 1px solid ${theme.border}; background: ${theme.card}; color: ${theme.textMain}; padding: 0 12px; font-weight: 900; font-size: 14px; }
                .admin-mobile-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 2px 0 4px; }
                .admin-mobile-header h2 { margin: 0; color: ${theme.secondary}; font-size: 21px; line-height: 1.12; letter-spacing: -0.3px; }
                .admin-mobile-header p { margin: 2px 0 0; color: ${theme.textMuted}; font-size: 12px; }
                .admin-mobile-filter-toggle, .admin-mobile-reset { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; border-radius: 14px; border: 1px solid ${theme.border}; background: ${theme.card}; color: ${theme.textMain}; padding: 0 12px; font-weight: 800; position: relative; }
                .admin-mobile-badge { position: absolute; top: -7px; right: -6px; min-width: 20px; height: 20px; border-radius: 999px; background: ${theme.danger}; color: #fff; border: 2px solid ${theme.card}; font-size: 11px; display: inline-flex; align-items: center; justify-content: center; }
                .admin-group-filter-card, .admin-finance-filter-card { display: none !important; }
                .admin-group-filter-card.is-open, .admin-finance-filter-card.is-open { display: grid !important; position: fixed; inset: auto 8px calc(8px + env(safe-area-inset-bottom, 0px)) 8px; z-index: 950; max-height: min(78dvh, 680px); overflow: auto; padding: 14px !important; border-radius: 22px 22px 16px 16px !important; box-shadow: 0 24px 48px rgba(0,0,0,.24); }
                .admin-group-filter-row, .admin-finance-filter-row { display: grid !important; grid-template-columns: 1fr !important; gap: 8px !important; min-width: 0 !important; }
                .admin-group-filter-row input, .admin-group-filter-row select, .admin-finance-filter-row select { width: 100% !important; min-width: 0 !important; height: 44px !important; }
                .admin-group-card { padding: 12px !important; border-radius: 16px !important; }
                .admin-group-card > div:first-child { grid-template-columns: 1fr !important; gap: 8px !important; }
                .admin-group-main { min-width: 0 !important; flex-basis: 100% !important; gap: 8px !important; }
                .admin-group-title { font-size: 16px !important; overflow-wrap: anywhere; }
                .admin-group-actions { width: 100%; display: grid !important; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px !important; }
                .admin-group-actions button, .admin-finance-card button { min-height: 44px; padding: 8px !important; font-size: 12px !important; }
                .admin-finance-summary { grid-template-columns: repeat(2, minmax(0,1fr)) !important; gap: 7px !important; margin-bottom: 8px !important; }
                .admin-finance-summary > div { padding: 9px 10px !important; border-radius: 14px !important; min-width: 0; }
                .admin-finance-summary div[style*="font-size: 13"] { font-size: 10px !important; letter-spacing: .25px !important; line-height: 1.15 !important; }
                .admin-finance-summary div[style*="font-size: 42"] { font-size: 21px !important; margin-top: 3px !important; line-height: 1.1 !important; overflow-wrap: anywhere; }
                .admin-finance-list { gap: 8px !important; }
                .admin-finance-card { padding: 10px !important; border-radius: 15px !important; gap: 9px !important; }
                .admin-finance-card-header, .admin-finance-card-footer { display: grid !important; grid-template-columns: 1fr !important; text-align: left !important; gap: 8px !important; }
                .admin-finance-title-row { gap: 6px !important; margin-bottom: 3px !important; }
                .admin-finance-title { font-size: 15px !important; line-height: 1.15 !important; overflow-wrap: anywhere; }
                .admin-finance-direction-badge { font-size: 10px !important; padding: 3px 7px !important; }
                .admin-finance-meta { font-size: 11px !important; line-height: 1.2 !important; }
                .admin-finance-total { text-align: left !important; }
                .admin-finance-total-label { font-size: 10px !important; }
                .admin-finance-total-value { font-size: 22px !important; margin-top: 2px !important; }
                .admin-finance-progress { height: 6px !important; }
                .admin-finance-split { display: grid !important; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px !important; width: 100%; }
                .admin-finance-split-card { padding: 8px !important; border: 1px solid ${theme.border}; border-radius: 12px; background: ${theme.input}; min-width: 0; }
                .admin-finance-split-card div:last-child { font-size: 16px !important; margin-top: 3px !important; }
              }
            `}</style>
            <div className="admin-mobile-select-nav">
              <select value={`${adminTab}:${adminTab === "analytics" ? trainersSubtab : adminTab}`} onChange={(e) => { const [main, sub] = e.target.value.split(":"); setAdminTab(main); if (main === "analytics") setTrainersSubtab(sub); }}>
                <option value="analytics:trainers">Аналітика · Тренери</option>
                <option value="analytics:groups">Аналітика · Групи</option>
                <option value="analytics:notifications">Аналітика · Автоматизація</option>
                <option value="finance:finance">Фінанси</option>
                <option value="pro:pro">Про-аналітика</option>
              </select>
            </div>
            <div className="admin-desktop-tabs" style={{ overflowX: "auto", maxWidth: "100%" }}>
              <div style={{ display: "inline-flex", background: theme.card, borderRadius: 100, padding: 6, minWidth: "max-content" }}>
              <button type="button" onClick={() => setAdminTab("analytics")} style={{ padding: "10px 18px", border: "none", borderRadius: 100, background: adminTab === "analytics" ? theme.primary : "transparent", color: adminTab === "analytics" ? "#fff" : theme.textMuted, cursor: "pointer", fontWeight: 700 }}>Аналітика</button>
              <button type="button" onClick={() => setAdminTab("finance")} style={{ padding: "10px 18px", border: "none", borderRadius: 100, background: adminTab === "finance" ? theme.primary : "transparent", color: adminTab === "finance" ? "#fff" : theme.textMuted, cursor: "pointer", fontWeight: 700 }}>Фінанси</button>
                            <button type="button" onClick={() => setAdminTab("pro")} style={{ padding: "10px 18px", border: "none", borderRadius: 100, background: adminTab === "pro" ? theme.primary : "transparent", color: adminTab === "pro" ? "#fff" : theme.textMuted, cursor: "pointer", fontWeight: 700 }}>Про-аналітика</button>
              </div>
            </div>
            {adminTab === "analytics" && (
            <div className="admin-desktop-tabs" style={{ overflowX: "auto", maxWidth: "100%" }}>
              <div style={{ display: "inline-flex", background: theme.card, borderRadius: 100, padding: 6, minWidth: "max-content" }}>
              <button type="button" onClick={() => setTrainersSubtab("trainers")} style={{ padding: "10px 18px", border: "none", borderRadius: 100, background: trainersSubtab === "trainers" ? theme.primary : "transparent", color: trainersSubtab === "trainers" ? "#fff" : theme.textMuted, cursor: "pointer", fontWeight: 700 }}>Тренери</button>
              <button type="button" onClick={() => setTrainersSubtab("groups")} style={{ padding: "10px 18px", border: "none", borderRadius: 100, background: trainersSubtab === "groups" ? theme.primary : "transparent", color: trainersSubtab === "groups" ? "#fff" : theme.textMuted, cursor: "pointer", fontWeight: 700 }}>Групи</button>
              <button type="button" onClick={() => setTrainersSubtab("notifications")} style={{ padding: "10px 18px", border: "none", borderRadius: 100, background: trainersSubtab === "notifications" ? theme.primary : "transparent", color: trainersSubtab === "notifications" ? "#fff" : theme.textMuted, cursor: "pointer", fontWeight: 700 }}>Автоматизація</button>
              </div>
            </div>
            )}

            {adminTab === "analytics" && (trainersSubtab === "trainers" ? (
              <TrainersTab
                trainers={trainers}
                setTrainers={setTrainers}
                trainerGroups={trainerGroups}
                setTrainerGroups={setTrainerGroups}
                groups={groups}
                directions={directionsList}
                students={students}
                studentGrps={studentGrps}
                subs={subsExt}
                attn={attn}
                analyticsFoundation={analytics.foundation}
                cancelled={cancelled}
                themeMode={themeMode}
                onTrainerDeleted={(deletedId) => {
                  if (String(filterTrainer) === String(deletedId)) setFilterTrainer("");
                }}
              />
            ) : trainersSubtab === "groups" ? (
              <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
                <div className="admin-mobile-header"><div><h2>Групи</h2><p>Керування групами та привʼязками тренерів</p></div><button type="button" className="admin-mobile-filter-toggle" onClick={() => setAdminGroupFiltersOpen(true)}>Фільтри{[adminGroupSearch, adminGroupArchiveFilter !== "active", adminGroupTrainerFilter !== "all"].filter(Boolean).length ? <span className="admin-mobile-badge">{[adminGroupSearch, adminGroupArchiveFilter !== "active", adminGroupTrainerFilter !== "all"].filter(Boolean).length}</span> : null}</button></div>
                {adminGroupFiltersOpen && <button type="button" aria-label="Закрити фільтри" onClick={() => setAdminGroupFiltersOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 940, background: "rgba(31,31,31,.38)", border: "none" }} />}
                <div className={`admin-group-filter-card ${adminGroupFiltersOpen ? "is-open" : ""}`} style={{ ...cardSt, padding: 14, display: "grid", gap: 10 }}>
                  <div className="admin-group-filter-row" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <input style={{ ...inputSt, minWidth: 220, flex: "1 1 260px" }} placeholder="Пошук: назва, напрямок, тренер, розклад" value={adminGroupSearch} onChange={(e) => setAdminGroupSearch(e.target.value)} />
                    <select style={{ ...inputSt, width: 180 }} value={adminGroupArchiveFilter} onChange={(e) => setAdminGroupArchiveFilter(e.target.value)}>
                      <option value="active">Активні</option>
                      <option value="archived">Архівні</option>
                      <option value="all">Усі</option>
                    </select>
                    <select style={{ ...inputSt, width: 220 }} value={adminGroupTrainerFilter} onChange={(e) => setAdminGroupTrainerFilter(e.target.value)}>
                      <option value="all">Усі тренери</option>
                      {trainers.map((t) => <option key={t.id} value={t.id}>{t.name || [t.firstName, t.lastName].filter(Boolean).join(" ") || t.id}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}><div style={{ fontSize: 12, color: theme.textMuted }}>Показано {filteredAdminGroupRows.length} з {groups.length}. Тренер визначається через trainer_groups, а для старих груп — fallback на trainerId/trainer_id/coachId/coach_id/trainer/trainer_id_fk.</div><button type="button" className="admin-mobile-reset" onClick={() => { setAdminGroupSearch(""); setAdminGroupArchiveFilter("active"); setAdminGroupTrainerFilter("all"); }}>Скинути</button></div>
                </div>
                <details style={{ ...cardSt, padding: 14, border: `1px solid ${theme.border}` }}>
                  <summary style={{ cursor: "pointer", fontWeight: 900, color: theme.textMain }}>Історія обʼєднань ({groupMergeOperations.length})</summary>
                  <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                    {!groupMergeOperations.length && <div style={{ color: theme.textMuted, fontSize: 13 }}>Історія обʼєднань порожня. Майбутні merge operations будуть збережені тут після застосування SQL.</div>}
                    {groupMergeOperations.map((op) => {
                      const sourceGroup = groups.find((group) => String(group.id) === String(op.sourceGroupId));
                      const targetGroup = groups.find((group) => String(group.id) === String(op.targetGroupId));
                      const status = op.undoneAt ? "undone" : (op.status || "completed");
                      const isUndoAllowed = status === "completed" && !groupMergeBusy;
                      return (
                        <div key={op.id} style={{ display: "grid", gap: 8, padding: 12, borderRadius: 14, border: `1px solid ${theme.border}`, background: theme.bg }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                            <div style={{ fontWeight: 900, color: theme.textMain }}>{getGroupLabel(sourceGroup || { id: op.sourceGroupId })} → {getGroupLabel(targetGroup || { id: op.targetGroupId })}</div>
                            <span style={{ borderRadius: 999, padding: "4px 9px", fontSize: 12, fontWeight: 800, color: status === "failed" ? theme.danger : status === "completed" ? theme.success : theme.textMuted, border: `1px solid ${theme.border}` }}>{status === "completed" ? "completed" : status}</span>
                          </div>
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, color: theme.textMuted }}>
                            <span>Дата: {op.createdAt ? new Date(op.createdAt).toLocaleString("uk-UA") : "—"}</span>
                            <span>Учениць: {(op.selectedStudentIds || []).length}</span>
                            <span>Абонементів: {(op.movedSubscriptionIds || []).length}</span>
                            {op.completedAt && <span>Завершено: {new Date(op.completedAt).toLocaleString("uk-UA")}</span>}
                            {op.failedAt && <span style={{ color: theme.danger }}>Помилка: {op.errorMessage || "—"}</span>}
                            {op.undoneAt && <span>Скасовано: {new Date(op.undoneAt).toLocaleString("uk-UA")}</span>}
                          </div>
                          <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <button type="button" style={{ ...btnS, opacity: isUndoAllowed ? 1 : 0.55, cursor: isUndoAllowed ? "pointer" : "not-allowed" }} disabled={!isUndoAllowed} onClick={() => undoGroupMerge(op)}>{status === "undone" ? "Обʼєднання скасовано" : status === "completed" ? "Скасувати обʼєднання" : "Скасування недоступне"}</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
                {groupedAdminGroupSections.map((section) => (
                  <section key={section.key} style={{ display: "grid", gap: 10, padding: 12, borderRadius: 18, background: theme.cardSoft || theme.bg, border: `1px solid ${theme.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 999, background: section.color, flex: "0 0 auto" }} />
                        <h3 style={{ margin: 0, fontSize: 16, color: theme.textMain }}>{section.directionName}</h3>
                      </div>
                      <span style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "5px 10px", fontSize: 12, fontWeight: 800, background: theme.bg, border: `1px solid ${theme.border}`, color: theme.textMuted }}>
                        {section.rows.length} {section.rows.length === 1 ? "група" : "груп"}
                      </span>
                    </div>
                    <div style={{ display: "grid", gap: 10 }}>
                      {section.rows.map(({ group: g, archiveMeta, trainerInfo }) => {
                        const dir = dirMap[g.directionId];
                        const studentsCount = studentGrps.filter((sg) => String(sg.groupId) === String(g.id)).length;
                        const scheduleText = formatGroupSchedule(g.schedule) || "—";
                        const badgeStyle = { display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "5px 9px", fontSize: 12, fontWeight: 700, background: theme.bg, border: `1px solid ${theme.border}`, color: theme.textMuted };
                        return (
                          <div key={g.id} className="admin-group-card" style={{ ...cardSt, padding: 12, display: "grid", gap: 10, border: `1px solid ${archiveMeta.isArchived ? theme.danger : theme.border}` }}>
                            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, alignItems: "start" }}>
                              <div className="admin-group-main" style={{ display: "grid", gap: 3, minWidth: 0 }}>
                                <div className="admin-group-title" style={{ fontWeight: 900, color: theme.textMain, fontSize: 17, lineHeight: 1.2 }}>{g.name}</div>
                                <div style={{ fontSize: 11, color: theme.textMuted }}>ID: {g.id}</div>
                              </div>
                              <div className="admin-group-actions" style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                <button type="button" style={{ ...btnP, minHeight: 34, padding: "7px 10px", fontSize: 12 }} onClick={() => openEditGroup(g)}>Редагувати</button>
                                <button type="button" style={{ ...btnS, minHeight: 34, padding: "7px 10px", fontSize: 12, opacity: archiveMeta.mode ? 1 : 0.5, cursor: archiveMeta.mode ? "pointer" : "not-allowed" }} disabled={!archiveMeta.mode} title={archiveMeta.mode ? "" : "Потрібне поле is_active, active або archived_at"} onClick={() => toggleGroupArchive(g)}>{archiveMeta.isArchived ? "Відновити" : "Архівувати"}</button>
                                <button type="button" style={{ ...btnS, minHeight: 34, padding: "7px 10px", fontSize: 12, opacity: archiveMeta.isArchived ? 0.55 : 1, cursor: archiveMeta.isArchived ? "not-allowed" : "pointer" }} disabled={archiveMeta.isArchived} title={archiveMeta.isArchived ? "Архівні групи не можна обʼєднувати" : "Обʼєднати з іншою активною групою"} onClick={() => openGroupMerge(g)}>Обʼєднати</button>
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                              <span style={{ ...badgeStyle, color: archiveMeta.isArchived ? theme.danger : theme.success }}>{archiveMeta.isArchived ? "Архівна" : "Активна"}</span>
                              {getGroupLevelLabel(g.publicLevel) && <span style={badgeStyle}>{getGroupLevelLabel(g.publicLevel)}</span>}
                              {getGroupAgeCategoryLabel(g.ageCategory) && <span style={badgeStyle}>{getGroupAgeCategoryLabel(g.ageCategory)}</span>}
                              <span style={badgeStyle}>👥 {studentsCount}</span>
                              <span style={badgeStyle}>🕒 {scheduleText}</span>
                              <span style={badgeStyle}>Тренер: {trainerInfo.trainerName || trainerInfo.trainerId || "—"}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", fontSize: 11, color: theme.textMuted }}>
                              <span>{dir?.name || g.directionId || "—"}</span>
                              <span>Відсоток тренера: {g.trainerPct ?? 0}%</span>
                            </div>
                            {!!g.archived_at && (
                              <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 8, borderTop: `1px solid ${theme.border}` }}>
                                <button type="button" style={{ ...btnS, color: theme.danger, borderColor: theme.danger, minHeight: 34, padding: "7px 10px", fontSize: 12 }} onClick={() => openPermanentGroupDelete(g)}>Видалити назавжди</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
                {!filteredAdminGroupRows.length && <div style={{ ...cardSt, padding: 18, color: theme.textMuted }}>Груп за вибраними фільтрами не знайдено.</div>}
              </div>
            ) : (
              <TrainersNotificationsTab
                groups={groups}
                trainers={trainers}
                trainerGroups={trainerGroups}
                students={students}
                studentGrps={studentGrps}
                subs={subsExt}
                attn={attn}
                cancelled={cancelled}
                currentUser={user}
              />
            ))}
            
            {adminTab === "pro" && <ProAnalyticsTab proAnalytics={proAnalytics} />}
          </div>
        )}
        
        {isAdmin && tab==="students" && (
          <StudentsCrmTab
            theme={theme}
            btnP={btnP}
            btnS={btnS}
            inputSt={inputSt}
            GroupSelect={GroupSelect}
            Badge={Badge}
            groups={activeGroups}
            directionsList={directionsList}
            studentGrps={studentGrps}
            setStudentGrps={setStudentGrps}
            setStudents={setStudents}
            attn={attn}
            subsExt={subsExt}
            waitlist={waitlist}
            setWaitlist={setWaitlist}
            trialBookings={trialBookings}
            setTrialBookings={setTrialBookings}
            onCancelTrialBooking={cancelTrialBookingAction}
            studentMap={studentMap}
            groupMap={groupMap}
            dirMap={dirMap}
            searchQ={searchQ}
            setSearchQ={setSearchQ}
            stFilterDir={stFilterDir}
            setStFilterDir={setStFilterDir}
            stFilterGroup={stFilterGroup}
            setStFilterGroup={setStFilterGroup}
            studentsByDirection={studentsByDirection}
            expandedDirs={expandedDirs}
            setExpandedDirs={setExpandedDirs}
            restoreGroupByStudent={restoreGroupByStudent}
            setRestoreGroupByStudent={setRestoreGroupByStudent}
            restoreStudentToGroup={restoreStudentToGroup}
            setModal={setModal}
            setEditItem={setEditItem}
            deleteStudentAction={deleteStudentAction}
            getDisplayName={getDisplayName}
          />
        )}

        {/* === ОПЛАТИ === */}
        {isAdmin && tab==="subs" && <div className="payments-tab">
          <style>{`
            .payments-mobile-header, .payments-summary-grid, .payments-mobile-toolbar, .payments-mobile-list { display: none; }
            .payments-filter-shell select, .payments-filter-shell input { max-width: 100%; }
            .payments-card-menu { display: flex; gap: 8px; justify-content: flex-end; align-items: center; }
            .payment-card { display: none; }
            @media (max-width: 768px) {
              main { padding-left: 10px !important; padding-right: 10px !important; overflow-x: hidden !important; }
              .payments-tab { width: 100%; max-width: 100%; overflow-x: hidden; padding-bottom: calc(18px + env(safe-area-inset-bottom, 0px)); }
              .payments-mobile-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
              .payments-mobile-title { min-width: 0; }
              .payments-mobile-title h2 { margin: 0; font-size: 22px; line-height: 1.12; color: ${theme.secondary}; font-weight: 900; letter-spacing: -0.5px; }
              .payments-mobile-title div { margin-top: 2px; font-size: 12px; color: ${theme.textMuted}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
              .payments-add-btn { min-height: 44px !important; min-width: 44px; padding: 0 14px !important; border-radius: 14px !important; flex: 0 0 auto; }
              .payments-summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-bottom: 10px; }
              .payments-summary-card { border-radius: 16px; padding: 10px 11px; background: ${theme.card}; border: 1px solid ${theme.border}; box-shadow: 0 6px 18px rgba(168, 177, 206, 0.10); min-width: 0; }
              .payments-summary-label { font-size: 10px; color: ${theme.textMuted}; font-weight: 800; text-transform: uppercase; letter-spacing: .35px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
              .payments-summary-value { margin-top: 3px; font-size: 18px; line-height: 1.15; color: ${theme.textMain}; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
              .payments-mobile-toolbar { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; margin-bottom: 10px; }
              .payments-mobile-search { min-width: 0 !important; width: 100% !important; height: 44px !important; padding: 0 12px !important; border-radius: 14px !important; }
              .payments-filter-button, .payments-clear-button { min-height: 44px !important; padding: 0 12px !important; border-radius: 14px !important; position: relative; white-space: nowrap; }
              .payments-filter-badge { position: absolute; top: -6px; right: -5px; min-width: 19px; height: 19px; padding: 0 5px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; background: ${theme.danger}; color: #fff; font-size: 11px; font-weight: 900; border: 2px solid ${theme.card}; }
              .payments-desktop-filters, .payments-desktop-table, .payments-desktop-table-inner { display: none !important; }
              .payments-filter-shell { display: ${paymentsFiltersOpen ? "block" : "none"}; position: fixed; inset: 0; z-index: 900; background: rgba(31,31,31,.38); padding: 0 8px calc(8px + env(safe-area-inset-bottom, 0px)); }
              .payments-filter-panel { position: absolute; left: 8px; right: 8px; bottom: calc(8px + env(safe-area-inset-bottom, 0px)); max-height: min(82dvh, 720px); overflow: auto; -webkit-overflow-scrolling: touch; background: ${theme.card}; border: 1px solid ${theme.border}; border-radius: 22px 22px 16px 16px; padding: 14px; box-shadow: 0 24px 48px rgba(0,0,0,.22); }
              .payments-filter-panel-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 10px; }
              .payments-filter-panel-head strong { font-size: 17px; color: ${theme.textMain}; }
              .payments-filter-grid { display: grid; grid-template-columns: 1fr; gap: 8px; }
              .payments-filter-grid select, .payments-filter-grid input { width: 100% !important; min-width: 0 !important; height: 44px !important; border-radius: 14px !important; }
              .payments-filter-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
              .payments-filter-actions button { min-height: 44px !important; width: 100%; }
              .payments-mobile-list { display: flex; flex-direction: column; gap: 10px; }
              .payments-dir-card { background: ${theme.card}; border: 1px solid ${theme.border}; border-radius: 18px; overflow: hidden; box-shadow: 0 8px 22px rgba(168,177,206,.11); }
              .payments-dir-toggle { padding: 12px 13px !important; min-height: 44px; }
              .payments-dir-toggle-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px !important; }
              .payments-dir-body { padding: 0 10px 10px; display: grid; gap: 8px; }
              .payment-card { width: 100%; border: 1px solid ${theme.border}; background: ${theme.bg}; border-radius: 16px; padding: 11px; text-align: left; color: ${theme.textMain}; display: grid; gap: 7px; overflow: hidden; }
              .payment-card-top, .payment-card-meta, .payment-card-bottom { display: flex; gap: 8px; align-items: center; justify-content: space-between; min-width: 0; }
              .payment-student { font-size: 15px; font-weight: 900; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
              .payment-amount { flex: 0 0 auto; font-size: 15px; font-weight: 900; color: ${theme.success}; white-space: nowrap; }
              .payment-muted-row { min-width: 0; display: flex; gap: 6px; flex-wrap: wrap; color: ${theme.textMuted}; font-size: 11px; font-weight: 650; line-height: 1.35; }
              .payment-muted-row span { min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
              .payments-card-menu button { min-width: 38px; min-height: 38px; margin: 0 !important; border-radius: 12px; background: ${theme.card} !important; }
              .payments-empty { padding: 28px 14px !important; border-radius: 18px; background: ${theme.card}; border: 1px solid ${theme.border}; }
              .payments-issues { padding: 12px !important; border-radius: 18px !important; margin-bottom: 10px !important; }
            }
          `}</style>

          <div className="payments-mobile-header">
            <div className="payments-mobile-title"><h2>Оплати</h2><div>{paymentsSummary.count} записів · {paymentsSummary.paidTotal.toLocaleString()} ₴ оплачено</div></div>
            <button type="button" className="payments-add-btn" style={btnP} onClick={()=>setModal("addSub")}>+ Оплата</button>
          </div>

          <div className="payments-summary-grid">
            <div className="payments-summary-card"><div className="payments-summary-label">Оплачено</div><div className="payments-summary-value" style={{color: theme.success}}>{paymentsSummary.paidTotal.toLocaleString()} ₴</div></div>
            <div className="payments-summary-card"><div className="payments-summary-label">Борги</div><div className="payments-summary-value" style={{color: theme.danger}}>{paymentsSummary.unpaidTotal.toLocaleString()} ₴</div></div>
            <div className="payments-summary-card"><div className="payments-summary-label">Записів</div><div className="payments-summary-value">{paymentsSummary.count}</div></div>
            <div className="payments-summary-card"><div className="payments-summary-label">Активні</div><div className="payments-summary-value">{paymentsSummary.activeCount}</div></div>
          </div>

          <div className="payments-mobile-toolbar">
            <input className="payments-mobile-search" style={inputSt} placeholder="Пошук учениці..." value={searchQ} onChange={e=>setSearchQ(e.target.value)}/>
            <button type="button" className="payments-clear-button" style={btnS} onClick={()=>setSearchQ("")} disabled={!searchQ}>Очистити</button>
            <button type="button" className="payments-filter-button" style={btnS} onClick={()=>setPaymentsFiltersOpen(true)}>Фільтри{activePaymentsFilterCount > 0 && <span className="payments-filter-badge">{activePaymentsFilterCount}</span>}</button>
          </div>

          <div className="payments-filter-shell" onClick={()=>setPaymentsFiltersOpen(false)}>
            <div className="payments-filter-panel" onClick={(e)=>e.stopPropagation()}>
              <div className="payments-filter-panel-head"><strong>Фільтри оплат</strong><button type="button" style={{...btnS, minHeight: 38}} onClick={()=>setPaymentsFiltersOpen(false)}>✕</button></div>
              <div className="payments-filter-grid">
                <select style={inputSt} value={filterPlanType} onChange={e=>setFilterPlanType(e.target.value)}><option value="all">Усі типи оплат</option><option value="4pack">4 абонемент</option><option value="8pack">8 абонемент</option><option value="12pack">12 абонемент</option><option value="single">Разове</option><option value="trial">Пробне</option></select>
                <select style={inputSt} value={filterPaid} onChange={e=>setFilterPaid(e.target.value)}><option value="all">Оплата: усі</option><option value="paid">Оплачені</option><option value="unpaid">Неоплачені</option></select>
                <select style={inputSt} value={filterDir} onChange={e=>{setFilterDir(e.target.value);setFilterGroup("all")}}><option value="all">Усі напрямки</option>{directionsList.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>
                <GroupSelect groups={groups} value={filterGroup} onChange={setFilterGroup} filterDir={filterDir} allowAll={true} />
                <select style={inputSt} value={filterTrainer} onChange={e=>setFilterTrainer(e.target.value)}><option value="all">Усі тренери</option>{trainers.map((t)=><option key={t.id} value={t.id}>{t.name || [t.firstName,t.lastName].filter(Boolean).join(" ") || "Без імені"}</option>)}</select>
                <select style={inputSt} value={filterPayMethod} onChange={e=>setFilterPayMethod(e.target.value)}><option value="all">Усі методи оплати</option><option value="card">Картка</option><option value="cash">Готівка</option><option value="transfer">Переказ</option></select>
                <select style={inputSt} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}><option value="all">Усі статуси</option><option value="active">Активні</option><option value="warning">Закінчуються</option><option value="expired">Протерміновані</option><option value="completed">Завершені</option></select>
                <select style={inputSt} value={filterDatePreset} onChange={e=>setFilterDatePreset(e.target.value)}><option value="custom">Власний діапазон</option><option value="today">Сьогодні</option><option value="this_week">Цей тиждень</option><option value="last_week">Минулий тиждень</option><option value="this_month">Цей місяць</option><option value="last_month">Минулий місяць</option></select>
                <input type="date" style={inputSt} value={filterFromDate} onChange={e=>{setFilterDatePreset("custom");setFilterFromDate(e.target.value)}} />
                <input type="date" style={inputSt} value={filterToDate} onChange={e=>{setFilterDatePreset("custom");setFilterToDate(e.target.value)}} />
                <select style={inputSt} value={filterAudit} onChange={e=>setFilterAudit(e.target.value)}><option value="all">Усі записи</option><option value="only_issues">Проблемні записи</option></select>
              </div>
              <div className="payments-filter-actions"><button type="button" style={btnS} onClick={resetPaymentsFilters}>Скинути</button><button type="button" style={btnP} onClick={()=>setPaymentsFiltersOpen(false)}>Показати</button></div>
            </div>
          </div>

          <div className="payments-desktop-filters" style={{display:"flex",gap:12,marginBottom:24,flexWrap:"wrap", background: theme.card, padding: 16, borderRadius: 24, boxShadow: "0 10px 30px rgba(168, 177, 206, 0.15)"}}>
            <input style={{...inputSt,width:"auto",minWidth:250, flexGrow: 1}} placeholder="Пошук учениці..." value={searchQ} onChange={e=>setSearchQ(e.target.value)}/>
            <select style={{...inputSt,width:"auto"}} value={filterPlanType} onChange={e=>setFilterPlanType(e.target.value)}><option value="all">Усі типи оплат</option><option value="4pack">4 абонемент</option><option value="8pack">8 абонемент</option><option value="12pack">12 абонемент</option><option value="single">Разове</option><option value="trial">Пробне</option></select>
            <select style={{...inputSt,width:"auto"}} value={filterPaid} onChange={e=>setFilterPaid(e.target.value)}><option value="all">Оплата: усі</option><option value="paid">Оплачені</option><option value="unpaid">Неоплачені</option></select>
            <select style={{...inputSt,width:"auto"}} value={filterDir} onChange={e=>{setFilterDir(e.target.value);setFilterGroup("all")}}><option value="all">Усі напрямки</option>{directionsList.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>
            <GroupSelect groups={groups} value={filterGroup} onChange={setFilterGroup} filterDir={filterDir} allowAll={true} />
            <select style={{...inputSt,width:"auto"}} value={filterTrainer} onChange={e=>setFilterTrainer(e.target.value)}><option value="all">Усі тренери</option>{trainers.map((t)=><option key={t.id} value={t.id}>{t.name || [t.firstName,t.lastName].filter(Boolean).join(" ") || "Без імені"}</option>)}</select>
            <select style={{...inputSt,width:"auto"}} value={filterPayMethod} onChange={e=>setFilterPayMethod(e.target.value)}><option value="all">Усі методи оплати</option><option value="card">Картка</option><option value="cash">Готівка</option><option value="transfer">Переказ</option></select>
            <select style={{...inputSt,width:"auto"}} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}><option value="all">Усі статуси</option><option value="active">Активні</option><option value="warning">Закінчуються</option><option value="expired">Протерміновані</option><option value="completed">Завершені</option></select>
            <select style={{...inputSt,width:"auto"}} value={filterDatePreset} onChange={e=>setFilterDatePreset(e.target.value)}><option value="custom">Власний діапазон</option><option value="today">Сьогодні</option><option value="this_week">Цей тиждень</option><option value="last_week">Минулий тиждень</option><option value="this_month">Цей місяць</option><option value="last_month">Минулий місяць</option></select>
            <input type="date" style={{...inputSt,width:"auto"}} value={filterFromDate} onChange={e=>{setFilterDatePreset("custom");setFilterFromDate(e.target.value)}} />
            <input type="date" style={{...inputSt,width:"auto"}} value={filterToDate} onChange={e=>{setFilterDatePreset("custom");setFilterToDate(e.target.value)}} />
            <select style={{...inputSt,width:"auto"}} value={filterAudit} onChange={e=>setFilterAudit(e.target.value)}><option value="all">Усі записи</option><option value="only_issues">Проблемні записи</option></select>
          </div>
          {filterAudit==="only_issues" && (
            <div className="payments-issues" style={{background: theme.card, borderRadius: 20, padding: 16, marginBottom: 20, border: `1px solid ${theme.border}`}}>
              <div style={{fontWeight: 700, color: theme.danger, marginBottom: 10}}>Проблемні записи ({paymentAnomalies.length})</div>
              <div style={{display:"grid", gap:8, color: theme.textMuted, fontSize: 13}}>
                {paymentAnomalies.map((a, i)=>{ const first = a.rows?.[0] || {}; const studentName = getDisplayName(studentMap[first.studentId]) || "—"; const groupName = groupMap[first.groupId]?.name || "—"; const dateLabel = String(first.activationDate || first.startDate || first.date || "").slice(0, 10) || "—"; const humanLabel = anomalyLabelMap[a.type] || "Інша аномалія"; const countLabel = (a.rows?.length || 0) > 1 ? ` · записів: ${a.rows.length}` : ""; return <div key={`${a.type}_${i}`}>• {humanLabel} · {studentName} · {groupName} · {dateLabel}{countLabel}</div>; })}
                {!paymentAnomalies.length && <div>Аномалій не знайдено.</div>}
              </div>
            </div>
          )}
          {filterAudit==="all" && (filteredSubs.length===0?<div className="payments-empty" style={{color:theme.textLight,padding:60,textAlign:"center", fontSize: 16, fontWeight: 600}}>{activePaymentsFilterCount || searchQ ? "Нічого не знайдено за вибраними фільтрами" : "Оплат поки немає"}</div>:
          <div className="payments-mobile-list" style={{display:"flex",flexDirection:"column",gap:20}}>
            {subsGroupedByDir.grouped.filter(d => filterDir === "all" || d.direction.id === filterDir).map(({direction, subs: dSubs}) => {
              const finalSubs = filterGroup !== "all" ? dSubs.filter(s => s.groupId === filterGroup) : dSubs;
              if (finalSubs.length === 0) return null;
              const isExpanded = expandedSubDirs[direction.id];
              return (
                <div key={direction.id} className="payments-dir-card" style={{background: theme.card, borderRadius: 28, overflow: 'hidden', border: `1px solid ${theme.border}`}}>
                  <button className="payments-dir-toggle" onClick={() => setExpandedSubDirs(p => ({...p, [direction.id]: !p[direction.id]}))} style={{width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'24px', background:'transparent', border:'none', cursor:'pointer', textAlign:'left'}}>
                    <div className="payments-dir-toggle-name" style={{fontSize:18,fontWeight:700,color:direction.color}}>{direction.name} <span style={{color:theme.textLight,fontSize:15,fontWeight:600, marginLeft: 8}}>({finalSubs.length})</span></div>
                    <div style={{color:theme.textLight, fontSize: 16}}>{isExpanded ? "▲" : "▼"}</div>
                  </button>
                  {isExpanded && <div className="payments-dir-body">
                    <div style={{overflowX: "auto", padding: "0 24px 24px 24px"}} className="payments-desktop-table-inner">
                      <table style={{width: "100%", borderCollapse: "collapse", fontSize: 14, textAlign: "left"}}><thead><tr style={{color: theme.textLight, textTransform: "uppercase", fontSize: 12, letterSpacing: 0.5}}><th style={{padding: "16px 14px", width: 40}}>#</th><th style={{padding: "16px 14px", fontWeight: 700}}>Учениця</th><th style={{padding: "16px 14px", fontWeight: 700}}>Група</th><th style={{padding: "16px 14px", fontWeight: 700}}>Абонемент</th><th style={{padding: "16px 14px", fontWeight: 700}}>Заняття</th><th style={{padding: "16px 14px", fontWeight: 700}}>Термін</th><th style={{padding: "16px 14px", fontWeight: 700}}>Статус</th><th style={{padding: "16px 14px", fontWeight: 700, textAlign: "right"}}>Дії</th></tr></thead><tbody>{finalSubs.map((sub, index) => { const st=studentMap[sub.studentId], gr=groupMap[sub.groupId], planLabel=PLAN_TYPES.find(p=>p.id===sub.planType)?.name||sub.planType; return <tr key={sub.id} style={{borderTop: `1px solid ${theme.bg}`}}><td style={{padding: "16px 14px", color: theme.textLight, fontWeight: 700}}>{index + 1}</td><td style={{padding: "16px 14px", color: theme.textMain, fontWeight: 600, whiteSpace:"nowrap"}}>{getDisplayName(st)}</td><td style={{padding: "16px 14px", whiteSpace:"nowrap"}}><span style={{color: theme.textMuted, fontWeight: 500}}>{gr?.name}</span></td><td style={{padding: "16px 14px", whiteSpace:"nowrap"}}><span style={{color: theme.textMuted, fontWeight: 500}}>{planLabel}</span></td><td style={{padding: "16px 14px", whiteSpace:"nowrap"}}><span style={{color: theme.textMain, fontWeight: 800, fontSize: 16}}>{sub.usedTrainings}</span><span style={{color: theme.textLight, fontWeight: 500}}> / {sub.totalTrainings}</span></td><td style={{padding: "16px 14px", whiteSpace:"nowrap"}}><span style={{color: theme.textMuted, fontWeight: 500, fontFamily:"monospace"}}>{fmt(sub.startDate)} — {fmt(sub.endDate)}</span></td><td style={{padding: "16px 14px", whiteSpace:"nowrap"}}><Badge color={STATUS_COLORS[sub.status]}>{STATUS_LABELS[sub.status]}</Badge>{!sub.paid&&<span style={{marginLeft: 8}}><Badge color={theme.danger}>Борг</Badge></span>}</td><td style={{padding: "16px 14px", textAlign: "right", whiteSpace:"nowrap"}}><button style={{background:"none",border:"none",cursor:"pointer",fontSize:18,marginRight:16}} onClick={()=>{setEditItem(sub);setModal("editSub")}}>✏️</button><button style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:theme.danger}} onClick={()=>deleteSubAction(sub.id)}>🗑</button></td></tr> })}</tbody></table>
                    </div>
                    {finalSubs.map((sub) => { const st=studentMap[sub.studentId], gr=groupMap[sub.groupId], planLabel=PLAN_TYPES.find(p=>p.id===sub.planType)?.name||sub.planType; return <button type="button" key={`card_${sub.id}`} className="payment-card" onClick={()=>{setEditItem(sub);setModal("editSub")}}>
                      <div className="payment-card-top"><div className="payment-student">{getDisplayName(st) || "—"}</div><div className="payment-amount">{Number(sub.amount || 0).toLocaleString()} ₴</div></div>
                      <div className="payment-muted-row"><span>{fmt(sub.activationDate || sub.startDate)}</span><span>· {gr?.name || "Без групи"}</span><span>· {planLabel}</span></div>
                      <div className="payment-muted-row"><span>{sub.payMethod === "card" ? "Картка" : sub.payMethod === "cash" ? "Готівка" : sub.payMethod === "transfer" ? "Переказ" : (sub.payMethod || "Метод не вказано")}</span><span>· {sub.usedTrainings}/{sub.totalTrainings} занять</span><span>· {fmt(sub.startDate)}—{fmt(sub.endDate)}</span></div>
                      <div className="payment-card-bottom"><div style={{display:"flex", gap:6, flexWrap:"wrap", minWidth:0}}><Badge color={STATUS_COLORS[sub.status]}>{STATUS_LABELS[sub.status]}</Badge>{!sub.paid&&<Badge color={theme.danger}>Борг</Badge>}</div><div className="payments-card-menu" onClick={(e)=>e.stopPropagation()}><button type="button" aria-label="Редагувати оплату" style={{border:"none",cursor:"pointer",fontSize:16,color:theme.textMain}} onClick={()=>{setEditItem(sub);setModal("editSub")}}>⋯</button><button type="button" aria-label="Видалити оплату" style={{border:"none",cursor:"pointer",fontSize:16,color:theme.danger}} onClick={()=>deleteSubAction(sub.id)}>🗑</button></div></div>
                    </button> })}
                  </div>}
                </div>
              );
            })}
          </div>)}
        </div>}

        {/* === СПОВІЩЕННЯ === */}
        {isAdmin && tab==="alerts" && <div>
          {alertsByGroup.length === 0 ? <div style={{textAlign:"center",padding:60,color:theme.textLight, fontSize: 16, fontWeight: 600}}>✨ Всі абонементи активні, боргів та сповіщень немає!</div>:
          <div>
            {alertsByGroup.map(g => (
              <div key={g.group.id} style={{marginBottom: 32}}>
                <div style={{display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${theme.border}`, paddingBottom: 12, marginBottom: 16}}>
                  <h3 style={{margin: 0, color: theme.secondary, fontSize: 18}}>{g.group.name}</h3>
                  <Badge color={g.dir?.color || theme.primary}>{g.dir?.name}</Badge>
                </div>
                <div style={{display: "flex", flexDirection: "column", gap: 10}}>
                  {g.items.map(n => {
                    const msg=getNotifMsg(null,n.student,n.group,n.direction);
                    const tgUser=n.student.telegram?.replace("@","");
                    const tgLink=tgUser?`https://t.me/${tgUser}?text=${encodeURIComponent(msg)}`:null;
                    
                    const isExpired = n.type === "expired";
                    const rowBg = isExpired ? `${theme.danger}10` : `${theme.warning}10`;
                    const borderColor = isExpired ? theme.danger : theme.warning;
                    const icon = isExpired ? "🔴" : "⏳";

                    return (
                      <div key={n.subId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: rowBg, borderLeft: `4px solid ${borderColor}`, borderRadius: 12, padding: "12px 16px", flexWrap: "wrap", gap: 12, opacity: n.notified ? 0.6 : 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontSize: 18 }}>{icon}</span>
                          <div>
                            <div style={{ fontWeight: 700, color: theme.textMain, fontSize: 15 }}>
                              {getDisplayName(n.student)}
                              {n.notified && <span style={{ marginLeft: 8, fontSize: 11, background: "#fff", padding: "2px 6px", borderRadius: 4, color: theme.textLight }}>✅ Відправлено</span>}
                            </div>
                            <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{n.student.phone || 'Немає номеру'}</div>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ fontWeight: 800, color: borderColor, fontSize: 14 }}>{n.message}</div>
                          {tgLink && <a href={tgLink} target="_blank" rel="noopener noreferrer" style={{ padding: "8px 12px", borderRadius: 8, background: "#fff", color: theme.primary, fontSize: 13, fontWeight: 700, textDecoration: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>💬 Написати</a>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>}
        </div>}

        {/* === ФІНАНСИ === */}
        {isAdmin && tab==="admin" && adminTab==="finance" && (() => {
          let finData = [...analytics.splits];
          if (finFilterDir !== "all") finData = finData.filter(s => s.group.directionId === finFilterDir);
          if (finFilterGroup !== "all") finData = finData.filter(s => s.group.id === finFilterGroup);
          finData.sort((a, b) => {
            let valA = finSortBy === "name" ? a.group.name : a[finSortBy];
            let valB = finSortBy === "name" ? b.group.name : b[finSortBy];
            if (valA < valB) return finSortOrder === "asc" ? -1 : 1;
            if (valA > valB) return finSortOrder === "asc" ? 1 : -1;
            return 0;
          });

          return (
            <div style={{ minWidth: 0 }}>
              <div className="admin-mobile-header"><div><h2>Фінанси</h2><p>Доходи, борги та деталізація по групах</p></div><button type="button" className="admin-mobile-filter-toggle" onClick={() => setAdminFinanceFiltersOpen(true)}>Фільтри{[finFilterDir !== "all", finFilterGroup !== "all", finSortBy !== "total"].filter(Boolean).length ? <span className="admin-mobile-badge">{[finFilterDir !== "all", finFilterGroup !== "all", finSortBy !== "total"].filter(Boolean).length}</span> : null}</button></div>
              <div className="admin-finance-summary" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:20,marginBottom:30}}>
                <div style={{...cardSt, background: theme.card}}><div style={{fontSize:13,color:theme.success,textTransform:"uppercase", letterSpacing: 0.5, fontWeight: 700}}>Загалом оплачено</div><div style={{fontSize:42,fontWeight:800,color:theme.success, marginTop: 8}}>{analytics.totalRev.toLocaleString()} ₴</div></div>
                <div style={{...cardSt, background: theme.card}}><div style={{fontSize:13,color:theme.danger,textTransform:"uppercase", letterSpacing: 0.5, fontWeight: 700}}>Борги учениць</div><div style={{fontSize:42,fontWeight:800,color:theme.danger, marginTop: 8}}>{analytics.unpaid.toLocaleString()} ₴</div></div>
              </div>
              {adminFinanceFiltersOpen && <button type="button" aria-label="Закрити фільтри" onClick={() => setAdminFinanceFiltersOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 940, background: "rgba(31,31,31,.38)", border: "none" }} />}
              <div className={`admin-finance-filter-card ${adminFinanceFiltersOpen ? "is-open" : ""}`} style={{display:"flex",gap:12,marginBottom:24,flexWrap:"wrap", background: theme.card, padding: 16, borderRadius: 24, boxShadow: "0 10px 30px rgba(168, 177, 206, 0.15)"}}>
                <div className="admin-finance-filter-row" style={{flex: 1, display: "flex", gap: 12, minWidth: 300, flexWrap: "wrap"}}>
                  <select style={{...inputSt, width: "auto"}} value={finFilterDir} onChange={e=>{setFinFilterDir(e.target.value); setFinFilterGroup("all");}}><option value="all">Усі напрямки</option>{directionsList.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>
                  <GroupSelect groups={groups} value={finFilterGroup} onChange={setFinFilterGroup} filterDir={finFilterDir} allowAll={true} />
                </div>
                <div style={{display: "flex", gap: 12, flexWrap: "wrap"}}>
                  <select style={{...inputSt, width: "auto"}} value={finSortBy} onChange={e=>setFinSortBy(e.target.value)}><option value="total">За доходом</option><option value="trainer">За ЗП тренера</option><option value="studio">За доходом студії</option><option value="name">За назвою</option></select>
                  <button style={{...btnS, padding: "0 16px", fontSize: 18}} onClick={()=>setFinSortOrder(p=>p==="desc"?"asc":"desc")}>{finSortOrder === "desc" ? "⬇" : "⬆"}</button>
                </div>
              </div>
              <h3 style={{color:theme.secondary,fontSize:20,marginBottom:20, fontWeight: 800}}>Деталізація по групах ({finData.length})</h3>
              {finData.length === 0 ? <div style={{color:theme.textLight,padding:60,textAlign:"center", fontSize: 16, fontWeight: 600}}>За цими фільтрами немає оплат</div> :
              <div className="admin-finance-list" style={{display:"flex",flexDirection:"column",gap:24}}>
                {finData.map(sp => {
                  const dir = dirMap[sp.group.directionId]; const trainerPct = sp.group.trainerPct; const studioPct = 100 - trainerPct;
                  return (
                    <div key={sp.group.id} className="admin-finance-card" style={{background: theme.card, borderRadius: 28, padding: "28px", display: "flex", flexDirection: "column", gap: 24, boxShadow: "0 10px 40px rgba(168, 177, 206, 0.15)"}}>
                      <div className="admin-finance-card-header" style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12}}>
                        <div><div className="admin-finance-title-row" style={{display: "flex", alignItems: "center", gap: 12, marginBottom: 8, flexWrap: "wrap"}}><span className="admin-finance-title" style={{color:theme.textMain,fontWeight:800, fontSize: 20}}>{sp.group.name}</span><span className="admin-finance-direction-badge"><Badge color={dir?.color||"#888"}>{dir?.name}</Badge></span></div><div className="admin-finance-meta" style={{fontSize: 14, color: theme.textMuted, fontWeight: 500}}>Оплачених абонементів: <strong style={{color: theme.textMain}}>{sp.subs.length}</strong></div></div>
                        <div className="admin-finance-total" style={{textAlign: "right"}}><div className="admin-finance-total-label" style={{fontSize: 12, color: theme.textLight, textTransform: "uppercase", fontWeight: 700}}>Загальний збір</div><div className="admin-finance-total-value" style={{fontSize: 28, fontWeight: 800, color: theme.textMain, marginTop: 4}}>{sp.total.toLocaleString()} ₴</div></div>
                      </div>
                      <div className="admin-finance-progress" style={{height: 12, width: "100%", display: "flex", borderRadius: 100, overflow: "hidden"}}>
                        <div style={{width: `${trainerPct}%`, background: theme.primary}}></div>
                        <div style={{width: `${studioPct}%`, background: theme.success}}></div>
                      </div>
                      <div className="admin-finance-card-footer" style={{display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16}}>
                        <div className="admin-finance-split" style={{display: "flex", gap: 40}}>
                          <div className="admin-finance-split-card"><div style={{fontSize:12,color:theme.textMuted, fontWeight: 700}}>Тренер ({trainerPct}%)</div><div style={{fontSize:20,fontWeight:800,color:theme.primary, marginTop: 6}}>{sp.trainer.toLocaleString()} ₴</div></div>
                          <div className="admin-finance-split-card"><div style={{fontSize:12,color:theme.textMuted, fontWeight: 700}}>Студія ({studioPct}%)</div><div style={{fontSize:20,fontWeight:800,color:theme.success, marginTop: 6}}>{sp.studio.toLocaleString()} ₴</div></div>
                        </div>
                        <button style={{...btnS, padding: "12px 24px", background: theme.input}} onClick={() => setFinanceDetailItem(sp)}>🧾 Детальний звіт</button>
                      </div>
                    </div>
                  )
                })}
              </div>}
            </div>
          )
        })()}

        {/* === АНАЛІТИКА INSTAGRAM === */}
        {isAdmin && tab === "analytics" && <Analytics />}

      </main>

      {/* МОДАЛКИ */}
      
      <Modal open={!!financeDetailItem} onClose={()=>setFinanceDetailItem(null)} title={`Зарплата: ${financeDetailItem?.group?.name}`} wide variant="admin-mobile">
        {financeDetailItem && (
          <div>
            <div style={{display: "flex", justifyContent: "space-between", background: theme.input, padding: "20px 24px", borderRadius: 20, marginBottom: 24}}>
              <div><div style={{fontSize: 12, color: theme.textMuted, textTransform: "uppercase", fontWeight: 700}}>Тренеру ({financeDetailItem.group.trainerPct}%)</div><div style={{fontSize: 26, fontWeight: 800, color: theme.primary, marginTop: 6}}>{financeDetailItem.trainer.toLocaleString()} ₴</div></div>
              <div style={{textAlign: "right"}}><div style={{fontSize: 12, color: theme.textMuted, textTransform: "uppercase", fontWeight: 700}}>Студії ({100 - financeDetailItem.group.trainerPct}%)</div><div style={{fontSize: 26, fontWeight: 800, color: theme.success, marginTop: 6}}>{financeDetailItem.studio.toLocaleString()} ₴</div></div>
            </div>
            <table style={{width: "100%", borderCollapse: "collapse", fontSize: 15, textAlign: "left"}}>
              <thead><tr style={{color: theme.textLight, borderBottom: `1px solid ${theme.border}`}}><th style={{padding: "16px 0", fontWeight: 700}}>Учениця</th><th style={{padding: "16px 0", fontWeight: 700}}>Тип</th><th style={{padding: "16px 0", fontWeight: 700, textAlign: "right"}}>Оплачено</th><th style={{padding: "16px 0", fontWeight: 700, textAlign: "right", color: theme.primary}}>Частка тренера</th></tr></thead>
              <tbody>{financeDetailItem.subs.map(sub => (<tr key={sub.id} style={{borderBottom: `1px solid ${theme.bg}`}}><td style={{padding: "16px 0", color: theme.textMain, fontWeight: 600}}>{getDisplayName(studentMap[sub.studentId])}</td><td style={{padding: "16px 0", color: theme.textMuted, fontWeight: 500}}>{PLAN_TYPES.find(p=>p.id===sub.planType)?.name}</td><td style={{padding: "16px 0", textAlign: "right", fontWeight: 600, color: theme.textMain}}>{sub.amount} ₴</td><td style={{padding: "16px 0", textAlign: "right", color: theme.primary, fontWeight: 800}}>+ {Math.round((sub.amount || 0) * (financeDetailItem.group.trainerPct / 100))} ₴</td></tr>))}</tbody>
            </table>
          </div>
        )}
      </Modal>
      <Modal open={modal==="manageDirections"} onClose={()=>setModal(null)} title="Керування напрямками" wide variant="admin-mobile">
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ ...cardSt, padding: 16, display: "grid", gap: 10 }}>
            <div style={{ fontWeight: 700, color: theme.secondary }}>Створити новий напрямок</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px auto", gap: 8 }}>
              <input style={inputSt} placeholder="Назва" value={directionDraft.name} onChange={(e) => setDirectionDraft((p) => ({ ...p, name: e.target.value }))} />
              <input style={inputSt} placeholder="ID (опційно)" value={directionDraft.id} onChange={(e) => setDirectionDraft((p) => ({ ...p, id: e.target.value }))} />
              <input style={inputSt} placeholder="#7b8ea8" value={directionDraft.color} onChange={(e) => setDirectionDraft((p) => ({ ...p, color: e.target.value }))} />
              <button type="button" style={btnP} onClick={createDirectionAction}>Додати</button>
            </div>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {directionsList.map((d) => {
              const edit = directionEdits[d.id] || {};
              const persisted = persistedDirectionIds.has(String(d.id));
              return (
                <div key={d.id} style={{ ...cardSt, padding: 14, display: "grid", gap: 8 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 120px auto auto auto", gap: 8, alignItems: "center" }}>
                    <input style={inputSt} value={edit.name ?? d.name ?? ""} onChange={(e) => upsertDirectionEdit(d.id, { name: e.target.value })} disabled={!persisted} />
                    <input style={inputSt} value={edit.id ?? d.id ?? ""} onChange={(e) => upsertDirectionEdit(d.id, { id: e.target.value })} disabled={!persisted} />
                    <input style={inputSt} value={edit.color ?? d.color ?? "#7b8ea8"} onChange={(e) => upsertDirectionEdit(d.id, { color: e.target.value })} disabled={!persisted} />
                    <button type="button" style={btnS} onClick={() => toggleDirectionActive(d)} disabled={!persisted}>{d.isActive === false ? "Увімкнути" : "Архівувати"}</button>
                    <button type="button" style={btnP} onClick={() => saveDirectionEdit(d.id)} disabled={!persisted}>Зберегти</button>
                    <button type="button" style={{ ...btnS, color: theme.danger }} onClick={() => deleteDirectionAction(d)} disabled={!persisted}>Видалити</button>
                  </div>
                  <div style={{ fontSize: 12, color: theme.textMuted }}>
                    ID: <b>{d.id}</b> · Груп: <b>{groupsCountByDirection[String(d.id)] || 0}</b>{!persisted ? " · Додано автоматично з існуючих груп (тільки читання)." : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Modal>
      <Modal open={modal==="addStudent"} onClose={()=>setModal(null)} title="Нова учениця" variant={studentsMobileModalVariant}><StudentForm onCancel={()=>setModal(null)} onDone={createStudentAction} studentGrps={studentGrps} groups={activeGroups}/></Modal>
      <Modal open={modal==="addGroup"} onClose={()=>setModal(null)} title="Нова група" variant="admin-mobile">
        <div style={{ display: "grid", gap: 12 }}>
          <Field label="Назва групи *">
            <input style={inputSt} value={newGroupDraft.name} onChange={(e) => setNewGroupDraft((p) => ({ ...p, name: e.target.value }))} placeholder="Напр. Bachata" />
          </Field>
          <Field label="ID групи (опційно)">
            <input style={inputSt} value={newGroupDraft.id} onChange={(e) => setNewGroupDraft((p) => ({ ...p, id: e.target.value }))} placeholder="auto from name if empty" />
          </Field>
          <Field label="Напрямок *">
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" style={{ ...btnS, background: newGroupDraft.directionMode === "existing" ? theme.secondary : theme.input, color: newGroupDraft.directionMode === "existing" ? "#fff" : theme.textMain }} onClick={() => setNewGroupDraft((p) => ({ ...p, directionMode: "existing" }))}>Існуючий</button>
                <button type="button" style={{ ...btnS, background: newGroupDraft.directionMode === "new" ? theme.secondary : theme.input, color: newGroupDraft.directionMode === "new" ? "#fff" : theme.textMain }} onClick={() => setNewGroupDraft((p) => ({ ...p, directionMode: "new" }))}>Новий</button>
              </div>
              {newGroupDraft.directionMode === "existing" ? (
                <select style={inputSt} value={newGroupDraft.directionId} onChange={(e) => setNewGroupDraft((p) => ({ ...p, directionId: e.target.value }))}>
                  {directionsList.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.id})</option>)}
                </select>
              ) : (
                <input style={inputSt} value={newGroupDraft.newDirectionName} onChange={(e) => setNewGroupDraft((p) => ({ ...p, newDirectionName: e.target.value }))} placeholder="Напр. Heels Pro" />
              )}
            </div>
          </Field>

          <Field label="Рівень групи">
            <select style={inputSt} value={newGroupDraft.publicLevel} onChange={(e) => setNewGroupDraft((p) => ({ ...p, publicLevel: e.target.value }))}>
              <option value="">— Не вказано —</option>
              {PUBLIC_LEVEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
          <Field label="Вікова категорія">
            <select style={inputSt} value={newGroupDraft.ageCategory} onChange={(e) => setNewGroupDraft((p) => ({ ...p, ageCategory: e.target.value }))}>
              <option value="">— Не вказано —</option>
              {AGE_CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
          <div style={{ display: "grid", gap: 12, padding: 14, border: `1px solid ${newGroupDraft.showOnPublicSite ? theme.primary : theme.border}`, borderRadius: 18, background: newGroupDraft.showOnPublicSite ? `${theme.primary}12` : theme.input }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 800, color: theme.textMain }}>
              <input
                type="checkbox"
                checked={!!newGroupDraft.showOnPublicSite}
                onChange={(e) => setNewGroupDraft((p) => ({ ...p, showOnPublicSite: e.target.checked }))}
              />
              Показувати на сайті
            </label>
            {newGroupDraft.showOnPublicSite && (
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                <Field label="Запис до групи">
                  <select style={inputSt} value={newGroupDraft.publicJoinStatus} onChange={(e) => setNewGroupDraft((p) => ({ ...p, publicJoinStatus: e.target.value }))}>
                    {PUBLIC_JOIN_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </Field>
              </div>
            )}
          </div>
          <Field label="Графік занять">
            <ScheduleEditor value={newGroupDraft.schedule} onChange={(schedule) => setNewGroupDraft((p) => ({ ...p, schedule }))} />
          </Field>
          <Field label="Дата початку тренувань">
            <input style={inputSt} type="date" value={newGroupDraft.startDate || ""} onChange={(e) => setNewGroupDraft((p) => ({ ...p, startDate: e.target.value }))} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Відсоток тренера">
              <div>
                <input
                  style={inputSt}
                  type="text"
                  inputMode="numeric"
                  placeholder="50"
                  value={newGroupDraft.trainerPct}
                  onChange={(e) => {
                    const next = e.target.value.replace(/[^\d]/g, "");
                    if (next === "" || Number(next) <= 100) {
                      setNewGroupDraft((p) => ({ ...p, trainerPct: next }));
                    }
                  }}
                />
                <div style={{ fontSize: 12, color: theme.textLight, marginTop: 6 }}>Введіть лише число (0-100), без знака %.</div>
              </div>
            </Field>
            <Field label="Тренер (опційно)">
              <select style={inputSt} value={newGroupDraft.trainerId} onChange={(e) => setNewGroupDraft((p) => ({ ...p, trainerId: e.target.value }))}>
                <option value="">— Без прив'язки —</option>
                {getOperationalTrainers(trainers, newGroupDraft.trainerId).map((t) => <option key={t.id} value={t.id}>{t.name || [t.firstName, t.lastName].filter(Boolean).join(" ") || t.id}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
            <button type="button" style={btnS} onClick={() => setModal(null)}>Скасувати</button>
            <button type="button" style={btnP} onClick={createGroupAction}>Створити групу</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!groupMergeDraft} onClose={() => !groupMergeBusy && setGroupMergeDraft(null)} title="Обʼєднати групи" wide variant="admin-mobile">
        {groupMergeDraft && groupMergeSummary && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ ...cardSt, padding: 14, border: `1px solid ${theme.border}` }}>
              <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 6 }}>Група, яку приєднуємо</div>
              <div style={{ fontWeight: 900, color: theme.textMain }}>{getGroupLabel(groupMergeSummary.sourceGroup)}</div>
              <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>Графік: {formatGroupSchedule(groupMergeSummary.sourceGroup?.schedule) || "—"}</div>
            </div>
            <Field label="Група, яка залишається (активна, може бути іншого тренера)">
              <select style={inputSt} value={groupMergeDraft.targetGroupId} onChange={(e) => setGroupMergeDraft((prev) => ({ ...prev, targetGroupId: e.target.value }))} disabled={groupMergeBusy}>
                <option value="">— Оберіть цільову групу —</option>
                {activeGroups.filter((group) => String(group.id) !== String(groupMergeDraft.sourceGroupId)).map((group) => {
                  const trainerInfo = resolveTrainerForGroup(group);
                  return <option key={group.id} value={group.id}>{group.name || group.id} · {trainerInfo.trainerName || trainerInfo.trainerId || "без тренера"}</option>;
                })}
              </select>
            </Field>
            <Field label="Графік після обʼєднання">
              <select
                style={inputSt}
                value={groupMergeDraft.scheduleMode || "use_source_schedule"}
                onChange={(e) => setGroupMergeDraft((prev) => ({
                  ...prev,
                  scheduleMode: e.target.value,
                  customSchedule: e.target.value === "custom_schedule" && !parseGroupSchedule(prev.customSchedule).length
                    ? parseGroupSchedule(groupMergeSummary.sourceGroup?.schedule)
                    : prev.customSchedule,
                }))}
                disabled={groupMergeBusy}
              >
                <option value="keep_target_schedule">Залишити графік цільової групи</option>
                <option value="use_source_schedule">Взяти графік групи, яку приєднуємо</option>
                <option value="custom_schedule">Використати вручну заданий графік</option>
              </select>
            </Field>
            {groupMergeDraft.scheduleMode === "custom_schedule" && (
              <Field label="Графік занять">
                <div style={{ display: "grid", gap: 8 }}>
                  <button type="button" style={btnS} onClick={() => setGroupMergeDraft((prev) => ({ ...prev, customSchedule: parseGroupSchedule(groupMergeSummary.sourceGroup?.schedule) }))} disabled={groupMergeBusy}>Взяти за основу графік групи, яку приєднуємо</button>
                  <ScheduleEditor value={groupMergeDraft.customSchedule} onChange={(customSchedule) => setGroupMergeDraft((prev) => ({ ...prev, customSchedule }))} disabled={groupMergeBusy} />
                </div>
              </Field>
            )}
            <div style={{ ...cardSt, padding: 14, border: `1px solid ${theme.border}`, display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ fontWeight: 900, color: theme.textMain }}>Учениці для переносу</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" style={btnS} onClick={() => setGroupMergeDraft((prev) => ({ ...prev, selectedStudentIds: groupMergeSummary.sourceStudentIds }))} disabled={groupMergeBusy}>Обрати всіх</button>
                  <button type="button" style={btnS} onClick={() => setGroupMergeDraft((prev) => ({ ...prev, selectedStudentIds: [] }))} disabled={groupMergeBusy}>Зняти всіх</button>
                </div>
              </div>
              <input style={inputSt} placeholder="Пошук по імені" value={groupMergeDraft.studentSearch || ""} onChange={(e) => setGroupMergeDraft((prev) => ({ ...prev, studentSearch: e.target.value }))} disabled={groupMergeBusy} />
              <div style={{ display: "grid", gap: 6, maxHeight: 220, overflow: "auto" }}>
                {groupMergeSummary.sourceStudentIds
                  .filter((studentId) => {
                    const st = studentMap[studentId];
                    const name = String(st?.name || [st?.firstName, st?.lastName].filter(Boolean).join(" ") || studentId).toLowerCase();
                    return !groupMergeDraft.studentSearch || name.includes(String(groupMergeDraft.studentSearch).toLowerCase());
                  })
                  .map((studentId) => {
                    const st = studentMap[studentId];
                    const label = st?.name || [st?.firstName, st?.lastName].filter(Boolean).join(" ") || studentId;
                    const selected = (groupMergeDraft.selectedStudentIds || []).map((id) => String(id)).includes(String(studentId));
                    return (
                      <label key={studentId} style={{ display: "flex", gap: 8, alignItems: "center", color: theme.textMain }}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(e) => setGroupMergeDraft((prev) => ({
                            ...prev,
                            selectedStudentIds: e.target.checked
                              ? Array.from(new Set([...(prev.selectedStudentIds || []), studentId]))
                              : (prev.selectedStudentIds || []).filter((id) => String(id) !== String(studentId)),
                          }))}
                          disabled={groupMergeBusy}
                        />
                        {label}
                      </label>
                    );
                  })}
              </div>
            </div>
            <div style={{ ...cardSt, padding: 14, border: `1px solid ${theme.border}`, display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 900, color: theme.textMain }}>Підсумок перед обʼєднанням</div>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontWeight: 900, color: theme.textMain }}>Що буде обʼєднано</div>
                <div>Група, яку приєднуємо: <b>{getGroupLabel(groupMergeSummary.sourceGroup)}</b></div>
                <div>Група, яка залишається: <b>{getGroupLabel(groupMergeSummary.targetGroup)}</b></div>
                <div>Учениці: <b>{groupMergeSummary.selectedStudentsCount} з {groupMergeSummary.sourceStudentsCount}</b></div>
                <div>Активні абонементи: <b>{groupMergeSummary.movableSubsCount}</b></div>
              </div>
              <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                <div style={{ fontWeight: 900, color: theme.textMain }}>Що буде після підтвердження</div>
                <div>Обрані учениці перейдуть у групу <b>“{groupMergeSummary.targetGroup?.name || groupMergeSummary.targetGroup?.id || "—"}”</b>.</div>
                <div>Графік: <b>{getGroupMergeScheduleModeLabel(groupMergeDraft.scheduleMode)}</b></div>
                <div>Стара група буде архівована: <b>{groupMergeSummary.shouldArchiveSource ? "Так" : "Ні"}</b></div>
                {!groupMergeSummary.shouldArchiveSource && (
                  <div style={{ border: `1px solid ${theme.warning || theme.border}`, background: theme.input, color: theme.warning || theme.textMain, borderRadius: 12, padding: 10, fontWeight: 900 }}>
                    Обрано не всіх учениць, тому стара група залишиться активною.
                  </div>
                )}
              </div>
              <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
                <div style={{ fontWeight: 900, color: theme.textMain }}>Що не змінюється</div>
                <div>Історія відвідувань не переноситься і не змінюється.</div>
                <div>Фінансові дані не змінюються.</div>
                <div>Операцію можна буде скасувати в “Історії обʼєднань”.</div>
              </div>
              <details style={{ marginTop: 6 }}>
                <summary style={{ cursor: "pointer", fontWeight: 900, color: theme.textMain }}>Технічні деталі</summary>
                <div style={{ display: "grid", gap: 4, marginTop: 8, color: theme.textMuted, fontSize: 13 }}>
                  <div>Нові привʼязки учениць: <b>{groupMergeSummary.newLinksCount}</b></div>
                  <div>Режим графіка: <b>{getGroupMergeScheduleModeLabel(groupMergeDraft.scheduleMode)}</b></div>
                  <div>Кількість links: <b>{groupMergeSummary.newLinksCount}</b></div>
                </div>
              </details>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" style={btnS} onClick={() => setGroupMergeDraft(null)} disabled={groupMergeBusy}>Скасувати</button>
              <button type="button" style={{ ...btnP, opacity: groupMergeBusy || !groupMergeDraft.targetGroupId ? 0.6 : 1 }} onClick={executeGroupMerge} disabled={groupMergeBusy || !groupMergeDraft.targetGroupId}>{groupMergeBusy ? "Обʼєднання…" : "Підтвердити обʼєднання"}</button>
            </div>
          </div>
        )}
      </Modal>
      {updateAvailable && (
        <AppUpdateBanner
          updating={updateInstalling}
          onUpdate={handleApplyUpdate}
          onDismiss={() => setUpdateAvailable(false)}
        />
      )}

      <Modal open={!!groupEditDraft} onClose={() => setGroupEditDraft(null)} title="Редагувати групу" variant="admin-mobile">
        {groupEditDraft && (
          <div style={{ display: "grid", gap: 12 }}>
            <Field label="Назва групи">
              <input style={inputSt} value={groupEditDraft.name} onChange={(e) => setGroupEditDraft((p) => ({ ...p, name: e.target.value }))} />
            </Field>
            <Field label="Напрямок">
              <select style={inputSt} value={groupEditDraft.directionId} onChange={(e) => setGroupEditDraft((p) => ({ ...p, directionId: e.target.value }))}>
                {directionsList.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>

          <Field label="Рівень групи">
            <select style={inputSt} value={groupEditDraft.publicLevel} onChange={(e) => setGroupEditDraft((p) => ({ ...p, publicLevel: e.target.value }))}>
              <option value="">— Не вказано —</option>
              {PUBLIC_LEVEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
          <Field label="Вікова категорія">
            <select style={inputSt} value={groupEditDraft.ageCategory} onChange={(e) => setGroupEditDraft((p) => ({ ...p, ageCategory: e.target.value }))}>
              <option value="">— Не вказано —</option>
              {AGE_CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
          <div style={{ display: "grid", gap: 12, padding: 14, border: `1px solid ${groupEditDraft.showOnPublicSite ? theme.primary : theme.border}`, borderRadius: 18, background: groupEditDraft.showOnPublicSite ? `${theme.primary}12` : theme.input }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 800, color: theme.textMain }}>
              <input
                type="checkbox"
                checked={!!groupEditDraft.showOnPublicSite}
                onChange={(e) => setGroupEditDraft((p) => ({ ...p, showOnPublicSite: e.target.checked }))}
              />
              Показувати на сайті
            </label>
            {groupEditDraft.showOnPublicSite && (
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                <Field label="Запис до групи">
                  <select style={inputSt} value={groupEditDraft.publicJoinStatus} onChange={(e) => setGroupEditDraft((p) => ({ ...p, publicJoinStatus: e.target.value }))}>
                    {PUBLIC_JOIN_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </Field>
              </div>
            )}
          </div>
            <Field label="Графік">
              <ScheduleEditor value={groupEditDraft.schedule} onChange={(schedule) => setGroupEditDraft((p) => ({ ...p, schedule }))} />
            </Field>
            <Field label="Дата початку тренувань">
              <input style={inputSt} type="date" value={groupEditDraft.startDate || ""} onChange={(e) => setGroupEditDraft((p) => ({ ...p, startDate: e.target.value }))} />
            </Field>
            <Field label="Відсоток тренера">
              <input style={inputSt} type="text" inputMode="numeric" value={groupEditDraft.trainerPct} onChange={(e) => {
                const next = e.target.value.replace(/[^\d]/g, "");
                if (next === "" || Number(next) <= 100) setGroupEditDraft((p) => ({ ...p, trainerPct: next }));
              }} />
            </Field>
            <Field label="Тренер">
              <select style={inputSt} value={groupEditDraft.trainerId} onChange={(e) => setGroupEditDraft((p) => ({ ...p, trainerId: e.target.value }))}>
                <option value="">— Без прив'язки —</option>
                {getOperationalTrainers(trainers, groupEditDraft.trainerId).map((t) => <option key={t.id} value={t.id}>{t.name || [t.firstName, t.lastName].filter(Boolean).join(" ") || t.id}</option>)}
              </select>
            </Field>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" style={btnS} onClick={() => setGroupEditDraft(null)}>Скасувати</button>
              <button type="button" style={btnP} onClick={saveGroupEdit}>Зберегти</button>
            </div>
          </div>
        )}
      </Modal>
      
      <Modal open={!!groupDeleteDraft} onClose={closePermanentGroupDelete} title="Остаточне видалення групи" variant="admin-mobile">
        {groupDeleteDraft && (
          <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
            <div style={{ color: theme.danger, fontWeight: 700, lineHeight: 1.5 }}>Групу буде видалено назавжди. Відновити її буде неможливо.</div>
            <div style={{ color: theme.textMuted, lineHeight: 1.5 }}>Якщо до групи привʼязана історія, абонементи, оплати, пробні записи або інші важливі дані, видалення буде заблоковано.</div>
            <Field label={<>Для підтвердження введіть точну назву: <strong>{groupDeleteDraft.name}</strong></>}>
              <input autoFocus style={{ ...inputSt, width: "100%", minWidth: 0 }} value={groupDeleteConfirmation} disabled={groupDeleteBusy} onChange={(e) => setGroupDeleteConfirmation(e.target.value)} />
            </Field>
            {groupDeleteError && <div role="alert" style={{ padding: 12, borderRadius: 12, background: `${theme.danger}18`, color: theme.danger, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{groupDeleteError}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
              <button type="button" style={btnS} disabled={groupDeleteBusy} onClick={closePermanentGroupDelete}>Скасувати</button>
              <button type="button" style={{ ...btnP, background: theme.danger, opacity: groupDeleteConfirmation === groupDeleteDraft.name && !groupDeleteBusy ? 1 : 0.5 }} disabled={groupDeleteConfirmation !== groupDeleteDraft.name || groupDeleteBusy} onClick={permanentlyDeleteGroup}>{groupDeleteBusy ? "Видалення…" : "Видалити назавжди"}</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={modal==="editStudent"} onClose={()=>{setModal(null);setEditItem(null)}} title="Редагувати профіль" variant={studentsMobileModalVariant}><StudentForm onCancel={()=>{setModal(null);setEditItem(null)}} initial={editItem} onDone={updateStudentAction} studentGrps={studentGrps} groups={activeGroups}/></Modal>
      
      {isAdmin && <Modal open={modal==="addSub"} onClose={()=>{setModal(null); setPrefillSub(null);}} title="Оформити абонемент" variant="payments-mobile"><SubForm onCancel={()=>{setModal(null); setPrefillSub(null);}} initial={prefillSub} onDone={createSubscriptionAction} students={students} groups={activeGroups} studentGrps={studentGrps} subs={subs}/></Modal>}
      {isAdmin && <Modal open={modal==="editSub"} onClose={()=>{setModal(null);setEditItem(null)}} title="Редагувати абонемент" variant="payments-mobile"><SubForm onCancel={()=>{setModal(null);setEditItem(null)}} initial={editItem} onDone={async(d)=>{try{if(db.updateSub)await db.updateSub(editItem.id,d);setSubs(p=>p.map(x=>x.id===editItem.id?{...x,...d}:x));setModal(null);setEditItem(null);}catch(e){console.warn(e);setSubs(p=>p.map(x=>x.id===editItem.id?{...x,...d}:x));setModal(null);setEditItem(null);}}} students={students} groups={groups} studentGrps={studentGrps} subs={subs}/></Modal>}
      <Modal open={modal==="addWaitlist"} onClose={()=>setModal(null)} title="Додати в резерв" variant={studentsMobileModalVariant}><WaitlistForm onCancel={()=>setModal(null)} onDone={async(d)=>{try{const w=await db.insertWaitlist(d);setWaitlist(p=>[w,...p]);setModal(null);}catch(e){console.error("Failed to add waitlist entry:", e);alert(`Не вдалося додати в резерв: ${e?.message || e}`);}}} students={students} groups={activeGroups} studentGrps={studentGrps} directionsList={directionsList}/></Modal>
      <Modal open={modal==="editWaitlist"} onClose={()=>{setModal(null);setEditItem(null)}} title="Редагувати запис резерву" variant={studentsMobileModalVariant}><WaitlistForm key={editItem?.id || "edit-waitlist"} initial={editItem} onCancel={()=>{setModal(null);setEditItem(null)}} onDone={async(patch)=>{try{const updated=await db.updateWaitlist(editItem.id,patch);setWaitlist(prev=>prev.map(row=>row.id===updated.id?updated:row));setModal(null);setEditItem(null);}catch(e){console.error("Failed to update waitlist entry:",e);alert(`Не вдалося зберегти запис резерву: ${e?.message || e}`);throw e;}}} students={students} groups={activeGroups} studentGrps={studentGrps} directionsList={directionsList}/></Modal>
      <Modal open={modal==="addTrialBooking"} onClose={()=>setModal(null)} title="Запис на пробне" variant={trialBookingMobileModalVariant}><TrialBookingForm onCancel={()=>setModal(null)} onDone={addTrialBookingAction} students={students} groups={activeGroups} studentGrps={studentGrps}/></Modal>
      <Modal open={modal==="editTrialBooking"} onClose={()=>{setModal(null);setEditItem(null)}} title="Редагувати запис на пробне" variant={studentsMobileModalVariant}><TrialBookingForm initial={editItem} onCancel={()=>{setModal(null);setEditItem(null)}} onDone={updateTrialBookingAction} students={students} groups={activeGroups} studentGrps={studentGrps}/></Modal>
    </div>
  );
}
