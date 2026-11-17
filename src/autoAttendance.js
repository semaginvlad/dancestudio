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

export const HISTORICAL_AUTO_MESSAGE = "Це старий запис, який поки не підтримує редагування в режимі «Авто».";
export const TRAINER_ONE_OFF_MESSAGE = "Пробне або разове заняття може скасувати адміністратор";

export function autoCellAction(rows, isAdmin) {
  if (!isAdmin && rows.some(row => ['trial', 'single'].includes(String(row.entryType || row.guestType || '').toLowerCase()))) return 'one-off';
  if (rows.some(row => !row.queueAuto)) return 'historical';
  return !isAdmin && rows.length ? 'remove' : 'set';
}

export async function removeMyAutoAttendance(client, { studentId, groupId, date }) {
  const { error } = await client.rpc('crm_remove_my_auto_attendance', {
    p_student_id: studentId, p_group_id: groupId, p_date: date,
  });
  if (error) throw error;
}
