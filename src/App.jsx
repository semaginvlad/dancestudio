import React, { useEffect, useMemo, useState } from "react";
import * as db from "./db";
import { supabase } from "./supabase";
import Analytics from "./pages/Analytics";
import {
  DEFAULT_GROUPS,
  DIRECTIONS,
  PLAN_TYPES,
  STATUS_COLORS,
  STATUS_LABELS,
  WEEKDAYS,
  btnP,
  btnS,
  cardSt,
  inputSt,
  theme,
} from "./shared/constants";
import {
  addMonth,
  daysLeft,
  fmt,
  getDisplayName,
  getNotifMsg,
  getSubStatus,
  today,
  toLocalISO,
  uid,
  useStickyState,
} from "./shared/utils";
import { Badge, Field, GroupSelect, Modal, Pill, StudentSelectWithSearch } from "./components/UI";
import { StudentForm, SubForm, WaitlistForm } from "./components/Forms";
import AttendanceTab from "./components/AttendanceTab";
import ProAnalyticsTab from "./components/ProAnalyticsTab";
import DashboardTab from "./components/DashboardTab";
import MessagesTab from "./components/MessagesTab";

export default function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPass, setAuthPass] = useState("");

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
  
  const [prefillSub, setPrefillSub] = useState(null);

  const [filterDir, setFilterDir] = useStickyState("all", "ds_filterDir");
  const [filterGroup, setFilterGroup] = useStickyState("all", "ds_filterGroup");
  const [filterStatus, setFilterStatus] = useStickyState("all", "ds_filterStatus");
  const [stFilterDir, setStFilterDir] = useStickyState("all", "ds_stFilterDir");
  const [stFilterGroup, setStFilterGroup] = useStickyState("all", "ds_stFilterGroup");
  const [finFilterDir, setFinFilterDir] = useStickyState("all", "ds_finFilterDir");
  const [finFilterGroup, setFinFilterGroup] = useStickyState("all", "ds_finFilterGroup");
  const [finSortBy, setFinSortBy] = useStickyState("total", "ds_finSortBy"); 
  const [finSortOrder, setFinSortOrder] = useStickyState("desc", "ds_finSortOrder");
  const [customOrders, setCustomOrders] = useState({});
  const [warnedStudents, setWarnedStudents] = useStickyState({}, "ds_warned_students");
  const [restoreGroupByStudent, setRestoreGroupByStudent] = useState({});
  const [selectedMessageStudentId, setSelectedMessageStudentId] = useState("");

  const [expandedDirs, setExpandedDirs] = useState({});
  const [expandedSubDirs, setExpandedSubDirs] = useState({});

  const adminEmails = ["semagin.vlad@gmail.com"]; 
  const isAdmin = user && adminEmails.includes(user.email);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
      if (session?.user) loadAllData();
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (!session?.user) setLoading(false);
    });

    return () => subscription?.unsubscribe();
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const safeFetch = async (fn) => { try { return await fn(); } catch (e) { return null; } };
      
     const fetchCustomOrders = async () => {
  try {
    const { data, error } = await supabase
      .from("custom_orders")
      .select("group_id, student_ids");

    if (error) {
      console.error("Fetch orders error:", error);
      return {};
    }

    return (data || []).reduce((acc, row) => {
      acc[row.group_id] = Array.isArray(row.student_ids) ? row.student_ids : [];
      return acc;
    }, {});
  } catch (e) {
    console.error("Fetch orders exception:", e);
    return {};
  }
};

      const [st, gr, su, at, ca, sg, wl, ord] = await Promise.all([
        safeFetch(db.fetchStudents), safeFetch(db.fetchGroups), safeFetch(db.fetchSubs),
        safeFetch(db.fetchAttendance), safeFetch(db.fetchCancelled), safeFetch(db.fetchStudentGroups),
        safeFetch(db.fetchWaitlist), fetchCustomOrders()
      ]);

      if (st) setStudents(st);
      if (gr?.length) setGroups(gr);
      if (su) setSubs(su);
      if (at) setAttn(at);
      if (ca) setCancelled(ca);
      if (sg) setStudentGrps(sg);
      if (wl) setWaitlist(wl);
      
    setCustomOrders(ord || {});
    } catch (e) {
      console.error("Global load error", e);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPass });
      if (error) throw error;
      setUser(data.user);
      window.location.reload(); 
    } catch (e) { alert("Помилка входу: перевірте email та пароль"); }
  };

  const visibleGroups = useMemo(() => {
    if (!user) return [];
    if (isAdmin) return groups;
    return groups.filter(g => g.trainer_id === user.id);
  }, [groups, user, isAdmin]);

  const studentMap = useMemo(()=>Object.fromEntries(students.map(s=>[s.id,s])),[students]);
  const groupMap = useMemo(()=>Object.fromEntries(groups.map(g=>[g.id,g])),[groups]);
  const dirMap = useMemo(()=>Object.fromEntries(DIRECTIONS.map(d=>[d.id,d])),[]);

 const subsExt = useMemo(()=>{
    const usedMap = {};
    attn.forEach(a => {
      if (a.subId) usedMap[a.subId] = (usedMap[a.subId] || 0) + (a.quantity || 1);
    });
    return subs.map(s => {
      const extSub = { ...s, usedTrainings: usedMap[s.id] || 0 };
      extSub.status = getSubStatus(extSub);
      return extSub;
    });
  },[subs, attn]);



  const activeSubs = useMemo(()=>subsExt.filter(s=>s.status!=="expired"),[subsExt]);

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
    return Object.values(grouped).sort((a,b) => (a.group?.name||"").localeCompare(b.group?.name||""));
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

    const currMonthDetails = {
      trial: [...currMonthSubs.filter(s => s.planType === "trial"), ...currMonthAttn.filter(a => a.entryType === "trial" && !a.subId)],
      single: [...currMonthSubs.filter(s => s.planType === "single"), ...currMonthAttn.filter(a => a.entryType === "single" && !a.subId)],
      pack4: currMonthSubs.filter(s => s.planType === "4pack"),
      pack8: currMonthSubs.filter(s => s.planType === "8pack"),
      pack12: currMonthSubs.filter(s => s.planType === "12pack"),
      unpaidAttn: currMonthAttn.filter(a => a.entryType === "unpaid")
    };

    return {
      totalStudents:students.length, activeStudents:new Set(activeSubs.map(s=>s.studentId)).size, 
      totalRev, unpaid, byDir, splits, currMonthRev, prevMonthRev,
      avgLTV: usersWithPurchases > 0 ? Math.round(totalLTV / usersWithPurchases) : 0, 
      conversionRate: trialUsers > 0 ? Math.round((convertedUsers / trialUsers) * 100) : 0,
      currMonthStats: { trial: currMonthDetails.trial.length, single: currMonthDetails.single.length, pack4: currMonthDetails.pack4.length, pack8: currMonthDetails.pack8.length, pack12: currMonthDetails.pack12.length, cancelledCount: currMonthCancelled, unpaidAttn: currMonthDetails.unpaidAttn.length },
      currMonthDetails, chartData, maxChartVal
    };
  },[students,subs,activeSubs,groups, studentMap, cancelled, attn]);

  // ФІКС ПРО АНАЛІТИКИ: Захищаємо від крашу, якщо напрямок або група видалена
  const proAnalytics = useMemo(() => {
    const last30DaysStr = toLocalISO(new Date(new Date().getTime() - 30 * 86400000));
    const subToSt = {}; subs.forEach(s => subToSt[s.id] = s.studentId);
    
    const getTopSpenders = (months) => {
      const dateLimit = new Date(); dateLimit.setMonth(dateLimit.getMonth() - months);
      const totals = {};
      subs.forEach(s => { 
        if (s.paid && s.startDate && s.startDate >= toLocalISO(dateLimit)) {
          totals[s.studentId] = (totals[s.studentId] || 0) + (s.amount || 0); 
        }
      });
      return Object.entries(totals).map(([id, total]) => ({ student: studentMap[id], total })).filter(x => x.student).sort((a,b) => b.total - a.total).slice(0, 5);
    };

    const groupAttnCounts = {};
    attn.forEach(a => { 
      if (a.date && a.date >= last30DaysStr) { 
        const stId = a.subId ? subToSt[a.subId] : null; 
        if (stId) { 
          if (!groupAttnCounts[a.groupId]) groupAttnCounts[a.groupId] = {}; 
          groupAttnCounts[a.groupId][stId] = (groupAttnCounts[a.groupId][stId] || 0) + 1; 
        } 
      } 
    });
    
    const bestAttenders = groups.map(g => { 
        const counts = groupAttnCounts[g.id] || {}; 
        const bestId = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b, null); 
        const dir = dirMap[g.directionId] || {}; // Запобігає падінню
        return { group: {...g, direction: dir}, student: studentMap[bestId], count: counts[bestId] }; 
    }).filter(x => x.student && x.group);

    const latestAttnByStudent = {};
    attn.forEach(a => {
        let stId = null;
        if (a.subId) stId = subToSt[a.subId];
        else if (a.guestName) {
            const s = Object.values(studentMap).find(x => x.name === a.guestName);
            if (s) stId = s.id;
        }
        if (stId && a.date) {
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
      if(!st || !gr) return;
      const dir = dirMap[gr.directionId] || {}; // Запобігає падінню
      
      const stAttnDates = attn.filter(a => a.groupId === gr.id && a.subId === sub.id && a.date).map(a => a.date).sort();
      const stAttn30Days = stAttnDates.filter(d => d >= last30DaysStr).length;

      if (sub.planType === '4pack' && stAttn30Days >= 6) upsellCandidates.push({ student: st, group: {...gr, direction: dir}, suggest: '8 занять', reason: `У цій групі: ${stAttn30Days} трен. за 30 днів` }); 
      else if (sub.planType === '8pack' && stAttn30Days >= 10) upsellCandidates.push({ student: st, group: {...gr, direction: dir}, suggest: '12 занять', reason: `У цій групі: ${stAttn30Days} трен. за 30 днів` });
      
      const trainingsLeft = (sub.totalTrainings || 1) - (sub.usedTrainings || 0);
      const dl = daysLeft(sub.endDate);
      
      if (trainingsLeft <= 1 || dl <= 3) {
          const lastDate = latestAttnByStudent[st.id] || sub.startDate;
          if (lastDate && lastDate !== "2000-01-01") {
            const daysSinceLast = Math.floor((new Date() - new Date(lastDate + "T12:00:00")) / 86400000);
            if (daysSinceLast >= 10 && !churnRisk.some(c => c.student.id === st.id)) {
                churnRisk.push({ student: st, group: {...gr, direction: dir}, daysSinceLast });
            }
          }
      }
    });

    const dayCounts = {0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0};
    attn.filter(a => a.date && a.date >= last30DaysStr).forEach(a => {
        const d = new Date(a.date + "T12:00:00").getDay();
        if (!isNaN(d)) dayCounts[d]++;
    });
    const popularDays = WEEKDAYS.map((name, i) => ({ day: name, count: dayCounts[i] })).sort((a,b) => b.count - a.count);

    return { topSpenders: { 1: getTopSpenders(1), 3: getTopSpenders(3), 6: getTopSpenders(6), 12: getTopSpenders(12) }, bestAttenders, upsellCandidates, churnRisk, popularDays };
  }, [subs, attn, groups, studentMap, activeSubs, dirMap]);

  const filteredStudents=useMemo(()=>{
    let r=students; if(searchQ) r=r.filter(s=>getDisplayName(s).toLowerCase().includes(searchQ.toLowerCase()));
    if(stFilterDir !== "all") r = r.filter(st => studentGrps.some(sg => sg.studentId === st.id && groupMap[sg.groupId]?.directionId === stFilterDir));
    if(stFilterGroup !== "all") r = r.filter(st => studentGrps.some(sg => sg.studentId === st.id && sg.groupId === stFilterGroup));
    return r.sort((a,b)=>getDisplayName(a).localeCompare(getDisplayName(b),"uk"));
  },[students, searchQ, stFilterDir, stFilterGroup, studentGrps, groupMap]);

  const studentsByDirection = useMemo(() => {
    const result = {}; 
    DIRECTIONS.forEach(d => { result[d.id] = { direction: d, students: [] }; });
    const inactive = [];

    filteredStudents.forEach(st => { 
      const sgs = studentGrps.filter(sg => sg.studentId === st.id); 
      const hasActiveSub = activeSubs.some(s => s.studentId === st.id);
      
      if (sgs.length === 0 && !hasActiveSub) {
        inactive.push(st);
        return;
      }
      
      const dirs = new Set(); 
      sgs.forEach(sg => {
        const g = groupMap[sg.groupId]; 
        if (g) dirs.add(g.directionId);
      }); 
      if (dirs.size === 0 && hasActiveSub) {
        const firstSubDir = groupMap[activeSubs.find(s => s.studentId === st.id).groupId]?.directionId;
        if(firstSubDir) dirs.add(firstSubDir);
      }
      
      dirs.forEach(did => {
        if (result[did]) result[did].students.push(st);
      }); 
    });
    
    return { 
      grouped: Object.values(result).filter(d => d.students.length > 0),
      inactive 
    };
  }, [filteredStudents, studentGrps, groupMap, activeSubs]);

  const filteredSubs=useMemo(()=>{
    let r=subsExt;
    if(filterDir!=="all"){const gids=groups.filter(g=>g.directionId===filterDir).map(g=>g.id);r=r.filter(s=>gids.includes(s.groupId))}
    if(filterGroup!=="all")r=r.filter(s=>s.groupId===filterGroup);
    if(filterStatus!=="all")r=r.filter(s=>s.status===filterStatus);
    if(searchQ){const q=searchQ.toLowerCase();r=r.filter(s=>getDisplayName(studentMap[s.studentId]).toLowerCase().includes(q))}
    return r.sort((a,b)=>({warning:0,active:1,expired:2}[a.status]??3)-({warning:0,active:1,expired:2}[b.status]??3));
  },[subsExt,filterDir,filterGroup,filterStatus,searchQ,groups,studentMap]);

  const subsGroupedByDir = useMemo(()=>{
    const result={}; DIRECTIONS.forEach(d=>{result[d.id]={direction:d,subs:[]}});
    filteredSubs.forEach(sub=>{ const gr=groupMap[sub.groupId]; if(gr && result[gr.directionId]){result[gr.directionId].subs.push(sub);} });
    return {grouped:Object.values(result).filter(d=>d.subs.length>0)};
  },[filteredSubs, groupMap]);

  if(loading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:theme.bg,color:theme.textMuted,fontFamily:"Poppins, sans-serif",fontSize:18}}>Завантаження...</div>;

  if (!user) {
    return (
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:theme.bg, fontFamily:"'Poppins',sans-serif"}}>
        <form onSubmit={handleLogin} style={{background:theme.card, padding:40, borderRadius:32, width:350, boxShadow:"0 20px 50px rgba(0,0,0,0.1)"}}>
          <h2 style={{marginTop:0, marginBottom:24, textAlign:"center", color:theme.secondary}}>Dance Studio</h2>
          <input style={{...inputSt, marginBottom:16}} type="email" placeholder="Email" value={authEmail} onChange={e=>setAuthEmail(e.target.value)} required />
          <input style={{...inputSt, marginBottom:24}} type="password" placeholder="Пароль" value={authPass} onChange={e=>setAuthPass(e.target.value)} required />
          <button style={{...btnP, width:"100%"}} type="submit">Увійти</button>
        </form>
      </div>
    );
  }

  const deleteStudentAction = async(id) => {
    if(!confirm("Видалити ученицю назавжди? Її дані зникнуть звідусіль.")) return;
    try {
      const st = students.find(s=>s.id===id);
      const names = [st?.name, getDisplayName(st)].filter(Boolean);
      const subsToDel = subs.filter(s=>s.studentId===id).map(s=>s.id);
      
      setAttn(p=>p.filter(a => {
        if(a.subId && subsToDel.includes(a.subId)) return false;
        if(a.guestName && names.includes(a.guestName)) return false;
        return true;
      }));
      setSubs(p=>p.filter(s=>s.studentId!==id));
      setStudents(p=>p.filter(s=>s.id!==id));
      setStudentGrps(p=>p.filter(sg=>sg.studentId!==id));
      if(db.deleteStudent) await db.deleteStudent(id);
    } catch(e) { console.warn("Помилка видалення учениці:", e); }
  };

  const deleteSubAction = async(id) => {
    if(!confirm("Видалити абонемент?")) return;
    try {
      setAttn(p=>p.filter(a=>a.subId!==id));
      setSubs(p=>p.filter(s=>s.id!==id));
      if(db.deleteSub) await db.deleteSub(id);
    } catch(e) { console.warn("Помилка видалення абонемента:", e); }
  };

  const restoreStudentToGroup = async (studentId) => {
    const groupId = restoreGroupByStudent[studentId];
    if (!groupId) {
      alert("Обери групу для відновлення");
      return;
    }
    const st = studentMap[studentId];
    const gr = groupMap[groupId];
    const ok = window.confirm(`Відновити ${getDisplayName(st)} у групу "${gr?.name || groupId}"?`);
    if (!ok) return;

    try {
      const link = await db.addStudentGroup(studentId, groupId);
      setStudentGrps((prev) => {
        if (prev.some((sg) => sg.studentId === studentId && sg.groupId === groupId)) return prev;
        return [...prev, link || { id: uid(), studentId, groupId }];
      });
      setRestoreGroupByStudent((prev) => {
        const next = { ...prev };
        delete next[studentId];
        return next;
      });
    } catch (e) {
      alert(e?.message || "Не вдалося відновити ученицю в групу");
    }
  };



  return (
    <div style={{minHeight:"100vh", background:theme.bg, color:theme.textMain, fontFamily:"'Poppins',sans-serif", paddingBottom: 100}}>
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>
      <style>{`
        @media (max-width: 768px) {
          th:first-child, td:first-child { 
            min-width: 140px !important; 
            padding: 8px !important; 
            font-size: 11px !important; 
          }
          th, td { padding: 4px !important; }
          header { padding: 16px !important; flex-direction: column; gap: 12px; align-items: flex-start !important; }
          .bottom-form { flex-direction: column !important; align-items: stretch !important; }
          .bottom-form input { width: 100% !important; }
          .split-container { flex-direction: column !important; }
          .split-left, .split-right {
             flex: 1 1 auto !important;
             max-width: 100% !important;
             width: 100% !important;
          }
        }
      `}</style>
      <header style={{padding:"30px 24px 20px", maxWidth:1200, margin:"0 auto", display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:16}}>
        <div><h1 style={{margin:0, fontSize:28, fontWeight:800, letterSpacing: "-1px", color: theme.secondary}}>Dance Studio.</h1></div>
        <div style={{display:"flex", gap:12, alignItems: 'center'}}>
          {isAdmin && <button style={btnS} onClick={()=>setModal("addStudent")}>+ Учениця</button>}
          <button style={btnP} onClick={()=>setModal("addSub")}>+ Абонемент</button>
          <button style={{...btnS, padding:"10px 16px", fontSize: 13}} onClick={() => supabase.auth.signOut().then(()=>window.location.reload())}>Вихід ({user.email.split('@')[0]})</button>
        </div>
      </header>

      <nav style={{maxWidth:1200, margin:"0 auto", padding:"0 24px 30px", overflowX:"auto"}}>
        <div style={{display:"inline-flex", background: theme.card, borderRadius: 100, padding: 6, boxShadow: "0 4px 20px rgba(168, 177, 206, 0.15)"}}>
          {isAdmin ? (
            [
              {id:"dashboard", label:"Дашборд"},
              {id:"students", label:"Учениці"},
              {id:"subs", label:"Абонементи"},
              {id:"attendance", label:"Відвідування"},
              {id:"messages", label:"Повідомлення / Чати"},
              {id:"alerts", label:`Сповіщення (${notifications.filter(n=>!n.notified).length})`},
              {id:"finance", label:"Фінанси"},
              {id:"pro_analytics", label:"📈 Про-Аналітика"},
              {id:"analytics", label:"📊 Instagram"}
            ].map(t=><button key={t.id} onClick={()=>{setTab(t.id);setSearchQ("")}} style={{padding: "12px 24px", background: tab===t.id ? theme.primary : "transparent", border: "none", borderRadius: 100, color: tab===t.id ? "#fff" : theme.textMuted, fontSize: 14, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", transition: "0.2s"}}>{t.label}</button>)
          ) : (
            <button style={{padding: "12px 24px", background: theme.primary, border: "none", borderRadius: 100, color: "#fff", fontSize: 14, fontWeight: 600}}>Мої групи (Відвідування)</button>
          )}
        </div>
      </nav>

      <main style={{maxWidth:1200, margin:"0 auto", padding:"0 24px"}}>
        {isAdmin && tab==="dashboard" && (
          <DashboardTab
            analytics={analytics}
            activeSubs={activeSubs}
            subs={subs}
            studentMap={studentMap}
            groupMap={groupMap}
          />
        )}

        {(!isAdmin || tab==="attendance") && <AttendanceTab groups={visibleGroups} rawSubs={subs} subs={subsExt} setSubs={setSubs} attn={attn} setAttn={setAttn} studentMap={studentMap} students={students} setStudents={setStudents} studentGrps={studentGrps} setStudentGrps={setStudentGrps} cancelled={cancelled} setCancelled={setCancelled} customOrders={customOrders} setCustomOrders={setCustomOrders} warnedStudents={warnedStudents} setWarnedStudents={setWarnedStudents} onActionAddSub={(stId, gId) => { setPrefillSub({studentId: stId, groupId: gId}); setModal("addSub"); }} onActionEditSub={(sub) => { setEditItem(sub); setModal("editSub"); }} onActionEditStudent={(student) => { setEditItem(student); setModal("editStudent"); }} onActionMessageStudent={(student) => { if (!isAdmin) { alert("Доступ до повідомлень лише для адміністратора"); return; } setSelectedMessageStudentId(student.id); setTab("messages"); }} />}
        {isAdmin && tab==="messages" && (
          <MessagesTab
            students={students}
            selectedStudentId={selectedMessageStudentId}
            onSelectStudent={setSelectedMessageStudentId}
          />
        )}
        
        {isAdmin && tab==="pro_analytics" && <ProAnalyticsTab proAnalytics={proAnalytics} />}
        
        {isAdmin && tab==="students" && <div>
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
                            <div style={{color:theme.textMain,fontWeight:700,fontSize:16}}>{getDisplayName(st)}</div>
                            <div style={{color:theme.textMuted,fontSize:14, marginTop: 6, fontWeight: 500}}>{[st.phone,st.telegram].filter(Boolean).join(" · ")||"—"}</div>
                          </div>
                        </div>
                        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{active.map(s=>{const g=groupMap[s.groupId];const d=g?dirMap[g.directionId]:null;return <Badge key={s.id} color={d?.color||"#888"}>{g?.name} ({s.usedTrainings}/{s.totalTrainings})</Badge>})}</div>
                        <div style={{display:"flex",gap:8}}>
                          <button style={{...btnS,padding:"10px 16px",fontSize:14, background:"#fff"}} onClick={()=>{setEditItem(st);setModal("editStudent")}}>✏️</button>
                          <button style={{background:"none",border:"none",color:theme.danger,fontSize:20,cursor:"pointer",padding:"0 10px"}} onClick={()=>deleteStudentAction(st.id)}>🗑</button>
                        </div>
                      </div>
                    })}
                  </div>)}
                </div>
              );
            })}
            
            {studentsByDirection.inactive.length > 0 && (
              <div style={{background: theme.archive, borderRadius: 28, overflow: 'hidden', border: `1px solid ${theme.border}`}}>
                  <button onClick={() => setExpandedDirs(p => ({...p, 'archive': !p['archive']}))} style={{width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'24px', background:'transparent', border:'none', cursor:'pointer', textAlign:'left'}}>
                    <div style={{fontSize:18,fontWeight:700,color: theme.textMuted}}>🗄️ Архів / Неактивні <span style={{color:theme.textLight,fontSize:15,fontWeight:600, marginLeft: 8}}>({studentsByDirection.inactive.length})</span></div>
                    <div style={{color:theme.textLight, fontSize: 16}}>{expandedDirs['archive'] ? "▲" : "▼"}</div>
                  </button>
                  {expandedDirs['archive'] && (<div style={{padding:'0 24px 24px 24px', display:'flex', flexDirection:'column', gap:12}}>
                    {studentsByDirection.inactive.map((st, index) => (
                      <div key={st.id} style={{background: "#fff", borderRadius: 20, padding: "20px", display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:16, opacity: 0.8}}>
                        <div style={{display:"flex", gap: 16, alignItems: "center", minWidth: 200}}>
                          <div style={{color: theme.textLight, fontSize: 16, fontWeight: 700}}>{index + 1}.</div>
                          <div>
                            <div style={{color:theme.textMain,fontWeight:700,fontSize:16}}>{getDisplayName(st)}</div>
                            <div style={{color:theme.textMuted,fontSize:14, marginTop: 6, fontWeight: 500}}>{[st.phone,st.telegram].filter(Boolean).join(" · ")||"—"}</div>
                          </div>
                        </div>
                        <Badge color={theme.textLight}>Немає активних груп</Badge>
                        <div style={{display:"flex",gap:8}}>
                          <select
                            value={restoreGroupByStudent[st.id] || ""}
                            onChange={(e) => setRestoreGroupByStudent((prev) => ({ ...prev, [st.id]: e.target.value }))}
                            style={{ ...inputSt, width: 180, height: 40, padding: "0 12px", fontSize: 13, borderRadius: 10 }}
                          >
                            <option value="">Група для відновлення</option>
                            {groups.map((g) => (
                              <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                          </select>
                          <button style={{...btnS,padding:"10px 14px",fontSize:13, background:theme.bg}} onClick={()=>restoreStudentToGroup(st.id)}>↩ Відновити</button>
                          <button style={{...btnS,padding:"10px 12px",fontSize:14, background:"#fff"}} onClick={()=>{setEditItem(st);setModal("editStudent")}}>✏️</button>
                          <button style={{background:"none",border:"none",color:theme.danger,fontSize:20,cursor:"pointer",padding:"0 10px"}} onClick={()=>deleteStudentAction(st.id)}>🗑</button>
                        </div>
                      </div>
                    ))}
                  </div>)}
              </div>
            )}
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
                        <div><div style={{color:theme.textMain,fontWeight:700,fontSize:16}}>{getDisplayName(st)}</div><div style={{color:theme.textMuted,fontSize:14, marginTop: 6, fontWeight: 500}}>Хоче в: <strong style={{color:theme.secondary}}>{gr.name}</strong></div></div>
                      </div>
                      <button style={{...btnS,padding:"10px 16px",fontSize:14,color:theme.danger, background: theme.input}} onClick={()=>{setWaitlist(p=>p.filter(x=>x.id!==w.id)); if(db.deleteWaitlist) db.deleteWaitlist(w.id);}}>Видалити</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>}

        {/* === АБОНЕМЕНТИ === */}
        {isAdmin && tab==="subs" && <div>
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
                              <td style={{padding: "16px 14px", color: theme.textMain, fontWeight: 600, whiteSpace:"nowrap"}}>{getDisplayName(st)}</td>
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
        {isAdmin && tab==="alerts" && <div>
          {alertsByGroup.length === 0 ? <div style={{textAlign:"center",padding:60,color:theme.textLight, fontSize: 16, fontWeight: 600}}>✨ Всі абонементи активні, боргів та сповіщень немає!</div>:
          <div>
            {alertsByGroup.map(g => (
              <div key={g.group.id} style={{marginBottom: 32}}>
                <div style={{display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${theme.border}`, paddingBottom: 12, marginBottom: 16}}>
                  <h3 style={{margin: 0, color: theme.secondary, fontSize: 18}}>{g.group.name}</h3>
                  <Badge color={g.dir?.color || theme.primary}>{g.dir?.name}</Badge>
                </div>
                <div style={{display: "flex", flexDirection: "column", gap: 10}}>
                  {g.items.map(n => {
                    const msg=getNotifMsg(null,n.student,n.group,n.direction);
                    const tgUser=n.student.telegram?.replace("@","");
                    const tgLink=tgUser?`https://t.me/${tgUser}?text=${encodeURIComponent(msg)}`:null;
                    
                    const isExpired = n.type === "expired";
                    const rowBg = isExpired ? `${theme.danger}10` : `${theme.warning}10`;
                    const borderColor = isExpired ? theme.danger : theme.warning;
                    const icon = isExpired ? "🔴" : "⏳";

                    return (
                      <div key={n.subId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: rowBg, borderLeft: `4px solid ${borderColor}`, borderRadius: 12, padding: "12px 16px", flexWrap: "wrap", gap: 12, opacity: n.notified ? 0.6 : 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontSize: 18 }}>{icon}</span>
                          <div>
                            <div style={{ fontWeight: 700, color: theme.textMain, fontSize: 15 }}>
                              {getDisplayName(n.student)}
                              {n.notified && <span style={{ marginLeft: 8, fontSize: 11, background: "#fff", padding: "2px 6px", borderRadius: 4, color: theme.textLight }}>✅ Відправлено</span>}
                            </div>
                            <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{n.student.phone || 'Немає номеру'}</div>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ fontWeight: 800, color: borderColor, fontSize: 14 }}>{n.message}</div>
                          {tgLink && <a href={tgLink} target="_blank" rel="noopener noreferrer" style={{ padding: "8px 12px", borderRadius: 8, background: "#fff", color: theme.primary, fontSize: 13, fontWeight: 700, textDecoration: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>💬 Написати</a>}
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
        {isAdmin && tab==="finance" && (() => {
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
        {isAdmin && tab === "analytics" && <Analytics />}

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
              <tbody>{financeDetailItem.subs.map(sub => (<tr key={sub.id} style={{borderBottom: `1px solid ${theme.bg}`}}><td style={{padding: "16px 0", color: theme.textMain, fontWeight: 600}}>{getDisplayName(studentMap[sub.studentId])}</td><td style={{padding: "16px 0", color: theme.textMuted, fontWeight: 500}}>{PLAN_TYPES.find(p=>p.id===sub.planType)?.name}</td><td style={{padding: "16px 0", textAlign: "right", fontWeight: 600, color: theme.textMain}}>{sub.amount} ₴</td><td style={{padding: "16px 0", textAlign: "right", color: theme.primary, fontWeight: 800}}>+ {Math.round((sub.amount || 0) * (financeDetailItem.group.trainerPct / 100))} ₴</td></tr>))}</tbody>
            </table>
          </div>
        )}
      </Modal>
      <Modal open={modal==="addStudent"} onClose={()=>setModal(null)} title="Нова учениця"><StudentForm onCancel={()=>setModal(null)} onDone={async(d)=>{try{const s=await db.insertStudent(d);setStudents(p=>[...p,s||{id:uid(),...d}]);setModal(null);}catch(e){console.warn(e);setStudents(p=>[...p,{id:uid(),...d}]);setModal(null);}}} studentGrps={studentGrps} groups={groups}/></Modal>
      
      <Modal open={modal==="editStudent"} onClose={()=>{setModal(null);setEditItem(null)}} title="Редагувати профіль"><StudentForm onCancel={()=>{setModal(null);setEditItem(null)}} initial={editItem} onDone={async(d)=>{try{if(db.updateStudent)await db.updateStudent(editItem.id,d); const oldNames = [editItem.name, getDisplayName(editItem)].filter(Boolean); const newName = getDisplayName({...editItem, ...d}); setStudents(p=>p.map(x=>x.id===editItem.id?{...x,...d}:x)); setAttn(p=>p.map(a=>{ if(a.guestName && oldNames.includes(a.guestName)){ return {...a, guestName: newName}; } return a; })); setModal(null);setEditItem(null);}catch(e){console.warn(e);}} } studentGrps={studentGrps} groups={groups}/></Modal>
      
      <Modal open={modal==="addSub"} onClose={()=>{setModal(null); setPrefillSub(null);}} title="Оформити абонемент"><SubForm onCancel={()=>{setModal(null); setPrefillSub(null);}} initial={prefillSub} onDone={async(d)=>{try{const s=await db.insertSub(d);setSubs(p=>[s||{id:uid(),...d},...p]);setModal(null); setPrefillSub(null);}catch(e){console.warn(e);setSubs(p=>[{id:uid(),...d},...p]);setModal(null); setPrefillSub(null);}}} students={students} groups={groups} studentGrps={studentGrps} subs={subs}/></Modal>
      <Modal open={modal==="editSub"} onClose={()=>{setModal(null);setEditItem(null)}} title="Редагувати абонемент"><SubForm onCancel={()=>{setModal(null);setEditItem(null)}} initial={editItem} onDone={async(d)=>{try{if(db.updateSub)await db.updateSub(editItem.id,d);setSubs(p=>p.map(x=>x.id===editItem.id?{...x,...d}:x));setModal(null);setEditItem(null);}catch(e){console.warn(e);setSubs(p=>p.map(x=>x.id===editItem.id?{...x,...d}:x));setModal(null);setEditItem(null);}}} students={students} groups={groups} studentGrps={studentGrps} subs={subs}/></Modal>
      <Modal open={modal==="addWaitlist"} onClose={()=>setModal(null)} title="Додати в резерв"><WaitlistForm onCancel={()=>setModal(null)} onDone={async(d)=>{try{if(db.insertWaitlist){const w=await db.insertWaitlist(d);setWaitlist(p=>[...p,w]);}else{setWaitlist(p=>[...p,{...d, id:uid()}]);}setModal(null);}catch(e){console.warn(e);setWaitlist(p=>[...p,{...d, id:uid()}]);setModal(null);}}} students={students} groups={groups} studentGrps={studentGrps}/></Modal>
    </div>
  );
}
