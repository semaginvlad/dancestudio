// src/StudentsTab.jsx
import { DIRECTIONS } from "./utils";
import { inputSt, btnP, btnS, Badge, GroupSelect } from "./ui";

export default function StudentsTab({ 
  searchQ, setSearchQ, stFilterDir, setStFilterDir, 
  stFilterGroup, setStFilterGroup, groups, setModal, 
  studentsByDirection, expandedDirs, setExpandedDirs, 
  subsExt, groupMap, dirMap, waitlist, studentMap, removeWaitlist, setEditItem 
}) {
  return (
    <div>
      <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap",justifyContent:"space-between", background: "#1C1C1E", padding: 16, borderRadius: 20}}>
        <div style={{display: "flex", gap: 10, flexWrap: "wrap", flex: 1}}>
          <input style={{...inputSt,maxWidth:250}} placeholder="Пошук учениці..." value={searchQ} onChange={e=>setSearchQ(e.target.value)}/>
          <select style={{...inputSt,width:"auto"}} value={stFilterDir} onChange={e=>{setStFilterDir(e.target.value);setStFilterGroup("all")}}>
            <option value="all">Всі напрямки</option>
            {DIRECTIONS.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <GroupSelect groups={groups} value={stFilterGroup} onChange={setStFilterGroup} filterDir={stFilterDir} allowAll={true} />
        </div>
        <button style={{...btnP, background: "#FF9F0A", height: "fit-content"}} onClick={()=>setModal("addWaitlist")}>+ В резерв</button>
      </div>
      
      <div style={{display:"flex",flexDirection:"column",gap:16, marginBottom: 24}}>
        {studentsByDirection.grouped.map(({direction,students:dStudents})=>{
          const isExpanded = expandedDirs[direction.id];
          return (
            <div key={direction.id} style={{background: "#1C1C1E", borderRadius: 24, overflow: 'hidden'}}>
              <button onClick={() => setExpandedDirs(p => ({...p, [direction.id]: !p[direction.id]}))} style={{width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'20px 24px', background:'transparent', border:'none', cursor:'pointer', textAlign:'left'}}>
                <div style={{fontSize:16,fontWeight:700,color:direction.color}}>{direction.name} <span style={{color:"#8E8E93",fontSize:14,fontWeight:500, marginLeft: 6}}>({dStudents.length})</span></div>
                <div style={{color:"#8E8E93", fontSize: 14}}>{isExpanded ? "▲" : "▼"}</div>
              </button>
              {isExpanded && (<div style={{padding:'0 24px 20px 24px', display:'flex', flexDirection:'column', gap:8}}>
                {dStudents.map(st => {
                  const active=subsExt.filter(s=>s.studentId===st.id && s.status!=="expired");
                  return <div key={st.id} style={{background: "#2C2C2E", borderRadius: 16, padding: "16px", display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
                    <div style={{minWidth:180}}>
                      <div style={{color:"#fff",fontWeight:600,fontSize:15}}>{st.name}</div>
                      <div style={{color:"#8E8E93",fontSize:13, marginTop: 4}}>{[st.phone,st.telegram].filter(Boolean).join(" · ")||"—"}</div>
                    </div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{active.map(s=>{const g=groupMap[s.groupId];const d=g?dirMap[g.directionId]:null;return <Badge key={s.id} color={d?.color||"#888"}>{g?.name} ({s.usedTrainings}/{s.totalTrainings})</Badge>})}</div>
                    <div style={{display:"flex",gap:6}}><button style={{...btnS,padding:"8px 12px",fontSize:13}} onClick={()=>{setEditItem(st);setModal("editStudent")}}>Редагувати</button></div>
                  </div>
                })}
              </div>)}
            </div>
          );
        })}
      </div>

      {waitlist.length > 0 && (
        <div style={{background: "linear-gradient(135deg, #1C1C1E, #352115)", borderRadius: 24, overflow: 'hidden'}}>
          <div style={{padding:'20px 24px'}}>
            <span style={{fontSize:16,fontWeight:700,color:"#FF9F0A"}}>⏳ Лист очікування ({waitlist.length})</span>
          </div>
          <div style={{padding:'0 24px 20px 24px', display:'flex', flexDirection:'column', gap:8}}>
            {waitlist.map(w => {
              const st = studentMap[w.studentId];
              const gr = groupMap[w.groupId];
              if(!st || !gr) return null;
              return (
                <div key={w.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center", background: "#2C2C2E", padding: "16px", borderRadius: 16}}>
                  <div>
                    <div style={{color:"#fff",fontWeight:600,fontSize:15}}>{st.name}</div>
                    <div style={{color:"#8E8E93",fontSize:13, marginTop: 4}}>Хоче в: <strong style={{color:"#fff"}}>{gr.name}</strong></div>
                  </div>
                  <button style={{...btnS,padding:"8px 12px",fontSize:13,color:"#FF453A"}} onClick={()=>removeWaitlist(w.id)}>Видалити</button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  );
}
