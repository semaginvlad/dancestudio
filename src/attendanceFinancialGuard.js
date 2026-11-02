export const FINANCIAL_ATTENDANCE_ADMIN_MESSAGE =
  "Цю фінансову відмітку може змінити лише адміністратор.";

export const isFinancialAttendance = (attendance = {}) => {
  const entryType = String(attendance.entryType ?? attendance.entry_type ?? "").trim().toLowerCase();
  const guestType = String(attendance.guestType ?? attendance.guest_type ?? "").trim().toLowerCase();
  const hasStudentField = Object.prototype.hasOwnProperty.call(attendance, "studentId")
    || Object.prototype.hasOwnProperty.call(attendance, "student_id");
  const studentId = attendance.studentId ?? attendance.student_id;
  const guestName = attendance.guestName ?? attendance.guest_name;
  const snapshot = attendance.priceSnapshotUah ?? attendance.price_snapshot_uah;

  return entryType === "trial"
    || entryType === "single"
    || guestType === "trial"
    || guestType === "single"
    || Boolean(guestName)
    || (hasStudentField && !studentId)
    || snapshot !== null && snapshot !== undefined;
};
