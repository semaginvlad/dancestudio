import React, { useMemo, useState } from "react";
import { cardSt, theme } from "../shared/constants";
import { useStickyState } from "../shared/utils";

const todayKey = () => new Date().toISOString().slice(0, 10);
const monthStart = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
const monthEnd = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
const inRange = (v, start, end) => !!v && v >= start && v <= end;
const pct = (actual, target) => (target > 0 ? Math.round((actual / target) * 100) : 0);
const statusByPct = (value) => (value >= 100 ? "виконано" : value >= 70 ? "в процесі" : "ризик");
const statusColor = (value) => (value >= 100 ? theme.success : value >= 70 ? theme.warning : theme.danger);

const Ring = ({ value = 0, label }) => {
  const r = 34;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(140, value));
  const dash = (clamped / 100) * c;
  return (
    <div style={{ display: "grid", justifyItems: "center", gap: 6 }}>
      <svg width="84" height="84" viewBox="0 0 84 84">
        <circle cx="42" cy="42" r={r} fill="none" stroke={theme.border} strokeWidth="8" />
        <circle cx="42" cy="42" r={r} fill="none" stroke={statusColor(value)} strokeWidth="8" strokeLinecap="round" transform="rotate(-90 42 42)" strokeDasharray={`${dash} ${c - dash}`} />
        <text x="42" y="45" textAnchor="middle" style={{ fill: theme.textMain, fontWeight: 800, fontSize: 14 }}>{value}%</text>
      </svg>
      <div style={{ fontSize: 12, color: theme.textMuted }}>{label}</div>
    </div>
  );
};

const TinyLine = ({ rows = [], color = theme.primary }) => {
  const w = 360; const h = 150; const p = 18;
  if (!rows.length) return <div style={{ color: theme.textLight, fontSize: 12 }}>Немає даних</div>;
  const max = Math.max(1, ...rows.map((r) => r.value || 0));
  const step = rows.length > 1 ? (w - p * 2) / (rows.length - 1) : 0;
  const points = rows.map((r, i) => `${p + i * step},${h - p - ((r.value || 0) / max) * (h - p * 2)}`).join(" ");
  return <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}>
    <polyline fill="none" stroke={theme.border} strokeWidth="1" points={`${p},${h-p} ${w-p},${h-p}`} />
    <polyline fill="none" stroke={color} strokeWidth="3" points={points} />
  </svg>;
};

const HBars = ({ rows = [], unit = "" }) => {
  const max = Math.max(1, ...rows.map((r) => r.value || 0));
  return <div style={{ display: "grid", gap: 8 }}>
    {rows.map((r) => (
      <div key={r.id || r.name}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span style={{ color: theme.textMain }}>{r.name}</span><b>{(r.value || 0).toLocaleString()}{unit}</b></div>
        <div style={{ height: 8, borderRadius: 999, background: theme.input, marginTop: 4 }}><div style={{ height: 8, borderRadius: 999, width: `${Math.round(((r.value || 0) / max) * 100)}%`, background: theme.primary }} /></div>
      </div>
    ))}
  </div>;
};

export default function DashboardTab({ students = [], groups = [], directionsList = [], subs = [], attn = [], waitlist = [], cancelled = [] }) {
  const now = new Date();
  const [periodMode, setPeriodMode] = useState("this_month");
  const [from, setFrom] = useState(monthStart(now));
  const [to, setTo] = useState(monthEnd(now));
  const [targets, setTargets] = useStickyState({ revenueTarget: 120000, attendanceTarget: 450, activeStudentsTarget: 120, recruitmentTarget: 35 }, "ds_dashboard_targets_v1");

  const period = useMemo(() => {
    if (periodMode === "custom") return { start: from, end: to };
    if (periodMode === "last_month") { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); return { start: monthStart(d), end: monthEnd(d) }; }
    return { start: monthStart(now), end: monthEnd(now) };
  }, [periodMode, from, to]);

  const data = useMemo(() => {
    const periodSubs = subs.filter((s) => inRange(String(s.activationDate || s.startDate || "").slice(0, 10), period.start, period.end));
    const periodAttn = attn.filter((a) => inRange(String(a.date || "").slice(0, 10), period.start, period.end));

    const revenue = periodSubs.reduce((sum, s) => sum + Number(s.amount || 0), 0);
    const payments = periodSubs.length;
    const attendance = periodAttn.reduce((sum, a) => sum + Number(a.quantity || 1), 0);
    const heldSessions = new Set(periodAttn.map((a) => `${a.groupId}:${String(a.date || "").slice(0, 10)}`)).size;
    const avgAttendance = heldSessions ? Number((attendance / heldSessions).toFixed(2)) : 0;
    const activeStudents = new Set(periodAttn.map((a) => String(a.studentId || "")).filter(Boolean)).size;
    const activeSubs = subs.filter((s) => s.status !== "expired").length;
    const expiredSubs = subs.filter((s) => s.status === "expired").length;

    const byDayMap = new Map();
    periodAttn.forEach((a) => {
      const d = String(a.date || "").slice(0, 10);
      byDayMap.set(d, (byDayMap.get(d) || 0) + Number(a.quantity || 1));
    });
    const revenueDayMap = new Map();
    periodSubs.forEach((s) => {
      const d = String(s.activationDate || s.startDate || "").slice(0, 10);
      revenueDayMap.set(d, (revenueDayMap.get(d) || 0) + Number(s.amount || 0));
    });
    const attendanceTrend = Array.from(byDayMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => ({ day: day.slice(5), value }));
    const revenueTrend = Array.from(revenueDayMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => ({ day: day.slice(5), value }));

    const byDirection = directionsList.map((d) => {
      const gids = groups.filter((g) => String(g.directionId) === String(d.id)).map((g) => String(g.id));
      return { id: d.id, name: d.name, value: periodSubs.filter((s) => gids.includes(String(s.groupId))).reduce((sum, s) => sum + Number(s.amount || 0), 0) };
    }).sort((a, b) => b.value - a.value).slice(0, 6);

    const byGroupRevenue = groups.map((g) => ({ id: g.id, name: g.name, value: periodSubs.filter((s) => String(s.groupId) === String(g.id)).reduce((sum, s) => sum + Number(s.amount || 0), 0) })).sort((a, b) => b.value - a.value).slice(0, 6);
    const byGroupAttendance = groups.map((g) => ({ id: g.id, name: g.name, value: periodAttn.filter((a) => String(a.groupId) === String(g.id)).reduce((sum, a) => sum + Number(a.quantity || 1), 0) })).sort((a, b) => b.value - a.value).slice(0, 6);

    const endingSoon = subs.filter((s) => s.status !== "expired" && s.endDate && s.endDate >= todayKey() && s.endDate <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)).length;
    const noActivePayment = students.filter((st) => !subs.some((s) => String(s.studentId) === String(st.id) && s.status !== "expired")).length;
    const lowAttendanceGroups = byGroupAttendance.filter((g) => g.value > 0 && (g.value / Math.max(1, heldSessions)) < 4).length;
    const reservePressure = groups.filter((g) => waitlist.some((w) => String(w.groupId) === String(g.id) && ["waiting", "contacted", ""].includes(String(w.status || "")))).length;

    const completion = {
      revenue: pct(revenue, Number(targets.revenueTarget || 0)),
      attendance: pct(attendance, Number(targets.attendanceTarget || 0)),
      activeStudents: pct(activeStudents, Number(targets.activeStudentsTarget || 0)),
      recruitment: pct(payments, Number(targets.recruitmentTarget || 0)),
    };

    return { revenue, payments, attendance, avgAttendance, activeStudents, activeSubs, expiredSubs, attendanceTrend, revenueTrend, byDirection, byGroupRevenue, byGroupAttendance, endingSoon, noActivePayment, lowAttendanceGroups, reservePressure, completion };
  }, [subs, attn, students, groups, directionsList, waitlist, period, targets]);

  const setTarget = (key, v) => setTargets((prev) => ({ ...(prev || {}), [key]: Number(v || 0) }));

  return <div style={{ display: "grid", gap: 14 }}>
    <div style={{ ...cardSt, border: `1px solid ${theme.border}`, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <button style={{ ...cardSt, padding: "8px 12px", background: periodMode === "this_month" ? theme.primary : theme.card, color: periodMode === "this_month" ? "#fff" : theme.textMain }} onClick={() => setPeriodMode("this_month")}>Цей місяць</button>
      <button style={{ ...cardSt, padding: "8px 12px", background: periodMode === "last_month" ? theme.primary : theme.card, color: periodMode === "last_month" ? "#fff" : theme.textMain }} onClick={() => setPeriodMode("last_month")}>Минулий місяць</button>
      <button style={{ ...cardSt, padding: "8px 12px", background: periodMode === "custom" ? theme.primary : theme.card, color: periodMode === "custom" ? "#fff" : theme.textMain }} onClick={() => setPeriodMode("custom")}>Custom</button>
      {periodMode === "custom" && <><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></>}
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 12 }}>
      {[{k:"revenue",label:"Виручка",actual:data.revenue,target:targets.revenueTarget,unit:"₴"},{k:"attendance",label:"Відвідуваність",actual:data.attendance,target:targets.attendanceTarget,unit:""},{k:"activeStudents",label:"Активні учениці",actual:data.activeStudents,target:targets.activeStudentsTarget,unit:""},{k:"recruitment",label:"Набір / нові оплати",actual:data.payments,target:targets.recruitmentTarget,unit:""}].map((x)=> <div key={x.k} style={{...cardSt,border:`1px solid ${theme.border}`,display:"grid",gridTemplateColumns:"auto 1fr",gap:10,alignItems:"center"}}>
        <Ring value={data.completion[x.k]} label={statusByPct(data.completion[x.k])} />
        <div>
          <div style={{fontSize:13,color:theme.textMuted,textTransform:"uppercase",fontWeight:700}}>{x.label}</div>
          <div style={{fontSize:22,fontWeight:800,color:theme.textMain,marginTop:4}}>{(x.actual||0).toLocaleString()}{x.unit}</div>
          <div style={{fontSize:12,color:theme.textLight}}>План: {Number(x.target||0).toLocaleString()}{x.unit} · {data.completion[x.k]}%</div>
          <input type="number" value={targets[`${x.k}Target`] || 0} onChange={(e)=>setTarget(`${x.k}Target`, e.target.value)} style={{marginTop:6,width:140}} />
        </div>
      </div>)}
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <div style={{ ...cardSt, border: `1px solid ${theme.border}` }}><div style={{fontWeight:700,marginBottom:8}}>Тренд виручки</div><TinyLine rows={data.revenueTrend} color={theme.success} /></div>
      <div style={{ ...cardSt, border: `1px solid ${theme.border}` }}><div style={{fontWeight:700,marginBottom:8}}>Тренд відвідуваності</div><TinyLine rows={data.attendanceTrend} color={theme.primary} /></div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <div style={{ ...cardSt, border: `1px solid ${theme.border}` }}><div style={{fontWeight:700,marginBottom:8}}>Виручка за напрямками</div><HBars rows={data.byDirection} unit="₴" /></div>
      <div style={{ ...cardSt, border: `1px solid ${theme.border}` }}><div style={{fontWeight:700,marginBottom:8}}>Топ групи за відвідуваністю</div><HBars rows={data.byGroupAttendance} /></div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10 }}>
      {[{t:"Ending soon",v:data.endingSoon,c:theme.warning},{t:"No active payment",v:data.noActivePayment,c:theme.danger},{t:"Low attendance groups",v:data.lowAttendanceGroups,c:theme.warning},{t:"Reserve pressure",v:data.reservePressure,c:theme.primary}].map((r)=> <div key={r.t} style={{...cardSt,border:`1px solid ${theme.border}`,padding:14}}><div style={{fontSize:12,color:theme.textMuted}}>{r.t}</div><div style={{fontSize:24,fontWeight:800,color:r.c}}>{r.v}</div></div>)}
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10 }}>
      <div style={{...cardSt,border:`1px solid ${theme.border}`}}><div style={{fontSize:12,color:theme.textMuted}}>Активні абонементи</div><div style={{fontSize:26,fontWeight:800}}>{data.activeSubs}</div></div>
      <div style={{...cardSt,border:`1px solid ${theme.border}`}}><div style={{fontSize:12,color:theme.textMuted}}>Завершені/прострочені</div><div style={{fontSize:26,fontWeight:800,color:theme.danger}}>{data.expiredSubs}</div></div>
      <div style={{...cardSt,border:`1px solid ${theme.border}`}}><div style={{fontSize:12,color:theme.textMuted}}>Сер. відвідуваність / заняття</div><div style={{fontSize:26,fontWeight:800}}>{data.avgAttendance}</div></div>
    </div>
  </div>;
}
