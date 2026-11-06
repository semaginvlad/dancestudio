const money = (value) => Number(value || 0) || 0;

export const getRevenueDate = (entry = {}) => String(
  entry.operationDate
  || entry.operation_date
  || entry.activationDate
  || entry.activation_date
  || entry.paidAt
  || entry.paid_at
  || entry.startDate
  || entry.start_date
  || entry.created_at
  || ""
).slice(0, 10);

export const getLegacyAttendanceId = (subscription = {}) => {
  const match = String(subscription.notes || "").match(/(?:^|\s)auto_one_off_from_attendance:([0-9a-f-]{36})(?:\s|$)/i);
  return match?.[1]?.toLowerCase() || null;
};

/**
 * Canonical studio income rows. Paid subscriptions remain the legacy source;
 * posted trial/single journal rows replace only an auto-one-off linked to the
 * same attendance. Room-rental and other journal categories are out of scope.
 */
export const buildCanonicalRevenueEntries = (subscriptions = [], financialTransactions = []) => {
  const journalRows = (financialTransactions || []).filter((row) => (
    row?.status === "posted"
    && row?.direction === "income"
    && ["trial", "single"].includes(String(row.categoryCode || row.category_code || "").toLowerCase())
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
    .map((row) => ({ ...row, source: "subscription", amount: money(row.amount), revenueDate: getRevenueDate(row) }));

  const postedRows = journalRows.map((row) => ({
    id: `financial:${row.id}`,
    financialTransactionId: row.id,
    attendanceSourceId: row.attendanceSourceId || row.attendance_source_id || row.attendanceId || row.attendance_id || null,
    source: "financial_journal",
    planType: row.categoryCode || row.category_code,
    studentId: row.studentId || row.student_id || null,
    groupId: row.groupId || row.group_id || null,
    amount: money(row.amountUah ?? row.amount_uah),
    paid: true,
    payMethod: row.paymentMethod || row.payment_method_code || null,
    operationDate: row.operationDate || row.operation_date || null,
    revenueDate: getRevenueDate(row),
  }));

  return [...legacyRows, ...postedRows];
};
