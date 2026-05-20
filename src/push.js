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

  const reg = await navigator.serviceWorker.ready;
  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64ToUint8Array(vapidPublicKey),
    });
  }

  return { ok: true, status: PUSH_STATUS.subscribed, subscription };
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
    return { ok: false, status: "error", error: "Missing access token" };
  }

  const response = await fetch("/api/send-test-push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({}),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      status: "error",
      error: payload?.details || payload?.error || "Failed to send test push",
    };
  }

  return {
    ok: true,
    status: payload?.status || "sent",
    sent: Number(payload?.sent || 0),
    deactivated: Number(payload?.deactivated || 0),
    total: Number(payload?.total || 0),
  };
};
