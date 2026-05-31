import React, { useMemo, useState } from "react";
import { cardSt, theme } from "../shared/constants";
import { buildCRMContext } from "../shared/ai/contextBuilder";
import { CRM_CONTEXT_TYPES, CRM_CONTEXT_TYPE_LIST } from "../shared/ai/contextTypes";

const labelByContext = {
  global: "Загальний",
  dashboard: "Dashboard",
  attendance: "Відвідуваність",
  payments: "Оплати",
  students: "Учениці",
  groups: "Групи",
  trainers: "Тренери",
  forecast: "Прогноз",
};

const summaryLabelByKey = {
  students: "Учениці",
  studentsCount: "Учениці",
  groups: "Групи",
  groupsCount: "Групи",
  trainers: "Тренери",
  trainersCount: "Тренери",
  directions: "Напрямки",
  directionsCount: "Напрямки",
  studentGroupLinks: "Зв’язки учениць із групами",
  studentGroupLinksCount: "Зв’язки учениць із групами",
  paymentAnomalies: "Аномалії оплат",
  trialBookings: "Пробні заняття",
  trialBookingsCount: "Пробні заняття",
  cancelledLessons: "Скасовані заняття",
  cancelledCount: "Скасовані заняття",
  period: "Період",
  endingSoon: "Скоро завершуються",
  noActivePayment: "Без активної оплати",
  lowAttendanceGroups: "Групи з низькою відвідуваністю",
  reserveDemand: "Попит у резерві",
  strongSignals: "Сильні сигнали",
  weakSignals: "Слабкі сигнали",
  lowAttendanceGroupRows: "Групи з низькою відвідуваністю",
  recordsCount: "Записів",
  presentCount: "Присутні",
  absentCount: "Відсутні",
  byStatus: "Статуси",
  churnRiskCount: "Ризик відтоку",
  bestAttendersCount: "Найактивніші",
  popularDays: "Популярні дні",
  assignedCount: "Призначені",
  groupsWithoutTrainerCount: "Групи без тренера",
  coveredGroupsCount: "Покриті групи",
  sampleAssignments: "Приклади прив’язок",
  revenueByWeek: "Дохід по тижнях",
  revenueByMonth: "Дохід по місяцях",
  analyticsAvailable: "Аналітика доступна",
  total: "Усього",
  linkedToGroupsCount: "Учениці в групах",
  groupLinksCount: "Зв’язків із групами",
  subscriptionsCount: "Абонементи",
  subscriptionsByStatus: "Статуси абонементів",
  upsellCandidatesCount: "Кандидати на upsell",
  activeCount: "Активні",
  waitlistDemand: "Попит з резерву",
  topGroupsByStudents: "Топ груп за ученицями",
  topByGroups: "Топ за групами",
  sample: "Приклади",
  deadGroups: "Неактивні групи",
  reserveDemandGroups: "Групи з попитом у резерві",
  paymentAnomalyTotal: "Аномалії оплат",
};

const pluralizeUk = (count, forms) => {
  const abs = Math.abs(Number(count));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
};

const humanLabel = (label) => summaryLabelByKey[label] || label;

const compactValue = (value) => {
  if (Array.isArray(value)) return `${value.length} ${pluralizeUk(value.length, ["рядок", "рядки", "рядків"])}`;
  if (value && typeof value === "object") {
    const count = Object.keys(value).length;
    return `${count} ${pluralizeUk(count, ["тип", "типи", "типів"])}`;
  }
  if (typeof value === "boolean") return value ? "Так" : "Ні";
  return value ?? "—";
};

const getContextSection = (crmContext, contextType) => {
  if (crmContext?.contexts?.[contextType]) return crmContext.contexts[contextType];
  if (crmContext?.contextType === contextType && crmContext?.selectedContext) return crmContext.selectedContext;
  return crmContext?.[contextType] || {};
};

const SummaryGrid = ({ title, rows = [] }) => (
  <div style={{ ...cardSt, border: `1px solid ${theme.border}`, padding: 12 }}>
    <div style={{ fontWeight: 800, marginBottom: 8 }}>{title}</div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8 }}>
      {rows.map(([label, value]) => (
        <div key={label} style={{ background: theme.bg, borderRadius: 14, padding: 10 }}>
          <div style={{ fontSize: 11, color: theme.textMuted }}>{humanLabel(label)}</div>
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
  const [open, setOpen] = useState(true);
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
            <label style={{ fontWeight: 800 }} htmlFor="global-ai-context-type">Тип контексту</label>
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
            <span style={{ color: theme.textMuted, fontSize: 12 }}>Обрано: {labelByContext[crmContext?.contextType || contextType] || contextType}</span>
          </div>

          <SummaryGrid
            title="Ключові показники"
            rows={[
              ["students", global.studentsCount || students.length],
              ["groups", global.groupsCount || groups.length],
              ["trainers", global.trainersCount || trainers.length],
              ["directions", global.directionsCount || directionsList.length],
              ["studentGroupLinks", global.studentGroupLinksCount || studentGrps.length],
              ["paymentAnomalies", paymentsContext.anomalies?.total || paymentAnomalies.length],
              ["trialBookings", global.schedule?.trialBookingsCount || trialBookings.length],
              ["cancelledLessons", global.schedule?.cancelledCount || cancelled.length],
            ]}
          />

          <SummaryGrid
            title="Dashboard summary"
            rows={[
              ["period", dashboardContext.period ? `${dashboardContext.period.start || "?"}–${dashboardContext.period.end || "?"}` : "—"],
              ["endingSoon", dashboardContext.endingSoon],
              ["noActivePayment", dashboardContext.noActivePayment],
              ["lowAttendanceGroups", dashboardContext.lowAttendanceGroups],
              ["reserveDemand", dashboardContext.reserveDemand],
              ["strongSignals", dashboardContext.strongSignals],
              ["weakSignals", dashboardContext.weakSignals],
              ["lowAttendanceGroupRows", dashboardContext.lowAttendanceGroupRows],
            ]}
          />

          <SummaryGrid title={`${labelByContext[contextType] || contextType}: коротко`} rows={selectedRows} />

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => setShowTechnicalJson((value) => !value)}
              style={{
                border: `1px solid ${theme.border}`,
                borderRadius: 999,
                background: theme.bg,
                color: theme.textMuted,
                padding: "8px 12px",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {showTechnicalJson ? "Сховати технічний JSON" : "Показати технічний JSON"}
            </button>
          </div>

          {showTechnicalJson && (
            <div style={{ display: "grid", gap: 12 }}>
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
      )}
    </div>
  );
}
