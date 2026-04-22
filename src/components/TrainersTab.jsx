import React, { useEffect, useMemo, useState } from "react";
import * as db from "../db";
import { buildAnalyticsFoundation, getTrainerAnalyticsCard } from "../shared/analytics";

const card = {
  border: "1px solid #dde5f0",
  borderRadius: 18,
  background: "#fff",
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
};

const tileCard = {
  ...card,
  padding: 14,
  cursor: "pointer",
  transition: "all 0.2s ease",
};

const PAID_PACKS = new Set(["4pack", "8pack", "12pack"]);

const monthStart = (d) => new Date(d.getFullYear(), d.getMonth(), 1, 12);
const monthEnd = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 12);
const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const monthLabel = (d) => d.toLocaleDateString("uk-UA", { month: "long", year: "numeric" });
const inRange = (dateStr, start, end) => !!dateStr && dateStr >= start && dateStr <= end;
const getSubRefDate = (s) => s.startDate || String(s.created_at || "").slice(0, 10);
const pct = (v, total) => (total > 0 ? Math.round((v / total) * 100) : 0);

const Delta = ({ value = 0 }) => (
  <span style={{
    fontSize: 12,
    fontWeight: 700,
    color: value >= 0 ? "#12805c" : "#b42318",
    background: value >= 0 ? "#e8f7ef" : "#fdecec",
    borderRadius: 999,
    padding: "3px 8px",
  }}>
    {value >= 0 ? "+" : ""}{value}
  </span>
);

function ProgressRing({ value = 0, label, sublabel, onClick }) {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const safe = Math.max(0, Math.min(100, value));
  const dash = `${(safe / 100) * circumference} ${circumference}`;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ ...card, padding: 14, textAlign: "left", border: "1px solid #dde6f2", cursor: "pointer", background: "#fff" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <svg width="90" height="90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} stroke="#ebf0f7" strokeWidth="10" fill="none" />
          <circle
            cx="50"
            cy="50"
            r={radius}
            stroke="#3867d6"
            strokeWidth="10"
            fill="none"
            strokeDasharray={dash}
            transform="rotate(-90 50 50)"
            strokeLinecap="round"
          />
          <text x="50" y="55" textAnchor="middle" fontSize="16" fontWeight="800" fill="#1f2b3d">{safe}%</text>
        </svg>
        <div>
          <div style={{ fontSize: 13, color: "#5e6f89", marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: 12, color: "#8b9bb2" }}>{sublabel}</div>
        </div>
      </div>
    </button>
  );
}

function MiniBars({ rows = [], onClick }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <button type="button" onClick={onClick} style={{ ...card, width: "100%", padding: 14, border: "1px solid #dde6f2", cursor: "pointer", background: "#fff", textAlign: "left" }}>
      <div style={{ fontWeight: 700, marginBottom: 10, color: "#24364d" }}>Trial / Single / Paid mix</div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", height: 100 }}>
        {rows.map((r) => (
          <div key={r.key} style={{ flex: 1, minWidth: 40 }}>
            <div style={{ fontSize: 11, color: "#5c6d86", marginBottom: 4, textAlign: "center" }}>{r.value}</div>
            <div style={{ height: `${Math.max(8, (r.value / max) * 70)}px`, borderRadius: 10, background: r.color }} />
            <div style={{ fontSize: 11, color: "#8b9bb2", marginTop: 6, textAlign: "center" }}>{r.label}</div>
          </div>
        ))}
      </div>
    </button>
  );
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
      scopedStudentIdSet,
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
    const d = monthStart(periodDate);
    d.setMonth(d.getMonth() - 1);
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
      { id: "students", title: "Учениць", value: studentsCount, delta: studentsCount - studentsPrev },
      { id: "activeSubs", title: "Активні абонементи", value: activeSubs, delta: activeSubs - activeSubsPrev },
      { id: "newSubs", title: "Нові абонементи", value: newSubs, delta: newSubs - newSubsPrev },
      { id: "renewals", title: "Продовження", value: renewals, delta: renewals - renewalsPrev },
      { id: "trials", title: "Пробні", value: trials, delta: trials - trialsPrev },
      { id: "singles", title: "Разові", value: singles, delta: singles - singlesPrev },
    ];
  }, [foundationCurrent.metrics.newSubscriptions, foundationCurrent.metrics.renewals, foundationPrev.metrics.newSubscriptions, foundationPrev.metrics.renewals, trainerCard, trainerCardPrev]);

  const trendSeries = foundationCurrent.domains.attendance.line;

  const monthBreakdown = useMemo(() => {
    const trialVal = foundationCurrent.domains.subscriptions.byPlan.find((x) => x.plan === "trial")?.value || 0;
    const singleVal = foundationCurrent.domains.subscriptions.byPlan.find((x) => x.plan === "single")?.value || 0;
    const paidVal = (foundationCurrent.metrics.newSubscriptions || 0) + (foundationCurrent.metrics.renewals || 0);
    return [
      { key: "trial", label: "Пробні", value: trialVal, color: "#7e57c2" },
      { key: "single", label: "Разові", value: singleVal, color: "#0097a7" },
      { key: "paid", label: "Оплачені", value: paidVal, color: "#2e7d32" },
    ];
  }, [foundationCurrent]);

  const groupCards = useMemo(() => trainerBoundGroups.map((g) => {
    const groupStudentIds = new Set(
      studentGrps.filter((sg) => String(sg.groupId) === String(g.id)).map((sg) => String(sg.studentId)),
    );
    const groupStudents = groupStudentIds.size;
    const groupActiveSubs = subs.filter((s) => String(s.groupId) === String(g.id) && s.status !== "expired").length;
    const groupAttnRows = attn.filter((a) => String(a.groupId) === String(g.id) && inRange(a.date, range.start, range.end));
    const groupAttnCount = groupAttnRows.reduce((sum, row) => sum + (row.quantity || 1), 0);
    const avgAttendance = groupStudents ? Number((groupAttnCount / groupStudents).toFixed(2)) : 0;
    const problemNoActive = Array.from(groupStudentIds).filter((studentId) => !subs.some((s) => String(s.groupId) === String(g.id) && String(s.studentId) === studentId && s.status !== "expired")).length;

    return {
      groupId: g.id,
      groupName: g.name,
      students: groupStudents,
      activeSubs: groupActiveSubs,
      avgAttendance,
      attendance: groupAttnCount,
      noActive: problemNoActive,
      fillPct: pct(groupActiveSubs, Math.max(groupStudents, 1)),
    };
  }), [attn, range.end, range.start, studentGrps, subs, trainerBoundGroups]);

  const insights = useMemo(() => {
    if (!groupCards.length) return [];
    const strongest = [...groupCards].sort((a, b) => b.attendance - a.attendance)[0];
    const weak = [...groupCards].sort((a, b) => a.attendance - b.attendance)[0];

    const renewalsNow = foundationCurrent.metrics.renewals || 0;
    const renewalsPrev = foundationPrev.metrics.renewals || 0;

    const expiredNoRenewal = scopedData.scopedSubs.filter((s) => (
      PAID_PACKS.has(s.planType)
      && s.endDate
      && inRange(s.endDate, range.start, range.end)
      && !scopedData.scopedSubs.some((n) => PAID_PACKS.has(n.planType) && String(n.studentId) === String(s.studentId) && getSubRefDate(n) > s.endDate)
    )).length;

    const trialStudentsThisMonth = new Set(
      scopedData.scopedAttn
        .filter((a) => inRange(a.date, range.start, range.end) && (a.entryType === "trial" || a.guestType === "trial") && a.studentId)
        .map((a) => String(a.studentId)),
    );
    const trialNotConverted = Array.from(trialStudentsThisMonth).filter((studentId) => !scopedData.scopedSubs.some((s) => (
      PAID_PACKS.has(s.planType) && String(s.studentId) === studentId && getSubRefDate(s) >= range.start
    ))).length;

    const followUpStudents = scopedData.scopedSubs.filter((s) => s.endDate && inRange(s.endDate, range.start, range.end)).length;

    return [
      { id: "strongest", title: "Найсильніша група", value: strongest?.groupName || "—", note: `${strongest?.attendance || 0} відвідувань` },
      { id: "weak", title: "Слабка група", value: weak?.groupName || "—", note: `${weak?.attendance || 0} відвідувань` },
      { id: "renewalsRisk", title: "Динаміка продовжень", value: renewalsNow - renewalsPrev, note: `Було ${renewalsPrev}, стало ${renewalsNow}` },
      { id: "expiredNoRenewal", title: "Expired без продовження", value: expiredNoRenewal, note: "Поточний місяць" },
      { id: "trialNoConv", title: "Пробні без конверсії", value: trialNotConverted, note: "Поточний місяць" },
      { id: "followUp", title: "Потрібен follow-up", value: followUpStudents, note: "Абонементи, що завершуються" },
    ];
  }, [foundationCurrent.metrics.renewals, foundationPrev.metrics.renewals, groupCards, range.end, range.start, scopedData.scopedAttn, scopedData.scopedSubs]);

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

  const trendMax = Math.max(...trendSeries.map((x) => x.y), 1);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px minmax(0,1fr)", gap: 16 }}>
      <aside style={{ ...card, padding: 12, display: "flex", flexDirection: "column", gap: 10, position: "sticky", top: 10, height: "fit-content" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, color: "#22324a" }}>Тренери</div>
          <button type="button" onClick={beginCreate} style={{ border: "1px solid #cfd8e5", borderRadius: 10, background: "#f7f9fc", padding: "6px 9px", cursor: "pointer" }}>+ Додати</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 230, overflow: "auto", paddingRight: 2 }}>
          {trainers.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setIsCreateMode(false); setSelectedTrainerId(t.id); }}
              style={{ textAlign: "left", border: `1px solid ${selectedTrainerId === t.id && !isCreateMode ? "#4e7cd1" : "#d3dbe8"}`, borderRadius: 12, background: selectedTrainerId === t.id && !isCreateMode ? "#edf4ff" : "#fff", padding: "9px 10px", cursor: "pointer" }}
            >
              <div style={{ fontWeight: 700, color: "#1f2a3d" }}>{getTrainerDisplayName(t)}</div>
              <div style={{ fontSize: 11, color: t.isActive ? "#228b59" : "#8a97aa" }}>{t.isActive ? "Активний" : "Неактивний"}</div>
            </button>
          ))}
        </div>

        <div style={{ borderTop: "1px solid #e2e8f3", paddingTop: 10 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>{isCreateMode ? "Новий тренер" : "Профіль"}</div>
          <div style={{ display: "grid", gap: 8 }}>
            <input value={draft.firstName} onChange={(e) => setDraft((p) => ({ ...p, firstName: e.target.value }))} placeholder="Ім'я" style={{ border: "1px solid #d2dbe8", borderRadius: 10, padding: "9px 10px" }} />
            <input value={draft.lastName} onChange={(e) => setDraft((p) => ({ ...p, lastName: e.target.value }))} placeholder="Прізвище" style={{ border: "1px solid #d2dbe8", borderRadius: 10, padding: "9px 10px" }} />
            <input value={draft.phone} onChange={(e) => setDraft((p) => ({ ...p, phone: e.target.value }))} placeholder="Телефон" style={{ border: "1px solid #d2dbe8", borderRadius: 10, padding: "9px 10px" }} />
            <input value={draft.telegram} onChange={(e) => setDraft((p) => ({ ...p, telegram: e.target.value }))} placeholder="Telegram" style={{ border: "1px solid #d2dbe8", borderRadius: 10, padding: "9px 10px" }} />
            <input value={draft.instagramHandle} onChange={(e) => setDraft((p) => ({ ...p, instagramHandle: e.target.value }))} placeholder="Instagram" style={{ border: "1px solid #d2dbe8", borderRadius: 10, padding: "9px 10px" }} />
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#334155" }}>
              <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft((p) => ({ ...p, isActive: e.target.checked }))} /> Активний
            </label>
            <textarea value={draft.notes} onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))} rows={3} placeholder="Нотатки" style={{ border: "1px solid #d2dbe8", borderRadius: 10, padding: "9px 10px", resize: "vertical" }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" disabled={saving} onClick={saveTrainer} style={{ border: "none", borderRadius: 10, background: "#3568c6", color: "#fff", padding: "9px 14px", cursor: "pointer", fontWeight: 700, flex: 1 }}>{saving ? "Збереження..." : "Зберегти"}</button>
              {!isCreateMode && selectedTrainer && <button type="button" onClick={beginEdit} style={{ border: "1px solid #cfd8e5", borderRadius: 10, background: "#f7f9fc", padding: "9px 12px", cursor: "pointer" }}>Ред.</button>}
            </div>
          </div>
        </div>

        {selectedTrainer && !isCreateMode && (
          <>
            <div style={{ borderTop: "1px solid #e2e8f3", paddingTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {selectedTrainer.telegram && <a href={`https://t.me/${String(selectedTrainer.telegram).replace(/^@/, "")}`} target="_blank" rel="noreferrer" style={{ border: "1px solid #d7e0ed", borderRadius: 9, padding: "6px 9px", textDecoration: "none", color: "#1f4da3", fontSize: 12, fontWeight: 700 }}>Telegram</a>}
              {selectedTrainer.instagramHandle && <a href={`https://instagram.com/${normalizeInstagramHandle(selectedTrainer.instagramHandle)}`} target="_blank" rel="noreferrer" style={{ border: "1px solid #d7e0ed", borderRadius: 9, padding: "6px 9px", textDecoration: "none", color: "#8a2160", fontSize: 12, fontWeight: 700 }}>Instagram</a>}
              {selectedTrainer.phone && <a href={`tel:${selectedTrainer.phone}`} style={{ border: "1px solid #d7e0ed", borderRadius: 9, padding: "6px 9px", textDecoration: "none", color: "#0f5132", fontSize: 12, fontWeight: 700 }}>Call</a>}
            </div>

            <div style={{ borderTop: "1px solid #e2e8f3", paddingTop: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Прив'язані групи</div>
              <div style={{ display: "grid", gap: 6 }}>
                {groups.map((g) => (
                  <label key={g.id} style={{ display: "flex", alignItems: "center", gap: 8, border: "1px solid #dde5f0", borderRadius: 9, padding: "6px 8px" }}>
                    <input type="checkbox" checked={trainerGroupIds.includes(g.id)} onChange={(e) => toggleGroup(g.id, e.target.checked)} />
                    <span style={{ fontSize: 12 }}>{g.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
      </aside>

      <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ ...card, padding: 16, background: "linear-gradient(180deg,#ffffff 0%,#f7faff 100%)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "#1f2d42" }}>{isCreateMode ? "Новий тренер" : getTrainerDisplayName(selectedTrainer)}</div>
              <div style={{ fontSize: 13, color: "#7587a2", marginTop: 4 }}>
                Trainer analytics dashboard · календарний місяць · {foundationCurrent.period.key}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button type="button" onClick={() => setPeriodDate((p) => monthStart(new Date(p.getFullYear(), p.getMonth() - 1, 1)))} style={{ border: "1px solid #d8e1ef", borderRadius: 10, background: "#fff", padding: "8px 10px", cursor: "pointer" }}>◀</button>
              <div style={{ border: "1px solid #d8e1ef", borderRadius: 10, padding: "8px 12px", minWidth: 180, textAlign: "center", fontWeight: 700, color: "#2a3a52" }}>{monthLabel(periodDate)}</div>
              <button type="button" onClick={() => setPeriodDate((p) => monthStart(new Date(p.getFullYear(), p.getMonth() + 1, 1)))} style={{ border: "1px solid #d8e1ef", borderRadius: 10, background: "#fff", padding: "8px 10px", cursor: "pointer" }}>▶</button>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(140px, 1fr))", gap: 10 }}>
          {trainerKpis.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setDetailState({ type: "kpi", title: `Деталі: ${k.title}`, payload: k })}
              style={tileCard}
            >
              <div style={{ fontSize: 12, color: "#5e708a", marginBottom: 8 }}>{k.title}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#1f2b3d" }}>{k.value}</div>
              <div style={{ marginTop: 8 }}><Delta value={k.delta} /></div>
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(180px, 1fr))", gap: 10 }}>
          <ProgressRing
            value={Math.round(foundationCurrent.metrics.trialToPaidConversion || 0)}
            label="Пробне → абонемент"
            sublabel="конверсія місяця"
            onClick={() => setDetailState({ type: "ring", title: "Trial conversion", payload: foundationCurrent.domains.trialSingle })}
          />
          <ProgressRing
            value={Math.round(foundationCurrent.metrics.singleToPaidConversion || 0)}
            label="Разове → абонемент"
            sublabel="конверсія місяця"
            onClick={() => setDetailState({ type: "ring", title: "Single conversion", payload: foundationCurrent.domains.trialSingle })}
          />
          <ProgressRing
            value={pct(foundationCurrent.metrics.renewals, Math.max(1, foundationCurrent.metrics.newSubscriptions + foundationCurrent.metrics.renewals))}
            label="Рівень продовжень"
            sublabel="частка renewals"
            onClick={() => setDetailState({ type: "ring", title: "Renewals rate", payload: foundationCurrent.domains.subscriptions })}
          />
          <ProgressRing
            value={pct(groupCards.reduce((s, g) => s + g.activeSubs, 0), Math.max(1, groupCards.reduce((s, g) => s + g.students, 0)))}
            label="Заповненість груп"
            sublabel="активні/усі учениці"
            onClick={() => setDetailState({ type: "ring", title: "Group occupancy", payload: groupCards })}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
          <button
            type="button"
            onClick={() => setDetailState({ type: "chart", title: "Attendance trend", payload: trendSeries })}
            style={{ ...card, width: "100%", padding: 14, border: "1px solid #dde6f2", cursor: "pointer", background: "#fff", textAlign: "left" }}
          >
            <div style={{ fontWeight: 800, color: "#24364d", marginBottom: 12 }}>Attendance trend ({monthKey(periodDate)})</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120 }}>
              {trendSeries.map((d) => (
                <div key={d.date} style={{ flex: 1, minWidth: 8 }}>
                  <div style={{ height: `${Math.max(4, (d.y / trendMax) * 95)}px`, background: "#4f7ddb", borderRadius: 6 }} />
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "#8192aa", marginTop: 8 }}>Клік відкриє детальний перегляд метрики</div>
          </button>

          <div style={{ display: "grid", gap: 10 }}>
            <MiniBars rows={monthBreakdown} onClick={() => setDetailState({ type: "chart", title: "Breakdown", payload: monthBreakdown })} />
            <button
              type="button"
              onClick={() => setDetailState({ type: "heatmap", title: "Heatmap preview", payload: foundationCurrent.domains.attendance.heatmap })}
              style={{ ...card, width: "100%", padding: 14, border: "1px solid #dde6f2", cursor: "pointer", background: "#fff", textAlign: "left" }}
            >
              <div style={{ fontWeight: 700, marginBottom: 8, color: "#24364d" }}>Heatmap preview</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
                {foundationCurrent.domains.attendance.heatmap.map((c) => (
                  <div key={c.weekday} style={{ borderRadius: 8, background: `rgba(58,111,220,${Math.min(0.15 + (c.value / 10), 0.9)})`, color: "#1f2c43", textAlign: "center", padding: "8px 2px", fontSize: 11, fontWeight: 700 }}>
                    <div>{c.label}</div>
                    <div>{c.value}</div>
                  </div>
                ))}
              </div>
            </button>
          </div>
        </div>

        <div style={{ ...card, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontWeight: 800, color: "#24364d" }}>Аналітика груп тренера</div>
            <div style={{ fontSize: 12, color: "#8192aa" }}>Клік по картці відкриває drill-down</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 10 }}>
            {groupCards.map((g) => (
              <button
                key={g.groupId}
                type="button"
                onClick={() => setDetailState({ type: "group", title: `Група: ${g.groupName}`, payload: g })}
                style={{ ...card, padding: 12, cursor: "pointer", textAlign: "left" }}
              >
                <div style={{ fontWeight: 800, color: "#22344d", marginBottom: 8 }}>{g.groupName}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 6 }}>
                  <div><div style={{ fontSize: 11, color: "#8798b1" }}>Учениць</div><div style={{ fontWeight: 800 }}>{g.students}</div></div>
                  <div><div style={{ fontSize: 11, color: "#8798b1" }}>Активні</div><div style={{ fontWeight: 800 }}>{g.activeSubs}</div></div>
                  <div><div style={{ fontSize: 11, color: "#8798b1" }}>Сер. відвідуваність</div><div style={{ fontWeight: 800 }}>{g.avgAttendance}</div></div>
                  <div><div style={{ fontSize: 11, color: "#8798b1" }}>Без активного</div><div style={{ fontWeight: 800, color: g.noActive > 0 ? "#b42318" : "#157347" }}>{g.noActive}</div></div>
                </div>
                <div style={{ marginTop: 8, height: 8, borderRadius: 999, background: "#ecf0f7" }}>
                  <div style={{ width: `${g.fillPct}%`, height: "100%", borderRadius: 999, background: "#3f72dd" }} />
                </div>
              </button>
            ))}
            {!groupCards.length && <div style={{ fontSize: 13, color: "#8192aa" }}>Групи не прив'язані.</div>}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
          <div style={{ ...card, padding: 14 }}>
            <div style={{ fontWeight: 800, color: "#24364d", marginBottom: 10 }}>Insights / Risk / Action</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(180px,1fr))", gap: 10 }}>
              {insights.map((ins) => (
                <button
                  key={ins.id}
                  type="button"
                  onClick={() => setDetailState({ type: "insight", title: ins.title, payload: ins })}
                  style={{ ...card, padding: 12, cursor: "pointer", textAlign: "left" }}
                >
                  <div style={{ fontSize: 12, color: "#72849f" }}>{ins.title}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#23344d", marginTop: 4 }}>{ins.value}</div>
                  <div style={{ fontSize: 12, color: "#8798b1", marginTop: 4 }}>{ins.note}</div>
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setDetailState({ type: "communication", title: "Communication analytics", payload: foundationCurrent.domains.integrations })}
            style={{ ...card, padding: 14, textAlign: "left", cursor: "pointer", background: "linear-gradient(180deg,#fff 0%, #f9fbff 100%)" }}
          >
            <div style={{ fontWeight: 800, color: "#24364d", marginBottom: 8 }}>Комунікації (foundation)</div>
            <div style={{ fontSize: 12, color: "#7386a1", marginBottom: 8 }}>Telegram/Instagram/AI blocks ready</div>
            {Object.entries(foundationCurrent.domains.integrations).map(([key, cfg]) => (
              <div key={key} style={{ border: "1px solid #e1e8f4", borderRadius: 10, padding: "8px 10px", marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#2a3d57" }}>{key}</div>
                <div style={{ fontSize: 11, color: "#8395af" }}>{cfg.status}</div>
              </div>
            ))}
          </button>
        </div>

        <div style={{ ...card, padding: 14, border: "1px solid #ccd9ef", background: "#f8fbff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 800, color: "#22344d" }}>Drill-down panel</div>
            <button type="button" onClick={() => setDetailState({ type: "overview", title: "Огляд", payload: null })} style={{ border: "1px solid #d3deef", background: "#fff", borderRadius: 10, padding: "6px 10px", cursor: "pointer" }}>Скинути</button>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#2b3f5c", marginBottom: 6 }}>{detailState.title}</div>
          <pre style={{ margin: 0, fontSize: 12, color: "#4b5f7b", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 180, overflow: "auto" }}>
            {JSON.stringify(detailState.payload, null, 2) || "Натисни будь-який блок (KPI/ring/chart/group/insight), щоб побачити деталізацію."}
          </pre>
          <div style={{ marginTop: 8, fontSize: 11, color: "#7f90a9" }}>
            Поточний період: {range.start} → {range.end} · Попередній: {rangePrev.start} → {rangePrev.end}
          </div>
        </div>
      </section>
    </div>
  );
}
