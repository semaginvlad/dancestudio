export const subscriptionErrorMessage = (action, error) => {
  const detail = String(error?.message || "").trim();
  const labels = {
    create: "Не вдалося створити абонемент",
    update: "Не вдалося зберегти зміни",
    delete: "Не вдалося видалити абонемент",
    refresh: "Не вдалося оновити список абонементів",
  };
  return `${labels[action] || "Не вдалося виконати операцію"}. Дані не змінено${detail ? `: ${detail}` : ". Спробуйте ще раз."}`;
};

// The lock is changed synchronously, before React has a chance to render. This
// is deliberately separate from the visual busy state so two clicks in the
// same event loop cannot start two financial mutations.
export const createSynchronousGuard = () => {
  let locked = false;
  return {
    tryLock() {
      if (locked) return false;
      locked = true;
      return true;
    },
    release() {
      locked = false;
    },
    isLocked() {
      return locked;
    },
  };
};

export const canEditSubscription = (subscription, deletingSubscriptionIds) => (
  subscription?.id != null && !deletingSubscriptionIds?.has(String(subscription.id))
);

export async function commitThenRefresh({ mutate, applyCanonical, refresh, applyRefresh, onRefreshFailure }) {
  const canonical = await mutate();
  applyCanonical(canonical);

  try {
    const rows = await refresh();
    applyRefresh(rows);
    return { canonical, refreshed: true };
  } catch (error) {
    onRefreshFailure?.(error, canonical);
    return { canonical, refreshed: false, refreshError: error };
  }
}
