import React, { useMemo, useState } from "react";
import { theme, DIRECTIONS, inputSt } from "../shared/constants";
import { getDisplayName } from "../shared/utils";

export function Modal({open, onClose, title, children, wide}){
  if(!open) return null;
  return(
    <div style={{position:"fixed", inset:0, background:"rgba(31, 31, 31, 0.4)", backdropFilter:"blur(4px)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:theme.card, borderRadius:32, padding:"32px", width:wide?800:500, maxWidth:"100%", maxHeight:"90vh", overflow:"auto", boxShadow: "0 24px 48px rgba(0,0,0,0.1)"}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24}}>
          <h3 style={{margin:0, fontSize:22, color:theme.textMain, fontWeight:700}}>{title}</h3>
          <button type="button" onClick={onClose} style={{background:theme.input, borderRadius:"50%", width:40, height:40, border:"none", color:theme.textMuted, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize: 18}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({label, children}){
  return(
    <div style={{marginBottom:18}}>
      <label style={{display:"block", fontSize:12, color:theme.textMuted, marginBottom:8, fontWeight:600, letterSpacing:0.5}}>{label}</label>
      {children}
    </div>
  );
}

export function Badge({color, children}){
  return <span style={{padding:"6px 12px", borderRadius:100, fontSize:12, fontWeight:600, background:`${color}15`, color, whiteSpace:"nowrap"}}>{children}</span>;
}

export function Pill({active, onClick, children, color}){
  return <button type="button" onClick={onClick} style={{padding:"10px 20px", borderRadius:100, fontSize:14, fontWeight:600, cursor:"pointer", background:active?(color||theme.primary):theme.input, color:active?"#fff":theme.textMuted, border:"none", fontFamily:"inherit", transition:"all 0.2s"}}>{children}</button>;
}

export function GroupSelect({groups, value, onChange, filterDir = "all", allowAll = false}) {
  const filteredGroups = filterDir === "all" ? groups : groups.filter(g => g.directionId === filterDir);
  return (
    <select style={{...inputSt, width:"auto", minWidth:200, cursor:"pointer"}} value={value} onChange={e=>onChange(e.target.value)}>
      {allowAll && <option value="all">Усі групи</option>}
      {DIRECTIONS.filter(d => filterDir === "all" || d.id === filterDir).map(d=>(
        <optgroup key={d.id} label={d.name}>
          {filteredGroups.filter(g=>g.directionId===d.id).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

export function StudentSelectWithSearch({ students, value, onChange, studentGrps, groups }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const sortedStudents = useMemo(() => [...students].sort((a,b) => getDisplayName(a).localeCompare(getDisplayName(b),"uk")), [students]);
  const filtered = useMemo(() => sortedStudents.filter(s => getDisplayName(s).toLowerCase().includes(search.toLowerCase())), [sortedStudents, search]);

  const grouped = useMemo(() => {
    const res = {};
    filtered.forEach(s => {
       const sg = studentGrps.find(x => x.studentId === s.id);
       const g = sg ? groups.find(x => x.id === sg.groupId) : null;
       const dirName = g ? (DIRECTIONS.find(d => d.id === g.directionId)?.name || "Інше") : "Без групи / Архів";
       if(!res[dirName]) res[dirName] = [];
       res[dirName].push(s);
    });
    return res;
  }, [filtered, studentGrps, groups]);

  const selectedSt = students.find(s => s.id === value);

  return (
    <div style={{position: 'relative'}}>
      {open && <div style={{position: 'fixed', inset: 0, zIndex: 9}} onClick={() => setOpen(false)}></div>}
      <div onClick={() => setOpen(!open)} style={{...inputSt, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: theme.card, border: `1px solid ${theme.border}`, position: 'relative', zIndex: 10}}>
        {selectedSt ? getDisplayName(selectedSt) : "Оберіть ученицю..."}
        <span style={{fontSize: 10, color: theme.textLight}}>▼</span>
      </div>
      {open && (
        <div style={{position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 11, background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 16, marginTop: 4, boxShadow: "0 10px 30px rgba(0,0,0,0.15)", maxHeight: 350, display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
          <div style={{padding: 12, borderBottom: `1px solid ${theme.border}`, background: theme.bg}}>
            <input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Пошук за прізвищем..." style={{...inputSt, height: 44, padding: "0 16px"}} />
          </div>
          <div style={{overflowY: 'auto', flex: 1, padding: "8px 0"}}>
            {Object.keys(grouped).length === 0 ? <div style={{padding: 16, color: theme.textLight, textAlign: 'center'}}>Нікого не знайдено</div> : 
              Object.entries(grouped).map(([dir, sts]) => (
                <div key={dir}>
                  <div style={{padding: "8px 16px", fontSize: 11, color: theme.textMuted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5, background: theme.bg}}>{dir}</div>
                  {sts.map(s => (
                    <div key={s.id} onClick={() => { onChange(s.id); setOpen(false); setSearch(""); }} style={{padding: "12px 16px", cursor: "pointer", background: value === s.id ? `${theme.primary}15` : "transparent", color: value === s.id ? theme.primary : theme.textMain, fontWeight: value === s.id ? 700 : 500, transition: '0.1s', borderBottom: `1px solid ${theme.bg}`}}>
                      {getDisplayName(s)}
                    </div>
                  ))}
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  )
}

// ==========================================
// 4. ФОРМИ
