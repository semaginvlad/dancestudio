import { createClient } from "@supabase/supabase-js";
import { sendPushToUser } from "../server/push-send.js";

const buildSupabase = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase server environment variables");
  return createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { "X-Client-Info": "dispatch-trial-push-reminders-api" } },
  });
};

const getBearerToken = (req) => {
  const raw = String(req.headers?.authorization || "").trim();
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
};

const todayUtcDate = () => new Date().toISOString().slice(0, 10);

export default async function handler(req, res) {
  const method = String(req.method || "GET").toUpperCase();
  res.setHeader("Allow", "GET, POST, OPTIONS");

  if (method === "OPTIONS") return res.status(200).json({ ok: true, methods: ["GET", "POST"] });
  if (method !== "GET" && method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const cronSecret = process.env.CRON_SECRET || "";
  const token = getBearerToken(req);
  if (!cronSecret || token !== cronSecret) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  try {
    const supabase = buildSupabase();
    const trialDate = todayUtcDate();

    const { data: bookings, error: bookingsError } = await supabase
      .from("trial_bookings")
      .select("id, trial_date, name, group_id, status")
      .eq("status", "confirmed")
      .eq("trial_date", trialDate);
    if (bookingsError) throw bookingsError;

    const results = [];

    for (const booking of bookings || []) {
      const bookingId = String(booking.id || "");
      const groupId = String(booking.group_id || "");

      const { data: group, error: groupError } = await supabase
        .from("groups")
        .select("id, name, trainer_id")
        .eq("id", groupId)
        .maybeSingle();

      if (groupError) {
        const deliveryKey = `trial_confirmed:${bookingId}:${trialDate}:group_lookup_error`;
        await supabase.from("push_notification_deliveries").upsert({
          kind: "trial_confirmed_reminder",
          target_user_id: "00000000-0000-0000-0000-000000000000",
          entity_type: "trial_booking",
          entity_id: bookingId,
          delivery_key: deliveryKey,
          payload: { error: String(groupError?.message || groupError) },
          status: "failed",
          error: String(groupError?.message || groupError),
        }, { onConflict: "delivery_key" });
        results.push({ bookingId, status: "failed", reason: "group_lookup_failed" });
        continue;
      }

      const targetUserId = String(group?.trainer_id || "").trim();
      const deliveryKey = `trial_confirmed:${bookingId}:${trialDate}:${targetUserId || "missing_target"}`;

      if (!targetUserId) {
        await supabase.from("push_notification_deliveries").upsert({
          kind: "trial_confirmed_reminder",
          target_user_id: "00000000-0000-0000-0000-000000000000",
          entity_type: "trial_booking",
          entity_id: bookingId,
          delivery_key: deliveryKey,
          payload: { bookingId, trialDate, groupId },
          status: "skipped",
          error: "Missing trainer target user id",
        }, { onConflict: "delivery_key" });
        results.push({ bookingId, status: "skipped", reason: "missing_target_user_id" });
        continue;
      }

      const { data: existing } = await supabase
        .from("push_notification_deliveries")
        .select("id")
        .eq("delivery_key", deliveryKey)
        .maybeSingle();

      if (existing?.id) {
        results.push({ bookingId, status: "skipped", reason: "duplicate", deliveryKey });
        continue;
      }

      const payload = {
        title: "Пробне заняття сьогодні",
        body: `${String(booking.name || "Учениця")} має пробне у групі ${String(group?.name || "—")}`,
        url: "/",
      };

      try {
        const pushResult = await sendPushToUser({ supabase, targetUserId, payload });
        const status = pushResult.sent > 0 ? "sent" : "failed";
        await supabase.from("push_notification_deliveries").insert({
          kind: "trial_confirmed_reminder",
          target_user_id: targetUserId,
          entity_type: "trial_booking",
          entity_id: bookingId,
          delivery_key: deliveryKey,
          payload,
          status,
          sent_at: status === "sent" ? new Date().toISOString() : null,
          error: pushResult.errors?.length ? JSON.stringify(pushResult.errors) : null,
        });
        results.push({ bookingId, status, deliveryKey, push: pushResult });
      } catch (error) {
        await supabase.from("push_notification_deliveries").insert({
          kind: "trial_confirmed_reminder",
          target_user_id: targetUserId,
          entity_type: "trial_booking",
          entity_id: bookingId,
          delivery_key: deliveryKey,
          payload,
          status: "failed",
          error: String(error?.message || error),
        });
        results.push({ bookingId, status: "failed", deliveryKey, reason: String(error?.message || error) });
      }
    }

    return res.status(200).json({ ok: true, trialDate, processed: results.length, results });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}
