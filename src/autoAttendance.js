// The trainer request carries only the cell identity and desired attendance count.
export async function setAutoAttendance(client, { studentId, groupId, date, quantity }) {
  const { error } = await client.rpc('crm_set_auto_attendance', {
    p_student_id: studentId, p_group_id: groupId, p_date: date, p_quantity: quantity,
  });
  if (error) throw error;
}

export function nextAutoQuantity(rows) {
  const count = rows.reduce((sum, row) => sum + (row.quantity || 1), 0);
  return count === 0 ? 1 : count === 1 ? 2 : 0;
}

// Queue-Auto rows can span subscriptions and debt in the same cell.
export function aggregateQueueAutoAttendance(rows) {
  const entryType = rows.some((row) => String(row.entryType || '').trim().toLowerCase() === 'debt')
    ? 'debt' : rows[0].entryType;
  return { ...rows[0], entryType, quantity: rows.reduce((sum, row) => sum + (row.quantity || 1), 0) };
}

export function debtAttendanceCellView(record, isDark) {
  return { bg: isDark ? '#7f1d1d' : '#dc2626', mark: record.queueAuto && record.quantity >= 2 ? '2' : '!' };
}
