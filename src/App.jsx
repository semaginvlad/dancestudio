import { useState, useEffect, useMemo } from "react";
import * as db from "./db";

// ─── КОНСТАНТИ ТА УТИЛІТИ ───
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
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,7);

function getSubStatus(sub) {
  if (!sub?.endDate) return "expired";
  if (sub.endDate < today()) return "expired";
  if ((sub.usedTrainings||0) >= (sub.totalTrainings||1)) return "expired";
  const dl = daysLeft(sub.endDate);
  if (dl <= 3 || ((sub.totalTrainings||1)-(sub.usedTrainings||0)) <= 1) return "warning";
  return "active";
}

const STATUS_LABELS = { active: "Активний", warning: "Закінчується", expired: "Протермінований" };
const STATUS_COLORS = { active: "#30D158", warning: "#FF9F0A", expired: "#FF453A" };

// ─── UI КОМПОНЕНТИ (BENTO STYLE) ───
const inputSt = { width:"100%", padding:"16px", background:"#1C1C1E", border:"none", borderRadius:16, color:"#fff", fontSize:15, outline:"none", boxSizing:"border-box" };
const btnP = { padding:"14px 24px", background:"#FF453A", color:"#fff", border:"none", borderRadius:18, fontSize:15, fontWeight:700, cursor:"pointer", boxShadow:"0 4px 12px rgba(255,69,58,0.3)" };
const btnS = { padding:"14px 24px", background:"#2C2C2E", color:"#fff", border:"none", borderRadius:18, fontSize:15, fontWeight:600, cursor:"pointer" };
const cardSt = { background:"#1C1C1E", borderRadius:28, padding:"24px" };

function Modal({open, onClose, title, children, wide}){
  if(!open) return null;
  return(
    <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,.85)", backdropFilter:"blur(10px)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#1C1C1E", borderRadius:32, padding:"32px", width:wide?900:500, maxWidth:"100%", maxHeight:"90vh", overflow:"auto", border: "1px solid #2C2C2E"}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24}}>
          <h3 style={{margin:0, fontSize:22, color:"#fff", fontWeight:800}}>{title}</h3>
          <button onClick={onClose} style={{background:"#2C2C2E", borderRadius:"50%", width:36, height:36, border:"none", color:"#8E8E93", cursor:"pointer"}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({label, children}){
  return(<div style={{marginBottom:16}}><label style={{display:"block", fontSize:12, color:"#8E8E93", marginBottom:8, fontWeight:700, textTransform:"uppercase", letterSpacing:0.5}}>{label}</label>{children}</div>);
}

function Badge({color, children}){
  return <span style={{padding:"6px 12px", borderRadius:12, fontSize:11, fontWeight:700, background:`${color}22`, color, whiteSpace:"nowrap"}}>{children}</span>;
}

function Pill({active, onClick, children, color}){
  return <button onClick={onClick} style={{padding:"10px 20px", borderRadius:100, fontSize:14, fontWeight:700, cursor:"pointer", background:active?(color||"#FF453A"):"#2C2C2E", color:active?"#fff":"#8E8E93", border:"none", transition:"all 0.2s"}}>{children}</button>;
}

function GroupSelect({groups, value, onChange, filterDir = "all", allowAll = false}) {
  const filteredGroups = filterDir === "all" ? groups : groups.filter(g => g.directionId === filterDir);
  return (
    <select style={{...inputSt, width:"auto", minWidth:200}} value={value} onChange={e=>onChange(e.target.value)}>
      {allowAll && <option value="all">Усі групи</option>}
      {DIRECTIONS.filter(d => filterDir === "all" || d.id === filterDir).map(d=>(
        <optgroup key={d.id} label={d.name}>
          {filteredGroups.filter(g=>g.directionId===d.id).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

// ═══════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════
export default function App() {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("dashboard");
  const [modal, setModal] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [financeDetailItem, setFinanceDetailItem] = useState(null);
  const [searchQ, setSearchQ] = useState("");

  const [students, setStudents] = useState([]);
  const [subs, setSubs] = useState([]);
  const [attn, setAttn] = useState([]);
  const [groups, setGroups] = useState(DEFAULT_GROUPS);
  const [cancelled, setCancelled] = useState([]);
  const [studentGrps, setStudentGrps] = useState([]);
  const [waitlist, setWaitlist] = useState([]);

  // States для фільтрів
  const [stFilterDir, setStFilterDir] = useState("all");
  const [stFilterGroup, setStFilterGroup] = useState("all");
  const [subFilterDir, setSubFilterDir] = useState("all");
  const [subFilterGroup, setSubFilterGroup] = useState("all");
  const [subFilterStatus, setSubFilterStatus] = useState("all");
  const [finFilterDir, setFinFilterDir] = useState("all");
  const [finFilterGroup, setFinFilterGroup] = useState("all");
  const [finSortBy, setFinSortBy] = useState("total");
  const [finSortOrder, setFinSortOrder] = useState("desc");

  // States для Відвідувань
  const [viewMode, setViewMode] = useState("daily");
  const [attnGid, setAttnGid] = useState("");
  const [attnDate, setAttnDate] = useState(today());
  const [journalMonth, setJournalMonth] = useState(today().slice(0, 7));
  const [draft, setDraft] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  const [expandedDirs, setExpandedDirs] = useState({});
  const [expandedSubDirs, setExpandedSubDirs] = useState({});

  // ─── ЗАВАНТАЖЕННЯ ДАНИХ ───
  useEffect(() => {
    (async () => {
      try {
        const [st, gr, su, at, ca, sg] = await Promise.all([
          db.fetchStudents(), db.fetchGroups(), db.fetchSubs(),
          db.fetchAttendance(), db.fetchCancelled(), db.fetchStudentGroups()
        ]);
        setStudents(st || []);
        if (gr?.length) setGroups(gr);
        setSubs(su || []);
        setAttn(at || []);
        setCancelled(ca || []);
        setStudentGrps(sg || []);
        if (db.fetchWaitlist) {
          const wl = await db.fetchWaitlist();
          setWaitlist(wl || []);
        }
      } catch (e) { console.error("Load error:", e); }
      setLoading(false);
    })();
  }, []);

  useEffect(() => { if (groups.length > 0 && !attnGid) setAttnGid(groups[0].id); }, [groups, attnGid]);

  // ─── MAPS ───
  const studentMap = useMemo(() => Object.fromEntries(students.map(s => [s.id, s])), [students]);
  const groupMap = useMemo(() => Object.fromEntries(groups.map(g => [g.id, g])), [groups]);
  const dirMap = useMemo(() => Object.fromEntries(DIRECTIONS.map(d => [d.id, d])), []);
  const subsExt = useMemo(() => subs.map(s => ({ ...s, status: getSubStatus(s) })), [subs]);
  const activeSubs = useMemo(() => subsExt.filter(s => s.status !== "expired"), [subsExt]);

  // ─── ANALYTICS ───
  const analytics = useMemo(() => {
    const totalRev = subs.filter(s => s.paid).reduce((a, s) => a + (s.amount || 0), 0);
    const unpaid = subs.filter(s => !s.paid && getSubStatus(s) !== "expired").reduce((a, s) => a + (s.amount || 0), 0);
    const byDir = {}; DIRECTIONS.forEach(d => {
      const gids = groups.filter(g => g.directionId === d.id).map(g => g.id);
      const ds = activeSubs.filter(s => gids.includes(s.groupId));
      byDir[d.id] = { students: new Set(ds.map(s => s.studentId)).size };
    });
    const splits = []; groups.forEach(g => {
      const gSubs = subs.filter(s => s.groupId === g.id && s.paid);
      const total = gSubs.reduce((a, s) => a + (s.amount || 0), 0);
      if (total > 0) {
        splits.push({ group: g, total, trainer: Math.round(total * (g.trainerPct || 50) / 100), studio: Math.round(total * (100 - (g.trainerPct || 50)) / 100), subs: gSubs });
      }
    });
    let totalLTV = 0; let usersWithPurchases = 0; let trialUsers = 0; let convertedUsers = 0;
    Object.values(studentMap).forEach(st => {
      const stSubs = subs.filter(s => s.studentId === st.id);
      if (stSubs.length > 0) {
        const moneySpent = stSubs.filter(s => s.paid).reduce((acc, curr) => acc + (curr.amount || 0), 0);
        if (moneySpent > 0) { totalLTV += moneySpent; usersWithPurchases++; }
        if (stSubs.some(s => s.planType === "trial")) {
          trialUsers++;
          if (stSubs.some(s => s.planType !== "trial")) convertedUsers++;
        }
      }
    });
    return { 
      totalStudents: students.length, 
      activeStudents: new Set(activeSubs.map(s => s.studentId)).size, 
      totalRev, unpaid, byDir, splits,
      avgLTV: usersWithPurchases > 0 ? Math.round(totalLTV / usersWithPurchases) : 0,
      conversionRate: trialUsers > 0 ? Math.round((convertedUsers / trialUsers) * 100) : 0
    };
  }, [students, subs, activeSubs, groups, studentMap]);

  // ─── СПОВІЩЕННЯ ───
  const notifications = useMemo(() => {
    const items = [];
    subsExt.filter(s => s.status !== "active").forEach(sub => {
      const st = studentMap[sub.studentId]; if (!st) return;
      if (sub.status === "expired" && subs.some(s => s.studentId === sub.studentId && s.groupId === sub.groupId && getSubStatus(s) !== "expired")) return;
      items.push({ 
        subId: sub.id, student: st, group: groupMap[sub.groupId], status: sub.status,
        message: sub.status === "expired" ? "Абонемент закінчився" : "Залишилось мало занять",
        notified: sub.notificationSent 
      });
    });
    return items;
  }, [subsExt, studentMap, groupMap, subs]);

  // ─── ВІДВІДУВАННЯ ЛОГІКА ───
  useEffect(() => {
    const initialDraft = {};
    const dayRecords = attn.filter(a => a.groupId === attnGid && a.date === attnDate);
    dayRecords.forEach(a => {
      if (a.subId) initialDraft[`sub_${a.subId}`] = true;
      if (a.guestName) initialDraft[`guest_${a.guestName}`] = true;
    });
    setDraft(initialDraft);
  }, [attnGid, attnDate, attn]);

  const saveAttendance = async () => {
    setIsSaving(true);
    try {
      const stIdsInGroup = new Set([
        ...studentGrps.filter(sg => sg.groupId === attnGid).map(sg => sg.studentId),
        ...subs.filter(s => s.groupId === attnGid).map(s => s.studentId)
      ]);
      const currentAttn = attn.filter(a => a.groupId === attnGid && a.date === attnDate);

      for (let stId of stIdsInGroup) {
        const student = studentMap[stId];
        const stSubs = subs.filter(s => s.studentId === stId && s.groupId === attnGid);
        const bestSub = stSubs.find(s => getSubStatus(s) !== "expired") || stSubs.sort((a,b) => new Date(b.endDate) - new Date(a.endDate))[0];

        if (bestSub && getSubStatus(bestSub) !== "expired") {
          const key = `sub_${bestSub.id}`;
          const isMarked = !!draft[key];
          const exists = currentAttn.find(a => a.subId === bestSub.id);
          if (isMarked && !exists) {
            const a = await db.insertAttendance({ subId: bestSub.id, date: attnDate, quantity: 1, entryType: "subscription", groupId: attnGid });
            await db.incrementUsed(bestSub.id, 1);
            setAttn(p => [...p, a]);
            setSubs(p => p.map(s => s.id === bestSub.id ? {...s, usedTrainings: (s.usedTrainings || 0) + 1} : s));
          } else if (!isMarked && exists) {
            await db.deleteAttendance(exists.id);
            await db.decrementUsed(bestSub.id, 1);
            setAttn(p => p.filter(x => x.id !== exists.id));
            setSubs(p => p.map(s => s.id === bestSub.id ? {...s, usedTrainings: Math.max(0, (s.usedTrainings || 0) - 1)} : s));
          }
        } else {
          const key = `guest_${student.name}`;
          const isMarked = !!draft[key];
          const exists = currentAttn.find(a => a.guestName === student.name);
          if (isMarked && !exists) {
            const a = await db.insertAttendance({ guestName: student.name, guestType: "single", groupId: attnGid, date: attnDate, quantity: 1, entryType: "single" });
            setAttn(p => [...p, a]);
          } else if (!isMarked && exists) {
            await db.deleteAttendance(exists.id);
            setAttn(p => p.filter(x => x.id !== exists.id));
          }
        }
      }
      alert("✅ Збережено успішно!");
    } catch (e) { console.error(e); }
    setIsSaving(false);
  };

  if (loading) return <div style={{ height: "100vh", background: "#000", color: "#8E8E93", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>Завантаження...</div>;

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#fff", fontFamily: "'DM Sans', sans-serif", paddingBottom: 120 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800&display=swap" rel="stylesheet" />
      
      {/* HEADER */}
      <header style={{ padding: "30px 24px", maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: "-1px" }}>Dance Studio.</h1>
        <div style={{ display: "flex", gap: 12 }}>
          <button style={btnS} onClick={() => setModal("addStudent")}>+ Учениця</button>
          <button style={{ ...btnP, background: "#007AFF", boxShadow: "0 4px 12px rgba(0,122,255,0.3)" }} onClick={() => setModal("addSub")}>+ Абонемент</button>
        </div>
      </header>

      {/* NAVIGATION */}
      <nav style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px 30px", overflowX: "auto" }}>
        <div style={{ display: "inline-flex", background: "#1C1C1E", borderRadius: 100, padding: 6 }}>
          {[
            { id: "dashboard", label: "📊 Дашборд" },
            { id: "students", label: "👩‍🎤 Учениці" },
            { id: "subs", label: "🎫 Абонементи" },
            { id: "attendance", label: "✅ Відвідування" },
            { id: "alerts", label: `🔔 Сповіщення (${notifications.filter(n=>!n.notified).length})` },
            { id: "finance", label: "💰 Фінанси" }
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "10px 20px", background: tab === t.id ? "#3A3A3C" : "transparent", border: "none", borderRadius: 100, color: tab === t.id ? "#fff" : "#8E8E93", fontSize: 14, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", transition: "0.2s" }}>{t.label}</button>
          ))}
        </div>
      </nav>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>
        
        {/* TAB: DASHBOARD */}
        {tab === "dashboard" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 20, marginBottom: 40 }}>
              <div style={cardSt}>
                <div style={{ color: "#8E8E93", fontSize: 13, fontWeight: 700, textTransform: "uppercase" }}>Учениць всього</div>
                <div style={{ fontSize: 42, fontWeight: 800, marginTop: 12 }}>{analytics.totalStudents}</div>
                <div style={{ color: "#007AFF", fontSize: 14, fontWeight: 600, marginTop: 6 }}>{analytics.activeStudents} активних</div>
              </div>
              <div style={cardSt}>
                <div style={{ color: "#8E8E93", fontSize: 13, fontWeight: 700, textTransform: "uppercase" }}>Каса студії</div>
                <div style={{ fontSize: 42, fontWeight: 800, marginTop: 12, color: "#30D158" }}>{analytics.totalRev.toLocaleString()}₴</div>
                <div style={{ color: "#FF453A", fontSize: 14, fontWeight: 600, marginTop: 6 }}>{analytics.unpaid.toLocaleString()}₴ неопл. борги</div>
              </div>
              <div style={{ ...cardSt, background: "linear-gradient(135deg, #1C1C1E, #2C1A35)" }}>
                <div style={{ color: "#E58EED", fontSize: 13, fontWeight: 700, textTransform: "uppercase" }}>LTV (Середній чек)</div>
                <div style={{ fontSize: 32, fontWeight: 800, marginTop: 12 }}>{analytics.avgLTV.toLocaleString()} ₴</div>
                <div style={{ color: "#8E8E93", fontSize: 14, marginTop: 6 }}>Конверсія з пробного: {analytics.conversionRate}%</div>
              </div>
            </div>

            <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>Напрямки</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
              {DIRECTIONS.map(d => (
                <div key={d.id} style={{ ...cardSt, padding: "20px" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: d.color }}>{d.name}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, marginTop: 8 }}>{analytics.byDir[d.id]?.students || 0} <span style={{ fontSize: 13, color: "#8E8E93" }}>уч.</span></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB: STUDENTS */}
        {tab === "students" && (
          <div>
            <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap", background: "#1C1C1E", padding: 16, borderRadius: 20 }}>
              <input style={{ ...inputSt, flex: 1, minWidth: 250 }} placeholder="Пошук учениці..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
              <select style={{ ...inputSt, width: "auto" }} value={stFilterDir} onChange={e => { setStFilterDir(e.target.value); setStFilterGroup("all"); }}>
                <option value="all">Усі напрямки</option>
                {DIRECTIONS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {DIRECTIONS.filter(d => stFilterDir === "all" || d.id === stFilterDir).map(dir => {
                const dirStuds = students.filter(s => studentGrps.some(sg => sg.studentId === s.id && groupMap[sg.groupId]?.directionId === dir.id));
                const filtered = dirStuds.filter(s => s.name.toLowerCase().includes(searchQ.toLowerCase())).sort((a,b) => a.name.localeCompare(b.name, "uk"));
                if (filtered.length === 0) return null;
                const isExp = expandedDirs[dir.id];

                return (
                  <div key={dir.id} style={{ ...cardSt, padding: 0, overflow: "hidden" }}>
                    <div onClick={() => setExpandedDirs(p => ({...p, [dir.id]: !p[dir.id]}))} style={{ padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", background: isExp ? "#2C2C2E" : "transparent" }}>
                      <div style={{ fontSize: 17, fontWeight: 800, color: dir.color }}>{dir.name} <span style={{ color: "#8E8E93", fontSize: 14, fontWeight: 500 }}>({filtered.length})</span></div>
                      <div style={{ color: "#8E8E93" }}>{isExp ? "▲" : "▼"}</div>
                    </div>
                    {isExp && (
                      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                        {filtered.map(st => (
                          <div key={st.id} style={{ background: "#2C2C2E", padding: "16px 20px", borderRadius: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 16 }}>{st.name}</div>
                              <div style={{ color: "#8E8E93", fontSize: 13, marginTop: 4 }}>{st.phone || "Без телефону"}</div>
                            </div>
                            <button style={btnS} onClick={() => { setEditItem(st); setModal("editStudent"); }}>✏️</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB: SUBSCRIPTIONS */}
        {tab === "subs" && (
          <div>
            <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap", background: "#1C1C1E", padding: 16, borderRadius: 20 }}>
              <input style={{ ...inputSt, flex: 1, minWidth: 200 }} placeholder="Пошук за іменем..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
              <select style={{ ...inputSt, width: "auto" }} value={subFilterStatus} onChange={e => setSubFilterStatus(e.target.value)}>
                <option value="all">Усі статуси</option>
                <option value="active">Активні</option>
                <option value="warning">Закінчуються</option>
                <option value="expired">Протерміновані</option>
              </select>
            </div>

            {DIRECTIONS.map(dir => {
              const dirSubs = subsExt.filter(s => groupMap[s.groupId]?.directionId === dir.id);
              const filtered = dirSubs.filter(s => {
                const matchName = studentMap[s.studentId]?.name.toLowerCase().includes(searchQ.toLowerCase());
                const matchStatus = subFilterStatus === "all" || s.status === subFilterStatus;
                return matchName && matchStatus;
              });
              if (filtered.length === 0) return null;
              const isExp = expandedSubDirs[dir.id];

              return (
                <div key={dir.id} style={{ ...cardSt, padding: 0, overflow: "hidden", marginBottom: 16 }}>
                  <div onClick={() => setExpandedSubDirs(p => ({...p, [dir.id]: !p[dir.id]}))} style={{ padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", background: isExp ? "#2C2C2E" : "transparent" }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: dir.color }}>{dir.name} <span style={{ color: "#8E8E93", fontSize: 14, fontWeight: 500 }}>({filtered.length})</span></div>
                    <div style={{ color: "#8E8E93" }}>{isExp ? "▲" : "▼"}</div>
                  </div>
                  {isExp && (
                    <div style={{ overflowX: "auto", padding: "0 20px 20px" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, textAlign: "left" }}>
                        <thead>
                          <tr style={{ color: "#8E8E93" }}><th style={{ padding: "14px" }}>Учениця</th><th style={{ padding: "14px" }}>Заняття</th><th style={{ padding: "14px" }}>Термін</th><th style={{ padding: "14px" }}>Статус</th></tr>
                        </thead>
                        <tbody>
                          {filtered.map(s => (
                            <tr key={s.id} style={{ borderTop: "1px solid #2C2C2E" }}>
                              <td style={{ padding: "14px", fontWeight: 700 }}>{studentMap[s.studentId]?.name}</td>
                              <td style={{ padding: "14px" }}>{s.usedTrainings}/{s.totalTrainings}</td>
                              <td style={{ padding: "14px", fontSize: 12 }}>{fmt(s.startDate)} - {fmt(s.endDate)}</td>
                              <td style={{ padding: "14px" }}><Badge color={STATUS_COLORS[s.status]}>{STATUS_LABELS[s.status]}</Badge></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* TAB: ATTENDANCE (WITH JOURNAL) */}
        {tab === "attendance" && (
          <div>
            <div style={{ display: "flex", gap: 12, marginBottom: 24, borderBottom: "1px solid #1C1C1E", paddingBottom: 20 }}>
              <Pill active={viewMode === "daily"} onClick={() => setViewMode("daily")}>📝 Відмітити</Pill>
              <Pill active={viewMode === "journal"} onClick={() => setViewMode("journal")}>🗓 Журнал</Pill>
            </div>

            <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
              <select style={{ ...inputSt, width: "auto" }} value={attnGid} onChange={e => setAttnGid(e.target.value)}>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              {viewMode === "daily" 
                ? <input style={{ ...inputSt, width: "auto" }} type="date" value={attnDate} onChange={e => setAttnDate(e.target.value)} onClick={e => e.target.showPicker()} />
                : <input style={{ ...inputSt, width: "auto" }} type="month" value={journalMonth} onChange={e => setJournalMonth(e.target.value)} onClick={e => e.target.showPicker()} />
              }
            </div>

            {viewMode === "daily" ? (
              <div>
                <div style={{ ...cardSt, padding: 0, overflow: "hidden" }}>
                  {(() => {
                    const stIds = new Set([...studentGrps.filter(sg => sg.groupId === attnGid).map(sg => sg.studentId), ...subs.filter(s => s.groupId === attnGid).map(s => s.studentId)]);
                    const groupStuds = Array.from(stIds).map(id => studentMap[id]).filter(Boolean).sort((a,b) => a.name.localeCompare(b.name, "uk"));
                    
                    return groupStuds.map((st, i) => {
                      const stSubs = subs.filter(s => s.studentId === st.id && s.groupId === attnGid);
                      const sub = stSubs.find(s => getSubStatus(s) !== "expired") || stSubs[0];
                      const key = sub ? `sub_${s.id}` : `guest_${st.name}`;
                      const isMarked = !!draft[sub ? `sub_${sub.id}` : `guest_${st.name}`];

                      return (
                        <div key={st.id} onClick={() => setDraft(p => ({ ...p, [sub ? `sub_${sub.id}` : `guest_${st.name}`]: !p[sub ? `sub_${sub.id}` : `guest_${st.name}`] }))} style={{ padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: i < groupStuds.length - 1 ? "1px solid #2C2C2E" : "none", cursor: "pointer", background: isMarked ? "rgba(255,59,48,0.05)" : "transparent" }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 17 }}>{st.name}</div>
                            <div style={{ color: "#8E8E93", fontSize: 13, marginTop: 4 }}>
                              {sub ? `${sub.usedTrainings}/${sub.totalTrainings} · до ${fmt(sub.endDate)}` : "Немає абонемента"}
                            </div>
                          </div>
                          <div style={{ width: 28, height: 28, borderRadius: 8, border: `2px solid ${isMarked ? "#FF453A" : "#3A3A3C"}`, background: isMarked ? "#FF453A" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: "bold" }}>{isMarked && "✓"}</div>
                        </div>
                      );
                    });
                  })()}
                </div>
                <div style={{ position: "fixed", bottom: 30, left: "50%", transform: "translateX(-50%)", width: "calc(100% - 48px)", maxWidth: 400, zIndex: 100 }}>
                  <button onClick={saveAttendance} disabled={isSaving} style={{ ...btnP, width: "100%", fontSize: 17, height: 64, borderRadius: 24 }}>{isSaving ? "Збереження..." : "💾 Зберегти відмітки"}</button>
                </div>
              </div>
            ) : (
              <div style={{ ...cardSt, padding: 12, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th style={{ padding: "10px", textAlign: "left", position: "sticky", left: 0, background: "#1C1C1E" }}>Учениця</th>
                      {Array.from({ length: 31 }, (_, i) => <th key={i} style={{ padding: "8px", color: "#8E8E93" }}>{i + 1}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const stIds = new Set([...studentGrps.filter(sg => sg.groupId === attnGid).map(sg => sg.studentId), ...subs.filter(s => s.groupId === attnGid).map(s => s.studentId)]);
                      return Array.from(stIds).map(id => studentMap[id]).filter(Boolean).map(st => (
                        <tr key={st.id} style={{ borderTop: "1px solid #2C2C2E" }}>
                          <td style={{ padding: "12px 10px", fontWeight: 700, position: "sticky", left: 0, background: "#1C1C1E" }}>{st.name}</td>
                          {Array.from({ length: 31 }, (_, i) => {
                            const d = `${journalMonth}-${String(i+1).padStart(2,'0')}`;
                            const isAttended = attn.some(a => a.groupId === attnGid && a.date === d && (a.subId ? subs.find(s=>s.id===a.subId)?.studentId === st.id : a.guestName === st.name));
                            return (
                              <td key={i} style={{ textAlign: "center" }}>
                                {isAttended && <div style={{ width: 10, height: 10, background: "#30D158", borderRadius: "50%", margin: "0 auto" }}></div>}
                              </td>
                            );
                          })}
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB: FINANCE */}
        {tab === "finance" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 16, marginBottom: 24 }}>
              <div style={{ ...cardSt, background: "linear-gradient(135deg, #1C1C1E, #14281D)" }}>
                <div style={{ fontSize: 13, color: "#30D158", fontWeight: 700 }}>ОПЛАЧЕНО</div>
                <div style={{ fontSize: 36, fontWeight: 800, marginTop: 8 }}>{analytics.totalRev.toLocaleString()} ₴</div>
              </div>
              <div style={{ ...cardSt, background: "linear-gradient(135deg, #1C1C1E, #2D1516)" }}>
                <div style={{ fontSize: 13, color: "#FF453A", fontWeight: 700 }}>БОРГИ</div>
                <div style={{ fontSize: 36, fontWeight: 800, marginTop: 8 }}>{analytics.unpaid.toLocaleString()} ₴</div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {analytics.splits.map(sp => (
                <div key={sp.group.id} style={cardSt}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>{sp.group.name}</div>
                      <Badge color="#007AFF">{sp.group.trainerPct}% Тренеру</Badge>
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 800 }}>{sp.total.toLocaleString()}₴</div>
                  </div>
                  <div style={{ height: 10, background: "#2C2C2E", borderRadius: 100, overflow: "hidden", display: "flex" }}>
                    <div style={{ width: `${sp.group.trainerPct}%`, background: "#007AFF" }} />
                    <div style={{ flex: 1, background: "#30D158" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
                    <div><span style={{ color: "#8E8E93", fontSize: 11, fontWeight: 700 }}>ТРЕНЕР</span><div style={{ fontSize: 18, fontWeight: 800, color: "#007AFF" }}>{sp.trainer.toLocaleString()}₴</div></div>
                    <div style={{ textAlign: "right" }}><span style={{ color: "#8E8E93", fontSize: 11, fontWeight: 700 }}>СТУДІЯ</span><div style={{ fontSize: 18, fontWeight: 800, color: "#30D158" }}>{sp.studio.toLocaleString()}₴</div></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB: ALERTS */}
        {tab === "alerts" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {notifications.length === 0 ? <div style={{ color: "#8E8E93", textAlign: "center", padding: 50 }}>✨ Всі абонементи активні</div> : 
              notifications.map(n => (
                <div key={n.subId} style={{ ...cardSt, display: "flex", justifyContent: "space-between", alignItems: "center", borderLeft: `4px solid ${STATUS_COLORS[n.status]}` }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{n.student.name}</div>
                    <div style={{ color: "#8E8E93", fontSize: 13, marginTop: 4 }}>{n.group.name} · <Badge color={STATUS_COLORS[n.status]}>{STATUS_LABELS[n.status]}</Badge></div>
                  </div>
                  <button style={{ ...btnS, background: "#007AFF22", color: "#007AFF" }} onClick={() => window.open(`https://t.me/${n.student.telegram?.replace('@','') || ''}`, '_blank')}>💬 Написати</button>
                </div>
              ))
            }
          </div>
        )}

      </main>

      {/* MODALS */}
      <Modal open={modal === "addSub"} title="Новий абонемент" onClose={() => setModal(null)}>
        <Field label="Учениця"><select style={inputSt} id="st_id">{students.sort((a,b)=>a.name.localeCompare(b.name)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Група"><select style={inputSt} id="gr_id">{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
        <Field label="Тип"><select style={inputSt} id="pl_id">{PLAN_TYPES.map(p => <option key={p.id} value={p.id}>{p.name} ({p.trainings} зан.) - {p.price}₴</option>)}</select></Field>
        <Field label="Дата початку"><input style={inputSt} type="date" defaultValue={today()} id="sd" onClick={e => e.target.showPicker()} /></Field>
        <button style={{ ...btnP, width: "100%", marginTop: 10 }} onClick={async () => {
          const plan = PLAN_TYPES.find(p=>p.id===document.getElementById('pl_id').value);
          const d = { studentId: document.getElementById('st_id').value, groupId: document.getElementById('gr_id').value, planType: plan.id, startDate: document.getElementById('sd').value, endDate: addMonth(document.getElementById('sd').value), totalTrainings: plan.trainings, usedTrainings: 0, amount: plan.price, paid: true };
          const s = await db.insertSub(d); setSubs(p => [s, ...p]); setModal(null);
        }}>Створити абонемент</button>
      </Modal>

      <Modal open={modal === "addStudent"} title="Нова учениця" onClose={() => setModal(null)}>
        <Field label="Прізвище та ім'я"><input style={inputSt} id="st_name" placeholder="Петренко Олена" /></Field>
        <Field label="Телефон"><input style={inputSt} id="st_phone" placeholder="+380..." /></Field>
        <button style={{ ...btnP, width: "100%", marginTop: 10 }} onClick={async () => {
          const name = document.getElementById('st_name').value;
          if(!name) return;
          const s = await db.insertStudent({ name, first_name: name.split(' ')[0], phone: document.getElementById('st_phone').value });
          setStudents(p => [...p, s]); setModal(null);
        }}>Додати в базу</button>
      </Modal>

      <Modal open={modal === "editStudent"} title="Редагувати профіль" onClose={() => setModal(null)}>
        <Field label="Прізвище та ім'я"><input style={inputSt} id="edit_name" defaultValue={editItem?.name} /></Field>
        <Field label="Телефон"><input style={inputSt} id="edit_phone" defaultValue={editItem?.phone} /></Field>
        <button style={{ ...btnP, width: "100%", marginTop: 10 }} onClick={async () => {
          const s = await db.updateStudent(editItem.id, { name: document.getElementById('edit_name').value, phone: document.getElementById('edit_phone').value });
          setStudents(p => p.map(x => x.id === s.id ? s : x)); setModal(null);
        }}>Зберегти зміни</button>
      </Modal>

    </div>
  );
}
