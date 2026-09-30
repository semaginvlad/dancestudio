import React from "react";
import * as db from "../db";
import { getInternalGroupLabel } from "../shared/groupLabels";
import { addCalendarDays, buildMonthRange, buildWeekRange, filterTrialBookings, getTrialDayMarker, getTrialDisplayName, getTrialEventTime, groupAndSortTrialBookings, groupTrialBookingsByDate, localDateKey, safeTrialViewMode, shiftCalendarMonth, shouldExpandTrialHistory, trialDayOverflow } from "../shared/trialBookings";

export default function StudentsCrmTab({
  theme,
  btnP,
  btnS,
  inputSt,
  GroupSelect,
  Badge,
  groups,
  directionsList,
  studentGrps,
  setStudentGrps,
  setStudents,
  attn,
  subsExt,
  waitlist,
  setWaitlist,
  trialBookings = [],
  setTrialBookings,
  onCancelTrialBooking,
  studentMap,
  groupMap,
  dirMap,
  searchQ,
  setSearchQ,
  stFilterDir,
  setStFilterDir,
  stFilterGroup,
  setStFilterGroup,
  studentsByDirection,
  expandedDirs,
  setExpandedDirs,
  restoreGroupByStudent,
  setRestoreGroupByStudent,
  restoreStudentToGroup,
  setModal,
  setEditItem,
  deleteStudentAction,
  getDisplayName,
}) {
  const [selectedSummaryFilter, setSelectedSummaryFilter] = React.useState("all");
  const [mobileFiltersOpen, setMobileFiltersOpen] = React.useState(false);
  const [waitlistMode, setWaitlistMode] = React.useState("active");
  const [openWaitlistStatusId, setOpenWaitlistStatusId] = React.useState(null);
  const [trialFilters, setTrialFilters] = React.useState({ search: "", status: "all", groupId: "all", directionId: "all", category: "all" });
  const [trialSort, setTrialSort] = React.useState("priority");
  const [trialFiltersOpen, setTrialFiltersOpen] = React.useState(false);
  const [openTrialMenu, setOpenTrialMenu] = React.useState(null);
  const [trialView, setTrialViewState] = React.useState(() => safeTrialViewMode(typeof localStorage === "undefined" ? "list" : localStorage.getItem("trial-bookings-view")));
  const [calendarAnchor, setCalendarAnchor] = React.useState(() => new Date());
  const [selectedCalendarDay, setSelectedCalendarDay] = React.useState(null);
  const [selectedTrialId, setSelectedTrialId] = React.useState(null);

  const waitlistActiveStatuses = new Set(["waiting", "contacted", "offered"]);
  const waitlistCompletedStatuses = new Set(["joined", "declined", "removed"]);
  const getWaitlistStatus = (w) => String(w.status || "waiting");
  const activeWaitlist = waitlist.filter((w) => waitlistActiveStatuses.has(getWaitlistStatus(w)));
  const completedWaitlist = waitlist.filter((w) => waitlistCompletedStatuses.has(getWaitlistStatus(w)));
  const todayKey = localDateKey();
  const allTrialCategories = React.useMemo(() => groupAndSortTrialBookings(trialBookings, todayKey, trialSort, groupMap, studentMap, getDisplayName), [trialBookings, todayKey, trialSort, groupMap, studentMap, getDisplayName]);
  const filteredTrialRows = React.useMemo(() => filterTrialBookings(trialBookings, trialFilters, groupMap), [trialBookings, trialFilters, groupMap]);
  const trialCategories = React.useMemo(() => groupAndSortTrialBookings(filteredTrialRows, todayKey, trialSort, groupMap, studentMap, getDisplayName), [filteredTrialRows, todayKey, trialSort, groupMap, studentMap, getDisplayName]);
  const activeTrialBookings = [...allTrialCategories.overdue, ...allTrialCategories.today, ...allTrialCategories.upcoming];
  const trialBookingsHistory = allTrialCategories.history;
  const calendarRows = React.useMemo(() => trialFilters.category === "all"
    ? [...trialCategories.overdue, ...trialCategories.today, ...trialCategories.upcoming, ...trialCategories.history]
    : trialCategories[trialFilters.category], [trialCategories, trialFilters.category]);
  const calendarGroups = React.useMemo(() => groupTrialBookingsByDate(calendarRows, groupMap, studentMap, getDisplayName), [calendarRows, groupMap, studentMap, getDisplayName]);
  const setTrialView = (view) => {
    const safe = safeTrialViewMode(view);
    setTrialViewState(safe);
    if (typeof localStorage !== "undefined") localStorage.setItem("trial-bookings-view", safe);
  };

  const updateWaitlistRow = (next) => {
    setWaitlist((prev) => prev.map((row) => (row.id === next.id ? next : row)));
  };

  const trialStatusLabels = {
    new: "Новий запис",
    contacted: "Написали",
    confirmed: "Підтвердила",
    came: "Прийшла",
    no_show: "Не прийшла",
    became_student: "Стала ученицею",
    declined: "Відмова",
    cancelled: "Скасовано",
  };

  const trialStatusActions = [
    { label: "Новий запис", status: "new" },
    { label: "Написали", status: "contacted" },
    { label: "Підтвердила", status: "confirmed" },
    { label: "Не прийшла", status: "no_show" },
    { label: "Відмова", status: "declined" },
    { label: "Скасувати", status: "cancelled" },
  ];

  const updateTrialBookingStatus = async (booking, nextStatus) => {
    if (typeof setTrialBookings !== "function") {
      const message = "Не вдалося оновити локальний список пробних записів: відсутній setTrialBookings";
      console.error(message);
      alert(message);
      return;
    }

    try {
      const next = await db.updateTrialBooking(booking.id, { status: nextStatus });
      setTrialBookings((prev) => prev.map((row) => (row.id === booking.id ? next : row)));
    } catch (e) {
      console.error("Failed to update trial booking status:", e);
      alert(`Не вдалося змінити статус пробного запису: ${e?.message || e}`);
    }
  };

  const deleteTrialBooking = async (booking) => {
    if (typeof setTrialBookings !== "function") {
      const message = "Не вдалося оновити локальний список пробних записів: відсутній setTrialBookings";
      console.error(message);
      alert(message);
      return;
    }
    if (!window.confirm("Видалити запис на пробне назавжди?")) return;

    try {
      await db.deleteTrialBooking(booking.id);
      setTrialBookings((prev) => prev.filter((row) => String(row.id) !== String(booking.id)));
    } catch (e) {
      console.error("Failed to delete trial booking:", e);
      alert(`Не вдалося видалити пробний запис: ${e?.message || e}`);
    }
  };

  const ensureStudentGroupLocal = (link) => {
    setStudentGrps((prev) => (
      prev.some((sg) => String(sg.studentId) === String(link.studentId) && String(sg.groupId) === String(link.groupId))
        ? prev
        : [...prev, link]
    ));
  };

  const buildStudentFromWaitlist = (w) => {
    const contact = String(w.contact || "").trim();
    const phoneLike = /^[+\d][\d\s().-]{5,}$/.test(contact);
    const hasTelegram = contact.includes("@");

    return {
      name: w.name || "Новий контакт з резерву",
      first_name: "",
      last_name: "",
      phone: phoneLike ? contact : null,
      telegram: !phoneLike && hasTelegram ? contact : null,
      notes: !phoneLike && !hasTelegram && contact ? `Контакт з резерву: ${contact}` : null,
    };
  };

  const waitlistStatusActions = [
    { status: "waiting", label: "Очікує", color: theme.warning || "#f59e0b", background: "rgba(245, 158, 11, 0.16)" },
    { status: "contacted", label: "Написали", color: theme.primary || "#2563eb", background: "rgba(37, 99, 235, 0.14)" },
    { status: "offered", label: "Запропонували групу", color: theme.secondary || "#7c3aed", background: "rgba(124, 58, 237, 0.14)" },
    { status: "joined", label: "Записалась", color: theme.success || "#16a34a", background: "rgba(22, 163, 74, 0.14)" },
    { status: "declined", label: "Відмовилась", color: theme.textMuted || "#64748b", background: "rgba(100, 116, 139, 0.14)" },
    { status: "removed", label: "Прибрано", color: theme.danger || "#dc2626", background: "rgba(220, 38, 38, 0.12)" },
  ];
  const waitlistStatusById = Object.fromEntries(waitlistStatusActions.map((item) => [item.status, item]));

  const updateWaitlistStatus = async (w, nextStatus) => {
    try {
      const next = await db.updateWaitlist(w.id, { status: nextStatus });
      updateWaitlistRow(next);
      setOpenWaitlistStatusId(null);
    } catch (e) {
      console.error("Failed to update waitlist status:", e);
      alert(`Не вдалося змінити статус резерву: ${e?.message || e}`);
    }
  };

  const removeWaitlistEntry = async (w) => {
    if (!window.confirm("Прибрати запис із резерву? Запис не буде видалено, лише отримає статус ‘Прибрано’.")) return;
    await updateWaitlistStatus(w, "removed");
  };

  const joinWaitlistEntry = async (w) => {
    try {
      let studentId = w.studentId;
      let createdStudent = null;

      if (!studentId) {
        createdStudent = await db.insertStudent(buildStudentFromWaitlist(w));
        studentId = createdStudent.id;
      }

      const link = await db.addStudentGroup(studentId, w.groupId);
      const patch = { status: "joined" };
      if (!w.studentId) patch.studentId = studentId;
      const next = await db.updateWaitlist(w.id, patch);

      if (createdStudent && typeof setStudents === "function") setStudents((prev) => [...prev, createdStudent]);
      ensureStudentGroupLocal(link);
      updateWaitlistRow(next);
    } catch (e) {
      console.error("Failed to move waitlist entry to joined:", e);
      alert(`Не вдалося перевести з резерву в групу: ${e?.message || e}`);
    }
  };

  const makeStatusChip = (label, color, background) => (
    <span
      key={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 24,
        borderRadius: 999,
        padding: "3px 9px",
        background,
        color,
        fontSize: 12,
        fontWeight: 800,
        lineHeight: 1,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );

  const getStudentSubscriptions = (studentId) => subsExt.filter((s) => String(s.studentId) === String(studentId));
  const getActiveSubscriptions = (studentId) => getStudentSubscriptions(studentId).filter((s) => s.status !== "expired");
  const getStudentAttendance = (studentId) => attn.filter((a) => String(a.studentId) === String(studentId));

  const getStudentDirectionCount = (studentId) => {
    const directionIds = new Set(
      studentGrps
        .filter((sg) => String(sg.studentId) === String(studentId))
        .map((sg) => groupMap[sg.groupId]?.directionId)
        .filter(Boolean)
        .map(String)
    );
    return directionIds.size;
  };

  const activeStudentIds = new Set([
    ...studentGrps.map((sg) => String(sg.studentId)).filter(Boolean),
    ...subsExt.filter((s) => s.status !== "expired").map((s) => String(s.studentId)).filter(Boolean),
  ]);
  const studentsWithGroupIds = new Set(studentGrps.map((sg) => String(sg.studentId)).filter(Boolean));
  const studentsWithActiveSubIds = new Set(subsExt.filter((s) => s.status !== "expired").map((s) => String(s.studentId)).filter(Boolean));
  const studentsWithoutSubCount = [...studentsWithGroupIds].filter((studentId) => !studentsWithActiveSubIds.has(studentId)).length;
  const debtStudentIds = new Set([
    ...subsExt.filter((s) => s.status !== "expired" && !s.paid).map((s) => String(s.studentId)).filter(Boolean),
    ...attn
      .filter((a) => ["debt", "unpaid"].includes(String(a.entryType || a.guestType || "").toLowerCase()))
      .map((a) => String(a.studentId))
      .filter(Boolean),
  ]);
  const summaryCards = [
    { filter: "active", label: "Активні", value: activeStudentIds.size, hint: "у групах або з активним абонементом", color: theme.success || "#16a34a" },
    { filter: "no_subscription", label: "Без абонемента", value: studentsWithoutSubCount, hint: "є група, немає активного абонемента", color: theme.textMuted },
    { filter: "debt", label: "Борг", value: debtStudentIds.size, hint: "борг / unpaid у доступних даних", color: theme.danger || "#dc2626" },
    { filter: "reserve", label: "Резерв", value: activeWaitlist.length, hint: "очікує / написали / запропонували", color: theme.warning || "#f59e0b" },
    { filter: "trials", label: "Пробні", value: activeTrialBookings.length, hint: "активні записи на пробне", color: theme.primary || "#2563eb" },
    { filter: "archive", label: "Архів", value: studentsByDirection.inactive.length, hint: "неактивні профілі", color: theme.textMuted },
  ];

  const toggleSummaryFilter = (filter) => {
    setSelectedSummaryFilter((prev) => (prev === filter ? "all" : filter));
  };

  const isStudentInSummaryFilter = (st) => {
    const studentId = String(st.id);
    if (selectedSummaryFilter === "no_subscription") {
      return studentsWithGroupIds.has(studentId) && !studentsWithActiveSubIds.has(studentId);
    }
    if (selectedSummaryFilter === "debt") return debtStudentIds.has(studentId);
    return true;
  };

  const shouldShowActiveSection = ["all", "active", "no_subscription", "debt"].includes(selectedSummaryFilter);
  const shouldShowReserveSection = ["all", "reserve"].includes(selectedSummaryFilter);
  const shouldShowTrialSection = ["all", "trials"].includes(selectedSummaryFilter);
  const shouldShowArchiveSection = ["all", "archive"].includes(selectedSummaryFilter);
  const visibleGroupedStudents = studentsByDirection.grouped
    .map(({ direction, students }) => ({
      direction,
      students: students.filter(isStudentInSummaryFilter),
    }))
    .filter(({ students }) => students.length > 0);
  const visibleActiveStudentCount = visibleGroupedStudents.reduce((sum, item) => sum + item.students.length, 0);
  const allVisibleStudentsCount = visibleActiveStudentCount + studentsByDirection.inactive.length;
  const activeFilterCount = [stFilterDir !== "all", stFilterGroup !== "all", selectedSummaryFilter !== "all"].filter(Boolean).length;
  const resetStudentFilters = () => {
    setSelectedSummaryFilter("all");
    setStFilterDir("all");
    setStFilterGroup("all");
  };
  const visibleArchiveStudents = studentsByDirection.inactive.filter((st) => (selectedSummaryFilter === "debt" ? debtStudentIds.has(String(st.id)) : true));
  const filterEmptyState = (
    <div style={{ background: theme.card, border: `1px dashed ${theme.border}`, borderRadius: 18, padding: 22, color: theme.textMuted, fontWeight: 800, textAlign: "center" }}>
      Немає записів за цим фільтром.
    </div>
  );

  const getStatusChips = (st) => {
    const active = getActiveSubscriptions(st.id);
    const allSubs = getStudentSubscriptions(st.id);
    const attendanceRows = getStudentAttendance(st.id);
    const hasDebt = active.some((s) => !s.paid) || attendanceRows.some((a) => ["debt", "unpaid"].includes(String(a.entryType || a.guestType || "").toLowerCase()));
    const hasTrial = allSubs.some((s) => String(s.planType || "").toLowerCase() === "trial") || attendanceRows.some((a) => String(a.entryType || a.guestType || "").toLowerCase() === "trial");
    const hasSingle = allSubs.some((s) => String(s.planType || "").toLowerCase() === "single") || attendanceRows.some((a) => String(a.entryType || a.guestType || "").toLowerCase() === "single");
    const directionCount = getStudentDirectionCount(st.id);
    const chips = [];

    chips.push(
      active.length
        ? makeStatusChip("Активна", theme.success || "#16a34a", "rgba(22, 163, 74, 0.12)")
        : makeStatusChip("Без абонемента", theme.textMuted, "rgba(148, 163, 184, 0.16)")
    );
    if (hasDebt) chips.push(makeStatusChip("Борг", theme.danger || "#dc2626", "rgba(220, 38, 38, 0.12)"));
    if (hasTrial) chips.push(makeStatusChip("Пробне", "#047857", "rgba(16, 185, 129, 0.14)"));
    if (hasSingle) chips.push(makeStatusChip("Разове", "#b45309", "rgba(245, 158, 11, 0.16)"));
    if (directionCount > 1) chips.push(makeStatusChip(`Кілька напрямків · ${directionCount}`, theme.secondary || "#7c3aed", "rgba(124, 58, 237, 0.12)"));

    return chips;
  };

  const renderSubscriptionBadges = (st) => {
    const active = getActiveSubscriptions(st.id);
    if (!active.length) {
      return <span style={{ color: theme.textLight, fontSize: 12, fontWeight: 700 }}>Активних абонементів немає</span>;
    }

    return active.map((s) => {
      const g = groupMap[s.groupId];
      const d = g ? dirMap[g.directionId] : null;
      return (
        <Badge key={s.id} color={d?.color || "#888"}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span>{g?.name || "Група"}</span>
            <span style={{ opacity: 0.78 }}>{s.usedTrainings}/{s.totalTrainings}</span>
          </span>
        </Badge>
      );
    });
  };

  const renderStudentActions = (st, isArchive) => (
    <div className="students-actions" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
      {isArchive && (
        <>
          <select
            value={restoreGroupByStudent[st.id] || ""}
            onChange={(e) => setRestoreGroupByStudent((prev) => ({ ...prev, [st.id]: e.target.value }))}
            style={{ ...inputSt, width: 180, height: 38, padding: "0 12px", fontSize: 13, borderRadius: 12 }}
          >
            <option value="">Група для відновлення</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{getInternalGroupLabel(g)}</option>
            ))}
          </select>
          <button type="button" style={{ ...btnS, padding: "9px 14px", fontSize: 13, background: theme.bg }} onClick={() => restoreStudentToGroup(st.id)}>↩ Відновити</button>
        </>
      )}
      <button style={{ ...btnS, padding: "9px 13px", fontSize: 14, background: isArchive ? theme.card : theme.bg }} onClick={() => { setEditItem(st); setModal("editStudent"); }}>✏️</button>
      <button style={{ background: "none", border: "none", color: theme.danger, fontSize: 20, cursor: "pointer", padding: "0 8px" }} onClick={() => deleteStudentAction(st.id)}>🗑</button>
    </div>
  );

  const renderStudentCard = (st, index, { isArchive = false } = {}) => {
    const contact = [st.phone, st.telegram].filter(Boolean).join(" · ") || "контакт не вказано";

    return (
      <div
        key={st.id}
        className="student-mobile-card"
        role="button"
        tabIndex={0}
        onClick={() => { setEditItem(st); setModal("editStudent"); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditItem(st); setModal("editStudent"); } }}
        style={{
          background: isArchive ? "rgba(148, 163, 184, 0.08)" : theme.bg,
          border: `1px solid ${theme.border}`,
          borderRadius: 18,
          padding: "14px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
          alignItems: "center",
          gap: 12,
          opacity: isArchive ? 0.86 : 1,
          boxShadow: isArchive ? "none" : "0 10px 24px rgba(15, 23, 42, 0.05)",
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", minWidth: 0, flexWrap: "wrap" }}>
          <div style={{
            width: 30,
            height: 30,
            borderRadius: 10,
            display: "grid",
            placeItems: "center",
            background: isArchive ? theme.card : theme.input,
            color: theme.textLight,
            fontSize: 13,
            fontWeight: 900,
            flex: "0 0 auto",
          }}>{index + 1}</div>
          <div style={{ minWidth: 180, flex: "1 1 220px" }}>
            <div style={{ color: theme.textMain, fontWeight: 900, fontSize: 16, lineHeight: 1.2 }}>{getDisplayName(st)}</div>
            <div style={{ color: theme.textMuted, fontSize: 13, marginTop: 5, fontWeight: 650, overflowWrap: "anywhere" }}>{contact}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 9 }}>{getStatusChips(st)}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center", minWidth: 0 }}>{renderSubscriptionBadges(st)}</div>
        <div onClick={(e) => e.stopPropagation()}>{renderStudentActions(st, isArchive)}</div>
      </div>
    );
  };

  const renderSectionHeader = (title, count, subtitle, accent = theme.secondary) => (
    <div className="students-section-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
      <div>
        <div className="students-section-title" style={{ color: theme.textMain, fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em" }}>{title}</div>
        {subtitle ? <div className="students-section-subtitle" style={{ color: theme.textMuted, fontSize: 13, fontWeight: 650, marginTop: 4 }}>{subtitle}</div> : null}
      </div>
      <span style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        padding: "6px 11px",
        background: `${accent}18`,
        color: accent,
        fontSize: 13,
        fontWeight: 900,
        whiteSpace: "nowrap",
      }}>{count}</span>
    </div>
  );

  const renderTrialBookingCard = (booking, index, { isHistory = false } = {}) => {
    const st = studentMap[booking.studentId];
    const gr = groupMap[booking.groupId];
    const displayName = getTrialDisplayName(booking, studentMap, getDisplayName);
    const status = booking.status || "new";
    const trialDate = booking.trialDate || booking.trial_date || "";
    const formattedDate = trialDate ? new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${trialDate.slice(0, 10)}T12:00:00`)) : "Дата не вказана";
    const phone = booking.phone || st?.phone;
    const email = booking.email || st?.email;
    const telegram = booking.telegram || st?.telegram;
    const instagram = booking.instagram || st?.instagram;
    const telegramName = String(telegram || "").replace(/^@/, "");
    const instagramName = String(instagram || "").replace(/^@/, "");
    const dayMarker = getTrialDayMarker(trialDate, todayKey, status);
    const groupLabel = gr ? getInternalGroupLabel(gr) : "Група не вказана";
    const statusMenuOpen = openTrialMenu === `status:${booking.id}`;
    const actionsMenuOpen = openTrialMenu === `actions:${booking.id}`;
    const statusButton = (mobile = false) => (
      <div className={mobile ? "student-trial-mobile-status" : "student-trial-desktop-status"} style={{ position: "relative" }}>
        <button type="button" className="student-trial-status-button" aria-haspopup="menu" aria-expanded={statusMenuOpen} onClick={() => setOpenTrialMenu(statusMenuOpen ? null : `status:${booking.id}`)} style={{ border: `1px solid ${theme.primary}55`, background: `${theme.primary}18`, color: theme.primary, borderRadius: 999, padding: "6px 9px", fontSize: 11.5, fontWeight: 900, whiteSpace: "nowrap", cursor: "pointer", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>
          {trialStatusLabels[status] || status} <span aria-hidden="true">▾</span>
        </button>
        {statusMenuOpen ? <div role="menu" className="student-trial-menu" style={{ position: "absolute", zIndex: 30, right: 0, top: "calc(100% + 5px)", width: 190, padding: 5, display: "grid", gap: 3, background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 12, boxShadow: "0 16px 38px rgba(15,23,42,.2)" }}>
          {trialStatusActions.map((action) => <button key={action.status} type="button" role="menuitemradio" aria-checked={action.status === status} disabled={action.status === status} onClick={() => { updateTrialBookingStatus(booking, action.status); setOpenTrialMenu(null); }} style={{ border: 0, borderRadius: 8, background: action.status === status ? theme.input : "transparent", color: theme.textMain, padding: "8px 9px", textAlign: "left", fontSize: 12, fontWeight: 800, cursor: action.status === status ? "default" : "pointer" }}>{action.status === status ? "✓ " : ""}{action.label}</button>)}
        </div> : null}
      </div>
    );

    return (
      <div key={booking.id} className="student-trial-card" style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 13, padding: "9px 11px", display: "grid", gridTemplateColumns: "minmax(210px, 1.45fr) minmax(190px, 1.25fr) minmax(125px, .65fr) 42px", gap: 12, alignItems: "center", minHeight: booking.note ? 82 : 66, overflow: (statusMenuOpen || actionsMenuOpen) ? "visible" : "hidden" }}>
        <div className="student-trial-main" style={{ minWidth: 0 }}>
          <div className="student-trial-name-row" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 7 }}>
            <div className="student-trial-name" title={displayName} style={{ color: theme.textMain, fontWeight: 900, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{displayName}</div>
            {statusButton(true)}
          </div>
          <div className="student-trial-contact" style={{ display: "flex", gap: 7, color: theme.textMuted, fontSize: 11.5, fontWeight: 650, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden" }}>
            {phone ? <a title={phone} style={{ color: "inherit", overflow: "hidden", textOverflow: "ellipsis" }} href={`tel:${String(phone).replace(/[^+\d]/g, "")}`}>{phone}</a> : null}
            {email ? <a title={email} style={{ color: "inherit", overflow: "hidden", textOverflow: "ellipsis" }} href={`mailto:${email}`}>{email}</a> : null}
            {telegram ? <a title={telegram} style={{ color: "inherit" }} href={`https://t.me/${telegramName}`} target="_blank" rel="noreferrer">TG</a> : null}
            {instagram ? <a title={instagram} style={{ color: "inherit" }} href={`https://instagram.com/${instagramName}`} target="_blank" rel="noreferrer">IG</a> : null}
            {!phone && !email && !telegram && !instagram ? (booking.contact || "контакт не вказано") : null}
            {booking.source ? <span title={`Джерело: ${booking.source}`} style={{ color: theme.textLight, overflow: "hidden", textOverflow: "ellipsis" }}>· {booking.source}</span> : null}
          </div>
          {booking.note ? <div className="student-trial-note" title={booking.note} style={{ color: theme.textLight, fontSize: 11, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Нотатка: {booking.note}</div> : null}
        </div>
        <div className="student-trial-lesson" style={{ minWidth: 0 }}>
          <div className="student-trial-group" title={groupLabel} style={{ color: theme.secondary, fontWeight: 850, fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{groupLabel}</div>
          <div className="student-trial-date" style={{ color: theme.textMuted, fontWeight: 750, fontSize: 11.5, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{formattedDate}{dayMarker ? <span style={{ color: theme.textLight }}> · {dayMarker}</span> : null}</div>
        </div>
        {statusButton(false)}
        <div className="student-trial-actions" style={{ position: "relative", justifySelf: "end" }}>
          <button type="button" aria-label={`Дії для ${displayName}`} aria-haspopup="menu" aria-expanded={actionsMenuOpen} onClick={() => setOpenTrialMenu(actionsMenuOpen ? null : `actions:${booking.id}`)} style={{ ...btnS, width: 38, height: 38, minHeight: 38, padding: 0, fontSize: 20, lineHeight: 1 }}>⋯</button>
          {actionsMenuOpen ? <div role="menu" className="student-trial-menu" style={{ position: "absolute", zIndex: 30, right: 0, top: "calc(100% + 5px)", width: 150, padding: 5, display: "grid", gap: 3, background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 12, boxShadow: "0 16px 38px rgba(15,23,42,.2)" }}>
            <button type="button" role="menuitem" onClick={() => { setEditItem(booking); setModal("editTrialBooking"); setOpenTrialMenu(null); }} style={{ ...btnS, border: 0, justifyContent: "flex-start", padding: "8px 9px", fontSize: 12 }}>Редагувати</button>
            <button type="button" role="menuitem" onClick={() => { setOpenTrialMenu(null); deleteTrialBooking(booking); }} style={{ ...btnS, border: 0, justifyContent: "flex-start", padding: "8px 9px", fontSize: 12, color: theme.danger }}>Видалити</button>
          </div> : null}
        </div>
      </div>
    );
  };

  const formatCalendarDate = (date, options) => new Intl.DateTimeFormat("uk-UA", options).format(date);
  const shortGroupName = (booking) => groupMap[booking.groupId]?.name || dirMap[groupMap[booking.groupId]?.directionId]?.name || booking.groupName || "Група";
  const statusColor = (status) => ({ new: theme.primary, contacted: theme.warning, confirmed: theme.success, came: theme.success, no_show: theme.danger, became_student: theme.secondary, declined: theme.textMuted, cancelled: theme.textLight }[status] || theme.textMuted);
  const openCalendarBooking = (booking) => { setSelectedTrialId(booking.id); setSelectedCalendarDay(localDateKey(booking.trialDate || booking.trial_date)); };
  const resetTrialFilters = () => { setTrialFilters({ search: "", status: "all", groupId: "all", directionId: "all", category: "all" }); setTrialSort("priority"); };

  const renderCalendarEvent = (booking, { month = false } = {}) => {
    const time = getTrialEventTime(booking, groupMap[booking.groupId]) || "—";
    const name = getTrialDisplayName(booking, studentMap, getDisplayName);
    const fullGroup = groupMap[booking.groupId] ? getInternalGroupLabel(groupMap[booking.groupId]) : shortGroupName(booking);
    return <button key={booking.id} type="button" className="trial-calendar-event" title={fullGroup} onClick={(event) => { event.stopPropagation(); openCalendarBooking(booking); }} style={{ width: "100%", border: `1px solid ${statusColor(booking.status)}44`, borderLeft: `3px solid ${statusColor(booking.status)}`, borderRadius: 8, padding: month ? "4px 5px" : "6px 7px", background: theme.card, color: theme.textMain, textAlign: "left", cursor: "pointer", minWidth: 0 }}>
      <div style={{ display: "flex", gap: 5, minWidth: 0, fontSize: month ? 10.5 : 11.5, fontWeight: 900 }}><span>{time}</span><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span></div>
      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: theme.textMuted, fontSize: 10.5, marginTop: 2 }}>{shortGroupName(booking)}</div>
      {!month && <div style={{ color: statusColor(booking.status), fontSize: 10, fontWeight: 900, marginTop: 3 }}>● {trialStatusLabels[booking.status] || booking.status}</div>}
    </button>;
  };

  const renderCalendarDetails = () => {
    const dayRows = selectedCalendarDay ? (calendarGroups[selectedCalendarDay] || []) : [];
    const chosen = dayRows.find((row) => String(row.id) === String(selectedTrialId));
    if (!selectedCalendarDay) return null;
    return <div className="trial-calendar-details" style={{ marginTop: 12, border: `1px solid ${theme.border}`, background: theme.bg, borderRadius: 16, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 9 }}><strong style={{ color: theme.textMain }}>{formatCalendarDate(new Date(`${selectedCalendarDay}T12:00:00`), { weekday: "long", day: "numeric", month: "long" })}</strong><button type="button" style={{ ...btnS, padding: "6px 10px" }} onClick={() => { setSelectedCalendarDay(null); setSelectedTrialId(null); }}>Закрити</button></div>
      {dayRows.length ? <div style={{ display: "grid", gap: 7 }}>{chosen ? renderTrialBookingCard(chosen, 0, { isHistory: false }) : dayRows.map((row, index) => renderTrialBookingCard(row, index, { isHistory: false }))}</div> : <div style={{ color: theme.textMuted }}>На цей день немає записів за активними фільтрами.</div>}
      {chosen && dayRows.length > 1 ? <button type="button" style={{ ...btnS, marginTop: 9 }} onClick={() => setSelectedTrialId(null)}>Показати всі за день ({dayRows.length})</button> : null}
    </div>;
  };

  const renderTrialCalendar = () => {
    const days = trialView === "week" ? buildWeekRange(calendarAnchor) : buildMonthRange(calendarAnchor);
    const rangeRows = days.flatMap((day) => calendarGroups[localDateKey(day)] || []);
    const title = trialView === "week"
      ? `${formatCalendarDate(days[0], { day: "numeric", month: "short" })} — ${formatCalendarDate(days[6], { day: "numeric", month: "short", year: "numeric" })}`
      : formatCalendarDate(calendarAnchor, { month: "long", year: "numeric" });
    const move = (amount) => setCalendarAnchor((current) => trialView === "week" ? addCalendarDays(current, amount * 7) : shiftCalendarMonth(current, amount));
    const activeDayKey = selectedCalendarDay && days.some((day) => localDateKey(day) === selectedCalendarDay) ? selectedCalendarDay : localDateKey(days.find((day) => localDateKey(day) === todayKey) || days[0]);
    return <div>
      <div className="trial-calendar-toolbar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, margin: "12px 0", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6 }}><button type="button" style={btnS} onClick={() => setCalendarAnchor(new Date())}>Сьогодні</button><button aria-label="Попередній період" type="button" style={btnS} onClick={() => move(-1)}>←</button><button aria-label="Наступний період" type="button" style={btnS} onClick={() => move(1)}>→</button></div>
        <strong style={{ color: theme.textMain, textTransform: "capitalize" }}>{title}</strong>
      </div>
      {trialView === "week" ? <>
        <div className="trial-week-desktop" style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", border: `1px solid ${theme.border}`, borderRadius: 14, overflow: "hidden" }}>{days.map((day) => { const key = localDateKey(day); const rows = calendarGroups[key] || []; const today = key === todayKey; return <div key={key} style={{ minHeight: 220, padding: 7, borderLeft: key === localDateKey(days[0]) ? 0 : `1px solid ${theme.border}`, background: today ? `${theme.primary}0d` : theme.input }}><button type="button" onClick={() => { setSelectedCalendarDay(key); setSelectedTrialId(null); }} style={{ width: "100%", border: 0, background: "transparent", color: today ? theme.primary : theme.textMain, fontWeight: 900, padding: "5px 2px 9px", cursor: "pointer" }}>{formatCalendarDate(day, { weekday: "short", day: "numeric", month: "short" })}</button><div style={{ display: "grid", gap: 5 }}>{rows.map((row) => renderCalendarEvent(row))}</div></div>; })}</div>
        <div className="trial-week-mobile"><div className="trial-week-strip" style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(42px, 1fr))", gap: 4, overflowX: "auto" }}>{days.map((day) => { const key = localDateKey(day); const active = key === activeDayKey; return <button key={key} type="button" onClick={() => { setSelectedCalendarDay(key); setSelectedTrialId(null); }} style={{ minHeight: 52, border: `1px solid ${active ? theme.primary : theme.border}`, borderRadius: 10, background: active ? `${theme.primary}18` : theme.card, color: active ? theme.primary : theme.textMuted, fontWeight: 900 }}><small>{formatCalendarDate(day, { weekday: "short" })}</small><br />{day.getDate()}</button>; })}</div><div style={{ display: "grid", gap: 7, marginTop: 10 }}>{(calendarGroups[activeDayKey] || []).map((row) => renderCalendarEvent(row))}{!(calendarGroups[activeDayKey] || []).length && <div style={{ color: theme.textMuted, padding: 18, textAlign: "center" }}>Немає записів цього дня.</div>}</div></div>
      </> : <div className="trial-month-grid" style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", border: `1px solid ${theme.border}`, borderRadius: 14, overflow: "hidden" }}>{["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "НД"].map((label) => <div className="trial-month-weekday" key={label} style={{ padding: 7, textAlign: "center", color: theme.textMuted, fontSize: 11, fontWeight: 900, borderBottom: `1px solid ${theme.border}` }}>{label}</div>)}{days.map((day) => { const key = localDateKey(day); const rows = calendarGroups[key] || []; const overflow = trialDayOverflow(rows); const muted = day.getMonth() !== calendarAnchor.getMonth(); const today = key === todayKey; return <div key={key} role="group" className="trial-month-day" style={{ minHeight: 116, padding: 6, border: 0, borderRight: `1px solid ${theme.border}`, borderBottom: `1px solid ${theme.border}`, background: muted ? `${theme.textLight}0b` : today ? `${theme.primary}0d` : theme.input, color: muted ? theme.textLight : today ? theme.primary : theme.textMain, textAlign: "left" }}><button type="button" aria-label={`Відкрити ${key}`} onClick={() => { setSelectedCalendarDay(key); setSelectedTrialId(null); }} style={{ border: 0, padding: 0, background: "transparent", color: "inherit", cursor: "pointer" }}><strong className="trial-month-number" style={{ display: "inline-grid", placeItems: "center", width: 27, height: 27, borderRadius: 99, background: today ? theme.primary : "transparent", color: today ? "#fff" : "inherit" }}>{day.getDate()}</strong></button><div className="trial-month-events" style={{ display: "grid", gap: 3, marginTop: 3 }}>{overflow.visible.map((row) => renderCalendarEvent(row, { month: true }))}{overflow.hiddenCount ? <button type="button" onClick={() => { setSelectedCalendarDay(key); setSelectedTrialId(null); }} style={{ border: 0, padding: 0, background: "transparent", color: theme.primary, fontSize: 11, fontWeight: 900, textAlign: "left", cursor: "pointer" }}>+{overflow.hiddenCount} ще</button> : null}</div><button type="button" onClick={() => { setSelectedCalendarDay(key); setSelectedTrialId(null); }} className="trial-month-mobile-count" style={{ border: 0, background: "transparent", width: "100%", color: theme.primary, fontSize: 11, fontWeight: 900 }}>{rows.length ? `${rows.length} под.` : ""}</button></div>; })}</div>}
      {!rangeRows.length ? <div style={{ marginTop: 12, padding: 22, border: `1px dashed ${theme.border}`, borderRadius: 14, textAlign: "center", color: theme.textMuted }}><strong style={{ display: "block", color: theme.textMain, marginBottom: 7 }}>У цьому періоді немає результатів</strong>Спробуйте інший період або скиньте активні фільтри.<br /><button type="button" style={{ ...btnS, marginTop: 10 }} onClick={resetTrialFilters}>Скинути фільтри</button></div> : null}
      {renderCalendarDetails()}
    </div>;
  };

  const renderWaitlistStatusSelector = (w, status, variant) => {
    const meta = waitlistStatusById[status] || waitlistStatusById.waiting;
    const isOpen = openWaitlistStatusId === w.id;
    return (
      <div className="student-waitlist-status-wrap" style={{ position: "relative", display: "inline-flex", maxWidth: "100%" }}>
        <button
          type="button"
          className="student-waitlist-status"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          onClick={(e) => { e.stopPropagation(); setOpenWaitlistStatusId(isOpen ? null : w.id); }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: variant === "mobile" ? "3px 7px" : "4px 8px",
            borderRadius: 999,
            border: `1px solid ${meta.color}44`,
            background: meta.background,
            color: meta.color,
            fontSize: 11.5,
            lineHeight: 1,
            fontWeight: 900,
            cursor: "pointer",
            maxWidth: "100%",
            whiteSpace: "nowrap",
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{meta.label}</span>
          <span aria-hidden="true" style={{ fontSize: 9 }}>▾</span>
        </button>
        {isOpen ? (
          <div role="menu" className="student-waitlist-status-menu" style={{ position: "absolute", zIndex: 20, right: 0, top: "calc(100% + 6px)", width: 210, maxWidth: "calc(100vw - 24px)", display: "grid", gap: 4, padding: 6, borderRadius: 14, border: `1px solid ${theme.border}`, background: theme.card, boxShadow: "0 18px 42px rgba(15,23,42,.18)" }}>
            {waitlistStatusActions.map((item) => {
              const selected = item.status === status;
              return (
                <button
                  key={item.status}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={(e) => { e.stopPropagation(); updateWaitlistStatus(w, item.status); }}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 34, borderRadius: 10, border: `1px solid ${selected ? item.color : "transparent"}`, background: selected ? item.background : "transparent", color: selected ? item.color : theme.textMain, padding: "7px 9px", fontSize: 12, fontWeight: 850, cursor: "pointer", textAlign: "left" }}
                >
                  <span>{item.label}</span>
                  <span style={{ color: item.color, width: 14, textAlign: "center" }}>{selected ? "✓" : ""}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  };

  const renderWaitlistCard = (w, index) => {
    const st = studentMap[w.studentId];
    const gr = groupMap[w.groupId];
    const direction = directionsList.find((d) => String(d.id) === String(w.directionId || gr?.directionId || ""));
    const displayName = st ? getDisplayName(st) : (w.name || "Новий контакт");
    const displayContact = w.contact || [st?.phone, st?.instagram, st?.telegram].filter(Boolean).join(" · ") || "контакт не вказано";
    const status = w.status || "waiting";
    const rawAddedDate = w.dateAdded || w.createdAt || w.created_at;
    const displayDate = rawAddedDate ? String(rawAddedDate).slice(0, 10) : "";

    return (
      <div key={w.id} className="student-waitlist-card" style={{
        background: theme.card,
        border: `1px solid ${theme.border}`,
        borderRadius: 16,
        padding: 12,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
        gap: 10,
        alignItems: "center",
        minWidth: 0,
        overflow: openWaitlistStatusId === w.id ? "visible" : undefined,
      }}>
        <div className="student-waitlist-main" style={{ display: "flex", gap: 9, alignItems: "flex-start", minWidth: 0 }}>
          <div className="student-waitlist-index" style={{
            width: 26,
            height: 26,
            borderRadius: 9,
            display: "grid",
            placeItems: "center",
            background: theme.input,
            color: theme.warning,
            fontSize: 12,
            fontWeight: 900,
            flex: "0 0 auto",
          }}>{index + 1}</div>
          <div style={{ minWidth: 0 }}>
            <div className="student-waitlist-name" style={{ color: theme.textMain, fontWeight: 900, fontSize: 15, lineHeight: 1.12, overflowWrap: "anywhere" }}>{displayName}</div>
            <div className="student-waitlist-contact" style={{ color: theme.textMuted, fontSize: 12.5, fontWeight: 650, marginTop: 3, overflowWrap: "anywhere" }}>{displayContact}</div>
            {w.note ? <div className="student-waitlist-note" style={{ color: theme.textLight, fontSize: 12, marginTop: 5, lineHeight: 1.25, overflowWrap: "anywhere" }}>Нотатка: {w.note}</div> : null}
          </div>
          <div className="student-waitlist-mobile-meta" style={{ display: "none" }}>
            {displayDate ? <span className="student-waitlist-date">{displayDate}</span> : null}
            {renderWaitlistStatusSelector(w, status, "mobile")}
          </div>
        </div>
        <div className="student-waitlist-info" style={{ minWidth: 0 }}>
          <div style={{ color: theme.textLight, fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>{gr ? "Група" : "Напрямок"}</div>
          <div className="student-waitlist-group" style={{ color: theme.secondary, fontWeight: 850, fontSize: 13.5, marginTop: 3, overflowWrap: "anywhere" }}>{gr?.name || direction?.name || "Без конкретної групи"}</div>
          {gr && direction ? <div className="student-waitlist-direction" style={{ color: theme.textMuted, fontSize: 12, fontWeight: 750, marginTop: 2, overflowWrap: "anywhere" }}>{direction.name}</div> : null}
          <div className="student-waitlist-desktop-status" style={{ marginTop: 6 }}>{renderWaitlistStatusSelector(w, status, "desktop")}</div>
        </div>
        <div className="student-waitlist-actions" style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", minWidth: 0 }}>
          <button style={{ ...btnS, padding: "8px 10px", fontSize: 12.5 }} onClick={() => { setEditItem(w); setModal("editWaitlist"); }}>Редагувати</button>
          {gr ? <button style={{ ...btnS, padding: "8px 10px", fontSize: 12.5 }} onClick={() => joinWaitlistEntry(w)}>Додати в групу</button> : null}
          <button style={{ ...btnS, padding: "8px 10px", fontSize: 12.5, color: theme.danger, background: theme.input }} onClick={() => removeWaitlistEntry(w)}>Прибрати</button>
        </div>
      </div>
    );
  };

  const waitlistModeRows = waitlistMode === "completed" ? completedWaitlist : activeWaitlist;
  const normalizedWaitlistSearch = String(searchQ || "").trim().toLowerCase();
  const filteredWaitlist = waitlistModeRows.filter((w) => {
    const st = studentMap[w.studentId];
    const gr = groupMap[w.groupId];
    const directionId = String(w.directionId || gr?.directionId || "");
    const haystack = [w.name, w.contact, w.note, st && getDisplayName(st), st?.phone, st?.telegram, st?.instagram, gr?.name, dirMap[directionId]?.name]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (normalizedWaitlistSearch && !haystack.includes(normalizedWaitlistSearch)) return false;
    if (stFilterDir !== "all" && directionId !== String(stFilterDir)) return false;
    if (stFilterGroup !== "all" && String(w.groupId || "") !== String(stFilterGroup)) return false;
    return true;
  });
  const groupedWaitlist = directionsList
    .map((direction) => ({
      direction,
      rows: filteredWaitlist.filter((w) => {
        const gr = groupMap[w.groupId];
        return String(w.directionId || gr?.directionId || "") === String(direction.id);
      }),
    }))
    .filter(({ rows }) => rows.length > 0);
  const waitlistWithoutDirection = filteredWaitlist.filter((w) => {
    const gr = groupMap[w.groupId];
    return !String(w.directionId || gr?.directionId || "");
  });
  const waitlistGroupsForRender = [
    ...groupedWaitlist,
    ...(waitlistWithoutDirection.length ? [{ direction: { id: "_none", name: "Без напрямку", color: theme.textMuted }, rows: waitlistWithoutDirection }] : []),
  ];

  const reserveGroupHints = groups.filter((g) => activeWaitlist.some((w) => String(w.groupId) === String(g.id))).map((g) => {
    const groupSubs = subsExt.filter((s) => String(s.groupId) === String(g.id));
    const hasExpiredOrNoActive = groupSubs.some((s) => ["4pack", "8pack", "12pack"].includes(String(s.planType || "").toLowerCase()) && s.status === "expired");
    const staleAttendance = studentGrps.filter((sg) => String(sg.groupId) === String(g.id)).some((sg) => {
      const lastDate = attn.filter((a) => String(a.groupId) === String(g.id) && String(a.studentId) === String(sg.studentId)).map((a) => a.date).sort().at(-1);
      if (!lastDate) return true;
      return ((Date.now() - new Date(lastDate).getTime()) / 86400000) >= 14;
    });
    const capacity = Number(g.capacity || 0);
    const activeCount = new Set(groupSubs.filter((s) => s.status !== "expired").map((s) => String(s.studentId))).size;
    const belowCapacity = capacity > 0 && activeCount < capacity;
    const signals = [hasExpiredOrNoActive && "є прострочені/неактивні абонементи", staleAttendance && "є неактивність 14+ днів", belowCapacity && `активних ${activeCount}/${capacity}`].filter(Boolean);
    if (!signals.length) return null;
    return { group: g, signals };
  }).filter(Boolean);

  return (
    <div className="students-crm-root" style={{ display: "grid", gap: 18, minWidth: 0, overflowX: "hidden" }}>
      <style>{`
        .students-crm-root, .students-crm-root * { box-sizing: border-box; }
        .students-mobile-only { display: none; }
        .student-trial-mobile-status, .trial-mobile-filter-button { display: none; }
        .student-trial-status-button:hover, .trial-category-chip:hover { filter: brightness(.97); }
        .trial-week-mobile, .trial-month-mobile-count { display: none; }
        .student-trial-status-button:focus-visible, .trial-category-chip:focus-visible, .student-trial-actions button:focus-visible { outline: 2px solid ${theme.primary}; outline-offset: 2px; }
        @media (max-width: 768px) {
          .students-crm-root { gap: 12px !important; margin-left: -10px; margin-right: -10px; padding: 0 2px calc(24px + env(safe-area-inset-bottom, 0px)); }
          .students-desktop-filters { display: none !important; }
          .students-mobile-only { display: grid !important; }
          .students-summary-grid { display: flex !important; gap: 8px !important; overflow-x: auto; padding: 2px 2px 8px; margin: 0 -2px; scrollbar-width: none; }
          .students-summary-grid::-webkit-scrollbar { display: none; }
          .students-summary-card { min-width: 132px !important; min-height: 78px !important; padding: 11px 12px !important; border-radius: 16px !important; }
          .students-summary-card-value { font-size: 23px !important; }
          .students-section { padding: 12px !important; border-radius: 20px !important; }
          .students-section-header { margin-bottom: 10px !important; }
          .students-section-title { font-size: 17px !important; }
          .students-section-subtitle { font-size: 12px !important; }
          .student-mobile-card { grid-template-columns: 1fr !important; gap: 10px !important; padding: 12px !important; border-radius: 16px !important; cursor: pointer; }
          .student-mobile-card > div:first-child { flex-wrap: nowrap !important; }
          .student-mobile-card .students-actions { justify-content: stretch !important; display: grid !important; grid-template-columns: 1fr auto !important; width: 100%; }
          .student-mobile-card .students-actions select { width: 100% !important; grid-column: 1 / -1; }
          .student-mobile-card .students-actions button { min-height: 44px !important; }
          .student-trial-card, .student-waitlist-card { grid-template-columns: 1fr !important; padding: 12px !important; gap: 12px !important; }
          .student-waitlist-card { padding: 8px 9px !important; gap: 6px !important; border-radius: 13px !important; align-items: start !important; min-width: 0 !important; overflow: hidden !important; }
          .student-waitlist-card:has(.student-waitlist-status-menu) { overflow: visible !important; }
          .student-waitlist-main { display: grid !important; grid-template-columns: 22px minmax(0, 1fr) auto !important; gap: 7px !important; align-items: start !important; min-width: 0 !important; }
          .student-waitlist-main > div:nth-child(2) { min-width: 0 !important; overflow: hidden !important; }
          .student-waitlist-mobile-meta { display: flex !important; flex-direction: column; align-items: flex-end; gap: 4px; min-width: 48px; max-width: 82px; }
          .student-waitlist-date { color: ${theme.textLight}; font-size: 10.5px; font-weight: 850; line-height: 1; white-space: nowrap; }
          .student-waitlist-desktop-status { display: none !important; }
          .student-waitlist-index { width: 22px !important; height: 22px !important; border-radius: 7px !important; font-size: 10.5px !important; margin-top: 1px; }
          .student-waitlist-name, .student-waitlist-contact, .student-waitlist-note, .student-waitlist-group, .student-waitlist-direction { white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; }
          .student-waitlist-name { font-size: 14px !important; line-height: 1.08 !important; }
          .student-waitlist-contact { font-size: 11.5px !important; margin-top: 1px !important; line-height: 1.18 !important; }
          .student-waitlist-note { display: block !important; font-size: 11.5px !important; line-height: 1.15 !important; margin-top: 2px !important; }
          .student-waitlist-note::before { content: none !important; }
          .student-waitlist-info { display: flex !important; gap: 5px !important; align-items: center !important; min-width: 0 !important; overflow: hidden !important; }
          .student-waitlist-info > div:first-child { display: none !important; }
          .student-waitlist-group, .student-waitlist-direction { font-size: 12px !important; line-height: 1.15 !important; margin-top: 0 !important; min-width: 0 !important; }
          .student-waitlist-group { flex: 1 1 auto; }
          .student-waitlist-direction { flex: 0 1 auto; }
          .student-waitlist-direction::before { content: "· "; color: ${theme.textLight}; }
          .student-waitlist-status { padding: 3px 7px !important; font-size: 11px !important; margin-top: 0 !important; }
          .student-waitlist-actions { justify-content: stretch !important; width: 100%; gap: 5px !important; min-width: 0 !important; }
          .student-waitlist-actions button { min-height: 36px !important; flex: 1 1 96px; min-width: 0 !important; padding: 6px 7px !important; font-size: 11.5px !important; line-height: 1.05 !important; white-space: normal !important; }
          .trial-column-header { display: none !important; }
          .student-trial-card { grid-template-columns: minmax(0, 1fr) auto !important; padding: 10px !important; gap: 7px 9px !important; align-items: center !important; min-height: 0 !important; overflow: visible !important; }
          .student-trial-main { grid-column: 1 / -1; min-width: 0 !important; }
          .student-trial-mobile-status { display: block !important; flex: 0 0 auto; }
          .student-trial-desktop-status { display: none !important; }
          .student-trial-name { font-size: 15px !important; line-height: 1.12 !important; }
          .student-trial-contact { margin-top: 3px !important; font-size: 11.5px !important; }
          .student-trial-note { margin-top: 3px !important; }
          .student-trial-lesson { grid-column: 1; }
          .student-trial-group { font-size: 12.5px !important; }
          .student-trial-actions { grid-column: 2; grid-row: 2; }
          .student-trial-actions > button { width: 42px !important; height: 42px !important; }
          .trial-filter-grid { grid-template-columns: 1fr auto !important; }
          .trial-filter-grid > * { width: 100% !important; min-width: 0 !important; }
          .trial-filter-grid .trial-extra-filter { display: none !important; }
          .trial-filter-grid.is-open .trial-extra-filter { display: block !important; grid-column: 1 / -1; }
          .trial-mobile-filter-button { display: block !important; width: auto !important; min-height: 42px; }
          .trial-view-switch { width: 100% !important; grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
          .trial-view-switch button { padding: 9px 6px !important; font-size: 12px; }
          .trial-week-desktop { display: none !important; }
          .trial-week-mobile { display: block !important; }
          .trial-month-day { min-height: 58px !important; padding: 4px !important; }
          .trial-month-weekday { padding: 5px 1px !important; font-size: 10px !important; }
          .trial-month-number { width: 26px !important; height: 26px !important; }
          .trial-month-events { display: none !important; }
          .trial-month-mobile-count { display: block !important; text-align: center; }
          .trial-calendar-toolbar { align-items: flex-start !important; }
          .students-filter-sheet { position: fixed; inset: auto 8px calc(8px + env(safe-area-inset-bottom, 0px)) 8px; z-index: 900; border-radius: 20px; max-height: min(76dvh, 620px); overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 24px 60px rgba(15,23,42,.24); }
          .students-filter-backdrop { position: fixed; inset: 0; z-index: 899; background: rgba(15,23,42,.28); }
          .students-mobile-filter-grid { display: grid; gap: 10px; overflow-y: auto; padding: 12px; -webkit-overflow-scrolling: touch; }
          .students-mobile-filter-grid select, .students-mobile-filter-grid input { width: 100% !important; max-width: none !important; min-width: 0 !important; }
          .students-mobile-primary-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr)); gap: 8px; width: 100%; }
          .students-mobile-primary-actions button { min-width: 0; min-height: 46px !important; padding: 0 12px !important; white-space: normal !important; line-height: 1.15 !important; overflow-wrap: anywhere; }
        }
      `}</style>
      <div className="students-mobile-only" style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 20, padding: 12, gap: 10, boxShadow: "0 10px 30px rgba(168, 177, 206, 0.12)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, color: theme.textMain, fontSize: 22, lineHeight: 1.05, fontWeight: 950 }}>Учениці</h2>
            <div style={{ marginTop: 4, color: theme.textMuted, fontSize: 12, fontWeight: 800 }}>{allVisibleStudentsCount} профілів</div>
          </div>
          <button type="button" style={{ ...btnP, minHeight: 44, padding: "0 14px", boxShadow: "none", whiteSpace: "nowrap" }} onClick={() => setModal("addStudent")}>+ Учениця</button>
        </div>
        <div className="students-mobile-primary-actions">
          <button type="button" style={{ ...btnP, background: theme.primary, boxShadow: "none" }} onClick={() => setModal("addTrialBooking")}>+ Запис на пробне</button>
          <button type="button" style={{ ...btnP, background: theme.warning, boxShadow: "none" }} onClick={() => setModal("addWaitlist")}>+ В резерв</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
          <div style={{ position: "relative", minWidth: 0 }}>
            <input style={{ ...inputSt, width: "100%", maxWidth: "none", minWidth: 0, height: 44, paddingRight: searchQ ? 42 : inputSt.padding }} placeholder="Пошук учениці..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
            {searchQ ? <button type="button" aria-label="Очистити пошук" onClick={() => setSearchQ("")} style={{ position: "absolute", right: 5, top: 5, width: 34, height: 34, border: "none", borderRadius: 999, background: theme.input, color: theme.textMuted, fontWeight: 900 }}>×</button> : null}
          </div>
          <button type="button" style={{ ...btnS, minHeight: 44, padding: "0 12px", position: "relative" }} onClick={() => setMobileFiltersOpen(true)}>Фільтри{activeFilterCount ? <span style={{ marginLeft: 6, display: "inline-flex", minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", borderRadius: 999, background: theme.primary, color: "#fff", fontSize: 11, fontWeight: 900 }}>{activeFilterCount}</span> : null}</button>
        </div>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
          {summaryCards.slice(0, 4).map((card) => <button key={`quick_${card.filter}`} type="button" onClick={() => toggleSummaryFilter(card.filter)} style={{ border: `1px solid ${selectedSummaryFilter === card.filter ? card.color : theme.border}`, background: selectedSummaryFilter === card.filter ? `${card.color}18` : theme.input, color: selectedSummaryFilter === card.filter ? card.color : theme.textMuted, borderRadius: 999, padding: "8px 11px", whiteSpace: "nowrap", fontSize: 12, fontWeight: 900 }}>{card.label}</button>)}
        </div>
      </div>
      {mobileFiltersOpen ? <div className="students-filter-backdrop students-mobile-only" onClick={() => setMobileFiltersOpen(false)} /> : null}
      {mobileFiltersOpen ? <div className="students-filter-sheet students-mobile-only" style={{ background: theme.card, border: `1px solid ${theme.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderBottom: `1px solid ${theme.border}` }}><strong>Фільтри учениць</strong><button type="button" style={{ ...btnS, minHeight: 38, padding: "0 12px" }} onClick={() => setMobileFiltersOpen(false)}>Готово</button></div>
        <div className="students-mobile-filter-grid">
          <button type="button" style={{ ...btnS, minHeight: 42, background: selectedSummaryFilter === "all" ? theme.secondary : theme.bg, color: selectedSummaryFilter === "all" ? "#fff" : theme.textMain }} onClick={() => setSelectedSummaryFilter("all")}>Всі</button>
          <select style={{ ...inputSt }} value={stFilterDir} onChange={e => { setStFilterDir(e.target.value); setStFilterGroup("all"); }}><option value="all">Усі напрямки</option>{directionsList.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          <GroupSelect groups={groups} value={stFilterGroup} onChange={setStFilterGroup} filterDir={stFilterDir} allowAll={true} />
          <button type="button" style={{ ...btnS, minHeight: 42, color: activeFilterCount ? theme.danger : theme.textMuted }} onClick={resetStudentFilters}>Скинути</button>
        </div>
      </div> : null}
      <div className="students-summary-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))", gap: 12 }}>
        {summaryCards.map((card) => {
          const isSelected = selectedSummaryFilter === card.filter;
          return (
            <button
              key={card.filter}
              type="button"
              onClick={() => toggleSummaryFilter(card.filter)}
              aria-pressed={isSelected}
              className="students-summary-card"
              style={{
                background: `linear-gradient(135deg, ${theme.card}, ${theme.input})`,
                border: `1px solid ${isSelected ? card.color : theme.border}`,
                borderRadius: 18,
                padding: "14px 15px",
                minHeight: 96,
                boxShadow: isSelected ? `0 0 0 3px ${card.color}22, 0 12px 30px rgba(15, 23, 42, 0.08)` : "0 12px 30px rgba(15, 23, 42, 0.08)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: 10,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <span style={{ color: isSelected ? card.color : theme.textMuted, fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em" }}>{card.label}</span>
                <span style={{ width: 9, height: 9, borderRadius: 99, background: card.color, boxShadow: `0 0 0 4px ${card.color}18` }} />
              </div>
              <div>
                <div className="students-summary-card-value" style={{ color: theme.textMain, fontSize: 28, lineHeight: 1, fontWeight: 950 }}>{card.value}</div>
                <div style={{ color: theme.textLight, fontSize: 11, fontWeight: 650, marginTop: 7, lineHeight: 1.25 }}>{card.hint}</div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="students-desktop-filters" style={{
        display: "flex",
        gap: 12,
        flexWrap: "wrap",
        justifyContent: "space-between",
        alignItems: "center",
        background: theme.card,
        padding: 14,
        borderRadius: 22,
        border: `1px solid ${theme.border}`,
        boxShadow: "0 10px 30px rgba(168, 177, 206, 0.12)",
      }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", flex: "1 1 520px", alignItems: "center" }}>
          <button
            type="button"
            style={{ ...btnS, minHeight: 42, padding: "10px 14px", background: selectedSummaryFilter === "all" ? theme.secondary : theme.bg, color: selectedSummaryFilter === "all" ? "#fff" : theme.textMain }}
            onClick={() => setSelectedSummaryFilter("all")}
          >
            Всі
          </button>
          <input style={{ ...inputSt, flex: "1 1 220px", minWidth: 180, maxWidth: 340 }} placeholder="Пошук учениці..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
          <select style={{ ...inputSt, flex: "0 1 190px", minWidth: 160 }} value={stFilterDir} onChange={e => { setStFilterDir(e.target.value); setStFilterGroup("all") }}>
            <option value="all">Усі напрямки</option>
            {directionsList.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <div style={{ flex: "1 1 210px", minWidth: 180 }}>
            <GroupSelect groups={groups} value={stFilterGroup} onChange={setStFilterGroup} filterDir={stFilterDir} allowAll={true} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button style={{ ...btnP, background: theme.primary, boxShadow: "none", minHeight: 42, flex: "0 0 auto" }} onClick={() => setModal("addTrialBooking")}>+ Запис на пробне</button>
          <button style={{ ...btnP, background: theme.warning, boxShadow: "none", minHeight: 42, flex: "0 0 auto" }} onClick={() => setModal("addWaitlist")}>+ В резерв</button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 18 }}>
        {shouldShowActiveSection && (
          <section className="students-section" style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 26, padding: 18 }}>
            {renderSectionHeader("Активні учениці", visibleActiveStudentCount, "Учениці згруповані за напрямками", theme.secondary)}
            {visibleGroupedStudents.length > 0 ? (
              <div style={{ display: "grid", gap: 12 }}>
                {visibleGroupedStudents.map(({ direction, students: dStudents }) => {
                  const isExpanded = expandedDirs[direction.id];
                  return (
                    <div key={direction.id} style={{ background: theme.bg, borderRadius: 20, overflow: "hidden", border: `1px solid ${theme.border}` }}>
                      <button onClick={() => setExpandedDirs(p => ({ ...p, [direction.id]: !p[direction.id] }))} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "16px 18px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <span style={{ width: 10, height: 10, borderRadius: 99, background: direction.color }} />
                          <span style={{ fontSize: 17, fontWeight: 900, color: theme.textMain }}>{direction.name}</span>
                          <span style={{ borderRadius: 999, padding: "4px 9px", background: `${direction.color}18`, color: direction.color, fontSize: 12, fontWeight: 900 }}>{dStudents.length}</span>
                        </div>
                        <div style={{ color: theme.textLight, fontSize: 16, fontWeight: 900 }}>{isExpanded ? "▲" : "▼"}</div>
                      </button>
                      {isExpanded && (
                        <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                          {dStudents.map((st, index) => renderStudentCard(st, index))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (selectedSummaryFilter === "all" ? null : filterEmptyState)}
          </section>
        )}

        {shouldShowTrialSection && (
          <section className="students-section" style={{ background: theme.input, border: `1px solid ${theme.border}`, borderRadius: 26, padding: 18 }}>
            {renderSectionHeader("Пробні заняття", activeTrialBookings.length, "Прострочені, сьогоднішні та заплановані записи", theme.primary || "#2563eb")}
            <div className="trial-view-switch" role="group" aria-label="Вигляд пробних занять" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, auto))", width: "fit-content", maxWidth: "100%", padding: 4, gap: 3, borderRadius: 12, background: theme.card, border: `1px solid ${theme.border}`, marginBottom: 11 }}>
              {[["list", "Список"], ["week", "Тиждень"], ["month", "Місяць"]].map(([id, label]) => <button key={id} type="button" aria-pressed={trialView === id} onClick={() => setTrialView(id)} style={{ border: 0, borderRadius: 9, padding: "8px 13px", background: trialView === id ? theme.primary : "transparent", color: trialView === id ? "#fff" : theme.textMuted, fontWeight: 900, cursor: "pointer", minWidth: 0 }}>{label}</button>)}
            </div>
            <div className={`trial-filter-grid${trialFiltersOpen ? " is-open" : ""}`} style={{ display: "grid", gridTemplateColumns: "minmax(210px, 2fr) repeat(4, minmax(130px, 1fr)) auto", gap: 8, marginBottom: 11 }}>
              <input aria-label="Пошук пробних" style={{ ...inputSt, minWidth: 0 }} placeholder="Ім’я, телефон, Telegram, Instagram" value={trialFilters.search} onChange={(e) => setTrialFilters((prev) => ({ ...prev, search: e.target.value }))} />
              <button className="trial-mobile-filter-button" type="button" style={{ ...btnS, whiteSpace: "nowrap" }} aria-expanded={trialFiltersOpen} onClick={() => setTrialFiltersOpen((open) => !open)}>Фільтри{[trialFilters.status, trialFilters.groupId, trialFilters.directionId].filter((value) => value !== "all").length ? ` · ${[trialFilters.status, trialFilters.groupId, trialFilters.directionId].filter((value) => value !== "all").length}` : ""}</button>
              <select className="trial-extra-filter" aria-label="Статус пробного" style={inputSt} value={trialFilters.status} onChange={(e) => setTrialFilters((prev) => ({ ...prev, status: e.target.value }))}><option value="all">Усі статуси</option>{Object.entries(trialStatusLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
              <div className="trial-extra-filter"><GroupSelect groups={groups} directionsList={directionsList} value={trialFilters.groupId} onChange={(groupId) => setTrialFilters((prev) => ({ ...prev, groupId }))} allowAll /></div>
              <select className="trial-extra-filter" aria-label="Напрямок пробного" style={inputSt} value={trialFilters.directionId} onChange={(e) => setTrialFilters((prev) => ({ ...prev, directionId: e.target.value }))}><option value="all">Усі напрямки</option>{directionsList.map((direction) => <option key={direction.id} value={direction.id}>{direction.name}</option>)}</select>
              <select className="trial-extra-filter" aria-label="Сортування" style={inputSt} value={trialSort} onChange={(e) => setTrialSort(e.target.value)}><option value="priority">Сортування: За пріоритетом</option><option value="date_asc">Дата: спочатку найближчі</option><option value="date_desc">Дата: спочатку нові</option><option value="name">Ім’я: А–Я</option><option value="status">За статусом</option><option value="group">За групою</option></select>
              <button className="trial-extra-filter" type="button" style={{ ...btnS, whiteSpace: "nowrap" }} onClick={() => { setTrialFilters({ search: "", status: "all", groupId: "all", directionId: "all", category: "all" }); setTrialSort("priority"); }}>Скинути</button>
            </div>
            <div role="group" aria-label="Категорії пробних" style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 11 }}>
              {[["overdue", "Потребують рішення"], ["today", "Сьогодні"], ["upcoming", "Заплановані"], ["history", "Історія"]].map(([id, label]) => {
                const selected = trialFilters.category === id;
                return <button type="button" className="trial-category-chip" aria-pressed={selected} key={id} onClick={() => setTrialFilters((prev) => ({ ...prev, category: selected ? "all" : id }))} style={{ border: `1px solid ${selected ? theme.primary : theme.border}`, borderRadius: 999, padding: "6px 10px", background: selected ? `${theme.primary}18` : theme.card, color: selected ? theme.primary : theme.textMuted, fontSize: 12, fontWeight: 850, cursor: "pointer" }}>{label} <strong>{allTrialCategories[id].length}</strong></button>;
              })}
            </div>
            {trialView === "list" ? [["overdue", "Потребують рішення"], ["today", "Сьогодні"], ["upcoming", "Заплановані"]]
              .filter(([id]) => trialFilters.category === "all" || trialFilters.category === id)
              .map(([id, label]) => (
                <div key={id} style={{ marginTop: 14 }}>
                  <h3 style={{ color: theme.textMain, fontSize: 15, margin: "0 0 8px" }}>{label} <span style={{ color: theme.textLight }}>· {trialCategories[id].length}</span></h3>
                  {trialCategories[id].length ? <div style={{ display: "grid", gap: 5 }}><div className="trial-column-header" style={{ display: "grid", gridTemplateColumns: "minmax(210px, 1.45fr) minmax(190px, 1.25fr) minmax(125px, .65fr) 42px", gap: 12, padding: "0 11px 2px", color: theme.textLight, fontSize: 10.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".04em" }}><span>Контакт</span><span>Група / дата</span><span>Статус</span><span>Дії</span></div>{trialCategories[id].map((booking, i) => renderTrialBookingCard(booking, i))}</div> : <div style={{ color: theme.textLight, fontSize: 13, padding: "8px 0" }}>Немає записів.</div>}
                </div>
              )) : renderTrialCalendar()}
          </section>
        )}

        {shouldShowTrialSection && trialView === "list" && ["all", "history"].includes(trialFilters.category) && (
          <section className="students-section" style={{ background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 26, padding: 18 }}>
            <details open={shouldExpandTrialHistory(trialFilters.category)}>
              <summary style={{ cursor: "pointer", listStyle: "none" }}>
                {renderSectionHeader("Історія пробних", allTrialCategories.history.length, "Завершені та закриті записи на пробне", theme.textMuted)}
              </summary>
              {trialCategories.history.length > 0 ? (
                <div style={{ display: "grid", gap: 5 }}>
                  <div className="trial-column-header" style={{ display: "grid", gridTemplateColumns: "minmax(210px, 1.45fr) minmax(190px, 1.25fr) minmax(125px, .65fr) 42px", gap: 12, padding: "0 11px 2px", color: theme.textLight, fontSize: 10.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".04em" }}><span>Контакт</span><span>Група / дата</span><span>Статус</span><span>Дії</span></div>
                  {trialCategories.history.map((booking, i) => renderTrialBookingCard(booking, i, { isHistory: true }))}
                </div>
              ) : (
                <div style={{ background: theme.card, border: `1px dashed ${theme.border}`, borderRadius: 18, padding: 22, color: theme.textMuted, fontWeight: 800, textAlign: "center" }}>Історія пробних поки порожня.</div>
              )}
            </details>
          </section>
        )}

        {shouldShowReserveSection && (
          <section className="students-section" style={{ background: theme.input, border: `1px solid ${theme.border}`, borderRadius: 26, padding: 18 }}>
            {renderSectionHeader("Резерв / потенційні", filteredWaitlist.length, "Активні та завершені заявки резерву", theme.warning || "#f59e0b")}
            {reserveGroupHints.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: theme.textMain, marginBottom: 8 }}>Сигнали по групах</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {reserveGroupHints.map(({ group, signals }) => (
                    <div key={`reserve_hint_${group.id}`} style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 14, padding: "10px 12px", color: theme.textMuted, fontSize: 13, lineHeight: 1.35 }}>
                      <strong style={{ color: theme.textMain }}>{group.name}</strong>: {signals.join(" · ")}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="student-waitlist-mode" style={{ display: "inline-flex", gap: 4, padding: 4, borderRadius: 999, background: theme.card, border: `1px solid ${theme.border}`, marginBottom: 14 }}>
              {[
                ["active", `Активні ${activeWaitlist.length}`],
                ["completed", `Завершені ${completedWaitlist.length}`],
              ].map(([mode, label]) => (
                <button key={mode} type="button" aria-pressed={waitlistMode === mode} onClick={() => setWaitlistMode(mode)} style={{ border: "none", borderRadius: 999, padding: "7px 11px", background: waitlistMode === mode ? (theme.warning || "#f59e0b") : "transparent", color: waitlistMode === mode ? "#fff" : theme.textMuted, fontSize: 12, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap" }}>{label}</button>
              ))}
            </div>
            {filteredWaitlist.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {waitlistGroupsForRender.map(({ direction, rows }) => (
                  <div key={`waitlist_${direction.id}`} style={{ display: "grid", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: theme.textMain, fontSize: 13, fontWeight: 900 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 99, background: direction.color || theme.warning }} />
                      <span>{direction.name}</span>
                      <span style={{ color: theme.textLight }}>{rows.length}</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {rows.map((w, i) => renderWaitlistCard(w, i))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (selectedSummaryFilter === "reserve" ? filterEmptyState : (
              <div style={{ background: theme.card, border: `1px dashed ${theme.border}`, borderRadius: 18, padding: 22, color: theme.textMuted, fontWeight: 800, textAlign: "center" }}>{waitlistMode === "active" ? "Активного резерву поки немає." : "Завершених записів резерву поки немає."}</div>
            ))}
          </section>
        )}

        {shouldShowArchiveSection && (
          <section className="students-section" style={{ background: theme.archive, border: `1px solid ${theme.border}`, borderRadius: 26, padding: 18 }}>
            {renderSectionHeader("Архів / неактивні", visibleArchiveStudents.length, "Окрема зона для відновлення або редагування профілів", theme.textMuted)}
            {visibleArchiveStudents.length > 0 ? (
              <div style={{ background: theme.card, borderRadius: 20, overflow: "hidden", border: `1px solid ${theme.border}` }}>
                <button onClick={() => setExpandedDirs(p => ({ ...p, archive: !p.archive }))} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 18px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: theme.textMuted }}>Показати неактивних</div>
                  <div style={{ color: theme.textLight, fontSize: 16, fontWeight: 900 }}>{expandedDirs.archive ? "▲" : "▼"}</div>
                </button>
                {expandedDirs.archive && (
                  <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                    {visibleArchiveStudents.map((st, index) => renderStudentCard(st, index, { isArchive: true }))}
                  </div>
                )}
              </div>
            ) : (selectedSummaryFilter === "archive" ? filterEmptyState : (
              <div style={{ background: theme.card, border: `1px dashed ${theme.border}`, borderRadius: 18, padding: 18, color: theme.textMuted, fontWeight: 800, textAlign: "center" }}>Архів порожній.</div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
