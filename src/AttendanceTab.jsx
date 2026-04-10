// src/AttendanceTab.jsx
import { useState, useEffect } from "react";
import * as db from "./db";
import { today, fmt, getSubStatus } from "./utils";
import { inputSt, btnP, btnS, Pill, GroupSelect } from "./ui";

export default function AttendanceTab({ groups, subs, setSubs, attn, setAttn, studentMap, studentGrps, cancelled }) {
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
        <div style={{ overflowX: "auto", background: "#161b22", borderRadius: 12, border: "1px solid #21262d", padding: 10 }}>
          <table style={{ borderCollapse: "collapse", minWidth: "100%", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, background: "#1a1a2e", padding: "10px 16px", textAlign: "left", zIndex: 2, borderRight: "1px solid #30363d", minWidth: 150 }}>Учениця</th>
                {generateDays().map(d => (
                  <th key={d} style={{ padding: "8px 4px", color: "#8892b0", fontWeight: 500, minWidth: 36, textAlign: "center", borderBottom: "1px solid #30363d" }}>
                    {d.slice(-2)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {studsInGroup.map(st => (
                <tr key={st.id} style={{ borderBottom: "1px solid #21262d" }}>
                  <td style={{ position: "sticky", left: 0, background: "#161b22", padding: "10px 16px", fontWeight: 500, color: "#fff", borderRight: "1px solid #30363d", zIndex: 1 }}>
                    {st.name}
                  </td>
                  {generateDays().map(d => {
                    const rec = attn.find(a => a.groupId === gid && a.date === d && (a.subId ? subs.find(s=>s.id===a.subId)?.studentId === st.id : a.guestName === st.name));
                    const isAttended = !!rec;
                    const relevantSub = subs.find(s => s.studentId === st.id && s.groupId === gid && s.startDate <= d && s.endDate >= d);
                    
                    return (
                      <td key={d} style={{ textAlign: "center", padding: "4px" }} onClick={() => toggleJournalCell(st, d, isAttended, rec, relevantSub)}>
                        <div style={{ width: 24, height: 24, margin: "0 auto", borderRadius: 6, background: isAttended ? "#2ECC71" : "#0d1117", border: `1px solid ${isAttended ? "#2ECC71" : "#30363d"}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14 }}>
                          {isAttended ? "✓" : ""}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{fontSize: 11, color: "#8892b0", marginTop: 14}}>* Клікніть на клітинку, щоб додати або видалити відвідування минулою датою (зберігається миттєво).</div>
        </div>
      ) : (
        <>
          {isCan && <div style={{ background: "#E8485515", border: "1px solid #E8485533", borderRadius: 10, padding: "12px 16px", marginBottom: 20, color: "#E84855", fontWeight: 500 }}>❌ Тренування відмінено</div>}

          {studsWithSub.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: "#8892b0", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, paddingLeft: 4 }}>
                З абонементом ({studsWithSub.length})
              </div>
              <div style={{ background: "#161b22", borderRadius: 12, border: "1px solid #21262d", overflow: "hidden" }}>
                {studsWithSub.map(({sub, student}, i) => {
                  const key = `sub_${sub.id}`;
                  const isMarked = !!draft[key];
                  return (
                  <div key={sub.id} onClick={() => toggleDraft(key)} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "16px 20px", borderBottom: i < studsWithSub.length - 1 ? "1px solid #21262d" : "none",
                    cursor: isCan ? "default" : "pointer", transition: "background 0.2s",
                    background: isMarked ? "rgba(249,160,63,0.1)" : "transparent", opacity: isCan ? 0.5 : 1
                  }}>
                    <div>
                      <div style={{ color: "#fff", fontSize: 16, fontWeight: 500 }}>{student.name}</div>
                      <div style={{ color: "#8892b0", fontSize: 13, marginTop: 4 }}>
                        <span style={{ color: isMarked ? "#F9A03F" : "#c9d1d9", fontWeight: 600 }}>{sub.usedTrainings}</span> / {sub.totalTrainings} · до {fmt(sub.endDate)}
                      </div>
                    </div>
                    <div style={{ width: 26, height: 26, borderRadius: 6, border: `2px solid ${isMarked ? "#F9A03F" : "#30363d"}`, background: isMarked ? "#F9A03F" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 16, fontWeight: "bold" }}>
                      {isMarked && "✓"}
                    </div>
                  </div>
                )})}
              </div>
            </div>
          )}

          {studsWithoutSub.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, color: "#8892b0", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, paddingLeft: 4 }}>
                Без активного абонемента ({studsWithoutSub.length})
              </div>
              <div style={{ background: "#161b22", borderRadius: 12, border: "1px solid #21262d", overflow: "hidden" }}>
                {studsWithoutSub.map(({student, sub}, i) => {
                  const key = `guest_${student.name}`;
                  const isMarked = !!draft[key];
                  return (
                  <div key={student.id} onClick={() => toggleDraft(key)} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "16px 20px", borderBottom: i < studsWithoutSub.length - 1 ? "1px solid #21262d" : "none",
                    cursor: isCan ? "default" : "pointer", transition: "background 0.2s",
                    background: isMarked ? "rgba(249,160,63,0.1)" : "transparent", opacity: isCan ? 0.5 : 1
                  }}>
                    <div>
                      <div style={{ color: "#fff", fontSize: 16, fontWeight: 500 }}>{student.name}</div>
                      <div style={{ color: isMarked ? "#F9A03F" : "#E84855", fontSize: 13, marginTop: 4 }}>
                        {isMarked ? "Буде відмічено як разове" : (sub ? "Абонемент закінчився" : "Немає абонемента")}
                      </div>
                    </div>
                    <div style={{ width: 26, height: 26, borderRadius: 6, border: `2px solid ${isMarked ? "#F9A03F" : "#30363d"}`, background: isMarked ? "#F9A03F" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 16, fontWeight: "bold" }}>
                      {isMarked && "✓"}
                    </div>
                  </div>
                )})}
              </div>
            </div>
          )}

          {isDirty && (
            <div style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", zIndex: 100, background: "#1a1a2e", padding: "10px 16px", borderRadius: 16, boxShadow: "0 10px 30px rgba(0,0,0,0.8)", border: "1px solid #2ECC71" }}>
              <button onClick={saveBatch} disabled={isSaving} style={{ ...btnP, background: "#2ECC71", padding: "12px 30px", fontSize: 16 }}>
                {isSaving ? "Зберігаємо..." : "💾 Зберегти відмітки"}
              </button>
            </div>
          )}

          <div style={{ background: "linear-gradient(180deg, #161b22, #0d1117)", borderRadius: 12, padding: "20px", border: "1px dashed #30363d" }}>
            <div style={{ fontSize: 13, color: "#8892b0", marginBottom: 12, fontWeight: 500 }}>+ Додати нову людину вручну</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "stretch" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <input style={{...inputSt, height: "100%"}} value={manualName} onChange={e=>setManualName(e.target.value)} placeholder="Ім'я учениці" onKeyDown={e=>e.key==="Enter"&&addManual()}/>
              </div>
              <div style={{ display: "flex", gap: 6, background: "#0d1117", padding: 4, borderRadius: 8, border: "1px solid #30363d" }}>
                <Pill active={manualType==="trial"} onClick={()=>setManualType("trial")} color="#2ECC71">Пробне</Pill>
                <Pill active={manualType==="single"} onClick={()=>setManualType("single")} color="#F9A03F">Разове</Pill>
              </div>
              <button style={{...btnP, padding: "0 24px"}} onClick={addManual}>Додати</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
