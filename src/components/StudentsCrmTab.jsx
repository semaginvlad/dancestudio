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

  const activeWaitlist = waitlist.filter((w) => ["waiting", "contacted"].includes(String(w.status || "waiting")));

  const updateWaitlistRow = (next) => {
    setWaitlist((prev) => prev.map((row) => (row.id === next.id ? next : row)));
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

      if (createdStudent) setStudents((prev) => [...prev, createdStudent]);
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
    { key: "active", label: "Активні", value: activeStudentIds.size, hint: "у групах або з активним абонементом", color: theme.success || "#16a34a" },
    { key: "no_subscription", label: "Без абонемента", value: studentsWithoutSubCount, hint: "є група, немає активного абонемента", color: theme.textMuted },
    { key: "debt", label: "Борг", value: debtStudentIds.size, hint: "борг / unpaid у доступних даних", color: theme.danger || "#dc2626" },
    { key: "reserve", label: "Резерв", value: activeWaitlist.length, hint: "waiting / contacted", color: theme.warning || "#f59e0b" },
    { key: "archive", label: "Архів", value: studentsByDirection.inactive.length, hint: "неактивні профілі", color: theme.textMuted },
  ];
  const selectedSummaryCard = summaryCards.find((card) => card.key === selectedSummaryFilter);

  const getVisibleActiveStudents = (students) => {
    if (selectedSummaryFilter === "active") return students.filter((st) => activeStudentIds.has(String(st.id)));
    if (selectedSummaryFilter === "no_subscription") return students.filter((st) => studentsWithGroupIds.has(String(st.id)) && !studentsWithActiveSubIds.has(String(st.id)));
    if (selectedSummaryFilter === "debt") return students.filter((st) => debtStudentIds.has(String(st.id)));
    return students;
  };
  const visibleActiveGroups = studentsByDirection.grouped
    .map(({ direction, students }) => ({ direction, students: getVisibleActiveStudents(students) }))
    .filter(({ students }) => students.length > 0);
  const visibleActiveCount = visibleActiveGroups.reduce((sum, item) => sum + item.students.length, 0);
  const showActiveSection = ["all", "active", "no_subscription", "debt"].includes(selectedSummaryFilter);
  const showReserveSection = ["all", "reserve"].includes(selectedSummaryFilter);
  const showArchiveSection = ["all", "archive"].includes(selectedSummaryFilter);

  const toggleSummaryFilter = (key) => {
    setSelectedSummaryFilter((prev) => (prev === key ? "all" : key));
  };

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
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
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
          <button style={{ ...btnS, padding: "9px 14px", fontSize: 13, background: theme.bg }} onClick={() => restoreStudentToGroup(st.id)}>↩ Відновити</button>
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
        {renderStudentActions(st, isArchive)}
      </div>
    );
  };

  const renderSectionHeader = (title, count, subtitle, accent = theme.secondary) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
      <div>
        <div style={{ color: theme.textMain, fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em" }}>{title}</div>
        {subtitle ? <div style={{ color: theme.textMuted, fontSize: 13, fontWeight: 650, marginTop: 4 }}>{subtitle}</div> : null}
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

  const renderWaitlistCard = (w, index) => {
    const st = studentMap[w.studentId];
    const gr = groupMap[w.groupId];
    if (!gr) return null;
    const displayName = st ? getDisplayName(st) : (w.name || "Новий контакт");
    const displayContact = w.contact || [st?.phone, st?.instagram, st?.telegram].filter(Boolean).join(" · ") || "контакт не вказано";
    const status = w.status || "waiting";

    return (
      <div key={w.id} style={{
        background: theme.card,
        border: `1px solid ${theme.border}`,
        borderRadius: 18,
        padding: 16,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
        gap: 14,
        alignItems: "center",
      }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start", minWidth: 0 }}>
          <div style={{
            width: 30,
            height: 30,
            borderRadius: 10,
            display: "grid",
            placeItems: "center",
            background: theme.input,
            color: theme.warning,
            fontSize: 13,
            fontWeight: 900,
            flex: "0 0 auto",
          }}>{index + 1}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: theme.textMain, fontWeight: 900, fontSize: 16 }}>{displayName}</div>
            <div style={{ color: theme.textMuted, fontSize: 13, fontWeight: 650, marginTop: 5, overflowWrap: "anywhere" }}>{displayContact}</div>
            {w.note ? <div style={{ color: theme.textLight, fontSize: 12, marginTop: 7, lineHeight: 1.35 }}>Нотатка: {w.note}</div> : null}
          </div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: theme.textLight, fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>Група</div>
          <div style={{ color: theme.secondary, fontWeight: 850, fontSize: 14, marginTop: 5 }}>{gr.name}</div>
          <span style={{ display: "inline-flex", marginTop: 8, padding: "5px 9px", borderRadius: 999, background: status === "contacted" ? "rgba(59, 130, 246, 0.14)" : "rgba(245, 158, 11, 0.16)", color: status === "contacted" ? "#2563eb" : theme.warning, fontSize: 12, fontWeight: 900 }}>{status}</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button style={{ ...btnS, padding: "10px 12px", fontSize: 13 }} onClick={() => markWaitlistContacted(w)}>Написали</button>
          <button style={{ ...btnS, padding: "10px 12px", fontSize: 13 }} onClick={() => joinWaitlistEntry(w)}>Додати в групу</button>
          <button style={{ ...btnS, padding: "10px 12px", fontSize: 13, color: theme.danger, background: theme.input }} onClick={() => removeWaitlistEntry(w)}>Прибрати</button>
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
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))", gap: 12 }}>
        {summaryCards.map((card) => {
          const isSelected = selectedSummaryFilter === card.key;
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => toggleSummaryFilter(card.key)}
              style={{
                appearance: "none",
                textAlign: "left",
                cursor: "pointer",
                background: isSelected ? `linear-gradient(135deg, ${card.color}24, ${theme.card})` : `linear-gradient(135deg, ${theme.card}, ${theme.input})`,
                border: `1px solid ${isSelected ? card.color : theme.border}`,
                borderRadius: 18,
                padding: "14px 15px",
                minHeight: 96,
                boxShadow: isSelected ? `0 14px 34px ${card.color}1f` : "0 12px 30px rgba(15, 23, 42, 0.08)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: 10,
                transition: "transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
              }}
              aria-pressed={isSelected}
              title={isSelected ? "Натисніть ще раз, щоб скинути фільтр" : `Фільтр: ${card.label}`}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <span style={{ color: isSelected ? card.color : theme.textMuted, fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em" }}>{card.label}</span>
                <span style={{ width: 9, height: 9, borderRadius: 99, background: card.color, boxShadow: `0 0 0 4px ${card.color}18` }} />
              </div>
              <div>
                <div style={{ color: theme.textMain, fontSize: 28, lineHeight: 1, fontWeight: 950 }}>{card.value}</div>
                <div style={{ color: theme.textLight, fontSize: 11, fontWeight: 650, marginTop: 7, lineHeight: 1.25 }}>{card.hint}</div>
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 18, padding: "10px 12px" }}>
        <div style={{ color: theme.textMuted, fontSize: 13, fontWeight: 750 }}>
          Фільтр summary: <strong style={{ color: selectedSummaryCard?.color || theme.textMain }}>{selectedSummaryCard?.label || "Всі"}</strong>
        </div>
        <button type="button" style={{ ...btnS, padding: "8px 12px", fontSize: 13, background: selectedSummaryFilter === "all" ? theme.bg : theme.input }} onClick={() => setSelectedSummaryFilter("all")}>Всі</button>
      </div>

      <div style={{
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
          <input style={{ ...inputSt, flex: "1 1 220px", minWidth: 180, maxWidth: 340 }} placeholder="Пошук учениці..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
          <select style={{ ...inputSt, flex: "0 1 190px", minWidth: 160 }} value={stFilterDir} onChange={e => { setStFilterDir(e.target.value); setStFilterGroup("all") }}>
            <option value="all">Усі напрямки</option>
            {directionsList.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <div style={{ flex: "1 1 210px", minWidth: 180 }}>
            <GroupSelect groups={groups} value={stFilterGroup} onChange={setStFilterGroup} filterDir={stFilterDir} allowAll={true} />
          </div>
        </div>
        <button style={{ ...btnP, background: theme.warning, boxShadow: "none", minHeight: 42, flex: "0 0 auto" }} onClick={() => setModal("addWaitlist")}>+ В резерв</button>
      </div>

      <div style={{ display: "grid", gap: 18 }}>
        {showActiveSection && (
          <section style={{ background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 26, padding: 18 }}>
            {renderSectionHeader("Активні учениці", visibleActiveCount, selectedSummaryFilter === "all" || selectedSummaryFilter === "active" ? "Учениці згруповані за напрямками" : `Показано фільтр: ${selectedSummaryCard?.label || "Всі"}`, theme.secondary)}
            {visibleActiveCount > 0 ? (
              <div style={{ display: "grid", gap: 12 }}>
                {visibleActiveGroups.map(({ direction, students: dStudents }) => {
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
            ) : (
              <div style={{ background: theme.bg, border: `1px dashed ${theme.border}`, borderRadius: 18, padding: 22, color: theme.textMuted, fontWeight: 800, textAlign: "center" }}>Немає записів за цим фільтром.</div>
            )}
          </section>
        )}

        {showReserveSection && (
          <section style={{ background: theme.input, border: `1px solid ${theme.border}`, borderRadius: 26, padding: 18 }}>
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
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {activeWaitlist.map((w, i) => renderWaitlistCard(w, i))}
            </div>
          ) : (
            <div style={{ background: theme.card, border: `1px dashed ${theme.border}`, borderRadius: 18, padding: 22, color: theme.textMuted, fontWeight: 800, textAlign: "center" }}>{selectedSummaryFilter === "reserve" ? "Немає записів за цим фільтром." : "Активного резерву поки немає."}</div>
          )}
          </section>
        )}

        {showArchiveSection && (
          <section style={{ background: theme.archive, border: `1px solid ${theme.border}`, borderRadius: 26, padding: 18 }}>
          {renderSectionHeader("Архів / неактивні", studentsByDirection.inactive.length, "Окрема зона для відновлення або редагування профілів", theme.textMuted)}
          {studentsByDirection.inactive.length > 0 ? (
            <div style={{ background: theme.card, borderRadius: 20, overflow: "hidden", border: `1px solid ${theme.border}` }}>
              <button onClick={() => setExpandedDirs(p => ({ ...p, archive: !p.archive }))} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 18px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: theme.textMuted }}>Показати неактивних</div>
                <div style={{ color: theme.textLight, fontSize: 16, fontWeight: 900 }}>{expandedDirs.archive ? "▲" : "▼"}</div>
              </button>
              {expandedDirs.archive && (
                <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {studentsByDirection.inactive.map((st, index) => renderStudentCard(st, index, { isArchive: true }))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ background: theme.card, border: `1px dashed ${theme.border}`, borderRadius: 18, padding: 18, color: theme.textMuted, fontWeight: 800, textAlign: "center" }}>{selectedSummaryFilter === "archive" ? "Немає записів за цим фільтром." : "Архів порожній."}</div>
          )}
          </section>
        )}
      </div>
    </div>
  );
}
