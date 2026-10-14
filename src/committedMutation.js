export async function reconcileAfterCommit({ committed, applyCommitted, refresh, applyFresh, onRefreshFailure }) {
  applyCommitted?.(committed);
  try {
    const fresh = await refresh();
    applyFresh?.(fresh);
    return { committed, fresh, refreshed: true, refreshRequired: false };
  } catch (refreshError) {
    onRefreshFailure?.(refreshError, committed);
    return { committed, refreshed: false, refreshRequired: true, refreshError };
  }
}
