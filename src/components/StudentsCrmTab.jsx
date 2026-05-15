import React from "react";
import * as db from "../db";
import { uid } from "../shared/utils";

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
                {dStudents.map((st, index) => {
                  const active=subsExt.filter(s=>s.studentId===st.id && s.status!=="expired");
                  return <div key={st.id} style={{background: theme.bg, borderRadius: 20, padding: "20px", display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:16}}>
                    <div style={{display:"flex", gap: 16, alignItems: "center", minWidth: 200}}>
                      <div style={{color: theme.textLight, fontSize: 16, fontWeight: 700}}>{index + 1}.</div>
                      <div>
                        <div style={{color:theme.textMain,fontWeight:700,fontSize:16}}>{getDisplayName(st)}</div>
                        <div style={{color:theme.textMuted,fontSize:14, marginTop: 6, fontWeight: 500}}>{[st.phone,st.telegram].filter(Boolean).join(" · ")||"—"}</div>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{active.map(s=>{const g=groupMap[s.groupId];const d=g?dirMap[g.directionId]:null;return <Badge key={s.id} color={d?.color||"#888"}>{g?.name} ({s.usedTrainings}/{s.totalTrainings})</Badge>})}</div>
                    <div style={{display:"flex",gap:8}}>
                      <button style={{...btnS,padding:"10px 16px",fontSize:14, background:theme.card}} onClick={()=>{setEditItem(st);setModal("editStudent")}}>✏️</button>
                      <button style={{background:"none",border:"none",color:theme.danger,fontSize:20,cursor:"pointer",padding:"0 10px"}} onClick={()=>deleteStudentAction(st.id)}>🗑</button>
                    </div>
                  </div>
                })}
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
                {studentsByDirection.inactive.map((st, index) => (
                  <div key={st.id} style={{background: theme.card, borderRadius: 20, padding: "20px", display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:16, opacity: 0.8}}>
                    <div style={{display:"flex", gap: 16, alignItems: "center", minWidth: 200}}>
                      <div style={{color: theme.textLight, fontSize: 16, fontWeight: 700}}>{index + 1}.</div>
                      <div>
                        <div style={{color:theme.textMain,fontWeight:700,fontSize:16}}>{getDisplayName(st)}</div>
                        <div style={{color:theme.textMuted,fontSize:14, marginTop: 6, fontWeight: 500}}>{[st.phone,st.telegram].filter(Boolean).join(" · ")||"—"}</div>
                      </div>
                    </div>
                    <Badge color={theme.textLight}>Немає активних груп</Badge>
                    <div style={{display:"flex",gap:8}}>
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
                      <button style={{...btnS,padding:"10px 12px",fontSize:14, background:theme.card}} onClick={()=>{setEditItem(st);setModal("editStudent")}}>✏️</button>
                      <button style={{background:"none",border:"none",color:theme.danger,fontSize:20,cursor:"pointer",padding:"0 10px"}} onClick={()=>deleteStudentAction(st.id)}>🗑</button>
                    </div>
                  </div>
                ))}
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
