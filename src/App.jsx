// src/App.jsx
import { useState, useEffect, useMemo } from "react";
import * as db from "./db";
import { DIRECTIONS, PLAN_TYPES, DEFAULT_GROUPS, today, daysLeft, getSubStatus, STATUS_COLORS, STATUS_LABELS } from "./utils";
import { btnP, btnS, cardSt, Modal, Field, Badge, Pill } from "./ui";

import AttendanceTab from "./AttendanceTab";
import DashboardTab from "./DashboardTab";
import FinanceTab from "./FinanceTab";
import StudentsTab from "./StudentsTab";

export default function App() {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [subs, setSubs] = useState([]);
  const [attn, setAttn] = useState([]);
  const [groups, setGroups] = useState(DEFAULT_GROUPS);
  const [cancelled, setCancelled] = useState([]);
  const [studentGrps, setStudentGrps] = useState([]);
  const [waitlist, setWaitlist] = useState([]); 
  const [tab, setTab] = useState("dashboard");
  const [modal, setModal] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [financeDetailItem, setFinanceDetailItem] = useState(null);
  const [searchQ, setSearchQ] = useState("");
  
  // Фільтри
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

  useEffect(()=>{(async()=>{try{
    const [st,gr,su,at,ca,sg]=await Promise.all([db.fetchStudents(),db.fetchGroups(),db.fetchSubs(),db.fetchAttendance(),db.fetchCancelled(),db.fetchStudentGroups()]);
    setStudents(st||[]);if(gr?.length)setGroups(gr);setSubs(su||[]);setAttn(at||[]);setCancelled(ca||[]);setStudentGrps(sg||[]);
    try { if (db.fetchWaitlist) { const wl = await db.fetchWaitlist(); setWaitlist(wl || []); } } catch(e) {}
  }catch(e){console.error(e)}setLoading(false)})()},[]);

  const studentMap = useMemo(()=>Object.fromEntries(students.map(s=>[s.id,s])),[students]);
  const groupMap = useMemo(()=>Object.fromEntries(groups.map(g=>[g.id,g])),[groups]);
  const dirMap = useMemo(()=>Object.fromEntries(DIRECTIONS.map(d=>[d.id,d])),[]);
  const subsExt = useMemo(()=>subs.map(s=>({...s,status:getSubStatus(s)})),[subs]);
  const activeSubs = useMemo(()=>subsExt.filter(s=>s.status!=="expired"),[subsExt]);
  const warnSubs = useMemo(()=>subsExt.filter(s=>s.status==="warning"),[subsExt]);
  const expSubs = useMemo(()=>subsExt.filter(s=>s.status==="expired"),[subsExt]);

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

  const analytics = useMemo(()=>{
    const totalRev=subs.filter(s=>s.paid).reduce((a,s)=>a+(s.amount||0),0);
    const unpaid=subs.filter(s=>!s.paid&&getSubStatus(s)!=="expired").reduce((a,s)=>a+(s.amount||0),0);
    const byDir={};DIRECTIONS.forEach(d=>{const gids=groups.filter(g=>g.directionId===d.id).map(g=>g.id);const ds=activeSubs.filter(s=>gids.includes(s.groupId));byDir[d.id]={students:new Set(ds.map(s=>s.studentId)).size}});
    const splits=[]; groups.forEach(g=>{
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
        if(hadTrial) { trialUsers++; if(stSubs.some(s => s.planType !== "trial")) convertedUsers++; }
      }
    });
    return {totalStudents:students.length, activeStudents:new Set(activeSubs.map(s=>s.studentId)).size, totalRev, unpaid, byDir, splits, avgLTV: usersWithPurchases > 0 ? Math.round(totalLTV / usersWithPurchases) : 0, conversionRate: trialUsers > 0 ? Math.round((convertedUsers / trialUsers) * 100) : 0};
  },[students,subs,activeSubs,groups, studentMap]);

  const filteredStudents=useMemo(()=>{
    let r=students;
    if(searchQ){const q=searchQ.toLowerCase();r=r.filter(s=>s.name.toLowerCase().includes(q))}
    if(stFilterDir !== "all"){ const gids = groups.filter(g => g.directionId === stFilterDir).map(g => g.id); r = r.filter(st => studentGrps.some(sg => sg.studentId === st.id && gids.includes(sg.groupId))); }
    if(stFilterGroup !== "all") r = r.filter(st => studentGrps.some(sg => sg.studentId === st.id && sg.groupId === stFilterGroup));
    return r.sort((a,b)=>a.name.localeCompare(b.name,"uk"));
  },[students, searchQ, stFilterDir, stFilterGroup, groups, studentGrps]);

  const studentsByDirection=useMemo(()=>{
    const result={}; DIRECTIONS.forEach(d=>{result[d.id]={direction:d,students:[]}});
    filteredStudents.forEach(st=>{
      const sgs=studentGrps.filter(sg=>sg.studentId===st.id);
      const dirs=new Set(); sgs.forEach(sg=>{const g=groupMap[sg.groupId]; if(g)dirs.add(g.directionId)});
      dirs.forEach(did=>{if(result[did])result[did].students.push(st)});
    });
    return{grouped:Object.values(result).filter(d=>d.students.length>0)};
  },[filteredStudents,studentGrps,groupMap]);

  if(loading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#000",color:"#8E8E93"}}>Завантаження...</div>;

  const TABS=[{id:"dashboard",icon:"📊",label:"Дашборд"},{id:"students",icon:"👩‍🎤",label:"Учениці"},{id:"subs",icon:"🎫",label:"Абонементи"},{id:"attendance",icon:"✅",label:"Відвідування"},{id:"alerts",icon:notifications.filter(n=>!n.notified).length?"🔴":"🔔",label:"Сповіщення"},{id:"finance",icon:"💰",label:"Фінанси"}];

  return (
    <div style={{minHeight:"100vh", background:"#000", color:"#fff", fontFamily:"'DM Sans',sans-serif", paddingBottom: 80}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
      <header style={{padding:"20px 24px", paddingTop: 30}}>
        <div style={{maxWidth:1200, margin:"0 auto", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:14}}>
          <div><h1 style={{margin:0, fontSize:26, fontWeight:800, letterSpacing: "-0.5px"}}>Dance Studio.</h1></div>
          <div style={{display:"flex", gap:10}}><button style={{...btnS}} onClick={()=>setModal("addStudent")}>+ Учениця</button><button style={{...btnP, background: "#0A84FF"}} onClick={()=>setModal("addSub")}>+ Абонемент</button></div>
        </div>
      </header>
      <nav style={{maxWidth:1200, margin:"0 auto", padding:"0 20px", marginBottom: 30, overflowX:"auto"}}>
        <div style={{display:"inline-flex", background: "#1C1C1E", borderRadius: 100, padding: 6}}>
          {TABS.map(t=><button key={t.id} onClick={()=>{setTab(t.id);setSearchQ("")}} style={{padding: "10px 20px", background: tab===t.id ? "#3A3A3C" : "transparent", border: "none", borderRadius: 100, color: tab===t.id ? "#fff" : "#8E8E93", fontSize: 14, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", transition: "0.2s"}}>{t.icon} {t.label}</button>)}
        </div>
      </nav>
      <main style={{maxWidth:1200, margin:"0 auto", padding:"0 20px"}}>
        {tab==="dashboard" && <DashboardTab analytics={analytics} activeSubsCount={activeSubs.length} warnSubsCount={warnSubs.length} notificationsCount={notifications.filter(n=>!n.notified).length} />}
        {tab==="students" && <StudentsTab searchQ={searchQ} setSearchQ={setSearchQ} stFilterDir={stFilterDir} setStFilterDir={setStFilterDir} stFilterGroup={stFilterGroup} setStFilterGroup={setStFilterGroup} groups={groups} setModal={setModal} studentsByDirection={studentsByDirection} expandedDirs={expandedDirs} setExpandedDirs={setExpandedDirs} subsExt={subsExt} groupMap={groupMap} dirMap={dirMap} waitlist={waitlist} studentMap={studentMap} removeWaitlist={(id)=>db.deleteWaitlist(id).then(()=>setWaitlist(p=>p.filter(w=>w.id!==id)))} setEditItem={setEditItem} />}
        {tab==="attendance" && <AttendanceTab groups={groups} subs={subs} setSubs={setSubs} attn={attn} setAttn={setAttn} studentMap={studentMap} studentGrps={studentGrps} cancelled={cancelled} />}
        {tab==="finance" && <FinanceTab analytics={analytics} groups={groups} dirMap={dirMap} finFilterDir={finFilterDir} setFinFilterDir={setFinFilterDir} finFilterGroup={finFilterGroup} setFinFilterGroup={setFinFilterGroup} finSortBy={finSortBy} setFinSortBy={setFinSortBy} finSortOrder={finSortOrder} setFinSortOrder={setFinSortOrder} setFinanceDetailItem={setFinanceDetailItem} />}
      </main>

      <Modal open={!!financeDetailItem} onClose={()=>setFinanceDetailItem(null)} title={`Зарплата: ${financeDetailItem?.group?.name}`} wide>
        {financeDetailItem && (
          <div>
            <div style={{display: "flex", justifyContent: "space-between", background: "#2C2C2E", padding: "16px 20px", borderRadius: 16, marginBottom: 20}}>
              <div><div style={{fontSize: 12, color: "#8E8E93", textTransform: "uppercase", fontWeight: 600}}>Тренеру ({financeDetailItem.group.trainerPct}%)</div><div style={{fontSize: 24, fontWeight: 800, color: "#0A84FF", marginTop: 4}}>{financeDetailItem.trainer.toLocaleString()} ₴</div></div>
              <div style={{textAlign: "right"}}><div style={{fontSize: 12, color: "#8E8E93", textTransform: "uppercase", fontWeight: 600}}>Студії ({100 - financeDetailItem.group.trainerPct}%)</div><div style={{fontSize: 24, fontWeight: 800, color: "#30D158", marginTop: 4}}>{financeDetailItem.studio.toLocaleString()} ₴</div></div>
            </div>
            <table style={{width: "100%", borderCollapse: "collapse", fontSize: 14, textAlign: "left"}}>
              <thead><tr style={{color: "#8E8E93", borderBottom: "1px solid #3A3A3C"}}><th style={{padding: "12px 0", fontWeight: 600}}>Учениця</th><th style={{padding: "12px 0", fontWeight: 600}}>Тип</th><th style={{padding: "12px 0", fontWeight: 600, textAlign: "right"}}>Оплачено</th><th style={{padding: "12px 0", fontWeight: 600, textAlign: "right", color: "#0A84FF"}}>Частка тренера</th></tr></thead>
              <tbody>{financeDetailItem.subs.map(sub => (<tr key={sub.id} style={{borderBottom: "1px solid #2C2C2E"}}><td style={{padding: "14px 0", color: "#fff", fontWeight: 500}}>{studentMap[sub.studentId]?.name}</td><td style={{padding: "14px 0", color: "#8E8E93"}}>{PLAN_TYPES.find(p=>p.id===sub.planType)?.name}</td><td style={{padding: "14px 0", textAlign: "right"}}>{sub.amount} ₴</td><td style={{padding: "14px 0", textAlign: "right", color: "#0A84FF", fontWeight: 700}}>+ {Math.round((sub.amount || 0) * (financeDetailItem.group.trainerPct / 100))} ₴</td></tr>))}</tbody>
            </table>
          </div>
        )}
      </Modal>
      <Modal open={modal==="addStudent"} onClose={()=>setModal(null)} title="Нова учениця"><StudentForm onDone={(d)=>db.insertStudent(d).then(s=>setStudents(p=>[...p,s])).then(()=>setModal(null))}/></Modal>
      <Modal open={modal==="editStudent"} onClose={()=>{setModal(null);setEditItem(null)}} title="Редагувати"><StudentForm initial={editItem} onDone={(d)=>db.updateStudent(editItem.id,d).then(s=>setStudents(p=>p.map(x=>x.id===s.id?s:x))).then(()=>setModal(null))}/></Modal>
      <Modal open={modal==="addWaitlist"} onClose={()=>setModal(null)} title="Додати в резерв"><WaitlistForm onDone={(d)=>db.insertWaitlist(d).then(w=>setWaitlist(p=>[...p,w])).then(()=>setModal(null))}/></Modal>
    </div>
  );
}
