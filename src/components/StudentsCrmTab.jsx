import React from "react";
import * as db from "../db";
import { uid } from "../shared/utils";

export default function StudentsCrmTab({
  theme,
  btnP,
  btnS,
  inputSt,
  GroupSelect,
  groups,
  directionsList,
  studentGrps,
  setStudentGrps,
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
  const chipStyle = (color, options = {}) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: options.compact ? "4px 8px" : "5px 10px",
    borderRadius: 999,
    border: `1px solid ${color}`,
    background: options.solid ? color : `${color}22`,
    color: options.solid ? "#fff" : color,
    fontSize: options.compact ? 11 : 12,
    fontWeight: 800,
    lineHeight: 1.1,
    whiteSpace: "nowrap",
  });

  const cardBaseStyle = (isInactive = false) => ({
    background: isInactive ? theme.card : theme.bg,
    border: `1px solid ${isInactive ? theme.border : "transparent"}`,
    borderRadius: 22,
    padding: "16px 18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 16,
    opacity: isInactive ? 0.86 : 1,
  });

  const actionButtonStyle = {
    ...btnS,
    width: 40,
    height: 40,
    minWidth: 40,
    padding: 0,
    borderRadius: 12,
    fontSize: 15,
    background: theme.card,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const getStudentMeta = (st) => {
    const active = subsExt.filter(s=>s.studentId===st.id && s.status!=="expired");
    const links = studentGrps.filter((sg) => String(sg.studentId) === String(st.id));
    const directionIds = new Set(
      links
        .map((sg) => groupMap[sg.groupId]?.directionId)
        .filter(Boolean)
    );
    const hasDebt = active.some((s) => s.paid === false) || attn.some((a) => String(a.studentId) === String(st.id) && String(a.entryType || a.guestType || "") === "debt");
    const hasTrial = active.some((s) => String(s.planType || "").toLowerCase() === "trial");
    const hasSingle = active.some((s) => String(s.planType || "").toLowerCase() === "single");
    const hasMembership = links.length > 0;
    const hasActiveSub = active.length > 0;
    const contacts = [st.phone, st.telegram].filter(Boolean).join(" · ");
    const statusChips = [];

    if (hasMembership || hasActiveSub) statusChips.push({ label: "Активна", color: theme.success });
    if (hasMembership && !hasActiveSub) statusChips.push({ label: "Без абонемента", color: theme.warning });
    if (hasDebt) statusChips.push({ label: "Борг", color: theme.danger });
    if (hasTrial) statusChips.push({ label: "Пробне", color: theme.primary });
    if (hasSingle) statusChips.push({ label: "Разове", color: theme.secondary });
    if (directionIds.size > 1) statusChips.push({ label: `Кілька напрямків · ${directionIds.size}`, color: theme.textMuted });

    return { active, contacts, statusChips };
  };

  const renderSubscriptionBadges = (active) => (
    <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
      {active.length > 0 ? active.map(s=>{
        const g=groupMap[s.groupId];
        const d=g?dirMap[g.directionId]:null;
        return (
          <span key={s.id} style={{...chipStyle(d?.color||theme.textMuted), borderColor: `${d?.color||theme.textMuted}99`, background: `${d?.color||theme.textMuted}1f`, color: theme.textMain}}>
            <span style={{color: d?.color || theme.textMuted}}>●</span>
            {g?.name} <span style={{color:theme.textMuted,fontWeight:700}}>({s.usedTrainings}/{s.totalTrainings})</span>
          </span>
        );
      }) : <span style={{color:theme.textLight,fontSize:13,fontWeight:700}}>Абонементів немає</span>}
    </div>
  );

  const renderStudentCard = (st, index, { inactive = false } = {}) => {
    const { active, contacts, statusChips } = getStudentMeta(st);

    return (
      <div key={st.id} style={cardBaseStyle(inactive)}>
        <div style={{display:"flex", gap: 14, alignItems: "flex-start", minWidth: 220, flex: "1 1 260px"}}>
          <div style={{...chipStyle(theme.textLight, { compact: true }), minWidth: 34, justifyContent: "center", background: inactive ? theme.archive : theme.card}}>{index + 1}</div>
          <div style={{minWidth: 0}}>
            <div style={{color:theme.textMain,fontWeight:800,fontSize:16,lineHeight:1.25,overflowWrap:"anywhere"}}>{getDisplayName(st)}</div>
            {contacts ? (
              <div style={{color:theme.textMuted,fontSize:13, marginTop: 6, fontWeight: 600, overflowWrap:"anywhere"}}>{contacts}</div>
            ) : (
              <div style={{color:theme.textLight,fontSize:12, marginTop: 6, fontWeight: 600}}>контакт не вказано</div>
            )}
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:10}}>
              {inactive ? <span style={chipStyle(theme.textLight, { compact: true })}>Немає активних груп</span> : statusChips.map((chip) => <span key={chip.label} style={chipStyle(chip.color, { compact: true })}>{chip.label}</span>)}
            </div>
          </div>
        </div>

        <div style={{minWidth: 220, flex: "1 1 280px"}}>
          {renderSubscriptionBadges(active)}
        </div>

        <div style={{display:"flex",gap:8,justifyContent:"flex-end",alignItems:"center",flexWrap:"wrap",flex:"0 1 auto"}}>
          {inactive && (
            <>
              <select
                value={restoreGroupByStudent[st.id] || ""}
                onChange={(e) => setRestoreGroupByStudent((prev) => ({ ...prev, [st.id]: e.target.value }))}
                style={{ ...inputSt, width: 180, height: 40, padding: "0 12px", fontSize: 13, borderRadius: 10 }}
              >
                <option value="">Група для відновлення</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <button style={{...btnS,padding:"10px 14px",fontSize:13, background:theme.bg}} onClick={()=>restoreStudentToGroup(st.id)}>↩ Відновити</button>
            </>
          )}
          <button style={actionButtonStyle} onClick={()=>{setEditItem(st);setModal("editStudent")}} title="Редагувати">✏️</button>
          <button style={{...actionButtonStyle, color:theme.danger, background: inactive ? theme.archive : theme.card}} onClick={()=>deleteStudentAction(st.id)} title="Видалити">🗑</button>
        </div>
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
              {isExpanded && (<div style={{padding:'0 24px 24px 24px', display:'flex', flexDirection:'column', gap:12}}>
                {dStudents.map((st, index) => renderStudentCard(st, index))}
              </div>)}
            </div>
          );
        })}

        {studentsByDirection.inactive.length > 0 && (
          <div style={{background: theme.archive, borderRadius: 28, overflow: 'hidden', border: `1px solid ${theme.border}`}}>
              <button onClick={() => setExpandedDirs(p => ({...p, 'archive': !p['archive']}))} style={{width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'24px', background:'transparent', border:'none', cursor:'pointer', textAlign:'left'}}>
                <div style={{fontSize:18,fontWeight:700,color: theme.textMuted}}>🗄️ Архів / Неактивні <span style={{color:theme.textLight,fontSize:15,fontWeight:600, marginLeft: 8}}>({studentsByDirection.inactive.length})</span></div>
                <div style={{color:theme.textLight, fontSize: 16}}>{expandedDirs['archive'] ? "▲" : "▼"}</div>
              </button>
              {expandedDirs['archive'] && (<div style={{padding:'0 24px 24px 24px', display:'flex', flexDirection:'column', gap:12}}>
                {studentsByDirection.inactive.map((st, index) => renderStudentCard(st, index, { inactive: true }))}
              </div>)}
          </div>
        )}
      </div>
      {waitlist.length > 0 && (
        <div style={{background: theme.input, borderRadius: 28, overflow: 'hidden', border: `1px solid ${theme.border}`}}>
          <div style={{padding:'24px', display: "flex", justifyContent: "space-between"}}>
            <span style={{fontSize:18,fontWeight:800,color:theme.warning}}>⏳ Лист очікування ({waitlist.length})</span>
          </div>
          <div style={{padding:'0 24px 16px 24px'}}>
            <div style={{fontSize:15,fontWeight:700,color:theme.textMain, marginBottom:8}}>Можливі місця для резерву</div>
            <div style={{display:"grid", gap:8}}>
              {groups.filter((g) => waitlist.some((w) => String(w.groupId) === String(g.id) && ["waiting","contacted"].includes(String(w.status || "waiting")))).map((g) => {
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
            {waitlist.map((w, i) => {
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
                    <button style={{...btnS,padding:"10px 12px",fontSize:13}} onClick={async ()=>{ if(!db.updateWaitlist) return; const next = await db.updateWaitlist(w.id, { status: "contacted" }); setWaitlist(p=>p.map(x=>x.id===w.id?next:x)); }}>Позначити contacted</button>
                    <button style={{...btnS,padding:"10px 12px",fontSize:13}} onClick={async ()=>{ if(!w.studentId) { alert("Для joined потрібна існуюча учениця"); return; } try { const link = await db.addStudentGroup(w.studentId, w.groupId); setStudentGrps(p=>p.some(sg=>String(sg.studentId)===String(w.studentId)&&String(sg.groupId)===String(w.groupId)) ? p : [...p, link || { id: uid(), studentId: w.studentId, groupId: w.groupId }]); if(db.updateWaitlist){ const next = await db.updateWaitlist(w.id, { status: "joined" }); setWaitlist(p=>p.map(x=>x.id===w.id?next:x)); } } catch(e){ console.warn(e); } }}>Move to joined</button>
                    <button style={{...btnS,padding:"10px 12px",fontSize:13,color:theme.danger, background: theme.input}} onClick={async ()=>{ if(!db.updateWaitlist) return; const next = await db.updateWaitlist(w.id, { status: "removed" }); setWaitlist(p=>p.map(x=>x.id===w.id?next:x)); }}>Remove</button>
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
