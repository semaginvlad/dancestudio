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

export function mergeCommittedBooking(existing, response, payload) {
  const hasPrice = Object.prototype.hasOwnProperty.call(payload || {}, "price");
  const hasPaymentMethod = Object.prototype.hasOwnProperty.call(payload || {}, "paymentMethod")
    || Object.prototype.hasOwnProperty.call(payload || {}, "payment_method");
  const explicitMethod = Object.prototype.hasOwnProperty.call(payload || {}, "paymentMethod")
    ? payload.paymentMethod
    : payload?.payment_method;
  return {
    ...existing,
    ...response,
    price: hasPrice ? payload.price : existing?.price,
    paymentMethod: hasPaymentMethod ? explicitMethod : existing?.paymentMethod,
  };
}
