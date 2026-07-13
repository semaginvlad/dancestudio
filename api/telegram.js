import { createClient } from "@supabase/supabase-js";
import { Api } from "telegram";
import { getPeerTitle, normalizePeerId, resolveTelegramPeer, withTelegramClient } from "../server/telegram-user-client.js";
import { ADMIN_LOG_CHAT_ID, reportTrainerDigestFailureToAdmin, sendTrainerDigestWithAdminLog } from "../server/trainer-digest-send.js";
import { authError, requireAdminUser } from "./_auth.js";

const buildSupabase = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase server environment variables");
  return createClient(supabaseUrl, serviceRoleKey);
};

const getOp = (req) => String(req.query?.op || req.body?.op || "").trim();

const toTelegramErrorMessage = (error) => {
  const raw = String(error?.errorMessage || error?.message || error || "Telegram request failed");
  const upper = raw.toUpperCase();
  if (upper.includes("FLOOD_WAIT")) return "Telegram flood wait: спробуйте пізніше.";
  if (upper.includes("REACTION_INVALID") || upper.includes("REACTION_EMPTY")) return "Ця реакція недоступна для повідомлення.";
  if (upper.includes("CHAT_FORBIDDEN") || upper.includes("USER_BANNED") || upper.includes("CHAT_WRITE_FORBIDDEN") || upper.includes("USER_IS_BLOCKED")) return "Немає дозволу виконати дію в цьому чаті.";
  if (upper.includes("CHAT_SEND_PLAIN_FORBIDDEN") || upper.includes("USER_PRIVACY_RESTRICTED") || upper.includes("FORBIDDEN")) return "Telegram заборонив надсилання або пересилання в цьому чаті.";
  if (upper.includes("CHAT_FORWARDS_RESTRICTED") || upper.includes("MESSAGE_AUTHOR_REQUIRED")) return "Автор або чат заборонив пересилання цього повідомлення.";
  if (upper.includes("MSG_ID_INVALID") || upper.includes("MESSAGE_ID_INVALID")) return "Некоректний messageId або повідомлення недоступне.";
  if (upper.includes("PEER_ID_INVALID") || upper.includes("CHANNEL_INVALID") || upper.includes("CHAT_ID_INVALID")) return "Некоректний chatId або Telegram peer недоступний.";
  if (upper.includes("AUTH_KEY") || upper.includes("SESSION") || upper.includes("AUTH")) return "Помилка Telegram session. Перевірте підключення Telegram.";
  return raw;
};

const normalizeTelegramReaction = (reaction) => {
  if (!reaction) return null;
  if (reaction.className === "ReactionEmoji" && reaction.emoticon) return reaction.emoticon;
  return null;
};

const normalizeMessageReactions = (message) => {
  const results = message?.reactions?.results || [];
  return results
    .map((item) => {
      const emoji = normalizeTelegramReaction(item?.reaction);
      if (!emoji) return null;
      return {
        emoji,
        count: Number(item?.count || 0),
        chosen: item?.chosenOrder !== undefined && item?.chosenOrder !== null,
      };
    })
    .filter(Boolean);
};

const describeTelegramMessage = (message) => {
  if (!message) return "Повідомлення недоступне";
  const text = String(message.message || "").trim();
  if (text) return text;
  if (message.media) return "Медіа повідомлення";
  if (message.action) return "Сервісне повідомлення";
  return "Повідомлення без тексту";
};

const peerIdToString = (peer) => {
  const raw = peer?.userId ?? peer?.chatId ?? peer?.channelId ?? peer?.id;
  return raw === undefined || raw === null ? null : String(raw);
};

const normalizeForwardedFrom = (fwdFrom) => {
  if (!fwdFrom) return null;
  return {
    title: fwdFrom.fromName || fwdFrom.savedFromName || fwdFrom.postAuthor || null,
    senderId: peerIdToString(fwdFrom.fromId || fwdFrom.savedFromId || fwdFrom.savedFromPeer),
    date: fwdFrom.date ? new Date(fwdFrom.date * 1000).toISOString() : null,
  };
};

const normalizeTelegramMessage = (m, repliesById = new Map()) => {
  const replyMessageId = m?.replyTo?.replyToMsgId ? String(m.replyTo.replyToMsgId) : null;
  const replyMessage = replyMessageId ? repliesById.get(replyMessageId) : null;
  return {
    id: String(m.id),
    text: m.message || "",
    date: m.date ? new Date(m.date * 1000).toISOString() : null,
    out: Boolean(m.out),
    reactions: normalizeMessageReactions(m),
    replyTo: replyMessageId ? {
      messageId: replyMessageId,
      text: replyMessage ? describeTelegramMessage(replyMessage) : "Повідомлення недоступне",
      out: replyMessage ? Boolean(replyMessage.out) : null,
    } : null,
    forwardedFrom: normalizeForwardedFrom(m?.fwdFrom),
  };
};

const parseMessageId = (value) => {
  const messageId = Number(value);
  return Number.isInteger(messageId) && messageId > 0 ? messageId : null;
};

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
    const rowsById = new Map((rows || []).map((m) => [String(m.id), m]));
    const missingReplyIds = Array.from(new Set((rows || [])
      .map((m) => m?.replyTo?.replyToMsgId)
      .filter((id) => id && !rowsById.has(String(id)))
      .map(Number)));
    const repliesById = new Map(rowsById);
    if (missingReplyIds.length) {
      const fetched = await client.getMessages(entity, { ids: missingReplyIds });
      (Array.isArray(fetched) ? fetched : [fetched]).filter(Boolean).forEach((m) => repliesById.set(String(m.id), m));
    }
    return (rows || []).map((message) => normalizeTelegramMessage(message, repliesById));
  });
  return res.status(200).json({ success: true, messages });
};

const handleSetReaction = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { chatId, messageId: rawMessageId } = req.body || {};
  const emoji = String(req.body?.emoji || "").trim();
  const messageId = parseMessageId(rawMessageId);
  if (!chatId) return res.status(400).json({ error: "chatId is required" });
  if (!messageId) return res.status(400).json({ error: "messageId must be a positive integer" });

  try {
    const result = await withTelegramClient(async (client) => {
      const entity = await resolveTelegramPeer(client, { chatId, context: "telegram-set-reaction" });
      const reaction = emoji ? [new Api.ReactionEmoji({ emoticon: emoji })] : [];
      await client.invoke(new Api.messages.SendReaction({
        peer: entity,
        msgId: messageId,
        reaction,
        addToRecent: true,
      }));

      const refreshed = await client.getMessages(entity, { ids: [messageId] });
      const message = Array.isArray(refreshed) ? refreshed[0] : refreshed;
      return {
        messageId: String(messageId),
        reactions: message ? normalizeMessageReactions(message) : [],
      };
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("telegram setReaction error:", String(error?.message || error));
    return res.status(400).json({
      error: "Telegram reaction failed",
      details: toTelegramErrorMessage(error),
    });
  }
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
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "contactType")) payload.contact_type = req.body.contactType || null;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "crmStage")) payload.crm_stage = req.body.crmStage || null;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "shortTag")) payload.short_tag = req.body.shortTag || null;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "contactName")) payload.contact_name = req.body.contactName || null;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "contactPhone")) payload.contact_phone = req.body.contactPhone || null;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "contactTelegram")) payload.contact_telegram = req.body.contactTelegram || null;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "contactInstagram")) payload.contact_instagram = req.body.contactInstagram || null;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "leadStatus")) payload.lead_status = req.body.leadStatus || null;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "leadSource")) payload.lead_source = req.body.leadSource || null;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "preferredDirection")) payload.preferred_direction = req.body.preferredDirection || null;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "preferredGroup")) payload.preferred_group = req.body.preferredGroup || null;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "pipelineStatus")) payload.pipeline_status = req.body.pipelineStatus || null;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "formatPreference")) payload.format_preference = req.body.formatPreference || null;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "waitlistStatus")) payload.waitlist_status = req.body.waitlistStatus || null;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "nextAction")) payload.next_action = req.body.nextAction || null;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "followUpAt")) payload.follow_up_at = req.body.followUpAt || null;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "followUpReason")) payload.follow_up_reason = req.body.followUpReason || null;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, "followUpState")) payload.follow_up_state = req.body.followUpState || null;

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


const handleLinkStudent = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { studentId, chatId } = req.body || {};
  if (!studentId || !chatId) return res.status(400).json({ error: "studentId and chatId are required" });

  const supabase = buildSupabase();
  const { data, error } = await supabase
    .from("telegram_chat_meta")
    .upsert({ chat_id: String(chatId), student_id: studentId, updated_at: new Date().toISOString() }, { onConflict: "chat_id" })
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: "Failed to link telegram to student", details: String(error.message || error) });
  return res.status(200).json({ success: true, meta: data });
};

const handleCalendar = async (_req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  try {
    const { google } = await import("googleapis");
    let privateKey = process.env.GOOGLE_PRIVATE_KEY || "";
    privateKey = privateKey.replace(/\\n/g, "\n").replace(/"/g, "");

    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: process.env.GOOGLE_CLIENT_EMAIL, private_key: privateKey },
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    });
    const calendar = google.calendar({ version: "v3", auth });

    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + daysToMonday);
    monday.setHours(0, 0, 0, 0);

    const twoWeeksLater = new Date(monday);
    twoWeeksLater.setDate(monday.getDate() + 14);
    const calendarId = process.env.CALENDAR_ID || "zhusha3004@gmail.com";

    const response = await calendar.events.list({
      calendarId,
      timeMin: monday.toISOString(),
      timeMax: twoWeeksLater.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
    });

    const events = (response.data.items || [])
      .filter((ev) => ev.start?.dateTime)
      .map((ev) => ({
        id: ev.id,
        title: ev.summary || "Без назви",
        start: ev.start.dateTime,
        end: ev.end.dateTime,
        description: ev.description || "",
      }));

    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=300");
    return res.status(200).json({ events, fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error("Помилка Google Calendar API:", err);
    return res.status(500).json({ error: "Не вдалося отримати події", details: err.message });
  }
};

const handleSendTest = async (req, res) => {
  const { chatId, username } = req.body || {};
  const message = String(req.body?.message ?? req.body?.text ?? "").trim();
  const replyToMsgId = req.body?.replyToMsgId === undefined || req.body?.replyToMsgId === null || req.body?.replyToMsgId === "" ? null : parseMessageId(req.body.replyToMsgId);
  const peer = chatId || username;
  if (!peer || !message) return res.status(400).json({ error: "chatId|username and message are required" });
  if (req.body?.replyToMsgId && !replyToMsgId) return res.status(400).json({ error: "replyToMsgId must be a positive integer" });
  try {
    const sent = await withTelegramClient(async (client) => {
      const entity = await resolveTelegramPeer(client, { chatId, username, context: "send-test-telegram" });
      if (replyToMsgId) {
        const target = await client.getMessages(entity, { ids: [replyToMsgId] });
        const targetMessage = Array.isArray(target) ? target[0] : target;
        if (!targetMessage?.id) throw new Error("MESSAGE_ID_INVALID");
      }
      return await client.sendMessage(entity, { message, replyTo: replyToMsgId || undefined });
    });
    return res.status(200).json({ success: true, message: sent ? normalizeTelegramMessage(sent) : null });
  } catch (error) {
    console.error("telegram send message error:", String(error?.message || error));
    return res.status(400).json({ error: "Telegram send failed", details: toTelegramErrorMessage(error) });
  }
};

const handleForwardMessage = async (req, res) => {
  const { sourceChatId, targetChatId } = req.body || {};
  const messageId = parseMessageId(req.body?.messageId);
  if (!sourceChatId) return res.status(400).json({ error: "sourceChatId is required" });
  if (!targetChatId) return res.status(400).json({ error: "targetChatId is required" });
  if (!messageId) return res.status(400).json({ error: "messageId must be a positive integer" });
  try {
    const result = await withTelegramClient(async (client) => {
      const sourcePeer = await resolveTelegramPeer(client, { chatId: sourceChatId, context: "telegram-forward-source" });
      const targetPeer = await resolveTelegramPeer(client, { chatId: targetChatId, context: "telegram-forward-target" });
      const sourceMessage = await client.getMessages(sourcePeer, { ids: [messageId] });
      const existing = Array.isArray(sourceMessage) ? sourceMessage[0] : sourceMessage;
      if (!existing?.id) throw new Error("MESSAGE_ID_INVALID");
      const forwarded = await client.invoke(new Api.messages.ForwardMessages({
        fromPeer: sourcePeer,
        id: [messageId],
        randomId: [BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000))],
        toPeer: targetPeer,
      }));
      return { updates: forwarded?.className || "Updates" };
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("telegram forwardMessage error:", String(error?.message || error));
    return res.status(400).json({ error: "Telegram forward failed", details: toTelegramErrorMessage(error) });
  }
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
    console.error("send-trainer-digest error:", String(error?.message || error));
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
      status: "failed",
      sentAt: sentAtIso,
    });
  }
};

export default async function handler(req, res) {
  const op = getOp(req);

  try {
    if (req.method === "GET" && op === "calendar") return await handleCalendar(req, res);

    const admin = await requireAdminUser(req);
    if (!admin.ok) return authError(res, admin);

    if (req.method === "POST" && (op === "linkStudent" || op === "link-student")) return await handleLinkStudent(req, res);
    if (req.method === "GET" && (op === "listDialogs" || op === "list-dialogs")) return await handleListDialogs(res);
    if (req.method === "GET" && (op === "chatMessages" || op === "chat-messages")) return await handleChatMessages(req, res);
    if ((req.method === "GET" || req.method === "POST") && (op === "chatMeta" || op === "chat-meta")) return await handleChatMeta(req, res);
    if (req.method === "POST" && (op === "setReaction" || op === "set-reaction")) return await handleSetReaction(req, res);
    if (req.method === "POST" && (op === "sendTest" || op === "send-test" || op === "sendMessage" || op === "send-message")) return await handleSendTest(req, res);
    if (req.method === "POST" && (op === "forwardMessage" || op === "forward-message")) return await handleForwardMessage(req, res);
    if (req.method === "POST" && (op === "sendTrainerDigest" || op === "send-trainer-digest")) return await handleSendTrainerDigest(req, res);
    return res.status(400).json({ error: "Unknown telegram op", allowedOps: ["calendar", "linkStudent", "listDialogs", "chatMessages", "chatMeta", "setReaction", "sendTest", "sendMessage", "forwardMessage", "sendTrainerDigest"] });
  } catch (error) {
    console.error("telegram consolidated handler error:", String(error?.message || error));
    return res.status(500).json({
      error: "Telegram operation failed",
      op,
    });
  }
}
