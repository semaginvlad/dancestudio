import { withTelegramClient } from "./_lib/telegram-user-client.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { chatId, username, message } = req.body || {};
    const peer = chatId || username;

    if (!peer || !message) {
      return res.status(400).json({ error: "chatId|username and message are required" });
    }

    await withTelegramClient(async (client) => {
      await client.sendMessage(peer, { message });
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Telegram send error:", error);
    return res.status(500).json({
      error: "Failed to send telegram message",
      details: String(error?.message || error),
    });
  }
}
