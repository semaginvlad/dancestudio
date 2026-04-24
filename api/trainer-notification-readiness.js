import { createClient } from "@supabase/supabase-js";
import { ADMIN_LOG_CHAT_ID } from "./_lib/trainer-digest-send.js";

const buildSupabase = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase server environment variables");
  return createClient(supabaseUrl, serviceRoleKey);
};

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const supabase = buildSupabase();
    const [stateCheck, historyCheck] = await Promise.all([
      supabase.from("trainer_notification_state").select("chat_id", { count: "exact", head: true }),
      supabase.from("trainer_dispatch_history").select("id", { count: "exact", head: true }),
    ]);
    const ready = !stateCheck.error && !historyCheck.error;
    return res.status(200).json({
      success: true,
      ready,
      adminConfigured: !!ADMIN_LOG_CHAT_ID,
      checks: {
        trainer_notification_state: stateCheck.error ? String(stateCheck.error.message || stateCheck.error) : "ok",
        trainer_dispatch_history: historyCheck.error ? String(historyCheck.error.message || historyCheck.error) : "ok",
      },
      requiredTables: ["trainer_notification_state", "trainer_dispatch_history"],
      requiredSql: ["sql/trainer_notification_state.sql", "sql/trainer_dispatch_history.sql"],
    });
  } catch (error) {
    return res.status(500).json({ error: "Failed to check readiness", details: String(error?.message || error) });
  }
}
