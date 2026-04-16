import React, { useState, useEffect } from "react";

const toLocalISO = (dt) => {
  if (isNaN(dt.getTime())) return "2000-01-01"; 
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
};

const addMonth = (d) => { 
  const dt = new Date(d+"T12:00:00"); 
  dt.setMonth(dt.getMonth()+1); 
  return toLocalISO(dt); 
};

const today = () => toLocalISO(new Date());

const fmt = (d) => { 
  if(!d || d === "2000-01-01") return "—"; 
  const dt = new Date(d+"T12:00:00"); 
  return dt.toLocaleDateString("uk-UA", {day:"2-digit", month:"2-digit"}); 
};

const daysLeft = (ed) => {
  if (!ed || ed === "2000-01-01") return 0;
  return Math.ceil((new Date(ed+"T23:59:59") - new Date()) / 86400000);
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);

function getDisplayName(st) {
  if (!st) return "Невідомо";
  const l = st.lastName || st.last_name || "";
  const f = st.firstName || st.first_name || "";
  if (l || f) return `${l} ${f}`.trim();
  return st.name || "Без імені";
}

function getSubStatus(sub) {
  if (!sub?.endDate) return "expired";
  if (sub.endDate < today()) return "expired";
  if ((sub.usedTrainings||0) >= (sub.totalTrainings||1)) return "expired";
  const dl = daysLeft(sub.endDate), tl = (sub.totalTrainings||1)-(sub.usedTrainings||0);
  if (dl <= 3 || tl <= 1) return "warning";
  return "active";
}

function getNextTrainingDate(schedule, afterDateStr) {
  if (!schedule || schedule.length === 0 || !afterDateStr) {
    const d = new Date((afterDateStr || today()) + "T12:00:00");
    d.setDate(d.getDate() + 7);
    return toLocalISO(d);
  }
  const targetDays = schedule.map(s => s.day);
  let d = new Date(afterDateStr + "T12:00:00");
  for (let i = 0; i < 14; i++) {
    d.setDate(d.getDate() + 1);
    if (targetDays.includes(d.getDay())) return toLocalISO(d);
  }
  return afterDateStr;
}

function getPreviousTrainingDate(schedule, beforeDateStr) {
  if (!schedule || schedule.length === 0 || !beforeDateStr) {
    const d = new Date((beforeDateStr || today()) + "T12:00:00");
    d.setDate(d.getDate() - 7);
    return toLocalISO(d);
  }
  const targetDays = schedule.map(s => s.day);
  let d = new Date(beforeDateStr + "T12:00:00");
  for (let i = 0; i < 14; i++) {
    d.setDate(d.getDate() - 1);
    if (targetDays.includes(d.getDay())) return toLocalISO(d);
  }
  return beforeDateStr;
}

function getNotifMsg(sub, student, group, direction){
  if (!student) return "Привіт! Абонемент закінчився.";
  const fName = student.firstName || student.first_name || student.name?.split(" ")[1] || student.name?.split(" ")[0] || ""; 
  const gName = group?.name || "";
  const dName = direction?.name || "";
  const tpl = student.messageTemplate || student.message_template;
  if(tpl) return tpl.replace(/\{ім'я\}/g, fName).replace(/\{група\}/g, gName).replace(/\{напрямок\}/g, dName);
  return `Привіт, ${fName}! 💃\nНагадуємо, що твій абонемент у групі ${gName} (${dName}) закінчився.\nЧекаємо на продовження! ❤️`;
}

const STATUS_LABELS = { active: "Активний", warning: "Закінчується", expired: "Протермінований" };
const STATUS_COLORS = { active: theme.success, warning: theme.warning, expired: theme.danger };

// ==========================================
// 2. ХУК ДЛЯ ЗБЕРЕЖЕННЯ В ЛОКАЛЬНІЙ ПАМ'ЯТІ
// ==========================================
function useStickyState(defaultValue, key) {
  const [value, setValue] = useState(() => {
    try {
      const stickyValue = window.localStorage.getItem(key);
      if (stickyValue !== null) {
        try { return JSON.parse(stickyValue); } 
        catch (e) { return stickyValue; }
      }
      return defaultValue;
    } catch (err) {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.warn("Failed to save to localStorage", err);
    }
  }, [key, value]);

  return [value, setValue];
}

// ==========================================
// 3. UI КОМПОНЕНТИ
// ==========================================
const inputSt = { width:"100%", padding:"16px 20px", background:theme.input, border:`1px solid transparent`, borderRadius:16, color:theme.textMain, fontSize:14, fontWeight: 500, outline:"none", boxSizing:"border-box", fontFamily:"inherit", transition:"0.2s" };
const btnP = { padding:"16px 28px", background:theme.primary, color:"#fff", border:"none", borderRadius:100, fontSize:15, fontWeight:600, cursor:"pointer", fontFamily:"inherit", boxShadow:`0 8px 24px ${theme.primary}40` };
const btnS = { padding:"16px 28px", background:theme.input, color:theme.textMuted, border:"none", borderRadius:100, fontSize:15, fontWeight:600, cursor:"pointer", fontFamily:"inherit" };
const cardSt = { background:theme.card, borderRadius:24, padding:"24px", border:"none", boxShadow: "0 10px 40px rgba(168, 177, 206, 0.15)" };


export {
  toLocalISO,
  addMonth,
  today,
  fmt,
  daysLeft,
  uid,
  getDisplayName,
  getSubStatus,
  getNextTrainingDate,
  getPreviousTrainingDate,
  getNotifMsg,
  useStickyState,
};
