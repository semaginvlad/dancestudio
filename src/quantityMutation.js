export async function runIdempotentQuantityMutation({
  pendingKeys,
  identity,
  attendanceId,
  expectedQuantity,
  targetQuantity,
  createKey,
  mutate,
  refresh,
}) {
  let idempotencyKey = pendingKeys.get(identity);
  if (!idempotencyKey) {
    idempotencyKey = createKey();
    pendingKeys.set(identity, idempotencyKey);
  }
  try {
    const row = await mutate(idempotencyKey);
    pendingKeys.delete(identity);
    return { status: "committed", row, idempotencyKey };
  } catch (error) {
    try {
      const refreshed = await refresh();
      const rows = Array.isArray(refreshed) ? refreshed : refreshed?.freshAttn || [];
      const row = rows.find((item) => String(item.id) === String(attendanceId)) || null;
      pendingKeys.delete(identity);
      if (Number(row?.quantity) === Number(targetQuantity)) {
        return { status: "confirmed_by_refresh", row, idempotencyKey, error };
      }
      return { status: "rejected_confirmed", row, idempotencyKey, error };
    } catch (refreshError) {
      return { status: "uncertain", idempotencyKey, error, refreshError };
    }
  }
}
