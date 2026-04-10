import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { username, message } = req.body;

    if (!username || !message) {
      return res.status(400).json({ error: "username and message are required" });
    }

    const apiId = Number(process.env.TELEGRAM_API_ID);
    const apiHash = process.env.TELEGRAM_API_HASH;
    const session = process.env.TELEGRAM_SESSION;

    if (!apiId || !apiHash || !session) {
      return res.status(500).json({ error: "Missing Telegram environment variables" });
    }

    const client = new TelegramClient(
      new StringSession(session),
      apiId,
      apiHash,
      { connectionRetries: 5 }
    );

    await client.connect();

    const normalizedUsername = username.replace(/^@/, "");
    await client.sendMessage(normalizedUsername, { message });

    await client.disconnect();

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Telegram send error:", error);
    return res.status(500).json({
      error: "Failed to send telegram message",
      details: String(error?.message || error),
    });
  }
}
