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
  toLocalISO,
  today,
  fmt,
  daysLeft,
  uid,
  getDisplayName,
  getSubStatus,
  getNextTrainingDate,
  getPreviousTrainingDate,
  useStickyState
} from "../shared/utils";
import { Badge, GroupSelect, Pill } from "./UI";

// ═══════════════════════════════════════════════════════════════════
// Хелпери для роботи з іменами (нормалізація — однакове порівняння)
// ═══════════════════════════════════════════════════════════════════
const normalizeName = (s) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");

// Перевіряє, чи має attendance-запис стосунок до конкретної учениці
const attnMatchesStudent = (a, student, subsList) => {
  // Якщо є subId — дивимось через підписку (найнадійніший спосіб)
  if (a.subId) {
    const linkedSub = subsList.find(s => s.id === a.subId);
    return linkedSub && linkedSub.studentId === student.id;
  }
  // Для гостьових/одноразових — по імені (з нормалізацією)
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

  // ─── Валідація gid: якщо невалідний (група видалена), скидаємо на першу доступну
  useEffect(() => {
    if (groups.length === 0) return;
    const valid = groups.find(g => g.id === gid);
    if (!valid) setGid(groups[0].id);
  }, [groups, gid]);

  // ─── Учениці в групі (з БД) — тепер через useMemo, щоб не перераховувалось щорендеру
  const stIdsInGroup = useMemo(() => {
    return new Set([
      ...studentGrps.filter(sg => sg.groupId === gid).map(sg => sg.studentId),
      ...subs.filter(s => s.groupId === gid).map(s => s.studentId)
    ]);
  }, [studentGrps, subs, gid]);

  // ─── Гості: тільки ті, кого НЕМАЄ в списку учениць (через нормалізацію імен)
  const guests = useMemo(() => {
    const knownNames = new Set();
    Object.values(studentMap).forEach(s => {
      if (!s) return;
      knownNames.add(normalizeName(getDisplayName(s)));
      knownNames.add(normalizeName(s.name));
    });

    const guestNames = new Set();
    attn.forEach(a => {
      if (a.groupId !== gid || !a.guestName) return;
      // Якщо запис має subId — це не гість, це учениця
      if (a.subId) return;
      const n = normalizeName(a.guestName);
      if (!n || knownNames.has(n)) return;
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

  // ═════════════════════════════════════════════════════════════════
  // ПОРЯДОК (DnD + стрілочки) — з throttle, щоб уникнути race condition
  // ═════════════════════════════════════════════════════════════════
  const updateOrder = async (newOrder) => {
    const persistedIds = newOrder.filter(id => typeof id === "string" && !id.startsWith("guest_"));
    const validIds = Array.from(stIdsInGroup).filter(id => typeof id === "string");
    const normalizedOrder = [...new Set([...persistedIds, ...validIds])].filter(id => validIds.includes(id));

    // Оптимістичне оновлення UI
    setCustomOrders(prev => ({ ...prev, [gid]: normalizedOrder }));

    try {
      const { error } = await supabase
        .from('custom_orders')
        .upsert({ group_id: gid, student_ids: normalizedOrder }, { onConflict: 'group_id' });
      if (error) console.error('Order save error:', error);
    } catch (e) {
      console.error('Order save exception:', e);
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

  // ═════════════════════════════════════════════════════════════════
  // ДОДАВАННЯ ВРУЧНУ (через форму внизу)
  // ═════════════════════════════════════════════════════════════════
  const addManual = async () => {
    const name = manualName.trim();
    if (!name) return;
    try {
      // Шукаємо ученицю з БД (нормалізоване порівняння імен)
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
        let createdSt = { id: uid(), ...payload };
        if (db.insertStudent) {
          try {
            const res = await db.insertStudent(payload);
            if (res) createdSt = res;
          } catch (e) { console.warn(e); }
        }
        setStudents(p => [...p, createdSt]);
        st = createdSt;
      }

      // Прикріплюємо до групи, якщо ще не прикріплена
      if (!studentGrps.some(sg => sg.studentId === st.id && sg.groupId === gid)) {
        let newSg = { id: uid(), studentId: st.id, groupId: gid };
        if (db.addStudentGroup) {
          try {
            const savedSg = await db.addStudentGroup(st.id, gid);
            if (savedSg) newSg = savedSg;
          } catch (e) { console.error('addStudentGroup error:', e); }
        }
        setStudentGrps(p => [...p, newSg]);
      }

      // Визначаємо тип запису (з чіткими попередженнями)
      let subId = null;
      let entryType = journalGuestMode;

      if (journalGuestMode === "subscription") {
        const stSubs = subs.filter(s =>
          s.studentId === st.id &&
          s.groupId === gid &&
          (s.usedTrainings || 0) < (s.totalTrainings || 1)
        );
        // Шукаємо на конкретну дату; якщо нема — будь-який із залишком
        const onDate = stSubs.find(s => s.startDate <= manualDate && s.endDate >= manualDate);
        const fallback = [...stSubs].sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
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
            db.syncSubUsedTrainings(subId).catch(() => {});
          }
        } catch (err) {
          console.error("Insert error:", err);
          alert(`Не вдалось зберегти: ${err?.message || "помилка БД"}`);
          setAttn(prev => prev.filter(i => i.id !== a.id));
        }
      }
    } catch (e) {
      console.warn("addManual error", e);
    }
    setManualName("");
  };

  const removeStudentFromJournal = async (st) => {
    if (!confirm(`Відкріпити ${getDisplayName(st)} від цієї групи? Її історія залишиться, але вона не буде в журналі.`)) return;

    if (!st.isGuest) {
      const toDelSg = studentGrps.find(sg => sg.studentId === st.id && sg.groupId === gid);
      if (toDelSg) {
        setStudentGrps(p => p.filter(sg => sg.id !== toDelSg.id));
        if (db.removeStudentGroup) {
          await db.removeStudentGroup(toDelSg.studentId, toDelSg.groupId).catch(e => console.log(e));
        }
      }
      const activeSub = subs.find(s => s.studentId === st.id && s.groupId === gid && getSubStatus(s) !== "expired");
      if (activeSub) {
        const newEnd = today();
        if (db.updateSub) db.updateSub(activeSub.id, { endDate: newEnd }).catch(e => console.warn(e));
        setSubs(p => p.map(s => s.id === activeSub.id ? { ...s, endDate: newEnd } : s));
      }
    } else {
      // Гостя — видаляємо всі записи з цієї групи
      const nNorm = normalizeName(st.name);
      const toDel = attn.filter(a => a.groupId === gid && !a.subId && normalizeName(a.guestName) === nNorm);
      const toDelIds = toDel.map(a => a.id);
      setAttn(p => p.filter(a => !toDelIds.includes(a.id)));
      if (db.deleteAttendance) {
        for (const id of toDelIds) {
          if (!String(id).startsWith("temp_")) {
            await db.deleteAttendance(id).catch(e => console.log(e));
          }
        }
      }
    }
    setActionMenuSt(null);
  };

  // ═════════════════════════════════════════════════════════════════
  // НАВІГАЦІЯ ПО МІСЯЦЯХ
  // ═════════════════════════════════════════════════════════════════
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
  // ВИЗНАЧЕННЯ ДІАПАЗОНІВ ДІЇ АБОНЕМЕНТІВ (для підсвітки)
  // ═════════════════════════════════════════════════════════════════
  const getStudentSubRanges = (studentId) => {
    if (!studentId || String(studentId).startsWith("guest_")) return [];
    const stSubs = subs
      .filter(s => s.studentId === studentId && s.groupId === gid)
      .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));
    return stSubs.map(sub => {
      const subAttns = attn.filter(a => a.subId === sub.id);
      const usedFromAttn = subAttns.reduce((s, a) => s + (a.quantity || 1), 0);
      const isExhausted = usedFromAttn >= (sub.totalTrainings || 1);
      return {
        start: sub.startDate || "2000-01-01",
        end: sub.endDate || "2099-12-31",
        id: sub.id,
        isExhausted
      };
    });
  };

  // Дні тижня для журналу (на 3 місяці)
  const generateDays = () => {
    if (!journalMonth) return [];
    const parts = journalMonth.split('-');
    if (parts.length !== 2) return [];
    const [y, m] = parts;
    const centerDate = new Date(y, parseInt(m) - 1, 1);

    const prev = new Date(centerDate); prev.setMonth(centerDate.getMonth() - 1);
    const next = new Date(centerDate); next.setMonth(centerDate.getMonth() + 1);

    const all = [];
    [prev, centerDate, next].forEach(dateObj => {
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const days = new Date(year, dateObj.getMonth() + 1, 0).getDate();
      for (let i = 1; i <= days; i++) all.push(`${year}-${month}-${String(i).padStart(2, '0')}`);
    });

    const currentGroup = groups.find(g => g.id === gid);
    const scheduleDays = currentGroup?.schedule?.map(s => s.day) || [];
    const activeDays = new Set(attn.filter(a => a.groupId === gid).map(a => a.date));

    return all.filter(dStr => {
      if (scheduleDays.length === 0) return true;
      const dow = new Date(dStr + "T12:00:00").getDay();
      return scheduleDays.includes(dow) || activeDays.has(dStr);
    });
  };

  const visibleDays = useMemo(() => generateDays(), [journalMonth, gid, groups, attn]);

  const monthSpans = useMemo(() => {
    const spans = [];
    let currentMonth = null, currentSpan = 0;
    visibleDays.forEach(d => {
      const m = parseInt(d.split('-')[1]) - 1;
      if (currentMonth === m) currentSpan++;
      else {
        if (currentMonth !== null) spans.push({ month: currentMonth, span: currentSpan });
        currentMonth = m; currentSpan = 1;
      }
    });
    if (currentMonth !== null) spans.push({ month: currentMonth, span: currentSpan });
    return spans;
  }, [visibleDays]);

  // ═════════════════════════════════════════════════════════════════
  // ⚡ ПОШУК ЗАПИСІВ — ТЕПЕР ПОВЕРТАЄ ВСІ МАТЧІ (щоб вичищати дублі)
  // ═════════════════════════════════════════════════════════════════
  const findAllRecords = (st, d) => {
    return attn.filter(a => {
      if (a.groupId !== gid || a.date !== d) return false;
      return attnMatchesStudent(a, st, subs);
    });
  };

  const findRecord = (st, d) => {
    const arr = findAllRecords(st, d);
    return arr.length > 0 ? arr[0] : undefined;
  };

  // ═════════════════════════════════════════════════════════════════
  // 🟢 КЛЮЧОВА ФУНКЦІЯ — СТАВИТИ / ЗНІМАТИ ГАЛОЧКУ
  // ═════════════════════════════════════════════════════════════════
  const toggleJournalCell = async (student, cellDate, isCurrentlyAttended /* dbRecord unused */) => {
    try {
      // ─── ВИДАЛЕННЯ ГАЛОЧКИ — чистимо ВСІ матчі (включно з дублікатами!)
      if (isCurrentlyAttended) {
        const allMatches = findAllRecords(student, cellDate);
        if (allMatches.length === 0) return;

        const affectedSubIds = new Set(allMatches.filter(m => m.subId).map(m => m.subId));

        // Оптимістичне оновлення UI
        setAttn(p => p.filter(a => !allMatches.some(m => m.id === a.id)));

        // Видалення з БД
        for (const match of allMatches) {
          if (match.id && !String(match.id).startsWith("temp_")) {
            if (db.deleteAttendance) {
              try { await db.deleteAttendance(match.id); }
              catch (err) { console.error("Delete failed for", match.id, err); }
            }
          }
        }

        // Синхронізуємо used_trainings в БД (щоб бот бачив актуальну цифру)
        if (db.syncSubUsedTrainings) {
          for (const subId of affectedSubIds) {
            db.syncSubUsedTrainings(subId).catch(() => {});
          }
        }
        return;
      }

      // ─── ДОДАВАННЯ ГАЛОЧКИ
      // Захист від дубля: якщо вже є запис на цей день — не створюємо другий
      if (findAllRecords(student, cellDate).length > 0) {
        alert(`"${getDisplayName(student)}" вже відмічена на ${cellDate}. Спочатку зніми попередню галочку.`);
        return;
      }

      let finalSubId = null;
      let finalEntryType = journalGuestMode;

      // 🛡 Захист від повторного пробного
      if (journalGuestMode === "trial") {
        const hasTrial = attn.some(a => {
          if (a.groupId !== gid || a.entryType !== "trial") return false;
          return attnMatchesStudent(a, student, subs);
        });
        if (hasTrial) {
          alert(`Увага! "${getDisplayName(student)}" вже була на пробному в цій групі.\nОбери "Разове" або "Абонемент".`);
          return;
        }
      }

      // 🛡 Захист: гості не можуть мати subscription
      if (journalGuestMode === "subscription") {
        if (student.isGuest) {
          alert(
            `"${getDisplayName(student)}" ще не має профілю учениці.\n\n` +
            `Натисни "⋮" біля її імені → "Оформити абонемент" — і тільки потім можна буде використовувати режим "Абонемент".`
          );
          return;
        }

        const stSubs = subs.filter(s =>
          s.studentId === student.id &&
          s.groupId === gid &&
          (s.usedTrainings || 0) < (s.totalTrainings || 1)
        );

        // Спочатку — абонемент, що ДІЄ НА ДАТУ
        const onDate = stSubs.find(s => s.startDate <= cellDate && s.endDate >= cellDate);
        // Якщо немає — найперший активний із залишком (для заборгованості/запізнень)
        const fallback = [...stSubs].sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""))[0];
        const validSub = onDate || fallback;

        if (!validSub) {
          const wantSingle = confirm(
            `У "${getDisplayName(student)}" немає активного абонементу на ${cellDate}.\n\n` +
            `Позначити як "Разове" (300 грн)?\n\n` +
            `Якщо натиснеш "Скасувати" — галочка не поставиться, і ти зможеш спочатку оформити абонемент.`
          );
          if (!wantSingle) return;
          finalEntryType = "single";
        } else {
          finalSubId = validSub.id;
        }
      }

      // Створюємо запис
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
          // Синхронізуємо БД-поле used_trainings (щоб бот бачив актуальну цифру)
          if (finalSubId && db.syncSubUsedTrainings) {
            db.syncSubUsedTrainings(finalSubId).catch(() => {});
          }
        } catch (err) {
          console.error("Insert error:", err);
          // Якщо БД відхилила через унікальність — це означає, що десь ще лежить "привид"
          const msg = err?.message || String(err);
          if (msg.includes("duplicate") || msg.includes("unique")) {
            alert("Запис вже є в базі (можливо, дубль зі сторони). Перезавантаж сторінку.");
          } else {
            alert(`Не вдалось зберегти: ${msg}`);
          }
          setAttn(prev => prev.filter(i => i.id !== newId));
        }
      }
    } catch (e) {
      console.warn("toggle error:", e);
    }
  };

  // ═════════════════════════════════════════════════════════════════
  // СКАСУВАННЯ / ВІДНОВЛЕННЯ ОКРЕМИХ ЗАНЯТЬ
  // ═════════════════════════════════════════════════════════════════
  const handleCancelSpecificDay = async (cancelDate) => {
    if (!confirm(`Точно скасувати тренування ${cancelDate}? Всі активні абонементи будуть подовжені на наступне заняття групи.`)) return;
    try {
      const currentGroup = groups.find(g => g.id === gid);
      const affectedSubs = rawSubs.filter(s => s.groupId === gid && s.startDate <= cancelDate && s.endDate >= cancelDate);
      const originalEnds = {};
      let newSubs = [...rawSubs];

      for (const sub of affectedSubs) {
        originalEnds[sub.id] = sub.endDate;
        const newEnd = getNextTrainingDate(currentGroup?.schedule, sub.endDate);
        if (db.updateSub) db.updateSub(sub.id, { endDate: newEnd }).catch(e => console.warn(e));
        newSubs = newSubs.map(s => s.id === sub.id ? { ...s, endDate: newEnd } : s);
      }

      const newCancel = { id: uid(), groupId: gid, date: cancelDate, originalEnds };
      setCancelled(p => [...p, newCancel]);
      setSubs(newSubs);
      if (db.insertCancelled) db.insertCancelled(newCancel).catch(e => console.warn(e));
    } catch (e) { console.warn(e); }
  };

  const handleRestoreSpecificDay = async (restoreDate) => {
    if (!confirm(`Відновити скасоване тренування ${restoreDate}? Терміни абонементів будуть повернуті.`)) return;
    try {
      const target = cancelled.find(c => c.groupId === gid && c.date === restoreDate);
      if (!target) return;
      let newSubs = [...rawSubs];
      const currentGroup = groups.find(g => g.id === gid);

      if (target.originalEnds && Object.keys(target.originalEnds).length > 0) {
        for (const [subId, origEnd] of Object.entries(target.originalEnds)) {
          if (db.updateSub) db.updateSub(subId, { endDate: origEnd }).catch(e => console.warn(e));
          newSubs = newSubs.map(s => s.id === subId ? { ...s, endDate: origEnd } : s);
        }
      } else {
        const affected = newSubs.filter(s => s.groupId === gid && s.endDate >= restoreDate);
        for (const sub of affected) {
          const reverted = getPreviousTrainingDate(currentGroup?.schedule, sub.endDate);
          if (db.updateSub) db.updateSub(sub.id, { endDate: reverted }).catch(e => console.warn(e));
          newSubs = newSubs.map(s => s.id === sub.id ? { ...s, endDate: reverted } : s);
        }
      }

      setSubs(newSubs);
      setCancelled(p => p.filter(c => c.id !== target.id));
      if (db.deleteCancelled) db.deleteCancelled(target.id).catch(e => console.warn(e));
    } catch (e) { console.warn("Restore error:", e); }
  };

  // ═════════════════════════════════════════════════════════════════
  // АНАЛІТИКА ГРУПИ
  // ═════════════════════════════════════════════════════════════════
  const groupAnalytics = useMemo(() => {
    const monthAttn = attn.filter(a => a.groupId === gid && a.date?.startsWith(journalMonth));
    const attnCountsByStudent = {};
    const dateCounts = {};

    monthAttn.forEach(a => {
      // Знаходимо stId: через subId, або шукаємо за guestName з нормалізацією
      let stId = null;
      if (a.subId) {
        stId = subs.find(s => s.id === a.subId)?.studentId;
      }
      if (!stId && a.guestName) {
        const nNorm = normalizeName(a.guestName);
        const matched = Object.values(studentMap).find(s =>
          s && (normalizeName(getDisplayName(s)) === nNorm || normalizeName(s.name) === nNorm)
        );
        stId = matched?.id || a.guestName;
      }
      if (stId) attnCountsByStudent[stId] = (attnCountsByStudent[stId] || 0) + (a.quantity || 1);
      dateCounts[a.date] = (dateCounts[a.date] || 0) + (a.quantity || 1);
    });

    const maxCount = Object.values(attnCountsByStudent).length > 0
      ? Math.max(...Object.values(attnCountsByStudent)) : 0;
    const bestIds = Object.keys(attnCountsByStudent).filter(id => attnCountsByStudent[id] === maxCount && maxCount > 0);
    const bestAttenderName = bestIds.length > 0
      ? bestIds.map(id => studentMap[id] ? getDisplayName(studentMap[id]) : id).join(", ")
      : "Немає";
    const bestAttenderCount = maxCount;

    const bestDate = Object.keys(dateCounts).sort((a, b) => dateCounts[b] - dateCounts[a])[0];
    const bestDateCount = bestDate ? dateCounts[bestDate] : 0;

    const activeDaysCount = Object.keys(dateCounts).length;
    const avgAttendance = activeDaysCount > 0 ? (monthAttn.length / activeDaysCount).toFixed(1) : 0;

    const spendCounts = {};
    subs.filter(s => s.groupId === gid && s.paid).forEach(s => {
      spendCounts[s.studentId] = (spendCounts[s.studentId] || 0) + (s.amount || 0);
    });
    const topSpenderId = Object.keys(spendCounts).sort((a, b) => spendCounts[b] - spendCounts[a])[0];
    const topSpenderName = topSpenderId ? getDisplayName(studentMap[topSpenderId]) : "Немає";
    const topSpenderAmount = topSpenderId ? spendCounts[topSpenderId] : 0;

    // Закінчуються — дивимося на статус, а не тільки на "active"
    const expiringSubs = subs.filter(s => {
      if (s.groupId !== gid) return false;
      const status = getSubStatus(s);
      if (status === "expired") return false;
      const dl = daysLeft(s.endDate);
      return dl >= 0 && dl <= 7;
    }).length;

    const churn = [];
    const last30 = toLocalISO(new Date(Date.now() - 30 * 86400000));
    const activeInGroup = subs.filter(s => s.groupId === gid && getSubStatus(s) !== "expired");

    activeInGroup.forEach(sub => {
      const st = studentMap[sub.studentId];
      if (!st) return;
      const dates = attn.filter(a => a.groupId === gid && a.subId === sub.id).map(a => a.date).sort();
      const lastDate = dates.length > 0 ? dates[dates.length - 1] : sub.startDate;
      if (lastDate && lastDate !== "2000-01-01") {
        const days = Math.floor((new Date() - new Date(lastDate + "T12:00:00")) / 86400000);
        if (days >= 10) churn.push({ student: st, sub, daysSinceLast: days });
      }
    });

    return {
      bestAttenderName, bestAttenderCount, bestDate, bestDateCount,
      topSpenderName, topSpenderAmount, churn,
      totalMonthAttn: monthAttn.length, avgAttendance, expiringSubs
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
              {visibleDays.map((d, index) => {
                const dayNum = new Date(d + "T12:00:00").getDay();
                const isNewMonth = index === 0 || d.split('-')[1] !== visibleDays[index - 1].split('-')[1];
                const isDayCancelled = cancelled.some(c => c.groupId === gid && c.date === d);

                return (
                  <th key={d} style={{ padding: "8px 2px", background: isDayCancelled ? "rgba(255, 69, 58, 0.15)" : theme.card, color: theme.textMain, fontWeight: 600, minWidth: 44, textAlign: "center", borderLeft: isNewMonth && index !== 0 ? `4px solid ${theme.border}` : "none", borderBottom: `4px solid ${theme.border}`, verticalAlign: "top", height: 70 }}>
                    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}>
                      <div>
                        <div style={{ fontSize: 10, textTransform: "uppercase", color: theme.textMuted, marginBottom: 2 }}>{WEEKDAYS[dayNum]}</div>
                        <div style={{ fontSize: 15, fontWeight: 800 }}>{d.slice(-2)}</div>
                      </div>
                      <div style={{ marginTop: "auto" }}>
                        {isDayCancelled ? (
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
              const subRanges = getStudentSubRanges(st.id);
              return (
                <tr key={st.id}
                  draggable
                  onDragStart={e => { e.dataTransfer.setData("text/plain", st.id); e.dataTransfer.effectAllowed = "move"; }}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                  onDrop={e => { e.preventDefault(); const draggedId = e.dataTransfer.getData("text/plain"); if (draggedId) moveStudentDnD(draggedId, st.id); }}
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
                  {visibleDays.map((d, index) => {
                    const isNewMonth = index === 0 || d.split('-')[1] !== visibleDays[index - 1].split('-')[1];
                    const rec = findRecord(st, d);
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
                            <div onClick={() => toggleJournalCell(st, d, isAttended)} style={{ width: 26, height: 26, borderRadius: 8, background: markBg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, transition: "0.1s" }}>
                              {isAttended ? "✓" : ""}
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
              {visibleDays.map((d, index) => {
                const isNewMonth = index === 0 || d.split('-')[1] !== visibleDays[index - 1].split('-')[1];
                const count = studsInGroup.filter(st => !!findRecord(st, d)).length;
                return (
                  <td key={d} style={{ padding: "8px 2px", fontWeight: 800, color: count > 0 ? theme.primary : theme.textLight, textAlign: "center", borderLeft: isNewMonth && index !== 0 ? `4px solid ${theme.border}` : "none", borderBottom: `none`, background: theme.bg }}>
                    {count > 0 ? count : "-"}
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
            const activeSub = stSubs.find(s => {
              const trLeft = (s.totalTrainings || 1) - (s.usedTrainings || 0);
              return trLeft > 0 && s.endDate >= today();
            });
            const displaySub = activeSub || (stSubs.length > 0 ? stSubs[0] : null);

            let badgeColor = theme.textLight;
            let badgeText = "Без абонемента";
            let detailText = "";
            let isWarning = false;
            let isExpired = false;
            let rowBg = "transparent";

            if (displaySub) {
              const planName = PLAN_TYPES.find(p => p.id === displaySub.planType)?.name || "Абонемент";
              const trUsed = displaySub.usedTrainings || 0;
              const trTotal = displaySub.totalTrainings || 1;
              const trLeft = trTotal - trUsed;
              const endD = displaySub.endDate;
              const todayStr = today();

              isExpired = trLeft <= 0 || endD < todayStr;
              isWarning = !isExpired && (trLeft <= 1 || endD === todayStr);

              if (isExpired) { badgeColor = theme.danger; badgeText = planName; rowBg = `${theme.danger}10`; }
              else if (isWarning) { badgeColor = theme.warning; badgeText = planName; rowBg = `${theme.warning}10`; }
              else { badgeColor = theme.success; badgeText = planName; }
              detailText = `${trUsed} / ${trTotal} (до ${fmt(endD)})`;
            } else if (st.isGuest) {
              badgeColor = theme.warning; badgeText = "Гість"; rowBg = "#FFF9F0";
            } else {
              // Шукаємо останнє відвідування учениці
              const stAttns = attn.filter(a => a.groupId === gid && attnMatchesStudent(a, st, subs))
                .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
              const last = stAttns[stAttns.length - 1];
              if (last?.entryType) {
                badgeText = last.entryType === 'trial' ? "Пробне" : last.entryType === 'single' ? "Разове" : "Без абонемента";
                badgeColor = last.entryType === 'trial' ? theme.success : last.entryType === 'single' ? theme.warning : theme.textLight;
              }
            }

            const tgUser = st.telegram?.replace("@", "");
            const tgLink = tgUser ? `https://t.me/${tgUser}` : null;

            return (
              <div key={st.id} style={{ padding: "16px 20px", borderBottom: i < studsInGroup.length - 1 ? `1px solid ${theme.bg}` : "none", display: "flex", justifyContent: "space-between", alignItems: "center", background: rowBg, flexWrap: "wrap", gap: 12, opacity: (isExpired || isWarning) && warnedStudents[displaySub?.id] ? 0.6 : 1 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flex: 1, minWidth: 200 }}>
                  <span style={{ color: theme.textLight, fontSize: 13, fontWeight: 700, minWidth: 20 }}>{i + 1}.</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: theme.textMain, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{getDisplayName(st)}</div>
                    {(isExpired || isWarning) && displaySub && (
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
                  {detailText && <span style={{ fontSize: 11, color: isExpired ? theme.danger : isWarning ? theme.warning : theme.textMuted, fontWeight: 600 }}>{detailText}</span>}
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
                  const tgUser = item.student.telegram?.replace("@", "");
                  const tgLink = tgUser ? `https://t.me/${tgUser}` : null;
                  return (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: theme.bg, padding: 12, borderRadius: 12, opacity: warnedStudents[item.sub.id] ? 0.6 : 1 }}>
                      <div>
                        <div style={{ fontWeight: 700, color: theme.textMain, fontSize: 14 }}>{getDisplayName(item.student)}</div>
                        <div style={{ fontSize: 12, color: theme.danger, marginTop: 4, fontWeight: 600 }}>Не була {item.daysSinceLast} днів</div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {tgLink && <a href={tgLink} target="_blank" rel="noopener noreferrer" style={{ padding: "8px 12px", background: "#fff", color: theme.primary, borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: "none" }}>Написати</a>}
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
