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
