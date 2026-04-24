import { resolveTelegramPeer, withTelegramClient } from "./_lib/telegram-user-client.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const chatId = req.query.chatId || req.query.peerId;
  const limit = Math.min(Number(req.query.limit || 30), 100);

  if (!chatId) {
    return res.status(400).json({ error: "chatId is required" });
  }

  try {
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
  } catch (error) {
    console.error("telegram-chat-messages error:", error);
    return res.status(500).json({
      error: "Failed to load chat messages",
      details: String(error?.message || error),
    });
  }
}
