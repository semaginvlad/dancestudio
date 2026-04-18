import { withTelegramUserClient } from "./_lib/telegram-user-client.js";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 30;

function toMessageDto(message) {
  return {
    id: String(message.id),
    text: message.message || "",
    date: message.date ? new Date(message.date).toISOString() : null,
    out: Boolean(message.out),
    fromId: message.senderId?.value ? String(message.senderId.value) : null,
    replyToMsgId: message.replyTo?.replyToMsgId || null,
  };
}

function getPeerFromQuery(query = {}) {
  const { chatId, username } = query;

  if (chatId) {
    return String(chatId).trim();
  }

  if (username) {
    return String(username).trim().replace(/^@/, "");
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const peer = getPeerFromQuery(req.query);
  if (!peer) {
    return res.status(400).json({ error: "chatId or username is required" });
  }

  const parsedLimit = Number(req.query?.limit || DEFAULT_LIMIT);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  try {
    const payload = await withTelegramUserClient(async (client) => {
      const entity = await client.getEntity(peer);
      const messages = await client.getMessages(entity, { limit });

      return {
        success: true,
        chat: {
          id: entity?.id ? String(entity.id) : null,
          title:
            entity?.title ||
            [entity?.firstName, entity?.lastName].filter(Boolean).join(" ") ||
            entity?.username ||
            "Без назви",
          username: entity?.username ? `@${entity.username}` : null,
        },
        count: messages.length,
        messages: messages.map(toMessageDto),
      };
    });

    return res.status(200).json(payload);
  } catch (error) {
    console.error("telegram-chat-messages error:", error);

    const statusCode = error?.statusCode || 500;
    return res.status(statusCode).json({
      error: "Failed to load telegram messages",
      details: String(error?.message || error),
      meta: error?.details || undefined,
    });
  }
}
