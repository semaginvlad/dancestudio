import React, { useEffect, useMemo, useState } from "react";
import * as db from "../db";
import { buildAnalyticsFoundation, getAttendanceEffectiveType, getTrainerAnalyticsCard } from "../shared/analytics";

const theme = {
  bg: "#0f131a",
  panel: "#171d27",
  panelSoft: "#1e2633",
  border: "#2b3546",
  text: "#e7eefc",
  textSoft: "#9fb0ca",
  primary: "#ff6f61",
  secondary: "#4d7cff",
  good: "#25b87a",
  warn: "#f59f3a",
  bad: "#ea5455",
};

const card = {
  border: `1px solid ${theme.border}`,
  borderRadius: 18,
  background: theme.panel,
  boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
};

const tile = {
  ...card,
  padding: 14,
  cursor: "pointer",
  textAlign: "left",
};

const PAID_PACKS = new Set(["4pack", "8pack", "12pack"]);

const monthStart = (d) => new Date(d.getFullYear(), d.getMonth(), 1, 12);
const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthLabel = (d) => d.toLocaleDateString("uk-UA", { month: "long", year: "numeric" });
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const inRange = (dateStr, start, end) => !!dateStr && dateStr >= start && dateStr <= end;
const pct = (v, total) => (total > 0 ? Math.round((v / total) * 100) : 0);
const getSubRefDate = (s) => s.startDate || String(s.created_at || "").slice(0, 10);
const getRawAttendanceType = (a) => a.entryType || a.guestType || "subscription";

const Delta = ({ value = 0 }) => (
  <span style={{
    fontSize: 11,
    fontWeight: 700,
    color: value >= 0 ? theme.good : theme.bad,
    background: value >= 0 ? "rgba(37,184,122,0.15)" : "rgba(234,84,85,0.15)",
    borderRadius: 999,
    padding: "3px 8px",
  }}>
    {value >= 0 ? "+" : ""}{value}
  </span>
);

const DetailMetric = ({ label, value, tone = theme.text }) => (
  <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "10px 12px", background: theme.panelSoft }}>
    <div style={{ fontSize: 11, color: theme.textSoft }}>{label}</div>
    <div style={{ fontSize: 21, fontWeight: 800, color: tone }}>{value}</div>
  </div>
);

function ProgressRing({ value = 0, label, sublabel, color = theme.secondary, onClick }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const safe = Math.max(0, Math.min(100, value));
  const dash = `${(safe / 100) * circumference} ${circumference}`;

  return (
    <button type="button" onClick={onClick} style={{ ...tile, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <svg width="84" height="84" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} stroke="#273143" strokeWidth="10" fill="none" />
          <circle
            cx="50"
            cy="50"
            r={radius}
            stroke={color}
            strokeWidth="10"
            fill="none"
            strokeDasharray={dash}
            transform="rotate(-90 50 50)"
            strokeLinecap="round"
          />
          <text x="50" y="55" textAnchor="middle" fontSize="16" fontWeight="800" fill={theme.text}>{safe}%</text>
        </svg>
        <div>
          <div style={{ fontSize: 12, color: theme.textSoft }}>{label}</div>
          <div style={{ fontSize: 12, color: "#7f93b2", marginTop: 2 }}>{sublabel}</div>
        </div>
      </div>
    </button>
  );
}

function parseScheduleDays(schedule) {
  if (!Array.isArray(schedule)) return [];
  return schedule
    .map((s) => Number(s?.day))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
}

function countHeldSessions(group, start, end, cancelledSet) {
  const days = parseScheduleDays(group?.schedule);
  if (!days.length) return 0;
  const d = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  let count = 0;
  while (d <= endDate) {
    const iso = toISO(d);
    if (days.includes(d.getDay()) && !cancelledSet.has(`${group.id}:${iso}`)) count += 1;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

export default function TrainersTab({
  trainers = [],
  setTrainers,
  trainerGroups = [],
  setTrainerGroups,
  groups = [],
  students = [],
  studentGrps = [],
  subs = [],
  attn = [],
  cancelled = [],
}) {
  const [selectedTrainerId, setSelectedTrainerId] = useState(trainers[0]?.id || "");
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [draft, setDraft] = useState({ firstName: "", lastName: "", phone: "", telegram: "", instagramHandle: "", notes: "", isActive: true });
  const [saving, setSaving] = useState(false);
  const [periodDate, setPeriodDate] = useState(monthStart(new Date()));
  const [detailState, setDetailState] = useState({ type: "overview", title: "Огляд", payload: null });

  const selectedTrainer = useMemo(() => trainers.find((t) => t.id === selectedTrainerId) || null, [trainers, selectedTrainerId]);

  const normalizeInstagramHandle = (raw = "") => {
    const value = String(raw || "").trim();
    if (!value) return "";
    const noAt = value.replace(/^@+/, "");
    const urlMatch = noAt.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
    if (urlMatch?.[1]) return urlMatch[1].replace(/^@+/, "");
    const slashMatch = noAt.match(/^https?:\/\/[^/]+\/([A-Za-z0-9._]+)/i);
    if (slashMatch?.[1]) return slashMatch[1].replace(/^@+/, "");
    return noAt.split(/[/?#]/)[0].replace(/^@+/, "");
  };

  const getTrainerDisplayName = (t) => {
    if (!t) return "Без імені";
    const name = [t.firstName || "", t.lastName || ""].filter(Boolean).join(" ").trim();
    return name || t.name || "Без імені";
  };

  useEffect(() => {
    if (!isCreateMode && !selectedTrainerId && trainers[0]?.id) {
      setSelectedTrainerId(trainers[0].id);
      setDraft({
        firstName: trainers[0].firstName || "",
        lastName: trainers[0].lastName || "",
        phone: trainers[0].phone || "",
        telegram: trainers[0].telegram || "",
        instagramHandle: trainers[0].instagramHandle || "",
        notes: trainers[0].notes || "",
        isActive: trainers[0].isActive !== false,
      });
    }
  }, [isCreateMode, selectedTrainerId, trainers]);

  useEffect(() => {
    setDetailState({ type: "overview", title: "Огляд", payload: null });
  }, [selectedTrainerId, periodDate]);

  const trainerGroupIds = useMemo(
    () => trainerGroups.filter((tg) => tg.trainerId === selectedTrainerId).map((tg) => tg.groupId),
    [trainerGroups, selectedTrainerId],
  );

  const trainerGroupSet = useMemo(() => new Set(trainerGroupIds.map(String)), [trainerGroupIds]);
  const trainerBoundGroups = useMemo(() => groups.filter((g) => trainerGroupSet.has(String(g.id))), [groups, trainerGroupSet]);
  const cancelledSet = useMemo(
    () => new Set((cancelled || []).map((c) => `${c.groupId}:${c.date}`)),
    [cancelled],
  );

  const scopedData = useMemo(() => {
    const scopedStudentGrps = studentGrps.filter((sg) => trainerGroupSet.has(String(sg.groupId)));
    const scopedStudentIdSet = new Set(scopedStudentGrps.map((sg) => String(sg.studentId)));
    const scopedStudents = students.filter((s) => scopedStudentIdSet.has(String(s.id)));
    const scopedSubs = subs.filter((s) => trainerGroupSet.has(String(s.groupId)));
    const scopedAttn = attn.filter((a) => trainerGroupSet.has(String(a.groupId)));
    const scopedTrainer = selectedTrainer ? [selectedTrainer] : [];
    const scopedTrainerGroups = trainerGroups.filter((tg) => String(tg.trainerId) === String(selectedTrainerId));

    return {
      scopedStudents,
      scopedStudentGrps,
      scopedSubs,
      scopedAttn,
      scopedTrainer,
      scopedTrainerGroups,
    };
  }, [attn, selectedTrainer, selectedTrainerId, studentGrps, students, subs, trainerGroupSet, trainerGroups]);

  const foundationCurrent = useMemo(() => buildAnalyticsFoundation({
    students: scopedData.scopedStudents,
    groups: trainerBoundGroups,
    studentGrps: scopedData.scopedStudentGrps,
    subs: scopedData.scopedSubs,
    attn: scopedData.scopedAttn,
    trainers: scopedData.scopedTrainer,
    trainerGroups: scopedData.scopedTrainerGroups,
    periodType: "month",
    anchorDate: periodDate,
  }), [periodDate, scopedData, trainerBoundGroups]);

  const foundationPrev = useMemo(() => {
    const d = monthStart(new Date(periodDate.getFullYear(), periodDate.getMonth() - 1, 1));
    return buildAnalyticsFoundation({
      students: scopedData.scopedStudents,
      groups: trainerBoundGroups,
      studentGrps: scopedData.scopedStudentGrps,
      subs: scopedData.scopedSubs,
      attn: scopedData.scopedAttn,
      trainers: scopedData.scopedTrainer,
      trainerGroups: scopedData.scopedTrainerGroups,
      periodType: "month",
      anchorDate: d,
    });
  }, [periodDate, scopedData, trainerBoundGroups]);

  const trainerCard = useMemo(() => getTrainerAnalyticsCard(foundationCurrent, selectedTrainerId), [foundationCurrent, selectedTrainerId]);
  const trainerCardPrev = useMemo(() => getTrainerAnalyticsCard(foundationPrev, selectedTrainerId), [foundationPrev, selectedTrainerId]);

  const range = foundationCurrent.period;
  const rangePrev = foundationPrev.period;

  const groupCards = useMemo(() => trainerBoundGroups.map((g) => {
    const groupStudentIds = new Set(
      studentGrps.filter((sg) => String(sg.groupId) === String(g.id)).map((sg) => String(sg.studentId)),
    );
    const groupStudents = groupStudentIds.size;
    const groupActiveSubs = subs.filter((s) => String(s.groupId) === String(g.id) && s.status !== "expired").length;
    const groupAttnRows = attn.filter((a) => String(a.groupId) === String(g.id) && inRange(a.date, range.start, range.end));
    const groupAttnCount = groupAttnRows.reduce((sum, row) => sum + (row.quantity || 1), 0);
    const heldSessions = countHeldSessions(g, range.start, range.end, cancelledSet);
    const avgAttendancePerSession = heldSessions > 0 ? Number((groupAttnCount / heldSessions).toFixed(2)) : 0;
    const problemNoActive = Array.from(groupStudentIds).filter((studentId) => !subs.some((s) => String(s.groupId) === String(g.id) && String(s.studentId) === studentId && s.status !== "expired")).length;

    const trialCount = groupAttnRows.filter((a) => getAttendanceEffectiveType(a, subs) === "trial").length;
    const singleCount = groupAttnRows.filter((a) => getAttendanceEffectiveType(a, subs) === "single").length;
    const paidCount = groupAttnRows.filter((a) => getAttendanceEffectiveType(a, subs) === "subscription").length;

    return {
      groupId: g.id,
      groupName: g.name,
      students: groupStudents,
      activeSubs: groupActiveSubs,
      attendance: groupAttnCount,
      heldSessions,
      avgAttendancePerSession,
      noActive: problemNoActive,
      fillPct: pct(groupActiveSubs, Math.max(groupStudents, 1)),
      trialCount,
      singleCount,
      paidCount,
    };
  }), [attn, cancelledSet, range.end, range.start, studentGrps, subs, trainerBoundGroups]);

  const trainerAggregateAvg = useMemo(() => {
    const totalAttendance = groupCards.reduce((s, g) => s + g.attendance, 0);
    const totalSessions = groupCards.reduce((s, g) => s + g.heldSessions, 0);
    return totalSessions > 0 ? Number((totalAttendance / totalSessions).toFixed(2)) : 0;
  }, [groupCards]);

  const trainerKpis = useMemo(() => {
    const studentsCount = trainerCard?.studentCount || 0;
    const studentsPrev = trainerCardPrev?.studentCount || 0;
    const activeSubs = trainerCard?.activeSubscriptions || 0;
    const activeSubsPrev = trainerCardPrev?.activeSubscriptions || 0;
    const newSubs = foundationCurrent.metrics.newSubscriptions || 0;
    const newSubsPrev = foundationPrev.metrics.newSubscriptions || 0;
    const renewals = foundationCurrent.metrics.renewals || 0;
    const renewalsPrev = foundationPrev.metrics.renewals || 0;
    const trials = trainerCard?.trialCount || 0;
    const trialsPrev = trainerCardPrev?.trialCount || 0;
    const singles = trainerCard?.singleCount || 0;
    const singlesPrev = trainerCardPrev?.singleCount || 0;

    return [
      { id: "students", title: "Учениць", value: studentsCount, delta: studentsCount - studentsPrev, color: theme.secondary },
      { id: "activeSubs", title: "Активні абонементи", value: activeSubs, delta: activeSubs - activeSubsPrev, color: theme.good },
      { id: "newSubs", title: "Нові абонементи", value: newSubs, delta: newSubs - newSubsPrev, color: theme.primary },
      { id: "renewals", title: "Продовження", value: renewals, delta: renewals - renewalsPrev, color: theme.warn },
      { id: "trials", title: "Пробні", value: trials, delta: trials - trialsPrev, color: "#8b7bff" },
      { id: "singles", title: "Разові", value: singles, delta: singles - singlesPrev, color: "#51c4d3" },
      { id: "avgSession", title: "Сер. відвідуваність/заняття", value: trainerAggregateAvg, delta: Number((trainerAggregateAvg - (foundationPrev.domains.attendance.count / Math.max(1, groupCards.reduce((s, g) => s + g.heldSessions, 0)))).toFixed(2)), color: theme.secondary },
    ];
  }, [foundationCurrent, foundationPrev, groupCards, trainerAggregateAvg, trainerCard, trainerCardPrev]);

  const trialMetricBreakdown = useMemo(() => {
    const periodRows = scopedData.scopedAttn.filter((a) => inRange(a.date, range.start, range.end));
    const rawTrialRows = periodRows.filter((a) => getRawAttendanceType(a) === "trial");
    const coveredBySubscriptionRows = rawTrialRows.filter((a) => getAttendanceEffectiveType(a, scopedData.scopedSubs) === "subscription");
    const realTrialRows = rawTrialRows.filter((a) => getAttendanceEffectiveType(a, scopedData.scopedSubs) === "trial");
    return {
      rawTrial: rawTrialRows.length,
      coveredBySubscription: coveredBySubscriptionRows.length,
      realTrial: realTrialRows.length,
    };
  }, [range.end, range.start, scopedData.scopedAttn, scopedData.scopedSubs]);

  const trendCurrent = foundationCurrent.domains.attendance.line;
  const prevLineMap = useMemo(() => {
    const rows = foundationPrev.domains.attendance.line || [];
    return Object.fromEntries(rows.map((r) => [r.x, r.y]));
  }, [foundationPrev.domains.attendance.line]);

  const monthBreakdown = useMemo(() => {
    const trialVal = foundationCurrent.domains.subscriptions.byPlan.find((x) => x.plan === "trial")?.value || 0;
    const singleVal = foundationCurrent.domains.subscriptions.byPlan.find((x) => x.plan === "single")?.value || 0;
    const paidVal = (foundationCurrent.metrics.newSubscriptions || 0) + (foundationCurrent.metrics.renewals || 0);
    return [
      { key: "trial", label: "Пробні", value: trialVal, color: "#8b7bff" },
      { key: "single", label: "Разові", value: singleVal, color: "#51c4d3" },
      { key: "paid", label: "Оплачені", value: paidVal, color: theme.good },
    ];
  }, [foundationCurrent]);

  const renewalsRiskBlock = useMemo(() => {
    const renewals = foundationCurrent.metrics.renewals || 0;
    const expired = scopedData.scopedSubs.filter((s) => s.endDate && inRange(s.endDate, range.start, range.end)).length;
    const noRenewal = scopedData.scopedSubs.filter((s) => PAID_PACKS.has(s.planType) && s.endDate && inRange(s.endDate, range.start, range.end) && !scopedData.scopedSubs.some((n) => PAID_PACKS.has(n.planType) && String(n.studentId) === String(s.studentId) && getSubRefDate(n) > s.endDate)).length;
    return { renewals, expired, noRenewal };
  }, [foundationCurrent.metrics.renewals, range.end, range.start, scopedData.scopedSubs]);

  const insights = useMemo(() => {
    if (!groupCards.length) return [];
    const strongest = [...groupCards].sort((a, b) => b.avgAttendancePerSession - a.avgAttendancePerSession)[0];
    const weak = [...groupCards].sort((a, b) => a.avgAttendancePerSession - b.avgAttendancePerSession)[0];

    const renewalsNow = foundationCurrent.metrics.renewals || 0;
    const renewalsPrev = foundationPrev.metrics.renewals || 0;

    const trialStudentsThisMonth = new Set(
      scopedData.scopedAttn
        .filter((a) => inRange(a.date, range.start, range.end) && getAttendanceEffectiveType(a, scopedData.scopedSubs) === "trial" && a.studentId)
        .map((a) => String(a.studentId)),
    );
    const trialNotConverted = Array.from(trialStudentsThisMonth).filter((studentId) => !scopedData.scopedSubs.some((s) => (
      PAID_PACKS.has(s.planType) && String(s.studentId) === studentId && getSubRefDate(s) >= range.start
    ))).length;

    return [
      { id: "strongest", title: "Найсильніша група", value: strongest?.groupName || "—", note: `${strongest?.avgAttendancePerSession || 0} осіб/заняття` },
      { id: "weak", title: "Слабка група", value: weak?.groupName || "—", note: `${weak?.avgAttendancePerSession || 0} осіб/заняття` },
      { id: "renewalsRisk", title: "Динаміка продовжень", value: renewalsNow - renewalsPrev, note: `Було ${renewalsPrev}, стало ${renewalsNow}` },
      { id: "expiredNoRenewal", title: "Expired без продовження", value: renewalsRiskBlock.noRenewal, note: "Поточний місяць" },
      { id: "trialNoConv", title: "Пробні без конверсії", value: trialNotConverted, note: "Поточний місяць" },
    ];
  }, [foundationCurrent.metrics.renewals, foundationPrev.metrics.renewals, groupCards, range.end, range.start, renewalsRiskBlock.noRenewal, scopedData.scopedAttn, scopedData.scopedSubs]);

  const beginCreate = () => {
    setIsCreateMode(true);
    setSelectedTrainerId("");
    setDraft({ firstName: "", lastName: "", phone: "", telegram: "", instagramHandle: "", notes: "", isActive: true });
  };

  const beginEdit = () => {
    if (!selectedTrainer) return;
    setIsCreateMode(false);
    setDraft({
      firstName: selectedTrainer.firstName || "",
      lastName: selectedTrainer.lastName || "",
      phone: selectedTrainer.phone || "",
      telegram: selectedTrainer.telegram || "",
      instagramHandle: selectedTrainer.instagramHandle || "",
      notes: selectedTrainer.notes || "",
      isActive: selectedTrainer.isActive !== false,
    });
  };

  const saveTrainer = async () => {
    if (!draft.firstName.trim() && !draft.lastName.trim()) {
      alert("Вкажи ім'я або прізвище тренера");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...draft,
        instagramHandle: normalizeInstagramHandle(draft.instagramHandle),
      };
      if (selectedTrainer && !isCreateMode) {
        const updated = await db.updateTrainer(selectedTrainer.id, payload);
        setTrainers((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        setSelectedTrainerId(updated.id);
      } else {
        const created = await db.insertTrainer(payload);
        setTrainers((prev) => [created, ...prev]);
        setSelectedTrainerId(created.id);
      }
      setIsCreateMode(false);
    } catch (e) {
      alert(e?.message || "Не вдалося зберегти тренера");
    } finally {
      setSaving(false);
    }
  };

  const toggleGroup = async (groupId, checked) => {
    if (!selectedTrainerId) return;
    try {
      if (checked) {
        const row = await db.upsertTrainerGroup(selectedTrainerId, groupId);
        setTrainerGroups((prev) => {
          if (prev.some((x) => x.trainerId === row.trainerId && x.groupId === row.groupId)) return prev;
          return [...prev, row];
        });
      } else {
        await db.deleteTrainerGroup(selectedTrainerId, groupId);
        setTrainerGroups((prev) => prev.filter((x) => !(x.trainerId === selectedTrainerId && x.groupId === groupId)));
      }
    } catch (e) {
      alert(e?.message || "Не вдалося оновити прив'язку груп");
    }
  };

  const renderDetailBody = () => {
    if (detailState.type === "overview") return <div style={{ color: theme.textSoft, fontSize: 13 }}>Натисни будь-який блок з центральної колонки для деталізації.</div>;
    const p = detailState.payload || {};

    if (detailState.type === "kpi") {
      const prev = Number((p.value - p.delta).toFixed?.(2) || p.value - p.delta);
      return (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 12, color: theme.textSoft }}>Що це: {p.definition}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(90px,1fr))", gap: 8 }}>
            <DetailMetric label={`Поточний (${monthLabel(periodDate)})`} value={p.value} />
            <DetailMetric label={`Попередній (${monthLabel(monthStart(new Date(periodDate.getFullYear(), periodDate.getMonth() - 1, 1)))})`} value={prev} />
            <DetailMetric label="Зміна" value={`${p.delta >= 0 ? "+" : ""}${p.delta}`} tone={p.delta >= 0 ? theme.good : theme.bad} />
          </div>
          {p.id === "trials" ? (
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 10, display: "grid", gap: 6, fontSize: 12 }}>
              <div style={{ color: theme.text }}>Raw trial-відмітки: <strong>{p.breakdown?.rawTrial ?? 0}</strong></div>
              <div style={{ color: theme.text }}>З них покрито активним абонементом: <strong>{p.breakdown?.coveredBySubscription ?? 0}</strong></div>
              <div style={{ color: theme.text }}>Реальні пробні у KPI: <strong>{p.breakdown?.realTrial ?? 0}</strong></div>
              <div style={{ color: theme.textSoft }}>
                У цій аналітиці пробними вважаються лише ті відвідування, які на дату заняття не покривались активним абонементом.
                Тому число може бути меншим за raw trial-відмітки у таблиці відвідувань.
              </div>
            </div>
          ) : null}
          <div style={{ fontSize: 12, color: theme.textSoft }}>Інтерпретація: {p.interpretation}</div>
          <div style={{ fontSize: 12, color: theme.textSoft }}>Дія: {p.action}</div>
        </div>
      );
    }

    if (detailState.type === "ring") {
      return (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(90px,1fr))", gap: 8 }}>
            <DetailMetric label="Відсоток" value={`${p.percent}%`} />
            <DetailMetric label="Чисельник" value={p.numerator ?? "—"} />
            <DetailMetric label="Знаменник" value={p.denominator ?? "—"} />
          </div>
          <div style={{ fontSize: 12, color: theme.textSoft }}>Як рахується: {p.definition}</div>
          {p.note ? <div style={{ fontSize: 12, color: theme.textSoft }}>{p.note}</div> : null}
          <div style={{ fontSize: 12, color: theme.textSoft }}>Інтерпретація: {p.interpretation}</div>
          <div style={{ fontSize: 12, color: theme.textSoft }}>Дія: {p.action}</div>
        </div>
      );
    }

    if (detailState.type === "chart") {
      if (p.kind === "lineCompare") {
        const max = Math.max(...p.series.map((x) => Math.max(x.current, x.previous)), 1);
        return (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ fontSize: 12, color: theme.textSoft }}>Поточний vs попередній місяць (відвідуваність по днях)</div>
            <div style={{ border: `1px solid ${theme.border}`, borderRadius: 12, padding: 10, display: "flex", alignItems: "flex-end", gap: 3, height: 180 }}>
              {p.series.map((d) => (
                <div key={d.day} style={{ flex: 1 }}>
                  <div style={{ height: `${Math.max(3, (d.previous / max) * 140)}px`, background: "rgba(77,124,255,0.35)", borderRadius: 4 }} />
                  <div style={{ height: `${Math.max(3, (d.current / max) * 140)}px`, background: theme.primary, borderRadius: 4, marginTop: 2 }} />
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: theme.textSoft }}>Кораловий = поточний, синій = попередній.</div>
          </div>
        );
      }
      if (p.kind === "groupBars") {
        return (
          <div style={{ display: "grid", gap: 8 }}>
            {p.rows.map((r) => {
              const total = Math.max(1, r.trial + r.single + r.paid);
              return (
                <div key={r.groupId} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 8 }}>
                  <div style={{ fontSize: 12, color: theme.text }}>{r.groupName}</div>
                  <div style={{ display: "flex", height: 10, borderRadius: 999, overflow: "hidden", marginTop: 6 }}>
                    <div style={{ width: `${(r.trial / total) * 100}%`, background: "#8b7bff" }} />
                    <div style={{ width: `${(r.single / total) * 100}%`, background: "#51c4d3" }} />
                    <div style={{ width: `${(r.paid / total) * 100}%`, background: theme.good }} />
                  </div>
                  <div style={{ fontSize: 11, color: theme.textSoft, marginTop: 4 }}>Пробні {r.trial} · Разові {r.single} · Оплачені {r.paid}</div>
                </div>
              );
            })}
          </div>
        );
      }
      if (p.kind === "renewalRisk") {
        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
            <DetailMetric label="Продовження" value={p.renewals} tone={theme.good} />
            <DetailMetric label="Завершені" value={p.expired} tone={theme.warn} />
            <DetailMetric label="Без продовження" value={p.noRenewal} tone={theme.bad} />
          </div>
        );
      }
      if (p.kind === "funnel") {
        return (
          <div style={{ display: "grid", gap: 8 }}>
            {p.steps.map((s) => (
              <div key={s.key} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 8, display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: theme.textSoft }}>{s.label}</span>
                <strong style={{ color: theme.text }}>{s.value}</strong>
              </div>
            ))}
          </div>
        );
      }
    }

    if (detailState.type === "heatmap") {
      return (
        <div style={{ display: "grid", gap: 8 }}>
          {p.cells.map((c) => (
            <div key={c.weekday} style={{ display: "grid", gridTemplateColumns: "90px 1fr 40px", gap: 8, alignItems: "center" }}>
              <span style={{ color: theme.textSoft, fontSize: 12 }}>{c.label}</span>
              <div style={{ height: 9, borderRadius: 999, background: "#2a3446" }}>
                <div style={{ height: "100%", width: `${Math.min(100, c.value * 10)}%`, borderRadius: 999, background: theme.secondary }} />
              </div>
              <span style={{ color: theme.text, fontSize: 12, textAlign: "right" }}>{c.value}</span>
            </div>
          ))}
        </div>
      );
    }

    if (detailState.type === "group") {
      return (
        <div style={{ display: "grid", gap: 8 }}>
          <DetailMetric label="Учениць" value={p.students} />
          <DetailMetric label="Активні абон." value={p.activeSubs} />
          <DetailMetric label="Held sessions" value={p.heldSessions} />
          <DetailMetric label="Attendance total" value={p.attendance} />
          <DetailMetric label="Avg / session" value={p.avgAttendancePerSession} />
          <DetailMetric label="Без активного" value={p.noActive} tone={p.noActive > 0 ? theme.bad : theme.good} />
          <div style={{ color: theme.textSoft, fontSize: 12 }}>Як рахується average: total attendance marks / held sessions (schedule-based, cancelled excluded).</div>
        </div>
      );
    }

    if (detailState.type === "insight") {
      return (
        <div style={{ display: "grid", gap: 8 }}>
          <DetailMetric label="Trigger value" value={p.value} />
          <div style={{ color: theme.textSoft, fontSize: 12 }}>Причина: {p.note}</div>
          <div style={{ color: theme.textSoft, fontSize: 12 }}>Дія: {p.action || "Переглянути проблемні групи/учениць та зробити follow-up."}</div>
        </div>
      );
    }

    if (detailState.type === "communication") {
      return (
        <div style={{ display: "grid", gap: 8 }}>
          {Object.entries(p).map(([key, cfg]) => (
            <div key={key} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: 8 }}>
              <div style={{ color: theme.text, fontWeight: 700, fontSize: 13 }}>{key}</div>
              <div style={{ color: theme.textSoft, fontSize: 12 }}>Status: {cfg.status}</div>
              {Array.isArray(cfg.requiredFields) && <div style={{ color: "#8093b1", fontSize: 11 }}>Fields: {cfg.requiredFields.join(", ")}</div>}
            </div>
          ))}
        </div>
      );
    }

    return <div style={{ color: theme.textSoft, fontSize: 12 }}>Немає деталізації для цього блоку.</div>;
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(280px, 320px) minmax(0, 1fr) minmax(320px, 360px)",
        gap: 14,
        alignItems: "start",
        width: "100%",
        maxWidth: "100%",
        overflow: "hidden",
        color: theme.text,
        background: theme.bg,
        padding: 10,
        borderRadius: 16,
      }}
    >
      <aside style={{ ...card, padding: 12, display: "flex", flexDirection: "column", gap: 10, position: "sticky", top: 10, height: "fit-content" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, color: theme.text }}>Тренери</div>
          <button type="button" onClick={beginCreate} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, background: theme.panelSoft, color: theme.text, padding: "6px 9px", cursor: "pointer" }}>+ Додати</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflow: "auto", paddingRight: 2 }}>
          {trainers.map((t) => (
            <button key={t.id} type="button" onClick={() => { setIsCreateMode(false); setSelectedTrainerId(t.id); }} style={{ textAlign: "left", border: `1px solid ${selectedTrainerId === t.id && !isCreateMode ? theme.primary : theme.border}`, borderRadius: 12, background: selectedTrainerId === t.id && !isCreateMode ? "rgba(255,111,97,0.2)" : theme.panel, color: theme.text, padding: "9px 10px", cursor: "pointer" }}>
              <div style={{ fontWeight: 700 }}>{getTrainerDisplayName(t)}</div>
              <div style={{ fontSize: 11, color: t.isActive ? theme.good : theme.textSoft }}>{t.isActive ? "Активний" : "Неактивний"}</div>
            </button>
          ))}
        </div>

        <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>{isCreateMode ? "Новий тренер" : "Профіль"}</div>
          <div style={{ display: "grid", gap: 8 }}>
            <input value={draft.firstName} onChange={(e) => setDraft((p) => ({ ...p, firstName: e.target.value }))} placeholder="Ім'я" style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "9px 10px", background: theme.panelSoft, color: theme.text }} />
            <input value={draft.lastName} onChange={(e) => setDraft((p) => ({ ...p, lastName: e.target.value }))} placeholder="Прізвище" style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "9px 10px", background: theme.panelSoft, color: theme.text }} />
            <input value={draft.phone} onChange={(e) => setDraft((p) => ({ ...p, phone: e.target.value }))} placeholder="Телефон" style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "9px 10px", background: theme.panelSoft, color: theme.text }} />
            <input value={draft.telegram} onChange={(e) => setDraft((p) => ({ ...p, telegram: e.target.value }))} placeholder="Telegram" style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "9px 10px", background: theme.panelSoft, color: theme.text }} />
            <input value={draft.instagramHandle} onChange={(e) => setDraft((p) => ({ ...p, instagramHandle: e.target.value }))} placeholder="Instagram" style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "9px 10px", background: theme.panelSoft, color: theme.text }} />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.textSoft }}>
              <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft((p) => ({ ...p, isActive: e.target.checked }))} /> Активний
            </label>
            <textarea value={draft.notes} onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))} rows={3} placeholder="Нотатки" style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "9px 10px", resize: "vertical", background: theme.panelSoft, color: theme.text }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" disabled={saving} onClick={saveTrainer} style={{ border: "none", borderRadius: 10, background: theme.primary, color: "#fff", padding: "9px 14px", cursor: "pointer", fontWeight: 700, flex: 1 }}>{saving ? "Збереження..." : "Зберегти"}</button>
              {!isCreateMode && selectedTrainer && <button type="button" onClick={beginEdit} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, background: theme.panelSoft, color: theme.text, padding: "9px 12px", cursor: "pointer" }}>Ред.</button>}
            </div>
          </div>
        </div>

        {selectedTrainer && !isCreateMode && (
          <>
            <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {selectedTrainer.telegram && <a href={`https://t.me/${String(selectedTrainer.telegram).replace(/^@/, "")}`} target="_blank" rel="noreferrer" style={{ border: `1px solid ${theme.border}`, borderRadius: 9, padding: "6px 9px", textDecoration: "none", color: theme.secondary, fontSize: 12, fontWeight: 700 }}>Telegram</a>}
              {selectedTrainer.instagramHandle && <a href={`https://instagram.com/${normalizeInstagramHandle(selectedTrainer.instagramHandle)}`} target="_blank" rel="noreferrer" style={{ border: `1px solid ${theme.border}`, borderRadius: 9, padding: "6px 9px", textDecoration: "none", color: theme.primary, fontSize: 12, fontWeight: 700 }}>Instagram</a>}
              {selectedTrainer.phone && <a href={`tel:${selectedTrainer.phone}`} style={{ border: `1px solid ${theme.border}`, borderRadius: 9, padding: "6px 9px", textDecoration: "none", color: theme.good, fontSize: 12, fontWeight: 700 }}>Call</a>}
            </div>

            <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Прив'язані групи</div>
              <div style={{ display: "grid", gap: 6 }}>
                {groups.map((g) => (
                  <label key={g.id} style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${theme.border}`, borderRadius: 9, padding: "6px 8px", color: theme.textSoft }}>
                    <input type="checkbox" checked={trainerGroupIds.includes(g.id)} onChange={(e) => toggleGroup(g.id, e.target.checked)} />
                    <span style={{ fontSize: 12 }}>{g.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
      </aside>

      <section style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0, width: "100%", maxWidth: "100%", overflow: "hidden", boxSizing: "border-box" }}>
        <div style={{ ...card, padding: 16, background: "linear-gradient(180deg,#171d27 0%,#141922 100%)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{isCreateMode ? "Новий тренер" : getTrainerDisplayName(selectedTrainer)}</div>
              <div style={{ fontSize: 13, color: theme.textSoft, marginTop: 4 }}>
                Аналітика за календарний місяць · Мітка {monthKey(periodDate)} · Період {range.start} → {range.end}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button type="button" onClick={() => setPeriodDate((p) => monthStart(new Date(p.getFullYear(), p.getMonth() - 1, 1)))} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, background: theme.panelSoft, color: theme.text, padding: "8px 10px", cursor: "pointer" }}>◀</button>
              <div style={{ border: `1px solid ${theme.border}`, borderRadius: 10, padding: "8px 12px", minWidth: 180, textAlign: "center", fontWeight: 700 }}>{monthLabel(periodDate)}</div>
              <button type="button" onClick={() => setPeriodDate((p) => monthStart(new Date(p.getFullYear(), p.getMonth() + 1, 1)))} style={{ border: `1px solid ${theme.border}`, borderRadius: 10, background: theme.panelSoft, color: theme.text, padding: "8px 10px", cursor: "pointer" }}>▶</button>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(160px, 1fr))", gap: 10, minWidth: 0, maxWidth: "100%", width: "100%", boxSizing: "border-box" }}>
          {trainerKpis.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setDetailState({
                type: "kpi",
                title: `KPI: ${k.title}`,
                payload: {
                  ...k,
                  definition: k.id === "avgSession"
                    ? "total attendance marks / held sessions (тільки scheduled дати, cancelled виключено)."
                    : k.id === "trials"
                      ? "Пробні = лише ті відвідування, які після перевірки покриття абонементом лишилися effective trial."
                    : "метрика за вибраний календарний місяць у межах груп тренера.",
                  breakdown: k.id === "trials" ? trialMetricBreakdown : null,
                  interpretation: k.delta >= 0 ? "Позитивна динаміка до попереднього місяця." : "Негативна динаміка — потрібна увага.",
                  action: k.id === "renewals" ? "Запусти кампейн на продовження у групах з ризиком." : "Перевір групи/учениць у блоці Insights.",
                },
              })}
              style={{ ...tile, borderColor: k.color }}
            >
              <div style={{ fontSize: 12, color: theme.textSoft }}>{k.title}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: k.color }}>{k.value}</div>
              <div style={{ marginTop: 8 }}><Delta value={k.delta} /></div>
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(180px, 1fr))", gap: 10, minWidth: 0, maxWidth: "100%", width: "100%", boxSizing: "border-box" }}>
          <ProgressRing
            value={Math.round(foundationCurrent.metrics.trialToPaidConversion || 0)}
            label="Пробне → абонемент"
            sublabel="конверсія"
            color={theme.primary}
            onClick={() => setDetailState({
              type: "ring",
              title: "Конверсія пробних у абонемент",
              payload: {
                percent: Math.round(foundationCurrent.metrics.trialToPaidConversion || 0),
                numerator: foundationCurrent.domains.trialSingle.funnel.find((x) => x.stage === "trial_paid")?.value || 0,
                denominator: foundationCurrent.domains.trialSingle.funnel.find((x) => x.stage === "trial")?.value || 0,
                definition: "trial_paid / trial * 100",
                interpretation: "Вища конверсія = краща якість доведення пробних до продажу.",
                note: "У знаменнику беруться тільки реальні пробні після coverage-check на дату заняття.",
                action: "Сфокусуй follow-up протягом 24-48 годин після trial.",
              },
            })}
          />
          <ProgressRing
            value={Math.round(foundationCurrent.metrics.singleToPaidConversion || 0)}
            label="Разове → абонемент"
            sublabel="конверсія"
            color={theme.secondary}
            onClick={() => setDetailState({
              type: "ring",
              title: "Конверсія разових у абонемент",
              payload: {
                percent: Math.round(foundationCurrent.metrics.singleToPaidConversion || 0),
                numerator: foundationCurrent.domains.trialSingle.funnel.find((x) => x.stage === "single_paid")?.value || 0,
                denominator: foundationCurrent.domains.trialSingle.funnel.find((x) => x.stage === "single")?.value || 0,
                definition: "single_paid / single * 100",
                interpretation: "Показує ефективність конвертації разових у пакети.",
                action: "Додай offer на пакет одразу після single-візиту.",
              },
            })}
          />
          <ProgressRing
            value={pct(foundationCurrent.metrics.renewals, Math.max(1, foundationCurrent.metrics.newSubscriptions + foundationCurrent.metrics.renewals))}
            label="Рівень продовжень"
            sublabel="частка renewals"
            color={theme.warn}
            onClick={() => setDetailState({
              type: "ring",
              title: "Рівень продовжень",
              payload: {
                percent: pct(foundationCurrent.metrics.renewals, Math.max(1, foundationCurrent.metrics.newSubscriptions + foundationCurrent.metrics.renewals)),
                numerator: foundationCurrent.metrics.renewals,
                denominator: foundationCurrent.metrics.newSubscriptions + foundationCurrent.metrics.renewals,
                definition: "renewals / (new + renewals) * 100",
                interpretation: "Високе значення означає стабільне утримання учениць.",
                action: "Для груп з low renewal запусти персональні follow-up повідомлення.",
              },
            })}
          />
          <ProgressRing
            value={pct(groupCards.reduce((s, g) => s + g.activeSubs, 0), Math.max(1, groupCards.reduce((s, g) => s + g.students, 0)))}
            label="Заповненість груп"
            sublabel="active / students"
            color={theme.good}
            onClick={() => setDetailState({
              type: "ring",
              title: "Заповненість груп",
              payload: {
                percent: pct(groupCards.reduce((s, g) => s + g.activeSubs, 0), Math.max(1, groupCards.reduce((s, g) => s + g.students, 0))),
                numerator: groupCards.reduce((s, g) => s + g.activeSubs, 0),
                denominator: groupCards.reduce((s, g) => s + g.students, 0),
                definition: "active subscriptions / total students * 100",
                interpretation: "Відображає покриття груп активними пакетами.",
                action: "Працюй з no-active списком у групових картках.",
              },
            })}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 10, minWidth: 0, maxWidth: "100%", width: "100%", boxSizing: "border-box" }}>
          <button
            type="button"
            onClick={() => setDetailState({
              type: "chart",
              title: "Відвідуваність: поточний vs попередній місяць",
              payload: {
                kind: "lineCompare",
                series: trendCurrent.map((r) => ({ day: r.x, current: r.y, previous: prevLineMap[r.x] || 0 })),
              },
            })}
            style={{ ...tile, width: "100%" }}
          >
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Відвідуваність: поточний vs попередній місяць</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 90 }}>
              {trendCurrent.map((r) => {
                const prev = prevLineMap[r.x] || 0;
                const max = Math.max(1, ...trendCurrent.map((x) => x.y), ...Object.values(prevLineMap));
                return (
                  <div key={r.x} style={{ flex: 1 }}>
                    <div style={{ height: `${Math.max(2, (prev / max) * 60)}px`, background: "rgba(77,124,255,0.5)", borderRadius: 3 }} />
                    <div style={{ height: `${Math.max(2, (r.y / max) * 60)}px`, background: theme.primary, borderRadius: 3, marginTop: 2 }} />
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: theme.textSoft, marginTop: 6 }}>Кораловий = поточний · Синій = попередній</div>
          </button>

          <button
            type="button"
            onClick={() => setDetailState({ type: "chart", title: "Продовження / завершені / без продовження", payload: { kind: "renewalRisk", ...renewalsRiskBlock } })}
            style={{ ...tile, width: "100%" }}
          >
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Продовження / завершені / без продовження</div>
            {[{k:"renewals",v:renewalsRiskBlock.renewals,c:theme.good},{k:"expired",v:renewalsRiskBlock.expired,c:theme.warn},{k:"noRenewal",v:renewalsRiskBlock.noRenewal,c:theme.bad}].map((x) => (
              <div key={x.k} style={{ marginBottom: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: theme.textSoft }}><span>{x.k}</span><span>{x.v}</span></div>
                <div style={{ height: 8, borderRadius: 999, background: "#2a3446" }}><div style={{ width: `${Math.min(100, x.v * 12)}%`, height: "100%", borderRadius: 999, background: x.c }} /></div>
              </div>
            ))}
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, minWidth: 0, maxWidth: "100%", width: "100%", boxSizing: "border-box" }}>
          <button
            type="button"
            onClick={() => setDetailState({ type: "chart", title: "Стекова структура по групах", payload: { kind: "groupBars", rows: groupCards.map((g) => ({ groupId: g.groupId, groupName: g.groupName, trial: g.trialCount, single: g.singleCount, paid: g.paidCount })) } })}
            style={{ ...tile, width: "100%" }}
          >
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Стекова структура trial/single/paid по групах</div>
            {groupCards.slice(0, 4).map((g) => {
              const total = Math.max(1, g.trialCount + g.singleCount + g.paidCount);
              return (
                <div key={g.groupId} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: theme.textSoft }}>{g.groupName}</div>
                  <div style={{ display: "flex", height: 8, borderRadius: 999, overflow: "hidden", marginTop: 4 }}>
                    <div style={{ width: `${(g.trialCount / total) * 100}%`, background: "#8b7bff" }} />
                    <div style={{ width: `${(g.singleCount / total) * 100}%`, background: "#51c4d3" }} />
                    <div style={{ width: `${(g.paidCount / total) * 100}%`, background: theme.good }} />
                  </div>
                </div>
              );
            })}
          </button>

          <button
            type="button"
            onClick={() => setDetailState({ type: "chart", title: "Воронка конверсій", payload: { kind: "funnel", steps: foundationCurrent.ui.charts.funnel.steps } })}
            style={{ ...tile, width: "100%" }}
          >
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Воронка конверсій</div>
            <div style={{ fontSize: 11, color: theme.textSoft, marginBottom: 6 }}>
              Trial у цій воронці — лише реальні пробні після перевірки покриття абонементом на дату заняття.
            </div>
            {foundationCurrent.ui.charts.funnel.steps.map((s) => (
              <div key={s.key} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: theme.textSoft, padding: "5px 0", borderBottom: `1px solid ${theme.border}` }}>
                <span>{s.label}</span>
                <strong style={{ color: theme.text }}>{s.value}</strong>
              </div>
            ))}
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, minWidth: 0, maxWidth: "100%", width: "100%", boxSizing: "border-box" }}>
          <button
            type="button"
            onClick={() => setDetailState({ type: "heatmap", title: "Теплокарта відвідуваності (дні тижня)", payload: { cells: foundationCurrent.domains.attendance.heatmap } })}
            style={{ ...tile, width: "100%" }}
          >
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Теплокарта відвідуваності</div>
            {foundationCurrent.domains.attendance.heatmap.map((c) => (
              <div key={c.weekday} style={{ display: "grid", gridTemplateColumns: "35px 1fr 24px", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <span style={{ fontSize: 11, color: theme.textSoft }}>{c.label}</span>
                <div style={{ height: 8, borderRadius: 999, background: "#2a3446" }}>
                  <div style={{ height: "100%", width: `${Math.min(100, c.value * 10)}%`, borderRadius: 999, background: theme.secondary }} />
                </div>
                <span style={{ fontSize: 11, color: theme.text }}>{c.value}</span>
              </div>
            ))}
          </button>

          <div style={{ ...card, padding: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Порівняння по групах</div>
            {groupCards.map((g) => (
              <button
                key={g.groupId}
                type="button"
                onClick={() => setDetailState({ type: "group", title: `Група: ${g.groupName}`, payload: g })}
                style={{ width: "100%", textAlign: "left", border: `1px solid ${theme.border}`, background: theme.panelSoft, color: theme.text, borderRadius: 10, padding: 8, marginBottom: 6, cursor: "pointer" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span>{g.groupName}</span>
                  <span style={{ color: theme.textSoft }}>Сер./заняття: {g.avgAttendancePerSession}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ ...card, padding: 12, minWidth: 0, maxWidth: "100%", width: "100%", boxSizing: "border-box", overflow: "hidden" }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Інсайти / Ризики / Дії</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(180px,1fr))", gap: 8, minWidth: 0, maxWidth: "100%", width: "100%", boxSizing: "border-box" }}>
            {insights.map((ins) => (
              <button key={ins.id} type="button" onClick={() => setDetailState({ type: "insight", title: ins.title, payload: { ...ins, action: "Перевір деталі групи та запусти цільовий follow-up." } })} style={{ ...tile, padding: 10 }}>
                <div style={{ fontSize: 12, color: theme.textSoft }}>{ins.title}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: theme.text, marginTop: 4 }}>{ins.value}</div>
                <div style={{ fontSize: 11, color: "#7f93b2", marginTop: 3 }}>{ins.note}</div>
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setDetailState({ type: "communication", title: "Аналітика комунікацій", payload: foundationCurrent.domains.integrations })}
          style={{ ...tile }}
        >
          <div style={{ fontWeight: 800, marginBottom: 4 }}>Блок комунікацій (foundation)</div>
          <div style={{ fontSize: 12, color: theme.textSoft }}>Telegram / Instagram / AI інтеграції підготовлені на рівні foundation.</div>
        </button>
      </section>

      <aside style={{ ...card, padding: 12, position: "sticky", top: 10, height: "fit-content", display: "grid", gap: 10, minWidth: 0, width: "100%", alignSelf: "start", zIndex: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800 }}>Деталізація</div>
          <button type="button" onClick={() => setDetailState({ type: "overview", title: "Огляд", payload: null })} style={{ border: `1px solid ${theme.border}`, borderRadius: 9, background: theme.panelSoft, color: theme.text, padding: "5px 8px", cursor: "pointer" }}>Скинути</button>
        </div>
        <div style={{ fontSize: 12, color: theme.textSoft }}>{detailState.title}</div>
        <div style={{ fontSize: 11, color: "#7f93b2" }}>
          Поточний період: {range.start} → {range.end}<br />
          Попередній період: {rangePrev.start} → {rangePrev.end}
        </div>
        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 12, background: theme.panelSoft, padding: 10 }}>
          {renderDetailBody()}
        </div>
      </aside>
    </div>
  );
}
