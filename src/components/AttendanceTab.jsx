import React, { useEffect, useMemo, useState } from "react";
import * as db from "../db";
import { supabase } from "../supabase";
import {
  theme, WEEKDAYS, MONTHS, PLAN_TYPES, DIRECTIONS,
  inputSt, btnP, btnS, cardSt,
} from "../shared/constants";
import {
  toLocalISO, today, fmt, daysLeft, uid,
  getDisplayName, getSubStatus, isSubExhausted, getEffectiveEndDate,
  getNextTrainingDate, getPreviousTrainingDate, useStickyState
} from "../shared/utils";
import { Badge, GroupSelect, Pill } from "./UI";

// Нормалізація імен для порівняння
const normalizeName = (s) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");

const attnMatchesStudent = (a, student, subsList) => {
  if (a.subId) {
    const linked = subsList.find(s => s.id === a.subId);
    return linked && linked.studentId === student.id;
  }
  const aName = normalizeName(a.guestName);
  if (!aName) return false;
  const dName = normalizeName(getDisplayName(student));
  const sName = normalizeName(student.name);
  return aName === dName || aName === sName;
};

export default function AttendanceTab({
  groups, rawSubs, subs, setSubs, attn, setAttn,
  studentMap, students, setStudents, studentGrps, setStudentGrps,
  cancelled, setCancelled, customOrders, setCustomOrders,
  warnedStudents, setWarnedStudents, onActionAddSub
}) {
  const [gid, setGid] = useStickyState("", "ds_attnGid");
  const [journalMonth, setJournalMonth] = useState(today().slice(0, 7));
  const [actionMenuSt, setActionMenuSt] = useState(null);
  const [manualName, setManualName] = useState("");
  const [manualDate, setManualDate] = useState(today());
  const [journalGuestMode, setJournalGuestMode] = useState("subscription");

  // Валідація gid
  useEffect(() => {
    if (groups.length === 0) return;
    if (!groups.find(g => g.id === gid)) setGid(groups[0].id);
  }, [groups, gid]);

  const currentGroup = useMemo(() => groups.find(g => g.id === gid), [groups, gid]);
  const currentDirection = useMemo(
    () => DIRECTIONS.find(d => d.id === currentGroup?.directionId),
    [currentGroup]
  );

  // Учениці в групі
  const stIdsInGroup = useMemo(() => new Set([
    ...studentGrps.filter(sg => sg.groupId === gid).map(sg => sg.studentId),
    ...subs.filter(s => s.groupId === gid).map(s => s.studentId)
  ]), [studentGrps, subs, gid]);

  // Гості
  const guests = useMemo(() => {
    const known = new Set();
    Object.values(studentMap).forEach(s => {
      if (!s) return;
      known.add(normalizeName(getDisplayName(s)));
      known.add(normalizeName(s.name));
    });
    const guestNames = new Set();
    attn.forEach(a => {
      if (a.groupId !== gid || !a.guestName || a.subId) return;
      const n = normalizeName(a.guestName);
      if (!n || known.has(n)) return;
      guestNames.add(a.guestName.trim());
    });
    return [...guestNames].map(n => ({ id: `guest_${n}`, name: n, isGuest: true }));
  }, [attn, gid, studentMap]);

  const combinedStuds = useMemo(() => {
    const dbStuds = Array.from(stIdsInGroup)
      .map(id => studentMap[id])
      .filter(st => st && getDisplayName(st) !== "Невідомо");
    return [...dbStuds, ...guests];
  }, [stIdsInGroup, studentMap, guests]);

  const studsInGroup = useMemo(() => {
    const orderArr = (customOrders[gid] || []).filter(id => typeof id === "string" && !id.startsWith("guest_"));
    const visibleIds = combinedStuds.filter(s => !String(s.id).startsWith("guest_")).map(s => s.id);
    const normalized = orderArr.filter(id => visibleIds.includes(id));

    return [...combinedStuds].sort((a, b) => {
      const aG = String(a.id).startsWith("guest_");
      const bG = String(b.id).startsWith("guest_");
      if (aG && !bG) return 1;
      if (!aG && bG) return -1;
      const iA = aG ? -1 : normalized.indexOf(a.id);
      const iB = bG ? -1 : normalized.indexOf(b.id);
      if (iA !== -1 && iB !== -1) return iA - iB;
      if (iA !== -1) return -1;
      if (iB !== -1) return 1;
      return getDisplayName(a).localeCompare(getDisplayName(b), "uk");
    });
  }, [combinedStuds, customOrders, gid]);

  // Drag & Drop
  const updateOrder = async (newOrder) => {
    const persisted = newOrder.filter(id => typeof id === "string" && !id.startsWith("guest_"));
    const validIds = Array.from(stIdsInGroup).filter(id => typeof id === "string");
    const normalized = [...new Set([...persisted, ...validIds])].filter(id => validIds.includes(id));
    setCustomOrders(prev => ({ ...prev, [gid]: normalized }));
    try {
      await supabase.from('custom_orders').upsert(
        { group_id: gid, student_ids: normalized },
        { onConflict: 'group_id' }
      );
    } catch (e) { console.error('Order save:', e); }
  };

  const moveManual = (stId, dir) => {
    const curr = studsInGroup.map(s => s.id);
    const idx = curr.indexOf(stId);
    if (idx === -1) return;
    const neu = [...curr];
    if (dir === -1 && idx > 0) {
      [neu[idx - 1], neu[idx]] = [neu[idx], neu[idx - 1]];
      updateOrder(neu);
    } else if (dir === 1 && idx < neu.length - 1) {
      [neu[idx + 1], neu[idx]] = [neu[idx], neu[idx + 1]];
      updateOrder(neu);
    }
  };

  const moveStudentDnD = (fromId, toId) => {
    if (fromId === toId) return;
    const curr = studsInGroup.map(s => s.id);
    const from = curr.indexOf(fromId);
    const to = curr.indexOf(toId);
    if (from === -1 || to === -1) return;
    const neu = [...curr];
    const [mv] = neu.splice(from, 1);
    neu.splice(to, 0, mv);
    updateOrder(neu);
  };

  // ═════════════════════════════════════════════════════════════════
  // 🆕 ПЕРЕВІРКА ПРОБНОГО НА НАПРЯМОК (а не на групу)
  // ═════════════════════════════════════════════════════════════════
  const hasTrialInDirection = (student, directionId) => {
    if (!student || !directionId) return false;
    // Всі групи цього напрямку
    const dirGroupIds = groups.filter(g => g.directionId === directionId).map(g => g.id);
    // Шукаємо будь-який trial-запис в будь-якій з цих груп
    return attn.some(a => {
      if (!dirGroupIds.includes(a.groupId)) return false;
      if (a.entryType !== "trial") return false;
      return attnMatchesStudent(a, student, subs);
    });
  };

  // ═════════════════════════════════════════════════════════════════
  // ДОДАВАННЯ ВРУЧНУ ЧЕРЕЗ ФОРМУ
  // ═════════════════════════════════════════════════════════════════
  const addManual = async () => {
    const name = manualName.trim();
    if (!name) return;
    try {
      const nNorm = normalizeName(name);
      let st = students.find(s =>
        normalizeName(getDisplayName(s)) === nNorm ||
        normalizeName(s.name) === nNorm
      );

      if (!st) {
        const parts = name.split(' ');
        const payload = {
          name,
          first_name: parts.slice(1).join(' ') || '',
          last_name: parts[0] || ''
        };
        let created = { id: uid(), ...payload };
        try {
          if (db.insertStudent) {
            const res = await db.insertStudent(payload);
            if (res) created = res;
          }
        } catch (e) { console.warn(e); }
        setStudents(p => [...p, created]);
        st = created;
      }

      if (!studentGrps.some(sg => sg.studentId === st.id && sg.groupId === gid)) {
        let newSg = { id: uid(), studentId: st.id, groupId: gid };
        try {
          if (db.addStudentGroup) {
            const saved = await db.addStudentGroup(st.id, gid);
            if (saved) newSg = saved;
          }
        } catch (e) { console.error('addStudentGroup:', e); }
        setStudentGrps(p => [...p, newSg]);
      }

      let subId = null;
      let entryType = journalGuestMode;

      // Пробне — перевіряємо на весь напрямок
      if (journalGuestMode === "trial" && currentDirection) {
        if (hasTrialInDirection(st, currentDirection.id)) {
          alert(
            `"${getDisplayName(st)}" вже використовувала пробне тренування з напрямку "${currentDirection.name}".\n\n` +
            `Пробне дається тільки 1 раз на напрямок. Обери "Разове" або "Абонемент".`
          );
          return;
        }
      }

      if (journalGuestMode === "subscription") {
        const stSubs = subs.filter(s =>
          s.studentId === st.id &&
          s.groupId === gid &&
          !isSubExhausted(s)
        );
        const onDate = stSubs.find(s => s.startDate <= manualDate && getEffectiveEndDate(s) >= manualDate);
        const fallback = [...stSubs].sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""))[0];
        const validSub = onDate || fallback;

        if (validSub) {
          subId = validSub.id;
        } else {
          const wantSingle = confirm(
            `У "${getDisplayName(st)}" немає активного абонементу на ${manualDate}.\n\nПозначити як "Разове"?`
          );
          if (!wantSingle) { setManualName(""); return; }
          entryType = "single";
        }
      }

      const a = {
        id: `temp_${uid()}`,
        subId,
        guestName: st.name || getDisplayName(st),
        guestType: entryType,
        groupId: gid,
        date: manualDate,
        quantity: 1,
        entryType
      };
      setAttn(p => [...p, a]);

      if (db.insertAttendance) {
        try {
          const real = await db.insertAttendance(a);
          if (real?.id) {
            setAttn(prev => prev.map(i => i.id === a.id ? { ...i, id: real.id } : i));
          }
          if (subId && db.syncSubUsedTrainings) {
            const freshSub = await db.syncSubUsedTrainings(subId);
            // Перезавантажуємо абонемент з БД, бо end_date міг змінитись
            if (freshSub !== null) {
              const { data: updated } = await supabase.from('subscriptions').select('*').eq('id', subId).single();
              if (updated) {
                setSubs(p => p.map(s => s.id === subId ? {
                  ...s,
                  startDate: updated.start_date,
                  endDate: updated.end_date,
                  activationDate: updated.activation_date,
                  usedTrainings: updated.used_trainings,
                } : s));
              }
            }
          }
        } catch (err) {
          console.error("Insert:", err);
          alert(`Не вдалось зберегти: ${err?.message || "помилка БД"}`);
          setAttn(prev => prev.filter(i => i.id !== a.id));
        }
      }
    } catch (e) { console.warn("addManual:", e); }
    setManualName("");
  };

  const removeStudentFromJournal = async (st) => {
    if (!confirm(`Відкріпити ${getDisplayName(st)} від цієї групи? Історія залишиться.`)) return;
    if (!st.isGuest) {
      const toDelSg = studentGrps.find(sg => sg.studentId === st.id && sg.groupId === gid);
      if (toDelSg) {
        setStudentGrps(p => p.filter(sg => sg.id !== toDelSg.id));
        if (db.removeStudentGroup) await db.removeStudentGroup(toDelSg.studentId, toDelSg.groupId).catch(() => {});
      }
      const activeSub = subs.find(s => s.studentId === st.id && s.groupId === gid && !isSubExhausted(s));
      if (activeSub) {
        const newEnd = today();
        if (db.updateSub) db.updateSub(activeSub.id, { endDate: newEnd }).catch(() => {});
        setSubs(p => p.map(s => s.id === activeSub.id ? { ...s, endDate: newEnd } : s));
      }
    } else {
      const nNorm = normalizeName(st.name);
      const toDel = attn.filter(a => a.groupId === gid && !a.subId && normalizeName(a.guestName) === nNorm);
      const ids = toDel.map(a => a.id);
      setAttn(p => p.filter(a => !ids.includes(a.id)));
      if (db.deleteAttendance) {
        for (const id of ids) {
          if (!String(id).startsWith("temp_")) await db.deleteAttendance(id).catch(() => {});
        }
      }
    }
    setActionMenuSt(null);
  };

  const handlePrevMonth = () => {
    const [y, m] = journalMonth.split('-');
    const d = new Date(y, parseInt(m) - 2, 1);
    setJournalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const handleNextMonth = () => {
    const [y, m] = journalMonth.split('-');
    const d = new Date(y, parseInt(m), 1);
    setJournalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  // ═════════════════════════════════════════════════════════════════
  // 🆕 ДІАПАЗОНИ АБОНЕМЕНТІВ — для підсвітки. Використовує isSubExhausted
  // ═════════════════════════════════════════════════════════════════
  const getStudentSubRanges = (studentId) => {
    if (!studentId || String(studentId).startsWith("guest_")) return [];
    const stSubs = subs
      .filter(s => s.studentId === studentId && s.groupId === gid)
      .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));

    return stSubs.map(sub => {
      const effEnd = getEffectiveEndDate(sub) || "2099-12-31";
      // Абонемент "вичерпаний" якщо: усі тренування використані АБО термін вийшов
      const exhausted = isSubExhausted(sub);
      return {
        start: sub.startDate || "2000-01-01",
        end: effEnd,
        id: sub.id,
        isExhausted: exhausted
      };
    });
  };

  const generateDays = () => {
    if (!journalMonth) return [];
    const parts = journalMonth.split('-');
    if (parts.length !== 2) return [];
    const [y, m] = parts;
    const center = new Date(y, parseInt(m) - 1, 1);
    const prev = new Date(center); prev.setMonth(center.getMonth() - 1);
    const next = new Date(center); next.setMonth(center.getMonth() + 1);

    const all = [];
    [prev, center, next].forEach(dt => {
      const year = dt.getFullYear();
      const mo = String(dt.getMonth() + 1).padStart(2, '0');
      const days = new Date(year, dt.getMonth() + 1, 0).getDate();
      for (let i = 1; i <= days; i++) all.push(`${year}-${mo}-${String(i).padStart(2, '0')}`);
    });

    const scheduleDays = currentGroup?.schedule?.map(s => s.day) || [];
    const activeDays = new Set(attn.filter(a => a.groupId === gid).map(a => a.date));

    return all.filter(d => {
      if (scheduleDays.length === 0) return true;
      const dow = new Date(d + "T12:00:00").getDay();
      return scheduleDays.includes(dow) || activeDays.has(d);
    });
  };

  const visibleDays = useMemo(() => generateDays(), [journalMonth, gid, currentGroup, attn]);

  const monthSpans = useMemo(() => {
    const spans = [];
    let cur = null, cnt = 0;
    visibleDays.forEach(d => {
      const m = parseInt(d.split('-')[1]) - 1;
      if (cur === m) cnt++;
      else {
        if (cur !== null) spans.push({ month: cur, span: cnt });
        cur = m; cnt = 1;
      }
    });
    if (cur !== null) spans.push({ month: cur, span: cnt });
    return spans;
  }, [visibleDays]);

  // Пошук записів
  const findAllRecords = (st, d) => attn.filter(a =>
    a.groupId === gid && a.date === d && attnMatchesStudent(a, st, subs)
  );
  const findRecord = (st, d) => {
    const arr = findAllRecords(st, d);
    return arr.length > 0 ? arr[0] : undefined;
  };

  // Перезавантаження конкретного абонемента з БД після зміни end_date/activation_date
  const reloadSubFromDb = async (subId) => {
    try {
      const { data: updated } = await supabase.from('subscriptions').select('*').eq('id', subId).single();
      if (updated) {
        setSubs(p => p.map(s => s.id === subId ? {
          ...s,
          startDate: updated.start_date,
          endDate: updated.end_date,
          activationDate: updated.activation_date,
          usedTrainings: updated.used_trainings,
        } : s));
      }
    } catch (e) { console.warn('reloadSubFromDb:', e); }
  };

  // ═════════════════════════════════════════════════════════════════
  // 🟢 ГАЛОЧКА — КЛЮЧОВА ФУНКЦІЯ
  // ═════════════════════════════════════════════════════════════════
  const toggleJournalCell = async (student, cellDate, isCurrentlyAttended) => {
    try {
      // ═══ ЗНЯТТЯ ГАЛОЧКИ ═══
      if (isCurrentlyAttended) {
        const all = findAllRecords(student, cellDate);
        if (all.length === 0) return;
        const affectedSubs = new Set(all.filter(m => m.subId).map(m => m.subId));

        setAttn(p => p.filter(a => !all.some(m => m.id === a.id)));

        for (const m of all) {
          if (m.id && !String(m.id).startsWith("temp_") && db.deleteAttendance) {
            try { await db.deleteAttendance(m.id); }
            catch (e) { console.error("Delete failed:", e); }
          }
        }

        for (const subId of affectedSubs) {
          if (db.syncSubUsedTrainings) {
            await db.syncSubUsedTrainings(subId);
            await reloadSubFromDb(subId);
          }
        }
        return;
      }

      // ═══ ДОДАВАННЯ ГАЛОЧКИ ═══
      if (findAllRecords(student, cellDate).length > 0) {
        alert(`"${getDisplayName(student)}" вже відмічена на ${cellDate}.`);
        return;
      }

      let finalSubId = null;
      let finalEntryType = journalGuestMode;

      // 🛡 Пробне — на весь напрямок
      if (journalGuestMode === "trial" && currentDirection) {
        if (hasTrialInDirection(student, currentDirection.id)) {
          alert(
            `"${getDisplayName(student)}" вже використовувала пробне тренування з напрямку "${currentDirection.name}".\n\n` +
            `Пробне — тільки 1 раз на напрямок.`
          );
          return;
        }
      }

      // 🛡 Абонемент — тільки для учениць, не для гостей
      if (journalGuestMode === "subscription") {
        if (student.isGuest) {
          alert(
            `"${getDisplayName(student)}" не має профілю учениці.\n\n` +
            `Натисни "⋮" → "Оформити абонемент" — тоді можна буде використати режим "Абонемент".`
          );
          return;
        }

        const stSubs = subs.filter(s =>
          s.studentId === student.id &&
          s.groupId === gid &&
          !isSubExhausted(s)
        );
        const onDate = stSubs.find(s =>
          s.startDate <= cellDate && (getEffectiveEndDate(s) || "2099-12-31") >= cellDate
        );
        const fallback = [...stSubs].sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""))[0];
        const validSub = onDate || fallback;

        if (!validSub) {
          const wantSingle = confirm(
            `У "${getDisplayName(student)}" немає активного абонементу з залишком на ${cellDate}.\n\n` +
            `Позначити як "Разове" (300 грн)?`
          );
          if (!wantSingle) return;
          finalEntryType = "single";
        } else {
          finalSubId = validSub.id;
        }
      }

      const newId = `temp_${uid()}`;
      const a = {
        id: newId,
        subId: finalSubId,
        guestName: student.name || getDisplayName(student),
        guestType: finalEntryType,
        groupId: gid,
        date: cellDate,
        quantity: 1,
        entryType: finalEntryType
      };
      setAttn(p => [...p, a]);

      if (db.insertAttendance) {
        try {
          const real = await db.insertAttendance(a);
          if (real?.id) {
            setAttn(prev => prev.map(i => i.id === newId ? { ...i, id: real.id } : i));
          }
          if (finalSubId && db.syncSubUsedTrainings) {
            await db.syncSubUsedTrainings(finalSubId);
            await reloadSubFromDb(finalSubId);
          }
        } catch (err) {
          const msg = err?.message || String(err);
          if (msg.includes("duplicate") || msg.includes("unique")) {
            alert("Запис вже є в базі. Перезавантаж сторінку.");
          } else {
            alert(`Не вдалось зберегти: ${msg}`);
          }
          setAttn(prev => prev.filter(i => i.id !== newId));
        }
      }
    } catch (e) { console.warn("toggle:", e); }
  };

  // Скасування/відновлення
  const handleCancelSpecificDay = async (cancelDate) => {
    if (!confirm(`Скасувати тренування ${cancelDate}? Усі активні абонементи групи подовжаться на 1 день.`)) return;
    try {
      const affected = rawSubs.filter(s => s.groupId === gid && s.startDate <= cancelDate && s.endDate >= cancelDate);
      const originalEnds = {};
      let newSubs = [...rawSubs];

      for (const sub of affected) {
        originalEnds[sub.id] = sub.endDate;
        const newEnd = getNextTrainingDate(currentGroup?.schedule, sub.endDate);
        if (db.updateSub) db.updateSub(sub.id, { endDate: newEnd }).catch(() => {});
        newSubs = newSubs.map(s => s.id === sub.id ? { ...s, endDate: newEnd } : s);
      }

      const nc = { id: uid(), groupId: gid, date: cancelDate, originalEnds };
      setCancelled(p => [...p, nc]);
      setSubs(newSubs);
      if (db.insertCancelled) db.insertCancelled(nc).catch(() => {});
    } catch (e) { console.warn(e); }
  };

  const handleRestoreSpecificDay = async (restoreDate) => {
    if (!confirm(`Відновити тренування ${restoreDate}? Терміни повернуться як були до скасування.`)) return;
    try {
      const target = cancelled.find(c => c.groupId === gid && c.date === restoreDate);
      if (!target) return;
      let newSubs = [...rawSubs];

      if (target.originalEnds && Object.keys(target.originalEnds).length > 0) {
        for (const [subId, origEnd] of Object.entries(target.originalEnds)) {
          if (db.updateSub) db.updateSub(subId, { endDate: origEnd }).catch(() => {});
          newSubs = newSubs.map(s => s.id === subId ? { ...s, endDate: origEnd } : s);
        }
      } else {
        const affected = newSubs.filter(s => s.groupId === gid && s.endDate >= restoreDate);
        for (const sub of affected) {
          const reverted = getPreviousTrainingDate(currentGroup?.schedule, sub.endDate);
          if (db.updateSub) db.updateSub(sub.id, { endDate: reverted }).catch(() => {});
          newSubs = newSubs.map(s => s.id === sub.id ? { ...s, endDate: reverted } : s);
        }
      }

      setSubs(newSubs);
      setCancelled(p => p.filter(c => c.id !== target.id));
      if (db.deleteCancelled) db.deleteCancelled(target.id).catch(() => {});
    } catch (e) { console.warn("Restore:", e); }
  };

  // АНАЛІТИКА
  const groupAnalytics = useMemo(() => {
    const monthAttn = attn.filter(a => a.groupId === gid && a.date?.startsWith(journalMonth));
    const byStudent = {};
    const byDate = {};

    monthAttn.forEach(a => {
      let stId = null;
      if (a.subId) stId = subs.find(s => s.id === a.subId)?.studentId;
      if (!stId && a.guestName) {
        const n = normalizeName(a.guestName);
        const m = Object.values(studentMap).find(s =>
          s && (normalizeName(getDisplayName(s)) === n || normalizeName(s.name) === n)
        );
        stId = m?.id || a.guestName;
      }
      if (stId) byStudent[stId] = (byStudent[stId] || 0) + (a.quantity || 1);
      byDate[a.date] = (byDate[a.date] || 0) + (a.quantity || 1);
    });

    const maxC = Object.values(byStudent).length > 0 ? Math.max(...Object.values(byStudent)) : 0;
    const bestIds = Object.keys(byStudent).filter(id => byStudent[id] === maxC && maxC > 0);
    const bestName = bestIds.length > 0
      ? bestIds.map(id => studentMap[id] ? getDisplayName(studentMap[id]) : id).join(", ")
      : "Немає";

    const bestDate = Object.keys(byDate).sort((a, b) => byDate[b] - byDate[a])[0];
    const activeDays = Object.keys(byDate).length;
    const avg = activeDays > 0 ? (monthAttn.length / activeDays).toFixed(1) : 0;

    const spends = {};
    subs.filter(s => s.groupId === gid && s.paid).forEach(s => {
      spends[s.studentId] = (spends[s.studentId] || 0) + (s.amount || 0);
    });
    const topId = Object.keys(spends).sort((a, b) => spends[b] - spends[a])[0];
    const topName = topId ? getDisplayName(studentMap[topId]) : "Немає";
    const topAmt = topId ? spends[topId] : 0;

    const expiring = subs.filter(s => {
      if (s.groupId !== gid) return false;
      if (isSubExhausted(s)) return false;
      const dl = daysLeft(getEffectiveEndDate(s));
      return dl >= 0 && dl <= 7;
    }).length;

    const churn = [];
    const last30 = toLocalISO(new Date(Date.now() - 30 * 86400000));
    subs.filter(s => s.groupId === gid && !isSubExhausted(s)).forEach(sub => {
      const st = studentMap[sub.studentId];
      if (!st) return;
      const dates = attn.filter(a => a.groupId === gid && a.subId === sub.id).map(a => a.date).sort();
      const lastD = dates.length > 0 ? dates[dates.length - 1] : sub.startDate;
      if (lastD && lastD !== "2000-01-01") {
        const d = Math.floor((new Date() - new Date(lastD + "T12:00:00")) / 86400000);
        if (d >= 10) churn.push({ student: st, sub, daysSinceLast: d });
      }
    });

    return {
      bestAttenderName: bestName, bestAttenderCount: maxC,
      bestDate, bestDateCount: bestDate ? byDate[bestDate] : 0,
      topSpenderName: topName, topSpenderAmount: topAmt,
      churn, totalMonthAttn: monthAttn.length, avgAttendance: avg, expiringSubs: expiring
    };
  }, [attn, subs, gid, journalMonth, studentMap]);

  // ═════════════════════════════════════════════════════════════════
  // РЕНДЕР
  // ═════════════════════════════════════════════════════════════════
  return (
    <div style={{ maxWidth: "100%" }}>
      {actionMenuSt && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setActionMenuSt(null)}>
          <div style={{ background: theme.card, borderRadius: 24, padding: 24, width: "100%", maxWidth: 320 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, marginBottom: 16, color: theme.textMain }}>{getDisplayName(actionMenuSt)}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {!actionMenuSt.isGuest && (
                <button style={btnP} onClick={() => { onActionAddSub(actionMenuSt.id, gid); setActionMenuSt(null); }}>💳 Оформити абонемент</button>
              )}
              <button style={{ ...btnP, background: theme.warning }} onClick={() => removeStudentFromJournal(actionMenuSt)}>Відкріпити від групи</button>
              <button style={btnS} onClick={() => setActionMenuSt(null)}>Скасувати</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <GroupSelect groups={groups} value={gid} onChange={setGid} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button style={{ ...btnS, padding: "14px 18px", borderRadius: 12 }} onClick={handlePrevMonth}>{"<"}</button>
            <input style={{ ...inputSt, width: "auto", minWidth: 160, cursor: "pointer", textAlign: 'center' }} type="month" value={journalMonth} onChange={e => setJournalMonth(e.target.value)} onClick={e => e.target.showPicker && e.target.showPicker()} />
            <button style={{ ...btnS, padding: "14px 18px", borderRadius: 12 }} onClick={handleNextMonth}>{">"}</button>
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
              {visibleDays.map((d, idx) => {
                const dow = new Date(d + "T12:00:00").getDay();
                const isNewM = idx === 0 || d.split('-')[1] !== visibleDays[idx - 1].split('-')[1];
                const isCanc = cancelled.some(c => c.groupId === gid && c.date === d);
                return (
                  <th key={d} style={{ padding: "8px 2px", background: isCanc ? "rgba(255, 69, 58, 0.15)" : theme.card, color: theme.textMain, fontWeight: 600, minWidth: 44, textAlign: "center", borderLeft: isNewM && idx !== 0 ? `4px solid ${theme.border}` : "none", borderBottom: `4px solid ${theme.border}`, verticalAlign: "top", height: 70 }}>
                    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}>
                      <div>
                        <div style={{ fontSize: 10, textTransform: "uppercase", color: theme.textMuted, marginBottom: 2 }}>{WEEKDAYS[dow]}</div>
                        <div style={{ fontSize: 15, fontWeight: 800 }}>{d.slice(-2)}</div>
                      </div>
                      <div style={{ marginTop: "auto" }}>
                        {isCanc ? (
                          <div onClick={() => handleRestoreSpecificDay(d)} style={{ color: theme.danger, fontSize: 9, cursor: 'pointer', fontWeight: 700, padding: "4px 2px", background: `rgba(255,0,0,0.1)`, borderRadius: 6 }}>↩ Віднов.</div>
                        ) : (
                          <div onClick={() => handleCancelSpecificDay(d)} style={{ color: theme.danger, fontSize: 10, cursor: 'pointer', opacity: 0.5 }}>✕ Скас.</div>
                        )}
                      </div>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {studsInGroup.map((st, i) => {
              const ranges = getStudentSubRanges(st.id);
              return (
                <tr key={st.id}
                  draggable
                  onDragStart={e => { e.dataTransfer.setData("text/plain", st.id); e.dataTransfer.effectAllowed = "move"; }}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                  onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); if (id) moveStudentDnD(id, st.id); }}
                >
                  <td style={{ position: "sticky", left: 0, background: theme.card, padding: "10px 8px 10px 16px", fontWeight: 600, color: theme.textMain, borderRight: `2px solid ${theme.border}`, borderBottom: `1px solid ${theme.border}`, zIndex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", overflow: "hidden" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 0, marginRight: 8, background: theme.input, borderRadius: 6, overflow: "hidden" }}>
                          <button onClick={() => moveManual(st.id, -1)} style={{ background: "none", border: "none", color: theme.textMuted, fontSize: 10, padding: "4px 8px", cursor: "pointer" }}>▲</button>
                          <button onClick={() => moveManual(st.id, 1)} style={{ background: "none", border: "none", color: theme.textMuted, fontSize: 10, padding: "4px 8px", cursor: "pointer" }}>▼</button>
                        </div>
                        <span style={{ color: theme.textLight, marginRight: 8, fontSize: 12 }}>{i + 1}.</span>
                        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{getDisplayName(st)}</span>
                      </div>
                      <button onClick={() => setActionMenuSt(st)} style={{ background: "none", border: "none", color: theme.textLight, fontSize: 18, padding: "0 8px", cursor: "pointer", marginLeft: 4 }}>⋮</button>
                    </div>
                  </td>
                  {visibleDays.map((d, idx) => {
                    const isNewM = idx === 0 || d.split('-')[1] !== visibleDays[idx - 1].split('-')[1];
                    const rec = findRecord(st, d);
                    const att = !!rec;
                    const isCanc = cancelled.some(c => c.groupId === gid && c.date === d);
                    const range = ranges.find(r => d >= r.start && d <= r.end);

                    let markBg = theme.input;
                    if (att) {
                      if (rec.entryType === 'trial') markBg = theme.success;
                      else if (rec.entryType === 'single') markBg = theme.warning;
                      else if (rec.entryType === 'unpaid') markBg = theme.danger;
                      else {
                        // Для "subscription" — сірий якщо вичерпаний
                        const usedR = ranges.find(r => r.id === rec.subId);
                        markBg = (usedR && usedR.isExhausted) ? theme.exhausted : theme.primary;
                      }
                    }

                    let frame = {};
                    if (range) {
                      const fc = range.isExhausted ? theme.exhausted : theme.primary;
                      const fbg = range.isExhausted ? `${theme.exhausted}10` : "transparent";
                      const prevD = visibleDays[idx - 1];
                      const nextD = visibleDays[idx + 1];
                      const prevIn = prevD && ranges.some(r => r.id === range.id && prevD >= r.start && prevD <= r.end);
                      const nextIn = nextD && ranges.some(r => r.id === range.id && nextD >= r.start && nextD <= r.end);
                      frame = {
                        background: fbg,
                        borderTop: `2px solid ${fc}80`,
                        borderBottom: `2px solid ${fc}80`,
                        borderLeft: !prevIn ? `2px solid ${fc}80` : "none",
                        borderRight: !nextIn ? `2px solid ${fc}80` : "none",
                        borderTopLeftRadius: !prevIn ? 8 : 0,
                        borderBottomLeftRadius: !prevIn ? 8 : 0,
                        borderTopRightRadius: !nextIn ? 8 : 0,
                        borderBottomRightRadius: !nextIn ? 8 : 0,
                      };
                    }

                    return (
                      <td key={d} style={{ padding: "4px 0", height: 48, borderLeft: isNewM && idx !== 0 ? `4px solid ${theme.border}` : "none", borderBottom: `1px solid ${theme.border}`, background: isCanc ? "rgba(255, 69, 58, 0.15)" : 'transparent' }}>
                        <div style={{ height: 32, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', ...frame }}>
                          {!isCanc && (
                            <div onClick={() => toggleJournalCell(st, d, att)} style={{ width: 26, height: 26, borderRadius: 8, background: markBg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, transition: "0.1s" }}>
                              {att ? "✓" : ""}
                            </div>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}

            <tr>
              <td style={{ position: "sticky", left: 0, background: theme.card, padding: "10px 16px", fontWeight: 700, color: theme.secondary, borderRight: `2px solid ${theme.border}`, borderBottom: `none`, zIndex: 1, whiteSpace: "nowrap" }}>Всього присутніх:</td>
              {visibleDays.map((d, idx) => {
                const isNewM = idx === 0 || d.split('-')[1] !== visibleDays[idx - 1].split('-')[1];
                const cnt = studsInGroup.filter(st => !!findRecord(st, d)).length;
                return (
                  <td key={d} style={{ padding: "8px 2px", fontWeight: 800, color: cnt > 0 ? theme.primary : theme.textLight, textAlign: "center", borderLeft: isNewM && idx !== 0 ? `4px solid ${theme.border}` : "none", borderBottom: `none`, background: theme.bg }}>
                    {cnt > 0 ? cnt : "-"}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ background: theme.card, borderRadius: 24, padding: "20px", marginTop: 24, boxShadow: "0 10px 30px rgba(168, 177, 206, 0.15)", border: `1px solid ${theme.border}` }}>
        <div className="bottom-form" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontWeight: 700, color: theme.textMain, marginRight: 8, fontSize: 14 }}>+ Додати в журнал</div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <input type="date" style={{ ...inputSt, padding: "12px 16px" }} value={manualDate} onChange={e => setManualDate(e.target.value)} onClick={e => e.target.showPicker && e.target.showPicker()} />
          </div>
          <div style={{ flex: 2, minWidth: 200 }}>
            <input style={{ ...inputSt, padding: "12px 16px" }} value={manualName} onChange={e => setManualName(e.target.value)} placeholder="Прізвище Ім'я учениці" onKeyDown={e => e.key === "Enter" && addManual()} />
          </div>
          <div style={{ display: "flex", gap: 6, background: theme.input, padding: 6, borderRadius: 100, overflowX: "auto" }}>
            <Pill active={journalGuestMode === "subscription"} onClick={() => setJournalGuestMode("subscription")} color={theme.primary}>Абонемент</Pill>
            <Pill active={journalGuestMode === "trial"} onClick={() => setJournalGuestMode("trial")} color={theme.success}>Пробне</Pill>
            <Pill active={journalGuestMode === "single"} onClick={() => setJournalGuestMode("single")} color={theme.warning}>Разове</Pill>
            <Pill active={journalGuestMode === "unpaid"} onClick={() => setJournalGuestMode("unpaid")} color={theme.danger}>Борг</Pill>
          </div>
          <button style={{ ...btnP, borderRadius: 100, background: theme.primary, padding: "12px 24px" }} onClick={addManual}>Відмітити</button>
        </div>
      </div>

      <div className="split-container" style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap', marginTop: 24 }}>
        <div className="split-left" style={{ flex: "1 1 350px", maxWidth: "450px", background: theme.card, borderRadius: 24, border: `1px solid ${theme.border}`, overflow: "hidden", boxShadow: "0 10px 30px rgba(168, 177, 206, 0.15)" }}>
          <div style={{ padding: "16px 24px", background: theme.bg, fontWeight: 800, color: theme.secondary, borderBottom: `1px solid ${theme.border}` }}>Стан абонементів</div>
          {studsInGroup.map((st, i) => {
            const stSubs = subs
              .filter(s => s.studentId === st.id && s.groupId === gid)
              .sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
            const activeSub = stSubs.find(s => !isSubExhausted(s));
            const displaySub = activeSub || (stSubs.length > 0 ? stSubs[0] : null);

            let badgeColor = theme.textLight;
            let badgeText = "Без абонемента";
            let detailText = "";
            let isW = false, isE = false, rowBg = "transparent";

            if (displaySub) {
              const planName = PLAN_TYPES.find(p => p.id === displaySub.planType)?.name || "Абонемент";
              const trUsed = displaySub.usedTrainings || 0;
              const trTotal = displaySub.totalTrainings || 1;
              const effEnd = getEffectiveEndDate(displaySub);

              isE = isSubExhausted(displaySub);
              isW = !isE && (trTotal - trUsed <= 1 || daysLeft(effEnd) <= 3);

              if (isE) { badgeColor = theme.danger; badgeText = planName; rowBg = `${theme.danger}10`; }
              else if (isW) { badgeColor = theme.warning; badgeText = planName; rowBg = `${theme.warning}10`; }
              else { badgeColor = theme.success; badgeText = planName; }

              if (displaySub.activationDate) {
                detailText = `${trUsed}/${trTotal} · до ${fmt(effEnd)}`;
              } else {
                detailText = `${trUsed}/${trTotal} · ще не активований`;
              }
            } else if (st.isGuest) {
              badgeColor = theme.warning; badgeText = "Гість"; rowBg = "#FFF9F0";
            } else {
              const stAttns = attn.filter(a => a.groupId === gid && attnMatchesStudent(a, st, subs))
                .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
              const last = stAttns[stAttns.length - 1];
              if (last?.entryType) {
                badgeText = last.entryType === 'trial' ? "Пробне" : last.entryType === 'single' ? "Разове" : "Без абонемента";
                badgeColor = last.entryType === 'trial' ? theme.success : last.entryType === 'single' ? theme.warning : theme.textLight;
              }
            }

            const tg = st.telegram?.replace("@", "");
            const tgLink = tg ? `https://t.me/${tg}` : null;

            return (
              <div key={st.id} style={{ padding: "16px 20px", borderBottom: i < studsInGroup.length - 1 ? `1px solid ${theme.bg}` : "none", display: "flex", justifyContent: "space-between", alignItems: "center", background: rowBg, flexWrap: "wrap", gap: 12, opacity: (isE || isW) && warnedStudents[displaySub?.id] ? 0.6 : 1 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flex: 1, minWidth: 200 }}>
                  <span style={{ color: theme.textLight, fontSize: 13, fontWeight: 700, minWidth: 20 }}>{i + 1}.</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: theme.textMain, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{getDisplayName(st)}</div>
                    {(isE || isW) && displaySub && (
                      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                        {tgLink && <a href={tgLink} target="_blank" rel="noopener noreferrer" style={{ padding: "6px 10px", background: theme.card, color: theme.primary, borderRadius: 8, fontSize: 11, fontWeight: 700, textDecoration: "none", border: `1px solid ${theme.border}` }}>💬 Написати</a>}
                        <button onClick={() => setWarnedStudents(p => ({ ...p, [displaySub.id]: !p[displaySub.id] }))} style={{ padding: "6px 10px", background: warnedStudents[displaySub.id] ? theme.success : theme.input, color: warnedStudents[displaySub.id] ? "#fff" : theme.textMuted, border: "none", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                          {warnedStudents[displaySub.id] ? "✅ Сповіщено" : "Сповістити"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <Badge color={badgeColor}>{badgeText}</Badge>
                  {detailText && <span style={{ fontSize: 11, color: isE ? theme.danger : isW ? theme.warning : theme.textMuted, fontWeight: 600 }}>{detailText}</span>}
                </div>
              </div>
            );
          })}
        </div>

        <div className="split-right" style={{ flex: "2 1 500px", minWidth: 300 }}>
          <h3 style={{ marginTop: 0, marginBottom: 16, fontSize: 20, fontWeight: 800, color: theme.secondary }}>📊 Аналітика групи (За обраний місяць)</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <div style={{ ...cardSt, padding: 20 }}>
              <div style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700, textTransform: "uppercase" }}>Найкраща відвідуваність</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: theme.textMain, marginTop: 8 }}>{groupAnalytics.bestAttenderName}</div>
              <div style={{ fontSize: 13, color: theme.primary, fontWeight: 600, marginTop: 4 }}>{groupAnalytics.bestAttenderCount} занять</div>
            </div>
            <div style={{ ...cardSt, padding: 20 }}>
              <div style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700, textTransform: "uppercase" }}>Топ покупець</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: theme.textMain, marginTop: 8 }}>{groupAnalytics.topSpenderName}</div>
              <div style={{ fontSize: 13, color: theme.success, fontWeight: 600, marginTop: 4 }}>{groupAnalytics.topSpenderAmount} ₴</div>
            </div>
            <div style={{ ...cardSt, padding: 20 }}>
              <div style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700, textTransform: "uppercase" }}>Піковий день</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: theme.textMain, marginTop: 8 }}>{groupAnalytics.bestDate ? fmt(groupAnalytics.bestDate) : "—"}</div>
              <div style={{ fontSize: 13, color: theme.warning, fontWeight: 600, marginTop: 4 }}>{groupAnalytics.bestDateCount} присутніх</div>
            </div>
            <div style={{ ...cardSt, padding: 20 }}>
              <div style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700, textTransform: "uppercase" }}>Всього відвідувань</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: theme.primary, marginTop: 4 }}>{groupAnalytics.totalMonthAttn}</div>
            </div>
            <div style={{ ...cardSt, padding: 20 }}>
              <div style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700, textTransform: "uppercase" }}>Середня присутність</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: theme.success, marginTop: 4 }}>{groupAnalytics.avgAttendance} <span style={{ fontSize: 13, fontWeight: 600 }}>люд./трен.</span></div>
            </div>
            <div style={{ ...cardSt, padding: 20, border: groupAnalytics.expiringSubs > 0 ? `2px solid ${theme.warning}` : "none" }}>
              <div style={{ fontSize: 12, color: theme.textMuted, fontWeight: 700, textTransform: "uppercase" }}>Закінчуються (&lt;7 дн.)</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: groupAnalytics.expiringSubs > 0 ? theme.warning : theme.textMain, marginTop: 4 }}>{groupAnalytics.expiringSubs} <span style={{ fontSize: 13, fontWeight: 600 }}>абонементів</span></div>
            </div>
          </div>

          {groupAnalytics.churn.length > 0 && (
            <div style={{ marginTop: 24, background: theme.card, borderRadius: 24, padding: 24, border: `2px solid ${theme.danger}40` }}>
              <h4 style={{ margin: "0 0 16px 0", color: theme.danger, fontSize: 16 }}>🚨 Давно не були, але мають абонемент</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {groupAnalytics.churn.map((item, i) => {
                  const tg = item.student.telegram?.replace("@", "");
                  const tgL = tg ? `https://t.me/${tg}` : null;
                  return (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: theme.bg, padding: 12, borderRadius: 12, opacity: warnedStudents[item.sub.id] ? 0.6 : 1 }}>
                      <div>
                        <div style={{ fontWeight: 700, color: theme.textMain, fontSize: 14 }}>{getDisplayName(item.student)}</div>
                        <div style={{ fontSize: 12, color: theme.danger, marginTop: 4, fontWeight: 600 }}>Не була {item.daysSinceLast} днів</div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {tgL && <a href={tgL} target="_blank" rel="noopener noreferrer" style={{ padding: "8px 12px", background: "#fff", color: theme.primary, borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: "none" }}>Написати</a>}
                        <button onClick={() => setWarnedStudents(p => ({ ...p, [item.sub.id]: !p[item.sub.id] }))} style={{ padding: "8px 12px", background: warnedStudents[item.sub.id] ? theme.success : theme.input, color: warnedStudents[item.sub.id] ? "#fff" : theme.textMuted, border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                          {warnedStudents[item.sub.id] ? "✅ Сповіщено" : "Сповістити"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
