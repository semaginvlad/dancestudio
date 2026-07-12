import React, { useMemo, useState } from "react";
import { cardSt, theme } from "../shared/constants";
import { useStickyState } from "../shared/utils";
import AIInsightsPanel from "./AIInsightsPanel";
import GlobalAIAssistant from "./GlobalAIAssistant";

const dayMs = 86400000;
const toDate = (s) => new Date(`${s}T00:00:00`);
const toLocalDateKey = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmtShort = (s) => String(s || "").slice(5);
const inRange = (v, start, end) => !!v && v >= start && v <= end;
const pctDelta = (curr, prev) => (prev > 0 ? Number((((curr - prev) / prev) * 100).toFixed(1)) : null);
const rank = (v) => (v >= 100 ? "виконано" : v >= 70 ? "в процесі" : "ризик");
const ringColor = (v) => (v >= 100 ? theme.success : v >= 70 ? theme.warning : theme.danger);
// Revenue is based on activation_date (service delivery),
// not on payment/creation time. This matches studio accounting and trainer payouts.
const getRevenueDate = (sub = {}) => String(
  sub.activationDate
  || sub.activation_date
  || sub.startDate
  || sub.start_date
  || ""
).slice(0, 10);
const isPaidSub = (sub = {}) => (sub.paid === false ? false : true);
const money = (v) => Number(v || 0) || 0;
const getNominalAmount = (sub = {}) =>
  money(sub.nominalAmount || sub.nominal_amount || sub.fullAmount || sub.full_amount || sub.price || sub.baseAmount || sub.base_amount);
const getDiscountSide = (sub = {}) => String(sub.discountSide || sub.discount_side || sub.discountBy || sub.discount_by || "").toLowerCase();
// Keep trainer salary logic consistent with TrainersTab discount accounting.
const getTrainerShareAmount = (sub = {}, trainerPct = 0) => {
  const pct = Math.max(0, Math.min(100, Number(trainerPct || 0)));
  const paid = money(sub.amount);
  const nominal = getNominalAmount(sub);
  const side = getDiscountSide(sub);
  if (side === "trainer" && nominal > 0 && paid > 0 && nominal > paid) {
    const studioPartNominal = Math.round((nominal * (100 - pct)) / 100);
    return Math.max(0, paid - studioPartNominal);
  }
  return Math.round((paid * pct) / 100);
};

/** Previous period: same number of days immediately before current start. */
const getPrevPeriod = (start, end) => {
  const days = Math.max(1, Math.round((toDate(end) - toDate(start)) / dayMs) + 1);
  const prevEnd = new Date(toDate(start).getTime() - dayMs);
  const prevStart = new Date(prevEnd.getTime() - dayMs * (days - 1));
  return { start: toLocalDateKey(prevStart), end: toLocalDateKey(prevEnd), days };
};

const Ring = ({ value, label }) => {
  const r = 32; const c = 2 * Math.PI * r; const cl = Math.max(0, Math.min(140, value));
  return <div className="dashboard-ring" style={{ display: "grid", justifyItems: "center", gap: 4 }}><svg width="78" height="78" viewBox="0 0 78 78"><circle cx="39" cy="39" r={r} fill="none" stroke={theme.border} strokeWidth="8" /><circle cx="39" cy="39" r={r} fill="none" stroke={ringColor(value)} strokeWidth="8" strokeLinecap="round" transform="rotate(-90 39 39)" strokeDasharray={`${(cl / 100) * c} ${c}`} /><text x="39" y="43" textAnchor="middle" style={{ fill: theme.textMain, fontWeight: 800, fontSize: 13 }}>{value}%</text></svg><div style={{ fontSize: 11, color: theme.textMuted }}>{label}</div></div>;
};

const TrendLine = ({ rows = [], title, color, deltaLabel }) => {
  if (rows.length < 2) return <div style={{ ...cardSt, border: `1px solid ${theme.border}` }}><b>{title}</b><div style={{ color: theme.textLight, marginTop: 8 }}>мало даних для тренду</div></div>;
  const w = 420; const h = 180; const p = 26; const max = Math.max(1, ...rows.map((r) => r.value || 0)); const min = Math.min(...rows.map((r) => r.value || 0));
  const step = (w - p * 2) / (rows.length - 1); const points = rows.map((r, i) => `${p + i * step},${h - p - ((r.value || 0) / max) * (h - p * 2)}`).join(" ");
  const first = rows[0]; const mid = rows[Math.floor(rows.length / 2)]; const last = rows.at(-1);
  return <div className="dashboard-card dashboard-chart-card" style={{ ...cardSt, border: `1px solid ${theme.border}` }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}><b>{title}</b><div style={{ color: theme.textMuted, fontWeight: 700 }}>{deltaLabel}</div></div><div className="dashboard-chart-scroll"><svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}><line x1={p} y1={h - p} x2={w - p} y2={h - p} stroke={theme.border} /><line x1={p} y1={p} x2={p} y2={h - p} stroke={theme.border} /><polyline fill="none" stroke={color} strokeWidth="3" points={points} /><text x={p} y={h - 6} fontSize="10" fill={theme.textLight}>{fmtShort(first.day)}</text><text x={w / 2} y={h - 6} fontSize="10" fill={theme.textLight} textAnchor="middle">{fmtShort(mid.day)}</text><text x={w - p} y={h - 6} fontSize="10" fill={theme.textLight} textAnchor="end">{fmtShort(last.day)}</text><text x={p - 4} y={p + 4} fontSize="10" fill={theme.textLight} textAnchor="end">max {max}</text><text x={p - 4} y={h - p} fontSize="10" fill={theme.textLight} textAnchor="end">min {min}</text><text x={w - p} y={p + 4} fontSize="10" fill={theme.textMain} textAnchor="end">last {last.value}</text></svg></div></div>;
};

const RankList = ({ title, rows = [], unit = "" }) => <div className="dashboard-card dashboard-list-card" style={{ ...cardSt, border: `1px solid ${theme.border}` }}><b>{title}</b><div style={{ display: "grid", gap: 7, marginTop: 8 }}>{rows.length ? rows.map((r, i) => <div className="dashboard-compact-row" key={`${title}_${r.id || r.name}`} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span>{i + 1}. {r.name}</span><b>{(r.value || 0).toLocaleString()}{unit}</b></div>) : <div style={{color:theme.textLight}}>Немає даних за період</div>}</div></div>;

const MobileAccordionCard = ({ title, summary, children, open, onToggle }) => (
  <div className="dashboard-mobile-accordion" style={{ ...cardSt, border: `1px solid ${theme.border}` }}>
    <button type="button" className="dashboard-mobile-accordion-head" onClick={onToggle}>
      <span>
        <b>{title}</b>
        <small>{summary}</small>
      </span>
      <span className={`dashboard-mobile-chevron${open ? " dashboard-mobile-chevron--open" : ""}`}>⌄</span>
    </button>
    {open && <div className="dashboard-mobile-accordion-body">{children}</div>}
  </div>
);

export default function DashboardTab({ students = [], studentGrps = [], groups = [], directionsList = [], subs = [], attn = [], waitlist = [], trialBookings = [], trainers = [], trainerGroups = [], cancelled = [], roomBookings = [], groupLessonOverrides = [], isAdmin = false, aiInsightsContext = {} }) {
  const now = new Date();
  const [mode, setMode] = useState("this_month");
  const [from, setFrom] = useState(toLocalDateKey(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(toLocalDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
  const [targets, setTargets] = useStickyState({ revenueTarget: 120000, attendanceTarget: 500, activeStudentsTarget: 140, recruitmentTarget: 40 }, "ds_dashboard_targets_v2");
  const [financeOverrides, setFinanceOverrides] = useStickyState({ operationalExpenses: 0, ownerSalaryVlad: 0, ownerSalaryKostia: 0, otherExpenses: 0 }, "ds_dashboard_finance_overrides_v1");
  const [mobileSignalOpen, setMobileSignalOpen] = useState({ works: false, weak: false, risk: false });

  const period = useMemo(() => {
    if (mode === "custom") return { start: from, end: to };
    if (mode === "last_month") {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { start: toLocalDateKey(new Date(d.getFullYear(), d.getMonth(), 1)), end: toLocalDateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
    }
    return { start: toLocalDateKey(new Date(now.getFullYear(), now.getMonth(), 1)), end: toLocalDateKey(now) };
  }, [mode, from, to]);
  const prev = useMemo(() => getPrevPeriod(period.start, period.end), [period]);

  const calc = (range) => {
    const pSubs = subs.filter((s) => isPaidSub(s) && inRange(getRevenueDate(s), range.start, range.end));
    const pAttn = attn.filter((a) => inRange(String(a.date || "").slice(0, 10), range.start, range.end));
    const revenue = pSubs.reduce((s, x) => s + Number(x.amount || 0), 0);
    const payments = pSubs.length;
    const attendance = pAttn.reduce((s, x) => s + Number(x.quantity || 1), 0);
    const heldSessions = new Set(pAttn.map((a) => `${a.groupId}:${String(a.date || "").slice(0, 10)}`)).size;
    const activeStudents = new Set(pAttn.map((a) => String(a.studentId || "")).filter(Boolean)).size;
    const byDayRev = new Map(); pSubs.forEach((s) => { const d = getRevenueDate(s); byDayRev.set(d, (byDayRev.get(d) || 0) + Number(s.amount || 0)); });
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
  const trainerSalaryTotal = useMemo(() => {
    const inPeriodSubs = subs.filter((s) => isPaidSub(s) && inRange(getRevenueDate(s), period.start, period.end));
    return inPeriodSubs.reduce((sum, s) => {
      const group = groups.find((g) => String(g.id) === String(s.groupId));
      const pct = Number(group?.trainerPct || 0);
      return sum + getTrainerShareAmount(s, pct);
    }, 0);
  }, [subs, groups, period.start, period.end]);
  const grossRevenue = curr.revenue;
  const netProfit = grossRevenue - trainerSalaryTotal - money(financeOverrides.operationalExpenses) - money(financeOverrides.ownerSalaryVlad) - money(financeOverrides.ownerSalaryKostia) - money(financeOverrides.otherExpenses);

  const cmpLabel = (currValue, prevValue) => {
    const delta = pctDelta(currValue, prevValue);
    if (delta === null && currValue > 0) return "нові дані";
    if (delta === null) return "без змін";
    if (delta > 0) return `▲ ${delta}% vs попередній період`;
    if (delta < 0) return `▼ ${Math.abs(delta)}% vs попередній період`;
    return "без змін";
  };

  const recentCut = toLocalDateKey(new Date(Date.now() - 45 * dayMs));
  const relevantSet = new Set((studentGrps.length ? studentGrps.map((x) => String(x.studentId)) : attn.filter((a) => String(a.date || "") >= recentCut).map((a) => String(a.studentId || ""))).filter(Boolean));
  const noActivePayment = Array.from(relevantSet).filter((sid) => !subs.some((s) => String(s.studentId) === sid && s.status !== "expired")).length;
  const endingSoon = subs.filter((s) => s.status !== "expired" && s.endDate && s.endDate >= toLocalDateKey(new Date()) && s.endDate <= toLocalDateKey(new Date(Date.now() + 7 * dayMs))).length;
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

  const aiDashboardContext = useMemo(() => ({
    period,
    endingSoon,
    noActivePayment,
    lowAttendanceGroups,
    deadGroups,
    reserveDemand,
    lowAttendanceGroupRows: curr.byGroupAttendance
      .filter((g) => g.held >= 2 && (g.value / g.held) < 4)
      .map((g) => ({ ...g, average: Number((g.value / g.held).toFixed(2)) })),
    riskGroups: health.slice(-5),
    weakSignals: weak.slice(0, 5),
    strongSignals: works.slice(0, 5),
  }), [period, endingSoon, noActivePayment, lowAttendanceGroups, deadGroups, reserveDemand, curr.byGroupAttendance, health, weak, works]);

  const targetCards = [
    { key: "revenue", label: "Виручка", actual: curr.revenue, target: targets.revenueTarget, unit: "₴", cmp: cmpLabel(curr.revenue, prevData.revenue) },
    { key: "attendance", label: "Відвідуваність", actual: curr.attendance, target: targets.attendanceTarget, unit: "", cmp: cmpLabel(curr.attendance, prevData.attendance) },
    { key: "active", label: "Активні учениці", actual: curr.activeStudents, target: targets.activeStudentsTarget, unit: "", cmp: cmpLabel(curr.activeStudents, prevData.activeStudents) },
    { key: "recruit", label: "Набір / оплати", actual: curr.payments, target: targets.recruitmentTarget, unit: "", cmp: cmpLabel(curr.payments, prevData.payments) },
  ];

  return <div className="dashboard-tab" style={{ display: "grid", gap: 14 }}>
    <style>{`
      .dashboard-tab, .dashboard-tab * { box-sizing: border-box; min-width: 0; }
      .dashboard-mobile-header, .dashboard-signals-mobile { display: none; }
      .dashboard-chart-scroll { width: 100%; max-width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .dashboard-chart-card svg { min-width: 0; display: block; }
      .dashboard-compact-row { gap: 10px; align-items: center; }
      .dashboard-compact-row span { overflow: hidden; text-overflow: ellipsis; }
      @media (max-width: 768px) {
        .dashboard-tab { gap: 10px !important; width: 100%; max-width: 100%; overflow-x: hidden; padding-bottom: calc(18px + env(safe-area-inset-bottom, 0px)); }
        .dashboard-mobile-header { display: grid; gap: 8px; position: sticky; top: 0; z-index: 5; margin: -4px -2px 0; padding: max(8px, env(safe-area-inset-top, 0px)) 2px 8px; background: ${theme.bg}; }
        .dashboard-mobile-title-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .dashboard-mobile-title-row h2 { margin: 0; font-size: 22px; line-height: 1.1; }
        .dashboard-period-card { order: 1; padding: 10px !important; gap: 8px !important; overflow: hidden; }
        .dashboard-period-card button { min-height: 44px; flex: 1 1 calc(33.333% - 8px); padding: 8px 10px !important; }
        .dashboard-period-card input { min-height: 44px; width: 100%; flex: 1 1 140px; }
        .dashboard-period-label { width: 100%; margin-left: 0 !important; }
        .dashboard-targets-grid { order: 2; grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 8px !important; }
        .dashboard-target-card { grid-template-columns: 1fr !important; align-content: start; min-height: 108px; gap: 3px !important; padding: 7px !important; }
        .dashboard-ring { justify-items: start !important; gap: 1px !important; }
        .dashboard-ring svg { width: 42px; height: 42px; }
        .dashboard-ring div { font-size: 9.5px !important; line-height: 1.05; }
        .dashboard-target-title { font-size: 10.5px !important; line-height: 1.1; }
        .dashboard-target-value { font-size: 20px !important; line-height: 1.05; margin-top: 1px; }
        .dashboard-target-plan { font-size: 10.5px !important; line-height: 1.15; }
        .dashboard-target-delta { font-size: 9.5px !important; line-height: 1.15; }
        .dashboard-target-card input { width: 100% !important; min-height: 34px; height: 34px; margin-top: 3px !important; padding: 4px 8px; }
        .dashboard-alerts-grid { order: 3; grid-template-columns: 1fr !important; gap: 0 !important; overflow: hidden; border: 1px solid ${theme.border}; border-radius: 18px; background: ${theme.card}; }
        .dashboard-alert-card { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "title value" "desc chip"; gap: 2px 10px; align-items: center; min-height: 68px; padding: 9px 11px !important; border: 0 !important; border-bottom: 1px solid ${theme.border} !important; border-radius: 0 !important; box-shadow: none !important; }
        .dashboard-alert-card:last-child { border-bottom: 0 !important; }
        .dashboard-alert-title { grid-area: title; font-size: 12px !important; line-height: 1.15; font-weight: 800; color: ${theme.textMain} !important; }
        .dashboard-alert-value { grid-area: value; font-size: 21px !important; line-height: 1; justify-self: end; }
        .dashboard-alert-desc { grid-area: desc; font-size: 10.5px !important; line-height: 1.2; }
        .dashboard-alert-chip { grid-area: chip; justify-self: end; padding: 2px 7px !important; font-size: 10px !important; line-height: 1.1; }
        .dashboard-finance-card { order: 4; padding: 12px !important; }
        .dashboard-finance-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        .dashboard-finance-grid input { width: 100%; min-height: 40px; }
        .dashboard-signals-grid { display: none !important; }
        .dashboard-signals-mobile { display: grid; order: 5; gap: 8px; }
        .dashboard-mobile-accordion { padding: 0 !important; overflow: hidden; }
        .dashboard-mobile-accordion-head { width: 100%; min-height: 58px; border: 0; background: transparent; color: ${theme.textMain}; display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 12px; text-align: left; }
        .dashboard-mobile-accordion-head span:first-child { display: grid; gap: 2px; }
        .dashboard-mobile-accordion-head small { color: ${theme.textMuted}; font-size: 11px; line-height: 1.2; }
        .dashboard-mobile-chevron { width: 26px; height: 26px; display: grid; place-items: center; border-radius: 999px; background: rgba(168, 177, 206, 0.14); color: ${theme.textMuted}; transition: transform 0.16s ease; flex: 0 0 auto; }
        .dashboard-mobile-chevron--open { transform: rotate(180deg); }
        .dashboard-mobile-accordion-body { padding: 0 12px 12px; }
        .dashboard-mobile-accordion-body ul { margin: 8px 0 0 18px; padding: 0; }
        .dashboard-trends-grid { order: 6; grid-template-columns: 1fr !important; gap: 8px !important; }
        .dashboard-ranks-grid, .dashboard-average-grid { order: 7; grid-template-columns: 1fr !important; gap: 8px !important; }
        .dashboard-ai-section { order: 8; }
        .dashboard-card { padding: 12px !important; }
        .dashboard-chart-card { max-width: 100%; }
        .dashboard-chart-scroll svg { min-width: 320px; height: 150px; }
        .dashboard-list-card { overflow: hidden; }
        .dashboard-compact-row { padding: 7px 0; border-bottom: 1px solid ${theme.border}; }
      }
    `}</style>
    <div className="dashboard-mobile-header">
      <div className="dashboard-mobile-title-row"><h2>Dashboard</h2><span style={{ fontSize: 12, color: theme.textLight }}>{fmtShort(period.start)}–{fmtShort(period.end)}</span></div>
    </div>
    <div className="dashboard-ai-section">{isAdmin && (
      <GlobalAIAssistant
        isAdmin={isAdmin}
        students={students}
        groups={groups}
        studentGrps={studentGrps}
        subs={subs}
        attn={attn}
        waitlist={waitlist}
        trialBookings={trialBookings}
        trainers={trainers}
        trainerGroups={trainerGroups}
        directionsList={directionsList}
        cancelled={cancelled}
        roomBookings={roomBookings}
        groupLessonOverrides={groupLessonOverrides}
        analytics={aiInsightsContext.analytics}
        proAnalytics={aiInsightsContext.proAnalytics}
        paymentAnomalies={aiInsightsContext.paymentAnomalies}
        dashboard={aiDashboardContext}
      />
    )}
    {isAdmin && (
      <AIInsightsPanel
        isAdmin={isAdmin}
        context={{
          ...aiInsightsContext,
          dashboard: aiDashboardContext,
          waitlist,
          groups,
        }}
      />
    )}</div>
    <div className="dashboard-finance-card dashboard-card" style={{ ...cardSt, border: `1px solid ${theme.border}` }}>
      <b>Фінансова картина студії</b>
      <div className="dashboard-finance-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8, marginTop: 8 }}>
        <div><div style={{fontSize:12,color:theme.textMuted}}>Брутто дохід</div><div style={{fontWeight:800}}>{grossRevenue.toLocaleString()} ₴</div></div>
        <div><div style={{fontSize:12,color:theme.textMuted}}>ЗП тренерів</div><div style={{fontWeight:800}}>{trainerSalaryTotal.toLocaleString()} ₴</div></div>
        <div><div style={{fontSize:12,color:theme.textMuted}}>Операційні витрати</div><input type="number" value={financeOverrides.operationalExpenses} onChange={(e)=>setFinanceOverrides((p)=>({...p,operationalExpenses:Number(e.target.value||0)}))} /></div>
        <div><div style={{fontSize:12,color:theme.textMuted}}>ЗП Влад</div><input type="number" value={financeOverrides.ownerSalaryVlad} onChange={(e)=>setFinanceOverrides((p)=>({...p,ownerSalaryVlad:Number(e.target.value||0)}))} /></div>
        <div><div style={{fontSize:12,color:theme.textMuted}}>ЗП Костя</div><input type="number" value={financeOverrides.ownerSalaryKostia} onChange={(e)=>setFinanceOverrides((p)=>({...p,ownerSalaryKostia:Number(e.target.value||0)}))} /></div>
        <div><div style={{fontSize:12,color:theme.textMuted}}>Інші витрати</div><input type="number" value={financeOverrides.otherExpenses} onChange={(e)=>setFinanceOverrides((p)=>({...p,otherExpenses:Number(e.target.value||0)}))} /></div>
        <div><div style={{fontSize:12,color:theme.textMuted}}>Нетто прибуток</div><div style={{fontWeight:800,color:netProfit>=0?theme.success:theme.danger}}>{netProfit.toLocaleString()} ₴</div></div>
      </div>
    </div>
    <div className="dashboard-period-card" style={{ ...cardSt, border: `1px solid ${theme.border}`, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <button onClick={() => setMode("this_month")} style={{ ...cardSt, padding: "8px 12px", background: mode === "this_month" ? theme.primary : theme.card, color: mode === "this_month" ? "#fff" : theme.textMain }}>Цей місяць</button>
      <button onClick={() => setMode("last_month")} style={{ ...cardSt, padding: "8px 12px", background: mode === "last_month" ? theme.primary : theme.card, color: mode === "last_month" ? "#fff" : theme.textMain }}>Минулий місяць</button>
      <button onClick={() => setMode("custom")} style={{ ...cardSt, padding: "8px 12px", background: mode === "custom" ? theme.primary : theme.card, color: mode === "custom" ? "#fff" : theme.textMain }}>Custom</button>
      {mode === "custom" && <><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></>}
      <div className="dashboard-period-label" style={{ marginLeft: "auto", fontSize: 12, color: theme.textLight }}>Період: {fmtShort(period.start)}–{fmtShort(period.end)} · Порівняння: попередній такий самий період</div>
    </div>

    <div className="dashboard-targets-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12 }}>{targetCards.map((c) => { const key = c.key === "active" ? "activeStudents" : c.key === "recruit" ? "recruitment" : c.key; const pc = c.target > 0 ? Math.round((c.actual / c.target) * 100) : 0; return <div className="dashboard-target-card dashboard-card" key={c.key} style={{ ...cardSt, border: `1px solid ${theme.border}`, display: "grid", gridTemplateColumns: "auto 1fr", gap: 10 }}><Ring value={pc} label={rank(pc)} /><div><div className="dashboard-target-title" style={{ fontSize: 12, color: theme.textMuted }}>{c.label}</div><div className="dashboard-target-value" style={{ fontSize: 24, fontWeight: 800 }}>{c.actual.toLocaleString()}{c.unit}</div><div className="dashboard-target-plan" style={{ fontSize: 12, color: theme.textLight }}>План: {Number(c.target || 0).toLocaleString()}{c.unit}</div><div className="dashboard-target-delta" style={{ fontSize: 11, color: theme.textLight }}>{c.cmp}</div><input type="number" value={targets[`${key}Target`] || 0} onChange={(e) => setTargets((p) => ({ ...p, [`${key}Target`]: Number(e.target.value || 0) }))} style={{ marginTop: 6, width: 150 }} /></div></div>; })}</div>

    <div className="dashboard-trends-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <TrendLine title="Тренд виручки" rows={curr.revenueTrend} color={theme.success} deltaLabel={cmpLabel(curr.revenue, prevData.revenue)} />
      <TrendLine title="Тренд відвідуваності" rows={curr.attendanceTrend} color={theme.primary} deltaLabel={cmpLabel(curr.attendance, prevData.attendance)} />
    </div>

    <div className="dashboard-ranks-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }}>
      <RankList title="Топ 5 груп за виручкою" rows={curr.byGroupRevenue.filter((x) => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 5)} unit="₴" />
      <RankList title="Топ 5 груп за відвідуваністю" rows={curr.byGroupAttendance.filter((x) => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 5)} />
      <RankList title="Топ 5 напрямків за виручкою" rows={curr.byDirRevenue.filter((x) => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 5)} unit="₴" />
    </div>

    <div className="dashboard-average-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <RankList title="Топ 5 груп за сер. відвідуваністю" rows={curr.byGroupAttendance.filter((g) => g.held >= 2).map((g) => ({ id: g.id, name: g.name, value: Number((g.value / g.held).toFixed(2)) })).sort((a, b) => b.value - a.value).slice(0, 5)} />
      <RankList title="Bottom 5 (сер. відвідуваність, held>=2)" rows={curr.byGroupAttendance.filter((g) => g.held >= 2).map((g) => ({ id: g.id, name: g.name, value: Number((g.value / g.held).toFixed(2)) })).sort((a, b) => a.value - b.value).slice(0, 5)} />
    </div>

    <div className="dashboard-signals-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
      <div className="dashboard-card" style={{ ...cardSt, border: `1px solid ${theme.border}` }}><b>Що працює</b><ul>{works.slice(0, 5).length ? works.slice(0, 5).map((x, i) => <li key={i}>{x}</li>) : <li>немає достатньо даних</li>}</ul></div>
      <div className="dashboard-card" style={{ ...cardSt, border: `1px solid ${theme.border}` }}><b>Що просідає</b><ul>{weak.slice(0, 5).length ? weak.slice(0, 5).map((x, i) => <li key={i}>{x}</li>) : <li>немає критичних просідань</li>}</ul></div>
      <div className="dashboard-card" style={{ ...cardSt, border: `1px solid ${theme.border}` }}><b>Групи під ризиком</b><div style={{ display: "grid", gap: 6, marginTop: 8 }}>{health.slice(-5).map((h) => <div key={h.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span>{h.name}</span><b style={{ color: h.value < 45 ? theme.danger : h.value < 70 ? theme.warning : theme.success }}>{h.value} · {h.bucket}</b></div>)}</div></div>
    </div>

    <div className="dashboard-signals-mobile">
      <MobileAccordionCard title="Що працює" summary={`${works.slice(0, 5).length || 0} пунктів`} open={mobileSignalOpen.works} onToggle={() => setMobileSignalOpen((p) => ({ ...p, works: !p.works }))}>
        <ul>{works.slice(0, 5).length ? works.slice(0, 5).map((x, i) => <li key={i}>{x}</li>) : <li>немає достатньо даних</li>}</ul>
      </MobileAccordionCard>
      <MobileAccordionCard title="Що просідає" summary={`${weak.slice(0, 5).length || 0} сигналів`} open={mobileSignalOpen.weak} onToggle={() => setMobileSignalOpen((p) => ({ ...p, weak: !p.weak }))}>
        <ul>{weak.slice(0, 5).length ? weak.slice(0, 5).map((x, i) => <li key={i}>{x}</li>) : <li>немає критичних просідань</li>}</ul>
      </MobileAccordionCard>
      <MobileAccordionCard title="Групи під ризиком" summary={`${health.slice(-5).length || 0} груп`} open={mobileSignalOpen.risk} onToggle={() => setMobileSignalOpen((p) => ({ ...p, risk: !p.risk }))}>
        <div style={{ display: "grid", gap: 6, marginTop: 8 }}>{health.slice(-5).map((h) => <div key={h.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span>{h.name}</span><b style={{ color: h.value < 45 ? theme.danger : h.value < 70 ? theme.warning : theme.success }}>{h.value} · {h.bucket}</b></div>)}</div>
      </MobileAccordionCard>
    </div>

    <div className="dashboard-alerts-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 10 }}>
      {[{ t: "Ending soon", v: endingSoon, d: "абонементи до 7 днів" }, { t: "No active payment", v: noActivePayment, d: "актуальні учениці без активної оплати" }, { t: "Low attendance groups", v: lowAttendanceGroups, d: "avg<4, held>=2" }, { t: "Reserve demand", v: reserveDemand, d: "групи з очікуванням" }, { t: "Potential dead groups", v: deadGroups, d: "без відвідувань у періоді" }].map((r) => <div className="dashboard-alert-card" key={r.t} style={{ ...cardSt, border: `1px solid ${theme.border}`, padding: 12 }}><div className="dashboard-alert-title" style={{ fontSize: 11, color: theme.textMuted }}>{r.t}</div><div className="dashboard-alert-value" style={{ fontSize: 24, fontWeight: 800 }}>{r.v}</div><div className="dashboard-alert-desc" style={{ fontSize: 11, color: theme.textLight }}>{r.d}</div><span className="dashboard-alert-chip" style={{ borderRadius: 999, padding: "3px 8px", fontSize: 11, fontWeight: 800, background: r.v > 0 ? "rgba(239, 68, 68, 0.12)" : "rgba(34, 197, 94, 0.12)", color: r.v > 0 ? theme.danger : theme.success }}>{r.v > 0 ? "увага" : "ok"}</span></div>)}
    </div>
  </div>;
}
