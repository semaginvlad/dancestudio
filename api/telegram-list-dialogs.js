import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let client;

  try {
    const apiId = Number(process.env.TELEGRAM_API_ID);
    const apiHash = process.env.TELEGRAM_API_HASH;
    const session = process.env.TELEGRAM_SESSION;

    if (!apiId || !apiHash || !session) {
      return res.status(500).json({ error: "Missing Telegram environment variables" });
    }

    client = new TelegramClient(
      new StringSession(session),
      apiId,
      apiHash,
      { connectionRetries: 5 }
    );

    await client.connect();

    const dialogs = await client.getDialogs({ limit: 100 });

    const result = [];

    for (const d of dialogs) {
      const entity = d?.entity;
      if (!entity || !entity.id) continue;

      const title =
        entity.title ||
        [entity.firstName, entity.lastName].filter(Boolean).join(" ") ||
        entity.username ||
        "Без назви";

      result.push({
        id: String(entity.id),
        title,
        username: entity.username ? `@${entity.username}` : null
      });
    }

    return res.status(200).json({
      success: true,
      count: result.length,
      dialogs: result
    });
  } catch (error) {
    console.error("telegram-list-dialogs error:", error);
    return res.status(500).json({
      error: "Failed to list dialogs",
      details: String(error?.message || error),
      stack: error?.stack || null
    });
  } finally {
    if (client) {
      try {
        await client.disconnect();
      } catch {}
    }
  }
}
