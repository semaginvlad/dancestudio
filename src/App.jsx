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

const toLocalISO = (dt) => {
  if (isNaN(dt.getTime())) return "2000-01-01"; 
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
};
const addMonth = (d) => { const dt = new Date(d+"T12:00:00"); dt.setMonth(dt.getMonth()+1); return toLocalISO(dt); };
const today = () => toLocalISO(new Date());
const fmt = (d) => { if(!d || d === "2000-01-01") return "—"; const dt=new Date(d+"T12:00:00"); return dt.toLocaleDateString("uk-UA",{day:"2-digit",month:"2-digit"}); };
const daysLeft = (ed) => {
  if (!ed || ed === "2000-01-01") return 0;
  return Math.ceil((new Date(ed+"T23:59:59")-new Date())/86400000);
};
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,7);

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

function getNotifMsg(sub,student,group,direction){
  if (!student) return "Привіт! Абонемент закінчився.";
  const fName = student.firstName || student.first_name || student.name?.split(" ")[1] || student.name?.split(" ")[0] || ""; 
  const gName=group?.name||"";
  const dName=direction?.name||"";
  const tpl=student.messageTemplate||student.message_template;
  if(tpl)return tpl.replace(/\{ім'я\}/g,fName).replace(/\{група\}/g,gName).replace(/\{напрямок\}/g,dName);
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

function StudentSelectWithSearch({ students, value, onChange, studentGrps, groups }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const sortedStudents = useMemo(() => [...students].sort((a,b) => getDisplayName(a).localeCompare(getDisplayName(b),"uk")), [students]);
  const filtered = useMemo(() => sortedStudents.filter(s => getDisplayName(s).toLowerCase().includes(search.toLowerCase())), [sortedStudents, search]);

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
        {selectedSt ? getDisplayName(selectedSt) : "Оберіть ученицю..."}
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
                      {getDisplayName(s)}
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
  const initialFirstName = initial?.first_name || nameParts[1] || "";
  const initialLastName = initial?.last_name || nameParts[0] || "";

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
      <button type="button" style={{...btnP,opacity:(firstName.trim() || lastName.trim())?1:.4}} onClick={()=>{if(!firstName.trim() && !lastName.trim())return;onDone({first_name:firstName.trim(),last_name:lastName.trim(),name:[lastName.trim(),firstName.trim()].filter(Boolean).join(' '),phone,telegram,notes,message_template:msgTpl,selectedGroups:selGrps})}}>{initial?"Зберегти зміни":"Додати ученицю"}</button>
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
    .filter(st => st && getDisplayName(st) !== "Невідомо")
    .sort((a,b) => getDisplayName(a).localeCompare(getDisplayName(b), "uk"));

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
     const currentOrder = customOrders[gid] || baseStudsInGroup.map(s => s.id);
     const completeOrder = [...new Set([...currentOrder, ...baseStudsInGroup.map(s => s.id)])].filter(id => baseStudsInGroup.some(s => s.id === id));
     const fromIdx = completeOrder.indexOf(draggedId);
     const toIdx = completeOrder.indexOf(targetId);
     if (fromIdx === -1 || toIdx === -1) return;
     
     const newOrder = [...completeOrder];
     const [movedItem] = newOrder.splice(fromIdx, 1);
     newOrder.splice(toIdx, 0, movedItem);
     setCustomOrders({ ...customOrders, [gid]: newOrder });
  };

  const addManual = async () => {
    if (!manualName.trim()) return;
    try {
      const a = { id: uid(), guestName: manualName.trim(), guestType: journalGuestMode, groupId: gid, date: manualDate, quantity: 1, entryType: journalGuestMode };
      setAttn(p => [...p, a]);
      if(db.insertAttendance) await db.insertAttendance(a);
    } catch (e) { console.warn("DB Error", e); }
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
    if (!confirm(`Точно скасувати тренування ${cancelDate}? Всі активні абонементи будуть подовжені на наступне заняття групи.`)) return;
    try {
      const currentGroup = groups.find(g => g.id === gid);
      const affectedSubs = rawSubs.filter(s => s.groupId === gid && s.startDate <= cancelDate && s.endDate >= cancelDate);
      
      const originalEnds = {};
      let newSubs = [...rawSubs];
      
      for (let sub of affectedSubs) {
        originalEnds[sub.id] = sub.endDate; 
        const newEndStr = getNextTrainingDate(currentGroup?.schedule, sub.endDate);
        if(db.updateSub) db.updateSub(sub.id, { endDate: newEndStr }).catch(e=>console.warn(e));
        newSubs = newSubs.map(s => s.id === sub.id ? { ...s, endDate: newEndStr } : s);
      }
      
      const newCancel = { id: uid(), groupId: gid, date: cancelDate, originalEnds };
      setCancelled(p => [...p, newCancel]);
      setSubs(newSubs);
      if (db.insertCancelled) db.insertCancelled(newCancel).catch(e=>console.warn(e)); 
    } catch (e) { console.warn(e); }
  };

  const handleRestoreSpecificDay = async (restoreDate) => {
    if (!confirm(`Відновити скасоване тренування ${restoreDate}? Терміни абонементів будуть повернуті до початкових.`)) return;
    try {
      const targetCancel = cancelled.find(c => c.groupId === gid && c.date === restoreDate);
      if (!targetCancel) return;

      let newSubs = [...rawSubs];
      const currentGroup = groups.find(g => g.id === gid);

      if (targetCancel.originalEnds && Object.keys(targetCancel.originalEnds).length > 0) {
        for (const [subId, origEnd] of Object.entries(targetCancel.originalEnds)) {
           if(db.updateSub) db.updateSub(subId, { endDate: origEnd }).catch(e=>console.warn(e));
           newSubs = newSubs.map(s => s.id === subId ? { ...s, endDate: origEnd } : s);
        }
      } else {
        // Жорсткий математичний відкат для всіх активних у той день абонементів
        const affectedSubs = newSubs.filter(s => s.groupId === gid && s.endDate >= restoreDate);
        for (let sub of affectedSubs) {
           const revertedEnd = getPreviousTrainingDate(currentGroup?.schedule, sub.endDate);
           if(db.updateSub) db.updateSub(sub.id, { endDate: revertedEnd }).catch(e=>console.warn(e));
           newSubs = newSubs.map(s => s.id === sub.id ? { ...s, endDate: revertedEnd } : s);
        }
      }
      
      setSubs(newSubs);
      setCancelled(p => p.filter(c => c.id !== targetCancel.id));
      if (db.deleteCancelled) db.deleteCancelled(targetCancel.id).catch(e=>console.warn(e));
      
    } catch (e) { console.warn("Restore Error:", e); }
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
                    <span style={{color: theme.textLight, marginRight: 8, fontSize: 12}}>{i+1}.</span>{getDisplayName(st)}
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
            <input style={inputSt} value={manualName} onChange={e=>setManualName(e.target.value)} placeholder="Прізвище Ім'я учениці" onKeyDown={e=>e.key==="Enter"&&addManual()}/>
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
                  <div style={{fontWeight: 700, color: theme.textMain, fontSize: 16}}>{getDisplayName(item.student)}</div>
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
                  <div style={{fontWeight: 700, color: theme.textMain}}>{getDisplayName(item.student)}</div>
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
                    <div style={{fontWeight: 700, color: theme.textMain}}>{getDisplayName(item.student)}</div>
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
                <div style={{fontWeight: 800, color: theme.textMain, fontSize: 15}}>{getDisplayName(item.student)}</div>
                <div style={{fontSize: 13, color: theme.primary, marginTop: 4, fontWeight: 700}}>{item.count} занять</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
