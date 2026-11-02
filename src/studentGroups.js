export const resolveStudentGroupsResponse = ({ data, error }) => {
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    studentId: row.student_id,
    groupId: row.group_id,
  }));
};
