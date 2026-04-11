import React, { useState, useEffect, useMemo } from "react";
import * as db from "./db"; // Переконайся, що файл db.js існує в тій же папці!

// ==========================================
// 1. КОНСТАНТИ ТА ДАНІ
// ==========================================
const DIRECTIONS = [
  { id: "latina", name: "Latina Solo", color: "#FF3B30" },
  { id: "bachata", name: "Bachata Lady Style", color: "#FF9F0A" },
  { id: "heels", name: "High Heels", color: "#AF52DE" },
  { id: "dancehall", name: "Dancehall Female", color: "#34C759" },
  { id: "kpop", name: "K-pop Cover Dance", color: "#007AFF" },
  { id: "jazzfunk", name: "Jazz Funk", color: "#FF2D55" },
];
const PLAN_TYPES = [
  { id: "trial", name: "Пробне", trainings: 1, price: 150 },
  { id: "single", name: "Разове", trainings: 1, price: 300 },
  { id: "4pack", name: "Абонемент 4", trainings: 4, price: 1000 },
  { id: "8pack", name: "Абонемент 8", trainings: 8, price: 1500 },
  { id: "12pack", name: "Абонемент 12", trainings: 12, price: 1800 },
];
const PAY_METHODS = [{ id: "card", name: "💳 Карта" }, { id: "cash", name: "💵 Готівка" }];
const DEFAULT_GROUPS = [
  { id: "lat-base-am", name: "Latin base (ранкова)", directionId: "latina", schedule: [{ day: 2, time: "09:50" }, { day: 4, time: "09:50" }], trainerPct: 50 },
  { id: "lat-base-pm", name: "Latin base (вечірня)", directionId: "latina", schedule: [{ day: 1, time: "16:50" }, { day: 5, time: "16:50" }], trainerPct: 50 },
  { id: "lat-mix-am", name: "Latin mix (ранкова)", directionId: "latina", schedule: [{ day: 1, time: "10:00" }, { day: 3, time: "10:00" }, { day: 5, time: "10:00" }], trainerPct: 50 },
  { id: "lat-mix-pm1", name: "Latin mix (вечірня 18:00)", directionId: "latina", schedule: [{ day: 1, time: "18:00" }, { day: 3, time: "18:00" }, { day: 5, time: "18:00" }], trainerPct: 50 },
  { id: "lat-mix-pm2", name: "Latin mix (вечірня 19:10)", directionId: "latina", schedule: [{ day: 1, time: "19:10" }, { day: 3, time: "19:10" }, { day: 5, time: "19:10" }], trainerPct: 50 },
  { id: "bach-base", name: "Bachata base", directionId: "bachata", schedule: [{ day: 2, time: "18:05" }, { day: 4, time: "18:05" }], trainerPct: 50 },
  { id: "bach-mix2", name: "Bachata mix 2", directionId: "bachata", schedule: [{ day: 2, time: "11:00" }, { day: 4, time: "11:00" }], trainerPct: 50 },
  { id: "bach-mix1", name: "Bachata mix 1", directionId: "bachata", schedule: [{ day: 1, time: "11:00" }, { day: 5, time: "11:00" }], trainerPct: 50 },
  { id: "heels-base", name: "High Heels base", directionId: "heels", schedule: [{ day: 2, time: "20:20" }, { day: 4, time: "20:20" }], trainerPct: 50 },
  { id: "heels-mix", name: "High Heels mix", directionId: "heels", schedule: [{ day: 2, time: "19:15" }, { day: 4, time: "19:15" }], trainerPct: 50 },
  { id: "kpop1", name: "K-pop Cover Dance", directionId: "kpop", schedule: [{ day: 6, time: "15:00" }, { day: 0, time: "15:00" }], trainerPct: 50 },
  { id: "jazz1", name: "Jazz Funk mix", directionId: "jazzfunk", schedule: [{ day: 6, time: "14:00" }, { day: 0, time: "14:00" }], trainerPct: 50 },
  { id: "dance1", name: "Dancehall Female", directionId: "dancehall", schedule: [{ day: 2, time: "17:00" }, { day: 4, time: "17:00" }], trainerPct: 50 },
];

const toLocalISO = (dt) => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
const addMonth = (d) => { const dt = new Date(d+"T12:00:00"); dt.setMonth(dt.getMonth()+1); return toLocalISO(dt); };
const today = () => toLocalISO(new Date());
const fmt = (d) => { if(!d) return "—"; const dt=new Date(d+"T12:00:00"); return dt.toLocaleDateString("uk-UA",{day:"2-digit",month:"2-digit"}); };
const daysLeft = (ed) => Math.ceil((new Date(ed+"T23:59:59")-new Date())/86400000);

function getSubStatus(sub) {
  if (!sub?.endDate) return "expired";
  if (sub.endDate < today()) return "expired";
  if ((sub.usedTrainings||0) >= (sub.totalTrainings||1)) return "expired";
  const dl = daysLeft(sub.endDate), tl = (sub.totalTrainings||1)-(sub.usedTrainings||0);
  if (dl <= 3 || tl <= 1) return "warning";
  return "active";
}

const STATUS_LABELS = { active: "Активний", warning: "Закінчується", expired: "Протермінований" };
const STATUS_COLORS = { active: "#30D158", warning: "#FF9F0A", expired: "#FF453A" };

// ==========================================
// 2. UI КОМПОНЕНТИ
// ==========================================
const inputSt = { width:"100%", padding:"14px 18px", background:"#1C1C1E", border:"none", borderRadius:16, color:"#fff", fontSize:15, outline:"none", boxSizing:"border-box", fontFamily:"inherit" };
const btnP = { padding:"14px 24px", background:"#0A84FF", color:"#fff", border:"none", borderRadius:18, fontSize:15, fontWeight:700, cursor:"pointer", fontFamily:"inherit", boxShadow:"0 4px 14px rgba(10, 132, 255, 0.3)" };
const btnS = { padding:"14px 24px", background:"#2C2C2E", color:"#fff", border:"none", borderRadius:18, fontSize:15, fontWeight:600, cursor:"pointer", fontFamily:"inherit" };
const cardSt = { background:"#1C1C1E", borderRadius:24, padding:"24px", border:"none" };

function Modal({open, onClose, title, children, wide}){
  if(!open) return null;
  return(
    <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,.7)", backdropFilter:"blur(8px)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#1C1C1E", borderRadius:32, padding:"32px", width:wide?800:500, maxWidth:"100%", maxHeight:"90vh", overflow:"auto", border:"1px solid #2C2C2E"}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24}}>
          <h3 style={{margin:0, fontSize:22, color:"#fff", fontWeight:700}}>{title}</h3>
          <button onClick={onClose} style={{background:"#2C2C2E", borderRadius:"50%", width:36, height:36, border:"none", color:"#8E8E93", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center"}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({label, children}){
  return(<div style={{marginBottom:16}}><label style={{display:"block", fontSize:12, color:"#8E8E93", marginBottom:8, fontWeight:600, textTransform:"uppercase", letterSpacing:0.5}}>{label}</label>{children}</div>);
}

function Badge({color, children}){
  return <span style={{padding:"4px 10px", borderRadius:12, fontSize:12, fontWeight:700, background:`${color}22`, color, whiteSpace:"nowrap"}}>{children}</span>;
}

function Pill({active, onClick, children, color}){
  return <button type="button" onClick={onClick} style={{padding:"8px 16px", borderRadius:100, fontSize:14, fontWeight:600, cursor:"pointer", background:active?(color||"#0A84FF"):"#2C2C2E", color:active?"#fff":"#8E8E93", border:"none", fontFamily:"inherit"}}>{children}</button>;
}

function GroupSelect({groups, value, onChange, filterDir = "all", allowAll = false}) {
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

// ==========================================
// 3. ВІДВІДУВАННЯ (КОМПОНЕНТ)
// ==========================================
function AttendanceTab({ groups, subs, setSubs, attn, setAttn, studentMap, studentGrps, cancelled }) {
  const [viewMode, setViewMode] = useState("daily");
  const [gid, setGid] = useState(groups[0]?.id || "");
  const [date, setDate] = useState(today());
  const [journalMonth, setJournalMonth] = useState(today().slice(0, 7));
  const [manualName, setManualName] = useState("");
  const [manualType, setManualType] = useState("trial");

  const [draft, setDraft] = useState({});
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => { if (groups.length > 0 && !gid) setGid(groups[0].id); }, [groups, gid]);

  const isCan = cancelled.some(c => c.groupId === gid && c.date === date);
  const todayAttn = attn.filter(a => a.groupId === gid && a.date === date);
  const guests = todayAttn.filter(a => a.guestName);

  useEffect(() => {
    const initialDraft = {};
    todayAttn.forEach(a => {
      if (a.subId) initialDraft[`sub_${a.subId}`] = true;
      if (a.guestName) initialDraft[`guest_${a.guestName}`] = true;
    });
    setDraft(initialDraft);
    setIsDirty(false);
  }, [gid, date, attn]);

  const stIdsInGroup = new Set([
    ...studentGrps.filter(sg => sg.groupId === gid).map(sg => sg.studentId),
    ...subs.filter(s => s.groupId === gid).map(s => s.studentId)
  ]);
  const studsInGroup = Array.from(stIdsInGroup).map(id => studentMap[id]).filter(Boolean).sort((a,b) => a.name.localeCompare(b.name, "uk"));

  const studsWithSub = [];
  const studsWithoutSub = [];

  studsInGroup.forEach(student => {
    const stSubs = subs.filter(s => s.studentId === student.id && s.groupId === gid);
    const bestSub = stSubs.find(s => getSubStatus(s) !== "expired") || stSubs.sort((a,b) => new Date(b.endDate) - new Date(a.endDate))[0];
    if (bestSub && getSubStatus(bestSub) !== "expired") {
        studsWithSub.push({ student, sub: bestSub });
    } else {
        const guestEntry = guests.find(g => g.guestName === student.name);
        studsWithoutSub.push({ student, sub: bestSub, guestEntry });
    }
  });

  const manualGuests = guests.filter(g => !studsWithoutSub.some(s => s.student.name === g.guestName));

  const toggleDraft = (key) => {
    if (isCan) return;
    setDraft(p => ({ ...p, [key]: !p[key] }));
    setIsDirty(true);
  };

  const saveBatch = async () => {
    setIsSaving(true);
    let newAttn = [...attn];
    let newSubs = [...subs];

    try {
      for (const {sub} of studsWithSub) {
        const key = `sub_${sub.id}`;
        const isDraftMarked = !!draft[key];
        const dbRecord = todayAttn.find(a => a.subId === sub.id);
        
        if (isDraftMarked && !dbRecord) {
          const a = await db.insertAttendance({ subId: sub.id, date: date, quantity: 1, entryType: "subscription", groupId: gid });
          await db.incrementUsed(sub.id, 1);
          newAttn.push(a);
          newSubs = newSubs.map(s => s.id === sub.id ? { ...s, usedTrainings: (s.usedTrainings || 0) + 1 } : s);
        } else if (!isDraftMarked && dbRecord) {
          await db.deleteAttendanceBySubAndDate(sub.id, date);
          await db.decrementUsed(sub.id, dbRecord.quantity || 1);
          newAttn = newAttn.filter(x => x.id !== dbRecord.id);
          newSubs = newSubs.map(s => s.id === sub.id ? { ...s, usedTrainings: Math.max(0, (s.usedTrainings || 0) - (dbRecord.quantity || 1)) } : s);
        }
      }

      for (const {student, guestEntry} of studsWithoutSub) {
        const key = `guest_${student.name}`;
        const isDraftMarked = !!draft[key];
        
        if (isDraftMarked && !guestEntry) {
          const a = await db.insertAttendance({ guestName: student.name, guestType: "single", groupId: gid, date: date, quantity: 1, entryType: "single" });
          newAttn.push(a);
        } else if (!isDraftMarked && guestEntry) {
          await db.deleteAttendance(guestEntry.id);
          newAttn = newAttn.filter(x => x.id !== guestEntry.id);
        }
      }

      setAttn(newAttn);
      setSubs(newSubs);
      setIsDirty(false);
    } catch (e) { console.error(e); alert("Помилка збереження"); }
    setIsSaving(false);
  };

  const addManual = async () => {
    if (!manualName.trim()) return;
    try {
      const a = await db.insertAttendance({ guestName: manualName.trim(), guestType: manualType, groupId: gid, date: date, quantity: 1, entryType: manualType === "trial" ? "trial" : "single" });
      setAttn(p => [...p, a]);
      setDraft(p => ({...p, [`guest_${a.guestName}`]: true}));
    } catch (e) { console.error(e); }
    setManualName("");
  };

  const removeGuest = async(id) => { 
    try{ await db.deleteAttendance(id); setAttn(p=>p.filter(a=>a.id!==id)); } catch(e){console.error(e)} 
  };

  const generateDays = () => {
    const [y, m] = journalMonth.split('-');
    const daysInMonth = new Date(y, m, 0).getDate();
    return Array.from({length: daysInMonth}, (_, i) => `${y}-${m}-${String(i+1).padStart(2,'0')}`);
  };

  const toggleJournalCell = async (student, cellDate, isCurrentlyAttended, dbRecord, relevantSub) => {
    if (isCurrentlyAttended && dbRecord) {
      await db.deleteAttendance(dbRecord.id);
      if (relevantSub) {
         await db.decrementUsed(relevantSub.id, dbRecord.quantity || 1);
         setSubs(p => p.map(s => s.id === relevantSub.id ? { ...s, usedTrainings: Math.max(0, (s.usedTrainings || 0) - (dbRecord.quantity || 1)) } : s));
      }
      setAttn(p => p.filter(a => a.id !== dbRecord.id));
    } else {
      if (relevantSub) {
        const a = await db.insertAttendance({ subId: relevantSub.id, date: cellDate, quantity: 1, entryType: "subscription", groupId: gid });
        await db.incrementUsed(relevantSub.id, 1);
        setAttn(p => [...p, a]);
        setSubs(p => p.map(s => s.id === relevantSub.id ? { ...s, usedTrainings: (s.usedTrainings || 0) + 1 } : s));
      } else {
        const a = await db.insertAttendance({ guestName: student.name, guestType: "single", groupId: gid, date: cellDate, quantity: 1, entryType: "single" });
        setAttn(p => [...p, a]);
      }
    }
  };

  return (
    <div style={{ maxWidth: viewMode === "journal" ? "100%" : 800 }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 20, borderBottom: "1px solid #21262d", paddingBottom: 16 }}>
        <button style={{...btnS, background: viewMode === "daily" ? "#21262d" : "transparent", color: viewMode === "daily" ? "#fff" : "#8892b0", border: "none"}} onClick={() => setViewMode("daily")}>📝 Відмітити сьогодні</button>
        <button style={{...btnS, background: viewMode === "journal" ? "#21262d" : "transparent", color: viewMode === "journal" ? "#fff" : "#8892b0", border: "none"}} onClick={() => setViewMode("journal")}>🗓 Журнал (Таблиця)</button>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <GroupSelect groups={groups} value={gid} onChange={setGid}/>
        {viewMode === "daily" 
          ? <input style={{...inputSt, width: "auto", minWidth: 160, cursor: "pointer"}} type="date" value={date} onChange={e=>setDate(e.target.value)} onClick={(e) => e.target.showPicker && e.target.showPicker()}/>
          : <input style={{...inputSt, width: "auto", minWidth: 160, cursor: "pointer"}} type="month" value={journalMonth} onChange={e=>setJournalMonth(e.target.value)} onClick={(e) => e.target.showPicker && e.target.showPicker()}/>
        }
      </div>

      {viewMode === "journal" ? (
        <div style={{ overflowX: "auto", background: "#1C1C1E", borderRadius: 16, border: "1px solid #21262d", padding: 10 }}>
          <table style={{ borderCollapse: "collapse", minWidth: "100%", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, background: "#1C1C1E", padding: "10px 16px", textAlign: "left", zIndex: 2, borderRight: "1px solid #2C2C2E", minWidth: 150 }}>Учениця</th>
                {generateDays().map(d => (
                  <th key={d} style={{ padding: "8px 4px", color: "#8892b0", fontWeight: 500, minWidth: 36, textAlign: "center", borderBottom: "1px solid #2C2C2E" }}>
                    {d.slice(-2)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {studsInGroup.map(st => (
                <tr key={st.id} style={{ borderBottom: "1px solid #2C2C2E" }}>
                  <td style={{ position: "sticky", left: 0, background: "#1C1C1E", padding: "10px 16px", fontWeight: 600, color: "#fff", borderRight: "1px solid #2C2C2E", zIndex: 1 }}>
                    {st.name}
                  </td>
                  {generateDays().map(d => {
                    const rec = attn.find(a => a.groupId === gid && a.date === d && (a.subId ? subs.find(s=>s.id===a.subId)?.studentId === st.id : a.guestName === st.name));
                    const isAttended = !!rec;
                    const relevantSub = subs.find(s => s.studentId === st.id && s.groupId === gid && s.startDate <= d && s.endDate >= d);
                    
                    return (
                      <td key={d} style={{ textAlign: "center", padding: "4px" }} onClick={() => toggleJournalCell(st, d, isAttended, rec, relevantSub)}>
                        <div style={{ width: 24, height: 24, margin: "0 auto", borderRadius: 6, background: isAttended ? "#30D158" : "#2C2C2E", border: `1px solid ${isAttended ? "#30D158" : "#3A3A3C"}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14 }}>
                          {isAttended ? "✓" : ""}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {isCan && <div style={{ background: "rgba(255,69,58,0.1)", border: "1px solid rgba(255,69,58,0.3)", borderRadius: 16, padding: "12px 16px", marginBottom: 20, color: "#FF453A", fontWeight: 600 }}>❌ Тренування відмінено</div>}

          {studsWithSub.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, color: "#8892b0", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, paddingLeft: 4 }}>
                З абонементом ({studsWithSub.length})
              </div>
              <div style={{ background: "#1C1C1E", borderRadius: 20, overflow: "hidden" }}>
                {studsWithSub.map(({sub, student}, i) => {
                  const key = `sub_${sub.id}`;
                  const isMarked = !!draft[key];
                  return (
                  <div key={sub.id} onClick={() => toggleDraft(key)} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "16px 20px", borderBottom: i < studsWithSub.length - 1 ? "1px solid #2C2C2E" : "none",
                    cursor: isCan ? "default" : "pointer", transition: "background 0.2s",
                    background: isMarked ? "rgba(48, 209, 88, 0.1)" : "transparent", opacity: isCan ? 0.5 : 1
                  }}>
                    <div>
                      <div style={{ color: "#fff", fontSize: 16, fontWeight: 600 }}>{student.name}</div>
                      <div style={{ color: "#8E8E93", fontSize: 13, marginTop: 4 }}>
                        <span style={{ color: isMarked ? "#30D158" : "#fff", fontWeight: 700 }}>{sub.usedTrainings}</span> / {sub.totalTrainings} · до {fmt(sub.endDate)}
                      </div>
                    </div>
                    <div style={{ width: 28, height: 28, borderRadius: 8, border: `2px solid ${isMarked ? "#30D158" : "#3A3A3C"}`, background: isMarked ? "#30D158" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 16, fontWeight: "bold" }}>
                      {isMarked && "✓"}
                    </div>
                  </div>
                )})}
              </div>
            </div>
          )}

          {studsWithoutSub.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, color: "#8892b0", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, paddingLeft: 4 }}>
                Без активного абонемента ({studsWithoutSub.length})
              </div>
              <div style={{ background: "#1C1C1E", borderRadius: 20, overflow: "hidden" }}>
                {studsWithoutSub.map(({student, sub}, i) => {
                  const key = `guest_${student.name}`;
                  const isMarked = !!draft[key];
                  return (
                  <div key={student.id} onClick={() => toggleDraft(key)} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "16px 20px", borderBottom: i < studsWithoutSub.length - 1 ? "1px solid #2C2C2E" : "none",
                    cursor: isCan ? "default" : "pointer", transition: "background 0.2s",
                    background: isMarked ? "rgba(255, 159, 10, 0.1)" : "transparent", opacity: isCan ? 0.5 : 1
                  }}>
                    <div>
                      <div style={{ color: "#fff", fontSize: 16, fontWeight: 600 }}>{student.name}</div>
                      <div style={{ color: isMarked ? "#FF9F0A" : "#FF453A", fontSize: 13, marginTop: 4 }}>
                        {isMarked ? "Буде відмічено як разове" : (sub ? "Абонемент закінчився" : "Немає абонемента")}
                      </div>
                    </div>
                    <div style={{ width: 28, height: 28, borderRadius: 8, border: `2px solid ${isMarked ? "#FF9F0A" : "#3A3A3C"}`, background: isMarked ? "#FF9F0A" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 16, fontWeight: "bold" }}>
                      {isMarked && "✓"}
                    </div>
                  </div>
                )})}
              </div>
            </div>
          )}

          {manualGuests.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, color: "#8892b0", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, paddingLeft: 4 }}>
                Нові гості ({manualGuests.length})
              </div>
              <div style={{ background: "#1C1C1E", borderRadius: 20, overflow: "hidden" }}>
                {manualGuests.map((g, i) => (
                  <div key={g.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "16px 20px", borderBottom: i < manualGuests.length - 1 ? "1px solid #2C2C2E" : "none",
                  }}>
                    <div>
                      <div style={{ color: "#fff", fontSize: 16, fontWeight: 600 }}>{g.guestName}</div>
                      <div style={{ color: g.entryType === "trial" ? "#30D158" : "#FF9F0A", fontSize: 13, marginTop: 4, fontWeight: 500 }}>
                        {g.entryType === "trial" ? "Пробне" : "Разове"}
                      </div>
                    </div>
                    <button onClick={() => removeGuest(g.id)} style={{ background: "none", border: "none", color: "#FF453A", fontSize: 24, cursor: "pointer" }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isDirty && (
            <div style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", zIndex: 100, width: "calc(100% - 40px)", maxWidth: 400 }}>
              <button onClick={saveBatch} disabled={isSaving} style={{ ...btnP, width: "100%", background: "#30D158", padding: "16px", fontSize: 16, borderRadius: 100, boxShadow: "0 10px 30px rgba(48,209,88,0.4)" }}>
                {isSaving ? "Зберігаємо..." : "💾 Зберегти відмітки"}
              </button>
            </div>
          )}

          <div style={{ background: "#1C1C1E", borderRadius: 20, padding: "20px" }}>
            <div style={{ fontSize: 13, color: "#8892b0", marginBottom: 16, fontWeight: 600 }}>+ Додати нову людину вручну</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <input style={inputSt} value={manualName} onChange={e=>setManualName(e.target.value)} placeholder="Ім'я учениці" onKeyDown={e=>e.key==="Enter"&&addManual()}/>
              </div>
              <div style={{ display: "flex", gap: 6, background: "#2C2C2E", padding: 6, borderRadius: 100 }}>
                <Pill active={manualType==="trial"} onClick={()=>setManualType("trial")} color="#30D158">Пробне</Pill>
                <Pill active={manualType==="single"} onClick={()=>setManualType("single")} color="#FF9F0A">Разове</Pill>
              </div>
              <button style={{...btnP, borderRadius: 100, background: "#0A84FF"}} onClick={addManual}>Додати</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ==========================================
// 4. ГОЛОВНИЙ ДОДАТОК
// ==========================================
export default function App() {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [subs, setSubs] = useState([]);
  const [attn, setAttn] = useState([]);
  const [groups, setGroups] = useState(DEFAULT_GROUPS);
  const [cancelled, setCancelled] = useState([]);
  const [studentGrps, setStudentGrps] = useState([]);
  const [waitlist, setWaitlist] = useState([]); 
  
  const [tab, setTab] = useState("dashboard");
  const [modal, setModal] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [financeDetailItem, setFinanceDetailItem] = useState(null);
  const [searchQ, setSearchQ] = useState("");
  
  const [filterDir, setFilterDir] = useState("all");
  const [filterGroup, setFilterGroup] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [stFilterDir, setStFilterDir] = useState("all");
  const [stFilterGroup, setStFilterGroup] = useState("all");
  const [finFilterDir, setFinFilterDir] = useState("all");
  const [finFilterGroup, setFinFilterGroup] = useState("all");
  const [finSortBy, setFinSortBy] = useState("total"); 
  const [finSortOrder, setFinSortOrder] = useState("desc");

  const [expandedDirs, setExpandedDirs] = useState({});
  const [expandedSubDirs, setExpandedSubDirs] = useState({});

  useEffect(()=>{(async()=>{try{
    const [st,gr,su,at,ca,sg]=await Promise.all([db.fetchStudents(),db.fetchGroups(),db.fetchSubs(),db.fetchAttendance(),db.fetchCancelled(),db.fetchStudentGroups()]);
    setStudents(st||[]);if(gr?.length)setGroups(gr);setSubs(su||[]);setAttn(at||[]);setCancelled(ca||[]);setStudentGrps(sg||[]);
    try { if (db.fetchWaitlist) { const wl = await db.fetchWaitlist(); setWaitlist(wl || []); } } catch(e) {}
  }catch(e){console.error(e)}setLoading(false)})()},[]);

  const studentMap = useMemo(()=>Object.fromEntries(students.map(s=>[s.id,s])),[students]);
  const groupMap = useMemo(()=>Object.fromEntries(groups.map(g=>[g.id,g])),[groups]);
  const dirMap = useMemo(()=>Object.fromEntries(DIRECTIONS.map(d=>[d.id,d])),[]);
  const subsExt = useMemo(()=>subs.map(s=>({...s,status:getSubStatus(s)})),[subs]);
  const activeSubs = useMemo(()=>subsExt.filter(s=>s.status!=="expired"),[subsExt]);
  const warnSubs = useMemo(()=>subsExt.filter(s=>s.status==="warning"),[subsExt]);
  const expSubs = useMemo(()=>subsExt.filter(s=>s.status==="expired"),[subsExt]);

  const notifications = useMemo(()=>{
    const items=[];
    [...warnSubs,...expSubs].forEach(sub=>{
      const st=studentMap[sub.studentId],gr=groupMap[sub.groupId];if(!st)return;
      if(sub.status==="expired"){const hasNewer=subs.some(s=>s.id!==sub.id&&s.studentId===sub.studentId&&s.groupId===sub.groupId&&getSubStatus(s)!=="expired");if(hasNewer)return;}
      const dir=gr?dirMap[gr.directionId]:null;
      items.push({subId:sub.id,type:sub.status==="expired"?"expired":"warning",student:st,group:gr,direction:dir,
        message:sub.status==="expired"?"Абонемент закінчився":(daysLeft(sub.endDate)<=3?`${daysLeft(sub.endDate)} дн.`:`${(sub.totalTrainings||0)-(sub.usedTrainings||0)} трен.`),
        notified:sub.notificationSent});
    });return items;
  },[warnSubs,expSubs,studentMap,groupMap,subs,dirMap]);

  const analytics = useMemo(()=>{
    const totalRev=subs.filter(s=>s.paid).reduce((a,s)=>a+(s.amount||0),0);
    const unpaid=subs.filter(s=>!s.paid&&getSubStatus(s)!=="expired").reduce((a,s)=>a+(s.amount||0),0);
    const byDir={};DIRECTIONS.forEach(d=>{const gids=groups.filter(g=>g.directionId===d.id).map(g=>g.id);const ds=activeSubs.filter(s=>gids.includes(s.groupId));byDir[d.id]={students:new Set(ds.map(s=>s.studentId)).size}});
    const splits=[]; groups.forEach(g=>{
      const gSubs=subs.filter(s=>s.groupId===g.id&&s.paid);
      const total=gSubs.reduce((a,s)=>a+(s.amount||0),0);
      if(total>0){const tPct=g.trainerPct||50;splits.push({group:g,total,trainer:Math.round(total*tPct/100),studio:Math.round(total*(100-tPct)/100), subs: gSubs})}
    });
    let totalLTV = 0; let usersWithPurchases = 0; let trialUsers = 0; let convertedUsers = 0;
    Object.values(studentMap).forEach(st => {
      const stSubs = subs.filter(s => s.studentId === st.id);
      if(stSubs.length > 0) {
        const moneySpent = stSubs.filter(s => s.paid).reduce((acc, curr) => acc + (curr.amount || 0), 0);
        if(moneySpent > 0) { totalLTV += moneySpent; usersWithPurchases++; }
        const hadTrial = stSubs.some(s => s.planType === "trial");
        if(hadTrial) { trialUsers++; if(stSubs.some(s => s.planType !== "trial")) convertedUsers++; }
      }
    });
    return {totalStudents:students.length, activeStudents:new Set(activeSubs.map(s=>s.studentId)).size, totalRev, unpaid, byDir, splits, avgLTV: usersWithPurchases > 0 ? Math.round(totalLTV / usersWithPurchases) : 0, conversionRate: trialUsers > 0 ? Math.round((convertedUsers / trialUsers) * 100) : 0};
  },[students,subs,activeSubs,groups, studentMap]);

  const filteredStudents=useMemo(()=>{
    let r=students;
    if(searchQ){const q=searchQ.toLowerCase();r=r.filter(s=>s.name.toLowerCase().includes(q))}
    if(stFilterDir !== "all"){ const gids = groups.filter(g => g.directionId === stFilterDir).map(g => g.id); r = r.filter(st => studentGrps.some(sg => sg.studentId === st.id && gids.includes(sg.groupId))); }
    if(stFilterGroup !== "all") r = r.filter(st => studentGrps.some(sg => sg.studentId === st.id && sg.groupId === stFilterGroup));
    return r.sort((a,b)=>a.name.localeCompare(b.name,"uk"));
  },[students, searchQ, stFilterDir, stFilterGroup, groups, studentGrps]);

  const studentsByDirection=useMemo(()=>{
    const result={}; DIRECTIONS.forEach(d=>{result[d.id]={direction:d,students:[]}});
    filteredStudents.forEach(st=>{
      const sgs=studentGrps.filter(sg=>sg.studentId===st.id);
      const dirs=new Set(); sgs.forEach(sg=>{const g=groupMap[sg.groupId]; if(g)dirs.add(g.directionId)});
      dirs.forEach(did=>{if(result[did])result[did].students.push(st)});
    });
    return{grouped:Object.values(result).filter(d=>d.students.length>0)};
  },[filteredStudents,studentGrps,groupMap]);

  const filteredSubs=useMemo(()=>{
    let r=subsExt;
    if(filterDir!=="all"){const gids=groups.filter(g=>g.directionId===filterDir).map(g=>g.id);r=r.filter(s=>gids.includes(s.groupId))}
    if(filterGroup!=="all")r=r.filter(s=>s.groupId===filterGroup);
    if(filterStatus!=="all")r=r.filter(s=>s.status===filterStatus);
    if(searchQ){const q=searchQ.toLowerCase();r=r.filter(s=>studentMap[s.studentId]?.name?.toLowerCase().includes(q))}
    return r.sort((a,b)=>({warning:0,active:1,expired:2}[a.status]??3)-({warning:0,active:1,expired:2}[b.status]??3));
  },[subsExt,filterDir,filterGroup,filterStatus,searchQ,groups,studentMap]);

  const subsGroupedByDir = useMemo(()=>{
    const result={}; DIRECTIONS.forEach(d=>{result[d.id]={direction:d,subs:[]}});
    filteredSubs.forEach(sub=>{
      const gr=groupMap[sub.groupId];
      if(gr && result[gr.directionId]){result[gr.directionId].subs.push(sub);}
    });
    return {grouped:Object.values(result).filter(d=>d.subs.length>0)};
  },[filteredSubs, groupMap]);

  // ─── ФОРМИ ───
  function StudentForm({initial,onDone}){
    const [firstName,setFirstName]=useState(initial?.firstName||initial?.first_name||"");
    const [lastName,setLastName]=useState(initial?.lastName||initial?.last_name||"");
    const [phone,setPhone]=useState(initial?.phone||"");
    const [telegram,setTelegram]=useState(initial?.telegram||"");
    const [notes,setNotes]=useState(initial?.notes||"");
    const [msgTpl,setMsgTpl]=useState(initial?.messageTemplate||initial?.message_template||"");
    const [selGrps,setSelGrps]=useState(()=>initial?.id?studentGrps.filter(sg=>sg.studentId===initial.id).map(sg=>sg.groupId):[]);
    const toggleGrp=(gid)=>setSelGrps(p=>p.includes(gid)?p.filter(g=>g!==gid):[...p,gid]);
    return(<div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <Field label="Ім'я *"><input style={inputSt} value={firstName} onChange={e=>setFirstName(e.target.value)} placeholder="Олена"/></Field>
        <Field label="Прізвище"><input style={inputSt} value={lastName} onChange={e=>setLastName(e.target.value)} placeholder="Петренко"/></Field>
      </div>
      <Field label="Телефон"><input style={inputSt} value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+380..."/></Field>
      <Field label="Telegram"><input style={inputSt} value={telegram} onChange={e=>setTelegram(e.target.value)} placeholder="@username"/></Field>
      <Field label="Групи / напрямки">
        <div style={{display:"flex",flexDirection:"column",gap:10, background: "#121212", padding: 16, borderRadius: 16}}>
          {DIRECTIONS.map(d=><div key={d.id}><div style={{fontSize:12,color:d.color,fontWeight:700,marginBottom:8}}>{d.name}</div><div style={{display:"flex",flexWrap:"wrap",gap:8}}>{groups.filter(g=>g.directionId===d.id).map(g=><Pill key={g.id} active={selGrps.includes(g.id)} color={d.color} onClick={()=>toggleGrp(g.id)}>{g.name}</Pill>)}</div></div>)}
        </div>
      </Field>
      <Field label="Шаблон повідомлення"><textarea style={{...inputSt,minHeight:80,resize:"vertical"}} value={msgTpl} onChange={e=>setMsgTpl(e.target.value)} placeholder="Привіт, {ім'я}! Абонемент у {група} ({напрямок}) закінчився..."/><div style={{fontSize:11,color:"#8E8E93",marginTop:6}}>Змінні: {"{ім'я}"}, {"{група}"}, {"{напрямок}"}</div></Field>
      <Field label="Нотатки"><textarea style={{...inputSt,minHeight:60,resize:"vertical"}} value={notes} onChange={e=>setNotes(e.target.value)}/></Field>
      <div style={{display:"flex",gap:12,justifyContent:"flex-end",marginTop:24}}>
        <button style={btnS} onClick={()=>setModal(null)}>Скасувати</button>
        <button style={{...btnP,opacity:firstName.trim()?1:.4}} onClick={()=>{if(!firstName.trim())return;onDone({first_name:firstName.trim(),last_name:lastName.trim(),name:[firstName.trim(),lastName.trim()].filter(Boolean).join(' '),phone,telegram,notes,message_template:msgTpl,selectedGroups:selGrps})}}>{initial?"Зберегти зміни":"Додати ученицю"}</button>
      </div>
    </div>);
  }

  function SubForm({initial,onDone}){
    const [studentId,setStudentId]=useState(initial?.studentId||"");
    const [groupId,setGroupId]=useState(initial?.groupId||"");
    const [planType,setPlanType]=useState(initial?.planType||"8pack");
    const [startDate,setStartDate]=useState(initial?.startDate||today());
    const [amount,setAmount]=useState(initial?.amount||1500);
    const [paid,setPaid]=useState(initial?.paid??false);
    const [payMethod,setPayMethod]=useState(initial?.payMethod||"card");
    const [discountPct,setDiscountPct]=useState(initial?.discountPct||0);
    const [discountSource,setDiscountSource]=useState(initial?.discountSource||"studio");
    const [notes,setNotes]=useState(initial?.notes||"");
    
    const plan=PLAN_TYPES.find(p=>p.id===planType);
    const totalTrainings=plan?.trainings||8;
    const endDate=addMonth(startDate);
    const basePrice=plan?.price||0;
    
    useEffect(()=>{if(!initial){const p=PLAN_TYPES.find(p=>p.id===planType);if(p)setAmount(p.price-Math.round(p.price*discountPct/100))}},[planType,discountPct]);
    
    return(<div>
      <Field label="Учениця *"><select style={{...inputSt, cursor:"pointer"}} value={studentId} onChange={e=>setStudentId(e.target.value)}><option value="">Оберіть зі списку...</option>{students.sort((a,b)=>a.name.localeCompare(b.name,"uk")).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <Field label="Група *"><GroupSelect groups={groups} value={groupId} onChange={setGroupId} /></Field>
      <Field label="Тип Абонемента"><div style={{display:"flex",gap:8,flexWrap:"wrap", background: "#121212", padding: 12, borderRadius: 16}}>{PLAN_TYPES.map(p=><Pill key={p.id} active={planType===p.id} onClick={()=>setPlanType(p.id)}>{p.name} — {p.price}₴</Pill>)}</div></Field>
      
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <Field label="Початок (Клікніть для календаря)"><input style={{...inputSt, cursor: "pointer"}} type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} onClick={(e) => e.target.showPicker && e.target.showPicker()} /></Field>
        <Field label="Кінець (Автоматично)"><input style={{...inputSt, opacity:.5, cursor: "not-allowed"}} type="date" value={endDate} readOnly/></Field>
      </div>

      <div style={{background:"#121212",borderRadius:20,padding:"20px",marginBottom:16, border: "1px solid #2C2C2E"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <Field label="Знижка (%)"><input style={inputSt} type="number" min={0} max={100} value={discountPct} onChange={e=>setDiscountPct(Math.min(100,Math.max(0,+e.target.value)))}/></Field>
          <Field label="Знижка за рахунок"><div style={{display:"flex",gap:6, background:"#1C1C1E", padding:6, borderRadius:100}}><Pill active={discountSource==="studio"} onClick={()=>setDiscountSource("studio")}>Студії</Pill><Pill active={discountSource==="trainer"} onClick={()=>setDiscountSource("trainer")}>Тренера</Pill><Pill active={discountSource==="split"} onClick={()=>setDiscountSource("split")}>50/50</Pill></div></Field>
        </div>
        {discountPct>0&&<div style={{fontSize:13,color:"#FF9F0A",marginTop:8, fontWeight: 500}}>Початкова ціна: {basePrice}₴ → Знижка -{Math.round(basePrice*discountPct/100)}₴ → <strong style={{color:"#30D158", fontSize: 16}}>До сплати: {basePrice-Math.round(basePrice*discountPct/100)}₴</strong></div>}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <Field label="Сумма до сплати (грн)"><input style={{...inputSt, color: "#30D158", fontWeight: 700, fontSize: 18}} type="number" min={0} value={amount} onChange={e=>setAmount(+e.target.value)}/></Field>
        <Field label="Метод оплати"><div style={{display:"flex",gap:8}}>{PAY_METHODS.map(m=><Pill key={m.id} active={payMethod===m.id} onClick={()=>setPayMethod(m.id)}>{m.name}</Pill>)}</div></Field>
      </div>
      <label style={{display:"flex",alignItems:"center",gap:12,color:"#fff",cursor:"pointer",fontSize:16,marginBottom:20, background: "#1C1C1E", padding: "16px 20px", borderRadius: 16}}><input type="checkbox" checked={paid} onChange={e=>setPaid(e.target.checked)} style={{width: 20, height: 20}}/> <strong>Абонемент оплачено</strong></label>
      <Field label="Нотатки"><textarea style={{...inputSt,minHeight:60,resize:"vertical"}} value={notes} onChange={e=>setNotes(e.target.value)}/></Field>
      <div style={{display:"flex",gap:12,justifyContent:"flex-end",marginTop:24}}>
        <button style={btnS} onClick={()=>setModal(null)}>Скасувати</button>
        <button style={{...btnP,opacity:studentId&&groupId?1:.4}} onClick={()=>{if(!studentId||!groupId)return;onDone({studentId,groupId,planType,startDate,endDate,totalTrainings,usedTrainings:initial?.usedTrainings||0,amount,paid,payMethod,discountPct,discountSource,basePrice,notes,notificationSent:initial?.notificationSent||false})}}>{initial?"Зберегти зміни":"Створити абонемент"}</button>
      </div>
    </div>);
  }

  function WaitlistForm({onDone}) {
    const [studentId, setStudentId] = useState("");
    const [groupId, setGroupId] = useState("");
    return (<div>
      <Field label="Учениця *"><select style={inputSt} value={studentId} onChange={e=>setStudentId(e.target.value)}><option value="">Обрати...</option>{students.sort((a,b)=>a.name.localeCompare(b.name,"uk")).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <Field label="В яку групу чекає? *"><GroupSelect groups={groups} value={groupId} onChange={setGroupId} /></Field>
      <div style={{display:"flex",gap:12,justifyContent:"flex-end",marginTop:24}}>
        <button style={btnS} onClick={()=>setModal(null)}>Скасувати</button>
        <button style={{...btnP, background: "#FF9F0A", opacity:studentId&&groupId?1:.4}} onClick={()=>{if(studentId&&groupId) onDone({studentId, groupId, dateAdded: today()})}}>Додати в резерв</button>
      </div>
    </div>)
  }

  // ─── ХЕНДЛЕРИ ───
  const addStudent=async(d)=>{try{const{selectedGroups,...sd}=d;const s=await db.insertStudent(sd);setStudents(p=>[...p,s]);if(selectedGroups?.length)for(const gid of selectedGroups){const sg=await db.addStudentGroup(s.id,gid);setStudentGrps(p=>[...p,sg])}}catch(e){alert("Помилка: "+e.message)}setModal(null)};
  const editStudent=async(d)=>{try{const{selectedGroups,...sd}=d;const s=await db.updateStudent(editItem.id,sd);setStudents(p=>p.map(x=>x.id===s.id?s:x));if(selectedGroups){const existing=studentGrps.filter(sg=>sg.studentId===editItem.id);for(const sg of existing){if(!selectedGroups.includes(sg.groupId))await db.removeStudentGroup(editItem.id,sg.groupId)}for(const gid of selectedGroups){if(!existing.some(sg=>sg.groupId===gid))await db.addStudentGroup(editItem.id,gid)}const fresh=await db.fetchStudentGroups();setStudentGrps(fresh)}}catch(e){alert("Помилка: "+e.message)}setModal(null);setEditItem(null)};
  const deleteStudent=async(id)=>{if(!confirm("Видалити ученицю?"))return;try{await db.deleteStudent(id);setStudents(p=>p.filter(s=>s.id!==id));setSubs(p=>p.filter(s=>s.studentId!==id))}catch(e){alert(e.message)}};
  const addSub=async(d)=>{try{const s=await db.insertSub(d);setSubs(p=>[s,...p])}catch(e){alert(e.message)}setModal(null)};
  const editSub=async(d)=>{try{const s=await db.updateSub(editItem.id,d);setSubs(p=>p.map(x=>x.id===s.id?s:x))}catch(e){alert(e.message)}setModal(null);setEditItem(null)};
  const deleteSub=async(id)=>{if(!confirm("Видалити абонемент?"))return;try{await db.deleteSub(id);setAttn(p=>p.filter(a=>a.subId!==id));setSubs(p=>p.filter(s=>s.id!==id))}catch(e){alert(e.message)}};
  const markNotified=async(subId)=>{try{await db.updateSub(subId,{notificationSent:true});setSubs(p=>p.map(s=>s.id===subId?{...s,notificationSent:true}:s))}catch(e){console.error(e)}};

  if(loading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#000",color:"#8E8E93",fontFamily:"sans-serif",fontSize:18}}>Завантаження...</div>;

  return (
    <div style={{minHeight:"100vh", background:"#000", color:"#fff", fontFamily:"'DM Sans',sans-serif", paddingBottom: 100}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
      
      <header style={{padding:"30px 24px 20px", maxWidth:1200, margin:"0 auto", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:16}}>
        <div><h1 style={{margin:0, fontSize:28, fontWeight:800, letterSpacing: "-1px"}}>Dance Studio.</h1></div>
        <div style={{display:"flex", gap:12}}><button style={btnS} onClick={()=>setModal("addStudent")}>+ Учениця</button><button style={btnP} onClick={()=>setModal("addSub")}>+ Абонемент</button></div>
      </header>

      <nav style={{maxWidth:1200, margin:"0 auto", padding:"0 24px 30px", overflowX:"auto"}}>
        <div style={{display:"inline-flex", background: "#1C1C1E", borderRadius: 100, padding: 6}}>
          {[
            {id:"dashboard", icon:"📊", label:"Дашборд"},
            {id:"students", icon:"👩‍🎤", label:"Учениці"},
            {id:"subs", icon:"🎫", label:"Абонементи"},
            {id:"attendance", icon:"✅", label:"Відвідування"},
            {id:"alerts", icon:notifications.filter(n=>!n.notified).length?"🔴":"🔔", label:"Сповіщення"},
            {id:"finance", icon:"💰", label:"Фінанси"}
          ].map(t=><button key={t.id} onClick={()=>{setTab(t.id);setSearchQ("")}} style={{padding: "10px 20px", background: tab===t.id ? "#3A3A3C" : "transparent", border: "none", borderRadius: 100, color: tab===t.id ? "#fff" : "#8E8E93", fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", transition: "0.2s"}}>{t.icon} {t.label}</button>)}
        </div>
      </nav>

      <main style={{maxWidth:1200, margin:"0 auto", padding:"0 24px"}}>
        
        {/* === ДАШБОРД === */}
        {tab==="dashboard" && <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:16,marginBottom:30}}>
            {[{l:"Учениць",v:analytics.totalStudents,s:`${analytics.activeStudents} активних`,c:"#0A84FF"},{l:"Абонементів",v:activeSubs.length,s:`${warnSubs.length} закінч.`,c:"#30D158"},{l:"Дохід",v:`${analytics.totalRev.toLocaleString()}₴`,s:`${analytics.unpaid.toLocaleString()}₴ борги`,c:"#FF9F0A"},{l:"Сповіщення",v:notifications.filter(n=>!n.notified).length,s:"непрочит.",c:"#FF453A"}].map((c,i)=><div key={i} style={{...cardSt, display: "flex", flexDirection: "column", gap: 6}}><div style={{fontSize:13,color:"#8E8E93",textTransform:"uppercase", fontWeight: 700}}>{c.l}</div><div style={{fontSize:36,fontWeight:800,color:c.c}}>{c.v}</div><div style={{fontSize:13,color:"#8E8E93", fontWeight: 600}}>{c.s}</div></div>)}
          </div>
          <h3 style={{color:"#fff",fontSize:20,marginBottom:16, fontWeight: 800}}>Глибока аналітика 🧠</h3>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:16,marginBottom:40}}>
            <div style={{...cardSt, background: "linear-gradient(135deg, #1C1C1E, #2C1A35)"}}><div style={{fontSize:13,color:"#E58EED",textTransform:"uppercase", fontWeight: 700}}>LTV (Середній чек)</div><div style={{fontSize:32,fontWeight:800,color:"#fff",margin:"8px 0"}}>{analytics.avgLTV.toLocaleString()} ₴</div><div style={{fontSize:13,color:"#8E8E93"}}>З однієї учениці за весь час</div></div>
            <div style={{...cardSt, background: "linear-gradient(135deg, #1C1C1E, #352115)"}}><div style={{fontSize:13,color:"#FF9F0A",textTransform:"uppercase", fontWeight: 700}}>Конверсія з пробного</div><div style={{fontSize:32,fontWeight:800,color:"#fff",margin:"8px 0"}}>{analytics.conversionRate} %</div><div style={{fontSize:13,color:"#8E8E93"}}>Купили повний абонемент</div></div>
          </div>
          <h3 style={{color:"#fff",fontSize:20,marginBottom:16, fontWeight: 800}}>За напрямками</h3>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:16}}>
            {DIRECTIONS.map(d=>{const data=analytics.byDir[d.id]||{students:0};return<div key={d.id} style={{...cardSt, padding: "20px"}}><div style={{fontSize:14,fontWeight:700,color:d.color, marginBottom: 8}}>{d.name}</div><div style={{fontSize:28,fontWeight:800,color:"#fff"}}>{data.students} <span style={{fontSize: 14, color: "#8E8E93", fontWeight: 600}}>уч.</span></div></div>})}
          </div>
        </div>}

        {/* === УЧЕНИЦІ === */}
        {tab==="students" && <div>
          <div style={{display:"flex",gap:12,marginBottom:24,flexWrap:"wrap",justifyContent:"space-between", background: "#1C1C1E", padding: 16, borderRadius: 24}}>
            <div style={{display: "flex", gap: 12, flexWrap: "wrap", flex: 1}}>
              <input style={{...inputSt,maxWidth:300}} placeholder="Пошук учениці..." value={searchQ} onChange={e=>setSearchQ(e.target.value)}/>
              <select style={{...inputSt,width:"auto"}} value={stFilterDir} onChange={e=>{setStFilterDir(e.target.value);setStFilterGroup("all")}}>
                <option value="all">Усі напрямки</option>
                {DIRECTIONS.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <GroupSelect groups={groups} value={stFilterGroup} onChange={setStFilterGroup} filterDir={stFilterDir} allowAll={true} />
            </div>
            <button style={{...btnP, background: "#FF9F0A", boxShadow: "none", height: "fit-content"}} onClick={()=>setModal("addWaitlist")}>+ В резерв</button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:20, marginBottom: 30}}>
            {studentsByDirection.grouped.map(({direction,students:dStudents})=>{
              const isExpanded = expandedDirs[direction.id];
              return (
                <div key={direction.id} style={{background: "#1C1C1E", borderRadius: 28, overflow: 'hidden'}}>
                  <button onClick={() => setExpandedDirs(p => ({...p, [direction.id]: !p[direction.id]}))} style={{width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'24px', background:'transparent', border:'none', cursor:'pointer', textAlign:'left'}}>
                    <div style={{fontSize:18,fontWeight:800,color:direction.color}}>{direction.name} <span style={{color:"#8E8E93",fontSize:15,fontWeight:600, marginLeft: 8}}>({dStudents.length})</span></div>
                    <div style={{color:"#8E8E93", fontSize: 16}}>{isExpanded ? "▲" : "▼"}</div>
                  </button>
                  {isExpanded && (<div style={{padding:'0 24px 24px 24px', display:'flex', flexDirection:'column', gap:12}}>
                    {dStudents.map(st => {
                      const active=subsExt.filter(s=>s.studentId===st.id && s.status!=="expired");
                      return <div key={st.id} style={{background: "#2C2C2E", borderRadius: 20, padding: "20px", display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:16}}>
                        <div style={{minWidth:200}}>
                          <div style={{color:"#fff",fontWeight:700,fontSize:16}}>{st.name}</div>
                          <div style={{color:"#8E8E93",fontSize:14, marginTop: 6, fontWeight: 500}}>{[st.phone,st.telegram].filter(Boolean).join(" · ")||"—"}</div>
                        </div>
                        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{active.map(s=>{const g=groupMap[s.groupId];const d=g?dirMap[g.directionId]:null;return <Badge key={s.id} color={d?.color||"#888"}>{g?.name} ({s.usedTrainings}/{s.totalTrainings})</Badge>})}</div>
                        <div style={{display:"flex",gap:8}}><button style={{...btnS,padding:"10px 16px",fontSize:14}} onClick={()=>{setEditItem(st);setModal("editStudent")}}>✏️ Редагувати</button><button style={{background:"none",border:"none",color:"#FF453A",fontSize:20,cursor:"pointer",padding:"0 10px"}} onClick={()=>deleteStudent(st.id)}>🗑</button></div>
                      </div>
                    })}
                  </div>)}
                </div>
              );
            })}
          </div>
          {waitlist.length > 0 && (
            <div style={{background: "linear-gradient(135deg, #1C1C1E, #352115)", borderRadius: 28, overflow: 'hidden'}}>
              <div style={{padding:'24px', display: "flex", justifyContent: "space-between"}}>
                <span style={{fontSize:18,fontWeight:800,color:"#FF9F0A"}}>⏳ Лист очікування ({waitlist.length})</span>
              </div>
              <div style={{padding:'0 24px 24px 24px', display:'flex', flexDirection:'column', gap:12}}>
                {waitlist.map(w => {
                  const st = studentMap[w.studentId]; const gr = groupMap[w.groupId];
                  if(!st || !gr) return null;
                  return (
                    <div key={w.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center", background: "#2C2C2E", padding: "20px", borderRadius: 20}}>
                      <div><div style={{color:"#fff",fontWeight:700,fontSize:16}}>{st.name}</div><div style={{color:"#8E8E93",fontSize:14, marginTop: 6, fontWeight: 500}}>Хоче в: <strong style={{color:"#fff"}}>{gr.name}</strong></div></div>
                      <button style={{...btnS,padding:"10px 16px",fontSize:14,color:"#FF453A", background: "#1C1C1E"}} onClick={()=>db.deleteWaitlist(w.id).then(()=>setWaitlist(p=>p.filter(x=>x.id!==w.id)))}>Видалити</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>}

        {/* === АБОНЕМЕНТИ === */}
        {tab==="subs" && <div>
          <div style={{display:"flex",gap:12,marginBottom:24,flexWrap:"wrap", background: "#1C1C1E", padding: 16, borderRadius: 24}}>
            <input style={{...inputSt,width:"auto",minWidth:250, flexGrow: 1}} placeholder="Пошук за іменем..." value={searchQ} onChange={e=>setSearchQ(e.target.value)}/>
            <select style={{...inputSt,width:"auto"}} value={filterDir} onChange={e=>{setFilterDir(e.target.value);setFilterGroup("all")}}>
              <option value="all">Усі напрямки</option>
              {DIRECTIONS.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <GroupSelect groups={groups} value={filterGroup} onChange={setFilterGroup} filterDir={filterDir} allowAll={true} />
            <select style={{...inputSt,width:"auto"}} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
              <option value="all">Усі статуси</option><option value="active">Активні</option><option value="warning">Закінчуються</option><option value="expired">Протерміновані</option>
            </select>
          </div>
          {filteredSubs.length===0?<div style={{color:"#8E8E93",padding:60,textAlign:"center", fontSize: 16, fontWeight: 600}}>За цими фільтрами немає абонементів</div>:
          <div style={{display:"flex",flexDirection:"column",gap:20}}>
            {subsGroupedByDir.grouped.filter(d => filterDir === "all" || d.direction.id === filterDir).map(({direction, subs: dSubs}) => {
              const finalSubs = filterGroup !== "all" ? dSubs.filter(s => s.groupId === filterGroup) : dSubs;
              if (finalSubs.length === 0) return null;
              const isExpanded = expandedSubDirs[direction.id];
              return (
                <div key={direction.id} style={{background: "#1C1C1E", borderRadius: 28, overflow: 'hidden'}}>
                  <button onClick={() => setExpandedSubDirs(p => ({...p, [direction.id]: !p[direction.id]}))} style={{width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'24px', background:'transparent', border:'none', cursor:'pointer', textAlign:'left'}}>
                    <div style={{fontSize:18,fontWeight:800,color:direction.color}}>{direction.name} <span style={{color:"#8E8E93",fontSize:15,fontWeight:600, marginLeft: 8}}>({finalSubs.length})</span></div>
                    <div style={{color:"#8E8E93", fontSize: 16}}>{isExpanded ? "▲" : "▼"}</div>
                  </button>
                  {isExpanded && (
                    <div style={{overflowX: "auto", padding: "0 24px 24px 24px"}}>
                      <table style={{width: "100%", borderCollapse: "collapse", fontSize: 14, textAlign: "left"}}>
                        <thead>
                          <tr style={{color: "#8E8E93", textTransform: "uppercase", fontSize: 12, letterSpacing: 0.5}}>
                            <th style={{padding: "16px 14px", fontWeight: 700}}>Учениця</th>
                            <th style={{padding: "16px 14px", fontWeight: 700}}>Група</th>
                            <th style={{padding: "16px 14px", fontWeight: 700}}>Абонемент</th>
                            <th style={{padding: "16px 14px", fontWeight: 700}}>Заняття</th>
                            <th style={{padding: "16px 14px", fontWeight: 700}}>Термін</th>
                            <th style={{padding: "16px 14px", fontWeight: 700}}>Статус</th>
                            <th style={{padding: "16px 14px", fontWeight: 700, textAlign: "right"}}>Дії</th>
                          </tr>
                        </thead>
                        <tbody>
                          {finalSubs.map(sub => {
                            const st=studentMap[sub.studentId], gr=groupMap[sub.groupId], planLabel=PLAN_TYPES.find(p=>p.id===sub.planType)?.name||sub.planType;
                            return <tr key={sub.id} style={{borderTop: "1px solid #2C2C2E"}}>
                              <td style={{padding: "16px 14px", color: "#fff", fontWeight: 600, whiteSpace:"nowrap"}}>{st?.name||"?"}</td>
                              <td style={{padding: "16px 14px", whiteSpace:"nowrap"}}><span style={{color: "#8E8E93", fontWeight: 500}}>{gr?.name}</span></td>
                              <td style={{padding: "16px 14px", whiteSpace:"nowrap"}}><span style={{color: "#c9d1d9", fontWeight: 500}}>{planLabel}</span></td>
                              <td style={{padding: "16px 14px", whiteSpace:"nowrap"}}><span style={{color: "#fff", fontWeight: 800, fontSize: 16}}>{sub.usedTrainings}</span><span style={{color: "#8E8E93", fontWeight: 500}}> / {sub.totalTrainings}</span></td>
                              <td style={{padding: "16px 14px", whiteSpace:"nowrap"}}><span style={{color: "#8E8E93", fontWeight: 500, fontFamily:"monospace"}}>{fmt(sub.startDate)} — {fmt(sub.endDate)}</span></td>
                              <td style={{padding: "16px 14px", whiteSpace:"nowrap"}}><Badge color={STATUS_COLORS[sub.status]}>{STATUS_LABELS[sub.status]}</Badge>{!sub.paid&&<span style={{marginLeft: 8}}><Badge color="#FF453A">Борг</Badge></span>}</td>
                              <td style={{padding: "16px 14px", textAlign: "right", whiteSpace:"nowrap"}}>
                                <button style={{background:"none",border:"none",cursor:"pointer",fontSize:18,marginRight:16}} onClick={()=>{setEditItem(sub);setModal("editSub")}}>✏️</button>
                                <button style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#FF453A"}} onClick={()=>deleteSub(sub.id)}>🗑</button>
                              </td>
                            </tr>
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>}
        </div>}

        {/* === ВІДВІДУВАННЯ (ТАБЛИЦЯ ТА ЧЕРНЕТКА) === */}
        {tab==="attendance" && <div>
          <AttendanceTab groups={groups} subs={subs} setSubs={setSubs} attn={attn} setAttn={setAttn} studentMap={studentMap} studentGrps={studentGrps} cancelled={cancelled} />
        </div>}

        {/* === СПОВІЩЕННЯ === */}
        {tab==="alerts" && <div>
          {notifications.length===0?<div style={{textAlign:"center",padding:60,color:"#8E8E93", fontSize: 16, fontWeight: 600}}>✨ Всі абонементи активні, боргів та сповіщень немає!</div>:
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            {notifications.map(n=>{
              const msg=getNotifMsg(null,n.student,n.group,n.direction);
              const tgUser=n.student?.telegram?.replace("@","");
              const tgLink=tgUser?`https://t.me/${tgUser}?text=${encodeURIComponent(msg)}`:null;
              return<div key={n.subId} style={{...cardSt, opacity:n.notified?.5:1, borderLeft: `4px solid ${STATUS_COLORS[n.status]}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
                  <div>
                    <div style={{display: "flex", gap: 12, alignItems: "center", marginBottom: 8}}>
                      <span style={{color:"#fff",fontWeight:800, fontSize: 18}}>{n.student?.name}</span> 
                      <Badge color={n.type==="expired"?"#FF453A":"#FF9F0A"}>{n.message}</Badge>
                      {n.notified&&<Badge color="#8E8E93">✅ Відправлено</Badge>}
                    </div>
                    <div style={{color:"#8E8E93",fontSize:15, fontWeight: 500}}>{n.group?.name}</div>
                  </div>
                  <div style={{display:"flex",gap:10}}>
                    {tgLink&&<a href={tgLink} target="_blank" rel="noopener noreferrer" onClick={()=>markNotified(n.subId)} style={{padding:"12px 20px",borderRadius:16,background:"#0A84FF22",color:"#0A84FF",fontSize:14,fontWeight: 700, textDecoration:"none"}}>💬 Написати</a>}
                    {!n.notified&&<button style={{...btnS,padding:"12px 20px",fontSize:14}} onClick={()=>markNotified(n.subId)}>Позначити виконаним</button>}
                  </div>
                </div>
              </div>})}
          </div>}
        </div>}

        {/* === ФІНАНСИ === */}
        {tab==="finance" && (() => {
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
            <div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:16,marginBottom:30}}>
                <div style={{...cardSt, background: "linear-gradient(135deg, #1C1C1E, #14281D)"}}><div style={{fontSize:13,color:"#30D158",textTransform:"uppercase", letterSpacing: 0.5, fontWeight: 700}}>Загалом оплачено</div><div style={{fontSize:42,fontWeight:800,color:"#30D158", marginTop: 8}}>{analytics.totalRev.toLocaleString()} ₴</div></div>
                <div style={{...cardSt, background: "linear-gradient(135deg, #1C1C1E, #2D1516)"}}><div style={{fontSize:13,color:"#FF453A",textTransform:"uppercase", letterSpacing: 0.5, fontWeight: 700}}>Борги учениць (очікується)</div><div style={{fontSize:42,fontWeight:800,color:"#FF453A", marginTop: 8}}>{analytics.unpaid.toLocaleString()} ₴</div></div>
              </div>
              <div style={{display:"flex",gap:12,marginBottom:24,flexWrap:"wrap", background: "#1C1C1E", padding: 16, borderRadius: 24}}>
                <div style={{flex: 1, display: "flex", gap: 12, minWidth: 300, flexWrap: "wrap"}}>
                  <select style={{...inputSt, width: "auto"}} value={finFilterDir} onChange={e=>{setFinFilterDir(e.target.value); setFinFilterGroup("all");}}><option value="all">Усі напрямки</option>{DIRECTIONS.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>
                  <GroupSelect groups={groups} value={finFilterGroup} onChange={setFinFilterGroup} filterDir={finFilterDir} allowAll={true} />
                </div>
                <div style={{display: "flex", gap: 12, flexWrap: "wrap"}}>
                  <select style={{...inputSt, width: "auto"}} value={finSortBy} onChange={e=>setFinSortBy(e.target.value)}><option value="total">За доходом</option><option value="trainer">За ЗП тренера</option><option value="studio">За доходом студії</option><option value="name">За назвою</option></select>
                  <button style={{...btnS, padding: "0 16px", fontSize: 18}} onClick={()=>setFinSortOrder(p=>p==="desc"?"asc":"desc")}>{finSortOrder === "desc" ? "⬇" : "⬆"}</button>
                </div>
              </div>
              <h3 style={{color:"#fff",fontSize:20,marginBottom:20, fontWeight: 800}}>Деталізація по групах ({finData.length})</h3>
              {finData.length === 0 ? <div style={{color:"#8E8E93",padding:60,textAlign:"center", fontSize: 16, fontWeight: 600}}>За цими фільтрами немає оплат</div> :
              <div style={{display:"flex",flexDirection:"column",gap:20}}>
                {finData.map(sp => {
                  const dir = dirMap[sp.group.directionId]; const trainerPct = sp.group.trainerPct; const studioPct = 100 - trainerPct;
                  return (
                    <div key={sp.group.id} style={{background: "#1C1C1E", borderRadius: 28, padding: "24px", display: "flex", flexDirection: "column", gap: 20}}>
                      <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12}}>
                        <div><div style={{display: "flex", alignItems: "center", gap: 10, marginBottom: 8}}><span style={{color:"#fff",fontWeight:800, fontSize: 18}}>{sp.group.name}</span><Badge color={dir?.color||"#888"}>{dir?.name}</Badge></div><div style={{fontSize: 14, color: "#8E8E93", fontWeight: 500}}>Оплачених абонементів: <strong style={{color: "#fff"}}>{sp.subs.length}</strong></div></div>
                        <div style={{textAlign: "right"}}><div style={{fontSize: 12, color: "#8E8E93", textTransform: "uppercase", fontWeight: 700}}>Загальний збір</div><div style={{fontSize: 28, fontWeight: 800, color: "#fff", marginTop: 4}}>{sp.total.toLocaleString()} ₴</div></div>
                      </div>
                      <div style={{height: 10, width: "100%", display: "flex", borderRadius: 100, overflow: "hidden"}}>
                        <div style={{width: `${trainerPct}%`, background: "#0A84FF"}} title="Тренер"></div>
                        <div style={{width: `${studioPct}%`, background: "#30D158"}} title="Студія"></div>
                      </div>
                      <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12}}>
                        <div style={{display: "flex", gap: 40}}>
                          <div><div style={{fontSize:12,color:"#8E8E93", fontWeight: 700}}>Тренер ({trainerPct}%)</div><div style={{fontSize:20,fontWeight:800,color:"#0A84FF", marginTop: 6}}>{sp.trainer.toLocaleString()} ₴</div></div>
                          <div><div style={{fontSize:12,color:"#8E8E93", fontWeight: 700}}>Студія ({studioPct}%)</div><div style={{fontSize:20,fontWeight:800,color:"#30D158", marginTop: 6}}>{sp.studio.toLocaleString()} ₴</div></div>
                        </div>
                        <button style={{...btnS, padding: "12px 20px", background: "#2C2C2E"}} onClick={() => setFinanceDetailItem(sp)}>🧾 Детальний звіт</button>
                      </div>
                    </div>
                  )
                })}
              </div>}
            </div>
          )
        })()}

      </main>

      {/* МОДАЛКИ */}
      <Modal open={!!financeDetailItem} onClose={()=>setFinanceDetailItem(null)} title={`Зарплата: ${financeDetailItem?.group?.name}`} wide>
        {financeDetailItem && (
          <div>
            <div style={{display: "flex", justifyContent: "space-between", background: "#2C2C2E", padding: "20px 24px", borderRadius: 20, marginBottom: 24}}>
              <div><div style={{fontSize: 12, color: "#8E8E93", textTransform: "uppercase", fontWeight: 700}}>Тренеру ({financeDetailItem.group.trainerPct}%)</div><div style={{fontSize: 26, fontWeight: 800, color: "#0A84FF", marginTop: 6}}>{financeDetailItem.trainer.toLocaleString()} ₴</div></div>
              <div style={{textAlign: "right"}}><div style={{fontSize: 12, color: "#8E8E93", textTransform: "uppercase", fontWeight: 700}}>Студії ({100 - financeDetailItem.group.trainerPct}%)</div><div style={{fontSize: 26, fontWeight: 800, color: "#30D158", marginTop: 6}}>{financeDetailItem.studio.toLocaleString()} ₴</div></div>
            </div>
            <table style={{width: "100%", borderCollapse: "collapse", fontSize: 15, textAlign: "left"}}>
              <thead><tr style={{color: "#8E8E93", borderBottom: "1px solid #3A3A3C"}}><th style={{padding: "16px 0", fontWeight: 700}}>Учениця</th><th style={{padding: "16px 0", fontWeight: 700}}>Тип</th><th style={{padding: "16px 0", fontWeight: 700, textAlign: "right"}}>Оплачено</th><th style={{padding: "16px 0", fontWeight: 700, textAlign: "right", color: "#0A84FF"}}>Частка тренера</th></tr></thead>
              <tbody>{financeDetailItem.subs.map(sub => (<tr key={sub.id} style={{borderBottom: "1px solid #2C2C2E"}}><td style={{padding: "16px 0", color: "#fff", fontWeight: 600}}>{studentMap[sub.studentId]?.name}</td><td style={{padding: "16px 0", color: "#8E8E93", fontWeight: 500}}>{PLAN_TYPES.find(p=>p.id===sub.planType)?.name}</td><td style={{padding: "16px 0", textAlign: "right", fontWeight: 600}}>{sub.amount} ₴</td><td style={{padding: "16px 0", textAlign: "right", color: "#0A84FF", fontWeight: 800}}>+ {Math.round((sub.amount || 0) * (financeDetailItem.group.trainerPct / 100))} ₴</td></tr>))}</tbody>
            </table>
          </div>
        )}
      </Modal>
      <Modal open={modal==="addStudent"} onClose={()=>setModal(null)} title="Нова учениця"><StudentForm onDone={addStudent}/></Modal>
      <Modal open={modal==="editStudent"} onClose={()=>{setModal(null);setEditItem(null)}} title="Редагувати профіль"><StudentForm initial={editItem} onDone={editStudent}/></Modal>
      <Modal open={modal==="addSub"} onClose={()=>setModal(null)} title="Оформити абонемент"><SubForm onDone={addSub}/></Modal>
      <Modal open={modal==="editSub"} onClose={()=>{setModal(null);setEditItem(null)}} title="Редагувати абонемент"><SubForm initial={editItem} onDone={editSub}/></Modal>
      <Modal open={modal==="addWaitlist"} onClose={()=>setModal(null)} title="Додати в резерв"><WaitlistForm onDone={addWaitlist}/></Modal>
    </div>
  );
}
