const IOS_STANDALONE = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator?.standalone === true);

export const PUSH_STATUS = {
  unsupported: "unsupported",
  installRequired: "install_required",
  permissionDefault: "permission_default",
  permissionDenied: "permission_denied",
  permissionGranted: "permission_granted",
  subscribed: "subscribed",
  missingVapidKey: "missing_vapid_key",
  error: "error",
};

export const isPushSupported = () => {
  if (typeof window === "undefined") return false;
  return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
};

export const mayRequireInstallForPush = () => {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  return isIOS && !IOS_STANDALONE();
};


const withTimeout = async (promise, timeoutMs, timeoutMessage) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
};


const waitForServiceWorkerActivation = (registration, timeoutMs = 10000) => {
  const candidate = registration?.active || registration?.installing || registration?.waiting;
  if (!candidate) {
    throw new Error("Service worker не готовий. Оновіть сторінку або перевідкрийте PWA.");
  }
  if (candidate.state === "activated") return Promise.resolve(registration);

  return withTimeout(new Promise((resolve, reject) => {
    const onStateChange = () => {
      if (candidate.state === "activated") {
        candidate.removeEventListener("statechange", onStateChange);
        resolve(registration);
      } else if (candidate.state === "redundant") {
        candidate.removeEventListener("statechange", onStateChange);
        reject(new Error("Service worker став невалідним (redundant)."));
      }
    };
    candidate.addEventListener("statechange", onStateChange);
    onStateChange();
  }), timeoutMs, "Service worker не готовий. Оновіть сторінку або перевідкрийте PWA.");
};

export const ensureServiceWorkerRegistration = async (timeoutMs = 10000) => {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    throw new Error("Service worker не підтримується в цьому браузері.");
  }

  try {
    let registration = await withTimeout(
      navigator.serviceWorker.getRegistration(),
      timeoutMs,
      "Service worker не готовий. Оновіть сторінку або перевідкрийте PWA.",
    );

    if (!registration) {
      registration = await withTimeout(
        navigator.serviceWorker.register("/sw.js"),
        timeoutMs,
        "Service worker не готовий. Оновіть сторінку або перевідкрийте PWA.",
      );
    }

    if (registration.installing || registration.waiting || !registration.active) {
      registration = await waitForServiceWorkerActivation(registration, timeoutMs);
    }

    return registration;
  } catch (error) {
    throw new Error(String(error?.message || error || "Service worker registration failed"));
  }
};

const base64ToUint8Array = (base64String) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
};

export const getPushStatus = async () => {
  if (!isPushSupported()) return PUSH_STATUS.unsupported;
  if (mayRequireInstallForPush()) return PUSH_STATUS.installRequired;

  const permission = Notification.permission;
  if (permission === "denied") return PUSH_STATUS.permissionDenied;

  if (permission === "granted") {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? PUSH_STATUS.subscribed : PUSH_STATUS.permissionGranted;
  }

  return PUSH_STATUS.permissionDefault;
};

export const requestPushSubscription = async ({ vapidPublicKey }) => {
  try {
    if (!isPushSupported()) {
      return { ok: false, status: PUSH_STATUS.unsupported, error: "Push is not supported" };
    }
    if (mayRequireInstallForPush()) {
      return { ok: false, status: PUSH_STATUS.installRequired, error: "Install app on home screen first" };
    }
    if (!vapidPublicKey) {
      return { ok: false, status: PUSH_STATUS.missingVapidKey, error: "Missing VAPID public key" };
    }

    const permission = await Notification.requestPermission();
    if (permission === "denied") {
      return { ok: false, status: PUSH_STATUS.permissionDenied, error: "Permission denied" };
    }
    if (permission !== "granted") {
      return { ok: false, status: PUSH_STATUS.permissionDefault, error: "Permission not granted" };
    }

    const reg = await ensureServiceWorkerRegistration(10000);

    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await withTimeout(
        reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64ToUint8Array(vapidPublicKey),
        }),
        10000,
        "Не вдалося завершити push-підписку. Оновіть сторінку або спробуйте ще раз.",
      );
    }

    return { ok: true, status: PUSH_STATUS.subscribed, subscription };
  } catch (error) {
    return {
      ok: false,
      status: PUSH_STATUS.error,
      error: String(error?.message || error || "Push subscription failed"),
    };
  }
};

export const extractPushSubscriptionPayload = (subscription) => {
  if (!subscription) throw new Error("Subscription is required");
  const json = subscription.toJSON();
  const endpoint = json.endpoint || "";
  const p256dh = json.keys?.p256dh || "";
  const auth = json.keys?.auth || "";
  if (!endpoint || !p256dh || !auth) {
    throw new Error("Incomplete PushSubscription payload");
  }
  return {
    endpoint,
    p256dh,
    auth,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent || null : null,
    platform: typeof navigator !== "undefined" ? navigator.platform || null : null,
    is_active: true,
  };
};


export const sendTestPushRequest = async (accessToken) => {
  if (!accessToken) {
    return { ok: false, status: "auth_error", error: "Missing access token" };
  }

  const response = await fetch("/api/send-test-push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.ok) {
    return {
      ok: false,
      status: data?.status || "error",
      error: data?.error || `HTTP ${response.status}`,
      sent: Number(data?.sent || 0),
      deactivated: Number(data?.deactivated || 0),
    };
  }

  return {
    ok: true,
    status: data.status || "sent",
    sent: Number(data.sent || 0),
    deactivated: Number(data.deactivated || 0),
    failed: Number(data.failed || 0),
  };
};
