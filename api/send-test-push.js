import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const getSupabaseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;

const buildServiceClient = () => {
  const supabaseUrl = getSupabaseUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase server environment variables");
  return createClient(supabaseUrl, serviceRoleKey);
};

const buildAnonClient = () => {
  const supabaseUrl = getSupabaseUrl();
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) throw new Error("Missing Supabase anon environment variables");
  return createClient(supabaseUrl, anonKey);
};

const parseBearerToken = (req) => {
  const header = String(req.headers?.authorization || "");
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
};

const configureWebPush = () => {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY || "";
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY || "";
  const subject = process.env.WEB_PUSH_SUBJECT || "";
  if (!publicKey || !privateKey || !subject) {
    throw new Error("Missing WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, or WEB_PUSH_SUBJECT");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
};

const isInvalidSubscriptionError = (statusCode) => statusCode === 404 || statusCode === 410;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const token = parseBearerToken(req);
    if (!token) return res.status(401).json({ error: "Missing bearer token" });

    const anonClient = buildAnonClient();
    const { data: authData, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !authData?.user?.id) {
      return res.status(401).json({ error: "Invalid auth token", details: String(authError?.message || authError || "Unauthorized") });
    }

    const userId = authData.user.id;
    const supabase = buildServiceClient();

    const { data: rows, error: rowsError } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (rowsError) {
      return res.status(500).json({ error: "Failed to load push subscriptions", details: String(rowsError.message || rowsError) });
    }

    const subscriptions = rows || [];
    if (!subscriptions.length) {
      return res.status(200).json({ success: true, status: "no_active_subscriptions", sent: 0, deactivated: 0 });
    }

    configureWebPush();

    const payload = JSON.stringify({
      title: "SOROKA CRM",
      body: "Тестове push-сповіщення працює ✅",
      url: "/",
    });

    let sent = 0;
    let deactivated = 0;

    for (const row of subscriptions) {
      try {
        await webpush.sendNotification({
          endpoint: row.endpoint,
          keys: {
            p256dh: row.p256dh,
            auth: row.auth,
          },
        }, payload);
        sent += 1;
      } catch (error) {
        const code = Number(error?.statusCode || 0);
        if (isInvalidSubscriptionError(code)) {
          await supabase
            .from("push_subscriptions")
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq("id", row.id)
            .eq("user_id", userId);
          deactivated += 1;
          continue;
        }
      }
    }

    return res.status(200).json({
      success: true,
      status: sent > 0 ? "sent" : "not_sent",
      sent,
      deactivated,
      total: subscriptions.length,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to send test push",
      details: String(error?.message || error),
    });
  }
}
