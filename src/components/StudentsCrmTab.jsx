import React from "react";
import * as db from "../db";

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
  const [reserveSearch, setReserveSearch] = React.useState("");
  const [reserveFilterDir, setReserveFilterDir] = React.useState("all");
  const [reserveFilterGroup, setReserveFilterGroup] = React.useState("all");
  const [collapsedReserveDirs, setCollapsedReserveDirs] = React.useState({});

  const activeWaitlist = waitlist.filter((w) => ["waiting", "contacted"].includes(String(w.status || "waiting")));
  const activeTrialBookingStatuses = new Set(["new", "contacted", "confirmed"]);
  const activeTrialBookings = trialBookings.filter((booking) => activeTrialBookingStatuses.has(String(booking.status || "new")));
  const trialHistoryStatuses = new Set(["no_show", "declined", "cancelled", "came", "became_student"]);
  const trialBookingsHistory = trialBookings.filter((booking) => trialHistoryStatuses.has(String(booking.status || "new")));

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

  const markWaitlistContacted = async (w) => {
    try {
      const next = await db.updateWaitlist(w.id, { status: "contacted" });
      updateWaitlistRow(next);
    } catch (e) {
      console.error("Failed to mark waitlist entry as contacted:", e);
      alert(`Не вдалося оновити резерв: ${e?.message || e}`);
    }
  };

  const removeWaitlistEntry = async (w) => {
    try {
      const next = await db.updateWaitlist(w.id, { status: "removed" });
      updateWaitlistRow(next);
    } catch (e) {
      console.error("Failed to remove waitlist entry:", e);
      alert(`Не вдалося прибрати з резерву: ${e?.message || e}`);
    }
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
    { filter: "reserve", label: "Резерв", value: activeWaitlist.length, hint: "waiting / contacted", color: theme.warning || "#f59e0b" },
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
  const normalizeReserveText = (value) => String(value || "").trim().toLowerCase();
  const getWaitlistGroup = (w) => groupMap[w.groupId] || null;
  const getWaitlistDirectionId = (w) => String(w.directionId || getWaitlistGroup(w)?.directionId || "");
  const getWaitlistDirection = (w) => {
    const directionId = getWaitlistDirectionId(w);
    return directionsList.find((d) => String(d.id) === directionId) || dirMap[directionId] || (directionId ? { id: directionId, name: directionId, color: theme.warning || "#f59e0b" } : { id: "__no_direction__", name: "Без напрямку", color: theme.textMuted });
  };
  const getWaitlistDisplayName = (w) => {
    const st = studentMap[w.studentId];
    return st ? getDisplayName(st) : (w.name || "Новий контакт");
  };
  const getWaitlistDisplayContact = (w) => {
    const st = studentMap[w.studentId];
    return w.contact || [st?.phone, st?.instagram, st?.telegram].filter(Boolean).join(" · ") || "контакт не вказано";
  };
  const formatWaitlistDate = (w) => {
    const raw = w.dateAdded || w.createdAt || w.created_at;
    if (!raw) return "Дата не вказана";
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? String(raw).slice(0, 10) : date.toLocaleDateString("uk-UA");
  };
  const reserveDirections = directionsList.filter((direction) => (
    activeWaitlist.some((w) => getWaitlistDirectionId(w) === String(direction.id))
    || groups.some((g) => String(g.directionId) === String(direction.id))
  ));
  const reserveGroups = groups.filter((group) => reserveFilterDir === "all" || String(group.directionId) === String(reserveFilterDir));
  const reserveFilterCount = [reserveSearch.trim(), reserveFilterDir !== "all", reserveFilterGroup !== "all"].filter(Boolean).length;
  const resetReserveFilters = () => {
    setReserveSearch("");
    setReserveFilterDir("all");
    setReserveFilterGroup("all");
  };
  const visibleWaitlist = activeWaitlist.filter((w) => {
    const group = getWaitlistGroup(w);
    const direction = getWaitlistDirection(w);
    const directionId = getWaitlistDirectionId(w);
    if (reserveFilterDir !== "all" && directionId !== String(reserveFilterDir)) return false;
    if (reserveFilterGroup !== "all" && String(w.groupId || "") !== String(reserveFilterGroup)) return false;
    const query = normalizeReserveText(reserveSearch);
    if (!query) return true;
    return [
      getWaitlistDisplayName(w),
      getWaitlistDisplayContact(w),
      group?.name,
      direction?.name,
      w.note,
      w.status,
    ].some((value) => normalizeReserveText(value).includes(query));
  });
  const groupedWaitlist = reserveDirections
    .map((direction) => ({
      direction,
      entries: visibleWaitlist.filter((w) => getWaitlistDirectionId(w) === String(direction.id)),
    }))
    .filter(({ entries }) => entries.length > 0);
  const unassignedWaitlist = visibleWaitlist.filter((w) => !getWaitlistDirectionId(w));
  if (unassignedWaitlist.length) {
    groupedWaitlist.push({ direction: { id: "__no_direction__", name: "Без напрямку", color: theme.textMuted }, entries: unassignedWaitlist });
  }


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
              <option key={g.id} value={g.id}>{g.name}</option>
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
    const displayName = st ? getDisplayName(st) : (booking.name || "Новий контакт");
    const displayContact = [booking.phone, booking.telegram, booking.instagram, booking.contact].filter(Boolean).join(" · ") || [st?.phone, st?.instagram, st?.telegram].filter(Boolean).join(" · ") || "контакт не вказано";
    const status = booking.status || "new";

    const statusHint = status === "cancelled"
      ? "Скасовано — запис скасували або він неактуальний."
      : status === "declined"
        ? "Відмова — людина відмовилась / передумала."
        : "";

    return (
      <div key={booking.id} className="student-trial-card" style={{
        background: theme.card,
        border: `1px solid ${theme.border}`,
        borderRadius: 18,
        padding: 16,
        display: "grid",
        gridTemplateColumns: "minmax(220px, 1.5fr) minmax(170px, 1fr) minmax(240px, 1.3fr)",
        gap: 14,
        alignItems: "start",
      }}>
        <div className="student-trial-main" style={{ display: "flex", gap: 12, alignItems: "flex-start", minWidth: 0 }}>
          <div className="student-trial-index" style={{
            width: 30,
            height: 30,
            borderRadius: 10,
            display: "grid",
            placeItems: "center",
            background: theme.input,
            color: theme.primary,
            fontSize: 13,
            fontWeight: 900,
            flex: "0 0 auto",
          }}>{index + 1}</div>
          <div style={{ minWidth: 0 }}>
            <div className="student-trial-name" style={{ color: theme.textMain, fontWeight: 900, fontSize: 16 }}>{displayName}</div>
            <div className="student-trial-contact" style={{ color: theme.textMuted, fontSize: 13, fontWeight: 650, marginTop: 5, overflowWrap: "anywhere" }}>{displayContact}</div>
            {booking.note ? <div className="student-trial-note" style={{ color: theme.textLight, fontSize: 12, marginTop: 7, lineHeight: 1.35 }}>Нотатка: {booking.note}</div> : null}
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="student-trial-meta-label" style={{ color: theme.textLight, fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>Пробне заняття</div>
          <div className="student-trial-group" style={{ color: theme.secondary, fontWeight: 850, fontSize: 14, marginTop: 5 }}>{gr?.name || "Група не вказана"}</div>
          <div className="student-trial-date" style={{ color: theme.textMuted, fontWeight: 800, fontSize: 13, marginTop: 5 }}>{booking.trialDate || "Дата не вказана"}</div>
          <div className="student-trial-mobile-meta" style={{ display: "none", color: theme.secondary, fontWeight: 850 }}>{gr?.name || "Група не вказана"} <span style={{ color: theme.textMuted }}>• {booking.trialDate || "Дата не вказана"}</span></div>
        </div>
        <div className="student-trial-controls" style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "flex-start", minWidth: 0 }}>
          <div className="student-trial-status-row" style={{ display: "grid", gap: 8, justifyItems: "end", width: "100%" }}>
            <span style={{ display: "inline-flex", padding: "5px 9px", borderRadius: 999, background: "rgba(37, 99, 235, 0.14)", color: theme.primary, fontSize: 12, fontWeight: 900 }}>{trialStatusLabels[status] || status}</span>
            {statusHint ? <div className="student-trial-status-hint" title={statusHint} style={{ color: theme.textLight, fontSize: 11, fontWeight: 700, textAlign: "right" }}>{statusHint}</div> : null}
          </div>
          <label className="student-trial-status-label" style={{ display: "grid", gap: 6, justifyItems: "end", width: "100%", color: theme.textMuted, fontSize: 12, fontWeight: 800 }}>
              Змінити статус
              <select
                value=""
                onChange={(e) => {
                  const nextStatus = e.target.value;
                  if (!nextStatus) return;
                  updateTrialBookingStatus(booking, nextStatus);
                  e.target.value = "";
                }}
                style={{ ...inputSt, minWidth: 190, width: "100%", maxWidth: 260, height: 34, fontSize: 12, borderRadius: 10, padding: "0 10px" }}
              >
                <option value="">Оберіть статус...</option>
                {trialStatusActions
                  .filter((action) => action.status !== status)
                  .map((action) => (
                    <option key={action.status} value={action.status}>{action.label}</option>
                  ))}
              </select>
            </label>
          <div className="student-trial-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button style={{ ...btnS, padding: "10px 12px", fontSize: 13 }} onClick={() => { setEditItem(booking); setModal("editTrialBooking"); }}>Редагувати</button>
          <button style={{ ...btnS, padding: "10px 12px", fontSize: 13, color: theme.danger, background: theme.input }} onClick={() => deleteTrialBooking(booking)}>Видалити</button>
          </div>
        </div>
      </div>
    );
  };

  const renderReserveFilters = () => (
    <div className="reserve-filters" style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1.4fr) minmax(170px, .8fr) minmax(190px, .9fr) auto", gap: 10, alignItems: "center", marginBottom: 14 }}>
      <input
        style={{ ...inputSt, width: "100%", maxWidth: "none", minWidth: 0 }}
        value={reserveSearch}
        onChange={(e) => setReserveSearch(e.target.value)}
        placeholder="Пошук у резерві: ім’я, контакт, група, напрямок..."
      />
      <select
        style={{ ...inputSt, width: "100%", maxWidth: "none", minWidth: 0 }}
        value={reserveFilterDir}
        onChange={(e) => { setReserveFilterDir(e.target.value); setReserveFilterGroup("all"); }}
      >
        <option value="all">Усі напрямки</option>
        {reserveDirections.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
      <select
        style={{ ...inputSt, width: "100%", maxWidth: "none", minWidth: 0 }}
        value={reserveFilterGroup}
        onChange={(e) => setReserveFilterGroup(e.target.value)}
      >
        <option value="all">Усі групи</option>
        {reserveGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>
      <button type="button" style={{ ...btnS, minHeight: 42, padding: "0 13px", color: reserveFilterCount ? theme.danger : theme.textMuted }} onClick={resetReserveFilters}>Скинути фільтри</button>
    </div>
  );

  const renderWaitlistCard = (w, index) => {
    const gr = getWaitlistGroup(w);
    const direction = getWaitlistDirection(w);
    const displayName = getWaitlistDisplayName(w);
    const displayContact = getWaitlistDisplayContact(w);
    const status = w.status || "waiting";
    const statusLabel = status === "waiting" ? "Очікує" : status === "contacted" ? "Написали" : status;

    return (
      <div key={w.id} className="student-waitlist-card" style={{
        background: theme.card,
        border: `1px solid ${theme.border}`,
        borderRadius: 16,
        padding: "12px 14px",
        display: "grid",
        gridTemplateColumns: "minmax(210px, 1.25fr) minmax(180px, 1fr) minmax(105px, .55fr) minmax(220px, 1.15fr)",
        gap: 12,
        alignItems: "center",
      }}>
        <div className="student-waitlist-main" style={{ display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0 }}>
          <div className="student-waitlist-index" style={{ width: 28, height: 28, borderRadius: 9, display: "grid", placeItems: "center", background: theme.input, color: theme.warning, fontSize: 12, fontWeight: 900, flex: "0 0 auto" }}>{index + 1}</div>
          <div style={{ minWidth: 0 }}>
            <div className="student-waitlist-name" style={{ color: theme.textMain, fontWeight: 900, fontSize: 15, lineHeight: 1.15 }}>{displayName}</div>
            <div className="student-waitlist-contact" style={{ color: theme.textMuted, fontSize: 12.5, fontWeight: 650, marginTop: 4, overflowWrap: "anywhere" }}>{displayContact}</div>
            <div className="student-waitlist-mobile-date" style={{ display: "none", color: theme.textLight, fontSize: 12, fontWeight: 800, marginTop: 4 }}>{formatWaitlistDate(w)}</div>
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="student-waitlist-label" style={{ color: theme.textLight, fontSize: 10.5, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>Група</div>
          <div className="student-waitlist-group" style={{ color: gr ? theme.secondary : theme.textMuted, fontWeight: 850, fontSize: 13.5, marginTop: 4 }}>{gr?.name || "Будь-яка група цього напрямку"}</div>
          <div className="student-waitlist-direction-inline" style={{ color: direction?.color || theme.warning, fontSize: 12, fontWeight: 800, marginTop: 4 }}>{direction?.name || "Без напрямку"}</div>
        </div>
        <div className="student-waitlist-date" style={{ color: theme.textMuted, fontWeight: 800, fontSize: 12.5 }}>{formatWaitlistDate(w)}</div>
        <div className="student-waitlist-side" style={{ display: "grid", gap: 8, justifyItems: "end", minWidth: 0 }}>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
            <span style={{ display: "inline-flex", padding: "5px 9px", borderRadius: 999, background: status === "contacted" ? "rgba(59, 130, 246, 0.14)" : "rgba(245, 158, 11, 0.16)", color: status === "contacted" ? "#2563eb" : theme.warning, fontSize: 12, fontWeight: 900 }}>{statusLabel}</span>
            {w.note ? <span className="student-waitlist-note" title={w.note} style={{ color: theme.textLight, fontSize: 12, lineHeight: 1.3, textAlign: "right", maxWidth: 260 }}>Нотатка: {w.note}</span> : null}
          </div>
          <div className="student-waitlist-actions" style={{ display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button style={{ ...btnS, padding: "8px 10px", fontSize: 12.5 }} onClick={() => markWaitlistContacted(w)}>Написали</button>
            {gr ? <button style={{ ...btnS, padding: "8px 10px", fontSize: 12.5 }} onClick={() => joinWaitlistEntry(w)}>Додати в групу</button> : null}
            <button style={{ ...btnS, padding: "8px 10px", fontSize: 12.5, color: theme.danger, background: theme.input }} onClick={() => removeWaitlistEntry(w)}>Прибрати</button>
          </div>
        </div>
      </div>
    );
  };

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
          .student-trial-card { padding: 9px 10px !important; gap: 7px !important; align-items: start !important; }
          .student-trial-main { gap: 8px !important; }
          .student-trial-index { width: 26px !important; height: 26px !important; border-radius: 9px !important; font-size: 12px !important; }
          .student-trial-name { font-size: 15px !important; line-height: 1.12 !important; }
          .student-trial-contact { margin-top: 2px !important; font-size: 12px !important; line-height: 1.2 !important; }
          .student-trial-note { margin-top: 4px !important; line-height: 1.25 !important; display: -webkit-box !important; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
          .student-trial-meta-label, .student-trial-group, .student-trial-date { display: none !important; }
          .student-trial-mobile-meta { display: block !important; font-size: 12.5px !important; line-height: 1.25 !important; margin-top: 1px !important; }
          .student-trial-controls { gap: 6px !important; align-items: stretch !important; }
          .student-trial-status-row { display: flex !important; gap: 6px !important; justify-content: space-between !important; align-items: center !important; width: 100%; }
          .student-trial-status-row span { padding: 4px 8px !important; font-size: 11.5px !important; }
          .student-trial-status-hint { display: none !important; }
          .student-trial-status-label { gap: 4px !important; font-size: 11px !important; justify-items: stretch !important; }
          .student-trial-status-label select { height: 40px !important; min-height: 40px !important; max-width: none !important; font-size: 12px !important; padding: 0 9px !important; }
          .student-trial-actions { gap: 6px !important; justify-content: stretch !important; width: 100%; }
          .student-trial-actions button { min-height: 40px !important; padding: 7px 10px !important; font-size: 12.5px !important; flex: 1 1 0; }
          .reserve-filters { grid-template-columns: 1fr !important; gap: 8px !important; margin-bottom: 10px !important; }
          .reserve-filters button, .reserve-filters select, .reserve-filters input { min-height: 42px !important; }
          .student-waitlist-card button { min-height: 40px !important; flex: 1 1 auto; }
          .student-waitlist-card { align-items: start !important; }
          .student-waitlist-index { width: 26px !important; height: 26px !important; }
          .student-waitlist-name { font-size: 14.5px !important; }
          .student-waitlist-contact { font-size: 12px !important; margin-top: 2px !important; }
          .student-waitlist-date { display: none !important; }
          .student-waitlist-mobile-date { display: block !important; }
          .student-waitlist-label { display: none !important; }
          .student-waitlist-group, .student-waitlist-direction-inline { font-size: 12.5px !important; margin-top: 1px !important; }
          .student-waitlist-side { justify-items: stretch !important; }
          .student-waitlist-side > div { justify-content: space-between !important; }
          .student-waitlist-note { display: -webkit-box !important; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-align: left !important; max-width: none !important; flex: 1 1 150px; }
          .student-waitlist-actions { justify-content: stretch !important; width: 100%; gap: 6px !important; }
          .student-waitlist-actions button { padding: 7px 9px !important; font-size: 12px !important; }
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
            {renderSectionHeader("Пробні заняття", activeTrialBookings.length, "Записи на пробне без автоматичного створення учениці або абонемента", theme.primary || "#2563eb")}
            {activeTrialBookings.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {activeTrialBookings.map((booking, i) => renderTrialBookingCard(booking, i))}
              </div>
            ) : (selectedSummaryFilter === "trials" ? filterEmptyState : (
              <div style={{ background: theme.card, border: `1px dashed ${theme.border}`, borderRadius: 18, padding: 22, color: theme.textMuted, fontWeight: 800, textAlign: "center" }}>Активних записів на пробне поки немає.</div>
            ))}
          </section>
        )}

        {shouldShowTrialSection && (
          <section className="students-section" style={{ background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 26, padding: 18 }}>
            <details>
              <summary style={{ cursor: "pointer", listStyle: "none" }}>
                {renderSectionHeader("Історія пробних", trialBookingsHistory.length, "Завершені та закриті записи на пробне", theme.textMuted)}
              </summary>
              {trialBookingsHistory.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {trialBookingsHistory.map((booking, i) => renderTrialBookingCard(booking, i, { isHistory: true }))}
                </div>
              ) : (
                <div style={{ background: theme.card, border: `1px dashed ${theme.border}`, borderRadius: 18, padding: 22, color: theme.textMuted, fontWeight: 800, textAlign: "center" }}>Історія пробних поки порожня.</div>
              )}
            </details>
          </section>
        )}

        {shouldShowReserveSection && (
          <section className="students-section" style={{ background: theme.input, border: `1px solid ${theme.border}`, borderRadius: 26, padding: 18 }}>
            {renderSectionHeader("Резерв / потенційні", activeWaitlist.length, "Активні заявки зі статусом waiting або contacted", theme.warning || "#f59e0b")}
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
            {activeWaitlist.length > 0 ? (
              <>
                {renderReserveFilters()}
                {groupedWaitlist.length > 0 ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {groupedWaitlist.map(({ direction, entries }) => {
                      const isCollapsed = Boolean(collapsedReserveDirs[direction.id]);
                      return (
                        <div key={`reserve_dir_${direction.id}`} style={{ background: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 18, overflow: "hidden" }}>
                          <button
                            type="button"
                            onClick={() => setCollapsedReserveDirs((prev) => ({ ...prev, [direction.id]: !prev[direction.id] }))}
                            style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "13px 15px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
                          >
                            <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0, flexWrap: "wrap" }}>
                              <span style={{ width: 9, height: 9, borderRadius: 99, background: direction.color || theme.warning }} />
                              <span style={{ color: theme.textMain, fontSize: 16, fontWeight: 900 }}>{direction.name}</span>
                              <span style={{ borderRadius: 999, padding: "4px 9px", background: `${direction.color || theme.warning}18`, color: direction.color || theme.warning, fontSize: 12, fontWeight: 900 }}>{entries.length}</span>
                            </span>
                            <span style={{ color: theme.textLight, fontSize: 15, fontWeight: 900 }}>{isCollapsed ? "▼" : "▲"}</span>
                          </button>
                          {!isCollapsed && (
                            <div style={{ padding: "0 10px 10px", display: "grid", gap: 8 }}>
                              {entries.map((w, i) => renderWaitlistCard(w, i))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : filterEmptyState}
              </>
            ) : (selectedSummaryFilter === "reserve" ? filterEmptyState : (
              <div style={{ background: theme.card, border: `1px dashed ${theme.border}`, borderRadius: 18, padding: 22, color: theme.textMuted, fontWeight: 800, textAlign: "center" }}>Активного резерву поки немає.</div>
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
