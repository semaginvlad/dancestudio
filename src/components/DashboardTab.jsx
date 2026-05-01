import React, { useMemo, useState } from "react";
import { cardSt, theme } from "../shared/constants";

const todayKey = () => new Date().toISOString().slice(0, 10);
const monthStart = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`;
const monthEnd = (d) => new Date(d.getFullYear(), d.getMonth()+1, 0).toISOString().slice(0,10);
const inRange = (v, start, end) => !!v && v >= start && v <= end;

const Tile = ({label, value, hint, tone}) => (
  <div style={{...cardSt, border:`1px solid ${theme.border}`, padding:16}}>
    <div style={{fontSize:12, color:theme.textMuted, textTransform:"uppercase", fontWeight:700}}>{label}</div>
    <div style={{fontSize:30, fontWeight:800, color:tone || theme.textMain, marginTop:6}}>{value}</div>
    <div style={{fontSize:12, color:theme.textLight, marginTop:4}}>{hint}</div>
  </div>
);

export default function DashboardTab({ students=[], groups=[], directionsList=[], subs=[], attn=[], waitlist=[], cancelled=[] }) {
  const now = new Date();
  const [periodMode, setPeriodMode] = useState("this_month");
  const [from, setFrom] = useState(monthStart(now));
  const [to, setTo] = useState(monthEnd(now));

  const period = useMemo(() => {
    if (periodMode === "custom") return { start: from, end: to };
    if (periodMode === "last_month") {
      const d = new Date(now.getFullYear(), now.getMonth()-1, 1);
      return { start: monthStart(d), end: monthEnd(d) };
    }
    return { start: monthStart(now), end: monthEnd(now) };
  }, [periodMode, from, to]);

  const data = useMemo(() => {
    const periodSubs = subs.filter((s) => inRange(String(s.activationDate || s.startDate || "").slice(0,10), period.start, period.end));
    const periodAttn = attn.filter((a) => inRange(String(a.date||"").slice(0,10), period.start, period.end));
    const revenue = periodSubs.reduce((sum, s) => sum + Number(s.amount || 0), 0);
    const payments = periodSubs.length;
    const activeStudents = new Set(periodAttn.map((a) => String(a.studentId || "")).filter(Boolean)).size;
    const attendance = periodAttn.reduce((sum, a) => sum + Number(a.quantity || 1), 0);
    const held = new Set(periodAttn.map((a) => `${a.groupId}:${String(a.date||"").slice(0,10)}`)).size;
    const avgPerSession = held ? Number((attendance / held).toFixed(2)) : 0;
    const activeSubs = subs.filter((s) => s.status !== "expired").length;
    const expiredSubs = subs.filter((s) => s.status === "expired").length;

    const noActivePay = students.filter((st) => !subs.some((s) => String(s.studentId) === String(st.id) && s.status !== "expired")).length;
    const endingSoon = subs.filter((s) => s.status !== "expired" && s.endDate && s.endDate >= todayKey() && s.endDate <= new Date(Date.now()+7*86400000).toISOString().slice(0,10)).length;
    const lowAttendanceGroups = groups.filter((g) => {
      const gRows = periodAttn.filter((a) => String(a.groupId) === String(g.id));
      const gAttn = gRows.reduce((sum, a) => sum + Number(a.quantity || 1), 0);
      const gHeld = new Set(gRows.map((a) => String(a.date||"").slice(0,10))).size;
      const avg = gHeld ? gAttn / gHeld : 0;
      return gHeld > 0 && avg < 4;
    }).length;
    const reserveVacancy = groups.filter((g) => waitlist.some((w) => String(w.groupId) === String(g.id) && ["waiting","contacted",""] .includes(String(w.status || "")))).length;

    const byDir = directionsList.map((d) => {
      const gids = groups.filter((g) => String(g.directionId) === String(d.id)).map((g) => String(g.id));
      const sum = periodSubs.filter((s) => gids.includes(String(s.groupId))).reduce((a,b)=>a+Number(b.amount||0),0);
      return { id:d.id, name:d.name, revenue:sum };
    }).sort((a,b)=>b.revenue-a.revenue).slice(0,5);

    const byGroupRevenue = groups.map((g)=>({ id:g.id, name:g.name, value:periodSubs.filter((s)=>String(s.groupId)===String(g.id)).reduce((a,b)=>a+Number(b.amount||0),0)})).sort((a,b)=>b.value-a.value).slice(0,5);
    const byGroupAttendance = groups.map((g)=>({ id:g.id, name:g.name, value:periodAttn.filter((a)=>String(a.groupId)===String(g.id)).reduce((a,b)=>a+Number(b.quantity||1),0)})).sort((a,b)=>b.value-a.value).slice(0,5);

    const insights = [];
    if (endingSoon > 0) insights.push(`Увага: ${endingSoon} абонементів завершуються протягом 7 днів.`);
    if (lowAttendanceGroups > 0) insights.push(`Низька відвідуваність у ${lowAttendanceGroups} групах (avg < 4).`);
    if (reserveVacancy > 0) insights.push(`${reserveVacancy} груп мають резерв — перевірте потенційні місця.`);
    if (revenue > 0 && attendance > 0) insights.push(`Середній дохід на 1 відвідування: ${Math.round(revenue / attendance)}₴.`);

    return { revenue, payments, activeStudents, attendance, avgPerSession, activeSubs, expiredSubs, noActivePay, endingSoon, lowAttendanceGroups, reserveVacancy, byDir, byGroupRevenue, byGroupAttendance, insights };
  }, [subs, attn, students, groups, directionsList, waitlist, period]);

  return <div style={{display:"grid", gap:16}}>
    <div style={{...cardSt, border:`1px solid ${theme.border}`, display:"flex", gap:10, alignItems:"center", flexWrap:"wrap"}}>
      <button style={{...cardSt, padding:"8px 12px", background:periodMode==="this_month"?theme.primary:theme.card, color:periodMode==="this_month"?"#fff":theme.textMain}} onClick={()=>setPeriodMode("this_month")}>Цей місяць</button>
      <button style={{...cardSt, padding:"8px 12px", background:periodMode==="last_month"?theme.primary:theme.card, color:periodMode==="last_month"?"#fff":theme.textMain}} onClick={()=>setPeriodMode("last_month")}>Минулий місяць</button>
      <button style={{...cardSt, padding:"8px 12px", background:periodMode==="custom"?theme.primary:theme.card, color:periodMode==="custom"?"#fff":theme.textMain}} onClick={()=>setPeriodMode("custom")}>Custom</button>
      {periodMode === "custom" && <><input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} /><input type="date" value={to} onChange={(e)=>setTo(e.target.value)} /></>}
    </div>

    <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))", gap:12}}>
      <Tile label="Загальна виручка" value={`${data.revenue.toLocaleString()}₴`} hint="sum(amount) за період" tone={theme.success} />
      <Tile label="Кількість оплат" value={data.payments} hint="кількість subs з activation/start у періоді" />
      <Tile label="Активні учениці" value={data.activeStudents} hint="унікальні studentId у attendance" />
      <Tile label="Відвідування" value={data.attendance} hint="sum(attendance.quantity||1)" />
      <Tile label="Сер. відвідуваність/заняття" value={data.avgPerSession} hint="attendance / held sessions" />
      <Tile label="Активні абонементи" value={data.activeSubs} hint="subs status != expired" />
      <Tile label="Завершені/прострочені" value={data.expiredSubs} hint="subs status == expired" tone={theme.danger} />
    </div>

    <div style={{display:"grid", gridTemplateColumns:"1.2fr 1fr", gap:12}}>
      <div style={{...cardSt, border:`1px solid ${theme.border}`}}><h3 style={{marginTop:0}}>Ризики</h3>
        <ul>
          <li>Учениці без активної оплати: <b>{data.noActivePay}</b></li>
          <li>Абонементи, що скоро закінчуються (7 днів): <b>{data.endingSoon}</b></li>
          <li>Групи з низькою відвідуваністю: <b>{data.lowAttendanceGroups}</b></li>
          <li>Групи з резервом/потенційним місцем: <b>{data.reserveVacancy}</b></li>
        </ul>
      </div>
      <div style={{...cardSt, border:`1px solid ${theme.border}`}}><h3 style={{marginTop:0}}>Що важливо зараз</h3>
        <ul>{data.insights.slice(0,5).map((x,i)=><li key={i}>{x}</li>)}</ul>
      </div>
    </div>

    <div style={{display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:12}}>
      <div style={{...cardSt, border:`1px solid ${theme.border}`}}><h4 style={{marginTop:0}}>Топ напрямки за виручкою</h4>{data.byDir.map((r)=><div key={r.id}>{r.name}: <b>{r.revenue.toLocaleString()}₴</b></div>)}</div>
      <div style={{...cardSt, border:`1px solid ${theme.border}`}}><h4 style={{marginTop:0}}>Топ групи за виручкою</h4>{data.byGroupRevenue.map((r)=><div key={r.id}>{r.name}: <b>{r.value.toLocaleString()}₴</b></div>)}</div>
      <div style={{...cardSt, border:`1px solid ${theme.border}`}}><h4 style={{marginTop:0}}>Топ групи за відвідуваністю</h4>{data.byGroupAttendance.map((r)=><div key={r.id}>{r.name}: <b>{r.value}</b></div>)}</div>
    </div>
  </div>;
}
