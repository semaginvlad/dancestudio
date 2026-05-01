import React, { useMemo, useState } from "react";
import { cardSt, theme } from "../shared/constants";
import { useStickyState } from "../shared/utils";

const dayMs = 86400000;
const toDate = (s) => new Date(`${s}T00:00:00`);
const fmtShort = (s) => String(s || "").slice(5);
const inRange = (v, start, end) => !!v && v >= start && v <= end;
const pctDelta = (curr, prev) => (prev > 0 ? Number((((curr - prev) / prev) * 100).toFixed(1)) : null);
const rank = (v) => (v >= 100 ? "виконано" : v >= 70 ? "в процесі" : "ризик");
const ringColor = (v) => (v >= 100 ? theme.success : v >= 70 ? theme.warning : theme.danger);
const getPaymentDate = (sub = {}) => String(sub.paidAt || sub.paymentDate || sub.created_at || sub.dateAdded || sub.activationDate || sub.startDate || "").slice(0, 10);
const isPaidSub = (sub = {}) => (sub.paid === false ? false : true);

/** Previous period: same number of days immediately before current start. */
const getPrevPeriod = (start, end) => {
  const days = Math.max(1, Math.round((toDate(end) - toDate(start)) / dayMs) + 1);
  const prevEnd = new Date(toDate(start).getTime() - dayMs);
  const prevStart = new Date(prevEnd.getTime() - dayMs * (days - 1));
  return { start: prevStart.toISOString().slice(0, 10), end: prevEnd.toISOString().slice(0, 10), days };
};

const Ring = ({ value, label }) => {
  const r = 32; const c = 2 * Math.PI * r; const cl = Math.max(0, Math.min(140, value));
  return <div style={{ display: "grid", justifyItems: "center", gap: 4 }}><svg width="78" height="78" viewBox="0 0 78 78"><circle cx="39" cy="39" r={r} fill="none" stroke={theme.border} strokeWidth="8" /><circle cx="39" cy="39" r={r} fill="none" stroke={ringColor(value)} strokeWidth="8" strokeLinecap="round" transform="rotate(-90 39 39)" strokeDasharray={`${(cl / 100) * c} ${c}`} /><text x="39" y="43" textAnchor="middle" style={{ fill: theme.textMain, fontWeight: 800, fontSize: 13 }}>{value}%</text></svg><div style={{ fontSize: 11, color: theme.textMuted }}>{label}</div></div>;
};

const TrendLine = ({ rows = [], title, color, deltaLabel }) => {
  if (rows.length < 2) return <div style={{ ...cardSt, border: `1px solid ${theme.border}` }}><b>{title}</b><div style={{ color: theme.textLight, marginTop: 8 }}>мало даних для тренду</div></div>;
  const w = 420; const h = 180; const p = 26; const max = Math.max(1, ...rows.map((r) => r.value || 0)); const min = Math.min(...rows.map((r) => r.value || 0));
  const step = (w - p * 2) / (rows.length - 1); const points = rows.map((r, i) => `${p + i * step},${h - p - ((r.value || 0) / max) * (h - p * 2)}`).join(" ");
  const first = rows[0]; const mid = rows[Math.floor(rows.length / 2)]; const last = rows.at(-1);
  return <div style={{ ...cardSt, border: `1px solid ${theme.border}` }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><b>{title}</b><div style={{ color: theme.textMuted, fontWeight: 700 }}>{deltaLabel}</div></div><svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}><line x1={p} y1={h - p} x2={w - p} y2={h - p} stroke={theme.border} /><line x1={p} y1={p} x2={p} y2={h - p} stroke={theme.border} /><polyline fill="none" stroke={color} strokeWidth="3" points={points} /><text x={p} y={h - 6} fontSize="10" fill={theme.textLight}>{fmtShort(first.day)}</text><text x={w / 2} y={h - 6} fontSize="10" fill={theme.textLight} textAnchor="middle">{fmtShort(mid.day)}</text><text x={w - p} y={h - 6} fontSize="10" fill={theme.textLight} textAnchor="end">{fmtShort(last.day)}</text><text x={p - 4} y={p + 4} fontSize="10" fill={theme.textLight} textAnchor="end">max {max}</text><text x={p - 4} y={h - p} fontSize="10" fill={theme.textLight} textAnchor="end">min {min}</text><text x={w - p} y={p + 4} fontSize="10" fill={theme.textMain} textAnchor="end">last {last.value}</text></svg></div>;
};

const RankList = ({ title, rows = [], unit = "" }) => <div style={{ ...cardSt, border: `1px solid ${theme.border}` }}><b>{title}</b><div style={{ display: "grid", gap: 7, marginTop: 8 }}>{rows.length ? rows.map((r, i) => <div key={`${title}_${r.id || r.name}`} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span>{i + 1}. {r.name}</span><b>{(r.value || 0).toLocaleString()}{unit}</b></div>) : <div style={{color:theme.textLight}}>Немає даних за період</div>}</div></div>;

export default function DashboardTab({ students = [], studentGrps = [], groups = [], directionsList = [], subs = [], attn = [], waitlist = [] }) {
  const now = new Date();
  const [mode, setMode] = useState("this_month");
  const [from, setFrom] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10));
  const [targets, setTargets] = useStickyState({ revenueTarget: 120000, attendanceTarget: 500, activeStudentsTarget: 140, recruitmentTarget: 40 }, "ds_dashboard_targets_v2");

  const period = useMemo(() => {
    if (mode === "custom") return { start: from, end: to };
    if (mode === "last_month") { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); return { start: new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10), end: new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10) }; }
    return { start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10), end: new Date().toISOString().slice(0, 10) };
  }, [mode, from, to]);
  const prev = useMemo(() => getPrevPeriod(period.start, period.end), [period]);

  const calc = (range) => {
    const pSubs = subs.filter((s) => isPaidSub(s) && inRange(getPaymentDate(s), range.start, range.end));
    const pAttn = attn.filter((a) => inRange(String(a.date || "").slice(0, 10), range.start, range.end));
    const revenue = pSubs.reduce((s, x) => s + Number(x.amount || 0), 0);
    const payments = pSubs.length;
    const attendance = pAttn.reduce((s, x) => s + Number(x.quantity || 1), 0);
    const heldSessions = new Set(pAttn.map((a) => `${a.groupId}:${String(a.date || "").slice(0, 10)}`)).size;
    const activeStudents = new Set(pAttn.map((a) => String(a.studentId || "")).filter(Boolean)).size;
    const byDayRev = new Map(); pSubs.forEach((s) => { const d = getPaymentDate(s); byDayRev.set(d, (byDayRev.get(d) || 0) + Number(s.amount || 0)); });
    const byDayAttn = new Map(); pAttn.forEach((a) => { const d = String(a.date || "").slice(0, 10); byDayAttn.set(d, (byDayAttn.get(d) || 0) + Number(a.quantity || 1)); });
    return {
      revenue, payments, attendance, heldSessions, activeStudents,
      avgAttendance: heldSessions ? Number((attendance / heldSessions).toFixed(2)) : 0,
      revenueTrend: Array.from(byDayRev.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => ({ day, value })),
      attendanceTrend: Array.from(byDayAttn.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => ({ day, value })),
      byGroupRevenue: groups.map((g) => ({ id: g.id, name: g.name, value: pSubs.filter((s) => String(s.groupId) === String(g.id)).reduce((sum, s) => sum + Number(s.amount || 0), 0) })),
      byGroupAttendance: groups.map((g) => ({ id: g.id, name: g.name, value: pAttn.filter((a) => String(a.groupId) === String(g.id)).reduce((sum, a) => sum + Number(a.quantity || 1), 0), held: new Set(pAttn.filter((a) => String(a.groupId) === String(g.id)).map((a) => String(a.date || "").slice(0, 10))).size })),
      byDirRevenue: directionsList.map((d) => ({ id: d.id, name: d.name, value: pSubs.filter((s) => groups.some((g) => String(g.id) === String(s.groupId) && String(g.directionId) === String(d.id))).reduce((sum, s) => sum + Number(s.amount || 0), 0) })),
    };
  };

  const curr = useMemo(() => calc(period), [period, subs, attn, groups, directionsList]);
  const prevData = useMemo(() => calc(prev), [prev, subs, attn, groups, directionsList]);

  const cmpLabel = (currValue, prevValue) => {
    const delta = pctDelta(currValue, prevValue);
    if (delta === null && currValue > 0) return "нові дані";
    if (delta === null) return "без змін";
    if (delta > 0) return `▲ ${delta}% vs попередній період`;
    if (delta < 0) return `▼ ${Math.abs(delta)}% vs попередній період`;
    return "без змін";
  };

  const recentCut = new Date(Date.now() - 45 * dayMs).toISOString().slice(0, 10);
  const relevantSet = new Set((studentGrps.length ? studentGrps.map((x) => String(x.studentId)) : attn.filter((a) => String(a.date || "") >= recentCut).map((a) => String(a.studentId || ""))).filter(Boolean));
  const noActivePayment = Array.from(relevantSet).filter((sid) => !subs.some((s) => String(s.studentId) === sid && s.status !== "expired")).length;
  const endingSoon = subs.filter((s) => s.status !== "expired" && s.endDate && s.endDate >= new Date().toISOString().slice(0, 10) && s.endDate <= new Date(Date.now() + 7 * dayMs).toISOString().slice(0, 10)).length;
  const lowAttendanceGroups = curr.byGroupAttendance.filter((g) => g.held >= 2 && (g.value / g.held) < 4).length;
  const deadGroups = groups.filter((g) => !curr.byGroupAttendance.some((x) => String(x.id) === String(g.id) && x.value > 0)).length;
  const reserveDemand = groups.filter((g) => waitlist.some((w) => String(w.groupId) === String(g.id) && ["waiting", "contacted", ""].includes(String(w.status || "")))).length;

  const health = curr.byGroupAttendance.filter((g) => g.held >= 2 || (curr.byGroupRevenue.find((x) => String(x.id) === String(g.id))?.value || 0) > 0).map((g) => {
    const rev = curr.byGroupRevenue.find((x) => String(x.id) === String(g.id))?.value || 0;
    const prevAtt = prevData.byGroupAttendance.find((x) => String(x.id) === String(g.id))?.value || 0;
    const trendScore = prevAtt > 0 ? (g.value >= prevAtt ? 20 : 8) : 12;
    const avg = g.held ? g.value / g.held : 0;
    const avgScore = Math.min(35, Math.round(avg * 6));
    const revScore = Math.min(25, Math.round(rev / 1000));
    const subBal = Math.min(12, Math.max(0, Math.round((subs.filter((s) => String(s.groupId) === String(g.id) && s.status !== "expired").length - subs.filter((s) => String(s.groupId) === String(g.id) && s.status === "expired").length) * 2 + 6)));
    const reserveBonus = waitlist.some((w) => String(w.groupId) === String(g.id) && ["waiting", "contacted", ""].includes(String(w.status || ""))) ? 8 : 0;
    const score = Math.min(100, avgScore + revScore + trendScore + subBal + reserveBonus);
    return { id: g.id, name: g.name, value: score, bucket: score >= 70 ? "Тримати / сильні" : score >= 45 ? "Під наглядом" : "Потребує рішення" };
  }).sort((a, b) => b.value - a.value);

  const works = []; const weak = [];
  curr.byDirRevenue.forEach((d) => { const p = prevData.byDirRevenue.find((x) => String(x.id) === String(d.id))?.value || 0; if (p > 0 && d.value > p) works.push(`Напрямок ${d.name} виріс (${pctDelta(d.value, p)}%).`); if (p === 0 && d.value > 0) works.push(`Напрямок ${d.name}: нові дані.`); });
  curr.byGroupAttendance.forEach((g) => { const prevG = prevData.byGroupAttendance.find((x) => String(x.id) === String(g.id))?.value || 0; if (g.held >= 2 && (g.value / g.held) >= 6) works.push(`Група ${g.name}: сильна відвідуваність.`); if (g.held >= 2 && prevG > 0 && g.value < prevG) weak.push(`Група ${g.name}: відвідуваність знизилась.`); if (g.held >= 2 && (g.value / g.held) < 4) weak.push(`Група ${g.name}: низька середня відвідуваність.`); });

  const targetCards = [
    { key: "revenue", label: "Виручка", actual: curr.revenue, target: targets.revenueTarget, unit: "₴", cmp: cmpLabel(curr.revenue, prevData.revenue) },
    { key: "attendance", label: "Відвідуваність", actual: curr.attendance, target: targets.attendanceTarget, unit: "", cmp: cmpLabel(curr.attendance, prevData.attendance) },
    { key: "active", label: "Активні учениці", actual: curr.activeStudents, target: targets.activeStudentsTarget, unit: "", cmp: cmpLabel(curr.activeStudents, prevData.activeStudents) },
    { key: "recruit", label: "Набір / оплати", actual: curr.payments, target: targets.recruitmentTarget, unit: "", cmp: cmpLabel(curr.payments, prevData.payments) },
  ];

  return <div style={{ display: "grid", gap: 14 }}>
    <div style={{ ...cardSt, border: `1px solid ${theme.border}`, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <button onClick={() => setMode("this_month")} style={{ ...cardSt, padding: "8px 12px", background: mode === "this_month" ? theme.primary : theme.card, color: mode === "this_month" ? "#fff" : theme.textMain }}>Цей місяць</button>
      <button onClick={() => setMode("last_month")} style={{ ...cardSt, padding: "8px 12px", background: mode === "last_month" ? theme.primary : theme.card, color: mode === "last_month" ? "#fff" : theme.textMain }}>Минулий місяць</button>
      <button onClick={() => setMode("custom")} style={{ ...cardSt, padding: "8px 12px", background: mode === "custom" ? theme.primary : theme.card, color: mode === "custom" ? "#fff" : theme.textMain }}>Custom</button>
      {mode === "custom" && <><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></>}
      <div style={{ marginLeft: "auto", fontSize: 12, color: theme.textLight }}>Період: {fmtShort(period.start)}–{fmtShort(period.end)} · Порівняння: попередній такий самий період</div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>{targetCards.map((c) => { const key = c.key === "active" ? "activeStudents" : c.key === "recruit" ? "recruitment" : c.key; const pc = c.target > 0 ? Math.round((c.actual / c.target) * 100) : 0; return <div key={c.key} style={{ ...cardSt, border: `1px solid ${theme.border}`, display: "grid", gridTemplateColumns: "auto 1fr", gap: 10 }}><Ring value={pc} label={rank(pc)} /><div><div style={{ fontSize: 12, color: theme.textMuted }}>{c.label}</div><div style={{ fontSize: 24, fontWeight: 800 }}>{c.actual.toLocaleString()}{c.unit}</div><div style={{ fontSize: 12, color: theme.textLight }}>План: {Number(c.target || 0).toLocaleString()}{c.unit}</div><div style={{ fontSize: 11, color: theme.textLight }}>{c.cmp}</div><input type="number" value={targets[`${key}Target`] || 0} onChange={(e) => setTargets((p) => ({ ...p, [`${key}Target`]: Number(e.target.value || 0) }))} style={{ marginTop: 6, width: 150 }} /></div></div>; })}</div>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <TrendLine title="Тренд виручки" rows={curr.revenueTrend} color={theme.success} deltaLabel={cmpLabel(curr.revenue, prevData.revenue)} />
      <TrendLine title="Тренд відвідуваності" rows={curr.attendanceTrend} color={theme.primary} deltaLabel={cmpLabel(curr.attendance, prevData.attendance)} />
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }}>
      <RankList title="Топ 5 груп за виручкою" rows={curr.byGroupRevenue.filter((x) => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 5)} unit="₴" />
      <RankList title="Топ 5 груп за відвідуваністю" rows={curr.byGroupAttendance.filter((x) => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 5)} />
      <RankList title="Топ 5 напрямків за виручкою" rows={curr.byDirRevenue.filter((x) => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 5)} unit="₴" />
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <RankList title="Топ 5 груп за сер. відвідуваністю" rows={curr.byGroupAttendance.filter((g) => g.held >= 2).map((g) => ({ id: g.id, name: g.name, value: Number((g.value / g.held).toFixed(2)) })).sort((a, b) => b.value - a.value).slice(0, 5)} />
      <RankList title="Bottom 5 (сер. відвідуваність, held>=2)" rows={curr.byGroupAttendance.filter((g) => g.held >= 2).map((g) => ({ id: g.id, name: g.name, value: Number((g.value / g.held).toFixed(2)) })).sort((a, b) => a.value - b.value).slice(0, 5)} />
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
      <div style={{ ...cardSt, border: `1px solid ${theme.border}` }}><b>Що працює</b><ul>{works.slice(0, 5).length ? works.slice(0, 5).map((x, i) => <li key={i}>{x}</li>) : <li>немає достатньо даних</li>}</ul></div>
      <div style={{ ...cardSt, border: `1px solid ${theme.border}` }}><b>Що просідає</b><ul>{weak.slice(0, 5).length ? weak.slice(0, 5).map((x, i) => <li key={i}>{x}</li>) : <li>немає критичних просідань</li>}</ul></div>
      <div style={{ ...cardSt, border: `1px solid ${theme.border}` }}><b>Групи під ризиком</b><div style={{ display: "grid", gap: 6, marginTop: 8 }}>{health.slice(-5).map((h) => <div key={h.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span>{h.name}</span><b style={{ color: h.value < 45 ? theme.danger : h.value < 70 ? theme.warning : theme.success }}>{h.value} · {h.bucket}</b></div>)}</div></div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 10 }}>
      {[{ t: "Ending soon", v: endingSoon, d: "абонементи до 7 днів" }, { t: "No active payment", v: noActivePayment, d: "актуальні учениці без активної оплати" }, { t: "Low attendance groups", v: lowAttendanceGroups, d: "avg<4, held>=2" }, { t: "Reserve demand", v: reserveDemand, d: "групи з очікуванням" }, { t: "Potential dead groups", v: deadGroups, d: "без відвідувань у періоді" }].map((r) => <div key={r.t} style={{ ...cardSt, border: `1px solid ${theme.border}`, padding: 12 }}><div style={{ fontSize: 11, color: theme.textMuted }}>{r.t}</div><div style={{ fontSize: 24, fontWeight: 800 }}>{r.v}</div><div style={{ fontSize: 11, color: theme.textLight }}>{r.d}</div></div>)}
    </div>
  </div>;
}
