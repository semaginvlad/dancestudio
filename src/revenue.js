const money = (value) => Number(value || 0) || 0;

export const getSubscriptionRevenueDate = (entry = {}) => String(
  entry.activationDate
  || entry.activation_date
  || entry.startDate
  || entry.start_date
  || entry.paidAt
  || entry.paid_at
  || entry.created_at
  || ""
).slice(0, 10);

export const getFinancialRevenueDate = (entry = {}) => String(
  entry.operationDate || entry.operation_date || ""
).slice(0, 10);

export const getRevenueDate = (entry = {}) => String(
  entry.revenueDate
  || entry.revenue_date
  || (entry.source === "financial_journal" || entry.financialTransactionId
    ? getFinancialRevenueDate(entry)
    : getSubscriptionRevenueDate(entry))
  || ""
).slice(0, 10);

export const hasOneOffAttendancePayment = (attendance = {}, subscriptions = [], financialTransactions = []) => {
  const type = String(attendance.entryType || attendance.entry_type || attendance.guestType || attendance.guest_type || "").toLowerCase();
  if (!attendance.id || !["trial", "single"].includes(type)) return false;

  const journalPayment = (financialTransactions || []).some((row) => (
    row?.status === "posted"
    && row?.direction === "income"
    && String(row.attendanceId || row.attendance_id || "") === String(attendance.id)
  ));
  if (journalPayment) return true;

  const dateKey = String(attendance.date || "").slice(0, 10);
  return (subscriptions || []).some((row) => (
    String(row.studentId || row.student_id || "") === String(attendance.studentId || attendance.student_id || "")
    && String(row.groupId || row.group_id || "") === String(attendance.groupId || attendance.group_id || "")
    && String(row.planType || row.plan_type || "").toLowerCase() === type
    && getSubscriptionRevenueDate(row) === dateKey
  ));
};

export const findUnpaidOneOffAttendance = (attendanceRows = [], subscriptions = [], financialTransactions = []) => (
  (attendanceRows || []).filter((attendance) => {
    const type = String(attendance.entryType || attendance.entry_type || attendance.guestType || attendance.guest_type || "").toLowerCase();
    return ["trial", "single"].includes(type)
      && !hasOneOffAttendancePayment(attendance, subscriptions, financialTransactions);
  })
);

export const getLegacyAttendanceId = (subscription = {}) => {
  const match = String(subscription.notes || "").match(/(?:^|\s)auto_one_off_from_attendance:([0-9a-f-]{36})(?:\s|$)/i);
  return match?.[1]?.toLowerCase() || null;
};

export const buildPaymentRows = (subscriptions = [], financialTransactions = []) => {
  const postedJournal = (financialTransactions || []).filter((row) => (
    row?.status === "posted"
    && row?.direction === "income"
    && ["trial", "single"].includes(String(row.categoryCode || row.category_code || "").toLowerCase())
  ));
  const journalAttendanceIds = new Set(postedJournal
    .map((row) => String(row.attendanceId || row.attendance_id || "").toLowerCase())
    .filter(Boolean));
  const legacyAndSubscriptions = (subscriptions || []).filter((row) => {
    const attendanceId = getLegacyAttendanceId(row);
    return !attendanceId || !journalAttendanceIds.has(attendanceId);
  });
  const journalRows = postedJournal.map((row) => {
    const operationDate = getFinancialRevenueDate(row);
    return {
      id: `financial:${row.id}`,
      source: "financial_journal",
      isJournalPayment: true,
      financialTransactionId: row.id,
      attendanceId: row.attendanceId || row.attendance_id || null,
      studentId: row.studentId || row.student_id || null,
      guestName: row.guestName || row.guest_name || null,
      groupId: row.groupId || row.group_id || null,
      planType: row.categoryCode || row.category_code,
      amount: money(row.amountUah ?? row.amount_uah),
      paid: true,
      payMethod: row.paymentMethod || row.payment_method_code || null,
      activationDate: operationDate,
      startDate: operationDate,
      endDate: operationDate,
      operationDate,
      status: "completed",
    };
  });
  return [...legacyAndSubscriptions, ...journalRows];
};

/**
 * Canonical studio income rows. Paid subscriptions remain the legacy source;
 * posted trial/single journal rows replace only an auto-one-off linked to the
 * same attendance. Posted room rentals are independent studio income rows.
 */
export const buildCanonicalRevenueEntries = (subscriptions = [], financialTransactions = []) => {
  const journalRows = (financialTransactions || []).filter((row) => (
    row?.status === "posted"
    && row?.direction === "income"
    && ["trial", "single", "room_rental"].includes(String(row.categoryCode || row.category_code || "").toLowerCase())
  ));
  const journalAttendanceIds = new Set(journalRows
    .map((row) => String(row.attendanceSourceId || row.attendance_source_id || row.attendanceId || row.attendance_id || "").toLowerCase())
    .filter(Boolean));

  const legacyRows = (subscriptions || [])
    .filter((row) => row?.paid === true)
    .filter((row) => {
      const attendanceId = getLegacyAttendanceId(row);
      return !attendanceId || !journalAttendanceIds.has(attendanceId);
    })
    .map((row) => ({ ...row, source: "subscription", amount: money(row.amount), revenueDate: getSubscriptionRevenueDate(row) }));

  const postedRows = journalRows.map((row) => ({
    id: `financial:${row.id}`,
    financialTransactionId: row.id,
    attendanceSourceId: row.attendanceSourceId || row.attendance_source_id || row.attendanceId || row.attendance_id || null,
    source: "financial_journal",
    categoryCode: row.categoryCode || row.category_code,
    planType: row.categoryCode || row.category_code,
    studentId: row.studentId || row.student_id || null,
    groupId: row.groupId || row.group_id || null,
    amount: money(row.amountUah ?? row.amount_uah),
    paid: true,
    payMethod: row.paymentMethod || row.payment_method_code || null,
    operationDate: row.operationDate || row.operation_date || null,
    revenueDate: getFinancialRevenueDate(row),
  }));

  return [...legacyRows, ...postedRows];
};
