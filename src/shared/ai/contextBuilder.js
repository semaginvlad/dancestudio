import { CRM_CONTEXT_TYPES, CRM_CONTEXT_TYPE_LIST, DEFAULT_CRM_CONTEXT_TYPE, LATER_PHASE_CONTEXT_TYPES, isCRMContextType } from "./contextTypes";
import {
  AI_CONTEXT_DATA_POLICY,
  asArray,
  getGroupId,
  getStudentId,
  getTrainerId,
  toCount,
} from "./privacy";

const displayGroup = (group = {}) => group.name || group.title || "група";
const displayDirection = (direction = {}) => direction.name || direction.title || "напрям";

const byId = (rows, getId = (row) => row?.id) => Object.fromEntries(
  asArray(rows)
    .map((row) => [getId(row), row])
    .filter(([id]) => id !== null && id !== undefined && id !== "")
    .map(([id, row]) => [String(id), row]),
);

const countBy = (rows, keyFn) => asArray(rows).reduce((acc, row) => {
  const key = keyFn(row);
  if (key === null || key === undefined || key === "") return acc;
  const normalized = String(key);
  acc[normalized] = (acc[normalized] || 0) + 1;
  return acc;
}, {});

const topEntries = (map, limit = 10) => Object.entries(map)
  .map(([id, count]) => ({ id, count }))
  .sort((a, b) => b.count - a.count)
  .slice(0, limit);

const summarizeStatuses = (rows, statusKey = "status") => countBy(rows, (row) => row?.[statusKey] || "unknown");

const summarizeLowAttendanceGroups = (dashboard = {}) => asArray(dashboard.lowAttendanceGroupRows)
  .map((row) => ({
    groupId: getGroupId(row),
    groupName: row.name || displayGroup(row),
    averageAttendance: toCount(row.average),
    heldSessions: toCount(row.held),
  }))
  .slice(0, 10);

const summarizeWaitlistDemand = ({ waitlist = [], groups = [] } = {}) => {
  const groupById = byId(groups);
  const demandByGroup = asArray(waitlist).reduce((acc, row) => {
    const groupId = getGroupId(row);
    if (!groupId || !["waiting", "contacted", ""].includes(String(row.status || ""))) return acc;
    const key = String(groupId);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return topEntries(demandByGroup).map(({ id: groupId, count }) => ({
    groupId,
    groupName: displayGroup(groupById[groupId]),
    count,
  }));
};

const summarizePaymentAnomalies = (paymentAnomalies = []) => {
  const rows = asArray(paymentAnomalies);
  return {
    total: rows.length,
    byType: countBy(rows, (row) => row.type || "unknown"),
    affectedStudents: new Set(rows.map(getStudentId).filter(Boolean).map(String)).size,
    affectedGroups: new Set(rows.map(getGroupId).filter(Boolean).map(String)).size,
  };
};

const summarizePopularDays = (popularDays = []) => asArray(popularDays)
  .slice(0, 7)
  .map((row) => ({ day: row.day, count: toCount(row.count) }));

const summarizeAttendance = ({ attn = [], dashboard = {}, proAnalytics = {} } = {}) => {
  const rows = asArray(attn);
  const presentRows = rows.filter((row) => ["present", "visited", "attended", true].includes(row.status ?? row.present));
  return {
    recordsCount: rows.length,
    presentCount: presentRows.length,
    absentCount: Math.max(rows.length - presentRows.length, 0),
    byStatus: summarizeStatuses(rows),
    lowAttendanceGroupRows: summarizeLowAttendanceGroups(dashboard),
    churnRiskCount: asArray(proAnalytics.churnRisk).length,
    bestAttendersCount: asArray(proAnalytics.bestAttenders).length,
    popularDays: summarizePopularDays(proAnalytics.popularDays),
  };
};

const summarizeStudents = ({ students = [], studentGrps = [], subs = [], proAnalytics = {} } = {}) => ({
  total: asArray(students).length,
  linkedToGroupsCount: new Set(asArray(studentGrps).map(getStudentId).filter(Boolean).map(String)).size,
  groupLinksCount: asArray(studentGrps).length,
  subscriptionsCount: asArray(subs).length,
  subscriptionsByStatus: summarizeStatuses(subs),
  churnRiskCount: asArray(proAnalytics.churnRisk).length,
  upsellCandidatesCount: asArray(proAnalytics.upsellCandidates).length,
  bestAttendersCount: asArray(proAnalytics.bestAttenders).length,
});

const summarizeGroups = ({ groups = [], studentGrps = [], trainers = [], trainerGroups = [], waitlist = [], dashboard = {}, directionsList = [] } = {}) => {
  const directionById = byId(directionsList);
  const studentsByGroup = countBy(studentGrps, getGroupId);
  const trainersByGroup = countBy(trainerGroups, getGroupId);
  const groupRows = asArray(groups).slice(0, 25).map((group) => {
    const groupId = String(getGroupId(group) ?? group.id ?? "");
    return {
      groupId: groupId || null,
      groupName: displayGroup(group),
      directionName: displayDirection(directionById[String(group.directionId ?? group.direction_id ?? "")] || group.direction),
      studentsCount: studentsByGroup[groupId] || 0,
      trainersCount: trainersByGroup[groupId] || (getTrainerId(group) ? 1 : 0),
    };
  });

  return {
    total: asArray(groups).length,
    activeCount: asArray(groups).filter((group) => group.active !== false && group.archived !== true).length,
    trainersCount: asArray(trainers).length,
    lowAttendanceGroupRows: summarizeLowAttendanceGroups(dashboard),
    waitlistDemand: summarizeWaitlistDemand({ waitlist, groups }),
    topGroupsByStudents: topEntries(studentsByGroup).map(({ id: groupId, count }) => ({
      groupId,
      groupName: displayGroup(byId(groups)[groupId]),
      studentsCount: count,
    })),
    sample: groupRows,
  };
};

const summarizeTrainers = ({ trainers = [], trainerGroups = [], groups = [] } = {}) => {
  const trainerGroupCounts = countBy(trainerGroups, getTrainerId);
  const groupById = byId(groups);
  return {
    total: asArray(trainers).length,
    assignedCount: Object.keys(trainerGroupCounts).length,
    topByGroups: topEntries(trainerGroupCounts).map(({ id: trainerId, count }) => ({ trainerId, groupsCount: count })),
    groupsWithoutTrainerCount: asArray(groups).filter((group) => !getTrainerId(group)).length,
    coveredGroupsCount: new Set(asArray(trainerGroups).map(getGroupId).filter(Boolean).map(String)).size,
    sampleAssignments: asArray(trainerGroups).slice(0, 15).map((row) => {
      const groupId = getGroupId(row);
      return { trainerId: getTrainerId(row), groupId, groupName: displayGroup(groupById[String(groupId)]) };
    }),
  };
};

const summarizeSchedule = ({ cancelled = [], roomBookings = [], groupLessonOverrides = [], trialBookings = [] } = {}) => ({
  cancelledCount: asArray(cancelled).length,
  cancelledByGroup: topEntries(countBy(cancelled, getGroupId)),
  roomBookingsCount: asArray(roomBookings).length,
  lessonOverridesCount: asArray(groupLessonOverrides).length,
  trialBookingsCount: asArray(trialBookings).length,
  trialBookingsByStatus: summarizeStatuses(trialBookings),
});

const summarizeDashboard = ({ dashboard = {}, waitlist = [], groups = [] } = {}) => {
  const lowAttendanceGroupRows = summarizeLowAttendanceGroups(dashboard);
  const waitlistDemand = summarizeWaitlistDemand({ waitlist, groups });
  return {
    period: dashboard.period || null,
    endingSoon: toCount(dashboard.endingSoon),
    noActivePayment: toCount(dashboard.noActivePayment),
    lowAttendanceGroups: toCount(dashboard.lowAttendanceGroups || lowAttendanceGroupRows.length),
    deadGroups: toCount(dashboard.deadGroups),
    reserveDemand: toCount(dashboard.reserveDemand || waitlistDemand.length),
    weakSignals: asArray(dashboard.weakSignals).slice(0, 5),
    strongSignals: asArray(dashboard.strongSignals).slice(0, 5),
    lowAttendanceGroupRows,
  };
};

export function buildCRMContext({
  contextType = DEFAULT_CRM_CONTEXT_TYPE,
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
  options = {},
} = {}) {
  const requestedContext = isCRMContextType(contextType) ? contextType : DEFAULT_CRM_CONTEXT_TYPE;
  const dashboardContext = summarizeDashboard({ dashboard, waitlist, groups });
  const attendanceContext = summarizeAttendance({ attn, dashboard, proAnalytics });
  const paymentSummary = summarizePaymentAnomalies(paymentAnomalies);
  const studentsContext = summarizeStudents({ students, studentGrps, subs, proAnalytics });
  const groupsContext = summarizeGroups({ groups, studentGrps, trainers, trainerGroups, waitlist, dashboard, directionsList });
  const trainersContext = summarizeTrainers({ trainers, trainerGroups, groups });
  const scheduleContext = summarizeSchedule({ cancelled, roomBookings, groupLessonOverrides, trialBookings });

  const contexts = {
    [CRM_CONTEXT_TYPES.GLOBAL]: {
      studentsCount: asArray(students).length,
      groupsCount: asArray(groups).length,
      trainersCount: asArray(trainers).length,
      directionsCount: asArray(directionsList).length,
      studentGroupLinksCount: asArray(studentGrps).length,
      hasDashboardSnapshot: Boolean(dashboard && Object.keys(dashboard).length),
      hasAnalyticsSnapshot: Boolean(analytics && Object.keys(analytics).length),
      hasProAnalyticsSnapshot: Boolean(proAnalytics && Object.keys(proAnalytics).length),
      schedule: scheduleContext,
    },
    [CRM_CONTEXT_TYPES.DASHBOARD]: dashboardContext,
    [CRM_CONTEXT_TYPES.ATTENDANCE]: attendanceContext,
    [CRM_CONTEXT_TYPES.PAYMENTS]: {
      anomalies: paymentSummary,
      subscriptionsCount: asArray(subs).length,
      subscriptionsByStatus: summarizeStatuses(subs),
      noActivePayment: toCount(dashboard.noActivePayment),
      endingSoon: toCount(dashboard.endingSoon),
    },
    [CRM_CONTEXT_TYPES.STUDENTS]: studentsContext,
    [CRM_CONTEXT_TYPES.GROUPS]: groupsContext,
    [CRM_CONTEXT_TYPES.TRAINERS]: trainersContext,
    [CRM_CONTEXT_TYPES.FORECAST]: {
      churnRiskCount: asArray(proAnalytics.churnRisk).length,
      upsellCandidatesCount: asArray(proAnalytics.upsellCandidates).length,
      reserveDemandGroups: groupsContext.waitlistDemand.length,
      paymentAnomalyTotal: paymentSummary.total,
      trialBookingsCount: scheduleContext.trialBookingsCount,
      cancelledCount: scheduleContext.cancelledCount,
      analyticsAvailable: Boolean(analytics && Object.keys(analytics).length),
    },
  };

  return {
    version: "crm-context-v1.1",
    contextType: requestedContext,
    dataPolicy: AI_CONTEXT_DATA_POLICY,
    availableContexts: CRM_CONTEXT_TYPE_LIST,
    laterPhaseContexts: Object.values(LATER_PHASE_CONTEXT_TYPES),
    options: {
      locale: options.locale || "uk-UA",
      maxRowsPerSection: toCount(options.maxRowsPerSection || 10),
    },
    contexts,
    selectedContext: contexts[requestedContext],
    messages: {
      status: "later-phase",
      included: false,
      note: "Message content and raw chats are intentionally excluded from Phase 1.1 context.",
    },
    instagram: {
      status: "later-phase",
      included: false,
      note: "Instagram data is a later-phase placeholder and is not included in Phase 1.1 context.",
    },
  };
}
