import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const buildAnonClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) throw new Error("Missing Supabase URL or anon key for auth lookup");
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { "X-Client-Info": "send-test-push-api" } },
  });
};

const buildServiceClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase URL or service role key");
  return createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { "X-Client-Info": "send-test-push-api" } },
  });
};

const readBearerToken = (req) => {
  const auth = String(req.headers?.authorization || "").trim();
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
};

const TEST_PAYLOAD = JSON.stringify({
  title: "SOROKA CRM",
  body: "Тестове push-сповіщення працює ✅",
  url: "/",
});

const isGoneSubscriptionError = (error) => {
  const statusCode = Number(error?.statusCode || error?.status || 0);
  return statusCode === 404 || statusCode === 410;
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const token = readBearerToken(req);
    if (!token) return res.status(401).json({ ok: false, error: "Missing bearer token" });

    const vapidPublicKey = process.env.WEB_PUSH_PUBLIC_KEY || "";
    const vapidPrivateKey = process.env.WEB_PUSH_PRIVATE_KEY || "";
    const vapidSubject = process.env.WEB_PUSH_SUBJECT || "";
    if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
      return res.status(500).json({ ok: false, error: "Missing web push environment variables" });
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const authClient = buildAnonClient();
    const adminClient = buildServiceClient();

    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData?.user?.id) {
      return res.status(401).json({ ok: false, error: "Invalid access token" });
    }
    const userId = userData.user.id;

    const { data: subs, error: subsError } = await adminClient
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (subsError) throw subsError;
    if (!subs?.length) {
      return res.status(200).json({ ok: true, status: "no_active_subscriptions", sent: 0, deactivated: 0 });
    }

    let sent = 0;
    let deactivated = 0;
    const errors = [];

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          TEST_PAYLOAD,
        );
        sent += 1;
      } catch (error) {
        if (isGoneSubscriptionError(error)) {
          await adminClient
            .from("push_subscriptions")
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq("id", sub.id)
            .eq("user_id", userId);
          deactivated += 1;
          continue;
        }
        errors.push({ id: sub.id, message: String(error?.message || error) });
      }
    }

    return res.status(200).json({
      ok: true,
      status: sent > 0 ? "sent" : "failed",
      sent,
      deactivated,
      failed: errors.length,
      errors,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}
