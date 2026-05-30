import { CRM_CONTEXT_TYPES, LATER_PHASE_CONTEXT_TYPES, isCRMContextType } from "./contextTypes.js";
import {
  AI_CONTEXT_DATA_POLICY,
  asArray,
  countBy,
  getDateKey,
  getGroupId,
  getMonthKey,
  getStudentId,
  getTrainerId,
  getWeekKey,
  pseudonymizeStudentRef,
  safeNumber,
  safeString,
  sumBy,
} from "./privacy.js";

const UNKNOWN_GROUP_ID = "unknown";
const ACTIVE_WAITLIST_STATUSES = new Set(["waiting", "contacted", ""]);
const ACTIVE_TRIAL_STATUSES = new Set(["new", "scheduled", "confirmed", ""]);
const PAID_PLAN_TYPES = new Set(["subscription", "monthly", "pack", "package", "unlimited", "regular"]);

const displayGroup = (group = {}) => group.name || group.title || "група";
const displayTrainer = (trainer = {}) => trainer.name || [trainer.firstName, trainer.lastName].filter(Boolean).join(" ").trim() || "trainer";

const idKey = (value) => (value === null || value === undefined || value === "" ? null : String(value));
const sortByTotalDesc = (a, b) => safeNumber(b.total ?? b.count ?? b.attendanceQuantity) - safeNumber(a.total ?? a.count ?? a.attendanceQuantity);
const round = (value, digits = 2) => Number(safeNumber(value).toFixed(digits));

const getSubStatus = (sub = {}, referenceDate = null) => {
  const explicitStatus = safeString(sub.status).toLowerCase();
  if (explicitStatus) return explicitStatus;
  const endDate = getDateKey(sub.endDate ?? sub.end_date);
  if (referenceDate && endDate && endDate < referenceDate) return "expired";
  return "active";
};

const isActiveSubscription = (sub, referenceDate) => getSubStatus(sub, referenceDate) !== "expired";
const isPaidSubscription = (sub = {}) => sub.paid === true || safeString(sub.paid).toLowerCase() === "true";
const getSubAmount = (sub = {}) => safeNumber(sub.amount ?? sub.total ?? sub.price ?? sub.basePrice ?? sub.base_price);
const getSubPlanType = (sub = {}) => safeString(sub.planType ?? sub.plan_type, "unknown") || "unknown";
const getSubReferenceDate = (sub = {}) => getDateKey(sub.activationDate ?? sub.activation_date ?? sub.startDate ?? sub.start_date ?? sub.createdAt ?? sub.created_at);
const getSubEndDate = (sub = {}) => getDateKey(sub.endDate ?? sub.end_date);
const getAttendanceQuantity = (row = {}) => safeNumber(row.quantity, 1);
const getAttendanceDate = (row = {}) => getDateKey(row.date ?? row.attendanceDate ?? row.attendance_date ?? row.createdAt ?? row.created_at);
const getTrialDate = (row = {}) => getDateKey(row.trialDate ?? row.trial_date ?? row.date ?? row.createdAt ?? row.created_at);

const maxDateKey = (...collections) => asArray(collections).flatMap(asArray).reduce((max, row) => {
  const key = getDateKey(row);
  return key && (!max || key > max) ? key : max;
}, null);

const addDays = (dateKey, days) => {
  if (!dateKey) return null;
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const objectEntriesToRows = (object, mapper) => Object.entries(object || {}).map(([key, value]) => mapper(key, value));

const summarizePaymentAnomalies = (paymentAnomalies = []) => ({
  total: asArray(paymentAnomalies).length,
  byType: countBy(paymentAnomalies, (row) => row.type || "unknown"),
});

const summarizeWaitlistDemand = ({ waitlist = [], groups = [] } = {}) => {
  const groupById = Object.fromEntries(asArray(groups).map((group) => [String(group.id), group]));
  const activeRows = asArray(waitlist).filter((row) => ACTIVE_WAITLIST_STATUSES.has(String(row.status || "")));
  const byGroup = activeRows.reduce((acc, row) => {
    const groupId = idKey(getGroupId(row));
    if (!groupId) return acc;
    acc[groupId] = (acc[groupId] || 0) + 1;
    return acc;
  }, {});

  return objectEntriesToRows(byGroup, (groupId, count) => ({
    groupId,
    groupName: displayGroup(groupById[groupId]),
    count,
  })).sort((a, b) => b.count - a.count).slice(0, 20);
};

const summarizeTrialBookings = (trialBookings = []) => {
  const rows = asArray(trialBookings);
  return {
    total: rows.length,
    active: rows.filter((row) => ACTIVE_TRIAL_STATUSES.has(String(row.status || ""))).length,
    converted: rows.filter((row) => row.convertedStudentId || row.converted_student_id || String(row.status || "").toLowerCase() === "converted").length,
    byStatus: countBy(rows, (row) => row.status || "unknown"),
    byWeek: countBy(rows, (row) => getWeekKey(getTrialDate(row))),
    byMonth: countBy(rows, (row) => getMonthKey(getTrialDate(row))),
  };
};

const summarizeScheduleInputs = ({ cancelled = [], roomBookings = [], groupLessonOverrides = [], directionsList = [] } = {}) => ({
  directionsCount: asArray(directionsList).length,
  cancelledLessonsCount: asArray(cancelled).length,
  roomBookingsCount: asArray(roomBookings).length,
  activeRoomBookingsCount: asArray(roomBookings).filter((row) => String(row.status || "active") === "active").length,
  lessonOverridesCount: asArray(groupLessonOverrides).length,
  activeLessonOverridesCount: asArray(groupLessonOverrides).filter((row) => String(row.status || "active") === "active").length,
});

const buildSubscriptionIndexes = (subs = [], referenceDate = null) => {
  const rows = asArray(subs);
  const activeRows = rows.filter((row) => isActiveSubscription(row, referenceDate));
  const expiredRows = rows.filter((row) => getSubStatus(row, referenceDate) === "expired");
  const paidRows = rows.filter(isPaidSubscription);
  const unpaidRows = rows.filter((row) => row.paid === false || safeString(row.paid).toLowerCase() === "false");
  const revenueTotal = sumBy(rows, getSubAmount);

  return {
    rows,
    activeRows,
    expiredRows,
    paidRows,
    unpaidRows,
    revenueTotal,
    activeStudentIds: new Set(activeRows.map(getStudentId).map(idKey).filter(Boolean)),
    activeByStudentId: activeRows.reduce((acc, row) => {
      const studentId = idKey(getStudentId(row));
      if (studentId) acc[studentId] = (acc[studentId] || 0) + 1;
      return acc;
    }, {}),
    revenueByGroupId: rows.reduce((acc, row) => {
      const groupId = idKey(getGroupId(row));
      if (!groupId) return acc;
      acc[groupId] = (acc[groupId] || 0) + getSubAmount(row);
      return acc;
    }, {}),
  };
};

const buildAttendanceContext = ({ attn = [], groups = [] } = {}) => {
  const rows = asArray(attn);
  const groupById = Object.fromEntries(asArray(groups).map((group) => [String(group.id), group]));
  const byGroupMap = rows.reduce((acc, row) => {
    const groupId = idKey(getGroupId(row)) || UNKNOWN_GROUP_ID;
    if (!acc[groupId]) {
      acc[groupId] = {
        groupId: groupId === UNKNOWN_GROUP_ID ? null : groupId,
        groupName: groupId === UNKNOWN_GROUP_ID ? "Unknown group" : displayGroup(groupById[groupId]),
        entries: 0,
        attendanceQuantity: 0,
        uniqueStudentIds: new Set(),
        dates: new Set(),
      };
    }
    const studentId = idKey(getStudentId(row));
    acc[groupId].entries += 1;
    acc[groupId].attendanceQuantity += getAttendanceQuantity(row);
    if (studentId) acc[groupId].uniqueStudentIds.add(studentId);
    const dateKey = getAttendanceDate(row);
    if (dateKey) acc[groupId].dates.add(dateKey);
    return acc;
  }, {});

  const attendanceByGroup = Object.values(byGroupMap).map((row) => ({
    groupId: row.groupId,
    groupName: row.groupName,
    entries: row.entries,
    attendanceQuantity: row.attendanceQuantity,
    uniqueStudents: row.uniqueStudentIds.size,
    activeDates: row.dates.size,
    averagePerActiveDate: row.dates.size ? round(row.attendanceQuantity / row.dates.size) : 0,
  })).sort(sortByTotalDesc);
  const lowAttendanceGroups = attendanceByGroup
    .filter((row) => row.groupId && row.averagePerActiveDate > 0 && row.averagePerActiveDate < 4)
    .sort((a, b) => a.averagePerActiveDate - b.averagePerActiveDate)
    .slice(0, 20);

  return {
    totalEntries: rows.length,
    totalQuantity: sumBy(rows, getAttendanceQuantity),
    uniqueAttendedStudents: new Set(rows.map(getStudentId).map(idKey).filter(Boolean)).size,
    attendanceByGroup,
    attendanceByWeek: countBy(rows, (row) => getWeekKey(getAttendanceDate(row))),
    attendanceQuantityByWeek: Object.fromEntries(Object.entries(rows.reduce((acc, row) => {
      const key = getWeekKey(getAttendanceDate(row));
      if (key) acc[key] = (acc[key] || 0) + getAttendanceQuantity(row);
      return acc;
    }, {})).sort(([a], [b]) => a.localeCompare(b))),
    attendanceByMonth: countBy(rows, (row) => getMonthKey(getAttendanceDate(row))),
    attendanceQuantityByMonth: Object.fromEntries(Object.entries(rows.reduce((acc, row) => {
      const key = getMonthKey(getAttendanceDate(row));
      if (key) acc[key] = (acc[key] || 0) + getAttendanceQuantity(row);
      return acc;
    }, {})).sort(([a], [b]) => a.localeCompare(b))),
    lowAttendanceGroups,
    averageAttendancePerGroup: attendanceByGroup.map((row) => ({
      groupId: row.groupId,
      groupName: row.groupName,
      averagePerActiveDate: row.averagePerActiveDate,
    })),
    unknownGroupEntries: byGroupMap[UNKNOWN_GROUP_ID]?.entries || 0,
  };
};

const buildPaymentsContext = ({ subs = [], paymentAnomalies = [], referenceDate = null } = {}) => {
  const index = buildSubscriptionIndexes(subs, referenceDate);
  const expiringUntil = addDays(referenceDate, 14);
  const expiringSoonCount = expiringUntil
    ? index.activeRows.filter((row) => {
      const endDate = getSubEndDate(row);
      return endDate && endDate >= referenceDate && endDate <= expiringUntil;
    }).length
    : 0;

  return {
    totalSubscriptions: index.rows.length,
    activeSubscriptions: index.activeRows.length,
    expiredSubscriptions: index.expiredRows.length,
    paidCount: index.paidRows.length,
    unpaidCount: index.unpaidRows.length,
    revenueTotal: index.revenueTotal,
    revenueByWeek: Object.fromEntries(Object.entries(index.rows.reduce((acc, row) => {
      const key = getWeekKey(getSubReferenceDate(row));
      if (key) acc[key] = (acc[key] || 0) + getSubAmount(row);
      return acc;
    }, {})).sort(([a], [b]) => a.localeCompare(b))),
    revenueByMonth: Object.fromEntries(Object.entries(index.rows.reduce((acc, row) => {
      const key = getMonthKey(getSubReferenceDate(row));
      if (key) acc[key] = (acc[key] || 0) + getSubAmount(row);
      return acc;
    }, {})).sort(([a], [b]) => a.localeCompare(b))),
    subscriptionsByPlanType: countBy(index.rows, getSubPlanType),
    paidPackSubscriptions: index.rows.filter((row) => PAID_PLAN_TYPES.has(getSubPlanType(row))).length,
    expiringSoonCount,
    anomalies: summarizePaymentAnomalies(paymentAnomalies),
  };
};

const buildStudentsContext = ({ students = [], studentGrps = [], subs = [], attn = [], proAnalytics = {}, referenceDate = null } = {}) => {
  const studentRows = asArray(students);
  const membershipStudentIds = new Set(asArray(studentGrps).map(getStudentId).map(idKey).filter(Boolean));
  const attendedStudentIds = new Set(asArray(attn).map(getStudentId).map(idKey).filter(Boolean));
  const subIndex = buildSubscriptionIndexes(subs, referenceDate);
  const studentIds = studentRows.map((row) => idKey(row.id ?? getStudentId(row))).filter(Boolean);
  const inactiveIds = studentIds.filter((studentId) => !attendedStudentIds.has(studentId));
  const noActiveSubIds = studentIds.filter((studentId) => !subIndex.activeStudentIds.has(studentId));
  const hasGroupNoActiveSubIds = studentIds.filter((studentId) => membershipStudentIds.has(studentId) && !subIndex.activeStudentIds.has(studentId));
  const activeIds = studentIds.filter((studentId) => attendedStudentIds.has(studentId) || subIndex.activeStudentIds.has(studentId));

  return {
    totalStudents: studentRows.length,
    studentsWithGroupMembership: membershipStudentIds.size,
    studentsWithAttendance: attendedStudentIds.size,
    studentsWithActiveSubscription: subIndex.activeStudentIds.size,
    churnRiskCount: asArray(proAnalytics.churnRisk).length,
    upsellCandidatesCount: asArray(proAnalytics.upsellCandidates).length,
    bestAttendersCount: asArray(proAnalytics.bestAttenders).length,
    lifecycleBuckets: {
      active: activeIds.length,
      inactiveNoAttendance: inactiveIds.length,
      noActiveSubscription: noActiveSubIds.length,
      hasGroupButNoActiveSubscription: hasGroupNoActiveSubIds.length,
    },
    pseudonymizedExamples: {
      inactiveNoAttendance: inactiveIds.slice(0, 5).map((studentId) => pseudonymizeStudentRef({ studentId })),
      hasGroupButNoActiveSubscription: hasGroupNoActiveSubIds.slice(0, 5).map((studentId) => pseudonymizeStudentRef({ studentId })),
    },
  };
};

const buildGroupsContext = ({ groups = [], studentGrps = [], subs = [], attn = [], waitlist = [], referenceDate = null } = {}) => {
  const attendance = buildAttendanceContext({ attn, groups });
  const subIndex = buildSubscriptionIndexes(subs, referenceDate);
  const waitlistDemand = summarizeWaitlistDemand({ waitlist, groups });
  const attendanceByGroup = Object.fromEntries(attendance.attendanceByGroup.map((row) => [String(row.groupId), row]));
  const studentCountByGroup = asArray(studentGrps).reduce((acc, row) => {
    const groupId = idKey(getGroupId(row));
    const studentId = idKey(getStudentId(row));
    if (!groupId || !studentId) return acc;
    if (!acc[groupId]) acc[groupId] = new Set();
    acc[groupId].add(studentId);
    return acc;
  }, {});
  const waitlistByGroup = Object.fromEntries(waitlistDemand.map((row) => [String(row.groupId), row.count]));

  const groupHealth = asArray(groups).map((group) => {
    const groupId = idKey(group.id ?? getGroupId(group));
    const attendanceRow = attendanceByGroup[groupId] || {};
    const attendanceQuantity = safeNumber(attendanceRow.attendanceQuantity);
    const averageAttendance = safeNumber(attendanceRow.averagePerActiveDate);
    const waitlistCount = safeNumber(waitlistByGroup[groupId]);
    const flags = [];
    if (averageAttendance > 0 && averageAttendance < 4) flags.push("low_attendance");
    if (waitlistCount > 0) flags.push("waitlist_demand");
    if (attendanceQuantity === 0) flags.push("no_recent_activity");

    return {
      groupId,
      groupName: displayGroup(group),
      studentsCount: studentCountByGroup[groupId]?.size || 0,
      attendanceEntries: safeNumber(attendanceRow.entries),
      attendanceQuantity,
      averageAttendance,
      revenue: safeNumber(subIndex.revenueByGroupId[groupId]),
      waitlistDemand: waitlistCount,
      flags,
    };
  });

  return {
    groupCount: asArray(groups).length,
    studentCountPerGroup: groupHealth.map(({ groupId, groupName, studentsCount }) => ({ groupId, groupName, studentsCount })),
    attendancePerGroup: groupHealth.map(({ groupId, groupName, attendanceEntries, attendanceQuantity }) => ({ groupId, groupName, attendanceEntries, attendanceQuantity })),
    averageAttendancePerGroup: groupHealth.map(({ groupId, groupName, averageAttendance }) => ({ groupId, groupName, averageAttendance })),
    revenuePerGroup: groupHealth.map(({ groupId, groupName, revenue }) => ({ groupId, groupName, revenue })).sort((a, b) => b.revenue - a.revenue),
    waitlistDemandPerGroup: waitlistDemand,
    health: groupHealth,
    topGroupsByAttendance: [...groupHealth].sort((a, b) => b.attendanceQuantity - a.attendanceQuantity).slice(0, 10),
    lowGroupsByAttendance: groupHealth.filter((row) => row.flags.includes("low_attendance") || row.flags.includes("no_recent_activity")).slice(0, 10),
  };
};

const buildTrainerAssignments = ({ trainers = [], trainerGroups = [], groups = [] } = {}) => {
  const assignments = asArray(trainerGroups).reduce((acc, row) => {
    const trainerId = idKey(getTrainerId(row));
    const groupId = idKey(getGroupId(row));
    if (!trainerId || !groupId) return acc;
    if (!acc[trainerId]) acc[trainerId] = new Set();
    acc[trainerId].add(groupId);
    return acc;
  }, {});

  asArray(groups).forEach((group) => {
    const trainerId = idKey(getTrainerId(group));
    const groupId = idKey(group.id ?? getGroupId(group));
    if (!trainerId || !groupId) return;
    if (!assignments[trainerId]) assignments[trainerId] = new Set();
    assignments[trainerId].add(groupId);
  });

  asArray(trainers).forEach((trainer) => {
    const trainerId = idKey(trainer.id ?? getTrainerId(trainer));
    if (trainerId && !assignments[trainerId]) assignments[trainerId] = new Set();
  });

  return assignments;
};

const buildTrainersContext = ({ trainers = [], trainerGroups = [], groups = [], subs = [], attn = [], referenceDate = null } = {}) => {
  const assignments = buildTrainerAssignments({ trainers, trainerGroups, groups });
  const trainerById = Object.fromEntries(asArray(trainers).map((trainer) => [String(trainer.id), trainer]));
  const attendance = buildAttendanceContext({ attn, groups });
  const attendanceByGroup = Object.fromEntries(attendance.attendanceByGroup.map((row) => [String(row.groupId), row]));
  const subIndex = buildSubscriptionIndexes(subs, referenceDate);
  const rows = Object.entries(assignments).map(([trainerId, groupSet]) => {
    const groupIds = [...groupSet];
    const attendanceQuantity = groupIds.reduce((sum, groupId) => sum + safeNumber(attendanceByGroup[groupId]?.attendanceQuantity), 0);
    const revenue = groupIds.reduce((sum, groupId) => sum + safeNumber(subIndex.revenueByGroupId[groupId]), 0);
    return {
      trainerId,
      trainerName: displayTrainer(trainerById[trainerId]),
      groupsCount: groupIds.length,
      groupIds,
      attendanceQuantity,
      revenue,
    };
  }).sort((a, b) => b.attendanceQuantity - a.attendanceQuantity);

  return {
    trainerCount: asArray(trainers).length,
    groupsPerTrainer: rows.map(({ trainerId, trainerName, groupsCount, groupIds }) => ({ trainerId, trainerName, groupsCount, groupIds })),
    attendancePerTrainer: rows.map(({ trainerId, trainerName, attendanceQuantity }) => ({ trainerId, trainerName, attendanceQuantity })),
    revenuePerTrainer: rows.map(({ trainerId, trainerName, revenue }) => ({ trainerId, trainerName, revenue })).sort((a, b) => b.revenue - a.revenue),
  };
};

const buildForecastContext = ({ paymentsContext, attendanceContext, trialBookings = [], subs = [], proAnalytics = {}, groupsContext } = {}) => ({
  revenueByWeek: paymentsContext.revenueByWeek,
  revenueByMonth: paymentsContext.revenueByMonth,
  attendanceByWeek: attendanceContext.attendanceQuantityByWeek,
  attendanceByMonth: attendanceContext.attendanceQuantityByMonth,
  trialsByWeek: countBy(trialBookings, (row) => getWeekKey(getTrialDate(row))),
  newSubscriptionsByWeek: countBy(subs, (row) => getWeekKey(getSubReferenceDate(row))),
  churnRiskCount: asArray(proAnalytics.churnRisk).length,
  groupHealthSnapshot: groupsContext.health.map((row) => ({
    groupId: row.groupId,
    groupName: row.groupName,
    attendanceQuantity: row.attendanceQuantity,
    averageAttendance: row.averageAttendance,
    revenue: row.revenue,
    waitlistDemand: row.waitlistDemand,
    flags: row.flags,
  })),
});

const buildDashboardContext = ({ dashboard = {}, globalContext, forecastContext, paymentAnomalies = [], waitlistDemand = [], lowAttendanceGroupRows = [] } = {}) => ({
  period: dashboard.period || null,
  endingSoon: safeNumber(dashboard.endingSoon),
  noActivePayment: safeNumber(dashboard.noActivePayment),
  lowAttendanceGroups: safeNumber(dashboard.lowAttendanceGroups || lowAttendanceGroupRows.length),
  deadGroups: safeNumber(dashboard.deadGroups),
  reserveDemand: safeNumber(dashboard.reserveDemand || waitlistDemand.length),
  weakSignals: asArray(dashboard.weakSignals).slice(0, 5),
  strongSignals: asArray(dashboard.strongSignals).slice(0, 5),
  lowAttendanceGroupRows,
  crmGlobalSummary: {
    totalStudents: globalContext.totalStudents,
    totalGroups: globalContext.totalGroups,
    totalTrainers: globalContext.totalTrainers,
    activeStudents: globalContext.activeStudentsCount,
    activeGroups: globalContext.activeGroupsCount,
    totalRevenueEstimate: globalContext.totalRevenueEstimate,
  },
  forecastReady: globalContext.forecastReady,
  paymentAnomalies: summarizePaymentAnomalies(paymentAnomalies),
  waitlistDemand,
  forecastPreview: {
    revenueWeeks: Object.keys(forecastContext.revenueByWeek || {}).length,
    attendanceWeeks: Object.keys(forecastContext.attendanceByWeek || {}).length,
    trialsWeeks: Object.keys(forecastContext.trialsByWeek || {}).length,
  },
});

export function buildCRMContext({
  contextType,
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
  const referenceDate = getDateKey(options.referenceDate || options.today || dashboard?.period?.end) || maxDateKey(attn, subs, trialBookings, waitlist, cancelled, roomBookings, groupLessonOverrides);
  const waitlistDemand = summarizeWaitlistDemand({ waitlist, groups });
  const trialSummary = summarizeTrialBookings(trialBookings);
  const scheduleSummary = summarizeScheduleInputs({ cancelled, roomBookings, groupLessonOverrides, directionsList });
  const attendanceContext = buildAttendanceContext({ attn, groups, students });
  const paymentsContext = buildPaymentsContext({ subs, paymentAnomalies, referenceDate });
  const studentsContext = buildStudentsContext({ students, studentGrps, subs, attn, proAnalytics, referenceDate });
  const groupsContext = buildGroupsContext({ groups, studentGrps, subs, attn, waitlist, referenceDate });
  const trainersContext = buildTrainersContext({ trainers, trainerGroups, groups, subs, attn, referenceDate });
  const forecastContext = buildForecastContext({ paymentsContext, attendanceContext, trialBookings, subs, proAnalytics, groupsContext });
  const activeGroupsCount = groupsContext.health.filter((row) => !row.flags.includes("no_recent_activity") || row.studentsCount > 0).length;
  const subIndex = buildSubscriptionIndexes(subs, referenceDate);
  const lowAttendanceGroupRows = asArray(dashboard.lowAttendanceGroupRows).length
    ? asArray(dashboard.lowAttendanceGroupRows).map((row) => ({
      groupId: getGroupId(row),
      groupName: row.name || displayGroup(row),
      averageAttendance: safeNumber(row.average),
      heldSessions: safeNumber(row.held),
    })).slice(0, 10)
    : attendanceContext.lowAttendanceGroups.map((row) => ({
      groupId: row.groupId,
      groupName: row.groupName,
      averageAttendance: row.averagePerActiveDate,
      heldSessions: row.activeDates,
    })).slice(0, 10);

  const globalContext = {
    totalStudents: asArray(students).length,
    totalGroups: asArray(groups).length,
    totalTrainers: asArray(trainers).length,
    totalSubscriptions: asArray(subs).length,
    totalAttendanceEntries: asArray(attn).length,
    activeStudentsCount: studentsContext.lifecycleBuckets.active,
    activeSubscriptionsCount: paymentsContext.activeSubscriptions,
    expiredSubscriptionsCount: paymentsContext.expiredSubscriptions,
    paidSubscriptionsCount: paymentsContext.paidCount,
    unpaidSubscriptionsCount: paymentsContext.unpaidCount,
    totalRevenueEstimate: paymentsContext.revenueTotal,
    attendanceSummary: {
      totalEntries: attendanceContext.totalEntries,
      totalQuantity: attendanceContext.totalQuantity,
      uniqueAttendedStudents: attendanceContext.uniqueAttendedStudents,
      lowAttendanceGroupsCount: attendanceContext.lowAttendanceGroups.length,
    },
    waitlistSummary: {
      total: asArray(waitlist).length,
      active: waitlistDemand.reduce((sum, row) => sum + row.count, 0),
      groupsWithDemand: waitlistDemand.length,
    },
    trialBookingsSummary: trialSummary,
    paymentAnomaliesSummary: paymentsContext.anomalies,
    churnRiskCount: asArray(proAnalytics.churnRisk).length,
    upsellCandidatesCount: asArray(proAnalytics.upsellCandidates).length,
    lowAttendanceGroupsCount: lowAttendanceGroupRows.length,
    activeGroupsCount,
    activePaidStudentCount: subIndex.activeStudentIds.size,
    scheduleSummary,
    analyticsSnapshotAvailable: Boolean(analytics && Object.keys(analytics).length),
    forecastReady: {
      revenueWeeks: Object.keys(forecastContext.revenueByWeek).length,
      revenueMonths: Object.keys(forecastContext.revenueByMonth).length,
      attendanceWeeks: Object.keys(forecastContext.attendanceByWeek).length,
      attendanceMonths: Object.keys(forecastContext.attendanceByMonth).length,
      trialsWeeks: Object.keys(forecastContext.trialsByWeek).length,
      groupHealthRows: forecastContext.groupHealthSnapshot.length,
    },
  };
  const dashboardContext = buildDashboardContext({ dashboard, globalContext, forecastContext, paymentAnomalies, waitlistDemand, lowAttendanceGroupRows });

  const context = {
    version: "crm-context-v1.1",
    generatedFrom: "passed-in-crm-data",
    referenceDate,
    requestedContext: isCRMContextType(contextType) ? contextType : null,
    dataPolicy: AI_CONTEXT_DATA_POLICY,
    availableContexts: Object.values(CRM_CONTEXT_TYPES),
    laterPhaseContexts: Object.values(LATER_PHASE_CONTEXT_TYPES),
    [CRM_CONTEXT_TYPES.GLOBAL]: globalContext,
    [CRM_CONTEXT_TYPES.DASHBOARD]: dashboardContext,
    [CRM_CONTEXT_TYPES.ATTENDANCE]: attendanceContext,
    [CRM_CONTEXT_TYPES.PAYMENTS]: paymentsContext,
    [CRM_CONTEXT_TYPES.STUDENTS]: studentsContext,
    [CRM_CONTEXT_TYPES.GROUPS]: groupsContext,
    [CRM_CONTEXT_TYPES.TRAINERS]: trainersContext,
    [CRM_CONTEXT_TYPES.FORECAST]: forecastContext,
    messages: {
      status: "later-phase",
      included: false,
    },
    instagram: {
      status: "later-phase",
      included: false,
    },
  };

  return {
    ...context,
    selectedContext: context.requestedContext ? context[context.requestedContext] : null,
  };
}
