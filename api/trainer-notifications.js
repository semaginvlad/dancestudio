import { createClient } from "@supabase/supabase-js";
import { ADMIN_LOG_CHAT_ID } from "../server/trainer-digest-send.js";
import { sendTrainerDigestWithAdminLog } from "../server/trainer-digest-send.js";
import { sendPushToUser } from "../server/push-send.js";
import { parseTrainerGroupIds, parseTrainerGroups } from "../src/shared/trainerDigest.js";
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
const DAYS_JS_TO_RULE = { 0: 7, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 };

const readBearerToken = (req) => {
  const auth = String(req.headers?.authorization || "").trim();
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
};

const parseDryRun = (req) => (
  String(req.query?.dryRun || "").toLowerCase() === "true"
  || req.body?.dryRun === true
  || req.body?.dryRun === 1
  || req.body?.dryRun === "1"
);

const toLocalTimeParts = (date, timeZone = "Europe/Kyiv") => {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timeZone || "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = formatter.formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`;
  const minuteKey = `${parts.hour}:${parts.minute}`;
  const dayJs = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
  const weekdayRule = DAYS_JS_TO_RULE[dayJs] || 7;
  return { dateKey, minuteKey, weekdayRule };
};

const pickChatIdForRule = ({ telegramMetaRows = [], rule, group }) => {
  const groupId = String(rule?.group_id || "").trim();
  const groupNameLc = String(group?.name || "").trim().toLowerCase();
  if (!groupId) return null;
  for (const meta of telegramMetaRows) {
    const note = String(meta?.internal_note || "");
    const parsedGroupIds = parseTrainerGroupIds(note);
    const parsedGroupNames = parseTrainerGroups(note).map((x) => String(x || "").trim().toLowerCase());
    const idMatch = parsedGroupIds.includes(groupId);
    const nameMatch = groupNameLc && parsedGroupNames.includes(groupNameLc);
    if (idMatch || nameMatch) {
      const chatId = String(meta?.chat_id || "").trim();
      if (chatId) return chatId;
    }
  }
  return null;
};

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

const handleDispatchScheduleRules = async (req, res) => {
  const cronSecret = process.env.CRON_SECRET || "";
  const token = readBearerToken(req);
  if (!cronSecret || token !== cronSecret) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const supabase = buildSupabase();
  const dryRun = parseDryRun(req);
  const now = new Date();
  const toleranceMinutes = Math.max(1, Math.min(30, Number(req.query?.toleranceMinutes || req.body?.toleranceMinutes || 10)));

  const { data: rules, error: rulesError } = await supabase
    .from("notification_schedule_rules")
    .select("*")
    .eq("enabled", true);
  if (rulesError) return res.status(500).json({ ok: false, error: "Failed to load schedule rules", details: String(rulesError?.message || rulesError) });

  const groupIds = Array.from(new Set((rules || []).map((r) => String(r?.group_id || "")).filter(Boolean)));
  const trainerIds = Array.from(new Set((rules || []).map((r) => String(r?.trainer_id || "")).filter(Boolean)));
  const [groupsRaw, trainersRaw, trialRaw, studentGroupsRaw, studentsRaw, subsRaw, attendanceRaw, telegramMetaRaw] = await Promise.all([
    groupIds.length ? supabase.from("groups").select("id,name").in("id", groupIds) : Promise.resolve({ data: [] }),
    trainerIds.length ? supabase.from("trainers").select("id,auth_user_id,name,first_name,last_name,telegram,instagram_handle").or(`auth_user_id.in.(${trainerIds.join(",")}),id.in.(${trainerIds.join(",")})`) : Promise.resolve({ data: [] }),
    groupIds.length ? supabase.from("trial_bookings").select("id,name,notes,trial_date,trial_time,status,group_id").in("group_id", groupIds).eq("status", "confirmed") : Promise.resolve({ data: [] }),
    groupIds.length ? supabase.from("student_groups").select("student_id,group_id").in("group_id", groupIds) : Promise.resolve({ data: [] }),
    supabase.from("students").select("id,name,first_name,last_name"),
    groupIds.length ? supabase.from("subscriptions").select("student_id,group_id,end_date,plan_type,start_date,total_trainings,used_trainings").in("group_id", groupIds) : Promise.resolve({ data: [] }),
    groupIds.length ? supabase.from("attendance").select("id,group_id,date").in("group_id", groupIds) : Promise.resolve({ data: [] }),
    supabase.from("telegram_chat_meta").select("chat_id,internal_note"),
  ]);

  const possibleErrors = [groupsRaw, trainersRaw, trialRaw, studentGroupsRaw, studentsRaw, subsRaw, attendanceRaw, telegramMetaRaw].find((x) => x?.error);
  if (possibleErrors?.error) return res.status(500).json({ ok: false, error: "Failed to load dispatcher datasets", details: String(possibleErrors.error?.message || possibleErrors.error) });

  const groupsById = Object.fromEntries((groupsRaw.data || []).map((g) => [String(g.id), g]));
  const telegramMetaRows = telegramMetaRaw.data || [];
  const trainersByAuth = Object.fromEntries((trainersRaw.data || []).filter((t) => t?.auth_user_id).map((t) => [String(t.auth_user_id), t]));
  const trainersById = Object.fromEntries((trainersRaw.data || []).map((t) => [String(t.id), t]));
  const studentsById = Object.fromEntries((studentsRaw.data || []).map((s) => [String(s.id), s]));
  const trialByGroup = (trialRaw.data || []).reduce((acc, row) => {
    const key = String(row.group_id || "");
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
  const membershipsByGroup = (studentGroupsRaw.data || []).reduce((acc, row) => {
    const key = String(row.group_id || "");
    if (!acc[key]) acc[key] = [];
    acc[key].push(String(row.student_id || ""));
    return acc;
  }, {});
  const subsByGroup = (subsRaw.data || []).reduce((acc, row) => {
    const key = String(row.group_id || "");
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
  const attendanceByGroupDate = new Set((attendanceRaw.data || []).map((a) => `${String(a.group_id || "")}:${String(a.date || "")}`));

  const results = [];
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const rule of rules || []) {
    const timezone = String(rule.timezone || "Europe/Kyiv") || "Europe/Kyiv";
    const { dateKey, minuteKey, weekdayRule } = toLocalTimeParts(now, timezone);
    const allowedDays = Array.isArray(rule.days_of_week) ? rule.days_of_week.map(Number) : [];
    const sendTime = String(rule.send_time_local || "");
    const [ruleHour, ruleMinute] = sendTime.split(":").map((n) => Number(n));
    const [nowHour, nowMinute] = minuteKey.split(":").map((n) => Number(n));
    const delta = Math.abs(((nowHour * 60) + nowMinute) - ((ruleHour * 60) + ruleMinute));

    if (!allowedDays.includes(weekdayRule) || delta > toleranceMinutes) {
      skipped += 1;
      results.push({ ruleId: rule.id, status: "skipped", reason: "not_due", localDate: dateKey, localTime: minuteKey, sendTimeLocal: sendTime, weekdayRule });
      continue;
    }

    const runKey = `schedule_rule:${rule.id}:${dateKey}:${sendTime}:${rule.channel}`;
    const { data: existingRun } = await supabase.from("notification_rule_runs").select("id,status").eq("run_key", runKey).maybeSingle();
    if (existingRun?.id) {
      skipped += 1;
      results.push({ ruleId: rule.id, status: "skipped", reason: "duplicate", runKey });
      continue;
    }

    if (!dryRun) {
      const { error: runInsertError } = await supabase.from("notification_rule_runs").insert({
        rule_id: rule.id,
        run_key: runKey,
        scheduled_for: now.toISOString(),
        status: "pending",
        reason: null,
        payload_snapshot: {},
      });
      if (runInsertError) {
        skipped += 1;
        results.push({ ruleId: rule.id, status: "skipped", reason: "run_insert_conflict_or_error", details: String(runInsertError?.message || runInsertError), runKey });
        continue;
      }
    }

    const group = groupsById[String(rule.group_id)] || null;
    const groupName = String(group?.name || rule.group_id || "—");
    const trainer = trainersByAuth[String(rule.trainer_id || "")] || trainersById[String(rule.trainer_id || "")] || null;
    const trainerDisplay = ([trainer?.first_name, trainer?.last_name].filter(Boolean).join(" ").trim() || trainer?.name || null);

    const lines = [`Група ${groupName}`];
    const ruleTrials = (trialByGroup[String(rule.group_id)] || []).filter((t) => String(t.trial_date || "") === dateKey);
    if (rule.include_trial_bookings) {
      if (ruleTrials.length) {
        lines.push("Пробні:");
        for (const t of ruleTrials) {
          const detail = [t.name || "Без імені", t.trial_time || t.trial_date || "", t.notes || ""].filter(Boolean).join(" — ");
          lines.push(`- ${detail}`);
        }
      } else if (dryRun) {
        lines.push("Пробних немає");
      }
    }

    if (rule.include_unpaid_students) {
      const memberIds = membershipsByGroup[String(rule.group_id)] || [];
      const subs = subsByGroup[String(rule.group_id)] || [];
      const noPay = [];
      for (const studentId of memberIds) {
        const studentSubs = subs.filter((s) => String(s.student_id || "") === studentId);
        const hasActivePaidSub = studentSubs.some((s) => {
          const endDate = String(s.end_date || "");
          const totalTrainings = Number(s.total_trainings);
          const usedTrainings = Number(s.used_trainings);
          const hasRemainingTrainings = Number.isFinite(totalTrainings) && Number.isFinite(usedTrainings)
            ? usedTrainings < totalTrainings
            : true;
          const planType = String(s.plan_type || "").toLowerCase();
          const isNonSubscriptionPlan = planType === "trial" || planType === "single";
          return endDate >= dateKey && hasRemainingTrainings && !isNonSubscriptionPlan;
        });
        if (!hasActivePaidSub) {
          const student = studentsById[studentId];
          const studentName = student?.name || [student?.first_name, student?.last_name].filter(Boolean).join(" ").trim() || studentId;
          noPay.push(studentName);
        }
      }
      if (noPay.length) {
        lines.push("Немає оплат у:");
        noPay.forEach((n) => lines.push(`- ${n}`));
      }
    }

    if (rule.include_attendance_reminder) {
      const attendanceKey = `${String(rule.group_id)}:${dateKey}`;
      if (!attendanceByGroupDate.has(attendanceKey)) {
        lines.push(`Нагадування: відміть відвідування по групі ${groupName}`);
      }
    }

    const messageTemplate = String(rule.message_template || "").trim();
    if (messageTemplate) lines.push("", messageTemplate);
    const messageText = lines.join("\n").trim();

    if (dryRun) {
      skipped += 1;
      results.push({ ruleId: rule.id, status: "dry-run", runKey, groupName, trainerDisplay, channel: rule.channel, messageText });
      continue;
    }

    let pushResult = null;
    let tgResult = null;
    let runStatus = "sent";
    let runReason = null;

    try {
      if (rule.channel === "push" || rule.channel === "both") {
        pushResult = await sendPushToUser({
          supabase,
          targetUserId: rule.trainer_id,
          payload: {
            title: `Нагадування • ${groupName}`,
            body: messageText.slice(0, 400),
            url: "/",
          },
        });
        if (!pushResult?.sent) {
          runStatus = "skipped";
          runReason = "push_not_delivered";
        }
      }

      if (rule.channel === "telegram" || rule.channel === "both") {
        const chatId = pickChatIdForRule({ telegramMetaRows, rule, group });
        if (!chatId) {
          if (runStatus !== "failed") runStatus = "skipped";
          runReason = runReason || "telegram_chat_not_found";
        } else {
          tgResult = await sendTrainerDigestWithAdminLog({
            peer: chatId,
            message: messageText,
            chatTitle: trainerDisplay || chatId,
            groupNames: [groupName],
            studentsCount: 0,
            triggerType: "schedule_rule",
          });
          if (!tgResult?.deliveredToTarget) {
            runStatus = "failed";
            runReason = "telegram_send_not_confirmed";
          }
        }
      }
    } catch (error) {
      runStatus = "failed";
      runReason = String(error?.message || error);
    }

    await supabase
      .from("notification_rule_runs")
      .update({
        status: runStatus,
        reason: runReason,
        payload_snapshot: { messageText, pushResult, tgResult, channel: rule.channel, groupName },
        updated_at: new Date().toISOString(),
      })
      .eq("run_key", runKey);

    if (runStatus === "sent") sent += 1;
    else if (runStatus === "failed") failed += 1;
    else skipped += 1;

    results.push({
      ruleId: rule.id,
      runKey,
      status: runStatus,
      reason: runReason,
      channel: rule.channel,
      groupName,
      trainer: trainerDisplay || rule.trainer_id,
      push: pushResult,
      telegram: tgResult ? { deliveredToTarget: !!tgResult.deliveredToTarget, adminLogStatus: tgResult.adminLogStatus } : null,
    });
  }

  return res.status(200).json({
    ok: true,
    dryRun,
    checked: (rules || []).length,
    sent,
    skipped,
    failed,
    results,
  });
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
