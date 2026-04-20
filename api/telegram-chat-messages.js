import { withTelegramUserClient } from "./_lib/telegram-user-client.js";

function normalizePeerId(peer) {
  if (!peer) return null;
  return String(peer.userId || peer.channelId || peer.chatId || "");
}

function sendJsonError(res, status, error, details) {
  return res.status(status).json({
    success: false,
    error,
    ...(details ? { details: String(details) } : {}),
  });
}

function normalizeTelegramMessageDate(rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === "") return null;

  if (rawValue instanceof Date) {
    return Number.isNaN(rawValue.getTime()) ? null : rawValue.toISOString();
  }

  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    const normalized = rawValue < 1e12 ? rawValue * 1000 : rawValue;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    if (!trimmed) return null;

    if (/^\d+$/.test(trimmed)) {
      const numeric = Number(trimmed);
      if (Number.isFinite(numeric)) {
        const normalized = numeric < 1e12 ? numeric * 1000 : numeric;
        const date = new Date(normalized);
        if (!Number.isNaN(date.getTime())) return date.toISOString();
      }
    }

    const date = new Date(trimmed);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }

  if (typeof rawValue === "object") {
    const nestedSeconds = rawValue.seconds ?? rawValue.sec ?? rawValue.epoch ?? rawValue.timestamp;
    const nestedMs = rawValue.milliseconds ?? rawValue.ms;
    const nestedIso = rawValue.iso ?? rawValue.isoString ?? rawValue.value;

    if (nestedSeconds !== undefined) {
      const parsed = normalizeTelegramMessageDate(nestedSeconds);
      if (parsed) return parsed;
    }
    if (nestedMs !== undefined) {
      const parsed = normalizeTelegramMessageDate(nestedMs);
      if (parsed) return parsed;
    }
    if (nestedIso !== undefined) {
      const parsed = normalizeTelegramMessageDate(nestedIso);
      if (parsed) return parsed;
    }
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJsonError(res, 405, "Method not allowed");
  }

  try {
    const { chatId } = req.query;
    const parsedLimit = Number(req.query.limit);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(200, Math.max(1, parsedLimit))
      : 60;

    if (!chatId) {
      return sendJsonError(res, 400, "chatId is required");
    }

    const payload = await withTelegramUserClient(async (client) => {
      const entity = await client.getEntity(String(chatId));
      const messages = await client.getMessages(entity, { limit });

      const items = messages
        .map((m) => ({
          id: String(m.id),
          chatId: String(chatId),
          text: m.message || "",
          date: normalizeTelegramMessageDate(m.date),
          out: Boolean(m.out),
          fromId: normalizePeerId(m.fromId),
          replyToMsgId: m.replyTo?.replyToMsgId ? String(m.replyTo.replyToMsgId) : null,
        }))
        .reverse();

      return {
        success: true,
        chatId: String(chatId),
        count: items.length,
        messages: items,
      };
    });

    return res.status(200).json(payload);
  } catch (error) {
    console.error("telegram-chat-messages error:", error);
    return sendJsonError(
      res,
      error?.statusCode || 500,
      "Failed to load telegram chat messages",
      error?.message || error,
    );
  }
}
