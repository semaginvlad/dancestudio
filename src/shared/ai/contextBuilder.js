import { CRM_CONTEXT_TYPES, LATER_PHASE_CONTEXT_TYPES } from "./contextTypes";
import { AI_CONTEXT_DATA_POLICY, asArray, getGroupId, toCount } from "./privacy";

const displayGroup = (group = {}) => group.name || group.title || "група";

const summarizeLowAttendanceGroups = (dashboard = {}) => asArray(dashboard.lowAttendanceGroupRows)
  .map((row) => ({
    groupId: getGroupId(row),
    groupName: row.name || displayGroup(row),
    averageAttendance: toCount(row.average),
    heldSessions: toCount(row.held),
  }))
  .slice(0, 10);

const summarizeWaitlistDemand = ({ waitlist = [], groups = [] } = {}) => {
  const groupById = Object.fromEntries(asArray(groups).map((group) => [String(group.id), group]));
  const demandByGroup = asArray(waitlist).reduce((acc, row) => {
    const groupId = getGroupId(row);
    if (!["waiting", "contacted", ""].includes(String(row.status || "")) || !groupId) return acc;
    const key = String(groupId);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(demandByGroup)
    .map(([groupId, count]) => ({
      groupId,
      groupName: displayGroup(groupById[groupId]),
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
};

const summarizePaymentAnomalies = (paymentAnomalies = []) => {
  const byType = asArray(paymentAnomalies).reduce((acc, row) => {
    const key = row.type || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return {
    total: asArray(paymentAnomalies).length,
    byType,
  };
};

const summarizePopularDays = (popularDays = []) => asArray(popularDays)
  .slice(0, 7)
  .map((row) => ({ day: row.day, count: toCount(row.count) }));

export function buildCRMContext({
  proAnalytics = {},
  dashboard = {},
  paymentAnomalies = [],
  waitlist = [],
  groups = [],
  trainers = [],
} = {}) {
  const lowAttendanceGroupRows = summarizeLowAttendanceGroups(dashboard);
  const waitlistDemand = summarizeWaitlistDemand({ waitlist, groups });
  const paymentSummary = summarizePaymentAnomalies(paymentAnomalies);

  return {
    version: "crm-context-v1",
    dataPolicy: AI_CONTEXT_DATA_POLICY,
    availableContexts: Object.values(CRM_CONTEXT_TYPES),
    laterPhaseContexts: Object.values(LATER_PHASE_CONTEXT_TYPES),
    [CRM_CONTEXT_TYPES.GLOBAL]: {
      groupsCount: asArray(groups).length,
      trainersCount: asArray(trainers).length,
      hasDashboardSnapshot: Boolean(dashboard && Object.keys(dashboard).length),
      hasProAnalyticsSnapshot: Boolean(proAnalytics && Object.keys(proAnalytics).length),
    },
    [CRM_CONTEXT_TYPES.DASHBOARD]: {
      period: dashboard.period || null,
      endingSoon: toCount(dashboard.endingSoon),
      noActivePayment: toCount(dashboard.noActivePayment),
      lowAttendanceGroups: toCount(dashboard.lowAttendanceGroups || lowAttendanceGroupRows.length),
      deadGroups: toCount(dashboard.deadGroups),
      reserveDemand: toCount(dashboard.reserveDemand || waitlistDemand.length),
      weakSignals: asArray(dashboard.weakSignals).slice(0, 5),
      strongSignals: asArray(dashboard.strongSignals).slice(0, 5),
      lowAttendanceGroupRows,
    },
    [CRM_CONTEXT_TYPES.ATTENDANCE]: {
      lowAttendanceGroupRows,
      churnRiskCount: asArray(proAnalytics.churnRisk).length,
      bestAttendersCount: asArray(proAnalytics.bestAttenders).length,
      popularDays: summarizePopularDays(proAnalytics.popularDays),
    },
    [CRM_CONTEXT_TYPES.PAYMENTS]: {
      anomalies: paymentSummary,
      noActivePayment: toCount(dashboard.noActivePayment),
      endingSoon: toCount(dashboard.endingSoon),
    },
    [CRM_CONTEXT_TYPES.STUDENTS]: {
      churnRiskCount: asArray(proAnalytics.churnRisk).length,
      upsellCandidatesCount: asArray(proAnalytics.upsellCandidates).length,
      bestAttendersCount: asArray(proAnalytics.bestAttenders).length,
    },
    [CRM_CONTEXT_TYPES.GROUPS]: {
      total: asArray(groups).length,
      lowAttendanceGroupRows,
      waitlistDemand,
    },
    [CRM_CONTEXT_TYPES.TRAINERS]: {
      total: asArray(trainers).length,
    },
    [CRM_CONTEXT_TYPES.FORECAST]: {
      churnRiskCount: asArray(proAnalytics.churnRisk).length,
      upsellCandidatesCount: asArray(proAnalytics.upsellCandidates).length,
      reserveDemandGroups: waitlistDemand.length,
      paymentAnomalyTotal: paymentSummary.total,
    },
    messages: {
      status: "later-phase",
      included: false,
    },
    instagram: {
      status: "later-phase",
      included: false,
    },
  };
}
