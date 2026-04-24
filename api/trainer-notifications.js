import { createClient } from "@supabase/supabase-js";
import { ADMIN_LOG_CHAT_ID } from "./_lib/trainer-digest-send.js";

const buildSupabase = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase server environment variables");
  return createClient(supabaseUrl, serviceRoleKey);
};

const readinessError = (res, error) => res.status(503).json({
  error: "trainer_notification_storage_not_ready",
  details: String(error?.message || error),
  requiredTables: ["trainer_notification_state", "trainer_dispatch_history"],
  requiredSql: ["sql/trainer_notification_state.sql", "sql/trainer_dispatch_history.sql"],
});

const getOp = (req) => String(req.query?.op || req.body?.op || "").trim();

const handleReadiness = async (res) => {
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
};

const handleState = async (req, res) => {
  const supabase = buildSupabase();
  if (req.method === "GET") {
    const chatId = String(req.query.chatId || "");
    if (!chatId) return res.status(400).json({ error: "chatId is required" });
    const { data, error } = await supabase.from("trainer_notification_state").select("*").eq("chat_id", chatId);
    if (error) {
      if (String(error.message || error).includes("schema cache") || String(error.message || error).includes("trainer_notification_state")) {
        return readinessError(res, error);
      }
      return res.status(500).json({ error: "Failed to load trainer notification state", details: String(error.message || error) });
    }
    return res.status(200).json({ success: true, rows: data || [] });
  }

  if (req.method === "POST") {
    const { chatId, groupId, customTemplate, autoSendEnabled, sendTimeOverride } = req.body || {};
    if (!chatId || !groupId) return res.status(400).json({ error: "chatId and groupId are required" });
    const payload = {
      chat_id: String(chatId),
      group_id: String(groupId),
      updated_at: new Date().toISOString(),
    };
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "customTemplate")) payload.custom_template = customTemplate || null;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "autoSendEnabled")) payload.auto_send_enabled = !!autoSendEnabled;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "sendTimeOverride")) payload.send_time_override = sendTimeOverride || null;
    const { data, error } = await supabase
      .from("trainer_notification_state")
      .upsert(payload, { onConflict: "chat_id,group_id" })
      .select("*")
      .single();
    if (error) {
      if (String(error.message || error).includes("schema cache") || String(error.message || error).includes("trainer_notification_state")) {
        return readinessError(res, error);
      }
      return res.status(500).json({ error: "Failed to save trainer notification state", details: String(error.message || error) });
    }
    return res.status(200).json({ success: true, row: data });
  }

  return res.status(405).json({ error: "Method not allowed" });
};

const handleHistory = async (req, res) => {
  const supabase = buildSupabase();
  if (req.method === "GET") {
    const chatId = String(req.query.chatId || "");
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    if (!chatId) return res.status(400).json({ error: "chatId is required" });
    const { data, error } = await supabase
      .from("trainer_dispatch_history")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      if (String(error.message || error).includes("schema cache") || String(error.message || error).includes("trainer_dispatch_history")) {
        return readinessError(res, error);
      }
      return res.status(500).json({ error: "Failed to load trainer dispatch history", details: String(error.message || error) });
    }
    const rows = (data || []).map((r) => ({
      id: r.id,
      chatId: r.chat_id,
      chatTitle: r.chat_title,
      groupId: r.group_id,
      groupName: r.group_name,
      triggerType: r.trigger_type,
      status: r.status,
      dedupKey: r.dedup_key,
      studentsCount: r.students_count || 0,
      details: r.details,
      reason: r.reason,
      timestamp: r.created_at,
    }));
    return res.status(200).json({ success: true, rows });
  }

  if (req.method === "POST") {
    const body = req.body || {};
    if (!body.chatId || !body.triggerType || !body.status) {
      return res.status(400).json({ error: "chatId, triggerType, status are required" });
    }
    const payload = {
      id: body.id || `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      chat_id: String(body.chatId),
      chat_title: body.chatTitle || null,
      group_id: body.groupId ? String(body.groupId) : null,
      group_name: body.groupName || null,
      trigger_type: String(body.triggerType),
      status: String(body.status),
      dedup_key: body.dedupKey || null,
      students_count: Number(body.studentsCount || 0),
      details: body.details || null,
      reason: body.reason || null,
      created_at: body.timestamp || new Date().toISOString(),
    };
    const { data, error } = await supabase.from("trainer_dispatch_history").insert(payload).select("*").single();
    if (error) {
      if (String(error.message || error).includes("schema cache") || String(error.message || error).includes("trainer_dispatch_history")) {
        return readinessError(res, error);
      }
      return res.status(500).json({ error: "Failed to save trainer dispatch history", details: String(error.message || error) });
    }
    return res.status(200).json({ success: true, row: data });
  }

  return res.status(405).json({ error: "Method not allowed" });
};

export default async function handler(req, res) {
  const op = getOp(req);
  try {
    if (req.method === "GET" && op === "readiness") return await handleReadiness(res);
    if ((req.method === "GET" || req.method === "POST") && op === "state") return await handleState(req, res);
    if ((req.method === "GET" || req.method === "POST") && op === "history") return await handleHistory(req, res);
    return res.status(400).json({ error: "Unknown trainer notifications op", allowedOps: ["readiness", "state", "history"] });
  } catch (error) {
    return res.status(500).json({
      error: "Trainer notifications operation failed",
      details: String(error?.message || error),
      op,
    });
  }
}
