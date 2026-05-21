import { createClient } from "@supabase/supabase-js";
import { ADMIN_LOG_CHAT_ID } from "../server/trainer-digest-send.js";
import fs from "node:fs";
import path from "node:path";

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

const detectSchedulerStatus = () => {
  try {
    const vercelPath = path.join(process.cwd(), "vercel.json");
    if (!fs.existsSync(vercelPath)) {
      return { active: false, reason: "vercel_json_missing", targetPath: "/api/dispatch-trainer-digests" };
    }
    const raw = fs.readFileSync(vercelPath, "utf8");
    const parsed = JSON.parse(raw || "{}");
    const crons = Array.isArray(parsed?.crons) ? parsed.crons : [];
    const hasDispatchCron = crons.some((c) => String(c?.path || "").trim() === "/api/dispatch-trainer-digests");
    if (!hasDispatchCron) {
      return { active: false, reason: "dispatch_cron_not_declared", targetPath: "/api/dispatch-trainer-digests" };
    }
    return { active: true, reason: "dispatch_cron_declared", targetPath: "/api/dispatch-trainer-digests" };
  } catch (error) {
    return { active: false, reason: "scheduler_check_failed", details: String(error?.message || error), targetPath: "/api/dispatch-trainer-digests" };
  }
};

const handleReadiness = async (res) => {
  const supabase = buildSupabase();
  const [stateCheck, historyCheck] = await Promise.all([
    supabase.from("trainer_notification_state").select("chat_id", { count: "exact", head: true }),
    supabase.from("trainer_dispatch_history").select("id", { count: "exact", head: true }),
  ]);
  const scheduler = detectSchedulerStatus();
  const ready = !stateCheck.error && !historyCheck.error;
  return res.status(200).json({
    success: true,
    ready,
    adminConfigured: !!ADMIN_LOG_CHAT_ID,
    checks: {
      trainer_notification_state: stateCheck.error ? String(stateCheck.error.message || stateCheck.error) : "ok",
      trainer_dispatch_history: historyCheck.error ? String(historyCheck.error.message || historyCheck.error) : "ok",
    },
    scheduler,
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


const RULE_KEYS = {
  pre: "trainer_pre_lesson_digest",
  post: "trainer_post_lesson_attendance",
};

const DEFAULT_RULES = {
  [RULE_KEYS.pre]: {
    key: RULE_KEYS.pre,
    enabled: true,
    channel: "push",
    minutes_before_lesson: 30,
    include_trial_bookings: true,
    include_unpaid_students: true,
    include_attendance_reminder: false,
  },
  [RULE_KEYS.post]: {
    key: RULE_KEYS.post,
    enabled: false,
    channel: "push",
    minutes_before_lesson: 30,
    include_trial_bookings: false,
    include_unpaid_students: false,
    include_attendance_reminder: true,
  },
};

const normalizeRule = (row = {}, fallbackKey = RULE_KEYS.pre) => {
  const base = DEFAULT_RULES[fallbackKey] || DEFAULT_RULES[RULE_KEYS.pre];
  return {
    key: String(row.key || base.key),
    enabled: row.enabled !== false,
    channel: ["push", "telegram", "both"].includes(String(row.channel || "").toLowerCase()) ? String(row.channel).toLowerCase() : base.channel,
    minutes_before_lesson: Math.min(1440, Math.max(0, Number(row.minutes_before_lesson ?? base.minutes_before_lesson) || 0)),
    include_trial_bookings: row.include_trial_bookings !== false,
    include_unpaid_students: row.include_unpaid_students !== false,
    include_attendance_reminder: !!row.include_attendance_reminder,
  };
};

const upsertDefaultRule = async (supabase, key) => {
  const payload = { ...DEFAULT_RULES[key], updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from("notification_rules").upsert(payload, { onConflict: "key" }).select("*").single();
  if (error) throw error;
  return normalizeRule(data, key);
};

const handleRule = async (req, res) => {
  const supabase = buildSupabase();

  if (req.method === "GET") {
    const keyParam = String(req.query?.key || "").trim();
    if (keyParam) {
      if (!DEFAULT_RULES[keyParam]) return res.status(400).json({ error: "Unsupported rule key" });
      const { data, error } = await supabase.from("notification_rules").select("*").eq("key", keyParam).maybeSingle();
      if (error) return res.status(500).json({ error: "Failed to load notification rule", details: String(error.message || error) });
      if (data) return res.status(200).json({ success: true, rule: normalizeRule(data, keyParam) });
      try {
        const created = await upsertDefaultRule(supabase, keyParam);
        return res.status(200).json({ success: true, rule: created });
      } catch (insertError) {
        return res.status(500).json({ error: "Failed to create default notification rule", details: String(insertError.message || insertError) });
      }
    }

    const keys = Object.values(RULE_KEYS);
    const { data, error } = await supabase.from("notification_rules").select("*").in("key", keys);
    if (error) return res.status(500).json({ error: "Failed to load notification rules", details: String(error.message || error) });
    const byKey = new Map((data || []).map((r) => [String(r.key), r]));
    const rules = [];
    for (const key of keys) {
      if (byKey.has(key)) {
        rules.push(normalizeRule(byKey.get(key), key));
      } else {
        try {
          rules.push(await upsertDefaultRule(supabase, key));
        } catch (insertError) {
          return res.status(500).json({ error: "Failed to create default notification rule", details: String(insertError.message || insertError), key });
        }
      }
    }
    return res.status(200).json({ success: true, rules, rule: rules.find((r) => r.key === RULE_KEYS.pre) || null });
  }

  if (req.method === "POST") {
    const body = req.body || {};
    const key = String(body.key || "").trim();
    if (!DEFAULT_RULES[key]) return res.status(400).json({ error: "Unsupported rule key" });
    const normalized = normalizeRule(body, key);
    const payload = { ...normalized, key, updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from("notification_rules").upsert(payload, { onConflict: "key" }).select("*").single();
    if (error) return res.status(500).json({ error: "Failed to save notification rule", details: String(error.message || error) });
    return res.status(200).json({ success: true, rule: normalizeRule(data, key) });
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
    if ((req.method === "GET" || req.method === "POST") && op === "rule") return await handleRule(req, res);
    return res.status(400).json({ error: "Unknown trainer notifications op", allowedOps: ["readiness", "state", "history", "rule"] });
  } catch (error) {
    return res.status(500).json({
      error: "Trainer notifications operation failed",
      details: String(error?.message || error),
      op,
    });
  }
}
