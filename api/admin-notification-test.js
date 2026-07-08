import { createClient } from "@supabase/supabase-js";
import { authError, requireAdminUser } from "./_auth.js";

const buildServiceClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error("Missing Supabase service env vars");
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false }, global: { headers: { "X-Client-Info": "admin-notification-test" } } });
};

const sendTelegramMessage = async ({ chatId, text }) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, status: 500, error: "missing_telegram_bot_token" };
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    return { ok: false, status: 502, error: "telegram_send_failed", details: payload?.description || "Telegram API error" };
  }
  return { ok: true };
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  try {
    const admin = await requireAdminUser(req);
    if (!admin.ok) return authError(res, admin);

    const supabase = buildServiceClient();
    const { data: settings, error } = await supabase
      .from("admin_notification_settings")
      .select("id, admin_user_id, telegram_chat_id, enabled")
      .eq("admin_user_id", admin.user.id)
      .maybeSingle();
    if (error) return res.status(500).json({ error: "settings_read_failed", details: error.message });
    const chatId = String(settings?.telegram_chat_id || "").trim();
    if (!chatId) return res.status(400).json({ error: "missing_telegram_chat_id" });

    const sent = await sendTelegramMessage({ chatId, text: "Тестове адмін-сповіщення SOROKA CRM ✅" });
    if (!sent.ok) return res.status(sent.status).json({ error: sent.error, details: sent.details });
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: "admin_notification_test_failed", details: error?.message || "Unexpected error" });
  }
}
