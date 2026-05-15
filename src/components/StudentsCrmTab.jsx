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
    const student = {
      name: w.name || "Новий контакт з резерву",
      first_name: "",
      last_name: "",
      phone: phoneLike ? contact : null,
      telegram: !phoneLike && hasTelegram ? contact : null,
      notes: !phoneLike && !hasTelegram && contact ? `Контакт з резерву: ${contact}` : null,
    };
    return student;
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
          background: isArchive ? theme.card : theme.bg,
          border: `1px solid ${theme.border}`,
          borderRadius: 18,
          padding: "14px 16px",
          display: "grid",
          gridTemplateColumns: "minmax(220px, 1.15fr) minmax(220px, 1fr) auto",
          alignItems: "center",
          gap: 14,
          opacity: isArchive ? 0.82 : 1,
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
          <div style={{ color: theme.textLight, fontSize: 14, fontWeight: 800, minWidth: 24 }}>{index + 1}.</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: theme.textMain, fontWeight: 800, fontSize: 16, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getDisplayName(st)}</div>
            <div style={{ color: theme.textMuted, fontSize: 13, marginTop: 5, fontWeight: 600 }}>{contact}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>{getStatusChips(st)}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>{renderSubscriptionBadges(st)}</div>
        {renderStudentActions(st, isArchive)}
      </div>
    );
  };

  return (
    <div>
      <div style={{display:"flex",gap:12,marginBottom:24,flexWrap:"wrap",justifyContent:"space-between", background: theme.card, padding: 16, borderRadius: 24, boxShadow: "0 10px 30px rgba(168, 177, 206, 0.15)"}}>
        <div style={{display: "flex", gap: 12, flexWrap: "wrap", flex: 1}}>
          <input style={{...inputSt,maxWidth:300}} placeholder="Пошук учениці..." value={searchQ} onChange={e=>setSearchQ(e.target.value)}/>
          <select style={{...inputSt,width:"auto"}} value={stFilterDir} onChange={e=>{setStFilterDir(e.target.value);setStFilterGroup("all")}}>
            <option value="all">Усі напрямки</option>
            {directionsList.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <GroupSelect groups={groups} value={stFilterGroup} onChange={setStFilterGroup} filterDir={stFilterDir} allowAll={true} />
        </div>
        <button style={{...btnP, background: theme.warning, boxShadow: "none", height: "fit-content"}} onClick={()=>setModal("addWaitlist")}>+ В резерв</button>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:20, marginBottom: 30}}>
        {studentsByDirection.grouped.map(({direction,students:dStudents})=>{
          const isExpanded = expandedDirs[direction.id];
          return (
            <div key={direction.id} style={{background: theme.card, borderRadius: 28, overflow: 'hidden', border: `1px solid ${theme.border}`}}>
              <button onClick={() => setExpandedDirs(p => ({...p, [direction.id]: !p[direction.id]}))} style={{width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'24px', background:'transparent', border:'none', cursor:'pointer', textAlign:'left'}}>
                <div style={{fontSize:18,fontWeight:700,color:direction.color}}>{direction.name} <span style={{color:theme.textLight,fontSize:15,fontWeight:600, marginLeft: 8}}>({dStudents.length})</span></div>
                <div style={{color:theme.textLight, fontSize: 16}}>{isExpanded ? "▲" : "▼"}</div>
              </button>
              {isExpanded && (
                <div style={{ padding: '0 24px 24px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {dStudents.map((st, index) => renderStudentCard(st, index))}
                </div>
              )}
            </div>
          );
        })}

        {studentsByDirection.inactive.length > 0 && (
          <div style={{background: theme.archive, borderRadius: 28, overflow: 'hidden', border: `1px solid ${theme.border}`}}>
              <button onClick={() => setExpandedDirs(p => ({...p, 'archive': !p['archive']}))} style={{width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'24px', background:'transparent', border:'none', cursor:'pointer', textAlign:'left'}}>
                <div style={{fontSize:18,fontWeight:700,color: theme.textMuted}}>🗄️ Архів / Неактивні <span style={{color:theme.textLight,fontSize:15,fontWeight:600, marginLeft: 8}}>({studentsByDirection.inactive.length})</span></div>
                <div style={{color:theme.textLight, fontSize: 16}}>{expandedDirs['archive'] ? "▲" : "▼"}</div>
              </button>
              {expandedDirs['archive'] && (
                <div style={{ padding: '0 24px 24px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {studentsByDirection.inactive.map((st, index) => renderStudentCard(st, index, { isArchive: true }))}
                </div>
              )}
          </div>
        )}
      </div>
      {activeWaitlist.length > 0 && (
        <div style={{background: theme.input, borderRadius: 28, overflow: 'hidden', border: `1px solid ${theme.border}`}}>
          <div style={{padding:'24px', display: "flex", justifyContent: "space-between"}}>
            <span style={{fontSize:18,fontWeight:800,color:theme.warning}}>⏳ Лист очікування ({activeWaitlist.length})</span>
          </div>
          <div style={{padding:'0 24px 16px 24px'}}>
            <div style={{fontSize:15,fontWeight:700,color:theme.textMain, marginBottom:8}}>Можливі місця для резерву</div>
            <div style={{display:"grid", gap:8}}>
              {groups.filter((g) => activeWaitlist.some((w) => String(w.groupId) === String(g.id))).map((g) => {
                const groupSubs = subsExt.filter((s) => String(s.groupId) === String(g.id));
                const hasExpiredOrNoActive = groupSubs.some((s) => ["4pack","8pack","12pack"].includes(String(s.planType || "").toLowerCase()) && s.status === "expired");
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
                return <div key={`reserve_hint_${g.id}`} style={{background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 12, padding: "10px 12px", color: theme.textMuted}}><strong style={{color:theme.textMain}}>{g.name}</strong>: {signals.join(" · ")}</div>;
              })}
            </div>
          </div>
          <div style={{padding:'0 24px 24px 24px', display:'flex', flexDirection:'column', gap:12}}>
            {activeWaitlist.map((w, i) => {
              const st = studentMap[w.studentId]; const gr = groupMap[w.groupId];
              if(!gr) return null;
              const displayName = st ? getDisplayName(st) : (w.name || "Новий контакт");
              const displayContact = w.contact || [st?.phone, st?.instagram, st?.telegram].filter(Boolean).join(" · ");
              return (
                <div key={w.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center", background: theme.card, padding: "20px", borderRadius: 20}}>
                  <div style={{display: "flex", gap: 16, alignItems: "center"}}>
                    <div style={{color: theme.textLight, fontSize: 16, fontWeight: 700}}>{i + 1}.</div>
                    <div><div style={{color:theme.textMain,fontWeight:700,fontSize:16}}>{displayName}</div><div style={{color:theme.textMuted,fontSize:14, marginTop: 6, fontWeight: 500}}>Хоче в: <strong style={{color:theme.secondary}}>{gr.name}</strong> · статус: {w.status || "waiting"}{displayContact ? ` · ${displayContact}` : ""}</div>{w.note ? <div style={{color:theme.textLight,fontSize:12, marginTop:4}}>Нотатка: {w.note}</div> : null}</div>
                  </div>
                  <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
                    <button style={{...btnS,padding:"10px 12px",fontSize:13}} onClick={() => markWaitlistContacted(w)}>Позначити contacted</button>
                    <button style={{...btnS,padding:"10px 12px",fontSize:13}} onClick={() => joinWaitlistEntry(w)}>Move to joined</button>
                    <button style={{...btnS,padding:"10px 12px",fontSize:13,color:theme.danger, background: theme.input}} onClick={() => removeWaitlistEntry(w)}>Remove</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  );
}
