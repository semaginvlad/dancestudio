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
          date: m.date ? new Date(m.date).toISOString() : null,
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
