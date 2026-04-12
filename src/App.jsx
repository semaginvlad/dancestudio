import React, { useState, useEffect, useMemo } from "react";
import * as db from "./db";
import Analytics from "./pages/Analytics";

// ==========================================
// 1. КОНСТАНТИ, ПАЛІТРА ТА ДАНІ
// ==========================================
const theme = {
  primary: "#5A81FA",
  secondary: "#2C3D8F",
  bg: "#F8F9FD",
  card: "#FFFFFF",
  input: "#F2F5FF",
  textMain: "#1F1F1F",
  textMuted: "#6A6E83",
  textLight: "#A8B1CE",
  border: "#C7D2E8",
  success: "#34C759",
  warning: "#FF9500",
  danger: "#FF453A",
  exhausted: "#A8B1CE"
};

const WEEKDAYS = ["НД", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];
const MONTHS = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];

const DIRECTIONS = [
  { id: "latina", name: "Latina Solo", color: "#FF453A" },
  { id: "bachata", name: "Bachata Lady Style", color: "#FF9500" },
  { id: "heels", name: "High Heels", color: "#AF52DE" },
  { id: "dancehall", name: "Dancehall Female", color: "#34C759" },
  { id: "kpop", name: "K-pop Cover Dance", color: theme.primary },
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
  const dl = daysLeft(sub.endDate), tl = (sub.totalTrainings||1)-(sub.usedTrainings||0);
  if (dl <= 3 || tl <= 1) return "warning";
  return "active";
}

function getNextTrainingDate(schedule, afterDateStr) {
  if (!schedule || schedule.length === 0) {
    const d = new Date(afterDateStr + "T12:00:00");
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
  if (!schedule || schedule.length === 0) {
    const d = new Date(beforeDateStr + "T12:00:00");
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

function getNotifMsg(sub,student,group,direction){
  if (!student) return "Привіт! Абонемент закінчився.";
  const nameParts = student.name?.split(" ") || [];
  const name = nameParts[0] || ""; 
  const gName=group?.name||"";
  const dName=direction?.name||"";
  const tpl=student.messageTemplate||student.message_template;
  if(tpl)return tpl.replace(/\{ім'я\}/g,name).replace(/\{група\}/g,gName).replace(/\{напрямок\}/g,dName);
  return `Привіт, ${name}! 💃\nНагадуємо, що твій абонемент у групі ${gName} (${dName}) закінчився.\nЧекаємо на продовження! ❤️`;
}

const STATUS_LABELS = { active: "Активний", warning: "Закінчується", expired: "Протермінований" };
const STATUS_COLORS = { active: theme.success, warning: theme.warning, expired: theme.danger };

// ==========================================
// 2. ХУК ДЛЯ ЗБЕРЕЖЕННЯ В ЛОКАЛЬНІЙ ПАМ'ЯТІ
// ==========================================
function useStickyState(defaultValue, key) {
  const [value, setValue] = useState(() => {
    const stickyValue = window.localStorage.getItem(key);
    return stickyValue !== null ? JSON.parse(stickyValue) : defaultValue;
  });
  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value));
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

function Modal({open, onClose, title, children, wide}){
  if(!open) return null;
  return(
    <div style={{position:"fixed", inset:0, background:"rgba(31, 31, 31, 0.4)", backdropFilter:"blur(4px)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:theme.card, borderRadius:32, padding:"32px", width:wide?800:500, maxWidth:"100%", maxHeight:"90vh", overflow:"auto", boxShadow: "0 24px 48px rgba(0,0,0,0.1)"}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24}}>
          <h3 style={{margin:0, fontSize:22, color:theme.textMain, fontWeight:700}}>{title}</h3>
          <button type="button" onClick={onClose} style={{background:theme.input, borderRadius:"50%", width:40, height:40, border:"none", color:theme.textMuted, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize: 18}}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({label, children}){
  return(<div style={{marginBottom:18}}><label style={{display:"block", fontSize:12, color:theme.textMuted, marginBottom:8, fontWeight:600, letterSpacing:0.5}}>{label}</label>{children}</div>);
}

function Badge({color, children}){
  return <span style={{padding:"6px 12px", borderRadius:100, fontSize:12, fontWeight:600, background:`${color}15`, color, whiteSpace:"nowrap"}}>{children}</span>;
}

function Pill({active, onClick, children, color}){
  return <button type="button" onClick={onClick} style={{padding:"10px 20px", borderRadius:100, fontSize:14, fontWeight:600, cursor:"pointer", background:active?(color||theme.primary):theme.input, color:active?"#fff":theme.textMuted, border:"none", fontFamily:"inherit", transition:"all 0.2s"}}>{children}</button>;
}

function GroupSelect({groups, value, onChange, filterDir = "all", allowAll = false}) {
  const filteredGroups = filterDir === "all" ? groups : groups.filter(g => g.directionId === filterDir);
  return (
    <select style={{...inputSt, width:"auto", minWidth:200, cursor:"pointer"}} value={value} onChange={e=>onChange(e.target.value)}>
      {allowAll && <option value="all">Усі групи</option>}
      {DIRECTIONS.filter(d => filterDir === "all" || d.id === filterDir).map(d=>(
        <optgroup key={d.id} label={d.name}>
          {filteredGroups.filter(g=>g.directionId===d.id).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

// Кастомний пошук по ученицях для форми абонементів
function StudentSelectWithSearch({ students, value, onChange, studentGrps, groups }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const sortedStudents = useMemo(() => [...students].sort((a,b) => (a.name||"").localeCompare(b.name||"","uk")), [students]);
  const filtered = useMemo(() => sortedStudents.filter(s => (s.name||"").toLowerCase().includes(search.toLowerCase())), [sortedStudents, search]);

  const grouped = useMemo(() => {
    const res = {};
    filtered.forEach(s => {
       const sg = studentGrps.find(x => x.studentId === s.id);
       const g = sg ? groups.find(x => x.id === sg.groupId) : null;
       const dirName = g ? (DIRECTIONS.find(d => d.id === g.directionId)?.name || "Інше") : "Без групи";
       if(!res[dirName]) res[dirName] = [];
       res[dirName].push(s);
    });
    return res;
  }, [filtered, studentGrps, groups]);

  const selectedSt = students.find(s => s.id === value);

  return (
    <div style={{position: 'relative'}}>
      {open && <div style={{position: 'fixed', inset: 0, zIndex: 9}} onClick={() => setOpen(false)}></div>}
      <div onClick={() => setOpen(!open)} style={{...inputSt, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: theme.card, border: `1px solid ${theme.border}`, position: 'relative', zIndex: 10}}>
        {selectedSt ? selectedSt.name : "Оберіть ученицю..."}
        <span style={{fontSize: 10, color: theme.textLight}}>▼</span>
      </div>
      {open && (
        <div style={{position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 11, background: theme.card, border: `1px solid ${theme.border}`, borderRadius: 16, marginTop: 4, boxShadow: "0 10px 30px rgba(0,0,0,0.15)", maxHeight: 350, display: 'flex', flexDirection: 'column', overflow: 'hidden'}}>
          <div style={{padding: 12, borderBottom: `1px solid ${theme.border}`, background: theme.bg}}>
            <input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Пошук за прізвищем..." style={{...inputSt, height: 44, padding: "0 16px"}} />
          </div>
          <div style={{overflowY: 'auto', flex: 1, padding: "8px 0"}}>
            {Object.keys(grouped).length === 0 ? <div style={{padding: 16, color: theme.textLight, textAlign: 'center'}}>Нікого не знайдено</div> : 
              Object.entries(grouped).map(([dir, sts]) => (
                <div key={dir}>
                  <div style={{padding: "8px 16px", fontSize: 11, color: theme.textMuted, textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5, background: theme.bg}}>{dir}</div>
                  {sts.map(s => (
                    <div key={s.id} onClick={() => { onChange(s.id); setOpen(false); setSearch(""); }} style={{padding: "12px 16px", cursor: "pointer", background: value === s.id ? `${theme.primary}15` : "transparent", color: value === s.id ? theme.primary : theme.textMain, fontWeight: value === s.id ? 700 : 500, transition: '0.1s', borderBottom: `1px solid ${theme.bg}`}}>
                      {s.name}
                    </div>
                  ))}
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  )
}

// ==========================================
// 4. ФОРМИ
// ==========================================
function StudentForm({initial, onDone, onCancel, studentGrps, groups}){
  const nameParts = initial?.name ? initial.name.split(' ') : [];
  const initialFirstName = initial?.first_name || nameParts[0] || "";
  const initialLastName = initial?.last_name || nameParts.slice(1).join(' ') || "";

  const [firstName,setFirstName]=useState(initialFirstName);
  const [lastName,setLastName]=useState(initialLastName);
  const [phone,setPhone]=useState(initial?.phone||"");
  const [telegram,setTelegram]=useState(initial?.telegram||"");
  const [notes,setNotes]=useState(initial?.notes||"");
  const [msgTpl,setMsgTpl]=useState(initial?.messageTemplate||initial?.message_template||"");
  const [selGrps,setSelGrps]=useState(()=>initial?.id?studentGrps.filter(sg=>sg.studentId===initial.id).map(sg=>sg.groupId):[]);
  
  const toggleGrp=(gid)=>setSelGrps(p=>p.includes(gid)?p.filter(g=>g!==gid):[...p,gid]);
  
  return(<div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
      <Field label="Ім'я *"><input style={inputSt} value={firstName} onChange={e=>setFirstName(e.target.value)} placeholder="Олена"/></Field>
      <Field label="Прізвище"><input style={inputSt} value={lastName} onChange={e=>setLastName(e.target.value)} placeholder="Петренко"/></Field>
    </div>
    <Field label="Телефон"><input style={inputSt} value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+380..."/></Field>
    <Field label="Telegram"><input style={inputSt} value={telegram} onChange={e=>setTelegram(e.target.value)} placeholder="@username"/></Field>
    <Field label="Групи / напрямки">
      <div style={{display:"flex",flexDirection:"column",gap:12, background: theme.card, padding: 20, borderRadius: 20, border: `1px solid ${theme.border}`}}>
        {DIRECTIONS.map(d=><div key={d.id}><div style={{fontSize:13,color:d.color,fontWeight:600,marginBottom:10}}>{d.name}</div><div style={{display:"flex",flexWrap:"wrap",gap:8}}>{groups.filter(g=>g.directionId===d.id).map(g=><Pill key={g.id} active={selGrps.includes(g.id)} color={d.color} onClick={()=>toggleGrp(g.id)}>{g.name}</Pill>)}</div></div>)}
      </div>
    </Field>
    <Field label="Шаблон повідомлення"><textarea style={{...inputSt, height: 'auto', padding: '16px 20px', minHeight: 80, resize:"vertical"}} value={msgTpl} onChange={e=>setMsgTpl(e.target.value)} placeholder="Привіт, {ім'я}! Абонемент у {група} ({напрямок}) закінчився..."/><div style={{fontSize:12,color:theme.textLight,marginTop:8}}>Змінні: {"{ім'я}"}, {"{група}"}, {"{напрямок}"}</div></Field>
    <Field label="Нотатки"><textarea style={{...inputSt, height: 'auto', padding: '16px 20px', minHeight: 60, resize:"vertical"}} value={notes} onChange={e=>setNotes(e.target.value)}/></Field>
    <div style={{display:"flex",gap:12,justifyContent:"flex-end",marginTop:24}}>
      <button type="button" style={btnS} onClick={onCancel}>Скасувати</button>
      <button type="button" style={{...btnP,opacity:(firstName.trim() || lastName.trim())?1:.4}} onClick={()=>{if(!firstName.trim() && !lastName.trim())return;onDone({first_name:firstName.trim(),last_name:lastName.trim(),name:[firstName.trim(),lastName.trim()].filter(Boolean).join(' '),phone,telegram,notes,message_template:msgTpl,selectedGroups:selGrps})}}>{initial?"Зберегти зміни":"Додати ученицю"}</button>
    </div>
  </div>);
}

function SubForm({initial, onDone, onCancel, students, groups, studentGrps}){
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
  
  const plan = PLAN_TYPES.find(p=>p.id===planType);
  const endDate = addMonth(startDate);
  const basePrice = plan?.price||0;
  
  useEffect(()=>{if(!initial){const p=PLAN_TYPES.find(p=>p.id===planType);if(p)setAmount(p.price-Math.round(p.price*discountPct/100))}},[planType,discountPct]);
  
  return(<div>
    <Field label="Учениця *"><StudentSelectWithSearch students={students} value={studentId} onChange={setStudentId} studentGrps={studentGrps} groups={groups} /></Field>
    <Field label="Група *"><GroupSelect groups={groups} value={groupId} onChange={setGroupId} /></Field>
    <Field label="Тип Абонемента"><div style={{display:"flex",gap:8,flexWrap:"wrap", background: theme.card, padding: 16, borderRadius: 20, border: `1px solid ${theme.border}`}}>{PLAN_TYPES.map(p=><Pill key={p.id} active={planType===p.id} onClick={()=>setPlanType(p.id)}>{p.name} — {p.price}₴</Pill>)}</div></Field>
    
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
      <Field label="Початок (Клікніть для календаря)"><input style={{...inputSt, cursor: "pointer", height: "52px"}} type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} onClick={(e) => e.target.showPicker && e.target.showPicker()} /></Field>
      <Field label="Кінець (Автоматично)">
        <div style={{...inputSt, background: theme.bg, color: theme.textLight, cursor: "not-allowed", display: "flex", alignItems: "center", height: "52px"}}>
          {fmt(endDate)}
        </div>
      </Field>
    </div>

    <div style={{background:theme.card,borderRadius:24,padding:"24px",marginBottom:16, border: `1px solid ${theme.border}`}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <Field label="Знижка (%)"><input style={inputSt} type="number" min={0} max={100} value={discountPct} onChange={e=>setDiscountPct(Math.min(100,Math.max(0,+e.target.value)))}/></Field>
        <Field label="Знижка за рахунок"><div style={{display:"flex",gap:6, background:theme.input, padding:6, borderRadius:100}}><Pill active={discountSource==="studio"} onClick={()=>setDiscountSource("studio")}>Студії</Pill><Pill active={discountSource==="trainer"} onClick={()=>setDiscountSource("trainer")}>Тренера</Pill><Pill active={discountSource==="split"} onClick={()=>setDiscountSource("split")}>50/50</Pill></div></Field>
      </div>
      {discountPct>0&&<div style={{fontSize:14,color:theme.warning,marginTop:12, fontWeight: 500}}>Початкова ціна: {basePrice}₴ → Знижка -{Math.round(basePrice*discountPct/100)}₴ → <strong style={{color:theme.success, fontSize: 18}}>До сплати: {basePrice-Math.round(basePrice*discountPct/100)}₴</strong></div>}
    </div>

    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
      <Field label="Сумма до сплати (грн)"><input style={{...inputSt, color: theme.success, fontWeight: 700, fontSize: 20}} type="number" min={0} value={amount} onChange={e=>setAmount(+e.target.value)}/></Field>
      <Field label="Метод оплати"><div style={{display:"flex",gap:8}}>{PAY_METHODS.map(m=><Pill key={m.id} active={payMethod===m.id} onClick={()=>setPayMethod(m.id)}>{m.name}</Pill>)}</div></Field>
    </div>
    <label style={{display:"flex",alignItems:"center",gap:12,color:theme.textMain,cursor:"pointer",fontSize:16, fontWeight:600, marginBottom:24, background: theme.input, padding: "20px 24px", borderRadius: 20}}><input type="checkbox" checked={paid} onChange={e=>setPaid(e.target.checked)} style={{width: 22, height: 22}}/> Оплачено</label>
    <Field label="Нотатки"><textarea style={{...inputSt, height: 'auto', padding: '16px 20px', minHeight: 60, resize:"vertical"}} value={notes} onChange={e=>setNotes(e.target.value)}/></Field>
    <div style={{display:"flex",gap:12,justifyContent:"flex-end",marginTop:24}}>
      <button type="button" style={btnS} onClick={onCancel}>Скасувати</button>
      <button type="button" style={{...btnP,opacity:studentId&&groupId?1:.4}} onClick={()=>{if(!studentId||!groupId)return;onDone({studentId,groupId,planType,startDate,endDate,totalTrainings:(plan?.trainings||8),usedTrainings:initial?.usedTrainings||0,amount,paid,payMethod,discountPct,discountSource,basePrice,notes,notificationSent:initial?.notificationSent||false})}}>{initial?"Зберегти зміни":"Створити абонемент"}</button>
    </div>
  </div>);
}

function WaitlistForm({onDone, onCancel, students, groups, studentGrps}) {
  const [studentId, setStudentId] = useState("");
  const [groupId, setGroupId] = useState("");
  return (<div>
    <Field label="Учениця *"><StudentSelectWithSearch students={students} value={studentId} onChange={setStudentId} studentGrps={studentGrps} groups={groups} /></Field>
    <Field label="В яку групу чекає? *"><GroupSelect groups={groups} value={groupId} onChange={setGroupId} /></Field>
    <div style={{display:"flex",gap:12,justifyContent:"flex-end",marginTop:24}}>
      <button type="button" style={btnS} onClick={onCancel}>Скасувати</button>
      <button type="button" style={{...btnP, background: theme.warning, opacity:studentId&&groupId?1:.4}} onClick={()=>{if(studentId&&groupId) onDone({studentId, groupId, dateAdded: today()})}}>Додати в резерв</button>
    </div>
  </div>)
}

// ==========================================
// 5. ВІДВІДУВАННЯ (ТАБЛИЦЯ З DRAG & DROP)
// ==========================================
const AttendanceTab = React.memo(function AttendanceTab({ groups, rawSubs, subs, setSubs, attn, setAttn, studentMap, studentGrps, cancelled, setCancelled, customOrders, setCustomOrders }) {
  const [gid, setGid] = useStickyState("", "ds_attnGid");
  const [journalMonth, setJournalMonth] = useState(today().slice(0, 7));
  
  const [manualName, setManualName] = useState("");
  const [manualDate, setManualDate] = useState(today());
  const [journalGuestMode, setJournalGuestMode] = useState("subscription");
  
  useEffect(() => { if (groups.length > 0 && !gid) setGid(groups[0].id); }, [groups, gid]);

  const stIdsInGroup = new Set([
    ...studentGrps.filter(sg => sg.groupId === gid).map(sg => sg.studentId),
    ...subs.filter(s => s.groupId === gid).map(s => s.studentId),
    ...attn.filter(a => a.groupId === gid && a.guestName).map(a => {
      const matchedSt = Object.values(studentMap).find(s => s.name === a.guestName);
      return matchedSt ? matchedSt.id : null;
    }).filter(Boolean)
  ]);
  
  const baseStudsInGroup = Array.from(stIdsInGroup)
    .map(id => studentMap[id])
    .filter(st => st && st.name)
    .sort((a,b) => (a.name || "").localeCompare((b.name || ""), "uk"));

  const studsInGroup = useMemo(() => {
    const orderArr = customOrders[gid] || [];
    return [...baseStudsInGroup].sort((a, b) => {
       const idxA = orderArr.indexOf(a.id);
       const idxB = orderArr.indexOf(b.id);
       if (idxA !== -1 && idxB !== -1) return idxA - idxB;
       if (idxA !== -1) return -1;
       if (idxB !== -1) return 1;
       return 0; 
    });
  }, [baseStudsInGroup, customOrders, gid]);

  const moveStudentDnD = (draggedId, targetId) => {
     if (draggedId === targetId) return;
     setCustomOrders(prev => {
        const currentOrder = prev[gid] || baseStudsInGroup.map(s => s.id);
        const completeOrder = [...new Set([...currentOrder, ...baseStudsInGroup.map(s => s.id)])].filter(id => baseStudsInGroup.some(s => s.id === id));
        const fromIdx = completeOrder.indexOf(draggedId);
        const toIdx = completeOrder.indexOf(targetId);
        if (fromIdx === -1 || toIdx === -1) return prev;
        
        const newOrder = [...completeOrder];
        const [movedItem] = newOrder.splice(fromIdx, 1);
        newOrder.splice(toIdx, 0, movedItem);
        return { ...prev, [gid]: newOrder };
     });
  };

  const addManual = async () => {
    if (!manualName.trim()) return;
    try {
      const a = { id: uid(), guestName: manualName.trim(), guestType: journalGuestMode, groupId: gid, date: manualDate, quantity: 1, entryType: journalGuestMode };
      setAttn(p => [...p, a]);
      if(db.insertAttendance) await db.insertAttendance(a);
    } catch (e) { alert("Помилка збереження в базу даних! Деталі: " + e.message); }
    setManualName("");
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

      // Обрізаємо кінець старого абонемента, якщо новий почався раніше
      const nextSub = stSubs[i+1];
      if (nextSub && nextSub.startDate <= effectiveEnd) {
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

  const toggleJournalCell = async (student, cellDate, isCurrentlyAttended, dbRecord) => {
    try {
      if (isCurrentlyAttended && dbRecord) {
        setAttn(p => p.filter(a => a.id !== dbRecord.id));
        if(db.deleteAttendance) await db.deleteAttendance(dbRecord.id);
      } else {
        const newId = uid();
        const validSub = subs.find(s => 
          s.studentId === student.id && 
          s.groupId === gid && 
          s.startDate <= cellDate && 
          s.endDate >= cellDate && 
          (s.usedTrainings || 0) < (s.totalTrainings || 1)
        );
        
        if (validSub && journalGuestMode === "subscription") {
          const a = { id: newId, subId: validSub.id, date: cellDate, quantity: 1, entryType: "subscription", groupId: gid };
          setAttn(p => [...p, a]);
          if(db.insertAttendance) await db.insertAttendance(a);
        } else {
          if (journalGuestMode === "subscription") {
            alert("Немає активного абонемента для цієї дати (або вичерпано ліміт занять). Буде позначено як Разове.");
            const a = { id: newId, guestName: student.name, guestType: "single", groupId: gid, date: cellDate, quantity: 1, entryType: "single" };
            setAttn(p => [...p, a]);
            if(db.insertAttendance) await db.insertAttendance(a);
          } else {
            const a = { id: newId, guestName: student.name, guestType: journalGuestMode, groupId: gid, date: cellDate, quantity: 1, entryType: journalGuestMode };
            setAttn(p => [...p, a]);
            if(db.insertAttendance) await db.insertAttendance(a);
          }
        }
      }
    } catch (e) {
      alert("❌ Помилка збереження в базу даних! Оновіть сторінку. Деталі: " + e.message);
    }
  };

  const handleCancelSpecificDay = async (cancelDate) => {
    if (!confirm(`Точно скасувати тренування ${cancelDate}? Всі активні абонементи будуть автоматично подовжені на наступне заняття групи.`)) return;
    try {
      const currentGroup = groups.find(g => g.id === gid);
      const affectedSubs = rawSubs.filter(s => s.groupId === gid && s.startDate <= cancelDate && s.endDate >= cancelDate);
      
      const originalEnds = {};
      let newSubs = [...rawSubs];
      
      for (let sub of affectedSubs) {
        originalEnds[sub.id] = sub.endDate; 
        const newEndStr = getNextTrainingDate(currentGroup?.schedule, sub.endDate);
        if(db.updateSub) await db.updateSub(sub.id, { endDate: newEndStr });
        newSubs = newSubs.map(s => s.id === sub.id ? { ...s, endDate: newEndStr } : s);
      }
      
      const newCancel = { id: uid(), groupId: gid, date: cancelDate, originalEnds };
      let insertedC = newCancel;
      if (db.insertCancelled) {
        insertedC = await db.insertCancelled(newCancel); 
      }
      setCancelled(p => [...p, insertedC]);
      setSubs(newSubs);
    } catch (e) { alert("Помилка: " + e.message); }
  };

  const handleRestoreSpecificDay = async (restoreDate) => {
    if (!confirm(`Відновити скасоване тренування ${restoreDate}? Терміни абонементів будуть повернуті до початкових.`)) return;
    try {
      const targetCancel = cancelled.find(c => c.groupId === gid && c.date === restoreDate);
      if (targetCancel) {
        let newSubs = [...rawSubs];
        if (targetCancel.originalEnds) {
          for (const [subId, origEnd] of Object.entries(targetCancel.originalEnds)) {
             if(db.updateSub) await db.updateSub(subId, { endDate: origEnd });
             newSubs = newSubs.map(s => s.id === subId ? { ...s, endDate: origEnd } : s);
          }
          setSubs(newSubs);
        }
        if (db.deleteCancelled) {
          await db.deleteCancelled(targetCancel.id);
        } else {
          alert("Увага: Функція deleteCancelled відсутня в db.js! Запис про скасування не видалено з бази.");
        }
        setCancelled(p => p.filter(c => c.id !== targetCancel.id));
      }
    } catch (e) { alert("Помилка: " + e.message); }
  };

  return (
    <div style={{ maxWidth: "100%" }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <GroupSelect groups={groups} value={gid} onChange={setGid}/>
        <div style={{display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
            <button style={{...btnS, padding: "14px 18px", borderRadius: 12}} onClick={handlePrevMonth}>{"<"}</button>
            <input style={{...inputSt, width: "auto", minWidth: 160, cursor: "pointer", textAlign: 'center'}} type="month" value={journalMonth} onChange={e=>setJournalMonth(e.target.value)} onClick={(e) => e.target.showPicker && e.target.showPicker()}/>
            <button style={{...btnS, padding: "14px 18px", borderRadius: 12}} onClick={handleNextMonth}>{">"}</button>
          </div>
          <div style={{display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 12, borderLeft: `2px solid ${theme.border}`}}>
            <span style={{fontSize: 12, color: theme.textMuted, fontWeight: 700}}>КЛІК В ТАБЛИЦІ:</span>
            <Pill active={journalGuestMode==="subscription"} onClick={()=>setJournalGuestMode("subscription")} color={theme.primary}>Абонемент</Pill>
            <Pill active={journalGuestMode==="trial"} onClick={()=>setJournalGuestMode("trial")} color={theme.success}>Пробне</Pill>
            <Pill active={journalGuestMode==="single"} onClick={()=>setJournalGuestMode("single")} color={theme.warning}>Разове</Pill>
            <Pill active={journalGuestMode==="unpaid"} onClick={()=>setJournalGuestMode("unpaid")} color={theme.danger}>Борг</Pill>
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
                <td style={{ position: "sticky", left: 0, background: theme.card, padding: "10px 16px", fontWeight: 600, color: theme.textMain, borderRight: `2px solid ${theme.border}`, borderBottom: `1px solid ${theme.border}`, zIndex: 1, whiteSpace: "nowrap" }}>
                  <div style={{display: "flex", alignItems: "center"}}>
                    <div style={{color: theme.textLight, marginRight: 12, fontSize: 14, cursor: "grab", userSelect: "none"}}>☰</div>
                    <span style={{color: theme.textLight, marginRight: 8, fontSize: 12}}>{i+1}.</span>{st.name}
                  </div>
                </td>
                {visibleDays.map((d, index) => {
                  const isNewMonth = index === 0 || d.split('-')[1] !== visibleDays[index - 1].split('-')[1];
                  const rec = attn.find(a => a.groupId === gid && a.date === d && (a.subId ? subs.find(s=>s.id===a.subId)?.studentId === st.id : a.guestName === st.name));
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
          </tbody>
        </table>
      </div>

      <div style={{ background: theme.card, borderRadius: 24, padding: "24px", marginTop: 24, boxShadow: "0 10px 30px rgba(168, 177, 206, 0.15)", border: `1px solid ${theme.border}` }}>
        <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 16, fontWeight: 600 }}>+ Додати нову людину на конкретну дату</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 150 }}>
            <input type="date" style={inputSt} value={manualDate} onChange={e=>setManualDate(e.target.value)} onClick={(e) => e.target.showPicker && e.target.showPicker()} />
          </div>
          <div style={{ flex: 2, minWidth: 200 }}>
            <input style={inputSt} value={manualName} onChange={e=>setManualName(e.target.value)} placeholder="Ім'я Прізвище учениці" onKeyDown={e=>e.key==="Enter"&&addManual()}/>
          </div>
          <div style={{ display: "flex", gap: 6, background: theme.input, padding: 6, borderRadius: 100, overflowX: "auto" }}>
            <Pill active={journalGuestMode==="trial"} onClick={()=>setJournalGuestMode("trial")} color={theme.success}>Пробне</Pill>
            <Pill active={journalGuestMode==="single"} onClick={()=>setJournalGuestMode("single")} color={theme.warning}>Разове</Pill>
            <Pill active={journalGuestMode==="subscription"} onClick={()=>setJournalGuestMode("subscription")} color={theme.primary}>Абонемент</Pill>
            <Pill active={journalGuestMode==="unpaid"} onClick={()=>setJournalGuestMode("unpaid")} color={theme.danger}>Борг</Pill>
          </div>
          <button style={{...btnP, borderRadius: 100, background: theme.primary}} onClick={addManual}>Відмітити</button>
        </div>
      </div>
    </div>
  );
});

// ==========================================
// 6. ПРО АНАЛІТИКА
// ==========================================
function ProAnalyticsTab({ proAnalytics }) {
  const [ltvPeriod, setLtvPeriod] = useState(1);
  const topSpenders = proAnalytics.topSpenders[ltvPeriod] || [];

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 24}}>
      <div style={cardSt}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12}}>
          <h3 style={{margin: 0, fontSize: 20, color: theme.secondary}}>🏆 Топ клієнтів за прибутком</h3>
          <div style={{display: 'flex', gap: 6, background: theme.input, padding: 4, borderRadius: 100}}>
            {[1, 3, 6, 12].map(m => (
              <button key={m} onClick={() => setLtvPeriod(m)} style={{padding: '6px 16px', borderRadius: 100, border: 'none', background: ltvPeriod === m ? theme.primary : 'transparent', color: ltvPeriod === m ? '#fff' : theme.textMuted, fontWeight: 600, cursor: 'pointer', fontSize: 13, transition: '0.2s'}}>{m} міс.</button>
            ))}
          </div>
        </div>
        {topSpenders.length === 0 ? <div style={{color: theme.textLight, padding: 20}}>Немає даних за цей період</div> : (
          <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
            {topSpenders.map((item, i) => (
              <div key={item.student.id} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: theme.bg, borderRadius: 16}}>
                <div style={{display: 'flex', gap: 16, alignItems: 'center'}}>
                  <div style={{width: 32, height: 32, borderRadius: '50%', background: i===0?'#FFD700':i===1?'#C0C0C0':i===2?'#CD7F32':theme.input, color: i<3?'#fff':theme.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 14}}>{i+1}</div>
                  <div style={{fontWeight: 700, color: theme.textMain, fontSize: 16}}>{item.student.name}</div>
                </div>
                <div style={{fontWeight: 800, color: theme.success, fontSize: 18}}>{item.total.toLocaleString()} ₴</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24}}>
        <div style={{...cardSt, border: `2px solid ${theme.warning}40`}}>
          <h3 style={{margin: 0, fontSize: 18, color: theme.warning, marginBottom: 16}}>📈 Кому вигідно більший абонемент</h3>
          <div style={{fontSize: 13, color: theme.textMuted, marginBottom: 20}}>Ці учениці ходять дуже часто, але купують малі абонементи. Запропонуй їм {8} або {12} занять.</div>
          <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
            {proAnalytics.upsellCandidates.length === 0 ? <div style={{color: theme.textLight}}>Немає кандидатів наразі</div> : 
              proAnalytics.upsellCandidates.map((item, i) => (
                <div key={i} style={{padding: '16px', background: theme.bg, borderRadius: 16, borderLeft: `4px solid ${item.group.direction?.color || theme.primary}`}}>
                  <div style={{fontSize: 12, color: theme.textMuted, marginBottom: 4}}>{item.group.name}</div>
                  <div style={{fontWeight: 700, color: theme.textMain}}>{item.student.name}</div>
                  <div style={{fontSize: 13, color: theme.textMuted, marginTop: 4}}>{item.reason}</div>
                  <div style={{marginTop: 10}}><Badge color={theme.warning}>Запропонувати: {item.suggest}</Badge></div>
                </div>
              ))
            }
          </div>
        </div>

        <div style={{...cardSt, border: `2px solid ${theme.danger}40`}}>
          <h3 style={{margin: 0, fontSize: 18, color: theme.danger, marginBottom: 16}}>🚨 Ризик втрати клієнта (Не були &gt; 10 днів)</h3>
          <div style={{fontSize: 13, color: theme.textMuted, marginBottom: 20}}>У цих дівчат закінчується абонемент (залишилось 0-1 заняття), і вони давно не були. Напиши їм!</div>
          <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
            {proAnalytics.churnRisk.length === 0 ? <div style={{color: theme.textLight}}>Усі ходять стабільно!</div> : 
              proAnalytics.churnRisk.map((item, i) => (
                <div key={i} style={{padding: '16px', background: theme.bg, borderRadius: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderLeft: `4px solid ${item.group.direction?.color || theme.primary}`}}>
                  <div>
                    <div style={{fontSize: 12, color: theme.textMuted, marginBottom: 4}}>{item.group.name}</div>
                    <div style={{fontWeight: 700, color: theme.textMain}}>{item.student.name}</div>
                    <div style={{fontSize: 12, color: theme.danger, marginTop: 4}}>Не була {item.daysSinceLast} днів</div>
                  </div>
                  {item.student.telegram && <a href={`https://t.me/${item.student.telegram.replace('@','')}`} target="_blank" rel="noreferrer" style={{padding: '8px 12px', background: `${theme.danger}15`, color: theme.danger, borderRadius: 10, textDecoration: 'none', fontSize: 12, fontWeight: 700}}>Написати</a>}
                </div>
              ))
            }
          </div>
        </div>
      </div>

      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24}}>
        <div style={cardSt}>
          <h3 style={{margin: 0, fontSize: 20, color: theme.secondary, marginBottom: 20}}>🔥 Найпопулярніші дні (за 30 днів)</h3>
          <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
            {proAnalytics.popularDays.map((item, i) => (
              <div key={i} style={{display: 'flex', alignItems: 'center', gap: 16}}>
                <div style={{width: 40, fontWeight: 800, color: theme.textMuted}}>{item.day}</div>
                <div style={{flex: 1, background: theme.input, borderRadius: 8, height: 24, overflow: 'hidden'}}>
                  <div style={{width: `${(item.count / (proAnalytics.popularDays[0]?.count || 1)) * 100}%`, background: theme.primary, height: '100%', borderRadius: 8}}></div>
                </div>
                <div style={{fontWeight: 700, color: theme.textMain, width: 30, textAlign: 'right'}}>{item.count}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={cardSt}>
          <h3 style={{margin: 0, fontSize: 20, color: theme.secondary, marginBottom: 20}}>⭐ Лідери відвідуваності по групах (за 30 днів)</h3>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12}}>
            {proAnalytics.bestAttenders.map((item, i) => (
              <div key={i} style={{padding: '16px', background: theme.bg, borderRadius: 16, borderLeft: `4px solid ${item.group.direction?.color || theme.primary}`}}>
                <div style={{fontSize: 12, color: theme.textMuted, fontWeight: 600, marginBottom: 8}}>{item.group.name}</div>
                <div style={{fontWeight: 800, color: theme.textMain, fontSize: 15}}>{item.student.name}</div>
                <div style={{fontSize: 13, color: theme.primary, marginTop: 4, fontWeight: 700}}>{item.count} занять</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 7. ГОЛОВНИЙ ДОДАТОК
// ==========================================
export default function App() {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [subs, setSubs] = useState([]);
  const [attn, setAttn] = useState([]);
  const [groups, setGroups] = useState(DEFAULT_GROUPS);
  const [cancelled, setCancelled] = useState([]);
  const [studentGrps, setStudentGrps] = useState([]);
  const [waitlist, setWaitlist] = useState([]); 
  
  const [tab, setTab] = useStickyState("dashboard", "ds_danceStudioTab");
  const [modal, setModal] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [financeDetailItem, setFinanceDetailItem] = useState(null);
  const [searchQ, setSearchQ] = useState("");
  
  const [filterDir, setFilterDir] = useStickyState("all", "ds_filterDir");
  const [filterGroup, setFilterGroup] = useStickyState("all", "ds_filterGroup");
  const [filterStatus, setFilterStatus] = useStickyState("all", "ds_filterStatus");
  const [stFilterDir, setStFilterDir] = useStickyState("all", "ds_stFilterDir");
  const [stFilterGroup, setStFilterGroup] = useStickyState("all", "ds_stFilterGroup");
  const [finFilterDir, setFinFilterDir] = useStickyState("all", "ds_finFilterDir");
  const [finFilterGroup, setFinFilterGroup] = useStickyState("all", "ds_finFilterGroup");
  const [finSortBy, setFinSortBy] = useStickyState("total", "ds_finSortBy"); 
  const [finSortOrder, setFinSortOrder] = useStickyState("desc", "ds_finSortOrder");
  const [customOrders, setCustomOrders] = useStickyState({}, "ds_customOrders");

  const [expandedDirs, setExpandedDirs] = useState({});
  const [expandedSubDirs, setExpandedSubDirs] = useState({});

  useEffect(()=>{(async()=>{try{
    const [st,gr,su,at,ca,sg]=await Promise.all([db.fetchStudents(),db.fetchGroups(),db.fetchSubs(),db.fetchAttendance(),db.fetchCancelled(),db.fetchStudentGroups()]);
    setStudents(st||[]);if(gr?.length)setGroups(gr);setSubs(su||[]);setAttn(at||[]);setCancelled(ca||[]);setStudentGrps(sg||[]);
    try { if (db.fetchWaitlist) { const wl = await db.fetchWaitlist(); setWaitlist(wl || []); } } catch(e) {}
  }catch(e){console.error(e)}setLoading(false)})()},[]);

  const studentMap = useMemo(()=>Object.fromEntries(students.map(s=>[s.id,s])),[students]);
  const groupMap = useMemo(()=>Object.fromEntries(groups.map(g=>[g.id,g])),[groups]);
  const dirMap = useMemo(()=>Object.fromEntries(DIRECTIONS.map(d=>[d.id,d])),[]);

  const subsExt = useMemo(()=>{
    const usedMap = {};
    attn.forEach(a => { if (a.subId) usedMap[a.subId] = (usedMap[a.subId] || 0) + 1; });
    return subs.map(s => {
      const extSub = { ...s, usedTrainings: usedMap[s.id] || 0 };
      extSub.status = getSubStatus(extSub);
      return extSub;
    });
  },[subs, attn]);

  const activeSubs = useMemo(()=>subsExt.filter(s=>s.status!=="expired"),[subsExt]);
  const warnSubs = useMemo(()=>subsExt.filter(s=>s.status==="warning"),[subsExt]);

  const notifications = useMemo(()=>{
    const items=[];
    subsExt.filter(s => s.status !== "active").forEach(sub=>{
      const st=studentMap[sub.studentId], gr=groupMap[sub.groupId];
      if(!st || !gr) return; 
      if(sub.status==="expired" && subsExt.some(s=>s.studentId===sub.studentId && s.groupId===sub.groupId && s.status!=="expired")) return; 
      const dir=dirMap[gr.directionId];
      items.push({subId:sub.id, type:sub.status, student:st, group:gr, direction:dir, notified:sub.notificationSent,
        message:sub.status==="expired"?"Абонемент закінчився":(daysLeft(sub.endDate)<=3?`${daysLeft(sub.endDate)} дн.`:`${(sub.totalTrainings||0)-(sub.usedTrainings||0)} трен.`)});
    });return items;
  },[subsExt, studentMap, groupMap, dirMap]);

  const alertsByGroup = useMemo(() => {
    const grouped = {};
    notifications.forEach(n => {
       if(!n.group) return;
       if(!grouped[n.group.id]) grouped[n.group.id] = { group: n.group, dir: n.direction, items: [] };
       grouped[n.group.id].items.push(n);
    });
    return Object.values(grouped).sort((a,b) => a.group.name.localeCompare(b.group.name));
  }, [notifications]);

  const analytics = useMemo(()=>{
    const totalRev=subs.filter(s=>s.paid).reduce((a,s)=>a+(s.amount||0),0);
    const unpaid=subs.filter(s=>!s.paid&&getSubStatus(s)!=="expired").reduce((a,s)=>a+(s.amount||0),0);
    const byDir={};DIRECTIONS.forEach(d=>{const gids=groups.filter(g=>g.directionId===d.id).map(g=>g.id);const ds=activeSubs.filter(s=>gids.includes(s.groupId));byDir[d.id]={students:new Set(ds.map(s=>s.studentId)).size}});
    const splits=[]; groups.forEach(g=>{
      const gSubs=subs.filter(s=>s.groupId===g.id&&s.paid);
      const total=gSubs.reduce((a,s)=>a+(s.amount||0),0);
      if(total>0){splits.push({group:g,total,trainer:Math.round(total*(g.trainerPct||50)/100),studio:Math.round(total*(100-(g.trainerPct||50))/100), subs: gSubs})}
    });
    let totalLTV = 0; let usersWithPurchases = 0; let trialUsers = 0; let convertedUsers = 0;
    Object.values(studentMap).forEach(st => {
      const stSubs = subs.filter(s => s.studentId === st.id);
      if(stSubs.length > 0) {
        const moneySpent = stSubs.filter(s => s.paid).reduce((acc, curr) => acc + (curr.amount || 0), 0);
        if(moneySpent > 0) { totalLTV += moneySpent; usersWithPurchases++; }
        if (stSubs.some(s => s.planType === "trial")) { trialUsers++; if (stSubs.some(s => s.planType !== "trial")) convertedUsers++; }
      }
    });

    const currMonth = today().slice(0, 7);
    const prevMonthDate = new Date(); prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
    const prevMonth = toLocalISO(prevMonthDate).slice(0, 7);

    const currMonthSubs = subs.filter(s => s.startDate?.startsWith(currMonth) || s.created_at?.startsWith(currMonth));
    const currMonthAttn = attn.filter(a => a.date?.startsWith(currMonth));
    const currMonthCancelled = new Set(cancelled.filter(c => c.date?.startsWith(currMonth)).map(c => c.date + c.groupId)).size;

    const currMonthRev = subs.filter(s => s.paid && (s.created_at?.startsWith(currMonth) || s.startDate?.startsWith(currMonth))).reduce((a,s)=>a+(s.amount||0),0);
    const prevMonthRev = subs.filter(s => s.paid && (s.created_at?.startsWith(prevMonth) || s.startDate?.startsWith(prevMonth))).reduce((a,s)=>a+(s.amount||0),0);

    const daysInMonth = new Date(parseInt(currMonth.split('-')[0]), parseInt(currMonth.split('-')[1]), 0).getDate();
    const chartData = Array.from({length: daysInMonth}, (_, i) => {
      const d = `${currMonth}-${String(i+1).padStart(2,'0')}`;
      return { day: i+1, count: attn.filter(a => a.date === d).length };
    });
    const maxChartVal = Math.max(...chartData.map(d => d.count), 1);

    const trialCount = currMonthSubs.filter(s => s.planType === "trial").length + currMonthAttn.filter(a => a.entryType === "trial" && !a.subId).length;
    const singleCount = currMonthSubs.filter(s => s.planType === "single").length + currMonthAttn.filter(a => a.entryType === "single" && !a.subId).length;
    const unpaidAttnCount = currMonthAttn.filter(a => a.entryType === "unpaid").length;

    return {
      totalStudents:students.length, activeStudents:new Set(activeSubs.map(s=>s.studentId)).size, 
      totalRev, unpaid, byDir, splits, currMonthRev, prevMonthRev,
      avgLTV: usersWithPurchases > 0 ? Math.round(totalLTV / usersWithPurchases) : 0, 
      conversionRate: trialUsers > 0 ? Math.round((convertedUsers / trialUsers) * 100) : 0,
      currMonthStats: { trial: trialCount, single: singleCount, pack4: currMonthSubs.filter(s => s.planType === "4pack").length, pack8: currMonthSubs.filter(s => s.planType === "8pack").length, pack12: currMonthSubs.filter(s => s.planType === "12pack").length, cancelledCount: currMonthCancelled, unpaidAttn: unpaidAttnCount },
      chartData, maxChartVal
    };
  },[students,subs,activeSubs,groups, studentMap, cancelled, attn]);

  const proAnalytics = useMemo(() => {
    const last30DaysStr = toLocalISO(new Date(new Date().getTime() - 30 * 86400000));
    const subToSt = {}; subs.forEach(s => subToSt[s.id] = s.studentId);
    
    const getTopSpenders = (months) => {
      const dateLimit = new Date(); dateLimit.setMonth(dateLimit.getMonth() - months);
      const totals = {};
      subs.forEach(s => { if (s.paid && s.startDate >= toLocalISO(dateLimit)) totals[s.studentId] = (totals[s.studentId] || 0) + (s.amount || 0); });
      return Object.entries(totals).map(([id, total]) => ({ student: studentMap[id], total })).filter(x => x.student).sort((a,b) => b.total - a.total).slice(0, 5);
    };

    const groupAttnCounts = {};
    attn.forEach(a => { if (a.date >= last30DaysStr) { const stId = a.subId ? subToSt[a.subId] : null; if (stId) { if (!groupAttnCounts[a.groupId]) groupAttnCounts[a.groupId] = {}; groupAttnCounts[a.groupId][stId] = (groupAttnCounts[a.groupId][stId] || 0) + 1; } } });
    
    const bestAttenders = groups.map(g => { 
        const counts = groupAttnCounts[g.id] || {}; 
        const bestId = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b, null); 
        const dir = dirMap[g.directionId];
        return { group: {...g, direction: dir}, student: studentMap[bestId], count: counts[bestId] }; 
    }).filter(x => x.student);

    const latestAttnByStudent = {};
    attn.forEach(a => {
        let stId = null;
        if (a.subId) stId = subToSt[a.subId];
        else if (a.guestName) {
            const s = Object.values(studentMap).find(x => x.name === a.guestName);
            if (s) stId = s.id;
        }
        if (stId) {
            if (!latestAttnByStudent[stId] || a.date > latestAttnByStudent[stId]) {
                latestAttnByStudent[stId] = a.date;
            }
        }
    });

    const upsellCandidates = [];
    const churnRisk = [];
    
    activeSubs.forEach(sub => {
      const st = studentMap[sub.studentId];
      const gr = groupMap[sub.groupId];
      const dir = dirMap[gr?.directionId];
      if(!st || !gr) return;
      
      const stAttnDates = attn.filter(a => a.groupId === gr.id && a.subId === sub.id).map(a => a.date).sort();
      const stAttn30Days = stAttnDates.filter(d => d >= last30DaysStr).length;

      if (sub.planType === '4pack' && stAttn30Days >= 6) upsellCandidates.push({ student: st, group: {...gr, direction: dir}, suggest: '8 занять', reason: `У цій групі: ${stAttn30Days} трен. за 30 днів` }); 
      else if (sub.planType === '8pack' && stAttn30Days >= 10) upsellCandidates.push({ student: st, group: {...gr, direction: dir}, suggest: '12 занять', reason: `У цій групі: ${stAttn30Days} трен. за 30 днів` });
      
      const trainingsLeft = (sub.totalTrainings || 1) - (sub.usedTrainings || 0);
      const dl = daysLeft(sub.endDate);
      
      if (trainingsLeft <= 1 || dl <= 3) {
          const lastDate = latestAttnByStudent[st.id] || sub.startDate;
          const daysSinceLast = Math.floor((new Date() - new Date(lastDate + "T12:00:00")) / 86400000);

          if (daysSinceLast >= 10 && !churnRisk.some(c => c.student.id === st.id)) {
              churnRisk.push({ student: st, group: {...gr, direction: dir}, daysSinceLast });
          }
      }
    });

    const dayCounts = {0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0};
    attn.filter(a => a.date >= last30DaysStr).forEach(a => {
        const d = new Date(a.date + "T12:00:00").getDay();
        dayCounts[d]++;
    });
    const popularDays = WEEKDAYS.map((name, i) => ({ day: name, count: dayCounts[i] })).sort((a,b) => b.count - a.count);

    return { topSpenders: { 1: getTopSpenders(1), 3: getTopSpenders(3), 6: getTopSpenders(6), 12: getTopSpenders(12) }, bestAttenders, upsellCandidates, churnRisk, popularDays };
  }, [subs, attn, groups, studentMap, activeSubs, dirMap]);

  const filteredStudents=useMemo(()=>{
    let r=students; if(searchQ) r=r.filter(s=>s.name.toLowerCase().includes(searchQ.toLowerCase()));
    if(stFilterDir !== "all") r = r.filter(st => studentGrps.some(sg => sg.studentId === st.id && groupMap[sg.groupId]?.directionId === stFilterDir));
    if(stFilterGroup !== "all") r = r.filter(st => studentGrps.some(sg => sg.studentId === st.id && sg.groupId === stFilterGroup));
    return r.sort((a,b)=>(a.name||"").localeCompare(b.name||"","uk"));
  },[students, searchQ, stFilterDir, stFilterGroup, studentGrps, groupMap]);

  const studentsByDirection=useMemo(()=>{
    const result={}; DIRECTIONS.forEach(d=>{result[d.id]={direction:d,students:[]}});
    filteredStudents.forEach(st=>{ const sgs=studentGrps.filter(sg=>sg.studentId===st.id); const dirs=new Set(); sgs.forEach(sg=>{const g=groupMap[sg.groupId]; if(g)dirs.add(g.directionId)}); dirs.forEach(did=>{if(result[did])result[did].students.push(st)}); });
    return{grouped:Object.values(result).filter(d=>d.students.length>0)};
  },[filteredStudents,studentGrps,groupMap]);

  const filteredSubs=useMemo(()=>{
    let r=subsExt;
    if(filterDir!=="all"){const gids=groups.filter(g=>g.directionId===filterDir).map(g=>g.id);r=r.filter(s=>gids.includes(s.groupId))}
    if(filterGroup!=="all")r=r.filter(s=>s.groupId===filterGroup);
    if(filterStatus!=="all")r=r.filter(s=>s.status===filterStatus);
    if(searchQ){const q=searchQ.toLowerCase();r=r.filter(s=>studentMap[s.studentId]?.name?.toLowerCase().includes(q))}
    return r.sort((a,b)=>({warning:0,active:1,expired:2}[a.status]??3)-({warning:0,active:1,expired:2}[b.status]??3));
  },[subsExt,filterDir,filterGroup,filterStatus,searchQ,groups,studentMap]);

  const subsGroupedByDir = useMemo(()=>{
    const result={}; DIRECTIONS.forEach(d=>{result[d.id]={direction:d,subs:[]}});
    filteredSubs.forEach(sub=>{ const gr=groupMap[sub.groupId]; if(gr && result[gr.directionId]){result[gr.directionId].subs.push(sub);} });
    return {grouped:Object.values(result).filter(d=>d.subs.length>0)};
  },[filteredSubs, groupMap]);

  if(loading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:theme.bg,color:theme.textMuted,fontFamily:"Poppins, sans-serif",fontSize:18}}>Завантаження...</div>;

  const deleteSubAction = async(id) => {
    if(!confirm("Видалити абонемент?")) return;
    try {
      if(db.deleteSub) await db.deleteSub(id);
      setAttn(p=>p.filter(a=>a.subId!==id));
      setSubs(p=>p.filter(s=>s.id!==id));
    } catch(e) {
      alert("❌ Помилка видалення в БД: " + e.message);
    }
  };

  return (
    <div style={{minHeight:"100vh", background:theme.bg, color:theme.textMain, fontFamily:"'Poppins',sans-serif", paddingBottom: 100}}>
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
      
      <header style={{padding:"30px 24px 20px", maxWidth:1200, margin:"0 auto", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:16}}>
        <div><h1 style={{margin:0, fontSize:28, fontWeight:800, letterSpacing: "-1px", color: theme.secondary}}>Dance Studio.</h1></div>
        <div style={{display:"flex", gap:12}}><button style={btnS} onClick={()=>setModal("addStudent")}>+ Учениця</button><button style={btnP} onClick={()=>setModal("addSub")}>+ Абонемент</button></div>
      </header>

      <nav style={{maxWidth:1200, margin:"0 auto", padding:"0 24px 30px", overflowX:"auto"}}>
        <div style={{display:"inline-flex", background: theme.card, borderRadius: 100, padding: 6, boxShadow: "0 4px 20px rgba(168, 177, 206, 0.15)"}}>
          {[
            {id:"dashboard", label:"Дашборд"},
            {id:"students", label:"Учениці"},
            {id:"subs", label:"Абонементи"},
            {id:"attendance", label:"Відвідування"},
            {id:"alerts", label:`Сповіщення (${notifications.filter(n=>!n.notified).length})`},
            {id:"finance", label:"Фінанси"},
            {id:"pro_analytics", label:"📈 Про-Аналітика"},
            {id:"analytics", label:"📊 Instagram"}
          ].map(t=><button key={t.id} onClick={()=>{setTab(t.id);setSearchQ("")}} style={{padding: "12px 24px", background: tab===t.id ? theme.primary : "transparent", border: "none", borderRadius: 100, color: tab===t.id ? "#fff" : theme.textMuted, fontSize: 14, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", transition: "0.2s"}}>{t.label}</button>)}
        </div>
      </nav>

      <main style={{maxWidth:1200, margin:"0 auto", padding:"0 24px"}}>
        {tab==="dashboard" && (
          <div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:20,marginBottom:30}}>
              {[{l:"Учениць",v:analytics.totalStudents,s:`${analytics.activeStudents} активних`,c:theme.primary},{l:"Абонементів",v:activeSubs.length,s:`${notifications.length} сповіщ.`,c:theme.success},{l:"Дохід (Цього міс.)",v:`${analytics.currMonthRev.toLocaleString()}₴`,s:`Минулий: ${analytics.prevMonthRev.toLocaleString()}₴`,c:theme.warning}].map((c,i)=><div key={i} style={{...cardSt, display: "flex", flexDirection: "column", gap: 6, border: `1px solid ${theme.border}`}}><div style={{fontSize:13,color:theme.textLight,textTransform:"uppercase", fontWeight: 700}}>{c.l}</div><div style={{fontSize:36,fontWeight:800,color:c.c}}>{c.v}</div><div style={{fontSize:13,color:theme.textMuted, fontWeight: 600}}>{c.s}</div></div>)}
            </div>
            
            <h3 style={{color:theme.secondary,fontSize:20,marginBottom:16, fontWeight: 800}}>Цього місяця ({today().slice(0, 7)})</h3>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:16,marginBottom:30}}>
              <div style={{...cardSt, background: theme.card, border: `1px solid ${theme.border}`}}><div style={{fontSize:13,color:theme.textMuted,textTransform:"uppercase", fontWeight: 700}}>Разові та пробні</div><div style={{fontSize:28,fontWeight:800,color:theme.textMain,margin:"8px 0"}}>{analytics.currMonthStats.single + analytics.currMonthStats.trial} <span style={{fontSize:14,color:theme.textLight}}>шт.</span></div><div style={{fontSize:12,color:theme.textLight}}>Пробних: {analytics.currMonthStats.trial}</div></div>
              <div style={{...cardSt, background: theme.card, border: `1px solid ${theme.border}`}}><div style={{fontSize:13,color:theme.textMuted,textTransform:"uppercase", fontWeight: 700}}>Абонементи 4</div><div style={{fontSize:28,fontWeight:800,color:theme.textMain,margin:"8px 0"}}>{analytics.currMonthStats.pack4} <span style={{fontSize:14,color:theme.textLight}}>шт.</span></div></div>
              <div style={{...cardSt, background: theme.card, border: `1px solid ${theme.border}`}}><div style={{fontSize:13,color:theme.textMuted,textTransform:"uppercase", fontWeight: 700}}>Абонементи 8</div><div style={{fontSize:28,fontWeight:800,color:theme.textMain,margin:"8px 0"}}>{analytics.currMonthStats.pack8} <span style={{fontSize:14,color:theme.textLight}}>шт.</span></div></div>
              <div style={{...cardSt, background: theme.card, border: `1px solid ${theme.border}`}}><div style={{fontSize:13,color:theme.textMuted,textTransform:"uppercase", fontWeight: 700}}>Абонементи 12</div><div style={{fontSize:28,fontWeight:800,color:theme.textMain,margin:"8px 0"}}>{analytics.currMonthStats.pack12} <span style={{fontSize:14,color:theme.textLight}}>шт.</span></div></div>
              <div style={{...cardSt, background: theme.card, border: `1px solid ${theme.border}`}}><div style={{fontSize:13,color:theme.danger,textTransform:"uppercase", fontWeight: 700}}>Скасовані трен.</div><div style={{fontSize:28,fontWeight:800,color:theme.danger,margin:"8px 0"}}>{analytics.currMonthStats.cancelledCount} <span style={{fontSize:14,color:theme.textLight}}>шт.</span></div></div>
              <div style={{...cardSt, background: theme.card, border: `1px solid ${theme.border}`}}><div style={{fontSize:13,color:theme.danger,textTransform:"uppercase", fontWeight: 700}}>Боргові трен.</div><div style={{fontSize:28,fontWeight:800,color:theme.danger,margin:"8px 0"}}>{analytics.currMonthStats.unpaidAttn} <span style={{fontSize:14,color:theme.textLight}}>шт.</span></div></div>
            </div>

            <div style={{...cardSt, border: `1px solid ${theme.border}`, marginBottom: 40}}>
              <h3 style={{color:theme.secondary,fontSize:18,marginBottom:24, fontWeight: 800}}>Графік відвідуваності</h3>
              <div style={{display: 'flex', alignItems: 'flex-end', gap: 8, height: 180, overflowX: 'auto', overflowY: 'hidden', paddingBottom: 8, paddingTop: 30}}>
                {analytics.chartData.map(d => {
                  const barHeightPx = d.count > 0 ? Math.max((d.count / analytics.maxChartVal) * 120, 8) : 4;
                  return (<div key={d.day} style={{flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', minWidth: 32}}><div style={{fontSize: 12, color: theme.textMain, fontWeight: 800, opacity: d.count > 0 ? 1 : 0, marginBottom: 4}}>{d.count}</div><div style={{width: '100%', background: d.count > 0 ? theme.primary : theme.input, borderRadius: 8, height: `${barHeightPx}px`, transition: 'all 0.3s'}}></div><div style={{fontSize: 12, color: theme.textMuted, marginTop: 10, fontWeight: 600}}>{d.day}</div></div>)
                })}
              </div>
            </div>
            <h3 style={{color:theme.secondary,fontSize:20,marginBottom:16, fontWeight: 800}}>За напрямками</h3>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:16}}>
              {DIRECTIONS.map(d=><div key={d.id} style={{...cardSt, padding: "20px", border: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 110}}><div><div style={{fontSize:14,fontWeight:700,color:d.color, marginBottom: 8}}>{d.name}</div></div><div style={{fontSize:28,fontWeight:800,color:theme.textMain}}>{analytics.byDir[d.id]?.students || 0} <span style={{fontSize: 14, color: theme.textLight, fontWeight: 600}}>уч.</span></div></div>)}
            </div>
          </div>
        )}

        {tab==="attendance" && <AttendanceTab groups={groups} rawSubs={subs} subs={subsExt} setSubs={setSubs} attn={attn} setAttn={setAttn} studentMap={studentMap} studentGrps={studentGrps} cancelled={cancelled} setCancelled={setCancelled} customOrders={customOrders} setCustomOrders={setCustomOrders} />}
        {tab==="pro_analytics" && <ProAnalyticsTab proAnalytics={proAnalytics} />}
        {tab==="analytics" && <Analytics />}
        
        {/* УЧЕНИЦІ */}
        {tab==="students" && <div>
          <div style={{display:"flex",gap:12,marginBottom:24,flexWrap:"wrap",justifyContent:"space-between", background: theme.card, padding: 16, borderRadius: 24, boxShadow: "0 10px 30px rgba(168, 177, 206, 0.15)"}}>
            <div style={{display: "flex", gap: 12, flexWrap: "wrap", flex: 1}}>
              <input style={{...inputSt,maxWidth:300}} placeholder="Пошук учениці..." value={searchQ} onChange={e=>setSearchQ(e.target.value)}/>
              <select style={{...inputSt,width:"auto"}} value={stFilterDir} onChange={e=>{setStFilterDir(e.target.value);setStFilterGroup("all")}}>
                <option value="all">Усі напрямки</option>
                {DIRECTIONS.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <GroupSelect groups={groups} value={stFilterGroup} onChange={setStFilterGroup} filterDir={stFilterDir} allowAll={true} />
            </div>
            <button style={{...btnP, background: theme.warning, boxShadow: "none", height: "fit-content"}} onClick={()=>setModal("addWaitlist")}>+ В резерв</button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:20, marginBottom: 30}}>
            {studentsByDirection.grouped.map(({direction,students:dStudents})=>{
              const isExpanded = expandedDirs[direction.id];
              return (
                <div key={direction.id} style={{background: theme.card, borderRadius: 28, overflow: 'hidden', border: `1px solid ${theme.border}`}}>
                  <button onClick={() => setExpandedDirs(p => ({...p, [direction.id]: !p[direction.id]}))} style={{width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'24px', background:'transparent', border:'none', cursor:'pointer', textAlign:'left'}}>
                    <div style={{fontSize:18,fontWeight:700,color:direction.color}}>{direction.name} <span style={{color:theme.textLight,fontSize:15,fontWeight:600, marginLeft: 8}}>({dStudents.length})</span></div>
                    <div style={{color:theme.textLight, fontSize: 16}}>{isExpanded ? "▲" : "▼"}</div>
                  </button>
                  {isExpanded && (<div style={{padding:'0 24px 24px 24px', display:'flex', flexDirection:'column', gap:12}}>
                    {dStudents.map((st, index) => {
                      const active=subsExt.filter(s=>s.studentId===st.id && s.status!=="expired");
                      return <div key={st.id} style={{background: theme.bg, borderRadius: 20, padding: "20px", display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:16}}>
                        <div style={{display:"flex", gap: 16, alignItems: "center", minWidth: 200}}>
                          <div style={{color: theme.textLight, fontSize: 16, fontWeight: 700}}>{index + 1}.</div>
                          <div>
                            <div style={{color:theme.textMain,fontWeight:700,fontSize:16}}>{st.name}</div>
                            <div style={{color:theme.textMuted,fontSize:14, marginTop: 6, fontWeight: 500}}>{[st.phone,st.telegram].filter(Boolean).join(" · ")||"—"}</div>
                          </div>
                        </div>
                        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{active.map(s=>{const g=groupMap[s.groupId];const d=g?dirMap[g.directionId]:null;return <Badge key={s.id} color={d?.color||"#888"}>{g?.name} ({s.usedTrainings}/{s.totalTrainings})</Badge>})}</div>
                        <div style={{display:"flex",gap:8}}><button style={{...btnS,padding:"10px 16px",fontSize:14, background:"#fff"}} onClick={()=>{setEditItem(st);setModal("editStudent")}}>✏️</button><button style={{background:"none",border:"none",color:theme.danger,fontSize:20,cursor:"pointer",padding:"0 10px"}} onClick={()=>deleteStudent(st.id)}>🗑</button></div>
                      </div>
                    })}
                  </div>)}
                </div>
              );
            })}
          </div>
          {waitlist.length > 0 && (
            <div style={{background: "#FFF9F0", borderRadius: 28, overflow: 'hidden'}}>
              <div style={{padding:'24px', display: "flex", justifyContent: "space-between"}}>
                <span style={{fontSize:18,fontWeight:800,color:theme.warning}}>⏳ Лист очікування ({waitlist.length})</span>
              </div>
              <div style={{padding:'0 24px 24px 24px', display:'flex', flexDirection:'column', gap:12}}>
                {waitlist.map((w, i) => {
                  const st = studentMap[w.studentId]; const gr = groupMap[w.groupId];
                  if(!st || !gr) return null;
                  return (
                    <div key={w.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center", background: "#fff", padding: "20px", borderRadius: 20}}>
                      <div style={{display: "flex", gap: 16, alignItems: "center"}}>
                        <div style={{color: theme.textLight, fontSize: 16, fontWeight: 700}}>{i + 1}.</div>
                        <div><div style={{color:theme.textMain,fontWeight:700,fontSize:16}}>{st.name}</div><div style={{color:theme.textMuted,fontSize:14, marginTop: 6, fontWeight: 500}}>Хоче в: <strong style={{color:theme.secondary}}>{gr.name}</strong></div></div>
                      </div>
                      <button style={{...btnS,padding:"10px 16px",fontSize:14,color:theme.danger, background: theme.input}} onClick={()=>db.deleteWaitlist(w.id).then(()=>setWaitlist(p=>p.filter(x=>x.id!==w.id)))}>Видалити</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>}

        {/* === АБОНЕМЕНТИ === */}
        {tab==="subs" && <div>
          <div style={{display:"flex",gap:12,marginBottom:24,flexWrap:"wrap", background: theme.card, padding: 16, borderRadius: 24, boxShadow: "0 10px 30px rgba(168, 177, 206, 0.15)"}}>
            <input style={{...inputSt,width:"auto",minWidth:250, flexGrow: 1}} placeholder="Пошук за прізвищем..." value={searchQ} onChange={e=>setSearchQ(e.target.value)}/>
            <select style={{...inputSt,width:"auto"}} value={filterDir} onChange={e=>{setFilterDir(e.target.value);setFilterGroup("all")}}>
              <option value="all">Усі напрямки</option>
              {DIRECTIONS.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <GroupSelect groups={groups} value={filterGroup} onChange={setFilterGroup} filterDir={filterDir} allowAll={true} />
            <select style={{...inputSt,width:"auto"}} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
              <option value="all">Усі статуси</option><option value="active">Активні</option><option value="warning">Закінчуються</option><option value="expired">Протерміновані</option>
            </select>
          </div>
          {filteredSubs.length===0?<div style={{color:theme.textLight,padding:60,textAlign:"center", fontSize: 16, fontWeight: 600}}>За цими фільтрами немає абонементів</div>:
          <div style={{display:"flex",flexDirection:"column",gap:20}}>
            {subsGroupedByDir.grouped.filter(d => filterDir === "all" || d.direction.id === filterDir).map(({direction, subs: dSubs}) => {
              const finalSubs = filterGroup !== "all" ? dSubs.filter(s => s.groupId === filterGroup) : dSubs;
              if (finalSubs.length === 0) return null;
              const isExpanded = expandedSubDirs[direction.id];
              return (
                <div key={direction.id} style={{background: theme.card, borderRadius: 28, overflow: 'hidden', border: `1px solid ${theme.border}`}}>
                  <button onClick={() => setExpandedSubDirs(p => ({...p, [direction.id]: !p[direction.id]}))} style={{width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'24px', background:'transparent', border:'none', cursor:'pointer', textAlign:'left'}}>
                    <div style={{fontSize:18,fontWeight:700,color:direction.color}}>{direction.name} <span style={{color:theme.textLight,fontSize:15,fontWeight:600, marginLeft: 8}}>({finalSubs.length})</span></div>
                    <div style={{color:theme.textLight, fontSize: 16}}>{isExpanded ? "▲" : "▼"}</div>
                  </button>
                  {isExpanded && (
                    <div style={{overflowX: "auto", padding: "0 24px 24px 24px"}}>
                      <table style={{width: "100%", borderCollapse: "collapse", fontSize: 14, textAlign: "left"}}>
                        <thead>
                          <tr style={{color: theme.textLight, textTransform: "uppercase", fontSize: 12, letterSpacing: 0.5}}>
                            <th style={{padding: "16px 14px", width: 40}}>#</th>
                            <th style={{padding: "16px 14px", fontWeight: 700}}>Учениця</th>
                            <th style={{padding: "16px 14px", fontWeight: 700}}>Група</th>
                            <th style={{padding: "16px 14px", fontWeight: 700}}>Абонемент</th>
                            <th style={{padding: "16px 14px", fontWeight: 700}}>Заняття</th>
                            <th style={{padding: "16px 14px", fontWeight: 700}}>Термін</th>
                            <th style={{padding: "16px 14px", fontWeight: 700}}>Статус</th>
                            <th style={{padding: "16px 14px", fontWeight: 700, textAlign: "right"}}>Дії</th>
                          </tr>
                        </thead>
                        <tbody>
                          {finalSubs.map((sub, index) => {
                            const st=studentMap[sub.studentId], gr=groupMap[sub.groupId], planLabel=PLAN_TYPES.find(p=>p.id===sub.planType)?.name||sub.planType;
                            return <tr key={sub.id} style={{borderTop: `1px solid ${theme.bg}`}}>
                              <td style={{padding: "16px 14px", color: theme.textLight, fontWeight: 700}}>{index + 1}</td>
                              <td style={{padding: "16px 14px", color: theme.textMain, fontWeight: 600, whiteSpace:"nowrap"}}>{st?.name||"?"}</td>
                              <td style={{padding: "16px 14px", whiteSpace:"nowrap"}}><span style={{color: theme.textMuted, fontWeight: 500}}>{gr?.name}</span></td>
                              <td style={{padding: "16px 14px", whiteSpace:"nowrap"}}><span style={{color: theme.textMuted, fontWeight: 500}}>{planLabel}</span></td>
                              <td style={{padding: "16px 14px", whiteSpace:"nowrap"}}><span style={{color: theme.textMain, fontWeight: 800, fontSize: 16}}>{sub.usedTrainings}</span><span style={{color: theme.textLight, fontWeight: 500}}> / {sub.totalTrainings}</span></td>
                              <td style={{padding: "16px 14px", whiteSpace:"nowrap"}}><span style={{color: theme.textMuted, fontWeight: 500, fontFamily:"monospace"}}>{fmt(sub.startDate)} — {fmt(sub.endDate)}</span></td>
                              <td style={{padding: "16px 14px", whiteSpace:"nowrap"}}><Badge color={STATUS_COLORS[sub.status]}>{STATUS_LABELS[sub.status]}</Badge>{!sub.paid&&<span style={{marginLeft: 8}}><Badge color={theme.danger}>Борг</Badge></span>}</td>
                              <td style={{padding: "16px 14px", textAlign: "right", whiteSpace:"nowrap"}}>
                                <button style={{background:"none",border:"none",cursor:"pointer",fontSize:18,marginRight:16}} onClick={()=>{setEditItem(sub);setModal("editSub")}}>✏️</button>
                                <button style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:theme.danger}} onClick={()=>deleteSubAction(sub.id)}>🗑</button>
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

        {/* === СПОВІЩЕННЯ === */}
        {tab==="alerts" && <div>
          {alertsByGroup.length === 0 ? <div style={{textAlign:"center",padding:60,color:theme.textLight, fontSize: 16, fontWeight: 600}}>✨ Всі абонементи активні, боргів та сповіщень немає!</div>:
          <div>
            {alertsByGroup.map(g => (
              <div key={g.group.id} style={{marginBottom: 32}}>
                <div style={{display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${theme.border}`, paddingBottom: 12, marginBottom: 16}}>
                  <h3 style={{margin: 0, color: theme.secondary, fontSize: 18}}>{g.group.name}</h3>
                  <Badge color={g.dir?.color || theme.primary}>{g.dir?.name}</Badge>
                </div>
                <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))", gap: 16}}>
                  {g.items.map(n => {
                    const msg=getNotifMsg(null,n.student,n.group,n.direction);
                    const tgUser=n.student.telegram?.replace("@","");
                    const tgLink=tgUser?`https://t.me/${tgUser}?text=${encodeURIComponent(msg)}`:null;
                    return (
                      <div key={n.subId} style={{...cardSt, opacity:n.notified?.6:1, borderLeft: `4px solid ${STATUS_COLORS[n.status]}`}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:16}}>
                          <div>
                            <div style={{display: "flex", gap: 12, alignItems: "center", marginBottom: 8}}>
                              <span style={{color:theme.textMain,fontWeight:800, fontSize: 18}}>{n.student.name}</span> 
                              <Badge color={n.type==="expired"?theme.danger:theme.warning}>{n.message}</Badge>
                              {n.notified&&<Badge color={theme.textLight}>✅ Відправлено</Badge>}
                            </div>
                            <div style={{color:theme.textMuted,fontSize:14, fontWeight: 500}}>{n.student.phone || 'Немає номеру'}</div>
                          </div>
                          <div style={{display:"flex",gap:10, flexWrap: 'wrap', justifyContent: 'flex-end'}}>
                            {tgLink&&<a href={tgLink} target="_blank" rel="noopener noreferrer" onClick={()=>markNotified(n.subId)} style={{padding:"10px 16px",borderRadius:12,background:`${theme.primary}15`,color:theme.primary,fontSize:13,fontWeight: 700, textDecoration:"none"}}>💬 Написати</a>}
                            {!n.notified&&<button style={{...btnS,padding:"10px 16px",fontSize:13, borderRadius: 12}} onClick={()=>markNotified(n.subId)}>Відмітити</button>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>}
        </div>}

        {/* === ФІНАНСИ === */}
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
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:20,marginBottom:30}}>
                <div style={{...cardSt, background: theme.card}}><div style={{fontSize:13,color:theme.success,textTransform:"uppercase", letterSpacing: 0.5, fontWeight: 700}}>Загалом оплачено</div><div style={{fontSize:42,fontWeight:800,color:theme.success, marginTop: 8}}>{analytics.totalRev.toLocaleString()} ₴</div></div>
                <div style={{...cardSt, background: theme.card}}><div style={{fontSize:13,color:theme.danger,textTransform:"uppercase", letterSpacing: 0.5, fontWeight: 700}}>Борги учениць</div><div style={{fontSize:42,fontWeight:800,color:theme.danger, marginTop: 8}}>{analytics.unpaid.toLocaleString()} ₴</div></div>
              </div>
              <div style={{display:"flex",gap:12,marginBottom:24,flexWrap:"wrap", background: theme.card, padding: 16, borderRadius: 24, boxShadow: "0 10px 30px rgba(168, 177, 206, 0.15)"}}>
                <div style={{flex: 1, display: "flex", gap: 12, minWidth: 300, flexWrap: "wrap"}}>
                  <select style={{...inputSt, width: "auto"}} value={finFilterDir} onChange={e=>{setFinFilterDir(e.target.value); setFinFilterGroup("all");}}><option value="all">Усі напрямки</option>{DIRECTIONS.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>
                  <GroupSelect groups={groups} value={finFilterGroup} onChange={setFinFilterGroup} filterDir={finFilterDir} allowAll={true} />
                </div>
                <div style={{display: "flex", gap: 12, flexWrap: "wrap"}}>
                  <select style={{...inputSt, width: "auto"}} value={finSortBy} onChange={e=>setFinSortBy(e.target.value)}><option value="total">За доходом</option><option value="trainer">За ЗП тренера</option><option value="studio">За доходом студії</option><option value="name">За назвою</option></select>
                  <button style={{...btnS, padding: "0 16px", fontSize: 18}} onClick={()=>setFinSortOrder(p=>p==="desc"?"asc":"desc")}>{finSortOrder === "desc" ? "⬇" : "⬆"}</button>
                </div>
              </div>
              <h3 style={{color:theme.secondary,fontSize:20,marginBottom:20, fontWeight: 800}}>Деталізація по групах ({finData.length})</h3>
              {finData.length === 0 ? <div style={{color:theme.textLight,padding:60,textAlign:"center", fontSize: 16, fontWeight: 600}}>За цими фільтрами немає оплат</div> :
              <div style={{display:"flex",flexDirection:"column",gap:24}}>
                {finData.map(sp => {
                  const dir = dirMap[sp.group.directionId]; const trainerPct = sp.group.trainerPct; const studioPct = 100 - trainerPct;
                  return (
                    <div key={sp.group.id} style={{background: theme.card, borderRadius: 28, padding: "28px", display: "flex", flexDirection: "column", gap: 24, boxShadow: "0 10px 40px rgba(168, 177, 206, 0.15)"}}>
                      <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12}}>
                        <div><div style={{display: "flex", alignItems: "center", gap: 12, marginBottom: 8}}><span style={{color:theme.textMain,fontWeight:800, fontSize: 20}}>{sp.group.name}</span><Badge color={dir?.color||"#888"}>{dir?.name}</Badge></div><div style={{fontSize: 14, color: theme.textMuted, fontWeight: 500}}>Оплачених абонементів: <strong style={{color: theme.textMain}}>{sp.subs.length}</strong></div></div>
                        <div style={{textAlign: "right"}}><div style={{fontSize: 12, color: theme.textLight, textTransform: "uppercase", fontWeight: 700}}>Загальний збір</div><div style={{fontSize: 28, fontWeight: 800, color: theme.textMain, marginTop: 4}}>{sp.total.toLocaleString()} ₴</div></div>
                      </div>
                      <div style={{height: 12, width: "100%", display: "flex", borderRadius: 100, overflow: "hidden"}}>
                        <div style={{width: `${trainerPct}%`, background: theme.primary}}></div>
                        <div style={{width: `${studioPct}%`, background: theme.success}}></div>
                      </div>
                      <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16}}>
                        <div style={{display: "flex", gap: 40}}>
                          <div><div style={{fontSize:12,color:theme.textMuted, fontWeight: 700}}>Тренер ({trainerPct}%)</div><div style={{fontSize:20,fontWeight:800,color:theme.primary, marginTop: 6}}>{sp.trainer.toLocaleString()} ₴</div></div>
                          <div><div style={{fontSize:12,color:theme.textMuted, fontWeight: 700}}>Студія ({studioPct}%)</div><div style={{fontSize:20,fontWeight:800,color:theme.success, marginTop: 6}}>{sp.studio.toLocaleString()} ₴</div></div>
                        </div>
                        <button style={{...btnS, padding: "12px 24px", background: theme.input}} onClick={() => setFinanceDetailItem(sp)}>🧾 Детальний звіт</button>
                      </div>
                    </div>
                  )
                })}
              </div>}
            </div>
          )
        })()}

        {/* === АНАЛІТИКА INSTAGRAM === */}
        {tab === "analytics" && <Analytics />}

      </main>

      {/* МОДАЛКИ */}
      <Modal open={!!financeDetailItem} onClose={()=>setFinanceDetailItem(null)} title={`Зарплата: ${financeDetailItem?.group?.name}`} wide>
        {financeDetailItem && (
          <div>
            <div style={{display: "flex", justifyContent: "space-between", background: theme.input, padding: "20px 24px", borderRadius: 20, marginBottom: 24}}>
              <div><div style={{fontSize: 12, color: theme.textMuted, textTransform: "uppercase", fontWeight: 700}}>Тренеру ({financeDetailItem.group.trainerPct}%)</div><div style={{fontSize: 26, fontWeight: 800, color: theme.primary, marginTop: 6}}>{financeDetailItem.trainer.toLocaleString()} ₴</div></div>
              <div style={{textAlign: "right"}}><div style={{fontSize: 12, color: theme.textMuted, textTransform: "uppercase", fontWeight: 700}}>Студії ({100 - financeDetailItem.group.trainerPct}%)</div><div style={{fontSize: 26, fontWeight: 800, color: theme.success, marginTop: 6}}>{financeDetailItem.studio.toLocaleString()} ₴</div></div>
            </div>
            <table style={{width: "100%", borderCollapse: "collapse", fontSize: 15, textAlign: "left"}}>
              <thead><tr style={{color: theme.textLight, borderBottom: `1px solid ${theme.border}`}}><th style={{padding: "16px 0", fontWeight: 700}}>Учениця</th><th style={{padding: "16px 0", fontWeight: 700}}>Тип</th><th style={{padding: "16px 0", fontWeight: 700, textAlign: "right"}}>Оплачено</th><th style={{padding: "16px 0", fontWeight: 700, textAlign: "right", color: theme.primary}}>Частка тренера</th></tr></thead>
              <tbody>{financeDetailItem.subs.map(sub => (<tr key={sub.id} style={{borderBottom: `1px solid ${theme.bg}`}}><td style={{padding: "16px 0", color: theme.textMain, fontWeight: 600}}>{studentMap[sub.studentId]?.name}</td><td style={{padding: "16px 0", color: theme.textMuted, fontWeight: 500}}>{PLAN_TYPES.find(p=>p.id===sub.planType)?.name}</td><td style={{padding: "16px 0", textAlign: "right", fontWeight: 600, color: theme.textMain}}>{sub.amount} ₴</td><td style={{padding: "16px 0", textAlign: "right", color: theme.primary, fontWeight: 800}}>+ {Math.round((sub.amount || 0) * (financeDetailItem.group.trainerPct / 100))} ₴</td></tr>))}</tbody>
            </table>
          </div>
        )}
      </Modal>
      <Modal open={modal==="addStudent"} onClose={()=>setModal(null)} title="Нова учениця"><StudentForm onCancel={()=>setModal(null)} onDone={async(d)=>{try{const s=await db.insertStudent(d);setStudents(p=>[...p,s||{id:uid(),...d}]);setModal(null);}catch(e){alert("❌ Помилка БД: "+e.message)}}} studentGrps={studentGrps} groups={groups}/></Modal>
      <Modal open={modal==="editStudent"} onClose={()=>{setModal(null);setEditItem(null)}} title="Редагувати профіль"><StudentForm onCancel={()=>{setModal(null);setEditItem(null)}} initial={editItem} onDone={async(d)=>{try{const s=await db.updateStudent(editItem.id,d);setStudents(p=>p.map(x=>x.id===editItem.id?(s||{...x,...d}):x));setModal(null);setEditItem(null);}catch(e){alert("❌ Помилка БД: "+e.message)}}} studentGrps={studentGrps} groups={groups}/></Modal>
      <Modal open={modal==="addSub"} onClose={()=>setModal(null)} title="Оформити абонемент"><SubForm onCancel={()=>setModal(null)} onDone={async(d)=>{try{const s=await db.insertSub(d);setSubs(p=>[s||{id:uid(),...d},...p]);setModal(null);}catch(e){alert("❌ Помилка БД: "+e.message)}}} students={students} groups={groups} studentGrps={studentGrps}/></Modal>
      <Modal open={modal==="editSub"} onClose={()=>{setModal(null);setEditItem(null)}} title="Редагувати абонемент"><SubForm onCancel={()=>{setModal(null);setEditItem(null)}} initial={editItem} onDone={async(d)=>{try{const s=await db.updateSub(editItem.id,d);setSubs(p=>p.map(x=>x.id===editItem.id?(s||{...x,...d}):x));setModal(null);setEditItem(null);}catch(e){alert("❌ Помилка БД: "+e.message)}}} students={students} groups={groups} studentGrps={studentGrps}/></Modal>
      <Modal open={modal==="addWaitlist"} onClose={()=>setModal(null)} title="Додати в резерв"><WaitlistForm onCancel={()=>setModal(null)} onDone={async(d)=>{try{if(db.insertWaitlist){const w=await db.insertWaitlist(d);setWaitlist(p=>[...p,w]);}else{setWaitlist(p=>[...p,{...d, id:uid()}]);}setModal(null);}catch(e){alert("❌ Помилка БД: "+e.message)}}} students={students} groups={groups} studentGrps={studentGrps}/></Modal>
    </div>
  );
}
