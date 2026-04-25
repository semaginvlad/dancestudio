import { createClient } from "@supabase/supabase-js";
import { sendTrainerDigestWithAdminLog, reportTrainerDigestFailureToAdmin } from "./_lib/trainer-digest-send.js";
import {
  buildGroupDispatchPlan,
  buildTrainerGroupDraft,
  isDispatchDueNow,
  parseTrainerGroupIds,
  parseTrainerGroups,
} from "../src/shared/trainerDigest.js";
import { ADMIN_LOG_CHAT_ID } from "./_lib/trainer-digest-send.js";

const buildSupabase = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase server environment variables");
  return createClient(supabaseUrl, serviceRoleKey);
};

const mapSub = (s) => ({
  ...s,
  studentId: s.student_id,
  groupId: s.group_id,
  planType: s.plan_type,
  startDate: s.start_date,
  endDate: s.end_date,
  usedTrainings: s.used_trainings,
  totalTrainings: s.total_trainings,
  activationDate: s.activation_date,
});

const mapStudentGroup = (row) => ({
  studentId: row.student_id,
  groupId: row.group_id,
});

const mapAttendance = (a) => ({
  studentId: a.student_id,
  groupId: a.group_id,
  entryType: a.entry_type,
  guestType: a.guest_type,
});

const mapGroup = (g) => ({
  ...g,
  directionId: g.direction_id,
  trainerPct: g.trainer_pct,
});

export default async function handler(req, res) {
  const method = String(req.method || "GET").toUpperCase();
  res.setHeader("Allow", "GET, POST, OPTIONS");

  if (method === "OPTIONS") {
    return res.status(200).json({ success: true, methods: ["GET", "POST"] });
  }

  if (method !== "POST" && method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const now = new Date();
  const input = method === "GET" ? (req.query || {}) : (req.body || {});
  const toleranceMinutes = Math.max(1, Math.min(30, Number(input?.toleranceMinutes || 10)));
  const dryRun = String(input?.dryRun || "").toLowerCase() === "true" || input?.dryRun === true || input?.dryRun === 1 || input?.dryRun === "1";
  const forcedChatId = input?.chatId ? String(input.chatId) : null;
  const supabase = buildSupabase();

  const [metaRowsRaw, groupsRaw, studentsRaw, studentGroupsRaw, subsRaw, attnRaw, cancelledRaw, stateRaw, historyRaw] = await Promise.all([
    supabase.from("telegram_chat_meta").select("*"),
    supabase.from("groups").select("*"),
    supabase.from("students").select("*"),
    supabase.from("student_groups").select("*"),
    supabase.from("subscriptions").select("*"),
    supabase.from("attendance").select("*"),
    supabase.from("cancelled_trainings").select("*"),
    supabase.from("trainer_notification_state").select("*"),
    supabase.from("trainer_dispatch_history").select("*").eq("trigger_type", "auto").eq("status", "sent"),
  ]);

  const rowsWithErrors = [metaRowsRaw, groupsRaw, studentsRaw, studentGroupsRaw, subsRaw, attnRaw, cancelledRaw, stateRaw, historyRaw];
  const errorRow = rowsWithErrors.find((r) => r.error);
  if (errorRow?.error) {
    return res.status(500).json({ error: "Failed to load dispatch data", details: String(errorRow.error.message || errorRow.error) });
  }

  const metaRows = (metaRowsRaw.data || []).filter((m) => !forcedChatId || String(m.chat_id) === forcedChatId);
  const groups = (groupsRaw.data || []).map(mapGroup);
  const students = (studentsRaw.data || []).map((s) => ({
    ...s,
    firstName: s.first_name,
    lastName: s.last_name,
    messageTemplate: s.message_template,
  }));
  const studentGroups = (studentGroupsRaw.data || []).map(mapStudentGroup);
  const subs = (subsRaw.data || []).map(mapSub);
  const attn = (attnRaw.data || []).map(mapAttendance);
  const cancelled = (cancelledRaw.data || []).map((c) => ({ groupId: c.group_id, date: c.date }));
  const stateByChatGroup = (stateRaw.data || []).reduce((acc, row) => {
    const key = `${row.chat_id}:${row.group_id}`;
    acc[key] = row;
    return acc;
  }, {});
  const sentDedupSet = new Set((historyRaw.data || []).map((h) => String(h.dedup_key || "")));

  const membershipByStudent = studentGroups.reduce((acc, row) => {
    if (!row.studentId || !row.groupId) return acc;
    if (!acc[row.studentId]) acc[row.studentId] = [];
    acc[row.studentId].push(row.groupId);
    return acc;
  }, {});
  const subsByStudent = subs.reduce((acc, s) => {
    if (!s.studentId) return acc;
    if (!acc[s.studentId]) acc[s.studentId] = [];
    acc[s.studentId].push(s);
    return acc;
  }, {});

  const results = [];
  for (const meta of metaRows) {
    const chatId = String(meta.chat_id || "");
    if (!chatId) {
      results.push({ chatId: "", status: "skipped", reason: "no_valid_trainer_chat" });
      continue;
    }
    const note = String(meta.internal_note || "");
    const trainerGroupIds = parseTrainerGroupIds(note);
    const trainerGroups = parseTrainerGroups(note);
    if (!trainerGroups.length && !trainerGroupIds.length) continue;
    const chatGroups = trainerGroupIds.length
      ? groups.filter((g) => trainerGroupIds.includes(String(g.id)))
      : groups.filter((g) => trainerGroups.map((x) => x.toLowerCase()).includes(String(g.name || "").toLowerCase()));

    for (const group of chatGroups) {
      const groupId = String(group.id);
      const state = stateByChatGroup[`${chatId}:${groupId}`] || {};
      if (state.auto_send_enabled === false) {
        const row = { chatId, groupId, groupName: group.name, status: "skipped", reason: "group_disabled", triggerType: "auto", timestamp: new Date().toISOString() };
        results.push(row);
        await supabase.from("trainer_dispatch_history").insert({
          id: row.id || `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          chat_id: chatId, group_id: groupId, group_name: group.name, trigger_type: "auto", status: "skipped", reason: row.reason, created_at: row.timestamp,
        });
        continue;
      }
      const plan = buildGroupDispatchPlan({ group, cancelled, now, sendTimeOverride: state.send_time_override || null });
      if (!plan) {
        const row = { chatId, groupId, groupName: group.name, status: "skipped", reason: "cancelled_training_or_no_schedule", triggerType: "auto", timestamp: new Date().toISOString() };
        results.push(row);
        await supabase.from("trainer_dispatch_history").insert({
          id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          chat_id: chatId, group_id: groupId, group_name: group.name, trigger_type: "auto", status: "skipped", reason: row.reason, created_at: row.timestamp,
        });
        continue;
      }
      if (!isDispatchDueNow(plan, now, toleranceMinutes)) {
        results.push({ chatId, groupId, groupName: group.name, status: "skipped", reason: "not_due_yet", sendAt: plan.sendAtIso, triggerType: "auto", timestamp: new Date().toISOString() });
        continue;
      }
      const dedupKey = `${chatId}::${groupId}::${plan.trainingDate}T${plan.trainingTime}`;
      if (sentDedupSet.has(dedupKey)) {
        const row = { chatId, groupId, groupName: group.name, status: "skipped", reason: "duplicate_prevented", triggerType: "auto", timestamp: new Date().toISOString() };
        results.push(row);
        await supabase.from("trainer_dispatch_history").insert({
          id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          chat_id: chatId, group_id: groupId, group_name: group.name, trigger_type: "auto", status: "skipped", reason: row.reason, dedup_key: dedupKey, created_at: row.timestamp,
        });
        continue;
      }

      const generated = buildTrainerGroupDraft({
        group,
        students,
        membershipByStudent,
        subsByStudent,
        attn,
        targetTrainingDate: plan.trainingDate,
      });
      const message = String(state.custom_template || "").trim() || generated.text;
      if (!generated.studentsCount) {
        const row = { chatId, groupId, groupName: group.name, status: "skipped", reason: "no_students_to_remind", triggerType: "auto", timestamp: new Date().toISOString(), trainingDate: plan.trainingDate, trainingTime: plan.trainingTime };
        results.push(row);
        await supabase.from("trainer_dispatch_history").insert({
          id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          chat_id: chatId, group_id: groupId, group_name: group.name, trigger_type: "auto", status: "skipped", reason: row.reason, created_at: row.timestamp,
        });
        continue;
      }
      if (!message) {
        const row = { chatId, groupId, groupName: group.name, status: "skipped", reason: "no_message_text_or_template_unavailable", triggerType: "auto", timestamp: new Date().toISOString(), trainingDate: plan.trainingDate, trainingTime: plan.trainingTime };
        results.push(row);
        await supabase.from("trainer_dispatch_history").insert({
          id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          chat_id: chatId, group_id: groupId, group_name: group.name, trigger_type: "auto", status: "skipped", reason: row.reason, created_at: row.timestamp,
        });
        continue;
      }

      if (dryRun) {
        results.push({
          chatId,
          groupId,
          groupName: group.name,
          status: "dry-run",
          reason: "due",
          sendAt: plan.sendAtIso,
          trainingDate: plan.trainingDate,
          studentsCount: generated.studentsCount || 0,
        });
        continue;
      }

      try {
        const sent = await sendTrainerDigestWithAdminLog({
          peer: chatId,
          message,
          chatTitle: meta.chat_title || chatId,
          groupNames: [group.name],
          studentsCount: generated.studentsCount || 0,
          triggerType: "auto",
        });
        sentDedupSet.add(dedupKey);
        const row = {
          chatId,
          groupId,
          groupName: group.name,
          status: "sent",
          sendAt: plan.sendAtIso,
          trainingDate: plan.trainingDate,
          trainingTime: plan.trainingTime,
          triggerType: "auto",
          timestamp: new Date().toISOString(),
          adminLogStatus: sent.adminLogStatus,
          adminLogReason: ADMIN_LOG_CHAT_ID ? sent.adminLogStatus : "missing_admin_log_env",
          studentsCount: generated.studentsCount || 0,
        };
        results.push(row);
        await supabase.from("trainer_dispatch_history").insert({
          id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          chat_id: chatId, chat_title: meta.chat_title || null, group_id: groupId, group_name: group.name, trigger_type: "auto", status: "sent", dedup_key: dedupKey, students_count: row.studentsCount, details: row.adminLogStatus, reason: row.adminLogReason, created_at: row.timestamp,
        });
      } catch (error) {
        await reportTrainerDigestFailureToAdmin({
          peer: chatId,
          chatTitle: meta.chat_title || chatId,
          groupNames: [group.name],
          studentsCount: generated.studentsCount || 0,
          triggerType: "auto",
        });
        const row = {
          chatId,
          groupId,
          groupName: group.name,
          status: "failed",
          triggerType: "auto",
          timestamp: new Date().toISOString(),
          error: String(error?.message || error),
        };
        results.push(row);
        await supabase.from("trainer_dispatch_history").insert({
          id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          chat_id: chatId, group_id: groupId, group_name: group.name, trigger_type: "auto", status: "failed", details: row.error, created_at: row.timestamp,
        });
      }
    }
  }

  return res.status(200).json({
    success: true,
    requestMethod: method,
    dryRun,
    now: now.toISOString(),
    toleranceMinutes,
    summary: {
      sent: results.filter((r) => r.status === "sent").length,
      dryRun: results.filter((r) => r.status === "dry-run").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      failed: results.filter((r) => r.status === "failed").length,
    },
    results,
  });
}
