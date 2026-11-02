export const projectMovedMemberships = (rows, {
  sourceGroupId,
  targetGroupId,
  addTargetStudentIds = [],
  removeSourceStudentIds = [],
  localIdPrefix = "local_move",
}) => {
  const removed = new Set(removeSourceStudentIds.map((id) => String(id)));
  const next = (rows || []).filter((row) => !(
    String(row.groupId) === String(sourceGroupId)
    && removed.has(String(row.studentId))
  ));
  const existing = new Set(next.map((row) => `${String(row.studentId)}:${String(row.groupId)}`));
  const additions = addTargetStudentIds
    .filter((studentId) => !existing.has(`${String(studentId)}:${String(targetGroupId)}`))
    .map((studentId) => ({
      id: `${localIdPrefix}_${String(studentId)}_${String(targetGroupId)}`,
      studentId,
      groupId: targetGroupId,
    }));
  return [...next, ...additions];
};

export const projectMovedSubscriptions = (rows, {
  targetGroupId,
  subscriptionIds = [],
  restorePreviousSubscriptionIds = {},
}) => {
  const moved = new Set(subscriptionIds.map((id) => String(id)));
  const projected = (rows || []).map((sub) => {
    const subId = String(sub.id);
    const previousId = String(sub.previousSubscriptionId || "");
    if (moved.has(subId)) {
      return {
        ...sub,
        groupId: targetGroupId,
        previousSubscriptionId: moved.has(previousId) ? sub.previousSubscriptionId : null,
      };
    }
    if (moved.has(previousId)) return { ...sub, previousSubscriptionId: null };
    return sub;
  });

  return projected.map((sub) => (
    Object.prototype.hasOwnProperty.call(restorePreviousSubscriptionIds, String(sub.id))
      ? { ...sub, previousSubscriptionId: restorePreviousSubscriptionIds[String(sub.id)] ?? null }
      : sub
  ));
};

export const projectGroupArchiveState = (group, { wasArchived = false } = {}) => {
  const archiveMarker = wasArchived
    ? (group?.archived_at ?? group?.archivedAt ?? new Date().toISOString())
    : null;
  return {
    ...(group || {}),
    is_active: !wasArchived,
    isActive: !wasArchived,
    active: !wasArchived,
    archived_at: archiveMarker,
    archivedAt: archiveMarker,
    archived: wasArchived,
    isArchived: wasArchived,
  };
};

export async function commitServerMutationThenRefresh({
  commit,
  applyCommitted,
  refresh,
  applyRefresh,
  onRefreshFailure,
}) {
  const committed = await commit();
  applyCommitted(committed);

  try {
    const refreshed = await refresh();
    applyRefresh(refreshed);
    return { committed, refreshed: true };
  } catch (refreshError) {
    onRefreshFailure?.(refreshError, committed);
    return { committed, refreshed: false, refreshError };
  }
}

export const commitGroupMergeThenRefresh = commitServerMutationThenRefresh;
