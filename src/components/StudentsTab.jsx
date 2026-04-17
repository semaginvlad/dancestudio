import React from "react";
import * as db from "../db";

export default function StudentsTab({
  theme,
  DIRECTIONS,
  btnP,
  btnS,
  inputSt,
  GroupSelect,
  Badge,
  searchQ,
  setSearchQ,
  stFilterDir,
  setStFilterDir,
  stFilterGroup,
  setStFilterGroup,
  setModal,
  studentsByDirection,
  expandedDirs,
  setExpandedDirs,
  subsExt,
  groupMap,
  dirMap,
  getDisplayName,
  setEditItem,
  deleteStudentAction,
  waitlist,
  studentMap,
  setWaitlist,
}) {
  return (
    <div>
      <div style={{display:"flex",gap:12,marginBottom:24,flexWrap:"wrap",justifyContent:"space-between", background: theme.card, padding: 16, borderRadius: 24, boxShadow: "0 10px 30px rgba(168, 177, 206, 0.15)"}}>
        <div style={{display: "flex", gap: 12, flexWrap: "wrap", flex: 1}}>
          <input style={{...inputSt,maxWidth:300}} placeholder="Пошук учениці..." value={searchQ} onChange={e=>setSearchQ(e.target.value)}/>
          <select style={{...inputSt,width:"auto"}} value={stFilterDir} onChange={e=>{setStFilterDir(e.target.value);setStFilterGroup("all")}}>
            <option value="all">Усі напрямки</option>
            {DIRECTIONS.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <GroupSelect groups={Object.values(groupMap)} value={stFilterGroup} onChange={setStFilterGroup} filterDir={stFilterDir} allowAll={true} />
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
                      <button style={{...btnS,padding:"10px 16px",fontSize:14, background:"#fff"}} onClick={()=>{setEditItem(st);setModal("editStudent")}}>✏️</button>
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
                  <div key={st.id} style={{background: "#fff", borderRadius: 20, padding: "20px", display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:16, opacity: 0.8}}>
                    <div style={{display:"flex", gap: 16, alignItems: "center", minWidth: 200}}>
                      <div style={{color: theme.textLight, fontSize: 16, fontWeight: 700}}>{index + 1}.</div>
                      <div>
                        <div style={{color:theme.textMain,fontWeight:700,fontSize:16}}>{getDisplayName(st)}</div>
                        <div style={{color:theme.textMuted,fontSize:14, marginTop: 6, fontWeight: 500}}>{[st.phone,st.telegram].filter(Boolean).join(" · ")||"—"}</div>
                      </div>
                    </div>
                    <Badge color={theme.textLight}>Немає активних груп</Badge>
                    <div style={{display:"flex",gap:8}}>
                      <button style={{...btnS,padding:"10px 16px",fontSize:14, background:theme.bg}} onClick={()=>{setEditItem(st);setModal("editStudent")}}>✏️ Відновити</button>
                      <button style={{background:"none",border:"none",color:theme.danger,fontSize:20,cursor:"pointer",padding:"0 10px"}} onClick={()=>deleteStudentAction(st.id)}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>)}
          </div>
        )}
      </div>

      {waitlist.length > 0 && (
        <div style={{background: "#FFF9F0", borderRadius: 28, overflow: 'hidden'}}>
          <div style={{padding:'24px', display: "flex", justifyContent: "space-between"}}>
            <span style={{fontSize:18,fontWeight:800,color:theme.warning}}>⏳ Лист очікування ({waitlist.length})</span>
          </div>
          <div style={{padding:'0 24px 24px 24px', display:'flex', flexDirection:'column', gap:12}}>
            {waitlist.map((w, i) => {
              const st = studentMap[w.studentId]; const gr = groupMap[w.groupId];
              if(!st || !gr) return null;
              return (
                <div key={w.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center", background: "#fff", padding: "20px", borderRadius: 20}}>
                  <div style={{display: "flex", gap: 16, alignItems: "center"}}>
                    <div style={{color: theme.textLight, fontSize: 16, fontWeight: 700}}>{i + 1}.</div>
                    <div><div style={{color:theme.textMain,fontWeight:700,fontSize:16}}>{getDisplayName(st)}</div><div style={{color:theme.textMuted,fontSize:14, marginTop: 6, fontWeight: 500}}>Хоче в: <strong style={{color:theme.secondary}}>{gr.name}</strong></div></div>
                  </div>
                  <button
                    style={{...btnS,padding:"10px 16px",fontSize:14,color:theme.danger, background: theme.input}}
                    onClick={async ()=>{
                      setWaitlist(p=>p.filter(x=>x.id!==w.id));
                      if(db.deleteWaitlist) {
                        try { await db.deleteWaitlist(w.id); } catch(e) { console.warn(e); }
                      }
                    }}
                  >
                    Видалити
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  );
}
