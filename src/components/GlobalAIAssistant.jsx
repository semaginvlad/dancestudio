import React, { useMemo, useState } from "react";
import { cardSt, theme } from "../shared/constants";
import { buildCRMContext } from "../shared/ai/contextBuilder";
import { CRM_CONTEXT_TYPES, CRM_CONTEXT_TYPE_LIST } from "../shared/ai/contextTypes";

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
  const [showTechnicalJson, setShowTechnicalJson] = useState(false);
  const [contextType, setContextType] = useState(CRM_CONTEXT_TYPES.GLOBAL);

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
  const policy = crmContext?.dataPolicy || {};
  const excludedData = Array.isArray(policy.excludes) ? policy.excludes.slice(0, 6).join(", ") : "phones, messengers, raw chats";

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
            AI API ще не підключено · No external AI calls · Read-only aggregate context
          </div>
        </div>
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

          <SummaryGrid
            title="Privacy / data policy"
            rows={[
              ["PII mode", policy.pii || "minimized"],
              ["Data mode", policy.mode || "aggregate-only"],
              ["Excluded data", excludedData],
              ["External AI calls", "No"],
            ]}
          />

          <div style={{ ...cardSt, border: `1px solid ${theme.border}`, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <div>
                <b>Technical JSON preview</b>
                <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 3 }}>
                  Згорнуто за замовчуванням: summary cards вище є основним preview для адміністраторів.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTechnicalJson((value) => !value)}
                style={{
                  border: `1px solid ${theme.border}`,
                  borderRadius: 999,
                  background: showTechnicalJson ? theme.primary : theme.card,
                  color: showTechnicalJson ? "#fff" : theme.textMain,
                  padding: "8px 12px",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {showTechnicalJson ? "Сховати технічний JSON" : "Показати технічний JSON"}
              </button>
            </div>
            {showTechnicalJson && (
              <pre style={{ ...jsonPreviewStyle, marginTop: 10 }}>{JSON.stringify({
                version: crmContext?.version,
                contextType: crmContext?.contextType || contextType,
                dataPolicy: crmContext?.dataPolicy,
                selectedContext,
                messages: crmContext?.messages,
                instagram: crmContext?.instagram,
              }, null, 2)}</pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
