export async function commitGroupMergeThenRefresh({
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
