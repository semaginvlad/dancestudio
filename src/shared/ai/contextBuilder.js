import { AI_CONTEXT_TYPES, normalizeContextType } from "./contextTypes.js";
import {
  AI_DATA_POLICY,
  asArray,
  countBy,
  getDateKey,
  getGroupId,
  getMonthKey,
  getRevenueDate,
  getStudentId,
  getTrainerId,
  getWeekKey,
  pseudonymize,
  safeName,
  sumBy,
  summarizeBy,
  toId,
} from "./privacy.js";

const PAID_PLAN_TYPES = new Set(["4pack", "8pack", "12pack"]);

const sortDesc = (rows = [], key = "value") => [...rows].sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0));

const isPaidSub = (sub = {}) => sub.paid !== false;

const planType = (sub = {}) => String(sub.planType || sub.plan_type || "unknown").toLowerCase();

const isActiveSub = (sub = {}, todayKey = getDateKey(new Date())) => {
  if (String(sub.status || "").toLowerCase() === "expired") return false;
  const endDate = getDateKey(sub.endDate || sub.end_date);
  return !endDate || endDate >= todayKey;
};

const isExpiringSoon = (sub = {}, todayKey, days = 7) => {
  const endDate = getDateKey(sub.endDate || sub.end_date);
  if (!endDate || endDate < todayKey) return false;
  const limit = new Date(`${todayKey}T12:00:00`);
  limit.setDate(limit.getDate() + days);
  return endDate <= getDateKey(limit);
};

const createBase = ({ contextType, generatedAt, analytics }) => ({
  generatedAt,
  contextType,
  dataPolicy: AI_DATA_POLICY,
  period: analytics?.foundation?.period || analytics?.period || null,
  sourceCoverage: {
    availableNow: ["students", "groups", "student_groups", "subscriptions", "attendance", "waitlist", "trial_bookings", "trainers", "trainer_groups", "schedule"],
    laterPhase: ["messages", "telegram", "instagram"],
  },
});

const makeIndexes = ({ students, groups, trainers, trainerGroups }) => {
  const groupById = Object.fromEntries(asArray(groups).map((g) => [toId(g.id), g]));
  const studentById = Object.fromEntries(asArray(students).map((s) => [toId(s.id), s]));
  const trainerById = Object.fromEntries(asArray(trainers).map((t) => [toId(t.id), t]));
  const trainerIdsByGroup = asArray(trainerGroups).reduce((acc, row) => {
    const groupId = toId(getGroupId(row));
    const trainerId = toId(getTrainerId(row));
    if (!groupId || !trainerId) return acc;
    if (!acc[groupId]) acc[groupId] = [];
    acc[groupId].push(trainerId);
    return acc;
  }, {});
  return { groupById, studentById, trainerById, trainerIdsByGroup };
};

const buildSubscriptionsSummary = ({ subs, todayKey }) => {
  const rows = asArray(subs);
  const activeRows = rows.filter((sub) => isActiveSub(sub, todayKey));
  const paidRows = rows.filter(isPaidSub);
  const unpaidRows = rows.filter((sub) => sub.paid === false);
  return {
    total: rows.length,
    active: activeRows.length,
    expired: rows.length - activeRows.length,
    paidCount: paidRows.length,
    unpaidCount: unpaidRows.length,
    paidPackCount: rows.filter((sub) => PAID_PLAN_TYPES.has(planType(sub))).length,
    byPlan: countBy(rows, planType),
    expiringSoonCount: activeRows.filter((sub) => isExpiringSoon(sub, todayKey, 7)).length,
  };
};

const buildRevenueSummary = ({ subs }) => {
  const paidRows = asArray(subs).filter(isPaidSub);
  return {
    totalRevenue: sumBy(paidRows, (sub) => sub.amount),
    paidRows: paidRows.length,
    unpaidRows: asArray(subs).filter((sub) => sub.paid === false).length,
    byWeek: summarizeBy(paidRows, (sub) => getWeekKey(getRevenueDate(sub)), (sub) => sub.amount).slice(0, 16),
    byMonth: summarizeBy(paidRows, (sub) => getMonthKey(getRevenueDate(sub)), (sub) => sub.amount).slice(0, 12),
  };
};

const buildAttendanceSummary = ({ attn, groups }) => {
  const rows = asArray(attn);
  const groupById = Object.fromEntries(asArray(groups).map((g) => [toId(g.id), g]));
  const totalQuantity = sumBy(rows, (row) => row.quantity || 1);
  const attendanceByGroup = asArray(groups).map((group) => {
    const groupRows = rows.filter((row) => toId(getGroupId(row)) === toId(group.id));
    const heldSessions = new Set(groupRows.map((row) => getDateKey(row.date)).filter(Boolean)).size;
    const quantity = sumBy(groupRows, (row) => row.quantity || 1);
    return {
      groupId: toId(group.id),
      groupName: safeName(group, "Group"),
      attendance: quantity,
      heldSessions,
      averagePerSession: heldSessions ? Number((quantity / heldSessions).toFixed(2)) : 0,
    };
  });
  return {
    totalEntries: rows.length,
    totalQuantity,
    uniqueStudents: new Set(rows.map(getStudentId).filter(Boolean).map(toId)).size,
    byWeek: summarizeBy(rows, (row) => getWeekKey(row.date), (row) => row.quantity || 1).slice(0, 16),
    byMonth: summarizeBy(rows, (row) => getMonthKey(row.date), (row) => row.quantity || 1).slice(0, 12),
    byGroup: sortDesc(attendanceByGroup, "attendance").slice(0, 20),
    lowAttendanceGroups: attendanceByGroup.filter((row) => row.heldSessions >= 2 && row.averagePerSession < 4).slice(0, 20),
    unknownGroupEntries: rows.filter((row) => getGroupId(row) && !groupById[toId(getGroupId(row))]).length,
  };
};

const buildStudentsSummary = ({ students, studentGrps, subs, attn, proAnalytics, todayKey }) => ({
  total: asArray(students).length,
  withGroupMembership: new Set(asArray(studentGrps).map(getStudentId).filter(Boolean).map(toId)).size,
  withAttendance: new Set(asArray(attn).map(getStudentId).filter(Boolean).map(toId)).size,
  withActiveSubscription: new Set(asArray(subs).filter((sub) => isActiveSub(sub, todayKey)).map(getStudentId).filter(Boolean).map(toId)).size,
  churnRiskCount: asArray(proAnalytics?.churnRisk).length,
  upsellCandidatesCount: asArray(proAnalytics?.upsellCandidates).length,
});

const buildPaymentAnomaliesSummary = ({ paymentAnomalies }) => ({
  total: asArray(paymentAnomalies).length,
  byType: countBy(paymentAnomalies, (row) => row.type || "unknown"),
});

const buildWaitlistSummary = ({ waitlist, groups }) => {
  const groupById = Object.fromEntries(asArray(groups).map((g) => [toId(g.id), g]));
  const activeRows = asArray(waitlist).filter((row) => ["waiting", "contacted", ""].includes(String(row.status || "")));
  const demand = Object.entries(activeRows.reduce((acc, row) => {
    const groupId = toId(getGroupId(row));
    if (!groupId) return acc;
    acc[groupId] = (acc[groupId] || 0) + 1;
    return acc;
  }, {})).map(([groupId, count]) => ({
    groupId,
    groupName: safeName(groupById[groupId], "Group"),
    count,
  }));
  return {
    total: asArray(waitlist).length,
    active: activeRows.length,
    byStatus: countBy(waitlist, (row) => row.status || "unknown"),
    demandByGroup: sortDesc(demand, "count").slice(0, 20),
  };
};

const buildTrialBookingsSummary = ({ trialBookings }) => ({
  total: asArray(trialBookings).length,
  byStatus: countBy(trialBookings, (row) => row.status || "unknown"),
  byWeek: summarizeBy(trialBookings, (row) => getWeekKey(row.trialDate || row.trial_date || row.createdAt || row.created_at)).slice(0, 16),
});

const buildGroupsSummary = ({ groups, studentGrps, subs, attn, waitlist, dashboard }) => {
  const attendanceSummary = buildAttendanceSummary({ attn, groups });
  const attendanceByGroup = Object.fromEntries(attendanceSummary.byGroup.map((row) => [row.groupId, row]));
  const waitlistSummary = buildWaitlistSummary({ waitlist, groups });
  const waitlistByGroup = Object.fromEntries(waitlistSummary.demandByGroup.map((row) => [row.groupId, row.count]));
  const groupRows = asArray(groups).map((group) => {
    const groupId = toId(group.id);
    const groupSubs = asArray(subs).filter((sub) => toId(getGroupId(sub)) === groupId);
    const revenue = sumBy(groupSubs.filter(isPaidSub), (sub) => sub.amount);
    const attendance = attendanceByGroup[groupId] || { attendance: 0, heldSessions: 0, averagePerSession: 0 };
    const studentCount = new Set(asArray(studentGrps).filter((row) => toId(getGroupId(row)) === groupId).map(getStudentId).filter(Boolean).map(toId)).size;
    const flags = [];
    if (attendance.heldSessions >= 2 && attendance.averagePerSession < 4) flags.push("low_attendance");
    if ((waitlistByGroup[groupId] || 0) > 0) flags.push("waitlist_demand");
    if (revenue === 0 && attendance.attendance === 0) flags.push("no_recent_activity");
    return {
      groupId,
      groupName: safeName(group, "Group"),
      directionId: group.directionId || group.direction_id || null,
      studentCount,
      attendance: attendance.attendance,
      heldSessions: attendance.heldSessions,
      averageAttendance: attendance.averagePerSession,
      revenue,
      waitlistDemand: waitlistByGroup[groupId] || 0,
      flags,
    };
  });
  return {
    total: groupRows.length,
    active: groupRows.filter((row) => !row.flags.includes("no_recent_activity")).length,
    lowAttendance: groupRows.filter((row) => row.flags.includes("low_attendance")).length,
    waitlistDemand: groupRows.filter((row) => row.waitlistDemand > 0).length,
    rows: groupRows.slice(0, 50),
    dashboardRiskGroups: asArray(dashboard?.riskGroups).slice(0, 10),
  };
};

const buildTrainersSummary = ({ trainers, trainerGroups, groups, subs, attn }) => {
  const groupById = Object.fromEntries(asArray(groups).map((g) => [toId(g.id), g]));
  const rows = asArray(trainers).map((trainer) => {
    const trainerId = toId(trainer.id);
    const trainerGroupIds = asArray(trainerGroups).filter((row) => toId(getTrainerId(row)) === trainerId).map(getGroupId).filter(Boolean).map(toId);
    const groupSet = new Set(trainerGroupIds);
    const trainerSubs = asArray(subs).filter((sub) => groupSet.has(toId(getGroupId(sub))));
    const trainerAttn = asArray(attn).filter((row) => groupSet.has(toId(getGroupId(row))));
    return {
      trainerId,
      trainerName: safeName(trainer, "Trainer"),
      groupCount: groupSet.size,
      groups: trainerGroupIds.map((groupId) => safeName(groupById[groupId], "Group")).slice(0, 10),
      attendance: sumBy(trainerAttn, (row) => row.quantity || 1),
      revenue: sumBy(trainerSubs.filter(isPaidSub), (sub) => sub.amount),
    };
  });
  return {
    total: rows.length,
    active: asArray(trainers).filter((trainer) => trainer.isActive !== false).length,
    rows: sortDesc(rows, "attendance").slice(0, 30),
  };
};

const buildForecastContext = ({ subs, attn, trialBookings, proAnalytics, groupsSummary }) => ({
  revenueByWeek: buildRevenueSummary({ subs }).byWeek,
  revenueByMonth: buildRevenueSummary({ subs }).byMonth,
  attendanceByWeek: buildAttendanceSummary({ attn, groups: [] }).byWeek,
  attendanceByMonth: buildAttendanceSummary({ attn, groups: [] }).byMonth,
  trialsByWeek: summarizeBy(trialBookings, (row) => getWeekKey(row.trialDate || row.trial_date || row.createdAt || row.created_at)).slice(0, 16),
  newSubscriptionsByWeek: summarizeBy(subs, (sub) => getWeekKey(sub.startDate || sub.start_date || sub.created_at)).slice(0, 16),
  churnRiskCount: asArray(proAnalytics?.churnRisk).length,
  groupHealthSnapshot: {
    lowAttendanceGroups: groupsSummary.lowAttendance,
    groupsWithWaitlistDemand: groupsSummary.waitlistDemand,
  },
});

export function buildCRMContext(input = {}) {
  const contextType = normalizeContextType(input.contextType);
  const generatedAt = input.options?.generatedAt || new Date().toISOString();
  const todayKey = input.options?.today || getDateKey(new Date());
  const indexes = makeIndexes(input);

  const subscriptionsSummary = buildSubscriptionsSummary({ subs: input.subs, todayKey });
  const revenueSummary = buildRevenueSummary({ subs: input.subs });
  const attendanceSummary = buildAttendanceSummary({ attn: input.attn, groups: input.groups });
  const studentsSummary = buildStudentsSummary({ ...input, todayKey });
  const paymentAnomaliesSummary = buildPaymentAnomaliesSummary(input);
  const waitlistSummary = buildWaitlistSummary(input);
  const trialBookingsSummary = buildTrialBookingsSummary(input);
  const groupsSummary = buildGroupsSummary(input);
  const trainersSummary = buildTrainersSummary(input);
  const forecastContext = buildForecastContext({ ...input, groupsSummary });

  const base = createBase({ contextType, generatedAt, analytics: input.analytics });
  const shared = {
    counts: {
      students: asArray(input.students).length,
      groups: asArray(input.groups).length,
      trainers: asArray(input.trainers).length,
      subscriptions: asArray(input.subs).length,
      attendanceEntries: asArray(input.attn).length,
      waitlist: asArray(input.waitlist).length,
      trialBookings: asArray(input.trialBookings).length,
      cancelledTrainings: asArray(input.cancelled).length,
      roomBookings: asArray(input.roomBookings).length,
      groupLessonOverrides: asArray(input.groupLessonOverrides).length,
    },
  };

  const contexts = {
    [AI_CONTEXT_TYPES.global]: {
      ...base,
      ...shared,
      students: studentsSummary,
      groups: groupsSummary,
      subscriptions: subscriptionsSummary,
      attendance: attendanceSummary,
      revenue: revenueSummary,
      paymentAnomalies: paymentAnomaliesSummary,
      waitlist: waitlistSummary,
      trialBookings: trialBookingsSummary,
      trainers: trainersSummary,
      forecastReady: forecastContext,
      proAnalytics: {
        churnRiskCount: asArray(input.proAnalytics?.churnRisk).length,
        upsellCandidatesCount: asArray(input.proAnalytics?.upsellCandidates).length,
        bestAttendersCount: asArray(input.proAnalytics?.bestAttenders).length,
      },
    },
    [AI_CONTEXT_TYPES.dashboard]: {
      ...base,
      dashboard: input.dashboard || {},
      proAnalytics: {
        churnRiskCount: asArray(input.proAnalytics?.churnRisk).length,
        upsellCandidatesCount: asArray(input.proAnalytics?.upsellCandidates).length,
        popularDays: asArray(input.proAnalytics?.popularDays).slice(0, 7),
      },
      paymentAnomalies: paymentAnomaliesSummary,
      waitlistDemand: waitlistSummary.demandByGroup,
      forecastReady: forecastContext,
    },
    [AI_CONTEXT_TYPES.attendance]: {
      ...base,
      attendance: attendanceSummary,
      lowAttendanceGroups: attendanceSummary.lowAttendanceGroups,
      decliningStudents: [],
      note: "decliningStudents is reserved for a later deterministic cohort helper; no AttendanceTab mutation logic is used here.",
    },
    [AI_CONTEXT_TYPES.payments]: {
      ...base,
      subscriptions: subscriptionsSummary,
      revenue: revenueSummary,
      paymentAnomalies: paymentAnomaliesSummary,
    },
    [AI_CONTEXT_TYPES.students]: {
      ...base,
      students: studentsSummary,
      examples: asArray(input.proAnalytics?.churnRisk).slice(0, 5).map((row) => ({
        studentRef: pseudonymize(getStudentId(row) || row?.student?.id),
        groupName: safeName(row?.group, "Group"),
        risk: "churn",
      })),
    },
    [AI_CONTEXT_TYPES.groups]: {
      ...base,
      groups: groupsSummary,
    },
    [AI_CONTEXT_TYPES.trainers]: {
      ...base,
      trainers: trainersSummary,
    },
    [AI_CONTEXT_TYPES.forecast]: {
      ...base,
      forecastReady: forecastContext,
    },
  };

  return {
    ...contexts[contextType],
    privacyNotes: {
      noPhones: true,
      noTelegramHandles: true,
      noInstagramHandles: true,
      noRawChatMessages: true,
      noPrivateNotes: true,
      noRawPaymentRows: true,
    },
    meta: {
      contextType,
      supportedContextTypes: Object.values(AI_CONTEXT_TYPES),
      laterPhaseContextTypes: ["messages", "instagram"],
      indexesAvailable: {
        groups: Object.keys(indexes.groupById).length,
        students: Object.keys(indexes.studentById).length,
        trainers: Object.keys(indexes.trainerById).length,
      },
    },
  };
}
