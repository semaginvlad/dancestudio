import { useState, useEffect, useMemo } from "react";
import * as db from "./db";

const DIRECTIONS = [
  { id: "latina", name: "Latina Solo", color: "#E84855" },
  { id: "bachata", name: "Bachata Lady Style", color: "#F9A03F" },
  { id: "heels", name: "High Heels", color: "#7B2D8E" },
  { id: "dancehall", name: "Dancehall Female", color: "#2ECC71" },
  { id: "kpop", name: "K-pop Cover Dance", color: "#3498DB" },
  { id: "jazzfunk", name: "Jazz Funk", color: "#E91E8C" },
];
const WEEKDAYS = ["НД", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];
const WEEKDAYS_FULL = ["Неділя", "Понеділок", "Вівторок", "Середа", "Четвер", "Пʼятниця", "Субота"];
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

// ─── UTILS ───
const toLocalISO = (dt) => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
const toISO = (d) => { try { if (d instanceof Date) return toLocalISO(d); const dt = new Date(d+"T12:00:00"); return isNaN(dt)?toLocalISO(new Date()):toLocalISO(dt); } catch{return toLocalISO(new Date())} };
const addMonth = (d) => { const dt = new Date(d+"T12:00:00"); dt.setMonth(dt.getMonth()+1); return toLocalISO(dt); };
const today = () => toLocalISO(new Date());
const fmt = (d) => { if(!d) return "—"; const dt=new Date(d+"T12:00:00"); return dt.toLocaleDateString("uk-UA",{day:"2-digit",month:"2-digit"}); };
const daysLeft = (ed) => Math.ceil((new Date(ed+"T23:59:59")-new Date())/86400000);
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,7);

function getSubStatus(sub) {
  if (!sub?.endDate) return "expired";
  if (sub.endDate < today()) return "expired";
  if ((sub.usedTrainings||0) >= (sub.totalTrainings||1)) return "expired";
  const dl = daysLeft(sub.endDate), tl = (sub.totalTrainings||1)-(sub.usedTrainings||0);
  if (dl <= 3 || tl <= 1) return "warning";
  return "active";
}

const STATUS_LABELS = { active: "Активний", warning: "Закінчується", expired: "Протермінований" };
const STATUS_COLORS = { active: "#2ECC71", warning: "#F9A03F", expired: "#E84855" };

// ─── STYLES ───
const inputSt = { width:"100%",padding:"10px 14px",background:"#0d1117",border:"1px solid #30363d",borderRadius:8,color:"#e6edf3",fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit" };
const btnP = { padding:"10px 20px",background:"#E84855",color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit" };
const btnS = { padding:"10px 20px",background:"#21262d",color:"#c9d1d9",border:"1px solid #30363d",borderRadius:8,fontSize:13,cursor:"pointer",fontFamily:"inherit" };
const cardSt = { background:"#161b22",borderRadius:10,padding:"14px 18px" };

function Modal({open,onClose,title,children,wide}){if(!open)return null;return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:12}} onClick={onClose}><div onClick={e=>e.stopPropagation()} style={{background:"#1a1a2e",borderRadius:14,padding:"24px 28px",width:wide?700:500,maxWidth:"96vw",maxHeight:"88vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.6)"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}><h3 style={{margin:0,fontSize:18,color:"#fff"}}>{title}</h3><button onClick={onClose} style={{background:"none",border:"none",color:"#666",fontSize:22,cursor:"pointer"}}>✕</button></div>{children}</div></div>);}
function Field({label,children}){return(<div style={{marginBottom:12}}><label style={{display:"block",fontSize:11,color:"#8892b0",marginBottom:3,textTransform:"uppercase",letterSpacing:.8}}>{label}</label>{children}</div>);}
function Badge({color,children}){return <span style={{padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:600,background:`${color}22`,color,border:`1px solid ${color}33`,whiteSpace:"nowrap"}}>{children}</span>}
function Pill({active,onClick,children,color}){return <button onClick={onClick} style={{padding:"6px 14px",borderRadius:20,fontSize:12,fontWeight:500,cursor:"pointer",background:active?(color||"#E84855"):"#21262d",color:active?"#fff":"#8892b0",border:`1px solid ${active?"transparent":"#30363d"}`,fontFamily:"inherit",transition:"all .15s"}}>{children}</button>}

function GroupSelect({groups,value,onChange, filterDir = "all", allowAll = false}) {
  const filteredGroups = filterDir === "all" ? groups : groups.filter(g => g.directionId === filterDir);
  return <select style={{...inputSt,width:"auto",minWidth:200}} value={value} onChange={e=>onChange(e.target.value)}>
    {allowAll && <option value="all">Всі групи</option>}
    {DIRECTIONS.filter(d => filterDir === "all" || d.id === filterDir).map(d=><optgroup key={d.id} label={d.name}>{filteredGroups.filter(g=>g.directionId===d.id).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</optgroup>)}
  </select>;
}

// ═══════════════════════════════════════
// ВІДВІДУВАННЯ (НЕЗАЛЕЖНИЙ КОМПОНЕНТ)
// ═══════════════════════════════════════
function AttendanceTab({ groups, subs, setSubs, attn, setAttn, studentMap, studentGrps, cancelled }) {
  const [gid, setGid] = useState(groups[0]?.id || "");
  const [date, setDate] = useState(today());
  const [manualName, setManualName] = useState("");
  const [manualType, setManualType] = useState("trial");

  useEffect(() => { if (groups.length > 0 && !gid) setGid(groups[0].id); }, [groups, gid]);

  const isCan = cancelled.some(c => c.groupId === gid && c.date === date);
  const guests = attn.filter(a => a.guestName && a.groupId === gid && a.date === date);

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
        const attended = attn.some(a => a.subId === bestSub.id && a.date === date);
        studsWithSub.push({ student, sub: bestSub, attended });
    } else {
        const guestEntry = guests.find(g => g.guestName === student.name);
        studsWithoutSub.push({ student, sub: bestSub, attended: !!guestEntry, guestEntry });
    }
  });

  const manualGuests = guests.filter(g => !studsWithoutSub.some(s => s.student.name === g.guestName));

  const toggle = async (sub, attended) => {
    if (isCan) return;
    try {
      const existing = attn.find(a => a.subId === sub.id && a.date === date);
      if (attended) {
        await db.deleteAttendanceBySubAndDate(sub.id, date);
        await db.decrementUsed(sub.id, existing?.quantity || 1);
        setAttn(p => p.filter(a => !(a.subId === sub.id && a.date === date)));
        setSubs(p => p.map(s => s.id === sub.id ? { ...s, usedTrainings: Math.max(0, (s.usedTrainings || 0) - (existing?.quantity || 1)) } : s));
      } else {
        const a = await db.insertAttendance({ subId: sub.id, date: date, quantity: 1, entryType: "subscription", groupId: gid });
        await db.incrementUsed(sub.id, 1);
        setAttn(p => [...p, a]);
        setSubs(p => p.map(s => s.id === sub.id ? { ...s, usedTrainings: (s.usedTrainings || 0) + 1 } : s));
      }
    } catch (e) { console.error(e); }
  };

  const toggleNoSub = async (student, guestEntry, attended) => {
    if (isCan) return;
    try {
      if (attended && guestEntry) {
        await db.deleteAttendance(guestEntry.id);
        setAttn(p => p.filter(a => a.id !== guestEntry.id));
      } else if (!attended) {
        const a = await db.insertAttendance({ guestName: student.name, guestType: "single", groupId: gid, date: date, quantity: 1, entryType: "single" });
        setAttn(p => [...p, a]);
      }
    } catch (e) { console.error(e); }
  };

  const addManual = async () => {
    if (!manualName.trim()) return;
    try {
      const a = await db.insertAttendance({ guestName: manualName.trim(), guestType: manualType, groupId: gid, date: date, quantity: 1, entryType: manualType === "trial" ? "trial" : "single" });
      setAttn(p => [...p, a]);
    } catch (e) { console.error(e); }
    setManualName("");
  };

  const removeGuest = async(id) => { 
    try{ await db.deleteAttendance(id); setAttn(p=>p.filter(a=>a.id!==id)); } catch(e){console.error(e)} 
  };

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <GroupSelect groups={groups} value={gid} onChange={setGid}/>
        <input style={{...inputSt, width: "auto", minWidth: 160}} type="date" value={date} onChange={e=>setDate(e.target.value)}/>
      </div>

      {isCan && <div style={{ background: "#E8485515", border: "1px solid #E8485533", borderRadius: 10, padding: "12px 16px", marginBottom: 20, color: "#E84855", fontWeight: 500 }}>❌ Тренування відмінено</div>}

      {studsWithSub.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: "#8892b0", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, paddingLeft: 4 }}>
            З абонементом ({studsWithSub.length})
          </div>
          <div style={{ background: "#161b22", borderRadius: 12, border: "1px solid #21262d", overflow: "hidden" }}>
            {studsWithSub.map(({sub, student, attended}, i) => (
              <div key={sub.id} onClick={() => toggle(sub, attended)} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "16px 20px", borderBottom: i < studsWithSub.length - 1 ? "1px solid #21262d" : "none",
                cursor: isCan ? "default" : "pointer", transition: "background 0.2s",
                background: attended ? "rgba(46,204,113,0.06)" : "transparent", opacity: isCan ? 0.5 : 1
              }}>
                <div>
                  <div style={{ color: "#fff", fontSize: 16, fontWeight: 500 }}>{student.name}</div>
                  <div style={{ color: "#8892b0", fontSize: 13, marginTop: 4 }}>
                    <span style={{ color: attended ? "#2ECC71" : "#c9d1d9", fontWeight: 600 }}>{sub.usedTrainings}</span> / {sub.totalTrainings} · до {fmt(sub.endDate)}
                  </div>
                </div>
                <div style={{
                  width: 26, height: 26, borderRadius: 6, border: `2px solid ${attended ? "#2ECC71" : "#30363d"}`,
                  background: attended ? "#2ECC71" : "transparent", display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 16, fontWeight: "bold", transition: "all 0.2s"
                }}>
                  {attended && "✓"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {studsWithoutSub.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: "#8892b0", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, paddingLeft: 4 }}>
            Без активного абонемента ({studsWithoutSub.length})
          </div>
          <div style={{ background: "#161b22", borderRadius: 12, border: "1px solid #21262d", overflow: "hidden" }}>
            {studsWithoutSub.map(({student, sub, attended, guestEntry}, i) => (
              <div key={student.id} onClick={() => toggleNoSub(student, guestEntry, attended)} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "16px 20px", borderBottom: i < studsWithoutSub.length - 1 ? "1px solid #21262d" : "none",
                cursor: isCan ? "default" : "pointer", transition: "background 0.2s",
                background: attended ? "rgba(249,160,63,0.08)" : "transparent", opacity: isCan ? 0.5 : 1
              }}>
                <div>
                  <div style={{ color: "#fff", fontSize: 16, fontWeight: 500 }}>{student.name}</div>
                  <div style={{ color: attended ? "#F9A03F" : "#E84855", fontSize: 13, marginTop: 4 }}>
                    {attended ? "✅ Разове гостьове" : (sub ? "Абонемент закінчився" : "Немає абонемента")}
                  </div>
                </div>
                <div style={{
                  width: 26, height: 26, borderRadius: 6, border: `2px solid ${attended ? "#F9A03F" : "#30363d"}`,
                  background: attended ? "#F9A03F" : "transparent", display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontSize: 16, fontWeight: "bold", transition: "all 0.2s"
                }}>
                  {attended && "✓"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {manualGuests.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: "#8892b0", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600, paddingLeft: 4 }}>
            Нові гості ({manualGuests.length})
          </div>
          <div style={{ background: "#161b22", borderRadius: 12, border: "1px solid #21262d", overflow: "hidden" }}>
            {manualGuests.map((g, i) => (
              <div key={g.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "16px 20px", borderBottom: i < manualGuests.length - 1 ? "1px solid #21262d" : "none",
              }}>
                <div>
                  <div style={{ color: "#fff", fontSize: 16, fontWeight: 500 }}>{g.guestName}</div>
                  <div style={{ color: g.entryType === "trial" ? "#2ECC71" : "#F9A03F", fontSize: 13, marginTop: 4 }}>
                    {g.entryType === "trial" ? "Пробне" : "Разове"}
                  </div>
                </div>
                <button onClick={() => removeGuest(g.id)} style={{ background: "none", border: "none", color: "#E84855", fontSize: 24, cursor: "pointer", padding: "0 8px" }}>×</button>
              </div>
            ))}
          </div>
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
    </div>
  );
}

// ═══════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════
export default function App() {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [subs, setSubs] = useState([]);
  const [attn, setAttn] = useState([]);
  const [groups, setGroups] = useState(DEFAULT_GROUPS);
  const [cancelled, setCancelled] = useState([]);
  const [modLog, setModLog] = useState([]);
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

  // ─── LOAD ───
  useEffect(()=>{(async()=>{try{
    const [st,gr,su,at,ca,ml,sg]=await Promise.all([db.fetchStudents(),db.fetchGroups(),db.fetchSubs(),db.fetchAttendance(),db.fetchCancelled(),db.fetchModLog(),db.fetchStudentGroups()]);
    setStudents(st||[]);if(gr?.length)setGroups(gr);setSubs(su||[]);setAttn(at||[]);setCancelled(ca||[]);setModLog(ml||[]);setStudentGrps(sg||[]);
    try { if (db.fetchWaitlist) { const wl = await db.fetchWaitlist(); setWaitlist(wl || []); } } catch(e) {}
  }catch(e){console.error("Load error:",e)}setLoading(false)})()},[]);

  // ─── MAPS ───
  const studentMap = useMemo(()=>Object.fromEntries(students.map(s=>[s.id,s])),[students]);
  const groupMap = useMemo(()=>Object.fromEntries(groups.map(g=>[g.id,g])),[groups]);
  const dirMap = useMemo(()=>Object.fromEntries(DIRECTIONS.map(d=>[d.id,d])),[]);
  const subsExt = useMemo(()=>subs.map(s=>({...s,status:getSubStatus(s)})),[subs]);
  const activeSubs = useMemo(()=>subsExt.filter(s=>s.status!=="expired"),[subsExt]);
  const warnSubs = useMemo(()=>subsExt.filter(s=>s.status==="warning"),[subsExt]);
  const expSubs = useMemo(()=>subsExt.filter(s=>s.status==="expired"),[subsExt]);

  // ─── NOTIFICATIONS ───
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

  function getNotifMsg(sub,student,group,direction){
    const name=student?.name?.split(" ")[0]||"";
    const gName=group?.name||"";
    const dName=direction?.name||"";
    const tpl=student?.messageTemplate||student?.message_template;
    if(tpl)return tpl.replace(/\{ім'я\}/g,name).replace(/\{група\}/g,gName).replace(/\{напрямок\}/g,dName);
    return `Привіт, ${name}! 💃\nНагадуємо, що твій абонемент у групі ${gName} (${dName}) закінчився.\nЧекаємо на продовження! ❤️`;
  }

  // ═══ FORMS ═══
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
      <Field label="Учениця *"><select style={inputSt} value={studentId} onChange={e=>setStudentId(e.target.value)}><option value="">Обрати...</option>{students.sort((a,b)=>a.name.localeCompare(b.name,"uk")).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <Field label="Група *"><select style={inputSt} value={groupId} onChange={e=>setGroupId(e.target.value)}><option value="">Обрати...</option>{DIRECTIONS.map(d=><optgroup key={d.id} label={d.name}>{groups.filter(g=>g.directionId===d.id).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</optgroup>)}</select></Field>
      <Field label="Тип"><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{PLAN_TYPES.map(p=><Pill key={p.id} active={planType===p.id} onClick={()=>setPlanType(p.id)}>{p.name} ({p.trainings}) — {p.price}₴</Pill>)}</div></Field>
      
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {/* Додано виклик календаря (showPicker) при кліку */}
        <Field label="Початок (натисніть)"><input style={{...inputSt, cursor: "pointer"}} type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} onClick={(e) => e.target.showPicker && e.target.showPicker()} /></Field>
        <Field label="Кінець (авто)"><input style={{...inputSt,opacity:.6, cursor: "not-allowed"}} type="date" value={endDate} readOnly/></Field>
      </div>

      <div style={{background:"#161b22",borderRadius:8,padding:"12px 14px",marginBottom:12,border:"1px solid #21262d"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Field label="Знижка (%)"><input style={{...inputSt,width:80}} type="number" min={0} max={100} value={discountPct} onChange={e=>setDiscountPct(Math.min(100,Math.max(0,+e.target.value)))}/></Field>
          <Field label="За рахунок"><div style={{display:"flex",gap:4}}><Pill active={discountSource==="studio"} onClick={()=>setDiscountSource("studio")}>Студії</Pill><Pill active={discountSource==="trainer"} onClick={()=>setDiscountSource("trainer")}>Тренера</Pill><Pill active={discountSource==="split"} onClick={()=>setDiscountSource("split")}>50/50</Pill></div></Field>
        </div>
        {discountPct>0&&<div style={{fontSize:12,color:"#F9A03F",marginTop:6}}>Базова: {basePrice}₴ → -{Math.round(basePrice*discountPct/100)}₴ → <strong style={{color:"#2ECC71"}}>{basePrice-Math.round(basePrice*discountPct/100)}₴</strong></div>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <Field label="Сума (грн)"><input style={inputSt} type="number" min={0} value={amount} onChange={e=>setAmount(+e.target.value)}/></Field>
        <Field label="Оплата"><div style={{display:"flex",gap:6}}>{PAY_METHODS.map(m=><Pill key={m.id} active={payMethod===m.id} onClick={()=>setPayMethod(m.id)}>{m.name}</Pill>)}</div></Field>
      </div>
      <label style={{display:"flex",alignItems:"center",gap:8,color:"#c9d1d9",cursor:"pointer",fontSize:14,marginBottom:8}}><input type="checkbox" checked={paid} onChange={e=>setPaid(e.target.checked)}/> Оплачено</label>
      <Field label="Нотатки"><textarea style={{...inputSt,minHeight:40,resize:"vertical"}} value={notes} onChange={e=>setNotes(e.target.value)}/></Field>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:14}}>
        <button style={btnS} onClick={()=>setModal(null)}>Скасувати</button>
        <button style={{...btnP,opacity:studentId&&groupId?1:.4}} onClick={()=>{if(!studentId||!groupId)return;onDone({studentId,groupId,planType,startDate,endDate,totalTrainings,usedTrainings:initial?.usedTrainings||0,amount,paid,payMethod,discountPct,discountSource,basePrice,notes,notificationSent:initial?.notificationSent||false})}}>{initial?"Зберегти":"Додати"}</button>
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
      <Field label="Учениця *"><select style={inputSt} value={studentId} onChange={e=>setStudentId(e.target.value)}><option value="">Обрати...</option>{students.sort((a,b)=>a.name.localeCompare(b.name,"uk")).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <Field label="Група *"><select style={inputSt} value={groupId} onChange={e=>setGroupId(e.target.value)}><option value="">Обрати...</option>{DIRECTIONS.map(d=><optgroup key={d.id} label={d.name}>{groups.filter(g=>g.directionId===d.id).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</optgroup>)}</select></Field>
      <Field label="Тип"><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{PLAN_TYPES.map(p=><Pill key={p.id} active={planType===p.id} onClick={()=>setPlanType(p.id)}>{p.name} ({p.trainings}) — {p.price}₴</Pill>)}</div></Field>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <Field label="Початок"><input style={inputSt} type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></Field>
        <Field label="Кінець (авто)"><input style={{...inputSt,opacity:.6}} type="date" value={endDate} readOnly/></Field>
      </div>
      <div style={{background:"#161b22",borderRadius:8,padding:"12px 14px",marginBottom:12,border:"1px solid #21262d"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Field label="Знижка (%)"><input style={{...inputSt,width:80}} type="number" min={0} max={100} value={discountPct} onChange={e=>setDiscountPct(Math.min(100,Math.max(0,+e.target.value)))}/></Field>
          <Field label="За рахунок"><div style={{display:"flex",gap:4}}><Pill active={discountSource==="studio"} onClick={()=>setDiscountSource("studio")}>Студії</Pill><Pill active={discountSource==="trainer"} onClick={()=>setDiscountSource("trainer")}>Тренера</Pill><Pill active={discountSource==="split"} onClick={()=>setDiscountSource("split")}>50/50</Pill></div></Field>
        </div>
        {discountPct>0&&<div style={{fontSize:12,color:"#F9A03F",marginTop:6}}>Базова: {basePrice}₴ → -{Math.round(basePrice*discountPct/100)}₴ → <strong style={{color:"#2ECC71"}}>{basePrice-Math.round(basePrice*discountPct/100)}₴</strong></div>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <Field label="Сума (грн)"><input style={inputSt} type="number" min={0} value={amount} onChange={e=>setAmount(+e.target.value)}/></Field>
        <Field label="Оплата"><div style={{display:"flex",gap:6}}>{PAY_METHODS.map(m=><Pill key={m.id} active={payMethod===m.id} onClick={()=>setPayMethod(m.id)}>{m.name}</Pill>)}</div></Field>
      </div>
      <label style={{display:"flex",alignItems:"center",gap:8,color:"#c9d1d9",cursor:"pointer",fontSize:14,marginBottom:8}}><input type="checkbox" checked={paid} onChange={e=>setPaid(e.target.checked)}/> Оплачено</label>
      <Field label="Нотатки"><textarea style={{...inputSt,minHeight:40,resize:"vertical"}} value={notes} onChange={e=>setNotes(e.target.value)}/></Field>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:14}}>
        <button style={btnS} onClick={()=>setModal(null)}>Скасувати</button>
        <button style={{...btnP,opacity:studentId&&groupId?1:.4}} onClick={()=>{if(!studentId||!groupId)return;onDone({studentId,groupId,planType,startDate,endDate,totalTrainings,usedTrainings:initial?.usedTrainings||0,amount,paid,payMethod,discountPct,discountSource,basePrice,notes,notificationSent:initial?.notificationSent||false})}}>{initial?"Зберегти":"Додати"}</button>
      </div>
    </div>);
  }

  function WaitlistForm({onDone}) {
    const [studentId, setStudentId] = useState("");
    const [groupId, setGroupId] = useState("");
    return (<div>
      <Field label="Учениця *"><select style={inputSt} value={studentId} onChange={e=>setStudentId(e.target.value)}><option value="">Обрати...</option>{students.sort((a,b)=>a.name.localeCompare(b.name,"uk")).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <Field label="В яку групу чекає? *"><GroupSelect groups={groups} value={groupId} onChange={setGroupId} /></Field>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:14}}>
        <button style={btnS} onClick={()=>setModal(null)}>Скасувати</button>
        <button style={{...btnP,opacity:studentId&&groupId?1:.4}} onClick={()=>{if(studentId&&groupId) onDone({studentId, groupId, dateAdded: today()})}}>В резерв</button>
      </div>
    </div>)
  }

  // ═══ HANDLERS ═══
  const addStudent=async(d)=>{try{const{selectedGroups,...sd}=d;const s=await db.insertStudent(sd);setStudents(p=>[...p,s]);if(selectedGroups?.length)for(const gid of selectedGroups){const sg=await db.addStudentGroup(s.id,gid);setStudentGrps(p=>[...p,sg])}}catch(e){alert("Помилка: "+e.message)}setModal(null)};
  const editStudent=async(d)=>{try{const{selectedGroups,...sd}=d;const s=await db.updateStudent(editItem.id,sd);setStudents(p=>p.map(x=>x.id===s.id?s:x));if(selectedGroups){const existing=studentGrps.filter(sg=>sg.studentId===editItem.id);for(const sg of existing){if(!selectedGroups.includes(sg.groupId))await db.removeStudentGroup(editItem.id,sg.groupId)}for(const gid of selectedGroups){if(!existing.some(sg=>sg.groupId===gid))await db.addStudentGroup(editItem.id,gid)}const fresh=await db.fetchStudentGroups();setStudentGrps(fresh)}}catch(e){alert("Помилка: "+e.message)}setModal(null);setEditItem(null)};
  const deleteStudent=async(id)=>{if(!confirm("Видалити?"))return;try{await db.deleteStudent(id);setStudents(p=>p.filter(s=>s.id!==id));setSubs(p=>p.filter(s=>s.studentId!==id))}catch(e){alert(e.message)}};
  const addSub=async(d)=>{try{const s=await db.insertSub(d);setSubs(p=>[s,...p])}catch(e){alert(e.message)}setModal(null)};
  const editSub=async(d)=>{try{const s=await db.updateSub(editItem.id,d);setSubs(p=>p.map(x=>x.id===s.id?s:x))}catch(e){alert(e.message)}setModal(null);setEditItem(null)};
  const deleteSub=async(id)=>{if(!confirm("Видалити?"))return;try{await db.deleteSub(id);setAttn(p=>p.filter(a=>a.subId!==id));setSubs(p=>p.filter(s=>s.id!==id))}catch(e){alert(e.message)}};
  const markNotified=async(subId)=>{try{await db.updateSub(subId,{notificationSent:true});setSubs(p=>p.map(s=>s.id===subId?{...s,notificationSent:true}:s))}catch(e){console.error(e)}};
  const addWaitlist=async(d)=>{try{if(db.insertWaitlist){const w=await db.insertWaitlist(d);setWaitlist(p=>[...p,w]);}else{setWaitlist(p=>[...p,{...d, id:uid()}])}}catch(e){console.error(e)}setModal(null)};
  const removeWaitlist=async(id)=>{try{if(db.deleteWaitlist) await db.deleteWaitlist(id);setWaitlist(p=>p.filter(w=>w.id!==id));}catch(e){console.error(e)}};

  // ═══ FILTERED DATA ═══
  const filteredSubs=useMemo(()=>{
    let r=subsExt;
    if(filterDir!=="all"){const gids=groups.filter(g=>g.directionId===filterDir).map(g=>g.id);r=r.filter(s=>gids.includes(s.groupId))}
    if(filterGroup!=="all")r=r.filter(s=>s.groupId===filterGroup);
    if(filterStatus!=="all")r=r.filter(s=>s.status===filterStatus);
    if(searchQ){const q=searchQ.toLowerCase();r=r.filter(s=>studentMap[s.studentId]?.name?.toLowerCase().includes(q))}
    return r.sort((a,b)=>({warning:0,active:1,expired:2}[a.status]??3)-({warning:0,active:1,expired:2}[b.status]??3));
  },[subsExt,filterDir,filterGroup,filterStatus,searchQ,groups,studentMap]);

  const filteredStudents=useMemo(()=>{
    let r=students;
    if(searchQ){const q=searchQ.toLowerCase();r=r.filter(s=>s.name.toLowerCase().includes(q)||s.phone?.includes(q)||s.telegram?.toLowerCase().includes(q))}
    if(stFilterDir !== "all"){
        const gids = groups.filter(g => g.directionId === stFilterDir).map(g => g.id);
        r = r.filter(st => studentGrps.some(sg => sg.studentId === st.id && gids.includes(sg.groupId)));
    }
    if(stFilterGroup !== "all"){
        r = r.filter(st => studentGrps.some(sg => sg.studentId === st.id && sg.groupId === stFilterGroup));
    }
    return r.sort((a,b)=>a.name.localeCompare(b.name,"uk"));
  },[students, searchQ, stFilterDir, stFilterGroup, groups, studentGrps]);

  const studentsByDirection=useMemo(()=>{
    const result={};
    DIRECTIONS.forEach(d=>{result[d.id]={direction:d,students:[]}});
    const ungrouped=[];
    filteredStudents.forEach(st=>{
      const stGroups=studentGrps.filter(sg=>sg.studentId===st.id);
      if(stGroups.length===0){ungrouped.push(st);return}
      const dirs=new Set();
      stGroups.forEach(sg=>{const g=groupMap[sg.groupId];if(g)dirs.add(g.directionId)});
      dirs.forEach(did=>{if(result[did])result[did].students.push(st)});
    });
    return{grouped:Object.values(result).filter(d=>d.students.length>0),ungrouped};
  },[filteredStudents,studentGrps,groupMap]);

  const subsGroupedByDir = useMemo(()=>{
    const result={};
    DIRECTIONS.forEach(d=>{result[d.id]={direction:d,subs:[]}});
    const ungrouped=[];
    filteredSubs.forEach(sub=>{
      const gr=groupMap[sub.groupId];
      if(!gr){ungrouped.push(sub);return;}
      if(result[gr.directionId]){result[gr.directionId].subs.push(sub);}else{ungrouped.push(sub);}
    });
    return {grouped:Object.values(result).filter(d=>d.subs.length>0), ungrouped};
  },[filteredSubs, groupMap]);

  // ─── DEEP ANALYTICS ───
  const analytics=useMemo(()=>{
    const activeStudentIds=new Set(activeSubs.map(s=>s.studentId));
    const totalRev=subs.filter(s=>s.paid).reduce((a,s)=>a+(s.amount||0),0);
    const unpaid=subs.filter(s=>!s.paid&&getSubStatus(s)!=="expired").reduce((a,s)=>a+(s.amount||0),0);
    const byDir={};DIRECTIONS.forEach(d=>{const gids=groups.filter(g=>g.directionId===d.id).map(g=>g.id);const ds=activeSubs.filter(s=>gids.includes(s.groupId));byDir[d.id]={students:new Set(ds.map(s=>s.studentId)).size}});
    
    const splits=[];
    groups.forEach(g=>{
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
        const hadFull = stSubs.some(s => s.planType !== "trial");
        if(hadTrial) { trialUsers++; if(hadFull) convertedUsers++; }
      }
    });

    const avgLTV = usersWithPurchases > 0 ? Math.round(totalLTV / usersWithPurchases) : 0;
    const conversionRate = trialUsers > 0 ? Math.round((convertedUsers / trialUsers) * 100) : 0;

    return{totalStudents:students.length,activeStudents:activeStudentIds.size,totalRev,unpaid,byDir,splits, avgLTV, conversionRate};
  },[students,subs,activeSubs,groups, studentMap]);

  if(loading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0d1117",color:"#8892b0",fontFamily:"DM Sans,sans-serif"}}>Завантаження...</div>;

  const TABS=[
    {id:"dashboard",icon:"📊",label:"Дашборд"},
    {id:"students",icon:"👩‍🎤",label:"Учениці"},
    {id:"subs",icon:"🎫",label:"Абонементи"},
    {id:"attendance",icon:"✅",label:"Відвідування"},
    {id:"alerts",icon:notifications.filter(n=>!n.notified).length?"🔴":"🔔",label:"Сповіщення"},
    {id:"finance",icon:"💰",label:"Фінанси"},
  ];

  return (
    <div style={{minHeight:"100vh",background:"#0d1117",color:"#c9d1d9",fontFamily:"'DM Sans',-apple-system,sans-serif", paddingBottom: 60}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>

      <header style={{background:"linear-gradient(135deg,#1a1a2e,#16213e)",borderBottom:"1px solid #21262d",padding:"14px 20px"}}>
        <div style={{maxWidth:1200,margin:"0 auto",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
          <div><h1 style={{margin:0,fontSize:20,fontWeight:700,color:"#fff"}}>💃 Dance Studio</h1></div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <button style={{...btnP,fontSize:12,padding:"8px 14px"}} onClick={()=>setModal("addStudent")}>+ Учениця</button>
            <button style={{...btnP,fontSize:12,padding:"8px 14px",background:"#7B2D8E"}} onClick={()=>setModal("addSub")}>+ Абонемент</button>
          </div>
        </div>
      </header>

      <nav style={{background:"#161b22",borderBottom:"1px solid #21262d",overflowX:"auto"}}>
        <div style={{maxWidth:1200,margin:"0 auto",display:"flex",padding:"0 16px"}}>
          {TABS.map(t=><button key={t.id} onClick={()=>{setTab(t.id);setSearchQ("")}} style={{padding:"10px 14px",background:"none",border:"none",borderBottom:tab===t.id?"2px solid #E84855":"2px solid transparent",color:tab===t.id?"#fff":"#8892b0",fontSize:12,fontWeight:500,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit"}}>{t.icon} {t.label}</button>)}
        </div>
      </nav>

      <main style={{maxWidth:1200,margin:"0 auto",padding:20}}>

        {tab==="dashboard"&&<div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12,marginBottom:24}}>
            {[{l:"Учениць",v:analytics.totalStudents,s:`${analytics.activeStudents} активних`,c:"#3498DB"},{l:"Абонементів",v:activeSubs.length,s:`${warnSubs.length} закінч.`,c:"#2ECC71"},{l:"Дохід",v:`${analytics.totalRev.toLocaleString()}₴`,s:`${analytics.unpaid.toLocaleString()}₴ неопл.`,c:"#F9A03F"},{l:"Сповіщення",v:notifications.filter(n=>!n.notified).length,s:"непрочит.",c:"#E84855"}].map((c,i)=><div key={i} style={{...cardSt,borderLeft:`3px solid ${c.c}`}}><div style={{fontSize:10,color:"#8892b0",textTransform:"uppercase"}}>{c.l}</div><div style={{fontSize:24,fontWeight:700,color:"#fff",margin:"2px 0"}}>{c.v}</div><div style={{fontSize:11,color:"#8892b0"}}>{c.s}</div></div>)}
          </div>
          
          <h3 style={{color:"#fff",fontSize:16,marginBottom:12, borderBottom: "1px solid #21262d", paddingBottom: 8}}>Глибока аналітика 🧠</h3>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12,marginBottom:24}}>
            <div style={{...cardSt, borderTop: "3px solid #9B59B6"}}>
              <div style={{fontSize:11,color:"#8892b0",textTransform:"uppercase"}}>LTV (Середній чек за весь час)</div>
              <div style={{fontSize:22,fontWeight:700,color:"#fff",margin:"4px 0"}}>{analytics.avgLTV.toLocaleString()} ₴</div>
              <div style={{fontSize:11,color:"#8892b0"}}>З однієї учениці</div>
            </div>
            <div style={{...cardSt, borderTop: "3px solid #E67E22"}}>
              <div style={{fontSize:11,color:"#8892b0",textTransform:"uppercase"}}>Конверсія з пробного</div>
              <div style={{fontSize:22,fontWeight:700,color:"#fff",margin:"4px 0"}}>{analytics.conversionRate} %</div>
              <div style={{fontSize:11,color:"#8892b0"}}>Купили повний абонемент</div>
            </div>
          </div>

          <h3 style={{color:"#fff",fontSize:16,marginBottom:12, borderBottom: "1px solid #21262d", paddingBottom: 8}}>За напрямками</h3>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10}}>
            {DIRECTIONS.map(d=>{const data=analytics.byDir[d.id]||{students:0};return<div key={d.id} style={{...cardSt,borderTop:`3px solid ${d.color}`}}><div style={{fontSize:12,fontWeight:600,color:d.color}}>{d.name}</div><div style={{fontSize:20,fontWeight:700,color:"#fff"}}>{data.students}</div></div>})}
          </div>
        </div>}

        {tab==="students"&&<div>
          <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",justifyContent:"space-between", background: "#161b22", padding: 12, borderRadius: 10}}>
            <div style={{display: "flex", gap: 8, flexWrap: "wrap", flex: 1}}>
              <input style={{...inputSt,maxWidth:250}} placeholder="Пошук..." value={searchQ} onChange={e=>setSearchQ(e.target.value)}/>
              <select style={{...inputSt,width:"auto"}} value={stFilterDir} onChange={e=>{setStFilterDir(e.target.value);setStFilterGroup("all")}}>
                <option value="all">Всі напрямки</option>
                {DIRECTIONS.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <GroupSelect groups={groups} value={stFilterGroup} onChange={setStFilterGroup} filterDir={stFilterDir} allowAll={true} />
            </div>
            <button style={{...btnP, background: "#F9A03F", height: "fit-content"}} onClick={()=>setModal("addWaitlist")}>+ В резерв</button>
          </div>
          
          <div style={{display:"flex",flexDirection:"column",gap:10, marginBottom: 20}}>
            {studentsByDirection.grouped.map(({direction,students:dStudents})=>{
              const isExpanded = expandedDirs[direction.id];
              return (
                <div key={direction.id} style={{border:`1px solid #21262d`, borderRadius: 10, overflow: 'hidden'}}>
                  <button onClick={() => setExpandedDirs(p => ({...p, [direction.id]: !p[direction.id]}))} style={{width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 18px', background:'#161b22', border:'none', cursor:'pointer', textAlign:'left'}}>
                    <div style={{fontSize:15,fontWeight:600,color:direction.color}}>{direction.name} <span style={{color:"#8892b0",fontSize:13,fontWeight:400}}>({dStudents.length})</span></div>
                    <div style={{color:"#8892b0", fontSize: 12}}>{isExpanded ? "▲" : "▼"}</div>
                  </button>
                  {isExpanded && (<div style={{padding:'12px 18px', background:'#0d1117', borderTop:`1px solid #21262d`, display:'flex', flexDirection:'column', gap:6}}>
                    {dStudents.map(st => {
                      const active=subsExt.filter(s=>s.studentId===st.id && s.status!=="expired");
                      return <div key={st.id} style={{...cardSt,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6,marginBottom:6}}>
                        <div style={{minWidth:180}}>
                          <div style={{color:"#fff",fontWeight:600,fontSize:14}}>{st.name}</div>
                          <div style={{color:"#8892b0",fontSize:11}}>{[st.phone,st.telegram].filter(Boolean).join(" · ")||"—"}</div>
                        </div>
                        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{active.map(s=>{const g=groupMap[s.groupId];const d=g?dirMap[g.directionId]:null;return <Badge key={s.id} color={d?.color||"#888"}>{g?.name} ({s.usedTrainings}/{s.totalTrainings})</Badge>})}</div>
                        <div style={{display:"flex",gap:4}}><button style={{...btnS,padding:"5px 10px",fontSize:11}} onClick={()=>{setEditItem(st);setModal("editStudent")}}>✏️</button><button style={{...btnS,padding:"5px 10px",fontSize:11,color:"#E84855"}} onClick={()=>deleteStudent(st.id)}>🗑</button></div>
                      </div>
                    })}
                  </div>)}
                </div>
              );
            })}
          </div>

          {waitlist.length > 0 && (
            <div style={{border:`1px solid #F9A03F44`, borderRadius: 10, overflow: 'hidden', background: "#161b22"}}>
              <div style={{padding:'14px 18px', borderBottom: "1px solid #21262d", display: "flex", justifyContent: "space-between"}}>
                <span style={{fontSize:15,fontWeight:600,color:"#F9A03F"}}>⏳ Лист очікування ({waitlist.length})</span>
              </div>
              <div style={{padding:'12px 18px', display:'flex', flexDirection:'column', gap:6}}>
                {waitlist.map(w => {
                  const st = studentMap[w.studentId];
                  const gr = groupMap[w.groupId];
                  if(!st || !gr) return null;
                  return (
                    <div key={w.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center", background: "#0d1117", padding: "10px 14px", borderRadius: 8}}>
                      <div>
                        <div style={{color:"#fff",fontWeight:500,fontSize:14}}>{st.name}</div>
                        <div style={{color:"#8892b0",fontSize:11}}>Хоче в: <strong style={{color:"#e6edf3"}}>{gr.name}</strong></div>
                      </div>
                      <button style={{...btnS,padding:"5px 10px",fontSize:11,color:"#E84855"}} onClick={()=>removeWaitlist(w.id)}>Видалити</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>}

        {tab==="subs"&&<div>
          <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap", background: "#161b22", padding: 12, borderRadius: 10}}>
            <input style={{...inputSt,width:"auto",minWidth:180, flexGrow: 1}} placeholder="Пошук за іменем..." value={searchQ} onChange={e=>setSearchQ(e.target.value)}/>
            <select style={{...inputSt,width:"auto"}} value={filterDir} onChange={e=>{setFilterDir(e.target.value);setFilterGroup("all")}}>
              <option value="all">Всі напрямки</option>
              {DIRECTIONS.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <GroupSelect groups={groups} value={filterGroup} onChange={setFilterGroup} filterDir={filterDir} allowAll={true} />
            <select style={{...inputSt,width:"auto"}} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
              <option value="all">Всі статуси</option><option value="active">Активні</option><option value="warning">Закінчуються</option><option value="expired">Протерміновані</option>
            </select>
          </div>
          
          {filteredSubs.length===0?<div style={{color:"#8892b0",padding:40,textAlign:"center"}}>Немає абонементів</div>:
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {subsGroupedByDir.grouped.filter(d => filterDir === "all" || d.direction.id === filterDir).map(({direction, subs: dSubs}) => {
              const finalSubs = filterGroup !== "all" ? dSubs.filter(s => s.groupId === filterGroup) : dSubs;
              if (finalSubs.length === 0) return null;
              
              const isExpanded = expandedSubDirs[direction.id];
              return (
                <div key={direction.id} style={{border:`1px solid #21262d`, borderRadius: 10, overflow: 'hidden'}}>
                  <button onClick={() => setExpandedSubDirs(p => ({...p, [direction.id]: !p[direction.id]}))} style={{width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 18px', background:'#161b22', border:'none', cursor:'pointer', textAlign:'left'}}>
                    <div style={{fontSize:15,fontWeight:600,color:direction.color}}>{direction.name} <span style={{color:"#8892b0",fontSize:13,fontWeight:400}}>({finalSubs.length})</span></div>
                    <div style={{color:"#8892b0", fontSize: 12}}>{isExpanded ? "▲" : "▼"}</div>
                  </button>
                  {isExpanded && (
                    <div style={{overflowX: "auto", background:'#0d1117'}}>
                      <table style={{width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left"}}>
                        <thead>
                          <tr style={{color: "#8892b0", textTransform: "uppercase", fontSize: 11, letterSpacing: 0.5}}>
                            <th style={{padding: "12px 14px", fontWeight: 500}}>Учениця</th>
                            <th style={{padding: "12px 14px", fontWeight: 500}}>Група</th>
                            <th style={{padding: "12px 14px", fontWeight: 500}}>Абонемент</th>
                            <th style={{padding: "12px 14px", fontWeight: 500}}>Заняття</th>
                            <th style={{padding: "12px 14px", fontWeight: 500}}>Термін</th>
                            <th style={{padding: "12px 14px", fontWeight: 500}}>Статус</th>
                            <th style={{padding: "12px 14px", fontWeight: 500, textAlign: "right"}}>Дії</th>
                          </tr>
                        </thead>
                        <tbody>
                          {finalSubs.map(sub => {
                            const st=studentMap[sub.studentId], gr=groupMap[sub.groupId], planLabel=PLAN_TYPES.find(p=>p.id===sub.planType)?.name||sub.planType;
                            return <tr key={sub.id} style={{borderTop: "1px solid #21262d"}}>
                              <td style={{padding: "10px 14px", color: "#fff", fontWeight: 500, whiteSpace:"nowrap"}}>{st?.name||"?"}</td>
                              <td style={{padding: "10px 14px", whiteSpace:"nowrap"}}><span style={{color: "#8892b0", fontSize:12}}>{gr?.name}</span></td>
                              <td style={{padding: "10px 14px", whiteSpace:"nowrap"}}><span style={{color: "#c9d1d9", fontSize:12}}>{planLabel}</span></td>
                              <td style={{padding: "10px 14px", whiteSpace:"nowrap"}}><span style={{color: "#fff", fontWeight: 600}}>{sub.usedTrainings}</span><span style={{color: "#8892b0", fontSize:12}}> / {sub.totalTrainings}</span></td>
                              <td style={{padding: "10px 14px", whiteSpace:"nowrap"}}><span style={{color: "#8892b0", fontSize:12, fontFamily:"monospace"}}>{fmt(sub.startDate)} — {fmt(sub.endDate)}</span></td>
                              <td style={{padding: "10px 14px", whiteSpace:"nowrap"}}><Badge color={STATUS_COLORS[sub.status]}>{STATUS_LABELS[sub.status]}</Badge>{!sub.paid&&<span style={{marginLeft: 6}}><Badge color="#E84855">💰 Борг</Badge></span>}</td>
                              <td style={{padding: "10px 14px", textAlign: "right", whiteSpace:"nowrap"}}>
                                <button style={{background:"none",border:"none",cursor:"pointer",fontSize:14,marginRight:12}} onClick={()=>{setEditItem(sub);setModal("editSub")}}>✏️</button>
                                <button style={{background:"none",border:"none",cursor:"pointer",fontSize:14}} onClick={()=>deleteSub(sub.id)}>🗑</button>
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

        {/* ─── ВІДВІДУВАННЯ ─── */}
        {tab==="attendance" && (
          <AttendanceTab 
            groups={groups} subs={subs} setSubs={setSubs} attn={attn} setAttn={setAttn}
            studentMap={studentMap} studentGrps={studentGrps} cancelled={cancelled}
          />
        )}

        {tab==="alerts"&&<div>
          {notifications.length===0?<div style={{textAlign:"center",padding:50,color:"#8892b0"}}>✨ Все добре!</div>:
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {notifications.map(n=>{
              const msg=getNotifMsg(null,n.student,n.group,n.direction);
              const tgUser=n.student?.telegram?.replace("@","");
              const tgLink=tgUser?`https://t.me/${tgUser}?text=${encodeURIComponent(msg)}`:null;
              return<div key={n.subId} style={{...cardSt,borderLeft:`3px solid ${n.type==="expired"?"#E84855":"#F9A03F"}`,opacity:n.notified?.6:1}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
                  <div><span style={{color:"#fff",fontWeight:600}}>{n.student?.name}</span> <Badge color={n.type==="expired"?"#E84855":"#F9A03F"}>{n.message}</Badge>{n.notified&&<Badge color="#8892b0">✅</Badge>}<div style={{color:"#8892b0",fontSize:12,marginTop:2}}>{n.group?.name}</div></div>
                  <div style={{display:"flex",gap:6}}>
                    {tgLink&&<a href={tgLink} target="_blank" rel="noopener noreferrer" onClick={()=>markNotified(n.subId)} style={{padding:"6px 12px",borderRadius:8,background:"#229ED922",color:"#229ED9",fontSize:11,textDecoration:"none",border:"1px solid #229ED944"}}>💬 Telegram</a>}
                    {!n.notified&&<button style={{...btnS,padding:"6px 12px",fontSize:11}} onClick={()=>markNotified(n.subId)}>Позначити</button>}
                  </div>
                </div>
              </div>})}
          </div>}
        </div>}

        {/* ─── ОНОВЛЕНІ ФІНАНСИ З АНАЛІТИКОЮ ─── */}
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
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:16,marginBottom:24}}>
                <div style={{...cardSt, borderTop:"4px solid #2ECC71", background: "linear-gradient(180deg, rgba(46,204,113,0.05), transparent)"}}>
                  <div style={{fontSize:12,color:"#8892b0",textTransform:"uppercase", letterSpacing: 1}}>Загалом оплачено</div>
                  <div style={{fontSize:32,fontWeight:700,color:"#2ECC71", marginTop: 4}}>{analytics.totalRev.toLocaleString()} ₴</div>
                </div>
                <div style={{...cardSt, borderTop:"4px solid #E84855", background: "linear-gradient(180deg, rgba(232,72,85,0.05), transparent)"}}>
                  <div style={{fontSize:12,color:"#8892b0",textTransform:"uppercase", letterSpacing: 1}}>Борги учениць (очікується)</div>
                  <div style={{fontSize:32,fontWeight:700,color:"#E84855", marginTop: 4}}>{analytics.unpaid.toLocaleString()} ₴</div>
                </div>
              </div>

              <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap", background: "#161b22", padding: 14, borderRadius: 12, border: "1px solid #21262d"}}>
                <div style={{flex: 1, display: "flex", gap: 10, minWidth: 300, flexWrap: "wrap"}}>
                  <select style={{...inputSt, width: "auto"}} value={finFilterDir} onChange={e=>{setFinFilterDir(e.target.value); setFinFilterGroup("all");}}>
                    <option value="all">Всі напрямки</option>
                    {DIRECTIONS.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <GroupSelect groups={groups} value={finFilterGroup} onChange={setFinFilterGroup} filterDir={finFilterDir} allowAll={true} />
                </div>
                <div style={{display: "flex", gap: 10, flexWrap: "wrap"}}>
                  <select style={{...inputSt, width: "auto"}} value={finSortBy} onChange={e=>setFinSortBy(e.target.value)}>
                    <option value="total">За доходом</option>
                    <option value="trainer">За ЗП тренера</option>
                    <option value="studio">За доходом студії</option>
                    <option value="name">За назвою</option>
                  </select>
                  <button style={{...btnS, padding: "0 14px", fontSize: 16}} onClick={()=>setFinSortOrder(p=>p==="desc"?"asc":"desc")}>
                    {finSortOrder === "desc" ? "⬇" : "⬆"}
                  </button>
                </div>
              </div>

              <h3 style={{color:"#fff",fontSize:16,marginBottom:16, fontWeight: 600}}>Деталізація по групах ({finData.length})</h3>
              
              {finData.length === 0 ? <div style={{color:"#8892b0",padding:40,textAlign:"center"}}>За цими фільтрами немає оплат</div> :
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {finData.map(sp => {
                  const dir = dirMap[sp.group.directionId];
                  const trainerPct = sp.group.trainerPct;
                  const studioPct = 100 - trainerPct;
                  const paidCount = sp.subs.length;
                  
                  return (
                    <div key={sp.group.id} style={{background: "#161b22", borderRadius: 12, border: "1px solid #21262d", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14}}>
                      <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10}}>
                        <div>
                          <div style={{display: "flex", alignItems: "center", gap: 8, marginBottom: 4}}>
                            <span style={{color:"#fff",fontWeight:600, fontSize: 16}}>{sp.group.name}</span>
                            <Badge color={dir?.color||"#888"}>{dir?.name}</Badge>
                          </div>
                          <div style={{fontSize: 12, color: "#8892b0"}}>Оплачених абонементів: <strong style={{color: "#c9d1d9"}}>{paidCount}</strong></div>
                        </div>
                        <div style={{textAlign: "right"}}>
                          <div style={{fontSize: 11, color: "#8892b0", textTransform: "uppercase"}}>Загальний збір</div>
                          <div style={{fontSize: 22, fontWeight: 700, color: "#fff"}}>{sp.total.toLocaleString()} ₴</div>
                        </div>
                      </div>

                      <div style={{height: 6, width: "100%", display: "flex", borderRadius: 4, overflow: "hidden"}}>
                        <div style={{width: `${trainerPct}%`, background: "#3498DB"}} title="Тренер"></div>
                        <div style={{width: `${studioPct}%`, background: "#2ECC71"}} title="Студія"></div>
                      </div>

                      <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10}}>
                        <div style={{display: "flex", gap: 24}}>
                          <div>
                            <div style={{fontSize:11,color:"#8892b0"}}>Тренер ({trainerPct}%)</div>
                            <div style={{fontSize:16,fontWeight:600,color:"#3498DB"}}>{sp.trainer.toLocaleString()} ₴</div>
                          </div>
                          <div>
                            <div style={{fontSize:11,color:"#8892b0"}}>Студія ({studioPct}%)</div>
                            <div style={{fontSize:16,fontWeight:600,color:"#2ECC71"}}>{sp.studio.toLocaleString()} ₴</div>
                          </div>
                        </div>
                        <button style={{...btnS, padding: "8px 16px", background: "#0d1117"}} onClick={() => setFinanceDetailItem(sp)}>
                          🧾 Детальний звіт
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>}
            </div>
          )
        })()}

      </main>

      <Modal open={!!financeDetailItem} onClose={()=>setFinanceDetailItem(null)} title={`Зарплата: ${financeDetailItem?.group?.name}`} wide>
        {financeDetailItem && (
          <div>
            <div style={{display: "flex", justifyContent: "space-between", background: "#0d1117", padding: "12px 16px", borderRadius: 8, marginBottom: 16}}>
              <div><div style={{fontSize: 11, color: "#8892b0", textTransform: "uppercase"}}>Тренеру ({financeDetailItem.group.trainerPct}%)</div><div style={{fontSize: 20, fontWeight: 700, color: "#3498DB"}}>{financeDetailItem.trainer.toLocaleString()} ₴</div></div>
              <div style={{textAlign: "right"}}><div style={{fontSize: 11, color: "#8892b0", textTransform: "uppercase"}}>Студії ({100 - financeDetailItem.group.trainerPct}%)</div><div style={{fontSize: 20, fontWeight: 700, color: "#2ECC71"}}>{financeDetailItem.studio.toLocaleString()} ₴</div></div>
            </div>
            
            <table style={{width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left"}}>
              <thead>
                <tr style={{color: "#8892b0", borderBottom: "1px solid #30363d"}}>
                  <th style={{padding: "8px 0", fontWeight: 500}}>Учениця</th>
                  <th style={{padding: "8px 0", fontWeight: 500}}>Тип</th>
                  <th style={{padding: "8px 0", fontWeight: 500, textAlign: "right"}}>Оплачено</th>
                  <th style={{padding: "8px 0", fontWeight: 500, textAlign: "right", color: "#3498DB"}}>Частка тренера</th>
                </tr>
              </thead>
              <tbody>
                {financeDetailItem.subs.map(sub => {
                  const st = studentMap[sub.studentId];
                  const planLabel = PLAN_TYPES.find(p=>p.id===sub.planType)?.name||sub.planType;
                  const trainerCut = Math.round((sub.amount || 0) * (financeDetailItem.group.trainerPct / 100));
                  return (
                    <tr key={sub.id} style={{borderBottom: "1px solid #21262d"}}>
                      <td style={{padding: "10px 0", color: "#fff"}}>{st?.name}</td>
                      <td style={{padding: "10px 0", color: "#8892b0"}}>{planLabel}</td>
                      <td style={{padding: "10px 0", textAlign: "right"}}>{sub.amount} ₴</td>
                      <td style={{padding: "10px 0", textAlign: "right", color: "#3498DB", fontWeight: 600}}>+ {trainerCut} ₴</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      <Modal open={modal==="addStudent"} onClose={()=>setModal(null)} title="Нова учениця"><StudentForm onDone={addStudent}/></Modal>
      <Modal open={modal==="editStudent"} onClose={()=>{setModal(null);setEditItem(null)}} title="Редагувати"><StudentForm initial={editItem} onDone={editStudent}/></Modal>
      <Modal open={modal==="addSub"} onClose={()=>setModal(null)} title="Новий абонемент"><SubForm onDone={addSub}/></Modal>
      <Modal open={modal==="editSub"} onClose={()=>{setModal(null);setEditItem(null)}} title="Редагувати абонемент"><SubForm initial={editItem} onDone={editSub}/></Modal>
      <Modal open={modal==="addWaitlist"} onClose={()=>setModal(null)} title="Додати в резерв"><WaitlistForm onDone={addWaitlist}/></Modal>
    </div>
  );
}
