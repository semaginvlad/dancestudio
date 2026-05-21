import webpush from "web-push";

const isGoneSubscriptionError = (error) => {
  const statusCode = Number(error?.statusCode || error?.status || 0);
  return statusCode === 404 || statusCode === 410;
};

const buildWebPushPayload = (payload = {}) => JSON.stringify({
  title: payload.title || "SOROKA CRM",
  body: payload.body || "Нове сповіщення",
  url: payload.url || "/",
});

export const sendPushToUser = async ({ supabase, targetUserId, payload }) => {
  if (!supabase) throw new Error("supabase is required");
  if (!targetUserId) throw new Error("targetUserId is required");

  const vapidPublicKey = process.env.WEB_PUSH_PUBLIC_KEY || "";
  const vapidPrivateKey = process.env.WEB_PUSH_PRIVATE_KEY || "";
  const vapidSubject = process.env.WEB_PUSH_SUBJECT || "";
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    throw new Error("Missing web push environment variables");
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const { data: subs, error: subsError } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", targetUserId)
    .eq("is_active", true);

  if (subsError) throw subsError;
  if (!subs?.length) return { sent: 0, failed: 0, deactivated: 0, noActiveSubscriptions: true, errors: [] };

  let sent = 0;
  let failed = 0;
  let deactivated = 0;
  const errors = [];
  const body = buildWebPushPayload(payload);

  for (const sub of subs) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body);
      sent += 1;
    } catch (error) {
      if (isGoneSubscriptionError(error)) {
        await supabase.from("push_subscriptions").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", sub.id);
        deactivated += 1;
        continue;
      }
      failed += 1;
      errors.push({ subscriptionId: sub.id, message: String(error?.message || error) });
    }
  }

  return { sent, failed, deactivated, noActiveSubscriptions: false, errors };
};
