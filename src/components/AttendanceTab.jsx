import React, { useEffect, useMemo, useState } from "react";
import * as db from "../db";
import { supabase } from "../supabase";
import {
  theme,
  WEEKDAYS,
  MONTHS,
  PLAN_TYPES,
  inputSt,
  btnP,
  btnS,
  cardSt,
} from "../shared/constants";
import {
  daysLeft,
  fmt,
  getDisplayName,
  getNextTrainingDate,
  getPreviousTrainingDate,
  getSubStatus,
  toLocalISO,
  today,
  uid,
  useStickyState,
} from "../shared/utils";
import { Badge, GroupSelect, Pill } from "./UI";

const AttendanceTab = React.memo(function AttendanceTab({ groups, rawSubs, subs, setSubs, attn, setAttn, studentMap, students, setStudents, studentGrps, setStudentGrps, cancelled, setCancelled, customOrders, setCustomOrders, onActionAddSub, warnedStudents, setWarnedStudents }) {
  const [gid, setGid] = useStickyState("", "ds_attnGid");
  const [journalMonth, setJournalMonth] = useState(today().slice(0, 7));
  const [actionMenuSt, setActionMenuSt] = useState(null);
  
  const [manualName, setManualName] = useState("");
  const [manualDate, setManualDate] = useState(today());
  const [journalGuestMode, setJournalGuestMode] = useState("single");
  
  useEffect(() => { if (groups.length > 0 && !gid) setGid(groups[0].id); }, [groups, gid]);

  const stIdsInGroup = new Set([
    ...studentGrps.filter(sg => sg.groupId === gid).map(sg => sg.studentId),
    ...subs.filter(s => s.groupId === gid).map(s => s.studentId)
  ]);
  
  const guests = useMemo(() => {
     return [...new Set(attn.filter(a => {
         if (a.groupId !== gid || !a.guestName) return false;
         const gName = a.guestName.trim().toLowerCase();
         return !Object.values(studentMap).some(s => getDisplayName(s).toLowerCase() === gName || (s.name || "").toLowerCase() === gName);
     }).map(a => a.guestName.trim()))]
     .map(gName => ({ id: `guest_${gName}`, name: gName, isGuest: true }));
  }, [attn, gid, studentMap]);

  const combinedStuds = useMemo(() => {
     const dbStuds = Array.from(stIdsInGroup).map(id => studentMap[id]).filter(st => st && getDisplayName(st) !== "Невідомо");
     return [...dbStuds, ...guests];
  }, [stIdsInGroup, studentMap, guests]);

const studsInGroup = useMemo(() => {
  const orderArr = (customOrders[gid] || []).filter(id => typeof id === "string" && !id.startsWith("guest_"));
  const visibleStudentIds = combinedStuds
    .filter(s => !String(s.id).startsWith("guest_"))
    .map(s => s.id);

  const normalizedOrder = orderArr.filter(id => visibleStudentIds.includes(id));

  return [...combinedStuds].sort((a, b) => {
    const aIsGuest = String(a.id).startsWith("guest_");
    const bIsGuest = String(b.id).startsWith("guest_");

    if (aIsGuest && !bIsGuest) return 1;
    if (!aIsGuest && bIsGuest) return -1;

    const idxA = aIsGuest ? -1 : normalizedOrder.indexOf(a.id);
    const idxB = bIsGuest ? -1 : normalizedOrder.indexOf(b.id);

    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;

    return getDisplayName(a).localeCompare(getDisplayName(b), "uk");
  });
}, [combinedStuds, customOrders, gid]);

const updateOrder = async (newOrder) => {
  const persistedIds = newOrder.filter(id => typeof id === "string" && !id.startsWith("guest_"));
  const validIds = Array.from(stIdsInGroup).filter(id => typeof id === "string");

  const normalizedOrder = [
    ...new Set([...persistedIds, ...validIds])
  ].filter(id => validIds.includes(id));

  setCustomOrders(prev => ({ ...prev, [gid]: normalizedOrder }));

  const { data, error } = await supabase
    .from('custom_orders')
    .upsert(
      { group_id: gid, student_ids: normalizedOrder },
      { onConflict: 'group_id' }
    )
    .select();

  if (error) {
    console.error('Order save error:', error);
    return;
  }
};

const moveManual = (studentId, dir) => {
  const currentOrder = studsInGroup.map(s => s.id);
  const idx = currentOrder.indexOf(studentId);
  if (idx === -1) return;

  const newOrder = [...currentOrder];

  if (dir === -1 && idx > 0) {
    [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
    updateOrder(newOrder);
  } else if (dir === 1 && idx < newOrder.length - 1) {
    [newOrder[idx + 1], newOrder[idx]] = [newOrder[idx], newOrder[idx + 1]];
    updateOrder(newOrder);
  }
};

const moveStudentDnD = (draggedId, targetId) => {
  if (draggedId === targetId) return;

  const currentOrder = studsInGroup.map(s => s.id);
  const fromIdx = currentOrder.indexOf(draggedId);
  const toIdx = currentOrder.indexOf(targetId);

  if (fromIdx === -1 || toIdx === -1) return;

  const newOrder = [...currentOrder];
  const [movedItem] = newOrder.splice(fromIdx, 1);
  newOrder.splice(toIdx, 0, movedItem);

  updateOrder(newOrder);
};

const addManual = async () => {
  const name = manualName.trim();
  if (!name) return;

  const selectedEntryType =
    journalGuestMode === "trial"
      ? "trial"
      : journalGuestMode === "unpaid"
      ? "unpaid"
      : "single";

  try {
    let st = students.find(
      s =>
        getDisplayName(s).toLowerCase() === name.toLowerCase() ||
        (s.name || "").toLowerCase() === name.toLowerCase()
    );

    if (!st) {
      const nameParts = name.split(" ");
      const newStPayload = {
        name,
        first_name: nameParts.slice(1).join(" ") || "",
        last_name: nameParts[0] || "",
      };

      let createdSt = { id: uid(), ...newStPayload };

      if (db.insertStudent) {
        try {
          const res = await db.insertStudent(newStPayload);
          if (res) createdSt = res;
        } catch (e) {
          console.warn("insertStudent error:", e);
        }
      }

      setStudents(p => [...p, createdSt]);
      st = createdSt;
    }

    if (!studentGrps.some(sg => sg.studentId === st.id && sg.groupId === gid)) {
      let newSg = { id: uid(), studentId: st.id, groupId: gid };

      if (db.addStudentGroup) {
        try {
          const savedSg = await db.addStudentGroup(st.id, gid);
          if (savedSg) newSg = savedSg;
        } catch (e) {
          console.error("addStudentGroup error:", e);
        }
      }

      setStudentGrps(p => [...p, newSg]);
    }

   const displayName = st.name || getDisplayName(st);
const existingRec = getAttendanceRecordForStudentDate(st, manualDate);

    if (existingRec) {
      const updatedRec = {
        ...existingRec,
        subId: null,
        guestName: displayName,
        guestType: selectedEntryType,
        entryType: selectedEntryType,
        groupId: gid,
        date: manualDate,
        quantity: 1,
      };

      setAttn(prev => prev.map(a => (a.id === existingRec.id ? updatedRec : a)));

      const { error } = await supabase
        .from("attendance")
        .update({
          sub_id: null,
          guest_name: displayName,
          guest_type: selectedEntryType,
          entry_type: selectedEntryType,
          group_id: gid,
          date: manualDate,
          quantity: 1,
        })
        .eq("id", existingRec.id);

      if (error) {
        console.warn("update attendance error:", error);
      }
    } else {
      const attendancePayload = {
        id: uid(),
        guestName: displayName,
        guestType: selectedEntryType,
        groupId: gid,
        date: manualDate,
        quantity: 1,
        entryType: selectedEntryType,
      };

      setAttn(p => [...p, attendancePayload]);

      if (db.insertAttendance) {
        await db.insertAttendance(attendancePayload);
      }
    }
  } catch (e) {
    console.warn("DB Error", e);
  }

  setManualName("");
};

  const removeStudentFromJournal = async (st) => {
    if(!confirm(`Відкріпити ${getDisplayName(st)} від цієї групи? Її історія залишиться, але вона не відображатиметься в журналі.`)) return;
    
    if(!st.isGuest) {
       const toDelSg = studentGrps.find(sg => sg.studentId === st.id && sg.groupId === gid);
       if (toDelSg) {
         setStudentGrps(p => p.filter(sg => sg.id !== toDelSg.id));
         if (db.removeStudentGroup) await db.removeStudentGroup(toDelSg.studentId, toDelSg.groupId).catch(e => console.log(e));
       }
       const activeSub = subs.find(s => s.studentId === st.id && s.groupId === gid && getSubStatus(s) !== "expired");
       if (activeSub) {
          const newEnd = today();
          if(db.updateSub) db.updateSub(activeSub.id, { endDate: newEnd }).catch(e=>console.warn(e));
          setSubs(p => p.map(s => s.id === activeSub.id ? { ...s, endDate: newEnd } : s));
       }
    } else {
       const toDelAttn = attn.filter(a => a.groupId === gid && a.guestName === st.name);
       const toDelIds = toDelAttn.map(a => a.id);
       setAttn(p => p.filter(a => !toDelIds.includes(a.id)));
       if(db.deleteAttendance) toDelIds.forEach(id => db.deleteAttendance(id).catch(e=>console.log(e)));
    }
    setActionMenuSt(null);
  };

  const handlePrevMonth = () => {
    const [y, m] = journalMonth.split('-');
    let d = new Date(y, parseInt(m)-2, 1);
    setJournalMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  };

  const handleNextMonth = () => {
    const [y, m] = journalMonth.split('-');
    let d = new Date(y, parseInt(m), 1);
    setJournalMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  };

  const getStudentSubRanges = (studentId) => {
    if (!studentId || String(studentId).startsWith("guest_")) return [];
    const stSubs = subs.filter(s => s.studentId === studentId && s.groupId === gid).sort((a,b) => new Date(a.startDate) - new Date(b.startDate));
    const ranges = [];
    for (let i = 0; i < stSubs.length; i++) {
      const sub = stSubs[i];
      let effectiveEnd = sub.endDate || "2099-12-31";
      let isExhausted = false;

      const subAttns = attn.filter(a => a.subId === sub.id).map(a => a.date).sort();
      if (subAttns.length >= (sub.totalTrainings || 1)) {
        isExhausted = true;
        effectiveEnd = subAttns[(sub.totalTrainings || 1) - 1]; 
      } else if (today() > effectiveEnd) {
        isExhausted = true;
      }

      const nextSub = stSubs[i+1];
      if (nextSub && nextSub.startDate && nextSub.startDate <= effectiveEnd) {
         const d = new Date(nextSub.startDate + "T12:00:00");
         d.setDate(d.getDate() - 1);
         const newEnd = toLocalISO(d);
         if (newEnd < effectiveEnd) effectiveEnd = newEnd;
      }

      ranges.push({ start: sub.startDate || "2000-01-01", end: effectiveEnd, id: sub.id, isExhausted });
    }
    return ranges;
  };

  const generateDays = () => {
    if (!journalMonth) return [];
    const parts = journalMonth.split('-');
    if(parts.length !== 2) return [];
    const [y, m] = parts;
    const centerDate = new Date(y, parseInt(m)-1, 1);
    
    const prevMonthDate = new Date(centerDate); prevMonthDate.setMonth(centerDate.getMonth() - 1);
    const nextMonthDate = new Date(centerDate); nextMonthDate.setMonth(centerDate.getMonth() + 1);
    
    let allDays = [];
    [prevMonthDate, centerDate, nextMonthDate].forEach(dateObj => {
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const daysInMonth = new Date(year, dateObj.getMonth() + 1, 0).getDate();
      for(let i=1; i<=daysInMonth; i++) allDays.push(`${year}-${month}-${String(i).padStart(2, '0')}`);
    });

    const currentGroup = groups.find(g => g.id === gid);
    const scheduleDays = currentGroup?.schedule?.map(s => s.day) || [];
    const activeDaysIn3Months = new Set(attn.filter(a => a.groupId === gid).map(a => a.date));
    
    return allDays.filter(dStr => {
      if (scheduleDays.length === 0) return true;
      const dayOfWeek = new Date(dStr + "T12:00:00").getDay();
      return scheduleDays.includes(dayOfWeek) || activeDaysIn3Months.has(dStr);
    });
  };

  const visibleDays = useMemo(() => generateDays(), [journalMonth, gid, groups, attn]);

  const monthSpans = useMemo(() => {
    const spans = [];
    let currentMonth = null;
    let currentSpan = 0;
    visibleDays.forEach(d => {
      const monthNum = parseInt(d.split('-')[1]) - 1;
      if (currentMonth === monthNum) {
        currentSpan++;
      } else {
        if (currentMonth !== null) spans.push({ month: currentMonth, span: currentSpan });
        currentMonth = monthNum;
        currentSpan = 1;
      }
    });
    if (currentMonth !== null) spans.push({ month: currentMonth, span: currentSpan });
    return spans;
  }, [visibleDays]);

  const getAttendanceRecordForStudentDate = (student, date) => {
  const possibleNames = [
    getDisplayName(student),
    student?.name || "",
  ]
    .map(v => v.trim().toLowerCase())
    .filter(Boolean);

  return [...attn]
    .filter(a => a.groupId === gid && a.date === date)
    .reverse()
    .find(a => {
      if (a.subId) {
        const subStudentId = subs.find(s => s.id === a.subId)?.studentId;
        return subStudentId === student.id;
      }

      const guestName = (a.guestName || "").trim().toLowerCase();
      return possibleNames.includes(guestName);
    }) || null;
};

  const toggleJournalCell = async (student, cellDate, isCurrentlyAttended, dbRecord) => {
    try {
      if (isCurrentlyAttended && dbRecord) {
        setAttn(p => p.filter(a => a.id !== dbRecord.id));
        if(db.deleteAttendance) await db.deleteAttendance(dbRecord.id);
      } else {
        const newId = uid();
        const validSub = !student.isGuest ? subs.find(s => 
          s.studentId === student.id && 
          s.groupId === gid && 
          s.startDate <= cellDate && 
          s.endDate >= cellDate && 
          (s.usedTrainings || 0) < (s.totalTrainings || 1)
        ) : null;
        
        if (validSub) {
          const a = { id: newId, subId: validSub.id, date: cellDate, quantity: 1, entryType: "subscription", groupId: gid };
          setAttn(p => [...p, a]);
          if(db.insertAttendance) await db.insertAttendance(a);
        } else {
          const gType = "single";
          const a = { id: newId, guestName: student.name || getDisplayName(student), guestType: gType, groupId: gid, date: cellDate, quantity: 1, entryType: gType };
          setAttn(p => [...p, a]);
          if(db.insertAttendance) await db.insertAttendance(a);
        }
      }
    } catch (e) {
      console.warn("DB Error:", e);
    }
  };

const handleCancelSpecificDay = async (cancelDate) => {
  if (!confirm(`Точно скасувати тренування ${cancelDate}? Всі активні абонементи будуть подовжені на наступне заняття групи.`)) return;

  try {
    const currentGroup = groups.find(g => g.id === gid);
    const affectedSubs = rawSubs.filter(
      s => s.groupId === gid && s.startDate <= cancelDate && s.endDate >= cancelDate
    );

    const originalEnds = {};
    let newSubs = [...rawSubs];

    for (const sub of affectedSubs) {
      originalEnds[sub.id] = sub.endDate;
      const newEndStr = getNextTrainingDate(currentGroup?.schedule, sub.endDate);

      if (db.updateSub) {
        await db.updateSub(sub.id, { endDate: newEndStr });
      }

      newSubs = newSubs.map(s =>
        s.id === sub.id ? { ...s, endDate: newEndStr } : s
      );
    }

    const cancelPayload = {
      groupId: gid,
      date: cancelDate,
      originalEnds,
    };

    let savedCancel = { id: uid(), ...cancelPayload };

    if (db.insertCancelled) {
      try {
        const inserted = await db.insertCancelled(cancelPayload);
        if (inserted) savedCancel = inserted;
      } catch (e) {
        console.warn("insertCancelled error:", e);
      }
    }

    setSubs(newSubs);

    setCancelled(prev => {
      const withoutSameDate = prev.filter(
        c => !(c.groupId === gid && c.date === cancelDate)
      );
      return [...withoutSameDate, savedCancel];
    });
  } catch (e) {
    console.warn("Cancel Error:", e);
  }
};

  

const handleRestoreSpecificDay = async (restoreDate) => {
  if (!confirm(`Відновити скасоване тренування ${restoreDate}? Терміни абонементів будуть повернуті до початкових.`)) return;

  try {
    const matchingCancels = cancelled.filter(
      c => c.groupId === gid && c.date === restoreDate
    );

    if (matchingCancels.length === 0) return;

    const targetCancel = matchingCancels[matchingCancels.length - 1];
    const originalEnds = targetCancel.originalEnds || {};

    let newSubs = [...rawSubs];
    const currentGroup = groups.find(g => g.id === gid);

    if (Object.keys(originalEnds).length > 0) {
      for (const [subId, origEnd] of Object.entries(originalEnds)) {
        if (db.updateSub) {
          await db.updateSub(subId, { endDate: origEnd });
        }

        newSubs = newSubs.map(s =>
          s.id === subId ? { ...s, endDate: origEnd } : s
        );
      }
    } else {
      const affectedSubs = newSubs.filter(
        s => s.groupId === gid && s.endDate >= restoreDate
      );

      for (const sub of affectedSubs) {
        const revertedEnd = getPreviousTrainingDate(currentGroup?.schedule, sub.endDate);

        if (db.updateSub) {
          await db.updateSub(sub.id, { endDate: revertedEnd });
        }

        newSubs = newSubs.map(s =>
          s.id === sub.id ? { ...s, endDate: revertedEnd } : s
        );
      }
    }

    setSubs(newSubs);

    setCancelled(prev =>
      prev.filter(c => !(c.groupId === gid && c.date === restoreDate))
    );

    if (db.deleteCancelled) {
      for (const item of matchingCancels) {
        try {
          await db.deleteCancelled(item.id);
        } catch (e) {
          console.warn("deleteCancelled error:", e);
        }
      }
    }
  } catch (e) {
    console.warn("Restore Error:", e);
  }
};

const groupAnalytics = useMemo(() => {
     const monthAttn = attn.filter(a => a.groupId === gid && a.date && a.date.startsWith(journalMonth));
     const attnCounts = {};
     const dateCounts = {};
     
     monthAttn.forEach(a => {
        const stId = a.subId ? subs.find(s=>s.id===a.subId)?.studentId : a.guestName;
        if (stId) attnCounts[stId] = (attnCounts[stId] || 0) + 1;
        dateCounts[a.date] = (dateCounts[a.date] || 0) + 1;
     });
     
     // ФІКС: Кілька учениць з найкращою відвідуваністю
     const maxAttnCount = Object.values(attnCounts).length > 0 ? Math.max(...Object.values(attnCounts)) : 0;
     const bestAttenderIds = Object.keys(attnCounts).filter(id => attnCounts[id] === maxAttnCount && maxAttnCount > 0);
     const bestAttenderName = bestAttenderIds.length > 0 ? bestAttenderIds.map(id => studentMap[id] ? getDisplayName(studentMap[id]) : id).join(", ") : "Немає";
     const bestAttenderCount = maxAttnCount;

     const bestDate = Object.keys(dateCounts).sort((a,b) => dateCounts[b] - dateCounts[a])[0];
     const bestDateCount = bestDate ? dateCounts[bestDate] : 0;

     // ФІКС: Середня відвідуваність
     const activeDaysCount = Object.keys(dateCounts).length;
     const avgAttendance = activeDaysCount > 0 ? (monthAttn.length / activeDaysCount).toFixed(1) : 0;

     const spendCounts = {};
     subs.filter(s => s.groupId === gid && s.paid).forEach(s => {
        spendCounts[s.studentId] = (spendCounts[s.studentId] || 0) + (s.amount || 0);
     });
     const topSpenderId = Object.keys(spendCounts).sort((a,b) => spendCounts[b] - spendCounts[a])[0];
     const topSpenderName = topSpenderId ? getDisplayName(studentMap[topSpenderId]) : "Немає";
     const topSpenderAmount = topSpenderId ? spendCounts[topSpenderId] : 0;

     // ФІКС: Скільки абонементів закінчуються найближчі 7 днів
     const expiringSubs = subs.filter(s => s.groupId === gid && getSubStatus(s) === "active" && daysLeft(s.endDate) <= 7 && daysLeft(s.endDate) >= 0).length;

     const churn = [];
     const last30DaysStr = toLocalISO(new Date(new Date().getTime() - 30 * 86400000));
     const activeInGroup = subs.filter(s => s.groupId === gid && getSubStatus(s) !== "expired");
     
     activeInGroup.forEach(sub => {
        const st = studentMap[sub.studentId];
        if(!st) return;
        const stAttns = attn.filter(a => a.groupId === gid && a.subId === sub.id).map(a => a.date).sort();
        const lastDate = stAttns.length > 0 ? stAttns[stAttns.length - 1] : sub.startDate;
        if (lastDate && lastDate !== "2000-01-01") {
           const daysSinceLast = Math.floor((new Date() - new Date(lastDate + "T12:00:00")) / 86400000);
           if (daysSinceLast >= 10) churn.push({ student: st, sub, daysSinceLast });
        }
     });

     return { bestAttenderName, bestAttenderCount, bestDate, bestDateCount, topSpenderName, topSpenderAmount, churn, totalMonthAttn: monthAttn.length, avgAttendance, expiringSubs };
  }, [attn, subs, gid, journalMonth, studentMap]);

  return (
    <div style={{ maxWidth: "100%" }}>
      {actionMenuSt && (
        <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex: 1000, display:"flex", alignItems:"center", justifyContent:"center", padding: 20}} onClick={()=>setActionMenuSt(null)}>
          <div style={{background: theme.card, borderRadius: 24, padding: 24, width: "100%", maxWidth: 320}} onClick={e=>e.stopPropagation()}>
             <h3 style={{marginTop: 0, marginBottom: 16, color: theme.textMain}}>{getDisplayName(actionMenuSt)}</h3>
             <div style={{display: "flex", flexDirection: "column", gap: 12}}>
                {!actionMenuSt.isGuest && (
                   <button style={btnP} onClick={() => { onActionAddSub(actionMenuSt.id, gid); setActionMenuSt(null); }}>💳 Оформити абонемент</button>
                )}
                <button style={{...btnP, background: theme.warning}} onClick={() => removeStudentFromJournal(actionMenuSt)}>Відкріпити від групи (В Архів)</button>
                <button style={btnS} onClick={()=>setActionMenuSt(null)}>Скасувати</button>
             </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <GroupSelect groups={groups} value={gid} onChange={setGid}/>
        <div style={{display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
            <button style={{...btnS, padding: "14px 18px", borderRadius: 12}} onClick={handlePrevMonth}>{"<"}</button>
            <input style={{...inputSt, width: "auto", minWidth: 160, cursor: "pointer", textAlign: 'center'}} type="month" value={journalMonth} onChange={e=>setJournalMonth(e.target.value)} onClick={(e) => e.target.showPicker && e.target.showPicker()}/>
            <button style={{...btnS, padding: "14px 18px", borderRadius: 12}} onClick={handleNextMonth}>{">"}</button>
          </div>
        </div>
      </div>

      <div style={{ overflowX: "auto", background: theme.card, borderRadius: 24, padding: "20px 0", boxShadow: "0 10px 30px rgba(168, 177, 206, 0.15)", border: `1px solid ${theme.border}` }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, minWidth: "100%", fontSize: 13 }}>
          <thead>
            <tr>
              <th rowSpan={2} style={{ position: "sticky", left: 0, background: theme.card, padding: "10px 24px", textAlign: "left", zIndex: 3, borderRight: `2px solid ${theme.border}`, minWidth: 180, color: theme.textMuted }}>Учениця</th>
              {monthSpans.map((m, i) => (
                <th key={i} colSpan={m.span} style={{ textAlign: "center", padding: "8px", background: "#F2F5FF", color: theme.secondary, fontWeight: 800, borderRight: i < monthSpans.length - 1 ? "4px solid #fff" : "none", fontSize: 14 }}>
                  {MONTHS[m.month]}
                </th>
              ))}
            </tr>
            <tr>
              {visibleDays.map((d, index) => {
                const dayNum = new Date(d + "T12:00:00").getDay();
                const isNewMonth = index === 0 || d.split('-')[1] !== visibleDays[index - 1].split('-')[1];
                const isDayCancelled = cancelled.some(c => c.groupId === gid && c.date === d);
                
                return (
                <th key={d} style={{ padding: "8px 2px", background: isDayCancelled ? "rgba(255, 69, 58, 0.15)" : theme.card, color: theme.textMain, fontWeight: 600, minWidth: 44, textAlign: "center", borderLeft: isNewMonth && index !== 0 ? `4px solid ${theme.border}` : "none", borderBottom: `4px solid ${theme.border}`, verticalAlign: "top", height: 70 }}>
                  <div style={{display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%"}}>
                    <div>
                      <div style={{fontSize: 10, textTransform: "uppercase", color: theme.textMuted, marginBottom: 2}}>{WEEKDAYS[dayNum]}</div>
                      <div style={{fontSize: 15, fontWeight: 800}}>{d.slice(-2)}</div>
                    </div>
                    <div style={{marginTop: "auto"}}>
                      {isDayCancelled ? (
                        <div onClick={() => handleRestoreSpecificDay(d)} style={{color: theme.danger, fontSize: 9, cursor: 'pointer', fontWeight: 700, padding: "4px 2px", background: `rgba(255,0,0,0.1)`, borderRadius: 6}}>↩ Віднов.</div>
                      ) : (
                        <div onClick={() => handleCancelSpecificDay(d)} style={{color: theme.danger, fontSize: 10, cursor: 'pointer', opacity: 0.5}}>✕ Скас.</div>
                      )}
                    </div>
                  </div>
                </th>
              )})}
            </tr>
          </thead>
          <tbody>
            {studsInGroup.map((st, i) => {
              const subRanges = getStudentSubRanges(st.id);
              return (
              <tr key={st.id} 
                  draggable 
                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", st.id); e.dataTransfer.effectAllowed = "move"; }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                  onDrop={(e) => { e.preventDefault(); const draggedId = e.dataTransfer.getData("text/plain"); if (draggedId) moveStudentDnD(draggedId, st.id); }}
              >
                <td style={{ position: "sticky", left: 0, background: theme.card, padding: "10px 8px 10px 16px", fontWeight: 600, color: theme.textMain, borderRight: `2px solid ${theme.border}`, borderBottom: `1px solid ${theme.border}`, zIndex: 1 }}>
                  <div style={{display: "flex", alignItems: "center", justifyContent: "space-between"}}>
                    <div style={{display: "flex", alignItems: "center", overflow: "hidden"}}>
                      <div style={{display: "flex", flexDirection: "column", gap: 0, marginRight: 8, background: theme.input, borderRadius: 6, overflow: "hidden"}}>
                        <button onClick={() => moveManual(st.id, -1)} style={{background: "none", border: "none", color: theme.textMuted, fontSize: 10, padding: "4px 8px", cursor: "pointer"}}>▲</button>
                        <button onClick={() => moveManual(st.id, 1)} style={{background: "none", border: "none", color: theme.textMuted, fontSize: 10, padding: "4px 8px", cursor: "pointer"}}>▼</button>
                      </div>
                      <span style={{color: theme.textLight, marginRight: 8, fontSize: 12}}>{i+1}.</span>
                      <span style={{whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{getDisplayName(st)}</span>
                    </div>
                    <button onClick={() => setActionMenuSt(st)} style={{background: "none", border: "none", color: theme.textLight, fontSize: 18, padding: "0 8px", cursor: "pointer", marginLeft: 4}}>⋮</button>
                  </div>
                </td>
                {visibleDays.map((d, index) => {
                  const isNewMonth = index === 0 || d.split('-')[1] !== visibleDays[index - 1].split('-')[1];
                  const rec = attn.find(a => a.groupId === gid && a.date === d && (a.subId ? subs.find(s=>s.id===a.subId)?.studentId === st.id : (a.guestName||"").trim().toLowerCase() === (st.name||"").trim().toLowerCase()));
                  const isAttended = !!rec;
                  const isDayCancelled = cancelled.some(c => c.groupId === gid && c.date === d);
                  
                  const activeRange = subRanges.find(r => d >= r.start && d <= r.end);
                  
                  let markBg = theme.input;
                  if (isAttended) {
                    if (rec.entryType === 'trial') markBg = theme.success;
                    else if (rec.entryType === 'single') markBg = theme.warning;
                    else if (rec.entryType === 'unpaid') markBg = theme.danger;
                    else {
                      const usedRange = subRanges.find(r => r.id === rec.subId);
                      markBg = (usedRange && usedRange.isExhausted) ? theme.exhausted : theme.primary;
                    }
                  }

                  let frameStyle = {};
                  if (activeRange) {
                    const frameColor = activeRange.isExhausted ? theme.exhausted : theme.primary;
                    const frameBg = activeRange.isExhausted ? `${theme.exhausted}10` : "transparent";
                    
                    const prevD = visibleDays[index - 1]; 
                    const nextD = visibleDays[index + 1];
                    const isPrevIn = prevD && subRanges.some(r => r.id === activeRange.id && prevD >= r.start && prevD <= r.end);
                    const isNextIn = nextD && subRanges.some(r => r.id === activeRange.id && nextD >= r.start && nextD <= r.end);
                    
                    frameStyle = {
                      background: frameBg,
                      borderTop: `2px solid ${frameColor}80`, 
                      borderBottom: `2px solid ${frameColor}80`,
                      borderLeft: !isPrevIn ? `2px solid ${frameColor}80` : "none", 
                      borderRight: !isNextIn ? `2px solid ${frameColor}80` : "none",
                      borderTopLeftRadius: !isPrevIn ? 8 : 0, 
                      borderBottomLeftRadius: !isPrevIn ? 8 : 0,
                      borderTopRightRadius: !isNextIn ? 8 : 0, 
                      borderBottomRightRadius: !isNextIn ? 8 : 0,
                    };
                  }

                  return (
                    <td key={d} style={{ padding: "4px 0", height: 48, borderLeft: isNewMonth && index !== 0 ? `4px solid ${theme.border}` : "none", borderBottom: `1px solid ${theme.border}`, background: isDayCancelled ? "rgba(255, 69, 58, 0.15)" : 'transparent' }}>
                      <div style={{ height: 32, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', ...frameStyle }}>
                        {!isDayCancelled && (
                          <div onClick={() => toggleJournalCell(st, d, isAttended, rec)} style={{ width: 26, height: 26, borderRadius: 8, background: markBg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, transition: "0.1s" }}>
                            {isAttended ? "✓" : ""}
                          </div>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            )})}
            
            <tr>
              <td style={{ position: "sticky", left: 0, background: theme.card, padding: "10px 16px", fontWeight: 700, color: theme.secondary, borderRight: `2px solid ${theme.border}`, borderBottom: `none`, zIndex: 1, whiteSpace: "nowrap" }}>Всього присутніх:</td>
              {visibleDays.map((d, index) => {
                const isNewMonth = index === 0 || d.split('-')[1] !== visibleDays[index - 1].split('-')[1];
                const count = attn.filter(a => a.groupId === gid && a.date === d).length;
                return (
                  <td key={d} style={{ padding: "8px 2px", fontWeight: 800, color: count > 0 ? theme.primary : theme.textLight, textAlign: "center", borderLeft: isNewMonth && index !== 0 ? `4px solid ${theme.border}` : "none", borderBottom: `none`, background: theme.bg }}>
                    {count > 0 ? count : "-"}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ background: theme.card, borderRadius: 24, padding: "20px", marginTop: 24, boxShadow: "0 10px 30px rgba(168, 177, 206, 0.15)", border: `1px solid ${theme.border}` }}>
        <div className="bottom-form" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontWeight: 700, color: theme.textMain, marginRight: 8, fontSize: 14 }}>+ Додати в журнал</div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <input type="date" style={{...inputSt, padding: "12px 16px"}} value={manualDate} onChange={e=>setManualDate(e.target.value)} onClick={(e) => e.target.showPicker && e.target.showPicker()} />
          </div>
          <div style={{ flex: 2, minWidth: 200 }}>
            <input style={{...inputSt, padding: "12px 16px"}} value={manualName} onChange={e=>setManualName(e.target.value)} placeholder="Прізвище Ім'я учениці" onKeyDown={e=>e.key==="Enter"&&addManual()}/>
          </div>
          <div style={{ display: "flex", gap: 6, background: theme.input, padding: 6, borderRadius: 100, overflowX: "auto" }}>
            <Pill active={journalGuestMode==="trial"} onClick={()=>setJournalGuestMode("trial")} color={theme.success}>Пробне</Pill>
            <Pill active={journalGuestMode==="single"} onClick={()=>setJournalGuestMode("single")} color={theme.warning}>Разове</Pill>
            <Pill active={journalGuestMode==="unpaid"} onClick={()=>setJournalGuestMode("unpaid")} color={theme.danger}>Борг</Pill>
          </div>
          <button style={{...btnP, borderRadius: 100, background: theme.primary, padding: "12px 24px"}} onClick={addManual}>Відмітити</button>
        </div>
      </div>

      <div className="split-container" style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap', marginTop: 24 }}>
        
        <div className="split-left" style={{ flex: "1 1 350px", maxWidth: "450px", background: theme.card, borderRadius: 24, border: `1px solid ${theme.border}`, overflow: "hidden", boxShadow: "0 10px 30px rgba(168, 177, 206, 0.15)" }}>
          <div style={{ padding: "16px 24px", background: theme.bg, fontWeight: 800, color: theme.secondary, borderBottom: `1px solid ${theme.border}` }}>Стан абонементів</div>
          {studsInGroup.map((st, i) => {
             const activeRanges = getStudentSubRanges(st.id).filter(r => r.id && !r.isExhausted && r.end >= today());
             const activeSub = activeRanges.length > 0 ? subs.find(s => s.id === activeRanges[activeRanges.length-1].id) : null;
             
             let badgeColor = theme.textLight;
             let badgeText = "Без абонемента";
             let detailText = "";
             
             if (activeSub) {
                const planName = PLAN_TYPES.find(p => p.id === activeSub.planType)?.name || "Абонемент";
                badgeColor = theme.success;
                badgeText = planName;
                detailText = `${activeSub.usedTrainings || 0} / ${activeSub.totalTrainings || 0} (до ${fmt(activeSub.endDate)})`;
             } else if (st.isGuest) {
                badgeColor = theme.warning;
                badgeText = "Гість";
             } else {
                const recentAttn = attn.filter(a => a.groupId === gid && (a.guestName === st.name || a.subId === st.id)).sort((a,b)=>a.date.localeCompare(b.date)).reverse()[0];
                if (recentAttn && recentAttn.entryType) {
                   badgeText = recentAttn.entryType === 'trial' ? "Пробне" : "Разове";
                   badgeColor = recentAttn.entryType === 'trial' ? theme.success : theme.warning;
                }
             }

             return (
                <div key={st.id} style={{ padding: "16px 20px", borderBottom: i < studsInGroup.length - 1 ? `1px solid ${theme.bg}` : "none", display: "flex", justifyContent: "space-between", alignItems: "center", background: st.isGuest ? "#FFF9F0" : "transparent", flexWrap: "wrap", gap: 12 }}>
                   <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <span style={{ color: theme.textLight, fontSize: 13, fontWeight: 700, minWidth: 20 }}>{i + 1}.</span>
                      <div style={{ fontWeight: 700, color: theme.textMain, fontSize: 14 }}>{getDisplayName(st)}</div>
                   </div>
                   <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                      <Badge color={badgeColor}>{badgeText}</Badge>
                      {detailText && <span style={{ fontSize: 11, color: theme.textMuted, fontWeight: 500 }}>{detailText}</span>}
                   </div>
                </div>
             );
          })}
        </div>

        <div className="split-right" style={{ flex: "2 1 500px" }}>
           <h3 style={{marginTop: 0, marginBottom: 16, fontSize: 20, fontWeight: 800, color: theme.secondary}}>📊 Аналітика групи (За обраний місяць)</h3>
           <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
               <div style={{...cardSt, padding: 20}}>
                 <div style={{fontSize: 12, color: theme.textMuted, fontWeight: 700, textTransform: "uppercase"}}>Найкраща відвідуваність</div>
                 <div style={{fontSize: 15, fontWeight: 800, color: theme.textMain, marginTop: 8}}>{groupAnalytics.bestAttenderName}</div>
                 <div style={{fontSize: 13, color: theme.primary, fontWeight: 600, marginTop: 4}}>{groupAnalytics.bestAttenderCount} занять</div>
               </div>
               <div style={{...cardSt, padding: 20}}>
                 <div style={{fontSize: 12, color: theme.textMuted, fontWeight: 700, textTransform: "uppercase"}}>Топ покупець</div>
                 <div style={{fontSize: 15, fontWeight: 800, color: theme.textMain, marginTop: 8}}>{groupAnalytics.topSpenderName}</div>
                 <div style={{fontSize: 13, color: theme.success, fontWeight: 600, marginTop: 4}}>{groupAnalytics.topSpenderAmount} ₴</div>
               </div>
               <div style={{...cardSt, padding: 20}}>
                 <div style={{fontSize: 12, color: theme.textMuted, fontWeight: 700, textTransform: "uppercase"}}>Піковий день</div>
                 <div style={{fontSize: 15, fontWeight: 800, color: theme.textMain, marginTop: 8}}>{groupAnalytics.bestDate ? fmt(groupAnalytics.bestDate) : "—"}</div>
                 <div style={{fontSize: 13, color: theme.warning, fontWeight: 600, marginTop: 4}}>{groupAnalytics.bestDateCount} присутніх</div>
               </div>
               <div style={{...cardSt, padding: 20}}>
                 <div style={{fontSize: 12, color: theme.textMuted, fontWeight: 700, textTransform: "uppercase"}}>Всього відвідувань</div>
                 <div style={{fontSize: 24, fontWeight: 800, color: theme.primary, marginTop: 4}}>{groupAnalytics.totalMonthAttn}</div>
               </div>
               {/* НОВІ ПАНЕЛІ */}
               <div style={{...cardSt, padding: 20}}>
                 <div style={{fontSize: 12, color: theme.textMuted, fontWeight: 700, textTransform: "uppercase"}}>Середня присутність</div>
                 <div style={{fontSize: 24, fontWeight: 800, color: theme.success, marginTop: 4}}>{groupAnalytics.avgAttendance} <span style={{fontSize:13, fontWeight:600}}>люд./трен.</span></div>
               </div>
               <div style={{...cardSt, padding: 20, border: groupAnalytics.expiringSubs > 0 ? `2px solid ${theme.warning}` : "none"}}>
                 <div style={{fontSize: 12, color: theme.textMuted, fontWeight: 700, textTransform: "uppercase"}}>Закінчуються (&lt;7 дн.)</div>
                 <div style={{fontSize: 24, fontWeight: 800, color: groupAnalytics.expiringSubs > 0 ? theme.warning : theme.textMain, marginTop: 4}}>{groupAnalytics.expiringSubs} <span style={{fontSize:13, fontWeight:600}}>абонементів</span></div>
               </div>
           </div>

           {groupAnalytics.churn.length > 0 && (
             <div style={{marginTop: 24, background: theme.card, borderRadius: 24, padding: 24, border: `2px solid ${theme.danger}40`}}>
                <h4 style={{margin: "0 0 16px 0", color: theme.danger, fontSize: 16}}>🚨 Давно не були, але мають абонемент</h4>
                <div style={{display: "flex", flexDirection: "column", gap: 12}}>
                  {groupAnalytics.churn.map((item, i) => {
                    const tgUser = item.student.telegram?.replace("@","");
                    const tgLink = tgUser ? `https://t.me/${tgUser}` : null;
                    return (
                      <div key={i} style={{display: "flex", justifyContent: "space-between", alignItems: "center", background: theme.bg, padding: 12, borderRadius: 12, opacity: warnedStudents[item.sub.id] ? 0.6 : 1}}>
                        <div>
                          <div style={{fontWeight: 700, color: theme.textMain, fontSize: 14}}>{getDisplayName(item.student)}</div>
                          <div style={{fontSize: 12, color: theme.danger, marginTop: 4, fontWeight: 600}}>Не була {item.daysSinceLast} днів</div>
                        </div>
                        <div style={{display: "flex", gap: 8}}>
                          {tgLink && <a href={tgLink} target="_blank" rel="noopener noreferrer" style={{padding: "8px 12px", background: "#fff", color: theme.primary, borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: "none"}}>Написати</a>}
                          <button onClick={() => setWarnedStudents(p => ({...p, [item.sub.id]: !p[item.sub.id]}))} style={{padding: "8px 12px", background: warnedStudents[item.sub.id] ? theme.success : theme.input, color: warnedStudents[item.sub.id] ? "#fff" : theme.textMuted, border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer"}}>
                            {warnedStudents[item.sub.id] ? "✅ Сповіщено" : "Сповістити"}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
             </div>
           )}
        </div>
      </div>
    </div>
  );
});

// ==========================================
// 6. ПРО АНАЛІТИКА

export default AttendanceTab;
