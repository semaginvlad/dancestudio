import { useState, useEffect } from "react";

const toLocalISO = (dt) => {
  if (isNaN(dt.getTime())) return "2000-01-01";
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

const addMonth = (d) => {
  const dt = new Date(d + "T12:00:00");
  dt.setMonth(dt.getMonth() + 1);
  return toLocalISO(dt);
};

// 🆕 Додати N днів до дати (для скасувань)
const addDays = (d, n) => {
  const dt = new Date(d + "T12:00:00");
  dt.setDate(dt.getDate() + n);
  return toLocalISO(dt);
};

const today = () => toLocalISO(new Date());

const fmt = (d) => {
  if (!d || d === "2000-01-01") return "—";
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });
};

const daysLeft = (ed) => {
  if (!ed || ed === "2000-01-01") return 0;
  return Math.ceil((new Date(ed + "T23:59:59") - new Date()) / 86400000);
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function getDisplayName(st) {
  if (!st) return "Невідомо";
  const l = st.lastName || st.last_name || "";
  const f = st.firstName || st.first_name || "";
  if (l || f) return `${l} ${f}`.trim();
  return st.name || "Без імені";
}

// ═══════════════════════════════════════════════════════════════════
// 🆕 НОВА ЛОГІКА ТЕРМІНУ ДІЇ АБОНЕМЕНТУ
// ═══════════════════════════════════════════════════════════════════
//
// Ключові правила:
// 1. Якщо activation_date (дата першого відвідування) заповнена →
//    effective_end = activation_date + 1 місяць
// 2. Якщо activation_date порожня (абонемент куплений, ще не розпочат) →
//    effective_end = start_date + 1 місяць (як було раніше)
// 3. Додатково: скасовані тренування подовжують effective_end на 1 день
//    за кожне скасування (це вже враховано в end_date самою міграцією).
//
// Функція getEffectiveEndDate рахує правильну дату, коли абонемент "помре".
// Пріоритет: береться end_date з БД (якщо воно вже "скориговане" на скасування),
// або обчислюється з activation_date.
// ═══════════════════════════════════════════════════════════════════

function getEffectiveEndDate(sub) {
  if (!sub) return null;
  // Якщо в БД вже збережено end_date — довіряємо йому
  // (бо він вже враховує активацію + скасовані дні)
  if (sub.endDate) return sub.endDate;
  // Fallback — якщо end_date порожній (навряд чи, але про всяк)
  const activationDate = sub.activationDate || sub.activation_date;
  if (activationDate) return addMonth(activationDate);
  if (sub.startDate) return addMonth(sub.startDate);
  return null;
}

// 🆕 Статус абонемента: active / warning / expired
// Тут "сірим" (exhausted) стає:
//   - коли використані ВСІ тренування
//   - АБО коли термін дії вийшов
//   - АБО коли активація ще не сталася і минуло > 30 днів з покупки
function getSubStatus(sub) {
  if (!sub) return "expired";

  const end = getEffectiveEndDate(sub);
  const activation = sub.activationDate || sub.activation_date;

  // Якщо ще не активований (немає жодного відвідування):
  //   - Якщо минуло <= 30 днів з покупки — вважаємо "active" (чекає першого заняття)
  //   - Якщо минуло > 30 днів — expired (скасовуємо "зависле")
  if (!activation) {
    const daysSinceStart = sub.startDate
      ? Math.ceil((new Date() - new Date(sub.startDate + "T12:00:00")) / 86400000)
      : 0;
    if (daysSinceStart > 30) return "expired";
    return "active"; // Передоплата, ще чекає
  }

  // Активований — перевіряємо термін і залишок занять
  if (!end || end < today()) return "expired";
  if ((sub.usedTrainings || 0) >= (sub.totalTrainings || 1)) return "expired";

  // Warning — якщо <= 3 днів до кінця або <= 1 заняття залишилось
  const dl = daysLeft(end);
  const tl = (sub.totalTrainings || 1) - (sub.usedTrainings || 0);
  if (dl <= 3 || tl <= 1) return "warning";

  return "active";
}

// 🆕 Перевірка "чи вичерпаний абонемент" — для сірої підсвітки в журналі
// Повертає true якщо: використані ВСІ тренування АБО термін дії вийшов
function isSubExhausted(sub) {
  if (!sub) return true;
  if ((sub.usedTrainings || 0) >= (sub.totalTrainings || 1)) return true;
  const end = getEffectiveEndDate(sub);
  if (end && end < today()) return true;
  return false;
}

const idsEqual = (a, b) => String(a ?? "") === String(b ?? "");

function hasActiveSubscriptionCoverage(subs, studentId, groupId, dateStr) {
  if (!studentId || !groupId || !dateStr) return false;
  return (subs || []).some((s) => {
    if (!idsEqual(s.studentId, studentId)) return false;
    if (!idsEqual(s.groupId, groupId)) return false;
    if ((s.usedTrainings || 0) >= (s.totalTrainings || 0)) return false;
    const end = getEffectiveEndDate(s) || s.endDate || "2099-12-31";
    const start = s.activationDate || s.startDate || "0000-00-00";
    return start <= dateStr && end >= dateStr;
  });
}

function getActiveSubOnDateForCoverage(subs, studentId, groupId, dateStr) {
  const validSubs = (subs || [])
    .filter((s) => {
      if (!idsEqual(s.studentId, studentId)) return false;
      if (!idsEqual(s.groupId, groupId)) return false;
      if ((s.usedTrainings || 0) >= (s.totalTrainings || 0)) return false;
      const end = getEffectiveEndDate(s) || s.endDate || "2099-12-31";
      const start = s.activationDate || s.startDate || "0000-00-00";
      return start <= dateStr && end >= dateStr;
    })
    .sort((a, b) => (a.activationDate || a.startDate || "").localeCompare(b.activationDate || b.startDate || ""));

  return validSubs[0] || null;
}

function getNextTrainingDate(schedule, afterDateStr) {
  if (!schedule || schedule.length === 0 || !afterDateStr) {
    const d = new Date((afterDateStr || today()) + "T12:00:00");
    d.setDate(d.getDate() + 7);
    return toLocalISO(d);
  }
  const targetDays = schedule.map((s) => s.day);
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
  const targetDays = schedule.map((s) => s.day);
  let d = new Date(beforeDateStr + "T12:00:00");
  for (let i = 0; i < 14; i++) {
    d.setDate(d.getDate() - 1);
    if (targetDays.includes(d.getDay())) return toLocalISO(d);
  }
  return beforeDateStr;
}

function getNotifMsg(sub, student, group, direction) {
  if (!student) return "Привіт! Абонемент закінчився.";
  const fName =
    student.firstName ||
    student.first_name ||
    student.name?.split(" ")[1] ||
    student.name?.split(" ")[0] ||
    "";
  const gName = group?.name || "";
  const dName = direction?.name || "";
  const tpl = student.messageTemplate || student.message_template;

  if (tpl) {
    return tpl
      .replace(/\{ім'я\}/g, fName)
      .replace(/\{група\}/g, gName)
      .replace(/\{напрямок\}/g, dName);
  }

  return `Привіт, ${fName}! 💃\nНагадуємо, що твій абонемент у групі ${gName} (${dName}) закінчився.\nЧекаємо на продовження! ❤️`;
}

function useStickyState(defaultValue, key) {
  const [value, setValue] = useState(() => {
    try {
      const stickyValue = window.localStorage.getItem(key);
      if (stickyValue !== null) {
        try {
          return JSON.parse(stickyValue);
        } catch {
          return stickyValue;
        }
      }
      return defaultValue;
    } catch {
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

export {
  toLocalISO,
  addMonth,
  addDays,
  today,
  fmt,
  daysLeft,
  uid,
  getDisplayName,
  getSubStatus,
  getEffectiveEndDate,  // 🆕
  isSubExhausted,        // 🆕
  hasActiveSubscriptionCoverage,
  getActiveSubOnDateForCoverage,
  getNextTrainingDate,
  getPreviousTrainingDate,
  getNotifMsg,
  useStickyState,
};
