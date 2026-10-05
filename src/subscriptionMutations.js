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

const SUBSCRIPTION_REFRESH_WARNING = "Абонемент збережено, але список не вдалося оновити. Повторіть лише оновлення списку.";

export const composeSubscriptionNotice = ({ followUpWarning = "", refreshed = true } = {}) => {
  const messages = [String(followUpWarning || "").trim()];
  if (!refreshed) messages.push(SUBSCRIPTION_REFRESH_WARNING);
  const message = messages.filter(Boolean).join(" ");

  if (!message) return null;
  return {
    type: "warning",
    ...(refreshed === false ? { retryable: true } : {}),
    message,
  };
};

export async function refreshSubscriptionsOnly({ fetchSubscriptions, applySubscriptions, setNotice }) {
  try {
    const subscriptions = await fetchSubscriptions();
    applySubscriptions(subscriptions);
    setNotice(null);
    return true;
  } catch (error) {
    setNotice({
      type: "error",
      retryable: true,
      message: subscriptionErrorMessage("refresh", error),
    });
    return false;
  }
}

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
