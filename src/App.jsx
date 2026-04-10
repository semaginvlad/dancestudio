import { useState, useEffect, useMemo } from "react";
import * as db from "./db";

// ═══════════════════════════════════════════
// CONSTANTS & CONFIG
// ═══════════════════════════════════════════
const DIRECTIONS = [
  { id: "latina", name: "Latina Solo", color: "#E84855" },
  { id: "bachata", name: "Bachata Lady Style", color: "#F9A03F" },
  { id: "heels", name: "High Heels", color: "#7B2D8E" },
  { id: "dancehall", name: "Dancehall Female", color: "#2ECC71" },
  { id: "kpop", name: "K-pop Cover Dance", color: "#3498DB" },
  { id: "jazzfunk", name: "Jazz Funk", color: "#E91E8C" },
];

const WEEKDAYS = ["НД", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];
const WEEKDAYS_FULL = ["Неділя", "Понеділок", "Вівторок", "Середа", "Четвер", "П'ятниця", "Субота"];

const PLAN_TYPES = [
  { id: "trial", name: "Пробне", trainings: 1, price: 150 },
  { id: "single", name: "Разове", trainings: 1, price: 300 },
  { id: "4pack", name: "Абонемент 4", trainings: 4, price: 1000 },
  { id: "8pack", name: "Абонемент 8", trainings: 8, price: 1500 },
  { id: "12pack", name: "Абонемент 12", trainings: 12, price: 1800 },
];

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

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmt = (d) => {
  if (!d) return "—";
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });
};
const fmtFull = (d) => {
  if (!d) return "—";
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });
};
const toLocalISO = (dt) => {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
const toISO = (d) => {
  try {
    if (d instanceof Date) return toLocalISO(d);
    const dt = new Date(d + "T12:00:00");
    if (isNaN(dt.getTime())) return toLocalISO(new Date());
    return toLocalISO(dt);
  } catch { return toLocalISO(new Date()); }
};
const addMonth = (d) => {
  try {
    const dt = new Date(d + "T12:00:00");
    dt.setMonth(dt.getMonth() + 1);
    return toLocalISO(dt);
  } catch { return toISO(new Date()); }
};
const daysLeft = (endDate) => {
  const diff = new Date(endDate + "T23:59:59") - new Date();
  return Math.ceil(diff / 86400000);
};
const today = () => toLocalISO(new Date());

function getSubStatus(sub) {
  if (!sub || !sub.endDate) return "expired";
  const t = today();
  if (sub.endDate < t) return "expired";
  if ((sub.usedTrainings || 0) >= (sub.totalTrainings || 1)) return "expired";
  const dl = daysLeft(sub.endDate);
  const tl = (sub.totalTrainings || 1) - (sub.usedTrainings || 0);
  if (dl <= 3 || tl <= 1) return "warning";
  return "active";
}

function getMonthDates(year, month, schedule) {
  const dates = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month, d);
    const dow = dt.getDay();
    const match = schedule.find((s) => s.day === dow);
    if (match) {
      dates.push({ date: toISO(dt), day: dow, time: match.time });
    }
  }
  return dates;
}

// Database is now in Supabase
const STATUS_LABELS = { active: "Активний", warning: "Закінчується", expired: "Протермінований" };
const STATUS_COLORS = { active: "#2ECC71", warning: "#F9A03F", expired: "#E84855" };
const PAY_METHODS = [{ id: "card", name: "💳 Карта" }, { id: "cash", name: "💵 Готівка" }];

// ═══════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════
const inputSt = {
  width: "100%", padding: "10px 14px", background: "#0d1117", border: "1px solid #30363d",
  borderRadius: 8, color: "#e6edf3", fontSize: 14, outline: "none", boxSizing: "border-box",
  fontFamily: "inherit"
};
const btnP = {
  padding: "10px 20px", background: "#E84855", color: "#fff", border: "none",
  borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit"
};
const btnS = {
  padding: "10px 20px", background: "#21262d", color: "#c9d1d9", border: "1px solid #30363d",
  borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: "inherit"
};
const cardSt = { background: "#161b22", borderRadius: 10, padding: "14px 18px" };

// ═══════════════════════════════════════════
// SMALL COMPONENTS
// ═══════════════════════════════════════════
function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#1a1a2e", borderRadius: 14, padding: "24px 28px", width: wide ? 700 : 500, maxWidth: "96vw", maxHeight: "88vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.6)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: "#fff" }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#666", fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children, row }) {
  return (
    <div style={{ marginBottom: 12, display: row ? "flex" : "block", alignItems: "center", gap: 8 }}>
      <label style={{ display: "block", fontSize: 11, color: "#8892b0", marginBottom: row ? 0 : 3, textTransform: "uppercase", letterSpacing: 0.8, minWidth: row ? 100 : "auto" }}>{label}</label>
      {children}
    </div>
  );
}

function Badge({ color, children }) {
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 600,
      background: `${color}22`, color, border: `1px solid ${color}33`, whiteSpace: "nowrap"
    }}>{children}</span>
  );
}

function Pill({ active, onClick, children, color }) {
  return (
    <button onClick={onClick} style={{
      padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: "pointer",
      background: active ? (color || "#E84855") : "#21262d",
      color: active ? "#fff" : "#8892b0",
      border: `1px solid ${active ? "transparent" : "#30363d"}`,
      fontFamily: "inherit", transition: "all .15s"
    }}>{children}</button>
  );
}

// ═══════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════
export default function App() {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [subs, setSubs] = useState([]);
  const [attn, setAttn] = useState([]);
  const [groups, setGroups] = useState(DEFAULT_GROUPS);
  const [cancelled, setCancelled] = useState([]);
  const [modLog, setModLog] = useState([]);
  const [studentGrps, setStudentGrps] = useState([]);
  const [tab, setTab] = useState("dashboard");
  const [modal, setModal] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [searchQ, setSearchQ] = useState("");
  const [filterDir, setFilterDir] = useState("all");
  const [filterGroup, setFilterGroup] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [calMonth, setCalMonth] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });

  // ─── LOAD FROM SUPABASE ───
  useEffect(() => {
    (async () => {
      try {
        const [st, gr, su, at, ca, ml, sg] = await Promise.all([
          db.fetchStudents(),
          db.fetchGroups(),
          db.fetchSubs(),
          db.fetchAttendance(),
          db.fetchCancelled(),
          db.fetchModLog(),
          db.fetchStudentGroups(),
        ]);
        setStudents((st || []).map(s => ({ ...s, messageTemplate: s.message_template })));
        if (gr?.length) setGroups(gr);
        setSubs(su || []);
        setAttn(at || []);
        setCancelled(ca || []);
        setModLog(ml || []);
        setStudentGrps(sg || []);
      } catch (e) {
        console.error("Failed to load data:", e);
      }
      setLoading(false);
    })();
  }, []);

  // ─── MAPS ───
  const studentMap = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s])), [students]);
  const groupMap = useMemo(() => Object.fromEntries(groups.map((g) => [g.id, g])), [groups]);
  const dirMap = useMemo(() => Object.fromEntries(DIRECTIONS.map((d) => [d.id, d])), []);

  const subsExt = useMemo(() => subs.map((s) => ({ ...s, status: getSubStatus(s) })), [subs]);
  const activeSubs = useMemo(() => subsExt.filter((s) => s.status !== "expired"), [subsExt]);
  const warnSubs = useMemo(() => subsExt.filter((s) => s.status === "warning"), [subsExt]);
  const expSubs = useMemo(() => subsExt.filter((s) => s.status === "expired"), [subsExt]);

  // ─── NOTIFICATIONS ───
  const notifications = useMemo(() => {
    const items = [];
    [...warnSubs, ...expSubs].forEach((sub) => {
      const st = studentMap[sub.studentId];
      const gr = groupMap[sub.groupId];
      if (!st) return;
      if (sub.status === "expired") {
        const hasNewer = subs.some((s) => s.id !== sub.id && s.studentId === sub.studentId && s.groupId === sub.groupId && getSubStatus(s) !== "expired");
        if (hasNewer) return;
      }
      const dl = daysLeft(sub.endDate);
      const tl = (sub.totalTrainings || 0) - (sub.usedTrainings || 0);
      const dir = gr ? dirMap[gr.directionId] : null;
      items.push({
        subId: sub.id, type: sub.status === "expired" ? "expired" : "warning",
        student: st, group: gr, direction: dir,
        message: sub.status === "expired" ? "Абонемент закінчився" : (dl <= 3 ? `${dl} дн. залишилось` : `${tl} трен. залишилось`),
        notified: sub.notificationSent
      });
    });
    return items;
  }, [warnSubs, expSubs, studentMap, groupMap, subs, dirMap]);

  // ─── ANALYTICS ───
  const analytics = useMemo(() => {
    const activeStudentIds = new Set(activeSubs.map((s) => s.studentId));
    const totalRev = subs.filter((s) => s.paid).reduce((a, s) => a + (s.amount || 0), 0);
    const unpaid = subs.filter((s) => !s.paid && getSubStatus(s) !== "expired").reduce((a, s) => a + (s.amount || 0), 0);
    const byDir = {};
    DIRECTIONS.forEach((d) => {
      const gids = groups.filter((g) => g.directionId === d.id).map((g) => g.id);
      const ds = activeSubs.filter((s) => gids.includes(s.groupId));
      byDir[d.id] = { students: new Set(ds.map((s) => s.studentId)).size, subs: ds.length };
    });
    // Revenue split (accounting for discounts)
    const splits = [];
    groups.forEach((g) => {
      const gSubs = subs.filter((s) => s.groupId === g.id && s.paid);
      const total = gSubs.reduce((a, s) => a + (s.amount || 0), 0);
      if (total > 0) {
        const tPct = g.trainerPct || 50;
        const sPct = 100 - tPct;
        // Calculate discount impact per source
        let trainerLoss = 0, studioLoss = 0;
        gSubs.forEach((s) => {
          if (s.discountPct > 0 && s.basePrice) {
            const discAmt = Math.round(s.basePrice * s.discountPct / 100);
            if (s.discountSource === "trainer") trainerLoss += discAmt;
            else if (s.discountSource === "studio") studioLoss += discAmt;
            else if (s.discountSource === "split") { trainerLoss += Math.round(discAmt / 2); studioLoss += Math.round(discAmt / 2); }
          }
        });
        const fullRevenue = gSubs.reduce((a, s) => a + (s.basePrice || s.amount || 0), 0);
        const trainerShare = Math.round(fullRevenue * tPct / 100) - trainerLoss;
        const studioShare = Math.round(fullRevenue * sPct / 100) - studioLoss;
        splits.push({ group: g, total, fullRevenue, trainer: Math.max(0, trainerShare), studio: Math.max(0, studioShare), trainerLoss, studioLoss });
      }
    });
    return { totalStudents: students.length, activeStudents: activeStudentIds.size, totalRev, unpaid, byDir, splits };
  }, [students, subs, activeSubs, groups]);

  // ─── MSG TEMPLATE ───
  function getNotifMsg(sub, student, group, direction) {
    const name = student?.name?.split(" ")[0] || "Шановна";
    const gName = group?.name || "групу";
    const dName = direction?.name || "";
    const template = student?.messageTemplate || student?.message_template;
    if (template) {
      return template
        .replace(/\{ім'я\}/g, name)
        .replace(/\{група\}/g, gName)
        .replace(/\{напрямок\}/g, dName);
    }
    return `Привіт, ${name}! 💃\nНагадуємо, що твій абонемент у групі ${gName} (${dName}) закінчився.\nЧекаємо на продовження! ❤️`;
  }

  // ═══ FORMS ═══
  function StudentForm({ initial, onDone }) {
    const [name, setName] = useState(initial?.name || "");
    const [phone, setPhone] = useState(initial?.phone || "");
    const [telegram, setTelegram] = useState(initial?.telegram || "");
    const [notes, setNotes] = useState(initial?.notes || "");
    const [msgTemplate, setMsgTemplate] = useState(initial?.message_template || initial?.messageTemplate || "");
    const [selGroups, setSelGroups] = useState(() => {
      if (!initial?.id) return [];
      return studentGrps.filter((sg) => sg.studentId === initial.id).map((sg) => sg.groupId);
    });

    const toggleGroup = (gid) => {
      setSelGroups((prev) => prev.includes(gid) ? prev.filter((g) => g !== gid) : [...prev, gid]);
    };

    const doSave = () => {
      if (!name.trim()) return;
      onDone({ name: name.trim(), phone, telegram, notes, message_template: msgTemplate, selectedGroups: selGroups });
    };
    return (<div>
      <Field label="Ім'я *"><input style={inputSt} value={name} onChange={(e) => setName(e.target.value)} placeholder="Олена Петренко" /></Field>
      <Field label="Телефон"><input style={inputSt} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+380..." /></Field>
      <Field label="Telegram"><input style={inputSt} value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="@username" /></Field>

      <Field label="Групи / напрямки">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {DIRECTIONS.map((d) => (
            <div key={d.id} style={{ width: "100%", marginBottom: 4 }}>
              <div style={{ fontSize: 11, color: d.color, fontWeight: 600, marginBottom: 2 }}>{d.name}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {groups.filter((g) => g.directionId === d.id).map((g) => (
                  <Pill key={g.id} active={selGroups.includes(g.id)} color={d.color} onClick={() => toggleGroup(g.id)}>{g.name}</Pill>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Field>

      <Field label="Шаблон повідомлення про закінчення абонементу">
        <textarea style={{ ...inputSt, minHeight: 60, resize: "vertical" }} value={msgTemplate}
          onChange={(e) => setMsgTemplate(e.target.value)}
          placeholder="Привіт, {ім'я}! 💃 Нагадуємо, що твій абонемент у групі {група} закінчився. Чекаємо на продовження! ❤️" />
        <div style={{ fontSize: 10, color: "#8892b0", marginTop: 2 }}>Використовуй {"{ім'я}"}, {"{група}"}, {"{напрямок}"} як змінні</div>
      </Field>

      <Field label="Нотатки"><textarea style={{ ...inputSt, minHeight: 40, resize: "vertical" }} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
        <button style={btnS} onClick={() => setModal(null)}>Скасувати</button>
        <button style={{ ...btnP, opacity: name.trim() ? 1 : .4 }} onClick={doSave}>{initial ? "Зберегти" : "Додати"}</button>
      </div>
    </div>);
  }

  function SubForm({ initial, onDone }) {
    const [studentId, setStudentId] = useState(initial?.studentId || "");
    const [groupId, setGroupId] = useState(initial?.groupId || "");
    const [planType, setPlanType] = useState(initial?.planType || "8pack");
    const [startDate, setStartDate] = useState(initial?.startDate || today());
    const [amount, setAmount] = useState(initial?.amount || 1500);
    const [paid, setPaid] = useState(initial?.paid ?? false);
    const [payMethod, setPayMethod] = useState(initial?.payMethod || "card");
    const [discountPct, setDiscountPct] = useState(initial?.discountPct || 0);
    const [discountSource, setDiscountSource] = useState(initial?.discountSource || "studio");
    const [notes, setNotes] = useState(initial?.notes || "");

    const plan = PLAN_TYPES.find((p) => p.id === planType);
    const totalTrainings = plan?.trainings || 8;
    const endDate = addMonth(startDate);
    const basePrice = plan?.price || 0;
    const discountAmount = Math.round(basePrice * discountPct / 100);
    const finalPrice = basePrice - discountAmount;

    useEffect(() => {
      if (!initial) {
        const p = PLAN_TYPES.find((p) => p.id === planType);
        if (p) setAmount(p.price - Math.round(p.price * discountPct / 100));
      }
    }, [planType, discountPct]);

    return (<div>
      <Field label="Учениця *">
        <select style={inputSt} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          <option value="">Обрати...</option>
          {students.sort((a, b) => a.name.localeCompare(b.name, "uk")).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <Field label="Група *">
        <select style={inputSt} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          <option value="">Обрати...</option>
          {DIRECTIONS.map((d) => <optgroup key={d.id} label={d.name}>
            {groups.filter((g) => g.directionId === d.id).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </optgroup>)}
        </select>
      </Field>
      <Field label="Тип">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PLAN_TYPES.map((p) => (
            <Pill key={p.id} active={planType === p.id} onClick={() => setPlanType(p.id)}>
              {p.name} ({p.trainings} трен.) — {p.price}₴
            </Pill>
          ))}
        </div>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Дата початку"><input style={inputSt} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
        <Field label="Закінчення (авто)"><input style={{ ...inputSt, opacity: .6 }} type="date" value={endDate} readOnly /></Field>
      </div>

      {/* DISCOUNT */}
      <div style={{ background: "#161b22", borderRadius: 8, padding: "12px 14px", marginBottom: 12, border: "1px solid #21262d" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Знижка (%)">
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input style={{ ...inputSt, width: 80 }} type="number" min={0} max={100} value={discountPct} onChange={(e) => setDiscountPct(Math.min(100, Math.max(0, +e.target.value)))} />
              <span style={{ color: "#8892b0", fontSize: 12 }}>%</span>
            </div>
          </Field>
          <Field label="За рахунок">
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <Pill active={discountSource === "studio"} onClick={() => setDiscountSource("studio")}>Студії</Pill>
              <Pill active={discountSource === "trainer"} onClick={() => setDiscountSource("trainer")}>Тренера</Pill>
              <Pill active={discountSource === "split"} onClick={() => setDiscountSource("split")}>50/50</Pill>
            </div>
          </Field>
        </div>
        {discountPct > 0 && (
          <div style={{ fontSize: 12, color: "#F9A03F", marginTop: 6 }}>
            Базова ціна: {basePrice}₴ → Знижка: -{discountAmount}₴ → <strong style={{ color: "#2ECC71" }}>До оплати: {finalPrice}₴</strong>
            <span style={{ color: "#8892b0", marginLeft: 8 }}>
              (за рахунок {discountSource === "studio" ? "студії" : discountSource === "trainer" ? "тренера" : "50/50"})
            </span>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Сума до оплати (грн)"><input style={inputSt} type="number" min={0} value={amount} onChange={(e) => setAmount(+e.target.value)} /></Field>
        <Field label="Оплата">
          <div style={{ display: "flex", gap: 6 }}>
            {PAY_METHODS.map((m) => <Pill key={m.id} active={payMethod === m.id} onClick={() => setPayMethod(m.id)}>{m.name}</Pill>)}
          </div>
        </Field>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#c9d1d9", cursor: "pointer", fontSize: 14, marginBottom: 8 }}>
        <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Оплачено
      </label>
      <Field label="Нотатки"><textarea style={{ ...inputSt, minHeight: 40, resize: "vertical" }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Додаткова інфо..." /></Field>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
        <button style={btnS} onClick={() => setModal(null)}>Скасувати</button>
        <button style={{ ...btnP, opacity: studentId && groupId ? 1 : .4 }}
          onClick={() => { if (!studentId || !groupId) return; onDone({ studentId, groupId, planType, startDate, endDate, totalTrainings, usedTrainings: initial?.usedTrainings || 0, amount, paid, payMethod, discountPct, discountSource, basePrice, notes, notificationSent: initial?.notificationSent || false }); }}>
          {initial ? "Зберегти" : "Додати"}
        </button>
      </div>
    </div>);
  }

  // ═══ MODIFICATION FORM ═══
  function ModifySubForm({ sub, onDone }) {
    const [action, setAction] = useState("changePlan");
    const [newPlan, setNewPlan] = useState(sub?.planType || "8pack");
    const [newAmount, setNewAmount] = useState(sub?.amount || 0);
    const [addTrainings, setAddTrainings] = useState(0);
    const [refundAmt, setRefundAmt] = useState(0);
    const [reason, setReason] = useState("");

    const plan = PLAN_TYPES.find((p) => p.id === newPlan);

    return (<div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        <Pill active={action === "changePlan"} onClick={() => setAction("changePlan")}>Змінити план</Pill>
        <Pill active={action === "addTrainings"} onClick={() => setAction("addTrainings")}>Додати тренування</Pill>
        <Pill active={action === "convertSingle"} onClick={() => setAction("convertSingle")}>Конвертувати в разові</Pill>
        <Pill active={action === "refund"} onClick={() => setAction("refund")}>Повернення</Pill>
      </div>

      {action === "changePlan" && (<div>
        <p style={{ color: "#8892b0", fontSize: 13, marginTop: 0 }}>Зараз: {PLAN_TYPES.find((p) => p.id === sub?.planType)?.name || "?"} · {sub?.totalTrainings} трен. · {sub?.amount}₴</p>
        <Field label="Новий план">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PLAN_TYPES.map((p) => <Pill key={p.id} active={newPlan === p.id} onClick={() => { setNewPlan(p.id); setNewAmount(p.price); }}>{p.name} — {p.price}₴</Pill>)}
          </div>
        </Field>
        <Field label="Нова сума"><input style={inputSt} type="number" value={newAmount} onChange={(e) => setNewAmount(+e.target.value)} /></Field>
      </div>)}

      {action === "addTrainings" && (<div>
        <p style={{ color: "#8892b0", fontSize: 13, marginTop: 0 }}>Зараз: {sub?.usedTrainings}/{sub?.totalTrainings} трен.</p>
        <Field label="Додати тренувань"><input style={inputSt} type="number" min={1} value={addTrainings} onChange={(e) => setAddTrainings(+e.target.value)} /></Field>
        <Field label="Доплата (грн)"><input style={inputSt} type="number" min={0} value={newAmount} onChange={(e) => setNewAmount(+e.target.value)} /></Field>
      </div>)}

      {action === "convertSingle" && (<div>
        <p style={{ color: "#8892b0", fontSize: 13, marginTop: 0 }}>Відходили {sub?.usedTrainings} з {sub?.totalTrainings}. Конвертуємо в {sub?.usedTrainings} разових по 300₴.</p>
        <p style={{ color: "#F9A03F", fontSize: 13 }}>Разом: {(sub?.usedTrainings || 0) * 300}₴. Різниця для повернення: {(sub?.amount || 0) - (sub?.usedTrainings || 0) * 300}₴</p>
      </div>)}

      {action === "refund" && (<div>
        <Field label="Сума повернення (грн)"><input style={inputSt} type="number" min={0} value={refundAmt} onChange={(e) => setRefundAmt(+e.target.value)} /></Field>
      </div>)}

      <Field label="Причина/коментар"><textarea style={{ ...inputSt, minHeight: 40, resize: "vertical" }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Причина зміни..." /></Field>

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
        <button style={btnS} onClick={() => setModal(null)}>Скасувати</button>
        <button style={btnP} onClick={() => {
          const log = { id: uid(), subId: sub.id, date: today(), action, reason };
          let updated = { ...sub };
          if (action === "changePlan") {
            const pl = PLAN_TYPES.find((p) => p.id === newPlan);
            updated.planType = newPlan;
            updated.totalTrainings = pl?.trainings || updated.totalTrainings;
            updated.amount = newAmount;
            log.details = `Змінено на ${pl?.name}, ${newAmount}₴`;
          } else if (action === "addTrainings") {
            updated.totalTrainings = (updated.totalTrainings || 0) + addTrainings;
            updated.amount = (updated.amount || 0) + newAmount;
            log.details = `+${addTrainings} трен., доплата ${newAmount}₴`;
          } else if (action === "convertSingle") {
            const singleCost = (updated.usedTrainings || 0) * 300;
            updated.totalTrainings = updated.usedTrainings || 0;
            updated.amount = singleCost;
            updated.planType = "single";
            log.details = `Конвертовано в ${updated.usedTrainings} разових, повернення ${(sub.amount || 0) - singleCost}₴`;
          } else if (action === "refund") {
            updated.amount = Math.max(0, (updated.amount || 0) - refundAmt);
            updated.totalTrainings = updated.usedTrainings || 0;
            log.details = `Повернення ${refundAmt}₴`;
          }
          onDone(updated, log);
        }}>Застосувати</button>
      </div>
    </div>);
  }

  // ═══ GROUP SETTINGS FORM ═══
  function GroupSettingsForm({ group, onDone }) {
    const [schedule, setSchedule] = useState(group?.schedule || []);
    const [trainerPct, setTrainerPct] = useState(group?.trainerPct ?? 50);
    const [name, setName] = useState(group?.name || "");

    const toggleDay = (day) => {
      const exists = schedule.find((s) => s.day === day);
      if (exists) setSchedule(schedule.filter((s) => s.day !== day));
      else setSchedule([...schedule, { day, time: "18:00" }]);
    };
    const setTime = (day, time) => {
      setSchedule(schedule.map((s) => s.day === day ? { ...s, time } : s));
    };

    return (<div>
      <Field label="Назва групи"><input style={inputSt} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Розклад">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {[1, 2, 3, 4, 5, 6, 0].map((day) => {
            const active = schedule.find((s) => s.day === day);
            return (
              <div key={day} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button onClick={() => toggleDay(day)} style={{
                  width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit",
                  background: active ? "#E84855" : "#21262d", color: active ? "#fff" : "#8892b0", fontWeight: 600, fontSize: 12
                }}>{WEEKDAYS[day]}</button>
                <span style={{ color: "#8892b0", fontSize: 13, width: 80 }}>{WEEKDAYS_FULL[day]}</span>
                {active && <input type="time" style={{ ...inputSt, width: 120 }} value={active.time} onChange={(e) => setTime(day, e.target.value)} />}
              </div>
            );
          })}
        </div>
      </Field>
      <Field label={`% тренера: ${trainerPct}% / студія: ${100 - trainerPct}%`}>
        <input type="range" min={0} max={100} step={5} value={trainerPct} onChange={(e) => setTrainerPct(+e.target.value)}
          style={{ width: "100%", accentColor: "#E84855" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#8892b0" }}>
          <span>Тренер {trainerPct}%</span>
          <span>Студія {100 - trainerPct}%</span>
        </div>
      </Field>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
        <button style={btnS} onClick={() => setModal(null)}>Скасувати</button>
        <button style={btnP} onClick={() => onDone({ ...group, name, schedule, trainerPct })}>Зберегти</button>
      </div>
    </div>);
  }

  // ═══ CANCEL TRAINING FORM ═══
  function CancelTrainingForm() {
    const [groupId, setGroupId] = useState(groups[0]?.id || "");
    const [date, setDate] = useState(today());
    const [reason, setReason] = useState("");

    return (<div>
      <Field label="Група">
        <select style={inputSt} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </Field>
      <Field label="Дата відміненого заняття"><input style={inputSt} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="Причина"><textarea style={{ ...inputSt, minHeight: 40, resize: "vertical" }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Причина відміни..." /></Field>
      <div style={{ background: "#F9A03F15", border: "1px solid #F9A03F33", borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
        <p style={{ margin: 0, fontSize: 13, color: "#F9A03F" }}>⚠️ Усі активні абонементи в цій групі будуть продовжені на 1 тренування</p>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button style={btnS} onClick={() => setModal(null)}>Скасувати</button>
        <button style={btnP} onClick={async () => {
          try {
            const c = await db.insertCancelled({ groupId, date, reason });
            setCancelled((prev) => [...prev, c]);
            // extend all active subs in this group
            const toUpdate = subs.filter((s) => s.groupId === groupId && getSubStatus(s) !== "expired");
            const gr = groups.find((g) => g.id === groupId);
            for (const s of toUpdate) {
              const newEnd = new Date(s.endDate + "T12:00:00");
              let newEndDate = null;
              if (gr?.schedule?.length) {
                for (let i = 1; i <= 14; i++) {
                  const d = new Date(newEnd);
                  d.setDate(d.getDate() + i);
                  if (gr.schedule.some((sc) => sc.day === d.getDay())) {
                    newEndDate = toISO(d);
                    break;
                  }
                }
              }
              if (!newEndDate) { newEnd.setDate(newEnd.getDate() + 2); newEndDate = toISO(newEnd); }
              await db.updateSub(s.id, { endDate: newEndDate });
            }
            setSubs((prev) => prev.map((s) => {
              if (s.groupId === groupId && getSubStatus(s) !== "expired") {
                const newEnd = new Date(s.endDate + "T12:00:00");
                if (gr?.schedule?.length) {
                  for (let i = 1; i <= 14; i++) {
                    const d = new Date(newEnd);
                    d.setDate(d.getDate() + i);
                    if (gr.schedule.some((sc) => sc.day === d.getDay())) return { ...s, endDate: toISO(d) };
                  }
                }
                newEnd.setDate(newEnd.getDate() + 2);
                return { ...s, endDate: toISO(newEnd) };
              }
              return s;
            }));
          } catch(e) { alert("Помилка: " + e.message); }
          setModal(null);
        }}>Підтвердити відміну</button>
      </div>
    </div>);
  }

  // ═══ HANDLERS ═══
  const addStudent = async (d) => {
    try {
      const { selectedGroups, ...studentData } = d;
      const s = await db.insertStudent(studentData);
      setStudents((p) => [...p, s]);
      // Add group associations
      if (selectedGroups?.length) {
        for (const gid of selectedGroups) {
          const sg = await db.addStudentGroup(s.id, gid);
          setStudentGrps((p) => [...p, sg]);
        }
      }
    } catch(e) { alert("Помилка: " + e.message); }
    setModal(null);
  };
  const editStudent = async (d) => {
    try {
      const { selectedGroups, ...studentData } = d;
      const s = await db.updateStudent(editItem.id, studentData);
      setStudents((p) => p.map((x) => x.id === s.id ? s : x));
      // Sync group associations
      if (selectedGroups) {
        const existing = studentGrps.filter((sg) => sg.studentId === editItem.id);
        // Remove groups no longer selected
        for (const sg of existing) {
          if (!selectedGroups.includes(sg.groupId)) {
            await db.removeStudentGroup(sg.id);
          }
        }
        // Add new groups
        const existingGids = existing.map((sg) => sg.groupId);
        for (const gid of selectedGroups) {
          if (!existingGids.includes(gid)) {
            await db.addStudentGroup(editItem.id, gid);
          }
        }
        // Refresh
        const freshSG = await db.fetchStudentGroups();
        setStudentGrps(freshSG);
      }
    } catch(e) { alert("Помилка: " + e.message); }
    setModal(null); setEditItem(null);
  };
  const deleteStudent = async (id) => {
    if (!confirm("Видалити?")) return;
    try { await db.deleteStudent(id); setStudents((p) => p.filter((s) => s.id !== id)); setSubs((p) => p.filter((s) => s.studentId !== id)); } catch(e) { alert("Помилка: " + e.message); }
  };
  const addSub = async (d) => {
    try { const s = await db.insertSub(d); setSubs((p) => [s, ...p]); } catch(e) { alert("Помилка: " + e.message); }
    setModal(null);
  };
  const editSub = async (d) => {
    try { const s = await db.updateSub(editItem.id, d); setSubs((p) => p.map((x) => x.id === s.id ? s : x)); } catch(e) { alert("Помилка: " + e.message); }
    setModal(null); setEditItem(null);
  };
  const deleteSub = async (id) => {
    if (!confirm("Видалити?")) return;
    try { await db.deleteSub(id); setSubs((p) => p.filter((s) => s.id !== id)); setAttn((p) => p.filter((a) => a.subId !== id)); } catch(e) { alert("Помилка: " + e.message); }
  };
  const modifySub = async (updated, log) => {
    try {
      const s = await db.updateSub(updated.id, updated);
      setSubs((p) => p.map((x) => x.id === s.id ? s : x));
      await db.insertModLog(log);
      setModLog((p) => [log, ...p]);
    } catch(e) { alert("Помилка: " + e.message); }
    setModal(null); setEditItem(null);
  };
  const markNotified = async (subId) => {
    try { await db.updateSub(subId, { notificationSent: true }); setSubs((p) => p.map((s) => s.id === subId ? { ...s, notificationSent: true } : s)); } catch(e) { console.error(e); }
  };
  const saveGroup = async (g) => {
    try { const updated = await db.updateGroup(g.id, g); setGroups((p) => p.map((x) => x.id === updated.id ? updated : x)); } catch(e) { alert("Помилка: " + e.message); }
    setModal(null); setEditItem(null);
  };

  // ═══ ATTENDANCE PANEL ═══
  function AttendancePanel() {
    const [gid, setGid] = useState(groups[0]?.id || "");
    const [date, setDate] = useState(today());
    const [manualName, setManualName] = useState("");
    const [manualType, setManualType] = useState("trial");
    const groupSubs = activeSubs.filter((s) => s.groupId === gid);
    const isCancelled = cancelled.some((c) => c.groupId === gid && c.date === date);
    const studs = groupSubs.map((sub) => ({
      sub, student: studentMap[sub.studentId],
      attended: attn.some((a) => a.subId === sub.id && a.date === date)
    })).filter((x) => x.student);

    // Manual/guest attendance entries
    const guestAttn = attn.filter((a) => a.guestName && a.groupId === gid && a.date === date);

    const toggle = async (sub, att) => {
      try {
        if (att) {
          await db.deleteAttendanceBySubAndDate(sub.id, date);
          await db.decrementUsed(sub.id);
          setAttn((p) => p.filter((a) => !(a.subId === sub.id && a.date === date)));
          setSubs((p) => p.map((s) => s.id === sub.id ? { ...s, usedTrainings: Math.max(0, (s.usedTrainings || 0) - 1) } : s));
        } else {
          const a = await db.insertAttendance({ subId: sub.id, date });
          await db.incrementUsed(sub.id);
          setAttn((p) => [...p, a]);
          setSubs((p) => p.map((s) => s.id === sub.id ? { ...s, usedTrainings: (s.usedTrainings || 0) + 1 } : s));
        }
      } catch(e) { console.error(e); }
    };

    const addManual = async () => {
      if (!manualName.trim()) return;
      try {
        const a = await db.insertAttendance({ guestName: manualName.trim(), guestType: manualType, groupId: gid, date });
        setAttn((p) => [...p, a]);
      } catch(e) { console.error(e); }
      setManualName("");
    };

    const removeGuest = async (id) => {
      try { await db.deleteAttendance(id); setAttn((p) => p.filter((a) => a.id !== id)); } catch(e) { console.error(e); }
    };

    return (<div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select style={{ ...inputSt, width: "auto", minWidth: 200 }} value={gid} onChange={(e) => setGid(e.target.value)}>
          {DIRECTIONS.map((d) => <optgroup key={d.id} label={d.name}>
            {groups.filter((g) => g.directionId === d.id).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </optgroup>)}
        </select>
        <input style={{ ...inputSt, width: "auto" }} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {isCancelled && (
        <div style={{ background: "#E8485515", border: "1px solid #E8485533", borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
          <p style={{ margin: 0, fontSize: 13, color: "#E84855" }}>❌ Заняття відмінено в цей день</p>
        </div>
      )}

      {/* List of subscribed students */}
      {studs.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "#8892b0", marginBottom: 6, textTransform: "uppercase", letterSpacing: .8 }}>З абонементом ({studs.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {studs.map(({ sub, student, attended }) => (
              <div key={sub.id} onClick={() => !isCancelled && toggle(sub, attended)} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px",
                background: attended ? "rgba(46,204,113,.1)" : "#0d1117", border: `1px solid ${attended ? "rgba(46,204,113,.25)" : "#21262d"}`,
                borderRadius: 8, cursor: isCancelled ? "default" : "pointer", opacity: isCancelled ? .5 : 1, transition: "all .15s"
              }}>
                <div>
                  <div style={{ color: "#e6edf3", fontWeight: 500, fontSize: 14 }}>{student.name}</div>
                  <div style={{ color: "#8892b0", fontSize: 11, marginTop: 2 }}>{sub.usedTrainings}/{sub.totalTrainings} · до {fmt(sub.endDate)}</div>
                </div>
                <div style={{
                  width: 28, height: 28, borderRadius: 6, background: attended ? "#2ECC71" : "#21262d",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#fff"
                }}>{attended ? "✓" : ""}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {studs.length === 0 && guestAttn.length === 0 && (
        <div style={{ color: "#8892b0", padding: 20, textAlign: "center", marginBottom: 16 }}>Немає активних абонементів в цій групі</div>
      )}

      {/* Guest/manual entries */}
      {guestAttn.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: "#8892b0", marginBottom: 6, textTransform: "uppercase", letterSpacing: .8 }}>Ручний запис ({guestAttn.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {guestAttn.map((g) => (
              <div key={g.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px",
                background: "rgba(52,152,219,.08)", border: "1px solid rgba(52,152,219,.2)", borderRadius: 8
              }}>
                <div>
                  <span style={{ color: "#e6edf3", fontWeight: 500, fontSize: 14 }}>{g.guestName}</span>
                  <Badge color="#3498DB">{g.type === "trial" ? "Пробне" : g.type === "single" ? "Разове" : g.type}</Badge>
                </div>
                <button onClick={() => removeGuest(g.id)} style={{ ...btnS, padding: "4px 8px", fontSize: 11, color: "#E84855" }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual entry form */}
      <div style={{ background: "#161b22", borderRadius: 8, padding: "14px 16px", border: "1px solid #21262d" }}>
        <div style={{ fontSize: 12, color: "#8892b0", marginBottom: 8, textTransform: "uppercase", letterSpacing: .8 }}>+ Додати вручну</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <input style={inputSt} value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Ім'я"
              onKeyDown={(e) => e.key === "Enter" && addManual()} />
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <Pill active={manualType === "trial"} onClick={() => setManualType("trial")}>Пробне</Pill>
            <Pill active={manualType === "single"} onClick={() => setManualType("single")}>Разове</Pill>
            <Pill active={manualType === "other"} onClick={() => setManualType("other")}>Інше</Pill>
          </div>
          <button style={{ ...btnP, padding: "10px 16px" }} onClick={addManual}>+</button>
        </div>
      </div>

      {/* Summary */}
      {(studs.filter((s) => s.attended).length > 0 || guestAttn.length > 0) && (
        <div style={{ marginTop: 14, padding: "10px 14px", background: "#0d1117", borderRadius: 8, border: "1px solid #21262d" }}>
          <span style={{ color: "#8892b0", fontSize: 12 }}>Всього на занятті: </span>
          <span style={{ color: "#2ECC71", fontWeight: 600 }}>
            {studs.filter((s) => s.attended).length + guestAttn.length} осіб
          </span>
          <span style={{ color: "#8892b0", fontSize: 12 }}> (з абонем. {studs.filter((s) => s.attended).length}, вручну {guestAttn.length})</span>
        </div>
      )}
    </div>);
  }

  // ═══ CALENDAR VIEW ═══
  function CalendarView() {
    const [gid, setGid] = useState(groups[0]?.id || "");
    const gr = groupMap[gid];
    const dates = gr ? getMonthDates(calMonth.y, calMonth.m, gr.schedule || []) : [];
    const monthName = new Date(calMonth.y, calMonth.m).toLocaleDateString("uk-UA", { month: "long", year: "numeric" });
    const cancelledDates = cancelled.filter((c) => c.groupId === gid).map((c) => c.date);

    return (<div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <select style={{ ...inputSt, width: "auto", minWidth: 200 }} value={gid} onChange={(e) => setGid(e.target.value)}>
          {DIRECTIONS.map((d) => <optgroup key={d.id} label={d.name}>
            {groups.filter((g) => g.directionId === d.id).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </optgroup>)}
        </select>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button style={btnS} onClick={() => setCalMonth((p) => { let m = p.m - 1, y = p.y; if (m < 0) { m = 11; y--; } return { y, m }; })}>←</button>
          <span style={{ color: "#fff", fontWeight: 600, minWidth: 140, textAlign: "center", textTransform: "capitalize" }}>{monthName}</span>
          <button style={btnS} onClick={() => setCalMonth((p) => { let m = p.m + 1, y = p.y; if (m > 11) { m = 0; y++; } return { y, m }; })}>→</button>
        </div>
      </div>
      {gr && (
        <div style={{ marginBottom: 12, color: "#8892b0", fontSize: 13 }}>
          Розклад: {(gr.schedule || []).map((s) => `${WEEKDAYS[s.day]} ${s.time}`).join(", ")} · Тренер {gr.trainerPct || 50}% / Студія {100 - (gr.trainerPct || 50)}%
          <button style={{ ...btnS, padding: "4px 10px", fontSize: 11, marginLeft: 8 }} onClick={() => { setEditItem(gr); setModal("editGroup"); }}>⚙️ Налаштування</button>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8 }}>
        {dates.map((d) => {
          const isCan = cancelledDates.includes(d.date);
          const isPast = d.date < today();
          const isToday = d.date === today();
          const dayAttn = attn.filter((a) => a.date === d.date && activeSubs.some((s) => s.id === a.subId && s.groupId === gid));
          return (
            <div key={d.date} style={{
              ...cardSt, padding: "10px 12px", textAlign: "center",
              border: isToday ? "2px solid #E84855" : "1px solid #21262d",
              opacity: isCan ? .5 : isPast ? .7 : 1,
              background: isCan ? "#E8485510" : "#161b22"
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: isCan ? "#E84855" : "#fff" }}>
                {new Date(d.date + "T12:00:00").getDate()}
              </div>
              <div style={{ fontSize: 10, color: "#8892b0" }}>{WEEKDAYS[d.day]} · {d.time}</div>
              {isCan && <div style={{ fontSize: 9, color: "#E84855", marginTop: 2 }}>ВІДМІНЕНО</div>}
              {!isCan && dayAttn.length > 0 && <div style={{ fontSize: 10, color: "#2ECC71", marginTop: 2 }}>👥 {dayAttn.length}</div>}
            </div>
          );
        })}
      </div>
      {dates.length === 0 && <div style={{ color: "#8892b0", padding: 40, textAlign: "center" }}>Розклад не налаштовано для цієї групи</div>}
    </div>);
  }

  // ═══ FILTERED ═══
  const filteredSubs = useMemo(() => {
    let r = subsExt;
    if (filterDir !== "all") { const gids = groups.filter((g) => g.directionId === filterDir).map((g) => g.id); r = r.filter((s) => gids.includes(s.groupId)); }
    if (filterGroup !== "all") r = r.filter((s) => s.groupId === filterGroup);
    if (filterStatus !== "all") r = r.filter((s) => s.status === filterStatus);
    if (searchQ) { const q = searchQ.toLowerCase(); r = r.filter((s) => studentMap[s.studentId]?.name?.toLowerCase().includes(q)); }
    return r.sort((a, b) => ({ warning: 0, active: 1, expired: 2 }[a.status] ?? 3) - ({ warning: 0, active: 1, expired: 2 }[b.status] ?? 3));
  }, [subsExt, filterDir, filterGroup, filterStatus, searchQ, groups, studentMap]);

  const filteredStudents = useMemo(() => {
    let r = students;
    if (searchQ) { const q = searchQ.toLowerCase(); r = r.filter((s) => s.name.toLowerCase().includes(q) || s.phone?.includes(q) || s.telegram?.toLowerCase().includes(q)); }
    return r.sort((a, b) => a.name.localeCompare(b.name, "uk"));
  }, [students, searchQ]);

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0d1117", color: "#8892b0", fontFamily: "DM Sans, sans-serif" }}>Завантаження...</div>;

  const TABS = [
    { id: "dashboard", icon: "📊", label: "Дашборд" },
    { id: "students", icon: "👩‍🎤", label: "Учениці" },
    { id: "subs", icon: "🎫", label: "Абонементи" },
    { id: "attendance", icon: "✅", label: "Відвідування" },
    { id: "calendar", icon: "📅", label: "Графік" },
    { id: "alerts", icon: notifications.filter((n) => !n.notified).length ? "🔴" : "🔔", label: `Сповіщення` },
    { id: "finance", icon: "💰", label: "Фінанси" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#0d1117", color: "#c9d1d9", fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* HEADER */}
      <header style={{ background: "linear-gradient(135deg, #1a1a2e, #16213e)", borderBottom: "1px solid #21262d", padding: "14px 20px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#fff" }}>💃 Dance Studio</h1>
            <p style={{ margin: 0, fontSize: 11, color: "#8892b0" }}>Абонементи · Відвідуваність · Аналітика · Фінанси</p>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button style={{ ...btnP, fontSize: 12, padding: "8px 14px" }} onClick={() => setModal("addStudent")}>+ Учениця</button>
            <button style={{ ...btnP, fontSize: 12, padding: "8px 14px", background: "#7B2D8E" }} onClick={() => setModal("addSub")}>+ Абонемент</button>
            <button style={{ ...btnS, fontSize: 12, padding: "8px 14px" }} onClick={() => setModal("cancelTraining")}>❌ Відміна</button>
          </div>
        </div>
      </header>

      {/* TABS */}
      <nav style={{ background: "#161b22", borderBottom: "1px solid #21262d", overflowX: "auto" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", padding: "0 16px" }}>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => { setTab(t.id); setSearchQ(""); }}
              style={{
                padding: "10px 14px", background: "none", border: "none", borderBottom: tab === t.id ? "2px solid #E84855" : "2px solid transparent",
                color: tab === t.id ? "#fff" : "#8892b0", fontSize: 12, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit"
              }}>{t.icon} {t.label}</button>
          ))}
        </div>
      </nav>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 20 }}>

        {/* ══════ DASHBOARD ══════ */}
        {tab === "dashboard" && (<div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
            {[
              { l: "Учениць", v: analytics.totalStudents, s: `${analytics.activeStudents} активних`, c: "#3498DB" },
              { l: "Абонементів", v: activeSubs.length, s: `${warnSubs.length} закінчуються`, c: "#2ECC71" },
              { l: "Дохід", v: `${analytics.totalRev.toLocaleString()}₴`, s: `${analytics.unpaid.toLocaleString()}₴ неоплач.`, c: "#F9A03F" },
              { l: "Сповіщення", v: notifications.filter((n) => !n.notified).length, s: "непрочитаних", c: "#E84855" },
            ].map((c, i) => (
              <div key={i} style={{ ...cardSt, borderLeft: `3px solid ${c.c}` }}>
                <div style={{ fontSize: 10, color: "#8892b0", textTransform: "uppercase", letterSpacing: .8 }}>{c.l}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", margin: "2px 0" }}>{c.v}</div>
                <div style={{ fontSize: 11, color: "#8892b0" }}>{c.s}</div>
              </div>
            ))}
          </div>
          <h3 style={{ color: "#fff", fontSize: 15, marginBottom: 10 }}>По напрямках</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 24 }}>
            {DIRECTIONS.map((d) => {
              const data = analytics.byDir[d.id] || { students: 0 };
              return (<div key={d.id} style={{ ...cardSt, borderTop: `3px solid ${d.color}` }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: d.color }}>{d.name}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>{data.students}</div>
                <div style={{ fontSize: 10, color: "#8892b0" }}>учениць</div>
              </div>);
            })}
          </div>
          {notifications.filter((n) => !n.notified).length > 0 && (<div>
            <h3 style={{ color: "#fff", fontSize: 15, marginBottom: 10 }}>⚠️ Потребують уваги</h3>
            {notifications.filter((n) => !n.notified).slice(0, 5).map((n) => (
              <div key={n.subId} style={{ ...cardSt, marginBottom: 6, borderLeft: `3px solid ${n.type === "expired" ? "#E84855" : "#F9A03F"}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><span style={{ color: "#fff", fontWeight: 500 }}>{n.student.name}</span> <span style={{ color: "#8892b0", fontSize: 12 }}>· {n.group?.name}</span></div>
                <Badge color={STATUS_COLORS[n.type === "expired" ? "expired" : "warning"]}>{n.message}</Badge>
              </div>
            ))}
          </div>)}
          {students.length === 0 && (
            <div style={{ textAlign: "center", padding: 50, color: "#8892b0" }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>💃</div>
              <p>Почни з додавання учениць та абонементів</p>
              <button style={btnP} onClick={() => setModal("addStudent")}>+ Додати ученицю</button>
            </div>
          )}
        </div>)}

        {/* ══════ STUDENTS ══════ */}
        {tab === "students" && (<div>
          <input style={{ ...inputSt, maxWidth: 350, marginBottom: 14 }} placeholder="Пошук..." value={searchQ} onChange={(e) => setSearchQ(e.target.value)} />
          {filteredStudents.length === 0 ? <div style={{ color: "#8892b0", padding: 40, textAlign: "center" }}>{students.length === 0 ? "Ще немає учениць" : "Не знайдено"}</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {filteredStudents.map((st) => {
                const stSubs = subsExt.filter((s) => s.studentId === st.id);
                const active = stSubs.filter((s) => s.status !== "expired");
                const enrolledGroups = studentGrps.filter((sg) => sg.studentId === st.id);
                return (
                  <div key={st.id} style={{ ...cardSt, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                    <div style={{ minWidth: 180 }}>
                      <div style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>{st.name}</div>
                      <div style={{ color: "#8892b0", fontSize: 11 }}>{[st.phone, st.telegram].filter(Boolean).join(" · ") || "—"}</div>
                      {enrolledGroups.length > 0 && (
                        <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 3 }}>
                          {enrolledGroups.map((sg) => { const g = groupMap[sg.groupId]; const d = g ? dirMap[g.directionId] : null; return g ? <span key={sg.id} style={{ fontSize: 9, color: d?.color || "#888", opacity: .7 }}>{g.name}</span> : null; }).filter(Boolean).reduce((prev, curr, i) => i === 0 ? [curr] : [...prev, <span key={`sep-${i}`} style={{ fontSize: 9, color: "#555" }}>·</span>, curr], [])}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {active.map((s) => { const g = groupMap[s.groupId]; const d = g ? dirMap[g.directionId] : null; return <Badge key={s.id} color={d?.color || "#888"}>{g?.name} ({s.usedTrainings}/{s.totalTrainings})</Badge>; })}
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button style={{ ...btnS, padding: "5px 10px", fontSize: 11 }} onClick={() => { setEditItem(st); setModal("editStudent"); }}>✏️</button>
                      <button style={{ ...btnS, padding: "5px 10px", fontSize: 11, color: "#E84855" }} onClick={() => deleteStudent(st.id)}>🗑</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>)}

        {/* ══════ SUBSCRIPTIONS ══════ */}
        {tab === "subs" && (<div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            <input style={{ ...inputSt, width: "auto", minWidth: 180 }} placeholder="Пошук..." value={searchQ} onChange={(e) => setSearchQ(e.target.value)} />
            <select style={{ ...inputSt, width: "auto" }} value={filterDir} onChange={(e) => { setFilterDir(e.target.value); setFilterGroup("all"); }}>
              <option value="all">Всі напрямки</option>
              {DIRECTIONS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select style={{ ...inputSt, width: "auto" }} value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)}>
              <option value="all">Всі групи</option>
              {(filterDir === "all" ? groups : groups.filter((g) => g.directionId === filterDir)).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <select style={{ ...inputSt, width: "auto" }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="all">Всі</option>
              <option value="active">Активні</option>
              <option value="warning">Закінчуються</option>
              <option value="expired">Протерміновані</option>
            </select>
          </div>
          <div style={{ fontSize: 11, color: "#8892b0", marginBottom: 10 }}>Знайдено: {filteredSubs.length}</div>
          {filteredSubs.length === 0 ? <div style={{ color: "#8892b0", padding: 40, textAlign: "center" }}>{subs.length === 0 ? "Ще немає абонементів" : "Не знайдено"}</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {filteredSubs.map((sub) => {
                const st = studentMap[sub.studentId];
                const gr = groupMap[sub.groupId];
                const dir = gr ? dirMap[gr.directionId] : null;
                const tl = (sub.totalTrainings || 0) - (sub.usedTrainings || 0);
                const pct = sub.totalTrainings > 0 ? (sub.usedTrainings / sub.totalTrainings * 100) : 0;
                const planLabel = PLAN_TYPES.find((p) => p.id === sub.planType)?.name || sub.planType;
                return (
                  <div key={sub.id} style={{ ...cardSt, borderLeft: `3px solid ${STATUS_COLORS[sub.status]}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 6 }}>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>{st?.name || "?"}</span>
                          <Badge color={dir?.color || "#888"}>{gr?.name}</Badge>
                          <Badge color={STATUS_COLORS[sub.status]}>{STATUS_LABELS[sub.status]}</Badge>
                          {!sub.paid && <Badge color="#E84855">💰 Не оплач.</Badge>}
                          {sub.notificationSent && <Badge color="#8892b0">📩 Оповіщено</Badge>}
                          {sub.discountPct > 0 && <Badge color="#3498DB">-{sub.discountPct}% {sub.discountSource === "studio" ? "(студія)" : sub.discountSource === "trainer" ? "(тренер)" : "(50/50)"}</Badge>}
                        </div>
                        <div style={{ color: "#8892b0", fontSize: 11, marginTop: 4 }}>
                          {planLabel} · {fmt(sub.startDate)} — {fmt(sub.endDate)} · {sub.usedTrainings}/{sub.totalTrainings} трен. · {tl} зал. · {sub.amount}₴ {sub.payMethod === "cash" ? "💵" : "💳"}
                          {sub.discountPct > 0 && sub.basePrice ? ` (база ${sub.basePrice}₴)` : ""}
                        </div>
                        <div style={{ marginTop: 4, height: 3, background: "#21262d", borderRadius: 2, overflow: "hidden", maxWidth: 180 }}>
                          <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: STATUS_COLORS[sub.status], borderRadius: 2 }} />
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button style={{ ...btnS, padding: "5px 10px", fontSize: 11 }} onClick={() => { setEditItem(sub); setModal("modifySub"); }} title="Змінити">🔧</button>
                        <button style={{ ...btnS, padding: "5px 10px", fontSize: 11 }} onClick={() => { setEditItem(sub); setModal("editSub"); }} title="Редагувати">✏️</button>
                        <button style={{ ...btnS, padding: "5px 10px", fontSize: 11, color: "#E84855" }} onClick={() => deleteSub(sub.id)} title="Видалити">🗑</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>)}

        {/* ══════ ATTENDANCE ══════ */}
        {tab === "attendance" && <AttendancePanel />}

        {/* ══════ CALENDAR ══════ */}
        {tab === "calendar" && <CalendarView />}

        {/* ══════ NOTIFICATIONS ══════ */}
        {tab === "alerts" && (<div>
          {notifications.length === 0 ? (
            <div style={{ textAlign: "center", padding: 50, color: "#8892b0" }}><div style={{ fontSize: 40, marginBottom: 8 }}>✨</div><p>Все добре!</p></div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {notifications.map((n) => {
                const msg = getNotifMsg(n.subId ? subs.find((s) => s.id === n.subId) : null, n.student, n.group, n.direction);
                const tgUser = n.student?.telegram?.replace("@", "");
                const tgLink = tgUser ? `https://t.me/${tgUser}?text=${encodeURIComponent(msg)}` : null;
                return (
                  <div key={n.subId} style={{
                    ...cardSt, borderLeft: `3px solid ${n.type === "expired" ? "#E84855" : "#F9A03F"}`,
                    opacity: n.notified ? .6 : 1
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ color: "#fff", fontWeight: 600 }}>{n.student?.name}</span>
                          <Badge color={n.type === "expired" ? "#E84855" : "#F9A03F"}>{n.message}</Badge>
                          {n.notified && <Badge color="#8892b0">✅ Оповіщено</Badge>}
                        </div>
                        <div style={{ color: "#8892b0", fontSize: 12, marginTop: 2 }}>{n.group?.name}</div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {n.student?.phone && (
                          <a href={`tel:${n.student.phone}`} style={{ ...btnS, padding: "6px 12px", fontSize: 11, textDecoration: "none", display: "inline-block" }}>📞</a>
                        )}
                        {tgLink && (
                          <a href={tgLink} target="_blank" rel="noopener noreferrer" onClick={() => markNotified(n.subId)}
                            style={{ padding: "6px 12px", borderRadius: 8, background: "#229ED922", color: "#229ED9", fontSize: 11, textDecoration: "none", border: "1px solid #229ED944", cursor: "pointer" }}>
                            💬 Написати в Telegram
                          </a>
                        )}
                        {!n.notified && (
                          <button style={{ ...btnS, padding: "6px 12px", fontSize: 11 }} onClick={() => markNotified(n.subId)}>
                            Позначити оповіщеним
                          </button>
                        )}
                      </div>
                    </div>
                    <div style={{ marginTop: 8, padding: "8px 12px", background: "#0d1117", borderRadius: 6, fontSize: 12, color: "#c9d1d9", whiteSpace: "pre-wrap" }}>
                      {msg}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>)}

        {/* ══════ FINANCE ══════ */}
        {tab === "finance" && (<div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
            <div style={{ ...cardSt, borderLeft: "3px solid #2ECC71" }}>
              <div style={{ fontSize: 10, color: "#8892b0", textTransform: "uppercase" }}>Загальний дохід</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#2ECC71" }}>{analytics.totalRev.toLocaleString()}₴</div>
            </div>
            <div style={{ ...cardSt, borderLeft: "3px solid #E84855" }}>
              <div style={{ fontSize: 10, color: "#8892b0", textTransform: "uppercase" }}>Неоплачено</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#E84855" }}>{analytics.unpaid.toLocaleString()}₴</div>
            </div>
            <div style={{ ...cardSt, borderLeft: "3px solid #F9A03F" }}>
              <div style={{ fontSize: 10, color: "#8892b0", textTransform: "uppercase" }}>Карта / Готівка</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>
                💳 {subs.filter((s) => s.paid && s.payMethod === "card").reduce((a, s) => a + (s.amount || 0), 0).toLocaleString()}₴
                <span style={{ color: "#8892b0" }}> / </span>
                💵 {subs.filter((s) => s.paid && s.payMethod === "cash").reduce((a, s) => a + (s.amount || 0), 0).toLocaleString()}₴
              </div>
            </div>
          </div>

          <h3 style={{ color: "#fff", fontSize: 15, marginBottom: 10 }}>Розподіл по групах (тренер / студія)</h3>
          {analytics.splits.length === 0 ? <div style={{ color: "#8892b0", padding: 20 }}>Немає даних</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {analytics.splits.map((sp) => {
                const dir = dirMap[sp.group.directionId];
                return (
                  <div key={sp.group.id} style={{ ...cardSt, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>{sp.group.name}</span>
                        <Badge color={dir?.color || "#888"}>{sp.group.trainerPct}/{100 - sp.group.trainerPct}</Badge>
                      </div>
                      <div style={{ fontSize: 11, color: "#8892b0", marginTop: 2 }}>
                        Оплачено: {sp.total.toLocaleString()}₴
                        {(sp.trainerLoss > 0 || sp.studioLoss > 0) && (
                          <span style={{ color: "#3498DB" }}> · знижки: тренер -{sp.trainerLoss}₴, студія -{sp.studioLoss}₴</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 14 }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 10, color: "#8892b0" }}>Тренер</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#3498DB" }}>{sp.trainer.toLocaleString()}₴</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 10, color: "#8892b0" }}>Студія</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#2ECC71" }}>{sp.studio.toLocaleString()}₴</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {modLog.length > 0 && (<div style={{ marginTop: 24 }}>
            <h3 style={{ color: "#fff", fontSize: 15, marginBottom: 10 }}>Історія змін</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {modLog.slice(-20).reverse().map((log) => {
                const sub = subs.find((s) => s.id === log.subId);
                const st = sub ? studentMap[sub.studentId] : null;
                return (
                  <div key={log.id} style={{ ...cardSt, fontSize: 12 }}>
                    <span style={{ color: "#8892b0" }}>{fmtFull(log.date)}</span>
                    <span style={{ color: "#fff", marginLeft: 8 }}>{st?.name || "?"}</span>
                    <span style={{ color: "#F9A03F", marginLeft: 8 }}>{log.details || log.action}</span>
                    {log.reason && <span style={{ color: "#8892b0", marginLeft: 8 }}>— {log.reason}</span>}
                  </div>
                );
              })}
            </div>
          </div>)}
        </div>)}
      </main>

      {/* ═══ MODALS ═══ */}
      <Modal open={modal === "addStudent"} onClose={() => setModal(null)} title="Нова учениця">
        <StudentForm onDone={addStudent} />
      </Modal>
      <Modal open={modal === "editStudent"} onClose={() => { setModal(null); setEditItem(null); }} title="Редагувати ученицю">
        {editItem && <StudentForm initial={editItem} onDone={editStudent} />}
      </Modal>
      <Modal open={modal === "addSub"} onClose={() => setModal(null)} title="Новий абонемент">
        <SubForm onDone={addSub} />
      </Modal>
      <Modal open={modal === "editSub"} onClose={() => { setModal(null); setEditItem(null); }} title="Редагувати абонемент">
        {editItem && <SubForm initial={editItem} onDone={editSub} />}
      </Modal>
      <Modal open={modal === "modifySub"} onClose={() => { setModal(null); setEditItem(null); }} title="Зміна абонементу" wide>
        {editItem && <ModifySubForm sub={editItem} onDone={modifySub} />}
      </Modal>
      <Modal open={modal === "cancelTraining"} onClose={() => setModal(null)} title="Відміна заняття">
        <CancelTrainingForm />
      </Modal>
      <Modal open={modal === "editGroup"} onClose={() => { setModal(null); setEditItem(null); }} title="Налаштування групи">
        {editItem && <GroupSettingsForm group={editItem} onDone={saveGroup} />}
      </Modal>
    </div>
  );
}
