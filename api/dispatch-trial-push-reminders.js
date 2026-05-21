import { createClient } from "@supabase/supabase-js";
import { sendPushToUser } from "../server/push-send.js";

const buildSupabase = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase server environment variables");
  return createClient(supabaseUrl, serviceRoleKey);
};

const isAuthorizedCronRequest = (req) => {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const auth = String(req.headers?.authorization || "").trim();
  return auth === `Bearer ${secret}`;
};

const isoToday = () => new Date().toISOString().slice(0, 10);

export default async function handler(req, res) {
  const method = String(req.method || "GET").toUpperCase();
  if (method !== "POST" && method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });

  if (!isAuthorizedCronRequest(req)) return res.status(401).json({ ok: false, error: "Unauthorized" });

  const supabase = buildSupabase();
  const today = isoToday();

  const { data: bookings, error: bookingError } = await supabase
    .from("trial_bookings")
    .select("id, name, group_id, trial_date, status")
    .eq("status", "confirmed")
    .eq("trial_date", today);
  if (bookingError) return res.status(500).json({ ok: false, error: "Failed to load trial bookings", details: String(bookingError.message || bookingError) });

  const results = [];
  for (const booking of bookings || []) {
    const { data: group, error: groupError } = await supabase
      .from("groups")
      .select("id, name, trainer_id")
      .eq("id", booking.group_id)
      .maybeSingle();

    if (groupError || !group?.trainer_id) {
      results.push({ bookingId: booking.id, status: "skipped", reason: "missing_group_or_trainer" });
      continue;
    }

    const targetUserId = String(group.trainer_id);
    const deliveryKey = `trial_confirmed:${booking.id}:${booking.trial_date}:${targetUserId}`;

    const { data: existingDelivery } = await supabase
      .from("push_notification_deliveries")
      .select("id, status")
      .eq("delivery_key", deliveryKey)
      .maybeSingle();

    if (existingDelivery) {
      results.push({ bookingId: booking.id, status: "skipped", reason: "duplicate_prevented", deliveryKey });
      continue;
    }

    const payload = {
      title: "Пробне заняття сьогодні",
      body: `${booking.name || "Учениця"} має пробне у групі ${group.name || "без назви"}`,
      url: "/",
    };

    const { data: inserted, error: insertError } = await supabase
      .from("push_notification_deliveries")
      .insert({
        kind: "trial_confirmed_today",
        target_user_id: targetUserId,
        entity_type: "trial_booking",
        entity_id: String(booking.id),
        delivery_key: deliveryKey,
        payload,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError) {
      const duplicate = String(insertError?.message || "").toLowerCase().includes("duplicate") || insertError?.code === "23505";
      results.push({ bookingId: booking.id, status: "skipped", reason: duplicate ? "duplicate_prevented" : "insert_failed", details: String(insertError.message || insertError), deliveryKey });
      continue;
    }

    const sendResult = await sendPushToUser({ supabase, targetUserId, payload });
    const nextStatus = sendResult.sent > 0 ? "sent" : (sendResult.noActiveSubscriptions ? "skipped" : "failed");

    await supabase
      .from("push_notification_deliveries")
      .update({
        subscription_id: null,
        status: nextStatus,
        error: sendResult.failed > 0 ? JSON.stringify(sendResult.errors) : null,
        sent_at: sendResult.sent > 0 ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", inserted.id);

    results.push({ bookingId: booking.id, deliveryKey, targetUserId, groupId: group.id, status: nextStatus, sendResult });
  }

  return res.status(200).json({ ok: true, today, processed: results.length, results });
}
