import { createClient } from "@supabase/supabase-js";
import { getPeerTitle, normalizePeerId, resolveTelegramPeer, withTelegramClient } from "./_lib/telegram-user-client.js";
import { ADMIN_LOG_CHAT_ID, reportTrainerDigestFailureToAdmin, sendTrainerDigestWithAdminLog } from "./_lib/trainer-digest-send.js";

const buildSupabase = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase server environment variables");
  return createClient(supabaseUrl, serviceRoleKey);
};

const getOp = (req) => String(req.query?.op || req.body?.op || "").trim();

const handleListDialogs = async (res) => {
  const dialogs = await withTelegramClient(async (client) => {
    const rows = await client.getDialogs({ limit: 100 });
    return rows
      .map((d) => {
        const entity = d?.entity;
        const id = normalizePeerId(entity);
        if (!id) return null;

        return {
          id,
          title: getPeerTitle(entity),
          username: entity?.username ? `@${entity.username}` : null,
          unreadCount: Number(d?.unreadCount || 0),
          lastMessageDate: d?.message?.date ? new Date(d.message.date * 1000).toISOString() : null,
          lastMessageText: d?.message?.message || "",
        };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.lastMessageDate || 0).getTime() - new Date(a.lastMessageDate || 0).getTime());
  });

  return res.status(200).json({ success: true, dialogs, count: dialogs.length });
};

const handleChatMessages = async (req, res) => {
  const chatId = req.query.chatId || req.query.peerId;
  const limit = Math.min(Number(req.query.limit || 30), 100);
  if (!chatId) return res.status(400).json({ error: "chatId is required" });

  const messages = await withTelegramClient(async (client) => {
    const entity = await resolveTelegramPeer(client, { chatId, context: "telegram-chat-messages" });
    const rows = await client.getMessages(entity, { limit });
    return (rows || []).map((m) => ({
      id: String(m.id),
      text: m.message || "",
      date: m.date ? new Date(m.date * 1000).toISOString() : null,
      out: Boolean(m.out),
    }));
  });
  return res.status(200).json({ success: true, messages });
};

const handleChatMeta = async (req, res) => {
  const supabase = buildSupabase();
  if (req.method === "GET") {
    const chatId = req.query.chatId;
    if (!chatId) return res.status(400).json({ error: "chatId is required" });

    const { data, error } = await supabase
      .from("telegram_chat_meta")
      .select("*")
      .eq("chat_id", String(chatId))
      .maybeSingle();

    if (error) return res.status(500).json({ error: "Failed to load chat meta", details: String(error.message || error) });
    return res.status(200).json({ success: true, meta: data || null });
  }

  if (req.method === "POST") {
    const { chatId } = req.body || {};
    if (!chatId) return res.status(400).json({ error: "chatId is required" });

    const payload = {
      chat_id: String(chatId),
      updated_at: new Date().toISOString(),
    };
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "studentId")) payload.student_id = req.body.studentId || null;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "internalNote")) payload.internal_note = req.body.internalNote || null;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "customTemplate")) payload.custom_template = req.body.customTemplate || null;

    const { data, error } = await supabase
      .from("telegram_chat_meta")
      .upsert(payload, { onConflict: "chat_id" })
      .select("*")
      .single();
    if (error) return res.status(500).json({ error: "Failed to save chat meta", details: String(error.message || error) });
    return res.status(200).json({ success: true, meta: data });
  }

  return res.status(405).json({ error: "Method not allowed" });
};

const handleSendTest = async (req, res) => {
  const { chatId, username, message } = req.body || {};
  const peer = chatId || username;
  if (!peer || !message) return res.status(400).json({ error: "chatId|username and message are required" });
  await withTelegramClient(async (client) => {
    const entity = await resolveTelegramPeer(client, { chatId, username, context: "send-test-telegram" });
    await client.sendMessage(entity, { message });
  });
  return res.status(200).json({ success: true });
};

const handleSendTrainerDigest = async (req, res) => {
  const {
    chatId,
    username,
    message,
    chatTitle = "",
    groupNames = [],
    studentsCount = 0,
    triggerType = "manual",
    sendToAdminOnly = false,
  } = req.body || {};
  const peer = chatId || username;
  if (!peer || !message) return res.status(400).json({ error: "chatId|username and message are required" });

  try {
    const { adminLogStatus, sentAtIso } = await sendTrainerDigestWithAdminLog({
      peer,
      username,
      message,
      chatTitle,
      groupNames,
      studentsCount,
      triggerType,
      sendToAdminOnly: !!sendToAdminOnly,
    });

    return res.status(200).json({
      success: true,
      status: "sent",
      adminLogStatus,
      adminLogReason: ADMIN_LOG_CHAT_ID ? adminLogStatus : "missing_admin_log_env",
      sentAt: sentAtIso,
    });
  } catch (error) {
    console.error("send-trainer-digest error:", error);
    const sentAtIso = new Date().toISOString();
    await reportTrainerDigestFailureToAdmin({
      peer,
      chatTitle,
      groupNames,
      studentsCount,
      triggerType,
    });

    return res.status(500).json({
      error: "Failed to send trainer digest",
      details: String(error?.message || error),
      status: "failed",
      sentAt: sentAtIso,
    });
  }
};

export default async function handler(req, res) {
  const op = getOp(req);

  try {
    if (req.method === "GET" && (op === "listDialogs" || op === "list-dialogs")) return await handleListDialogs(res);
    if (req.method === "GET" && (op === "chatMessages" || op === "chat-messages")) return await handleChatMessages(req, res);
    if ((req.method === "GET" || req.method === "POST") && (op === "chatMeta" || op === "chat-meta")) return await handleChatMeta(req, res);
    if (req.method === "POST" && (op === "sendTest" || op === "send-test")) return await handleSendTest(req, res);
    if (req.method === "POST" && (op === "sendTrainerDigest" || op === "send-trainer-digest")) return await handleSendTrainerDigest(req, res);
    return res.status(400).json({ error: "Unknown telegram op", allowedOps: ["listDialogs", "chatMessages", "chatMeta", "sendTest", "sendTrainerDigest"] });
  } catch (error) {
    console.error("telegram consolidated handler error:", error);
    return res.status(500).json({
      error: "Telegram operation failed",
      details: String(error?.message || error),
      op,
    });
  }
}
