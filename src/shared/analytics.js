import { getSubStatus, toLocalISO } from './utils';

const PAID_PLAN_TYPES = new Set(['4pack', '8pack', '12pack']);

const asDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    const copy = new Date(value.getTime());
    return Number.isNaN(copy.getTime()) ? null : copy;
  }
  const d = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const dateToIso = (d) => toLocalISO(d);

export function getPeriodRange(anchorDate = new Date(), periodType = 'month') {
  const anchor = asDate(anchorDate) || new Date(`${anchorDate}T12:00:00`) || new Date();
  const safeAnchor = Number.isNaN(anchor.getTime()) ? new Date() : anchor;

  if (periodType === 'day') {
    const start = new Date(safeAnchor);
    const end = new Date(safeAnchor);
    return {
      type: 'day',
      key: dateToIso(start),
      start: dateToIso(start),
      end: dateToIso(end),
      prevStart: dateToIso(new Date(start.getTime() - 86400000)),
      prevEnd: dateToIso(new Date(end.getTime() - 86400000)),
    };
  }

  if (periodType === 'week') {
    const start = new Date(safeAnchor);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const prevStart = new Date(start);
    prevStart.setDate(start.getDate() - 7);
    const prevEnd = new Date(end);
    prevEnd.setDate(end.getDate() - 7);
    return {
      type: 'week',
      key: `${dateToIso(start)}..${dateToIso(end)}`,
      start: dateToIso(start),
      end: dateToIso(end),
      prevStart: dateToIso(prevStart),
      prevEnd: dateToIso(prevEnd),
    };
  }

  if (periodType === 'quarter') {
    const start = new Date(safeAnchor);
    const qStart = Math.floor(start.getMonth() / 3) * 3;
    start.setMonth(qStart, 1);
    const end = new Date(start);
    end.setMonth(start.getMonth() + 3, 0);
    const prevStart = new Date(start);
    prevStart.setMonth(start.getMonth() - 3, 1);
    const prevEnd = new Date(prevStart);
    prevEnd.setMonth(prevStart.getMonth() + 3, 0);
    return {
      type: 'quarter',
      key: `${start.getFullYear()}-Q${Math.floor(qStart / 3) + 1}`,
      start: dateToIso(start),
      end: dateToIso(end),
      prevStart: dateToIso(prevStart),
      prevEnd: dateToIso(prevEnd),
    };
  }

  const start = new Date(safeAnchor.getFullYear(), safeAnchor.getMonth(), 1, 12);
  const end = new Date(safeAnchor.getFullYear(), safeAnchor.getMonth() + 1, 0, 12);
  const prevStart = new Date(start.getFullYear(), start.getMonth() - 1, 1, 12);
  const prevEnd = new Date(start.getFullYear(), start.getMonth(), 0, 12);
  return {
    type: 'month',
    key: dateToIso(start).slice(0, 7),
    start: dateToIso(start),
    end: dateToIso(end),
    prevStart: dateToIso(prevStart),
    prevEnd: dateToIso(prevEnd),
  };
}

const inRange = (dateStr, start, end) => !!dateStr && dateStr >= start && dateStr <= end;

const compareWithPrevious = (current, previous) => {
  const delta = current - previous;
  const deltaPct = previous === 0 ? (current > 0 ? 100 : 0) : Math.round((delta / previous) * 100);
  return { current, previous, delta, deltaPct };
};

const getSubscriptionReferenceDate = (sub) => sub.startDate || String(sub.created_at || '').slice(0, 10);

const isPaidPack = (sub) => PAID_PLAN_TYPES.has(sub.planType);

const buildCommunicationMetrics = (events = [], range, prevRange) => {
  const inCurr = events.filter((e) => inRange(e.date, range.start, range.end));
  const inPrev = events.filter((e) => inRange(e.date, prevRange.start, prevRange.end));

  const fold = (rows) => rows.reduce((acc, item) => {
    const channel = item.channel || 'unknown';
    const direction = item.direction || 'unknown';
    if (!acc.byChannel[channel]) acc.byChannel[channel] = { total: 0, inbound: 0, outbound: 0 };
    acc.total += 1;
    acc.byChannel[channel].total += 1;
    if (direction === 'inbound') {
      acc.inbound += 1;
      acc.byChannel[channel].inbound += 1;
    }
    if (direction === 'outbound') {
      acc.outbound += 1;
      acc.byChannel[channel].outbound += 1;
    }
    return acc;
  }, { total: 0, inbound: 0, outbound: 0, byChannel: {} });

  return {
    totals: fold(inCurr),
    delta: compareWithPrevious(inCurr.length, inPrev.length),
    blocks: Object.entries(fold(inCurr).byChannel).map(([channel, stat]) => ({
      id: channel,
      title: channel.toUpperCase(),
      value: stat.total,
      details: stat,
      trend: compareWithPrevious(
        inCurr.filter((e) => (e.channel || 'unknown') === channel).length,
        inPrev.filter((e) => (e.channel || 'unknown') === channel).length,
      ),
    })),
    integrations: {
      telegram: true,
      instagram: false,
      aiTranscript: false,
      videoAnalysis: false,
    },
  };
};

export function buildAnalyticsFoundation({
  students = [],
  groups = [],
  studentGrps = [],
  subs = [],
  attn = [],
  trainers = [],
  trainerGroups = [],
  communicationEvents = [],
  periodType = 'month',
  anchorDate = new Date(),
}) {
  const range = getPeriodRange(anchorDate, periodType);
  const prevRange = { start: range.prevStart, end: range.prevEnd };

  const activeSubs = subs.filter((s) => getSubStatus(s) !== 'expired');
  const activeStudents = new Set(activeSubs.map((s) => String(s.studentId))).size;

  const subscriptionsInPeriod = subs.filter((s) => inRange(getSubscriptionReferenceDate(s), range.start, range.end));
  const subscriptionsPrevPeriod = subs.filter((s) => inRange(getSubscriptionReferenceDate(s), prevRange.start, prevRange.end));

  const paidPackSubs = subscriptionsInPeriod.filter(isPaidPack);
  const paidPackSubsPrev = subscriptionsPrevPeriod.filter(isPaidPack);

  const firstPaidByStudent = {};
  subs
    .filter(isPaidPack)
    .sort((a, b) => (getSubscriptionReferenceDate(a) || '').localeCompare(getSubscriptionReferenceDate(b) || ''))
    .forEach((s) => {
      const key = String(s.studentId);
      if (!firstPaidByStudent[key]) firstPaidByStudent[key] = getSubscriptionReferenceDate(s);
    });

  const newSubscriptions = paidPackSubs.filter((s) => firstPaidByStudent[String(s.studentId)] === getSubscriptionReferenceDate(s)).length;
  const renewals = paidPackSubs.length - newSubscriptions;

  const attendanceInPeriod = attn.filter((a) => inRange(a.date, range.start, range.end));
  const attendancePrev = attn.filter((a) => inRange(a.date, prevRange.start, prevRange.end));
  const attendanceCount = attendanceInPeriod.reduce((sum, row) => sum + (row.quantity || 1), 0);
  const attendedDays = new Set(attendanceInPeriod.map((a) => a.date)).size;
  const averageAttendance = attendedDays ? Number((attendanceCount / attendedDays).toFixed(2)) : 0;

  const trialEvents = attendanceInPeriod.filter((a) => a.entryType === 'trial' || a.guestType === 'trial');
  const singleEvents = attendanceInPeriod.filter((a) => a.entryType === 'single' || a.guestType === 'single');
  const trialSubs = subscriptionsInPeriod.filter((s) => s.planType === 'trial');
  const singleSubs = subscriptionsInPeriod.filter((s) => s.planType === 'single');
  const trialCount = trialEvents.length + trialSubs.length;
  const singleCount = singleEvents.length + singleSubs.length;

  const expiredWithoutRenewal = subs.filter((s) => {
    if (!s.endDate || !inRange(s.endDate, range.start, range.end) || !isPaidPack(s)) return false;
    return !subs.some((next) => (
      isPaidPack(next)
      && String(next.studentId) === String(s.studentId)
      && (getSubscriptionReferenceDate(next) || '') > s.endDate
    ));
  }).length;

  const studentsWithTrial = new Set(trialEvents.map((a) => String(a.studentId)).filter(Boolean));
  trialSubs.forEach((s) => studentsWithTrial.add(String(s.studentId)));
  const trialPaidConverted = Array.from(studentsWithTrial).filter((studentId) => subs.some((s) => (
    isPaidPack(s)
    && String(s.studentId) === studentId
    && (getSubscriptionReferenceDate(s) || '') >= range.start
  ))).length;

  const studentsWithSingle = new Set(singleEvents.map((a) => String(a.studentId)).filter(Boolean));
  singleSubs.forEach((s) => studentsWithSingle.add(String(s.studentId)));
  const singlePaidConverted = Array.from(studentsWithSingle).filter((studentId) => subs.some((s) => (
    isPaidPack(s)
    && String(s.studentId) === studentId
    && (getSubscriptionReferenceDate(s) || '') >= range.start
  ))).length;

  const trialToPaidConversion = studentsWithTrial.size ? Number(((trialPaidConverted / studentsWithTrial.size) * 100).toFixed(2)) : 0;
  const singleToPaidConversion = studentsWithSingle.size ? Number(((singlePaidConverted / studentsWithSingle.size) * 100).toFixed(2)) : 0;

  const trainerMetrics = trainers.map((trainer) => {
    const groupIds = trainerGroups.filter((tg) => String(tg.trainerId) === String(trainer.id)).map((tg) => String(tg.groupId));
    const groupSet = new Set(groupIds);
    const groupStudents = new Set(
      studentGrps.filter((sg) => groupSet.has(String(sg.groupId))).map((sg) => String(sg.studentId)),
    );
    const groupAttendance = attendanceInPeriod.filter((a) => groupSet.has(String(a.groupId)));
    return {
      trainerId: trainer.id,
      trainerName: trainer.name || [trainer.firstName, trainer.lastName].filter(Boolean).join(' ').trim() || 'Без імені',
      groupCount: groupSet.size,
      studentCount: groupStudents.size,
      activeSubscriptions: activeSubs.filter((s) => groupSet.has(String(s.groupId))).length,
      attendanceCount: groupAttendance.reduce((sum, row) => sum + (row.quantity || 1), 0),
      trialCount: groupAttendance.filter((a) => a.entryType === 'trial' || a.guestType === 'trial').length,
      singleCount: groupAttendance.filter((a) => a.entryType === 'single' || a.guestType === 'single').length,
      chartCard: {
        subtitle: `${range.key} · груп ${groupSet.size}`,
        progress: groupStudents.size ? Math.round((groupAttendance.length / groupStudents.size) * 100) : 0,
      },
    };
  });

  const daysInPeriod = range.type === 'month' ? Number(range.end.slice(8, 10)) : 0;
  const attendanceLine = range.type === 'month'
    ? Array.from({ length: daysInPeriod }, (_, idx) => {
      const date = `${range.key}-${String(idx + 1).padStart(2, '0')}`;
      const count = attendanceInPeriod.filter((a) => a.date === date).reduce((sum, row) => sum + (row.quantity || 1), 0);
      return { x: idx + 1, date, y: count, label: String(idx + 1) };
    })
    : [];

  const byWeekday = [1, 2, 3, 4, 5, 6, 0].map((weekday) => {
    const count = attendanceInPeriod.filter((a) => {
      const d = asDate(a.date);
      return d && d.getDay() === weekday;
    }).length;
    return { weekday, label: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'][weekday === 0 ? 6 : weekday - 1], value: count };
  });

  const communication = buildCommunicationMetrics(communicationEvents, range, prevRange);

  return {
    period: range,
    metricDefinitions: {
      activeStudents: 'Unique students with at least one non-expired subscription on anchor date.',
      newSubscriptions: 'Paid pack subscriptions in period where this is the student first paid pack ever.',
      renewals: 'Paid pack subscriptions in period for students that already had paid pack history.',
      trialCount: 'Trial entries in attendance plus trial subscriptions started in period.',
      singleCount: 'Single entries in attendance plus single subscriptions started in period.',
      attendanceCount: 'Sum of attendance quantity values in period.',
      averageAttendance: 'Attendance count divided by number of days with attendance in period.',
      expiredWithoutRenewal: 'Paid subscriptions ended in period without any next paid pack for same student.',
      trialToPaidConversion: 'Share of trial students in period that have paid pack from period start.',
      singleToPaidConversion: 'Share of single students in period that have paid pack from period start.',
      trainerGroupMetrics: 'Trainer-level summary over assigned groups within selected period.',
      communicationCounts: 'Message/event totals for channel + direction within selected period.',
      monthlyDelta: 'Current period minus previous period with percent change.',
    },
    metrics: {
      activeStudents,
      newSubscriptions,
      renewals,
      trialCount,
      singleCount,
      attendanceCount,
      averageAttendance,
      expiredWithoutRenewal,
      trialToPaidConversion,
      singleToPaidConversion,
    },
    deltas: {
      attendanceCount: compareWithPrevious(attendanceCount, attendancePrev.reduce((sum, row) => sum + (row.quantity || 1), 0)),
      newSubscriptions: compareWithPrevious(newSubscriptions, paidPackSubsPrev.length),
      trialCount: compareWithPrevious(trialCount, attendancePrev.filter((a) => a.entryType === 'trial' || a.guestType === 'trial').length),
      singleCount: compareWithPrevious(singleCount, attendancePrev.filter((a) => a.entryType === 'single' || a.guestType === 'single').length),
    },
    ui: {
      kpiTiles: [
        { id: 'activeStudents', title: 'Active students', value: activeStudents, trend: compareWithPrevious(activeStudents, activeStudents) },
        { id: 'newSubscriptions', title: 'New subscriptions', value: newSubscriptions, trend: compareWithPrevious(newSubscriptions, paidPackSubsPrev.length) },
        { id: 'renewals', title: 'Renewals', value: renewals, trend: compareWithPrevious(renewals, Math.max(paidPackSubsPrev.length - newSubscriptions, 0)) },
        { id: 'attendanceCount', title: 'Attendance', value: attendanceCount, trend: compareWithPrevious(attendanceCount, attendancePrev.length) },
      ],
      charts: {
        line: { id: 'attendance_line', series: attendanceLine },
        bar: {
          id: 'subscriptions_by_plan',
          series: ['trial', 'single', '4pack', '8pack', '12pack'].map((plan) => ({
            key: plan,
            value: subscriptionsInPeriod.filter((s) => s.planType === plan).length,
          })),
        },
        ring: {
          id: 'entry_mix',
          slices: [
            { key: 'subscription', value: attendanceInPeriod.filter((a) => !a.entryType || a.entryType === 'subscription').length },
            { key: 'trial', value: trialEvents.length },
            { key: 'single', value: singleEvents.length },
            { key: 'unpaid', value: attendanceInPeriod.filter((a) => a.entryType === 'unpaid').length },
          ],
        },
        heatmap: { id: 'attendance_heatmap_weekday', cells: byWeekday },
        funnel: {
          id: 'trial_single_to_paid',
          steps: [
            { key: 'trial', label: 'Trial', value: studentsWithTrial.size },
            { key: 'trial_paid', label: 'Trial → Paid', value: trialPaidConverted },
            { key: 'single', label: 'Single', value: studentsWithSingle.size },
            { key: 'single_paid', label: 'Single → Paid', value: singlePaidConverted },
          ],
        },
      },
      trainerComparisonCards: trainerMetrics,
      messageAnalyticsBlocks: communication.blocks,
    },
    domains: {
      attendance: {
        count: attendanceCount,
        average: averageAttendance,
        line: attendanceLine,
        heatmap: byWeekday,
      },
      subscriptions: {
        newSubscriptions,
        renewals,
        expiredWithoutRenewal,
        byPlan: ['trial', 'single', '4pack', '8pack', '12pack'].map((plan) => ({
          plan,
          value: subscriptionsInPeriod.filter((s) => s.planType === plan).length,
        })),
      },
      trialSingle: {
        trialCount,
        singleCount,
        trialToPaidConversion,
        singleToPaidConversion,
        funnel: [
          { stage: 'trial', value: studentsWithTrial.size },
          { stage: 'trial_paid', value: trialPaidConverted },
          { stage: 'single', value: studentsWithSingle.size },
          { stage: 'single_paid', value: singlePaidConverted },
        ],
      },
      trainers: {
        comparison: trainerMetrics,
      },
      communications: communication,
      integrations: {
        telegram: { status: 'foundation-ready', requiredFields: ['date', 'channel', 'direction', 'chatId'] },
        instagram: { status: 'interface-ready', requiredFields: ['date', 'channel', 'direction', 'threadId'] },
        aiTrainingTranscript: { status: 'interface-ready', requiredFields: ['date', 'studentId', 'sessionId', 'scoreType', 'scoreValue'] },
        videoSessionAnalysis: { status: 'interface-ready', requiredFields: ['date', 'groupId', 'sessionId', 'metricName', 'metricValue'] },
      },
    },
    sourceCoverage: {
      availableNow: ['students', 'groups', 'student_groups', 'subscriptions', 'attendance', 'trainers', 'trainer_groups'],
      futureSources: ['telegram_messages', 'instagram_messages', 'ai_transcripts', 'video_analysis'],
    },
    stats: {
      totalStudents: students.length,
      totalGroups: groups.length,
      totalSubscriptionsInPeriod: subscriptionsInPeriod.length,
    },
  };
}

export function getTrainerAnalyticsCard(foundation, trainerId) {
  return foundation?.domains?.trainers?.comparison?.find((item) => String(item.trainerId) === String(trainerId)) || null;
}
