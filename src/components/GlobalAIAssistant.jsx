import React, { useMemo, useState } from "react";
import { cardSt, theme } from "../shared/constants";
import { buildCRMContext } from "../shared/ai/contextBuilder";
import { CRM_CONTEXT_TYPES, CRM_CONTEXT_TYPE_LIST } from "../shared/ai/contextTypes";
import { supabase } from "../supabase";

const labelByContext = {
  global: "Global",
  dashboard: "Dashboard",
  attendance: "Attendance",
  payments: "Payments",
  students: "Students",
  groups: "Groups",
  trainers: "Trainers",
  forecast: "Forecast",
};

const compactValue = (value) => {
  if (Array.isArray(value)) return `${value.length} rows`;
  if (value && typeof value === "object") return `${Object.keys(value).length} keys`;
  if (typeof value === "boolean") return value ? "yes" : "no";
  return value ?? "—";
};

const getContextSection = (crmContext, contextType) => (
  crmContext?.selectedContext
  || crmContext?.contexts?.[contextType]
  || crmContext?.[contextType]
  || {}
);

const SummaryGrid = ({ title, rows = [] }) => (
  <div style={{ ...cardSt, border: `1px solid ${theme.border}`, padding: 12 }}>
    <div style={{ fontWeight: 800, marginBottom: 8 }}>{title}</div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8 }}>
      {rows.map(([label, value]) => (
        <div key={label} style={{ background: theme.bg, borderRadius: 14, padding: 10 }}>
          <div style={{ fontSize: 11, color: theme.textMuted }}>{label}</div>
          <div style={{ fontWeight: 800, color: theme.textMain }}>{compactValue(value)}</div>
        </div>
      ))}
    </div>
  </div>
);

const jsonPreviewStyle = {
  margin: 0,
  maxHeight: 260,
  overflow: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  background: "#111827",
  color: "#E5E7EB",
  borderRadius: 16,
  padding: 12,
  fontSize: 12,
  lineHeight: 1.5,
};

const priorityMeta = {
  high: { label: "Високий", color: theme.danger },
  medium: { label: "Середній", color: theme.warning },
  low: { label: "Низький", color: theme.success },
};

const getAIErrorMessage = (status, error) => {
  if (status === 401) return "AI доступ потребує активної admin-сесії";
  if (status === 403) return "AI доступ доступний тільки admin";
  if (status === 400 && error === "unsafe_payload") return "AI context містить небезпечні/private поля, запит заблоковано";
  if (status === 502 && error === "invalid_ai_response") return "AI повернув невалідну відповідь";
  return "Не вдалося отримати AI-висновки. Context preview залишається доступним.";
};

export default function GlobalAIAssistant({
  isAdmin = false,
  students = [],
  groups = [],
  studentGrps = [],
  subs = [],
  attn = [],
  waitlist = [],
  trialBookings = [],
  trainers = [],
  trainerGroups = [],
  directionsList = [],
  cancelled = [],
  roomBookings = [],
  groupLessonOverrides = [],
  analytics = {},
  proAnalytics = {},
  paymentAnomalies = [],
  dashboard = {},
}) {
  const [open, setOpen] = useState(false);
  const [contextType, setContextType] = useState(CRM_CONTEXT_TYPES.GLOBAL);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiResult, setAiResult] = useState(null);

  const crmContext = useMemo(() => {
    if (!isAdmin) return null;

    return buildCRMContext({
      contextType,
      students,
      groups,
      studentGrps,
      subs,
      attn,
      waitlist,
      trialBookings,
      trainers,
      trainerGroups,
      directionsList,
      cancelled,
      roomBookings,
      groupLessonOverrides,
      analytics,
      proAnalytics,
      paymentAnomalies,
      dashboard,
      options: { locale: "uk-UA", maxRowsPerSection: 10 },
    });
  }, [
    contextType,
    students,
    groups,
    studentGrps,
    subs,
    attn,
    waitlist,
    trialBookings,
    trainers,
    trainerGroups,
    directionsList,
    cancelled,
    roomBookings,
    groupLessonOverrides,
    analytics,
    proAnalytics,
    paymentAnomalies,
    dashboard,
    isAdmin,
  ]);

  if (!isAdmin) return null;

  const global = getContextSection(crmContext, CRM_CONTEXT_TYPES.GLOBAL);
  const dashboardContext = getContextSection(crmContext, CRM_CONTEXT_TYPES.DASHBOARD);
  const paymentsContext = getContextSection(crmContext, CRM_CONTEXT_TYPES.PAYMENTS);
  const selectedContext = getContextSection(crmContext, contextType);
  const selectedRows = Object.entries(selectedContext).slice(0, 8);
  const aiInsights = Array.isArray(aiResult?.insights) ? aiResult.insights : [];

  const analyzeWithAI = async () => {
    setOpen(true);
    setAiLoading(true);
    setAiError("");
    setAiResult(null);

    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        setAiError("Немає активної auth-сесії");
        setAiLoading(false);
        return;
      }

      const response = await fetch("/api/claude", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          op: "crmContextAnalysis",
          contextType,
          context: crmContext,
        }),
      });

      let json = null;
      try {
        json = await response.json();
      } catch (_error) {
        json = null;
      }

      if (!response.ok) {
        setAiError(getAIErrorMessage(response.status, json?.error));
        return;
      }

      if (json?.mode === "ai" && Array.isArray(json.insights)) {
        setAiResult(json);
        return;
      }

      setAiError("AI повернув неочікуваний формат відповіді");
    } catch (_error) {
      setAiError("Не вдалося отримати AI-висновки. Context preview залишається доступним.");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div style={{ ...cardSt, border: `1px solid ${theme.border}`, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <b>🌐 Global AI Assistant</b>
            <span style={{ fontSize: 11, color: "#fff", background: theme.primary, borderRadius: 999, padding: "3px 8px", fontWeight: 800 }}>Admin only</span>
            <span style={{ fontSize: 11, color: theme.textMuted, background: theme.bg, borderRadius: 999, padding: "3px 8px", fontWeight: 700 }}>Context preview</span>
          </div>
          <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>
            AI API підключено для ручного admin-запиту · No automatic actions · Read-only aggregate context
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={analyzeWithAI}
            disabled={aiLoading}
            style={{
              border: "none",
              borderRadius: 999,
              background: aiLoading ? theme.textMuted : theme.primary,
              color: "#fff",
              padding: "10px 14px",
              fontWeight: 800,
              cursor: aiLoading ? "wait" : "pointer",
            }}
          >
            {aiLoading ? "AI аналізує…" : "Проаналізувати через AI"}
          </button>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            style={{
              border: "none",
              borderRadius: 999,
              background: theme.primary,
              color: "#fff",
              padding: "10px 14px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {open ? "Сховати AI shell" : "Відкрити AI shell"}
          </button>
        </div>
      </div>

      {open && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <label style={{ fontWeight: 800 }} htmlFor="global-ai-context-type">Context type</label>
            <select
              id="global-ai-context-type"
              value={contextType}
              onChange={(event) => setContextType(event.target.value)}
              style={{ border: `1px solid ${theme.border}`, borderRadius: 12, padding: "8px 10px", minWidth: 180 }}
            >
              {CRM_CONTEXT_TYPE_LIST.map((type) => (
                <option key={type} value={type}>{labelByContext[type] || type}</option>
              ))}
            </select>
            <span style={{ color: theme.textMuted, fontSize: 12 }}>Selected: {crmContext?.contextType || contextType}</span>
          </div>

          {(aiError || aiInsights.length > 0 || aiLoading) && (
            <div style={{ ...cardSt, border: `1px solid ${theme.border}`, padding: 14, display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <b>AI-висновки</b>
                  <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 3 }}>Перевір перед дією. AI не змінює дані автоматично.</div>
                </div>
                {aiResult?.provider && <span style={{ color: theme.textMuted, fontSize: 12 }}>Provider: {aiResult.provider}</span>}
              </div>

              {aiLoading && <div style={{ color: theme.textMuted, fontSize: 13 }}>AI аналізує aggregate-only CRM context…</div>}

              {aiError && (
                <div style={{ padding: 12, borderRadius: 14, background: theme.input, color: theme.danger, fontSize: 13, fontWeight: 700 }}>
                  {aiError}
                </div>
              )}

              {aiInsights.length > 0 && (
                <div style={{ display: "grid", gap: 10 }}>
                  {aiInsights.map((item, index) => {
                    const meta = priorityMeta[item.priority] || priorityMeta.medium;
                    return (
                      <article key={item.id || index} style={{ border: `1px solid ${theme.border}`, borderRadius: 16, padding: 14, background: theme.bg }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                          <div>
                            <div style={{ fontWeight: 800, color: theme.textMain }}>{item.title || "AI-висновок"}</div>
                            {item.summary && <div style={{ color: theme.textMuted, fontSize: 13, marginTop: 4 }}>{item.summary}</div>}
                          </div>
                          <span style={{ border: `1px solid ${meta.color}55`, color: meta.color, borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 800 }}>{meta.label}</span>
                        </div>

                        {Array.isArray(item.evidence) && item.evidence.length > 0 && (
                          <ul style={{ margin: "10px 0 0 18px", padding: 0, color: theme.textMuted, fontSize: 13 }}>
                            {item.evidence.map((row) => <li key={row}>{row}</li>)}
                          </ul>
                        )}

                        {item.recommendation && <div style={{ marginTop: 10, color: theme.textMain, fontSize: 13 }}><b>Рекомендація:</b> {item.recommendation}</div>}
                        {item.source && <div style={{ marginTop: 8, color: theme.textLight, fontSize: 11 }}>Source: {item.source}</div>}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <SummaryGrid
            title="Key counts"
            rows={[
              ["Students", global.studentsCount || students.length],
              ["Groups", global.groupsCount || groups.length],
              ["Trainers", global.trainersCount || trainers.length],
              ["Directions", global.directionsCount || directionsList.length],
              ["Student-group links", global.studentGroupLinksCount || studentGrps.length],
              ["Payment anomalies", paymentsContext.anomalies?.total || paymentAnomalies.length],
              ["Trial bookings", global.schedule?.trialBookingsCount || trialBookings.length],
              ["Cancelled lessons", global.schedule?.cancelledCount || cancelled.length],
            ]}
          />

          <SummaryGrid
            title="Dashboard summary"
            rows={[
              ["Period", dashboardContext.period ? `${dashboardContext.period.start || "?"}–${dashboardContext.period.end || "?"}` : "—"],
              ["Ending soon", dashboardContext.endingSoon],
              ["No active payment", dashboardContext.noActivePayment],
              ["Low attendance groups", dashboardContext.lowAttendanceGroups],
              ["Reserve demand", dashboardContext.reserveDemand],
              ["Strong signals", dashboardContext.strongSignals],
              ["Weak signals", dashboardContext.weakSignals],
              ["Low attendance rows", dashboardContext.lowAttendanceGroupRows],
            ]}
          />

          <SummaryGrid title={`${labelByContext[contextType] || contextType} context summary`} rows={selectedRows} />

          <div style={{ ...cardSt, border: `1px solid ${theme.border}`, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <b>Data policy</b>
              <span style={{ color: theme.textMuted, fontSize: 12 }}>Privacy-safe aggregate-only preview</span>
            </div>
            <pre style={jsonPreviewStyle}>{JSON.stringify(crmContext?.dataPolicy || {}, null, 2)}</pre>
          </div>

          <div style={{ ...cardSt, border: `1px solid ${theme.border}`, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <b>Structured context preview</b>
              <span style={{ color: theme.textMuted, fontSize: 12 }}>No phones, messengers, raw chats, private notes, or raw payment rows</span>
            </div>
            <pre style={jsonPreviewStyle}>{JSON.stringify({
              version: crmContext?.version,
              contextType: crmContext?.contextType || contextType,
              selectedContext,
              messages: crmContext?.messages,
              instagram: crmContext?.instagram,
            }, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
