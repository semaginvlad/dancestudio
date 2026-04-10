import { useState, useEffect, useMemo } from "react";
import * as db from "./db";

// ==========================================
// UTILS & CONSTANTS
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
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,7);

function getSubStatus(sub) {
  if (!sub?.endDate) return "expired";
  if (sub.endDate < today()) return "expired";
  if ((sub.usedTrainings||0) >= (sub.totalTrainings||1)) return "expired";
  const dl = daysLeft(sub.endDate);
  if (dl <= 3 || ((sub.totalTrainings||1)-(sub.usedTrainings||0)) <= 1) return "warning";
  return "active";
}

// ==========================================
// UI COMPONENTS
// ==========================================
const inputSt = { width:"100%", padding:"16px", background:"#1C1C1E", border:"none", borderRadius:16, color:"#fff", fontSize:15, outline:"none", boxSizing:"border-box" };
const btnP = { padding:"14px 24px", background:"#FF3B30", color:"#fff", border:"none", borderRadius:18, fontSize:15, fontWeight:600, cursor:"pointer", boxShadow:"0 4px 12px rgba(255,59,48,0.3)" };
const btnS = { padding:"14px 24px", background:"#2C2C2E", color:"#fff", border:"none", borderRadius:18, fontSize:15, fontWeight:600, cursor:"pointer" };
const cardSt = { background:"#1C1C1E", borderRadius:28, padding:"24px" };

function Modal({open, onClose, title, children, wide}){
  if(!open) return null;
  return(
    <div style={{position:"fixed", inset:0, background:"rgba(0,0,0,.8)", backdropFilter:"blur(8px)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#1C1C1E", borderRadius:32, padding:"32px", width:wide?800:500, maxWidth:"100%", maxHeight:"90vh", overflow:"auto"}}>
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
  return(<div style={{marginBottom:16}}><label style={{display:"block", fontSize:12, color:"#8E8E93", marginBottom:8, fontWeight:600, textTransform:"uppercase", letterSpacing:0.5}}>{label}</label>{children}</div>);
}

function Badge({color, children}){
  return <span style={{padding:"6px 12px", borderRadius:12, fontSize:11, fontWeight:700, background:`${color}22`, color, whiteSpace:"nowrap"}}>{children}</span>;
}

function Pill({active, onClick, children, color}){
  return <button onClick={onClick} style={{padding:"10px 20px", borderRadius:100, fontSize:14, fontWeight:600, cursor:"pointer", background:active?(color||"#FF3B30"):"#2C2C2E", color:active?"#fff":"#8E8E93", border:"none", transition:"all 0.2s"}}>{children}</button>;
}

// ==========================================
// MAIN APP
// ==========================================
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

  // States for Attendance
  const [attnGid, setAttnGid] = useState("");
  const [attnDate, setAttnDate] = useState(today());
  const [viewMode, setViewMode] = useState("daily");
  const [draft, setDraft] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [journalMonth, setJournalMonth] = useState(today().slice(0, 7));

  // Load Data
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
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  useEffect(() => { if (groups.length > 0 && !attnGid) setAttnGid(groups[0].id); }, [groups, attnGid]);

  // Maps
  const studentMap = useMemo(() => Object.fromEntries(students.map(s => [s.id, s])), [students]);
  const groupMap = useMemo(() => Object.fromEntries(groups.map(g => [g.id, g])), [groups]);
  const subsExt = useMemo(() => subs.map(s => ({ ...s, status: getSubStatus(s) })), [subs]);
  const activeSubs = useMemo(() => subsExt.filter(s => s.status !== "expired"), [subsExt]);

  // Attendance Logic
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
      alert("Збережено!");
    } catch (e) { console.error(e); }
    setIsSaving(false);
  };

  // Analytics
  const analytics = useMemo(() => {
    const totalRev = subs.filter(s => s.paid).reduce((a, s) => a + (s.amount || 0), 0);
    const unpaid = subs.filter(s => !s.paid && getSubStatus(s) !== "expired").reduce((a, s) => a + (s.amount || 0), 0);
    const splits = [];
    groups.forEach(g => {
      const gSubs = subs.filter(s => s.groupId === g.id && s.paid);
      const total = gSubs.reduce((a, s) => a + (s.amount || 0), 0);
      if (total > 0) splits.push({ group: g, total, trainer: Math.round(total * (g.trainerPct || 50) / 100), studio: Math.round(total * (100 - (g.trainerPct || 50)) / 100), subs: gSubs });
    });
    return { totalStudents: students.length, activeStudents: new Set(activeSubs.map(s => s.studentId)).size, totalRev, unpaid, splits };
  }, [students, subs, activeSubs, groups]);

  if (loading) return <div style={{ height: "100vh", background: "#000", color: "#8E8E93", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>Завантаження...</div>;

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#fff", fontFamily: "'DM Sans', sans-serif", paddingBottom: 100 }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;700;800&display=swap" rel="stylesheet" />
      
      {/* HEADER */}
      <header style={{ padding: "30px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 1200, margin: "0 auto" }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>Dance Studio.</h1>
        <div style={{ display: "flex", gap: 12 }}>
          <button style={btnS} onClick={() => setModal("addStudent")}>+ Учениця</button>
          <button style={{ ...btnP, background: "#007AFF", boxShadow: "0 4px 12px rgba(0,122,255,0.3)" }} onClick={() => setModal("addSub")}>+ Абонемент</button>
        </div>
      </header>

      {/* NAV */}
      <nav style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px 30px", overflowX: "auto" }}>
        <div style={{ display: "inline-flex", background: "#1C1C1E", borderRadius: 100, padding: 6 }}>
          {["dashboard", "students", "subs", "attendance", "finance"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: "10px 20px", background: tab === t ? "#3A3A3C" : "transparent", border: "none", borderRadius: 100, color: tab === t ? "#fff" : "#8E8E93", fontSize: 14, fontWeight: 600, cursor: "pointer", textTransform: "capitalize" }}>{t}</button>
          ))}
        </div>
      </nav>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>
        
        {/* DASHBOARD */}
        {tab === "dashboard" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
            <div style={cardSt}>
              <div style={{ color: "#8E8E93", fontSize: 13, fontWeight: 600 }}>УЧЕНИЦЬ</div>
              <div style={{ fontSize: 36, fontWeight: 800, marginTop: 8 }}>{analytics.totalStudents}</div>
              <div style={{ color: "#007AFF", fontSize: 14, marginTop: 4 }}>{analytics.activeStudents} активних</div>
            </div>
            <div style={cardSt}>
              <div style={{ color: "#8E8E93", fontSize: 13, fontWeight: 600 }}>ДОХІД</div>
              <div style={{ fontSize: 36, fontWeight: 800, marginTop: 8, color: "#30D158" }}>{analytics.totalRev.toLocaleString()}₴</div>
              <div style={{ color: "#FF3B30", fontSize: 14, marginTop: 4 }}>{analytics.unpaid.toLocaleString()}₴ борги</div>
            </div>
          </div>
        )}

        {/* ATTENDANCE */}
        {tab === "attendance" && (
          <div>
            <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
              <select style={{ ...inputSt, width: "auto" }} value={attnGid} onChange={e => setAttnGid(e.target.value)}>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <input style={{ ...inputSt, width: "auto" }} type="date" value={attnDate} onChange={e => setAttnDate(e.target.value)} onClick={e => e.target.showPicker()} />
            </div>

            <div style={{ ...cardSt, padding: 0, overflow: "hidden" }}>
              {(() => {
                const stIds = new Set([...studentGrps.filter(sg => sg.groupId === attnGid).map(sg => sg.studentId), ...subs.filter(s => s.groupId === attnGid).map(s => s.studentId)]);
                const groupStuds = Array.from(stIds).map(id => studentMap[id]).filter(Boolean).sort((a,b) => a.name.localeCompare(b.name, "uk"));
                
                return groupStuds.map((st, i) => {
                  const stSubs = subs.filter(s => s.studentId === st.id && s.groupId === attnGid);
                  const sub = stSubs.find(s => getSubStatus(s) !== "expired") || stSubs[0];
                  const key = sub ? `sub_${sub.id}` : `guest_${st.name}`;
                  const isMarked = !!draft[key];

                  return (
                    <div key={st.id} onClick={() => setDraft(p => ({ ...p, [key]: !p[key] }))} style={{ padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: i < groupStuds.length - 1 ? "1px solid #2C2C2E" : "none", cursor: "pointer", background: isMarked ? "rgba(255,59,48,0.05)" : "transparent" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 17 }}>{st.name}</div>
                        <div style={{ color: "#8E8E93", fontSize: 13, marginTop: 4 }}>
                          {sub ? `${sub.usedTrainings}/${sub.totalTrainings} · до ${fmt(sub.endDate)}` : "Немає абонемента"}
                        </div>
                      </div>
                      <div style={{ width: 28, height: 28, borderRadius: 8, border: `2px solid ${isMarked ? "#FF3B30" : "#3A3A3C"}`, background: isMarked ? "#FF3B30" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: "bold" }}>{isMarked && "✓"}</div>
                    </div>
                  );
                });
              })()}
            </div>
            
            <div style={{ position: "fixed", bottom: 30, left: "50%", transform: "translateX(-50%)", width: "calc(100% - 48px)", maxWidth: 400 }}>
              <button onClick={saveAttendance} disabled={isSaving} style={{ ...btnP, width: "100%", fontSize: 17, height: 60, borderRadius: 20 }}>{isSaving ? "Збереження..." : "💾 Зберегти відмітки"}</button>
            </div>
          </div>
        )}

        {/* FINANCE */}
        {tab === "finance" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {analytics.splits.map(sp => (
              <div key={sp.group.id} style={cardSt}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{sp.group.name}</div>
                    <Badge color="#007AFF">{sp.group.trainerPct}% Тренеру</Badge>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 800 }}>{sp.total.toLocaleString()}₴</div>
                  </div>
                </div>
                <div style={{ height: 8, background: "#2C2C2E", borderRadius: 10, overflow: "hidden", display: "flex" }}>
                  <div style={{ width: `${sp.group.trainerPct}%`, background: "#007AFF" }} />
                  <div style={{ flex: 1, background: "#30D158" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
                  <div><span style={{ color: "#8E8E93", fontSize: 12 }}>ТРЕНЕР</span><div style={{ fontWeight: 700, color: "#007AFF" }}>{sp.trainer.toLocaleString()}₴</div></div>
                  <div style={{ textAlign: "right" }}><span style={{ color: "#8E8E93", fontSize: 12 }}>СТУДІЯ</span><div style={{ fontWeight: 700, color: "#30D158" }}>{sp.studio.toLocaleString()}₴</div></div>
                </div>
              </div>
            ))}
          </div>
        )}

      </main>

      {/* MODALS (Simplified) */}
      <Modal open={modal === "addSub"} title="Новий абонемент" onClose={() => setModal(null)}>
        <Field label="Учениця"><select style={inputSt} id="st_id">{students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Група"><select style={inputSt} id="gr_id">{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
        <Field label="Тип"><select style={inputSt} id="pl_id">{PLAN_TYPES.map(p => <option key={p.id} value={p.id}>{p.name} - {p.price}₴</option>)}</select></Field>
        <Field label="Дата початку"><input style={inputSt} type="date" defaultValue={today()} id="sd" onClick={e => e.target.showPicker()} /></Field>
        <button style={{ ...btnP, width: "100%", marginTop: 10 }} onClick={async () => {
          const d = { studentId: document.getElementById('st_id').value, groupId: document.getElementById('gr_id').value, planType: document.getElementById('pl_id').value, startDate: document.getElementById('sd').value, endDate: addMonth(document.getElementById('sd').value), totalTrainings: PLAN_TYPES.find(p=>p.id===document.getElementById('pl_id').value).trainings, usedTrainings: 0, amount: PLAN_TYPES.find(p=>p.id===document.getElementById('pl_id').value).price, paid: true };
          const s = await db.insertSub(d); setSubs(p => [s, ...p]); setModal(null);
        }}>Додати абонемент</button>
      </Modal>

      <Modal open={modal === "addStudent"} title="Нова учениця" onClose={() => setModal(null)}>
        <Field label="Ім'я та прізвище"><input style={inputSt} id="st_name" placeholder="Олена Петренко" /></Field>
        <button style={{ ...btnP, width: "100%", marginTop: 10 }} onClick={async () => {
          const name = document.getElementById('st_name').value;
          if(!name) return;
          const s = await db.insertStudent({ name, first_name: name.split(' ')[0] });
          setStudents(p => [...p, s]); setModal(null);
        }}>Створити профіль</button>
      </Modal>

    </div>
  );
}
