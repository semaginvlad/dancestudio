import { createClient } from "@supabase/supabase-js";
import { ADMIN_LOG_CHAT_ID } from "../server/trainer-digest-send.js";
import { withTelegramClient, resolveTelegramPeer } from "../server/telegram-user-client.js";
import { sendPushToUser } from "../server/push-send.js";
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
const VALID_CHANNELS = new Set(["push", "telegram", "both"]);
const TIME_RE = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;

const parseDaysOfWeek = (value) => {
  if (value == null) return [];
  if (!Array.isArray(value)) return null;
  const normalized = value.map((d) => Number(d));
  if (normalized.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) return null;
  return normalized;
};

const normalizeScheduleRuleInput = (body = {}, { requireCoreFields = false } = {}) => {
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
  const errors = [];
  const payload = {};

  if (requireCoreFields || has("name")) {
    const name = String(body.name || "").trim();
    if (!name) errors.push("name is required");
    else payload.name = name;
  }

  if (requireCoreFields || has("group_id")) {
    const groupId = String(body.group_id || "").trim();
    if (!groupId) errors.push("group_id is required");
    else payload.group_id = groupId;
  }

  if (requireCoreFields || has("send_time_local")) {
    const sendTimeLocal = String(body.send_time_local || "").trim();
    if (!TIME_RE.test(sendTimeLocal)) errors.push("send_time_local must be in HH:mm format");
    else payload.send_time_local = sendTimeLocal;
  }

  if (has("trainer_id") || requireCoreFields) {
    const trainerIdRaw = body.trainer_id;
    payload.trainer_id = trainerIdRaw ? String(trainerIdRaw).trim() : null;
  }

  if (has("channel") || requireCoreFields) {
    const channel = String(body.channel || "push").trim();
    if (!VALID_CHANNELS.has(channel)) errors.push("channel must be one of: push, telegram, both");
    else payload.channel = channel;
  }

  if (has("timezone") || requireCoreFields) payload.timezone = String(body.timezone || "Europe/Kyiv").trim() || "Europe/Kyiv";
  if (has("enabled")) payload.enabled = !!body.enabled;
  if (has("message_template")) {
    if (body.message_template == null) payload.message_template = null;
    else payload.message_template = String(body.message_template).trim();
  }
  if (has("include_trial_bookings")) payload.include_trial_bookings = !!body.include_trial_bookings;
  if (has("include_unpaid_students")) payload.include_unpaid_students = !!body.include_unpaid_students;
  if (has("include_attendance_reminder")) payload.include_attendance_reminder = !!body.include_attendance_reminder;

  if (has("days_of_week") || requireCoreFields) {
    const days = parseDaysOfWeek(body.days_of_week);
    if (!days) errors.push("days_of_week must be an array of integers in range 1..7");
    else payload.days_of_week = days;
  }

  return { errors, payload };
};

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

const isDryRunFlag = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const getLocalDateParts = (timezone = "Europe/Kyiv", now = new Date()) => {
  const dayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = dayParts.find((x) => x.type === "year")?.value || "1970";
  const m = dayParts.find((x) => x.type === "month")?.value || "01";
  const d = dayParts.find((x) => x.type === "day")?.value || "01";
  return `${y}-${m}-${d}`;
};

const resolveTelegramTarget = (rule, trainerRows, telegramMetaRows) => {
  const trainerKey = String(rule.trainer_id || "").trim();
  if (!trainerKey) return { target: null, source: "missing", reason: "missing_trainer_id" };
  const trainer = (trainerRows || []).find((t) => String(t.auth_user_id || t.id || "") === trainerKey || String(t.id || "") === trainerKey);
  if (!trainer) return { target: null, source: "missing", reason: "trainer_not_found" };

  const patterns = [String(trainer.id || ""), String(trainer.auth_user_id || "")].filter(Boolean);
  const metaMatch = (telegramMetaRows || []).find((m) => {
    const note = String(m.internal_note || "");
    return patterns.some((k) => note.includes(k));
  });
  if (metaMatch?.chat_id) return { target: String(metaMatch.chat_id), source: "telegram_chat_meta", reason: null };

  const fallbackRaw = String(trainer.telegram || "").trim();
  if (!fallbackRaw) return { target: null, source: "missing", reason: "telegram_chat_id_not_resolved" };
  return { target: fallbackRaw, source: "trainers.telegram", reason: null };
};

const handleDispatchScheduleRules = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const secret = process.env.CRON_SECRET || "";
  const auth = String(req.headers?.authorization || "");
  if (!secret || auth !== `Bearer ${secret}`) return res.status(401).json({ error: "Unauthorized" });

  const dryRun = isDryRunFlag(req.query?.dryRun ?? req.body?.dryRun);
  const now = new Date();
  const supabase = buildSupabase();
  const [rulesRaw, trainersRaw, tgMetaRaw] = await Promise.all([
    supabase.from("notification_schedule_rules").select("*").eq("enabled", true),
    supabase.from("trainers").select("id,auth_user_id,telegram"),
    supabase.from("telegram_chat_meta").select("chat_id,internal_note"),
  ]);
  const firstErr = [rulesRaw, trainersRaw, tgMetaRaw].find((r) => r.error);
  if (firstErr?.error) return res.status(500).json({ error: "Failed to load dispatch data", details: String(firstErr.error.message || firstErr.error) });

  const results = [];
  for (const rule of (rulesRaw.data || [])) {
    const channel = String(rule.channel || "push").toLowerCase();
    const localDate = getLocalDateParts(String(rule.timezone || "Europe/Kyiv"), now);
    const runKey = `schedule_rule:${rule.id}:${localDate}:${rule.send_time_local}:${channel}`;

    const tg = resolveTelegramTarget(rule, trainersRaw.data || [], tgMetaRaw.data || []);

    if (dryRun) {
      results.push({
        ruleId: rule.id,
        status: "dry-run",
        channel,
        runKey,
        telegramTargetSource: tg.source,
        telegramTarget: tg.target,
        telegramReason: tg.reason || null,
      });
      continue;
    }

    let pushResult = null;
    let telegramResult = null;
    let status = "sent";
    let reason = null;

    if (channel === "push" || channel === "both") {
      if (!rule.trainer_id) {
        pushResult = { sent: 0, reason: "missing_trainer_id" };
      } else {
        pushResult = await sendPushToUser({
          supabase,
          targetUserId: String(rule.trainer_id),
          payload: { title: "Нагадування тренеру", body: String(rule.message_template || "Нагадування"), data: { ruleId: String(rule.id) } },
        });
      }
    }

    if (channel === "telegram" || channel === "both") {
      if (!tg.target) {
        telegramResult = { status: "skipped", reason: tg.reason || "missing_telegram_target" };
        if (channel === "telegram") {
          status = "skipped";
          reason = "missing_telegram_target";
        }
      } else {
        const isNumeric = /^-?\d+$/.test(String(tg.target));
        if (tg.source === "trainers.telegram" && !isNumeric && !String(tg.target).startsWith("@")) {
          telegramResult = { status: "skipped", reason: "telegram_username_not_resolved", target: tg.target };
          if (channel === "telegram") {
            status = "skipped";
            reason = "missing_telegram_target";
          }
        } else {
          try {
            await withTelegramClient(async (client) => {
              const entity = await resolveTelegramPeer(client, { chatId: tg.target, context: "dispatch-schedule-rules" });
              await client.sendMessage(entity, { message: String(rule.message_template || "Нагадування") });
            });
            telegramResult = { status: "sent", target: tg.target };
          } catch (e) {
            telegramResult = { status: "failed", reason: String(e?.message || e), target: tg.target };
            if (channel === "telegram") {
              status = "failed";
              reason = "telegram_send_failed";
            } else {
              status = Number(pushResult?.sent || 0) > 0 ? "sent" : "failed";
              reason = Number(pushResult?.sent || 0) > 0 ? "telegram_failed_push_sent" : "telegram_and_push_failed";
            }
          }
        }
      }
    }

    results.push({
      ruleId: rule.id,
      status,
      reason,
      channel,
      runKey,
      pushResult,
      telegramResult,
      telegramTargetSource: tg.source,
      telegramTarget: tg.target,
    });
  }

  return res.status(200).json({ ok: true, dryRun, checked: results.length, results });
};

const handleScheduleRules = async (req, res) => {
  const supabase = buildSupabase();

  if (req.method === "GET") {
    const sortField = String(req.query.sort || "").trim();
    const sortOrder = String(req.query.order || "asc").toLowerCase() === "desc" ? false : true;
    const allowedSorts = new Set(["enabled", "group_id", "send_time_local"]);

    let query = supabase.from("notification_schedule_rules").select("*");
    if (allowedSorts.has(sortField)) query = query.order(sortField, { ascending: sortOrder });
    else query = query.order("created_at", { ascending: false });

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: "Failed to load schedule rules", details: String(error.message || error) });
    const rows = data || [];
    const groupIds = Array.from(new Set(rows.map((r) => String(r?.group_id || "")).filter(Boolean)));
    const trainerIds = Array.from(new Set(rows.map((r) => String(r?.trainer_id || "")).filter(Boolean)));
    let groupsById = {};
    let trainersById = {};
    if (groupIds.length) {
      const { data: groupsRows } = await supabase.from("groups").select("id,name").in("id", groupIds);
      groupsById = Object.fromEntries((groupsRows || []).map((g) => [String(g.id), g]));
    }
    if (trainerIds.length) {
      const { data: trainerRows, error: trainerLookupError } = await supabase
        .from("trainers")
        .select("id,auth_user_id,first_name,last_name,name,telegram,instagram_handle");
      if (trainerLookupError) {
        console.error("[schedule-rules] trainer enrichment lookup failed", String(trainerLookupError?.message || trainerLookupError));
      } else {
        const rowsSafe = trainerRows || [];
        const byId = Object.fromEntries(rowsSafe.map((t) => [String(t.id), t]));
        const byAuthUserId = Object.fromEntries(
          rowsSafe
            .filter((t) => t?.auth_user_id)
            .map((t) => [String(t.auth_user_id), t])
        );
        trainersById = { byId, byAuthUserId };
      }
    }
    const enriched = rows.map((r) => {
      const group = groupsById[String(r.group_id)] || null;
      const trainerKey = String(r.trainer_id || "");
      const trainer = trainersById?.byAuthUserId?.[trainerKey] || trainersById?.byId?.[trainerKey] || null;
      const trainerName = trainer
        ? ([trainer.first_name || trainer.firstName || "", trainer.last_name || trainer.lastName || ""].filter(Boolean).join(" ").trim() || trainer.name || null)
        : null;
      const trainerContact = trainer?.telegram || trainer?.instagram_handle || null;
      return {
        ...r,
        group_name: r.group_name || group?.name || null,
        trainer_name: r.trainer_name || trainerName,
        trainer_email: r.trainer_email || trainerContact,
        trainer_display: r.trainer_display || trainerName || trainerContact || null,
      };
    });
    return res.status(200).json({ success: true, rows: enriched });
  }

  if (req.method === "POST") {
    const body = req.body || {};
    const action = String(body.action || "").trim();
    const ruleId = body.id ? String(body.id).trim() : "";

    if (action === "delete") {
      if (!ruleId) return res.status(400).json({ error: "id is required for delete" });
      const { error } = await supabase.from("notification_schedule_rules").delete().eq("id", ruleId);
      if (error) return res.status(500).json({ error: "Failed to delete schedule rule", details: String(error.message || error) });
      return res.status(200).json({ success: true, mode: "deleted", id: ruleId });
    }

    if (ruleId) {
      const { errors, payload } = normalizeScheduleRuleInput(body, { requireCoreFields: false });
      if (errors.length) return res.status(400).json({ error: "Invalid schedule rule payload", details: errors });
      if (!Object.keys(payload).length) return res.status(400).json({ error: "No updatable fields provided" });
      payload.updated_at = new Date().toISOString();
      const { data, error } = await supabase
        .from("notification_schedule_rules")
        .update(payload)
        .eq("id", ruleId)
        .select("*")
        .single();
      if (error) return res.status(500).json({ error: "Failed to update schedule rule", details: String(error.message || error) });
      return res.status(200).json({ success: true, row: data });
    }

    const { errors, payload } = normalizeScheduleRuleInput(body, { requireCoreFields: true });
    if (errors.length) return res.status(400).json({ error: "Invalid schedule rule payload", details: errors });

    const { data, error } = await supabase.from("notification_schedule_rules").insert(payload).select("*").single();
    if (error) return res.status(500).json({ error: "Failed to create schedule rule", details: String(error.message || error) });
    return res.status(200).json({ success: true, row: data });
  }

  if (req.method === "PATCH") {
    const body = req.body || {};
    const ruleId = body.id ? String(body.id).trim() : "";
    if (!ruleId) return res.status(400).json({ error: "id is required for patch" });
    const { errors, payload } = normalizeScheduleRuleInput(body, { requireCoreFields: false });
    if (errors.length) return res.status(400).json({ error: "Invalid schedule rule payload", details: errors });
    if (!Object.keys(payload).length) return res.status(400).json({ error: "No updatable fields provided" });
    payload.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("notification_schedule_rules")
      .update(payload)
      .eq("id", ruleId)
      .select("*")
      .single();
    if (error) return res.status(500).json({ error: "Failed to update schedule rule", details: String(error.message || error) });
    return res.status(200).json({ success: true, row: data });
  }

  if (req.method === "DELETE") {
    const ruleId = String(req.query?.id || req.body?.id || "").trim();
    if (!ruleId) return res.status(400).json({ error: "id is required for delete" });
    const { error } = await supabase.from("notification_schedule_rules").delete().eq("id", ruleId);
    if (error) return res.status(500).json({ error: "Failed to delete schedule rule", details: String(error.message || error) });
    return res.status(200).json({ success: true, mode: "deleted", id: ruleId });
  }

  return res.status(405).json({ error: "Method not allowed" });
};

export default async function handler(req, res) {
  const op = getOp(req);
  try {
    if (req.method === "GET" && op === "readiness") return await handleReadiness(res);
    if ((req.method === "GET" || req.method === "POST") && op === "state") return await handleState(req, res);
    if ((req.method === "GET" || req.method === "POST") && op === "history") return await handleHistory(req, res);
    if (["GET", "POST", "PATCH", "DELETE"].includes(req.method) && op === "schedule-rules") return await handleScheduleRules(req, res);
    if (req.method === "POST" && op === "dispatch-schedule-rules") return await handleDispatchScheduleRules(req, res);
    return res.status(400).json({ error: "Unknown trainer notifications op", allowedOps: ["readiness", "state", "history", "schedule-rules", "dispatch-schedule-rules"] });
  } catch (error) {
    return res.status(500).json({
      error: "Trainer notifications operation failed",
      details: String(error?.message || error),
      op,
    });
  }
}
